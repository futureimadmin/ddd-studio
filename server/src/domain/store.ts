import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  LAYOUT_VERSION,
  ConnectionSchema,
  ContextSchema,
  DomainNodeInputSchema,
  GlossaryTermSchema,
  RelationshipSchema,
  normalizeNode,
  type Connection,
  type Context,
  type DomainNode,
  type GlossaryTerm,
  type Relationship,
  type SchemaSnapshot,
  type WorkspaceFile,
  type WorkspaceSnapshot,
} from "./model";
import { SAMPLE_PROJECT_NAME, defaultContexts, defaultGlossary, defaultNodes, defaultRelationships } from "./seed";

type Log = { info: (msg: string) => void; warn: (msg: string) => void; error: (obj: unknown, msg: string) => void };

export type StoreOptions = {
  dataDir: string;
  /** Start with the sample workspace when nothing has been saved yet. Default: a blank workspace. */
  seedSample?: boolean;
  log?: Log;
};

const consoleLog: Log = {
  info: (m) => console.info(`[store] ${m}`),
  warn: (m) => console.warn(`[store] ${m}`),
  error: (o, m) => console.error(`[store] ${m}`, o),
};

/** Drop entries that fail validation instead of rejecting the whole file. */
function keepValid<T>(items: unknown, parse: (item: unknown) => T | null, log: Log, label: string): T[] {
  if (!Array.isArray(items)) return [];
  const out: T[] = [];
  for (const item of items) {
    const parsed = parse(item);
    if (parsed) out.push(parsed);
    else log.warn(`dropped invalid ${label} while loading workspace`);
  }
  return out;
}

const BLANK_PROJECT_NAME = "Untitled workspace";

export function createStore(options: StoreOptions) {
  const log = options.log ?? consoleLog;
  const dataFile = path.join(options.dataDir, "workspace.json");

  const state = {
    projectName: BLANK_PROJECT_NAME,
    contexts: [] as Context[],
    nodes: [] as DomainNode[],
    relationships: [] as Relationship[],
    glossary: [] as GlossaryTerm[],
    connections: [] as Connection[],
  };

  /** Secrets and discovered schemas live in memory only — never in workspace.json. */
  const passwords = new Map<string, string>();
  const snapshots = new Map<string, SchemaSnapshot>();

  function id(prefix: string): string {
    const taken = new Set<string>([
      ...state.contexts.map((c) => c.id),
      ...state.nodes.map((n) => n.id),
      ...state.relationships.map((r) => r.id),
      ...state.glossary.map((g) => g.id),
      ...state.connections.map((c) => c.id),
    ]);
    let candidate: string;
    do candidate = `${prefix}-${randomUUID().slice(0, 8)}`;
    while (taken.has(candidate));
    return candidate;
  }

  function refreshCounts(): void {
    for (const context of state.contexts) {
      context.nodeCount = state.nodes.filter((n) => n.contextId === context.id).length;
      context.relationshipCount = state.relationships.filter((r) => r.contextId === context.id).length;
    }
  }

  /** Atomic write: a crash mid-write can never leave a truncated workspace.json. */
  function save(): void {
    refreshCounts();
    try {
      fs.mkdirSync(options.dataDir, { recursive: true });
      const payload: WorkspaceFile = { layoutVersion: LAYOUT_VERSION, ...state };
      const tmp = `${dataFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tmp, dataFile);
    } catch (err) {
      log.error(err, "failed to persist workspace");
      throw new Error("Could not save the workspace to disk");
    }
  }

  function loadSample(): void {
    state.projectName = SAMPLE_PROJECT_NAME;
    // The sample ships without coordinates: the client lays it out.
    state.contexts = structuredClone(defaultContexts).map((c) => ({ ...c, x: null, y: null }));
    state.nodes = structuredClone(defaultNodes).map((n) => normalizeNode({ ...n, x: null, y: null }));
    state.relationships = structuredClone(defaultRelationships);
    state.glossary = structuredClone(defaultGlossary);
    state.connections = [];
  }

  function load(): void {
    if (!fs.existsSync(dataFile)) {
      if (options.seedSample) loadSample();
      refreshCounts();
      return;
    }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    } catch (err) {
      // Never silently overwrite a file we could not read: keep it aside for recovery.
      const backup = `${dataFile}.corrupt-${Date.now()}`;
      fs.renameSync(dataFile, backup);
      log.error(err, `workspace.json was unreadable; moved to ${backup} and starting fresh`);
      if (options.seedSample) loadSample();
      refreshCounts();
      return;
    }
    state.projectName =
      typeof raw.projectName === "string" && raw.projectName.trim() ? raw.projectName : BLANK_PROJECT_NAME;
    state.contexts = keepValid(
      raw.contexts,
      (c) => {
        const r = ContextSchema.safeParse({ nodeCount: 0, relationshipCount: 0, x: null, y: null, ...(c as object) });
        return r.success ? r.data : null;
      },
      log,
      "context",
    );
    state.nodes = keepValid(
      raw.nodes,
      (n) => {
        const r = DomainNodeInputSchema.safeParse(n);
        const nodeId = (n as { id?: unknown })?.id;
        return r.success && typeof nodeId === "string" ? normalizeNode({ ...r.data, id: nodeId }) : null;
      },
      log,
      "node",
    );
    state.relationships = keepValid(
      raw.relationships,
      (r) => {
        const p = RelationshipSchema.safeParse(r);
        return p.success ? p.data : null;
      },
      log,
      "relationship",
    );
    state.glossary = keepValid(
      raw.glossary,
      (g) => {
        const p = GlossaryTermSchema.safeParse(g);
        return p.success ? p.data : null;
      },
      log,
      "glossary term",
    );
    state.connections = keepValid(
      raw.connections,
      (c) => {
        const p = ConnectionSchema.safeParse({ port: null, username: "", lastError: null, ...(c as object) });
        return p.success ? p.data : null;
      },
      log,
      "connection",
    );
    // Files written before pixel coordinates existed hold percentages: forget them so the client lays everything out.
    if (raw.layoutVersion !== LAYOUT_VERSION) {
      for (const node of state.nodes) Object.assign(node, { x: null, y: null });
      for (const context of state.contexts) Object.assign(context, { x: null, y: null });
    }
    refreshCounts();
    log.info(`loaded workspace from ${dataFile}`);
  }

  /** Replace everything: with the sample workspace, or with an empty one. */
  function reset(seedSample: boolean): void {
    if (seedSample) loadSample();
    else {
      state.projectName = BLANK_PROJECT_NAME;
      state.contexts = [];
      state.nodes = [];
      state.relationships = [];
      state.glossary = [];
      state.connections = [];
    }
    passwords.clear();
    snapshots.clear();
    save();
  }

  function snapshot(): WorkspaceSnapshot {
    refreshCounts();
    return {
      projectName: state.projectName,
      contexts: state.contexts,
      nodes: state.nodes,
      relationships: state.relationships,
      glossary: state.glossary,
      connections: state.connections,
      stats: {
        contexts: state.contexts.length,
        nodes: state.nodes.length,
        relationships: state.relationships.length,
        connections: state.connections.length,
        glossaryTerms: state.glossary.length,
      },
    };
  }

  load();

  return { state, passwords, snapshots, id, save, reset, snapshot, refreshCounts, dataFile };
}

export type Store = ReturnType<typeof createStore>;
