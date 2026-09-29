/** Workspace, bounded contexts, domain nodes, relationships and glossary. */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { buildDomainExport } from "../domain/export";
import {
  ContextInputSchema,
  ContextUpdateSchema,
  DomainNodeInputSchema,
  DomainNodeUpdateSchema,
  GlossaryInputSchema,
  GlossaryUpdateSchema,
  LayoutInputSchema,
  RelationshipInputSchema,
  RelationshipUpdateSchema,
  isContextMapType,
  normalizeNode,
  titleCaseType,
  type Context,
  type GlossaryTerm,
  type Relationship,
} from "../domain/model";
import type { Store } from "../domain/store";
import { hasErrors, validateModel } from "../domain/validation";
import { HttpError, param, parse } from "./http";

export function modelRoutes(store: Store): IRouter {
  const router = Router();
  const { state } = store;

  const requireContext = (contextId: string) => {
    if (!state.contexts.some((c) => c.id === contextId)) throw new HttpError(400, "Bounded context not found");
  };

  // ------------------------------------------------------------ workspace

  router.get("/workspace", (_req, res) => {
    res.json(store.snapshot());
  });

  router.patch("/workspace", (req, res) => {
    const { projectName } = parse(z.object({ projectName: z.string().trim().min(1).max(120) }), req.body);
    state.projectName = projectName;
    store.save();
    res.json(store.snapshot());
  });

  /** Batch position update (dragging a selection, tidy-up, first placement of new elements). */
  router.put("/workspace/layout", (req, res) => {
    const input = parse(LayoutInputSchema, req.body);
    let updated = 0;
    for (const p of input.nodes) {
      const node = state.nodes.find((n) => n.id === p.id);
      if (node) {
        node.x = p.x;
        node.y = p.y;
        updated += 1;
      }
    }
    for (const p of input.contexts) {
      const context = state.contexts.find((c) => c.id === p.id);
      if (context) {
        context.x = p.x;
        context.y = p.y;
        updated += 1;
      }
    }
    if (updated) store.save();
    res.json({ updated });
  });

  router.post("/workspace/reset", (req, res) => {
    const { seedSample } = parse(z.object({ seedSample: z.boolean().default(false) }), req.body);
    store.reset(seedSample);
    res.json(store.snapshot());
  });

  /** Stable JSON export of the full design model (download + codegen input). */
  router.get("/workspace/export", (_req, res) => {
    store.refreshCounts();
    const doc = buildDomainExport(state);
    const file = doc.projectName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "model";
    res.setHeader("Content-Disposition", `attachment; filename="ddd-export-${file}.json"`);
    res.json(doc);
  });

  router.get("/model/validate", (_req, res) => {
    const issues = validateModel(state);
    res.json({ ok: !hasErrors(issues), issues });
  });

  // ------------------------------------------------------------ bounded contexts

  router.get("/bounded-contexts", (_req, res) => {
    store.refreshCounts();
    res.json(state.contexts);
  });

  router.post("/bounded-contexts", (req, res) => {
    const input = parse(ContextInputSchema, req.body);
    const context: Context = { id: store.id("context"), ...input, nodeCount: 0, relationshipCount: 0, x: null, y: null };
    state.contexts.push(context);
    store.save();
    res.status(201).json(context);
  });

  router.patch("/bounded-contexts/:id", (req, res) => {
    const patch = parse(ContextUpdateSchema, req.body);
    const context = state.contexts.find((c) => c.id === param(req.params.id));
    if (!context) throw new HttpError(404, "Bounded context not found");
    Object.assign(context, patch);
    store.save();
    res.json(context);
  });

  router.delete("/bounded-contexts/:id", (req, res) => {
    const contextId = param(req.params.id);
    if (!state.contexts.some((c) => c.id === contextId)) throw new HttpError(404, "Bounded context not found");
    const removedNodes = new Set(state.nodes.filter((n) => n.contextId === contextId).map((n) => n.id));
    state.contexts = state.contexts.filter((c) => c.id !== contextId);
    state.nodes = state.nodes.filter((n) => n.contextId !== contextId);
    state.relationships = state.relationships.filter(
      (r) => r.contextId !== contextId && !removedNodes.has(r.sourceId) && !removedNodes.has(r.targetId),
    );
    state.glossary = state.glossary.filter((g) => g.contextId !== contextId);
    for (const term of state.glossary) term.relatedNodeIds = term.relatedNodeIds.filter((n) => !removedNodes.has(n));
    store.save();
    res.status(204).send();
  });

  // ------------------------------------------------------------ domain nodes

  router.get("/domain-nodes", (_req, res) => {
    res.json(state.nodes);
  });

  router.post("/domain-nodes", (req, res) => {
    const input = parse(DomainNodeInputSchema, req.body);
    requireContext(input.contextId);
    const node = normalizeNode({ id: store.id("node"), ...input });
    if (node.status === "validated") {
      const issues = validateModel({ nodes: [...state.nodes, node], relationships: state.relationships }, node.id);
      if (hasErrors(issues)) throw new HttpError(400, "Validation failed", { issues });
    }
    state.nodes.push(node);
    store.save();
    res.status(201).json(node);
  });

  router.patch("/domain-nodes/:id", (req, res) => {
    const patch = parse(DomainNodeUpdateSchema, req.body);
    const node = state.nodes.find((n) => n.id === param(req.params.id));
    if (!node) throw new HttpError(404, "Domain node not found");
    if (patch.contextId) requireContext(patch.contextId);

    // Validate the *result* before touching anything: a rejected edit must leave no trace.
    const candidate = { ...node, ...patch };
    // Going back to Logical (without also supplying a new table) drops the old physical-table reference.
    if (patch.representation === "logical" && patch.physicalTable === undefined) candidate.physicalTable = null;
    if (candidate.status === "validated") {
      const issues = validateModel(
        { nodes: state.nodes.map((n) => (n.id === node.id ? candidate : n)), relationships: state.relationships },
        node.id,
      );
      if (hasErrors(issues)) throw new HttpError(400, "Cannot mark validated: model rules failed", { issues });
    }

    Object.assign(node, candidate);
    if (patch.contextId) {
      // A relationship belongs to the context of its source element.
      for (const rel of state.relationships) if (rel.sourceId === node.id) rel.contextId = node.contextId;
    }
    store.save();
    res.json(node);
  });

  router.post("/domain-nodes/:id/validate-invariants", (req, res) => {
    const nodeId = param(req.params.id);
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) throw new HttpError(404, "Domain node not found");
    const issues = validateModel(state, nodeId);
    res.json({ nodeId, ok: !hasErrors(issues), invariants: node.invariants, issues });
  });

  router.delete("/domain-nodes/:id", (req, res) => {
    const nodeId = param(req.params.id);
    if (!state.nodes.some((n) => n.id === nodeId)) throw new HttpError(404, "Domain node not found");
    state.nodes = state.nodes.filter((n) => n.id !== nodeId);
    state.relationships = state.relationships.filter((r) => r.sourceId !== nodeId && r.targetId !== nodeId);
    for (const term of state.glossary) term.relatedNodeIds = term.relatedNodeIds.filter((n) => n !== nodeId);
    store.save();
    res.status(204).send();
  });

  // ------------------------------------------------------------ relationships

  router.get("/relationships", (_req, res) => {
    res.json(state.relationships);
  });

  router.post("/relationships", (req, res) => {
    const input = parse(RelationshipInputSchema, req.body);
    const source = state.nodes.find((n) => n.id === input.sourceId);
    const target = state.nodes.find((n) => n.id === input.targetId);
    if (!source || !target) throw new HttpError(400, "Both relationship endpoints must exist");
    if (source.id === target.id) throw new HttpError(400, "A relationship must connect two different elements");
    const contextId = input.contextId ?? source.contextId;
    requireContext(contextId);
    if (state.relationships.some((r) => r.sourceId === source.id && r.targetId === target.id && r.type === input.type)) {
      throw new HttpError(409, `A "${input.type}" relationship between these elements already exists`);
    }
    const relationship: Relationship = {
      id: store.id("rel"),
      sourceId: source.id,
      targetId: target.id,
      type: input.type,
      // Formal context-map types read best with their strategic name when no label is given.
      label: input.label || (isContextMapType(input.type) ? titleCaseType(input.type) : ""),
      contextId,
    };
    state.relationships.push(relationship);
    store.save();
    res.status(201).json(relationship);
  });

  /** Change a relationship's type or label, or reverse it by swapping source and target. */
  router.patch("/relationships/:id", (req, res) => {
    const patch = parse(RelationshipUpdateSchema, req.body);
    const rel = state.relationships.find((r) => r.id === param(req.params.id));
    if (!rel) throw new HttpError(404, "Relationship not found");
    const next = { ...rel, ...patch };
    if (patch.sourceId || patch.targetId) {
      const source = state.nodes.find((n) => n.id === next.sourceId);
      const target = state.nodes.find((n) => n.id === next.targetId);
      if (!source || !target) throw new HttpError(400, "Both relationship endpoints must exist");
      if (source.id === target.id) throw new HttpError(400, "A relationship must connect two different elements");
      next.contextId = source.contextId;
    }
    const duplicate = state.relationships.some(
      (r) => r.id !== rel.id && r.sourceId === next.sourceId && r.targetId === next.targetId && r.type === next.type,
    );
    if (duplicate) throw new HttpError(409, `A "${next.type}" relationship between these elements already exists`);
    if (isContextMapType(next.type) && !next.label.trim()) next.label = titleCaseType(next.type);
    Object.assign(rel, next);
    store.save();
    res.json(rel);
  });

  router.delete("/relationships/:id", (req, res) => {
    const relId = param(req.params.id);
    if (!state.relationships.some((r) => r.id === relId)) throw new HttpError(404, "Relationship not found");
    state.relationships = state.relationships.filter((r) => r.id !== relId);
    store.save();
    res.status(204).send();
  });

  // ------------------------------------------------------------ glossary (ubiquitous language)

  const knownNodeIds = (ids: string[]) => ids.filter((id) => state.nodes.some((n) => n.id === id));

  router.get("/glossary", (_req, res) => {
    res.json(state.glossary);
  });

  router.post("/glossary", (req, res) => {
    const input = parse(GlossaryInputSchema, req.body);
    if (input.contextId) requireContext(input.contextId);
    const term: GlossaryTerm = { id: store.id("term"), ...input, relatedNodeIds: knownNodeIds(input.relatedNodeIds) };
    state.glossary.push(term);
    store.save();
    res.status(201).json(term);
  });

  router.patch("/glossary/:id", (req, res) => {
    const patch = parse(GlossaryUpdateSchema, req.body);
    const term = state.glossary.find((t) => t.id === param(req.params.id));
    if (!term) throw new HttpError(404, "Glossary term not found");
    if (patch.contextId) requireContext(patch.contextId);
    Object.assign(term, patch);
    if (patch.relatedNodeIds) term.relatedNodeIds = knownNodeIds(patch.relatedNodeIds);
    store.save();
    res.json(term);
  });

  router.delete("/glossary/:id", (req, res) => {
    const termId = param(req.params.id);
    if (!state.glossary.some((t) => t.id === termId)) throw new HttpError(404, "Glossary term not found");
    state.glossary = state.glossary.filter((t) => t.id !== termId);
    store.save();
    res.status(204).send();
  });

  return router;
}
