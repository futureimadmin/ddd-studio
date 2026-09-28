/** Materialise a (validated) AI design into the live workspace. */
import type { DomainDesign } from "../ai/design-schema";
import { normalizeNode, type Context } from "./model";
import type { Store } from "./store";

export type ApplyMode = "merge" | "replace";

export type ApplyResult = {
  added: { contexts: number; elements: number; relationships: number; glossary: number };
  /** Merge mode reuses existing contexts/elements with the same name instead of duplicating them. */
  reused: { contexts: number; elements: number };
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const PALETTE = ["#e7a94b", "#3e9b9a", "#d8755e", "#6588c5", "#8c71b7"];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyDesign(store: Store, design: DomainDesign, mode: ApplyMode = "merge"): ApplyResult {
  const { state } = store;
  const result: ApplyResult = {
    added: { contexts: 0, elements: 0, relationships: 0, glossary: 0 },
    reused: { contexts: 0, elements: 0 },
  };

  // Merging adds to the user's workspace; it must not rename it. Only adopt the design's name
  // when replacing everything or when there is nothing here yet.
  const adoptName = mode === "replace" || (state.contexts.length === 0 && state.nodes.length === 0);

  if (mode === "replace") {
    state.contexts.length = 0;
    state.nodes.length = 0;
    state.relationships.length = 0;
    state.glossary.length = 0;
  }
  if (adoptName && design.projectName.trim()) state.projectName = design.projectName.trim();

  const contextIdByKey = new Map<string, string>();
  for (const ctx of design.boundedContexts) {
    const existing = state.contexts.find((c) => same(c.name, ctx.name));
    if (existing) {
      if (ctx.purpose) existing.purpose = ctx.purpose;
      contextIdByKey.set(ctx.key, existing.id);
      result.reused.contexts += 1;
      continue;
    }
    const created: Context = {
      id: store.id("context"),
      name: ctx.name.trim(),
      purpose: ctx.purpose ?? "",
      color: HEX.test(ctx.color) ? ctx.color : PALETTE[state.contexts.length % PALETTE.length],
      nodeCount: 0,
      relationshipCount: 0,
      x: null,
      y: null,
    };
    state.contexts.push(created);
    contextIdByKey.set(ctx.key, created.id);
    result.added.contexts += 1;
  }

  const nodeIdByKey = new Map<string, string>();
  for (const el of design.elements ?? []) {
    const contextId = contextIdByKey.get(el.contextKey);
    if (!contextId) continue;
    const existing = state.nodes.find((n) => n.contextId === contextId && n.kind === el.kind && same(n.name, el.name));
    if (existing) {
      nodeIdByKey.set(el.key, existing.id);
      result.reused.elements += 1;
      continue;
    }
    const node = normalizeNode({
      id: store.id("node"),
      contextId,
      kind: el.kind,
      name: el.name.trim(),
      description: el.description ?? "",
      status: "draft",
      tags: el.tags?.length ? el.tags : ["ai-generated"],
      methods: el.methods ?? [],
      invariants: el.invariants ?? [],
      eventVersion: el.eventVersion,
      eventPayloadSchema: el.eventPayloadSchema,
      eventCompatibility: el.eventCompatibility,
    });
    state.nodes.push(node);
    nodeIdByKey.set(el.key, node.id);
    result.added.elements += 1;
  }

  for (const rel of design.relationships ?? []) {
    const sourceId = nodeIdByKey.get(rel.sourceKey);
    const targetId = nodeIdByKey.get(rel.targetKey);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    if (state.relationships.some((r) => r.sourceId === sourceId && r.targetId === targetId && r.type === rel.type)) continue;
    const source = state.nodes.find((n) => n.id === sourceId);
    state.relationships.push({
      id: store.id("rel"),
      sourceId,
      targetId,
      type: rel.type,
      label: rel.label ?? "",
      contextId: source?.contextId ?? state.contexts[0]?.id ?? "",
    });
    result.added.relationships += 1;
  }

  for (const term of design.glossary ?? []) {
    const contextId = term.contextKey ? (contextIdByKey.get(term.contextKey) ?? null) : null;
    if (state.glossary.some((g) => g.contextId === contextId && same(g.term, term.term))) continue;
    state.glossary.push({
      id: store.id("term"),
      term: term.term.trim(),
      definition: term.definition,
      contextId,
      aliases: term.aliases ?? [],
      relatedNodeIds: [],
    });
    result.added.glossary += 1;
  }

  store.save();
  return result;
}
