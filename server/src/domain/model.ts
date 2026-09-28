/**
 * The single source of truth for the DDD workspace model.
 *
 * Everything else derives from here: REST validation, persistence normalisation, the Gemini
 * output schema and the client's TypeScript types (the client imports the *types* only).
 * This file must stay free of Node-specific imports so the client can consume it.
 */
import { z } from "zod";

export const NODE_KINDS = [
  "aggregate",
  "aggregate-root",
  "entity",
  "value-object",
  "domain-event",
  "command",
  "policy",
  "actor",
  "read-model",
  "repository",
  "service",
  "resource",
  "anti-corruption-layer",
  "saga",
  "process-manager",
  "command-handler",
  "query-handler",
] as const;

export const CONTEXT_MAP_TYPES = [
  "shared-kernel",
  "customer-supplier",
  "conformist",
  "anti-corruption",
  "open-host-service",
  "published-language",
  "partnership",
  "separate-ways",
] as const;

export const PROCESS_TYPES = [
  "triggers",
  "reacts-to",
  "publishes",
  "subscribes",
  "orchestrates",
  "choreographs",
  "projects-to",
  "handles",
] as const;

export const RELATION_TYPES = [
  "uses",
  "aggregation",
  "composition",
  "generalization",
  "specialization",
  "publishes",
  "subscribes",
  "triggers",
  "reacts-to",
  "orchestrates",
  "choreographs",
  "projects-to",
  "handles",
  "owns",
  "invokes",
  "exposed-by",
  ...CONTEXT_MAP_TYPES,
] as const;

export const NODE_STATUSES = ["draft", "validated", "needs-review"] as const;
export const EVENT_COMPATIBILITY = ["backward", "forward", "full", "none"] as const;
export const SAGA_STYLES = ["orchestration", "choreography", "none"] as const;
export const CQRS_SIDES = ["command", "query", "both", "none"] as const;
export const DB_ENGINES = ["oracle", "db2", "mysql", "postgres"] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export const RelationTypeSchema = z.enum(RELATION_TYPES);
export const NodeStatusSchema = z.enum(NODE_STATUSES);
export const DbEngineSchema = z.enum(DB_ENGINES);

const name = z.string().trim().min(1, "must not be empty").max(200);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb colour");
const stringList = z.array(z.string().trim().min(1)).max(200);
/** Canvas position in pixels. `null` means "not placed yet" — the client lays such elements out. */
const coordinate = z.number().finite().min(-100_000).max(100_000);

// ---------------------------------------------------------------- bounded contexts

export const ContextSchema = z.object({
  id: z.string(),
  name,
  purpose: z.string(),
  color: hexColor,
  nodeCount: z.number().int(),
  relationshipCount: z.number().int(),
  /** Position on the context map (pixels); null until placed. */
  x: coordinate.nullable(),
  y: coordinate.nullable(),
});
export const ContextInputSchema = z.object({
  name,
  purpose: z.string().trim().max(2000).default(""),
  color: hexColor.default("#6588c5"),
});
export const ContextUpdateSchema = ContextInputSchema.partial().extend({ x: coordinate.nullable().optional(), y: coordinate.nullable().optional() });

// ---------------------------------------------------------------- domain nodes

const nodeShape = {
  contextId: z.string().min(1),
  kind: NodeKindSchema,
  name,
  description: z.string().max(4000),
  status: NodeStatusSchema,
  x: coordinate.nullable(),
  y: coordinate.nullable(),
  tags: stringList,
  methods: stringList,
  /** Business rules owned by aggregates / roots */
  invariants: stringList,
  /** Domain-event contract version (semver) */
  eventVersion: z.string().trim().min(1).max(40),
  /** JSON Schema or descriptive payload contract */
  eventPayloadSchema: z.string().max(20000),
  eventCompatibility: z.enum(EVENT_COMPATIBILITY),
  /** Saga coordination style: central orchestrator vs distributed choreography */
  sagaStyle: z.enum(SAGA_STYLES),
  /** CQRS side for handlers / models */
  cqrsSide: z.enum(CQRS_SIDES),
};

export const DomainNodeSchema = z.object({ id: z.string(), ...nodeShape });

/** Create: only context/kind/name are mandatory, the rest is defaulted by `normalizeNode`. */
export const DomainNodeInputSchema = z.object({
  contextId: nodeShape.contextId,
  kind: nodeShape.kind,
  name: nodeShape.name,
  ...z.object(nodeShape).omit({ contextId: true, kind: true, name: true }).partial().shape,
});
export const DomainNodeUpdateSchema = z.object(nodeShape).partial();

// ---------------------------------------------------------------- relationships

export const RelationshipSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: RelationTypeSchema,
  label: z.string(),
  contextId: z.string(),
});
export const RelationshipInputSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: RelationTypeSchema,
  label: z.string().trim().max(200).default(""),
  /** Defaults to the source node's context. */
  contextId: z.string().min(1).optional(),
});

export const RelationshipUpdateSchema = z
  .object({
    type: RelationTypeSchema,
    label: z.string().trim().max(200),
    /** Swap source and target to reverse a relationship. */
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
  })
  .partial();

// ---------------------------------------------------------------- layout

const placement = z.object({ id: z.string().min(1), x: coordinate, y: coordinate });
/** Batch position update: dragging a selection, a tidy-up, or first placement of new elements. */
export const LayoutInputSchema = z.object({
  nodes: z.array(placement).max(5000).default([]),
  contexts: z.array(placement).max(500).default([]),
});

