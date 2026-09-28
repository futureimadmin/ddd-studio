/** Structural + invariant checks. Pure: operates on whatever nodes/relationships it is given. */
import { isContextMapType, type DomainNode, type Relationship, type ValidationIssue } from "./model";

export type ModelView = { nodes: DomainNode[]; relationships: Relationship[] };

export function validateModel(model: ModelView, focusNodeId?: string): ValidationIssue[] {
  const { nodes, relationships } = model;
  const issues: ValidationIssue[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const compositionTargets = new Map<string, string[]>();
  const handlersByCommand = new Map<string, number>();

  for (const rel of relationships) {
    if (rel.type === "composition" || rel.type === "owns") {
      const list = compositionTargets.get(rel.sourceId) ?? [];
      list.push(rel.targetId);
      compositionTargets.set(rel.sourceId, list);
    }
    if (rel.type === "handles") handlersByCommand.set(rel.targetId, (handlersByCommand.get(rel.targetId) ?? 0) + 1);
  }

  const candidates = focusNodeId ? nodes.filter((n) => n.id === focusNodeId) : nodes;

  for (const node of candidates) {
    const add = (code: string, severity: "error" | "warning", message: string) =>
      issues.push({ code, severity, message, nodeId: node.id });

    if (node.kind === "aggregate") {
      const roots = (compositionTargets.get(node.id) ?? [])
        .map((tid) => nodeById.get(tid))
        .filter((n): n is DomainNode => !!n && n.kind === "aggregate-root");
      if (roots.length === 0) {
        add("AGGREGATE_MISSING_ROOT", "error", `Aggregate "${node.name}" has no composition/owns link to an aggregate-root`);
      } else if (roots.length > 1) {
        add("AGGREGATE_MULTIPLE_ROOTS", "error", `Aggregate "${node.name}" composes more than one aggregate-root`);
      }
      if (!node.invariants.length) {
        add("AGGREGATE_NO_INVARIANTS", "warning", `Aggregate "${node.name}" has no documented invariants`);
        if (node.status === "validated") {
          add("VALIDATED_WITHOUT_INVARIANTS", "error", `Cannot treat aggregate "${node.name}" as validated without invariants`);
        }
      }
    }

    if (node.kind === "aggregate-root" && !node.methods.some((m) => /assert|invariants/i.test(m))) {
      add("ROOT_NO_ASSERT", "warning", `Aggregate root "${node.name}" should expose assertInvariants() (or similar)`);
    }

    if (node.kind === "domain-event") {
      if (!node.eventPayloadSchema.trim()) {
        add("EVENT_NO_SCHEMA", "warning", `Domain event "${node.name}" has empty payload contract`);
      } else {
        try {
          const parsed: unknown = JSON.parse(node.eventPayloadSchema);
          if (typeof parsed !== "object" || parsed === null) {
            add("EVENT_SCHEMA_NOT_OBJECT", "warning", `Domain event "${node.name}" payload schema should be a JSON object`);
          }
        } catch {
          /* prose contracts are allowed */
        }
      }
    }

    if ((node.kind === "saga" || node.kind === "process-manager") && !node.methods.some((m) => /compensat/i.test(m))) {
      add("SAGA_NO_COMPENSATION", "warning", `Saga/process "${node.name}" should define compensate() or similar`);
    }

    if (node.kind === "anti-corruption-layer" && !node.methods.length) {
      add("ACL_NO_TRANSLATORS", "warning", `ACL "${node.name}" should list translation methods`);
    }

    if (node.kind === "command") {
      const handlers = handlersByCommand.get(node.id) ?? 0;
      if (handlers > 1) {
        add("COMMAND_MULTIPLE_HANDLERS", "error", `Command "${node.name}" has ${handlers} handlers; a command needs exactly one`);
      }
    }

    if (node.kind === "query-handler" && node.cqrsSide === "command") {
      add("QUERY_HANDLER_ON_COMMAND_SIDE", "error", `Query handler "${node.name}" must not sit on the command side`);
    }
  }

  if (!focusNodeId) {
    for (const rel of relationships) {
      if (isContextMapType(rel.type) && !rel.label.trim()) {
        issues.push({
          code: "CONTEXT_MAP_UNLABELED",
          severity: "warning",
          message: `Context-map relationship (${rel.type}) should carry a strategic label`,
          relationshipId: rel.id,
        });
      }
      if (!nodeById.has(rel.sourceId) || !nodeById.has(rel.targetId)) {
        issues.push({
          code: "RELATIONSHIP_DANGLING",
          severity: "error",
          message: `Relationship ${rel.id} references a node that no longer exists`,
          relationshipId: rel.id,
        });
      }
    }
  }

  return issues;
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.severity === "error");
