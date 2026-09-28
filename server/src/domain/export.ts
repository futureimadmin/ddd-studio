/** Stable, versioned domain model export — the download format and the input to code generation. */
import { PROCESS_TYPES, type Context, type DomainNode, type GlossaryTerm, type Relationship } from "./model";

export const EXPORT_SCHEMA_VERSION = "1.0.0";

type ProcessKind = (typeof PROCESS_TYPES)[number];

export type DomainExportDocument = {
  schemaVersion: string;
  exportedAt: string;
  projectName: string;
  summary: string;
  boundedContexts: Context[];
  elements: DomainNode[];
  relationships: Relationship[];
  glossary: GlossaryTerm[];
  processChains: Array<{
    id: string;
    kind: ProcessKind;
    sourceId: string;
    sourceName: string;
    sourceKind: string;
    targetId: string;
    targetName: string;
    targetKind: string;
    label: string;
  }>;
  cqrs: {
    commands: Array<{ id: string; name: string; contextId: string }>;
    commandHandlers: Array<{ id: string; name: string; contextId: string; handlesCommandIds: string[] }>;
    queries: Array<{ id: string; name: string; contextId: string }>;
    readModels: Array<{ id: string; name: string; contextId: string; projectedFromEventIds: string[] }>;
  };
  sagas: {
    orchestration: Array<{ id: string; name: string; contextId: string; description: string }>;
    choreography: Array<{ id: string; name: string; contextId: string; description: string }>;
  };
  stats: { contexts: number; nodes: number; relationships: number; glossaryTerms: number };
};

type ExportSource = {
  projectName: string;
  contexts: Context[];
  nodes: DomainNode[];
  relationships: Relationship[];
  glossary: GlossaryTerm[];
};

const PROCESS_SET = new Set<string>(PROCESS_TYPES);
const brief = (n: DomainNode) => ({ id: n.id, name: n.name, contextId: n.contextId });
const withDescription = (n: DomainNode) => ({ ...brief(n), description: n.description });

export function buildDomainExport(source: ExportSource): DomainExportDocument {
  const { projectName, contexts, nodes, relationships, glossary } = source;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const processChains = relationships
    .filter((r) => PROCESS_SET.has(r.type))
    .map((r) => {
      const s = nodeById.get(r.sourceId);
      const t = nodeById.get(r.targetId);
      return {
        id: r.id,
        kind: r.type as ProcessKind,
        sourceId: r.sourceId,
        sourceName: s?.name ?? r.sourceId,
        sourceKind: s?.kind ?? "unknown",
        targetId: r.targetId,
        targetName: t?.name ?? r.targetId,
        targetKind: t?.kind ?? "unknown",
        label: r.label || r.type,
      };
    });

  const choreographed = (n: DomainNode) =>
    n.sagaStyle === "choreography" ||
    (n.kind === "policy" && relationships.some((r) => r.sourceId === n.id && (r.type === "reacts-to" || r.type === "choreographs")));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projectName,
    summary: `DDD Studio export of "${projectName}" — design model for codegen.`,
    boundedContexts: contexts,
    elements: nodes,
    relationships,
    glossary,
    processChains,
    cqrs: {
      commands: nodes.filter((n) => n.kind === "command").map(brief),
      commandHandlers: nodes
        .filter((n) => n.kind === "command-handler")
        .map((n) => ({
          ...brief(n),
          handlesCommandIds: relationships.filter((r) => r.sourceId === n.id && r.type === "handles").map((r) => r.targetId),
        })),
      queries: nodes.filter((n) => n.kind === "query-handler").map(brief),
      readModels: nodes
        .filter((n) => n.kind === "read-model")
        .map((n) => ({
          ...brief(n),
          projectedFromEventIds: relationships.filter((r) => r.targetId === n.id && r.type === "projects-to").map((r) => r.sourceId),
        })),
    },
    sagas: {
      orchestration: nodes
        .filter((n) => (n.kind === "saga" || n.kind === "process-manager") && n.sagaStyle === "orchestration")
        .map(withDescription),
      choreography: nodes.filter(choreographed).map(withDescription),
    },
    stats: {
      contexts: contexts.length,
      nodes: nodes.length,
      relationships: relationships.length,
      glossaryTerms: glossary.length,
    },
  };
}