// ---------------------------------------------------------------- glossary

export const GlossaryTermSchema = z.object({
  id: z.string(),
  term: name,
  definition: z.string(),
  contextId: z.string().nullable(),
  aliases: z.array(z.string()),
  relatedNodeIds: z.array(z.string()),
});
export const GlossaryInputSchema = z.object({
  term: name,
  definition: z.string().trim().max(4000).default(""),
  contextId: z.string().min(1).nullable().default(null),
  aliases: stringList.default([]),
  relatedNodeIds: z.array(z.string()).default([]),
});
export const GlossaryUpdateSchema = GlossaryInputSchema.partial();

// ---------------------------------------------------------------- schema connections

export const ConnectionSchema = z.object({
  id: z.string(),
  name,
  engine: DbEngineSchema,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).nullable(),
  database: z.string().min(1),
  /** May be empty for profiles saved before usernames were stored. */
  username: z.string(),
  status: z.enum(["connected", "pending", "error"]),
  tableCount: z.number().int(),
  lastIntrospectedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export const ConnectionInputSchema = z.object({
  name,
  engine: DbEngineSchema,
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export const IntrospectInputSchema = z
  .object({ password: z.string().min(1).optional(), username: z.string().trim().min(1).optional() })
  .default({});

export const SchemaColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  primaryKey: z.boolean(),
});
export const SchemaTableSchema = z.object({
  name: z.string(),
  schema: z.string(),
  rowEstimate: z.number(),
  columns: z.array(SchemaColumnSchema),
});
export const SchemaForeignKeySchema = z.object({
  /** `schema.table` */
  sourceTable: z.string(),
  /** `schema.table` */
  targetTable: z.string(),
});
export const SchemaSnapshotSchema = z.object({
  connectionId: z.string(),
  tables: z.array(SchemaTableSchema),
  foreignKeys: z.array(SchemaForeignKeySchema),
  generatedAt: z.string(),
});
export const ImportSchemaInputSchema = z.object({
  contextId: z.string().min(1),
  /** `schema.table` keys; omit to import every table. */
  tables: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------- workspace

/** Bump when the meaning of stored x/y changes. v2 = pixel coordinates (v1 was percentages). */
export const LAYOUT_VERSION = 2;

export const WorkspaceFileSchema = z.object({
  layoutVersion: z.number().optional(),
  projectName: z.string(),
  contexts: z.array(ContextSchema),
  nodes: z.array(DomainNodeSchema),
  relationships: z.array(RelationshipSchema),
  glossary: z.array(GlossaryTermSchema),
  connections: z.array(ConnectionSchema),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type ContextInput = z.infer<typeof ContextInputSchema>;
export type ContextUpdate = z.infer<typeof ContextUpdateSchema>;
export type LayoutInput = z.infer<typeof LayoutInputSchema>;
export type DomainNode = z.infer<typeof DomainNodeSchema>;
export type DomainNodeInput = z.infer<typeof DomainNodeInputSchema>;
export type DomainNodeUpdate = z.infer<typeof DomainNodeUpdateSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type RelationshipInput = z.input<typeof RelationshipInputSchema>;
export type RelationshipUpdate = z.infer<typeof RelationshipUpdateSchema>;
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type GlossaryInput = z.input<typeof GlossaryInputSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type ConnectionInput = z.infer<typeof ConnectionInputSchema>;
export type SchemaTable = z.infer<typeof SchemaTableSchema>;
export type SchemaForeignKey = z.infer<typeof SchemaForeignKeySchema>;
export type SchemaSnapshot = z.infer<typeof SchemaSnapshotSchema>;
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;

export type WorkspaceSnapshot = WorkspaceFile & {
  stats: {
    contexts: number;
    nodes: number;
    relationships: number;
    connections: number;
    glossaryTerms: number;
  };
};

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  relationshipId?: string;
};

export type ModelValidation = { ok: boolean; issues: ValidationIssue[] };

// ---------------------------------------------------------------- helpers

const CONTEXT_MAP_SET = new Set<string>(CONTEXT_MAP_TYPES);
export const isContextMapType = (type: string) => CONTEXT_MAP_SET.has(type);

/** Fill defaults that depend on the node kind. */
export function normalizeNode(raw: DomainNodeInput & { id: string }): DomainNode {
  const { kind } = raw;
  return {
    id: raw.id,
    contextId: raw.contextId,
    kind,
    name: raw.name,
    description: raw.description ?? "",
    status: raw.status ?? "draft",
    x: raw.x ?? null,
    y: raw.y ?? null,
    tags: raw.tags ?? [],
    methods: raw.methods ?? [],
    invariants: raw.invariants ?? [],
    eventVersion: raw.eventVersion ?? "1.0.0",
    eventPayloadSchema: raw.eventPayloadSchema ?? "",
    eventCompatibility: raw.eventCompatibility ?? "backward",
    sagaStyle: raw.sagaStyle ?? (kind === "saga" || kind === "process-manager" ? "orchestration" : "none"),
    cqrsSide:
      raw.cqrsSide ??
      (kind === "command-handler" || kind === "command"
        ? "command"
        : kind === "query-handler" || kind === "read-model"
          ? "query"
          : "none"),
  };
}

/** "customer-supplier" -> "Customer Supplier" */
export function titleCaseType(type: string): string {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
