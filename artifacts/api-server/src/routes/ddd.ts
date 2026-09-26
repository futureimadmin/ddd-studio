import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import {
  CreateBoundedContextBody,
  CreateBoundedContextResponse,
  CreateDomainNodeBody,
  CreateDomainNodeResponse,
  CreateRelationshipBody,
  CreateRelationshipResponse,
  CreateSchemaConnectionBody,
  CreateSchemaConnectionResponse,
  DeleteBoundedContextParams,
  DeleteDomainNodeParams,
  DeleteRelationshipParams,
  GetWorkspaceResponse,
  IntrospectSchemaConnectionParams,
  IntrospectSchemaConnectionResponse,
  ListBoundedContextsResponse,
  ListDomainNodesResponse,
  ListRelationshipsResponse,
  ListSchemaConnectionsResponse,
  UpdateBoundedContextBody,
  UpdateBoundedContextParams,
  UpdateBoundedContextResponse,
  UpdateDomainNodeBody,
  UpdateDomainNodeParams,
  UpdateDomainNodeResponse,
} from "@workspace/api-zod";

type Context = {
  id: string;
  name: string;
  purpose: string;
  color: string;
  nodeCount: number;
  relationshipCount: number;
};

type NodeKind =
  | "aggregate"
  | "aggregate-root"
  | "entity"
  | "value-object"
  | "domain-event"
  | "command"
  | "policy"
  | "actor"
  | "read-model"
  | "repository"
  | "service"
  | "resource"
  | "anti-corruption-layer"
  | "saga"
  | "process-manager";

type DomainNode = {
  id: string;
  contextId: string;
  kind: NodeKind;
  name: string;
  description: string;
  status: "draft" | "validated" | "needs-review";
  x: number;
  y: number;
  tags: string[];
  methods: string[];
  /** Business rules owned by aggregates / roots */
  invariants: string[];
  /** Domain-event contract version (semver) */
  eventVersion: string;
  /** JSON Schema or descriptive payload contract */
  eventPayloadSchema: string;
  eventCompatibility: "backward" | "forward" | "full" | "none";
};

type RelationType =
  | "uses"
  | "aggregation"
  | "composition"
  | "generalization"
  | "specialization"
  | "publishes"
  | "subscribes"
  | "owns"
  | "invokes"
  | "exposed-by"
  | "shared-kernel"
  | "customer-supplier"
  | "conformist"
  | "anti-corruption"
  | "open-host-service"
  | "published-language"
  | "partnership"
  | "separate-ways";

type Relationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  label: string;
  contextId: string;
};

type GlossaryTerm = {
  id: string;
  term: string;
  definition: string;
  contextId: string | null;
  aliases: string[];
  relatedNodeIds: string[];
};

type Connection = {
  id: string;
  name: string;
  engine: "oracle" | "db2" | "mysql" | "postgres";
  host: string;
  database: string;
  status: "connected" | "pending" | "error";
  tableCount: number;
  lastIntrospectedAt: string | null;
};

type SchemaSnapshot = {
  connectionId: string;
  tables: Array<{
    name: string;
    schema: string;
    rowEstimate: number;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      primaryKey: boolean;
    }>;
  }>;
  relationships: Relationship[];
  generatedAt: string;
};

type WorkspaceFile = {
  projectName: string;
  contexts: Context[];
  nodes: DomainNode[];
  relationships: Relationship[];
  glossary: GlossaryTerm[];
  connections: Connection[];
};

const CONTEXT_MAP_TYPES = new Set<RelationType>([
  "shared-kernel",
  "customer-supplier",
  "conformist",
  "anti-corruption",
  "open-host-service",
  "published-language",
  "partnership",
  "separate-ways",
]);

const DATA_DIR = process.env.DDD_DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "workspace.json");

const defaultContexts: Context[] = [
  {
    id: "context-orders",
    name: "Orders",
    purpose: "Capture purchase intent and coordinate fulfillment.",
    color: "#e87554",
    nodeCount: 0,
    relationshipCount: 0,
  },
  {
    id: "context-inventory",
    name: "Inventory",
    purpose: "Keep stock truthful across warehouses and channels.",
    color: "#55b7a8",
    nodeCount: 0,
    relationshipCount: 0,
  },
  {
    id: "context-payments",
    name: "Payments",
    purpose: "Authorize, capture, and reconcile money movement.",
    color: "#9184d8",
    nodeCount: 0,
    relationshipCount: 0,
  },
];

const defaultNodes: DomainNode[] = [
  {
    id: "node-order",
    contextId: "context-orders",
    kind: "aggregate",
    name: "Order",
    description: "The transactional boundary for a customer purchase.",
    status: "validated",
    x: 24,
    y: 28,
    tags: ["core", "transactional"],
    methods: ["place()", "addLineItem()", "cancel()"],
    invariants: [
      "Order must have at least one line item before place()",
      "Cancelled orders cannot be modified",
      "Total equals sum of line amounts",
    ],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-order-root",
    contextId: "context-orders",
    kind: "aggregate-root",
    name: "OrderRoot",
    description: "Guards order invariants and publishes lifecycle events.",
    status: "validated",
    x: 34,
    y: 45,
    tags: ["root"],
    methods: ["assertInvariants()", "publishEvents()"],
    invariants: ["Only OrderRoot may publish OrderPlaced"],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-place-order",
    contextId: "context-orders",
    kind: "command",
    name: "PlaceOrder",
    description: "Customer intent to create a new order.",
    status: "validated",
    x: 16,
    y: 18,
    tags: ["event-storming"],
    methods: [],
    invariants: [],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-order-placed",
    contextId: "context-orders",
    kind: "domain-event",
    name: "OrderPlaced",
    description: "A durable fact that downstream contexts can react to.",
    status: "validated",
    x: 50,
    y: 20,
    tags: ["event-storming", "integration"],
    methods: [],
    invariants: [],
    eventVersion: "1.2.0",
    eventPayloadSchema: JSON.stringify(
      {
        type: "object",
        required: ["orderId", "customerId", "placedAt"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          customerId: { type: "string", format: "uuid" },
          placedAt: { type: "string", format: "date-time" },
          lineCount: { type: "integer", minimum: 1 },
        },
      },
      null,
      2,
    ),
    eventCompatibility: "backward",
  },
  {
    id: "node-order-repo",
    contextId: "context-orders",
    kind: "repository",
    name: "OrderRepository",
    description: "Persistence boundary for the Order aggregate.",
    status: "needs-review",
    x: 20,
    y: 66,
    tags: ["port"],
    methods: ["findById()", "save()"],
    invariants: [],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-fulfillment",
    contextId: "context-inventory",
    kind: "service",
    name: "FulfillmentService",
    description: "Reserves inventory after an order is placed.",
    status: "draft",
    x: 68,
    y: 38,
    tags: ["application"],
    methods: ["reserveStock()", "handleOrderPlaced()"],
    invariants: [],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-stock",
    contextId: "context-inventory",
    kind: "aggregate-root",
    name: "StockItem",
    description: "The consistency boundary for available inventory.",
    status: "validated",
    x: 82,
    y: 54,
    tags: ["root", "inventory"],
    methods: ["reserve()", "release()", "availableQuantity()"],
    invariants: ["available + reserved == onHand", "reserve cannot exceed available"],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-payment",
    contextId: "context-payments",
    kind: "service",
    name: "PaymentGateway",
    description: "Resource exposed to authorize payment providers.",
    status: "validated",
    x: 62,
    y: 70,
    tags: ["resource", "external"],
    methods: ["authorize()", "capture()", "refund()"],
    invariants: [],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-payment-api",
    contextId: "context-payments",
    kind: "resource",
    name: "Payments API",
    description: "Domain API for authorization and capture.",
    status: "needs-review",
    x: 78,
    y: 78,
    tags: ["api"],
    methods: ["authorizePayment()", "capturePayment()"],
    invariants: [],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-payments-acl",
    contextId: "context-orders",
    kind: "anti-corruption-layer",
    name: "PaymentsACL",
    description: "Translates Orders language to Payments gateway DTOs.",
    status: "validated",
    x: 48,
    y: 62,
    tags: ["integration", "acl"],
    methods: ["toAuthorizeRequest()", "fromCaptureResponse()"],
    invariants: ["Never leak Payment provider IDs into Order aggregate"],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
  {
    id: "node-fulfillment-saga",
    contextId: "context-orders",
    kind: "saga",
    name: "FulfillmentSaga",
    description: "Process manager: OrderPlaced → reserve stock → authorize payment.",
    status: "draft",
    x: 58,
    y: 36,
    tags: ["process"],
    methods: ["onOrderPlaced()", "onStockReserved()", "onPaymentAuthorized()", "compensate()"],
    invariants: ["Compensation runs if payment fails after stock reserved"],
    eventVersion: "1.0.0",
    eventPayloadSchema: "",
    eventCompatibility: "backward",
  },
];

const defaultRelationships: Relationship[] = [
  {
    id: "rel-place-order",
    sourceId: "node-place-order",
    targetId: "node-order",
    type: "uses",
    label: "creates",
    contextId: "context-orders",
  },
  {
    id: "rel-root-order",
    sourceId: "node-order",
    targetId: "node-order-root",
    type: "composition",
    label: "contains",
    contextId: "context-orders",
  },
  {
    id: "rel-order-event",
    sourceId: "node-order-root",
    targetId: "node-order-placed",
    type: "publishes",
    label: "publishes",
    contextId: "context-orders",
  },
  {
    id: "rel-fulfillment",
    sourceId: "node-fulfillment",
    targetId: "node-order-placed",
    type: "subscribes",
    label: "reacts to",
    contextId: "context-inventory",
  },
  {
    id: "rel-stock",
    sourceId: "node-fulfillment",
    targetId: "node-stock",
    type: "uses",
    label: "reserves",
    contextId: "context-inventory",
  },
  {
    id: "rel-payment",
    sourceId: "node-order-root",
    targetId: "node-payment",
    type: "invokes",
    label: "authorizes",
    contextId: "context-payments",
  },
  {
    id: "rel-payment-api",
    sourceId: "node-payment",
    targetId: "node-payment-api",
    type: "exposed-by",
    label: "exposed by",
    contextId: "context-payments",
  },
  {
    id: "rel-acl",
    sourceId: "node-order-root",
    targetId: "node-payments-acl",
    type: "uses",
    label: "protects boundary",
    contextId: "context-orders",
  },
  {
    id: "rel-acl-payment",
    sourceId: "node-payments-acl",
    targetId: "node-payment",
    type: "anti-corruption",
    label: "ACL",
    contextId: "context-orders",
  },
  {
    id: "rel-saga-event",
    sourceId: "node-fulfillment-saga",
    targetId: "node-order-placed",
    type: "subscribes",
    label: "orchestrates",
    contextId: "context-orders",
  },
  {
    id: "rel-ctx-orders-inventory",
    sourceId: "node-order-placed",
    targetId: "node-fulfillment",
    type: "customer-supplier",
    label: "Customer-Supplier",
    contextId: "context-orders",
  },
];

const defaultGlossary: GlossaryTerm[] = [
  {
    id: "term-order",
    term: "Order",
    definition: "A customer commitment to purchase one or more line items under a single transactional boundary.",
    contextId: "context-orders",
    aliases: ["Purchase", "Sales order"],
    relatedNodeIds: ["node-order", "node-order-root"],
  },
  {
    id: "term-reserve",
    term: "Reserve",
    definition: "Temporarily hold inventory quantity so it cannot be sold twice before payment settles.",
    contextId: "context-inventory",
    aliases: ["Hold", "Allocation"],
    relatedNodeIds: ["node-stock"],
  },
  {
    id: "term-authorize",
    term: "Authorize",
    definition: "Request a payment provider to freeze funds without capturing them yet.",
    contextId: "context-payments",
    aliases: ["Auth"],
    relatedNodeIds: ["node-payment"],
  },
];

const defaultConnections: Connection[] = [
  {
    id: "conn-commerce",
    name: "Commerce warehouse",
    engine: "postgres",
    host: "warehouse.internal",
    database: "commerce",
    status: "connected",
    tableCount: 24,
    lastIntrospectedAt: new Date("2026-09-24T10:30:00.000Z").toISOString(),
  },
];

let projectName = "Commerce Platform";
let contexts: Context[] = structuredClone(defaultContexts);
let nodes: DomainNode[] = structuredClone(defaultNodes);
let relationships: Relationship[] = structuredClone(defaultRelationships);
let glossary: GlossaryTerm[] = structuredClone(defaultGlossary);
let connections: Connection[] = structuredClone(defaultConnections);
const snapshots = new Map<string, SchemaSnapshot>();

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function pathId(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeNode(raw: Partial<DomainNode> & { id: string; contextId: string; kind: NodeKind; name: string }): DomainNode {
  return {
    id: raw.id,
    contextId: raw.contextId,
    kind: raw.kind,
    name: raw.name,
    description: raw.description ?? "",
    status: raw.status ?? "draft",
    x: raw.x ?? 50,
    y: raw.y ?? 50,
    tags: raw.tags ?? [],
    methods: raw.methods ?? [],
    invariants: raw.invariants ?? [],
    eventVersion: raw.eventVersion ?? "1.0.0",
    eventPayloadSchema: raw.eventPayloadSchema ?? "",
    eventCompatibility: raw.eventCompatibility ?? "backward",
  };
}

function refreshCounts() {
  for (const context of contexts) {
    context.nodeCount = nodes.filter((node) => node.contextId === context.id).length;
    context.relationshipCount = relationships.filter(
      (relationship) => relationship.contextId === context.id,
    ).length;
  }
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload: WorkspaceFile = {
      projectName,
      contexts,
      nodes,
      relationships,
      glossary,
      connections,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("[ddd] persist failed", err);
  }
}

function loadPersisted() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as WorkspaceFile;
    if (raw.projectName) projectName = raw.projectName;
    if (Array.isArray(raw.contexts) && raw.contexts.length) contexts = raw.contexts;
    if (Array.isArray(raw.nodes) && raw.nodes.length) {
      nodes = raw.nodes.map((n) => normalizeNode(n as DomainNode));
    }
    if (Array.isArray(raw.relationships)) relationships = raw.relationships;
    if (Array.isArray(raw.glossary)) glossary = raw.glossary;
    if (Array.isArray(raw.connections)) connections = raw.connections;
    refreshCounts();
    console.info(`[ddd] loaded workspace from ${DATA_FILE}`);
  } catch (err) {
    console.error("[ddd] load failed, using defaults", err);
  }
}

loadPersisted();
refreshCounts();

type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  relationshipId?: string;
};

/** Structural + invariant checks — model-level enforcement (not runtime code gen). */
function validateModel(focusNodeId?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const compositionTargets = new Map<string, string[]>();

  for (const rel of relationships) {
    if (rel.type === "composition" || rel.type === "owns") {
      const list = compositionTargets.get(rel.sourceId) ?? [];
      list.push(rel.targetId);
      compositionTargets.set(rel.sourceId, list);
    }
  }

  const candidates = focusNodeId ? nodes.filter((n) => n.id === focusNodeId) : nodes;

  for (const node of candidates) {
    if (node.kind === "aggregate") {
      const targets = compositionTargets.get(node.id) ?? [];
      const roots = targets
        .map((tid) => nodeById.get(tid))
        .filter((n): n is DomainNode => !!n && n.kind === "aggregate-root");
      if (roots.length === 0) {
        issues.push({
          code: "AGGREGATE_MISSING_ROOT",
          severity: "error",
          message: `Aggregate "${node.name}" has no composition/owns link to an aggregate-root`,
          nodeId: node.id,
        });
      } else if (roots.length > 1) {
        issues.push({
          code: "AGGREGATE_MULTIPLE_ROOTS",
          severity: "error",
          message: `Aggregate "${node.name}" composes more than one aggregate-root`,
          nodeId: node.id,
        });
      }
      if (!node.invariants.length) {
        issues.push({
          code: "AGGREGATE_NO_INVARIANTS",
          severity: "warning",
          message: `Aggregate "${node.name}" has no documented invariants`,
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "aggregate-root" && !node.methods.some((m) => /assert|invariants/i.test(m))) {
      issues.push({
        code: "ROOT_NO_ASSERT",
        severity: "warning",
        message: `Aggregate root "${node.name}" should expose assertInvariants() (or similar)`,
        nodeId: node.id,
      });
    }

    if (node.kind === "domain-event") {
      if (!node.eventVersion) {
        issues.push({
          code: "EVENT_NO_VERSION",
          severity: "error",
          message: `Domain event "${node.name}" is missing eventVersion`,
          nodeId: node.id,
        });
      }
      if (!node.eventPayloadSchema.trim()) {
        issues.push({
          code: "EVENT_NO_SCHEMA",
          severity: "warning",
          message: `Domain event "${node.name}" has empty payload contract`,
          nodeId: node.id,
        });
      } else {
        try {
          const parsed = JSON.parse(node.eventPayloadSchema);
          if (typeof parsed !== "object" || parsed === null) {
            issues.push({
              code: "EVENT_SCHEMA_NOT_OBJECT",
              severity: "warning",
              message: `Domain event "${node.name}" payload schema should be a JSON object`,
              nodeId: node.id,
            });
          }
        } catch {
          // prose schema is allowed — informational only
        }
      }
    }

    if (node.kind === "saga" || node.kind === "process-manager") {
      if (!node.methods.some((m) => /compensat/i.test(m))) {
        issues.push({
          code: "SAGA_NO_COMPENSATION",
          severity: "warning",
          message: `Saga/process "${node.name}" should define compensate() or similar`,
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "anti-corruption-layer" && !node.methods.length) {
      issues.push({
        code: "ACL_NO_TRANSLATORS",
        severity: "warning",
        message: `ACL "${node.name}" should list translation methods`,
        nodeId: node.id,
      });
    }

    if (node.status === "validated" && node.kind === "aggregate" && !node.invariants.length) {
      issues.push({
        code: "VALIDATED_WITHOUT_INVARIANTS",
        severity: "error",
        message: `Cannot treat aggregate "${node.name}" as validated without invariants`,
        nodeId: node.id,
      });
    }
  }

  for (const rel of relationships) {
    if (CONTEXT_MAP_TYPES.has(rel.type) && !rel.label.trim()) {
      issues.push({
        code: "CONTEXT_MAP_UNLABELED",
        severity: "warning",
        message: `Context-map relationship (${rel.type}) should carry a strategic label`,
        relationshipId: rel.id,
      });
    }
  }

  return issues;
}

function schemaFor(connection: Connection): SchemaSnapshot {
  const engineLabel = connection.engine === "postgres" ? "uuid" : "varchar(36)";
  return {
    connectionId: connection.id,
    tables: [
      {
        name: "orders",
        schema: "public",
        rowEstimate: 18420,
        columns: [
          { name: "id", type: engineLabel, nullable: false, primaryKey: true },
          { name: "customer_id", type: engineLabel, nullable: false, primaryKey: false },
          { name: "status", type: "varchar(32)", nullable: false, primaryKey: false },
          { name: "placed_at", type: "timestamp", nullable: false, primaryKey: false },
        ],
      },
      {
        name: "order_lines",
        schema: "public",
        rowEstimate: 62890,
        columns: [
          { name: "id", type: engineLabel, nullable: false, primaryKey: true },
          { name: "order_id", type: engineLabel, nullable: false, primaryKey: false },
          { name: "sku", type: "varchar(64)", nullable: false, primaryKey: false },
          { name: "quantity", type: "integer", nullable: false, primaryKey: false },
        ],
      },
      {
        name: "inventory",
        schema: "public",
        rowEstimate: 8400,
        columns: [
          { name: "sku", type: "varchar(64)", nullable: false, primaryKey: true },
          { name: "available", type: "integer", nullable: false, primaryKey: false },
          { name: "reserved", type: "integer", nullable: false, primaryKey: false },
        ],
      },
    ],
    relationships: [
      {
        id: id("schema-rel"),
        sourceId: "orders",
        targetId: "order_lines",
        type: "composition",
        label: "contains",
        contextId: "context-orders",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

function workspacePayload() {
  refreshCounts();
  return {
    projectName,
    contexts,
    nodes,
    relationships,
    connections,
    glossary,
    stats: {
      contexts: contexts.length,
      nodes: nodes.length,
      relationships: relationships.length,
      connections: connections.length,
      glossaryTerms: glossary.length,
    },
  };
}

function parseGlossaryBody(body: unknown): { ok: true; data: Omit<GlossaryTerm, "id"> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (typeof b.term !== "string" || !b.term.trim()) return { ok: false, error: "term is required" };
  if (typeof b.definition !== "string") return { ok: false, error: "definition is required" };
  return {
    ok: true,
    data: {
      term: b.term.trim(),
      definition: b.definition,
      contextId: b.contextId === null || typeof b.contextId === "string" ? (b.contextId as string | null) : null,
      aliases: Array.isArray(b.aliases) ? b.aliases.filter((x): x is string => typeof x === "string") : [],
      relatedNodeIds: Array.isArray(b.relatedNodeIds)
        ? b.relatedNodeIds.filter((x): x is string => typeof x === "string")
        : [],
    },
  };
}

const router: IRouter = Router();

router.get("/workspace", (_req, res): void => {
  const payload = workspacePayload();
  try {
    res.json(GetWorkspaceResponse.parse(payload));
  } catch {
    // Tolerate schema lag on optional glossary/stats fields
    res.json(payload);
  }
});

router.get("/model/validate", (_req, res): void => {
  const issues = validateModel();
  res.json({
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  });
});

router.post("/domain-nodes/:id/validate-invariants", (req, res): void => {
  const nodeId = pathId(req.params.id);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    res.status(404).json({ error: "Domain node not found" });
    return;
  }
  const issues = validateModel(nodeId);
  res.json({
    nodeId,
    ok: !issues.some((i) => i.severity === "error"),
    invariants: node.invariants,
    issues,
  });
});

router.get("/bounded-contexts", (_req, res): void => {
  refreshCounts();
  res.json(ListBoundedContextsResponse.parse(contexts));
});

router.post("/bounded-contexts", (req, res): void => {
  const parsed = CreateBoundedContextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const context: Context = {
    id: id("context"),
    ...parsed.data,
    nodeCount: 0,
    relationshipCount: 0,
  };
  contexts.push(context);
  persist();
  res.status(201).json(CreateBoundedContextResponse.parse(context));
});

router.patch("/bounded-contexts/:id", (req, res): void => {
  const params = UpdateBoundedContextParams.safeParse(req.params);
  const body = UpdateBoundedContextBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid bounded context update" });
    return;
  }
  const context = contexts.find((item) => item.id === pathId(params.data.id));
  if (!context) {
    res.status(404).json({ error: "Bounded context not found" });
    return;
  }
  Object.assign(context, body.data);
  persist();
  res.json(UpdateBoundedContextResponse.parse(context));
});

router.delete("/bounded-contexts/:id", (req, res): void => {
  const params = DeleteBoundedContextParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const contextIndex = contexts.findIndex((item) => item.id === pathId(params.data.id));
  if (contextIndex === -1) {
    res.status(404).json({ error: "Bounded context not found" });
    return;
  }
  const contextId = contexts[contextIndex].id;
  contexts.splice(contextIndex, 1);
  const nodeIds = new Set(nodes.filter((node) => node.contextId === contextId).map((node) => node.id));
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index].contextId === contextId) nodes.splice(index, 1);
  }
  for (let index = relationships.length - 1; index >= 0; index -= 1) {
    const relationship = relationships[index];
    if (relationship.contextId === contextId || nodeIds.has(relationship.sourceId) || nodeIds.has(relationship.targetId)) {
      relationships.splice(index, 1);
    }
  }
  for (let index = glossary.length - 1; index >= 0; index -= 1) {
    if (glossary[index].contextId === contextId) glossary.splice(index, 1);
  }
  persist();
  res.status(204).send();
});

router.get("/domain-nodes", (_req, res): void => {
  res.json(ListDomainNodesResponse.parse(nodes));
});

router.post("/domain-nodes", (req, res): void => {
  const parsed = CreateDomainNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!contexts.some((context) => context.id === parsed.data.contextId)) {
    res.status(400).json({ error: "Bounded context not found" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const node = normalizeNode({
    id: id("node"),
    ...parsed.data,
    invariants: Array.isArray(body.invariants) ? (body.invariants as string[]) : [],
    eventVersion: typeof body.eventVersion === "string" ? body.eventVersion : "1.0.0",
    eventPayloadSchema: typeof body.eventPayloadSchema === "string" ? body.eventPayloadSchema : "",
    eventCompatibility:
      body.eventCompatibility === "forward" ||
      body.eventCompatibility === "full" ||
      body.eventCompatibility === "none" ||
      body.eventCompatibility === "backward"
        ? body.eventCompatibility
        : "backward",
  });
  if (node.status === "validated") {
    nodes.push(node);
    const issues = validateModel(node.id).filter((i) => i.severity === "error");
    if (issues.length) {
      nodes.pop();
      res.status(400).json({ error: "Validation failed", issues });
      return;
    }
  } else {
    nodes.push(node);
  }
  refreshCounts();
  persist();
  res.status(201).json(CreateDomainNodeResponse.parse(node));
});

router.patch("/domain-nodes/:id", (req, res): void => {
  const params = UpdateDomainNodeParams.safeParse(req.params);
  const body = UpdateDomainNodeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid domain node update" });
    return;
  }
  const node = nodes.find((item) => item.id === pathId(params.data.id));
  if (!node) {
    res.status(404).json({ error: "Domain node not found" });
    return;
  }
  if (body.data.contextId && !contexts.some((context) => context.id === body.data.contextId)) {
    res.status(400).json({ error: "Bounded context not found" });
    return;
  }
  const extra = req.body as Record<string, unknown>;
  Object.assign(node, body.data);
  if (Array.isArray(extra.invariants)) node.invariants = extra.invariants as string[];
  if (typeof extra.eventVersion === "string") node.eventVersion = extra.eventVersion;
  if (typeof extra.eventPayloadSchema === "string") node.eventPayloadSchema = extra.eventPayloadSchema;
  if (
    extra.eventCompatibility === "backward" ||
    extra.eventCompatibility === "forward" ||
    extra.eventCompatibility === "full" ||
    extra.eventCompatibility === "none"
  ) {
    node.eventCompatibility = extra.eventCompatibility;
  }
  if (node.status === "validated") {
    const issues = validateModel(node.id).filter((i) => i.severity === "error");
    if (issues.length) {
      res.status(400).json({ error: "Cannot mark validated: model rules failed", issues });
      return;
    }
  }
  refreshCounts();
  persist();
  res.json(UpdateDomainNodeResponse.parse(node));
});

router.delete("/domain-nodes/:id", (req, res): void => {
  const params = DeleteDomainNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const index = nodes.findIndex((item) => item.id === pathId(params.data.id));
  if (index === -1) {
    res.status(404).json({ error: "Domain node not found" });
    return;
  }
  const removedId = nodes[index].id;
  nodes.splice(index, 1);
  for (let relationshipIndex = relationships.length - 1; relationshipIndex >= 0; relationshipIndex -= 1) {
    const relationship = relationships[relationshipIndex];
    if (relationship.sourceId === removedId || relationship.targetId === removedId) {
      relationships.splice(relationshipIndex, 1);
    }
  }
  for (const term of glossary) {
    term.relatedNodeIds = term.relatedNodeIds.filter((nid) => nid !== removedId);
  }
  refreshCounts();
  persist();
  res.status(204).send();
});

router.get("/relationships", (_req, res): void => {
  res.json(ListRelationshipsResponse.parse(relationships));
});

router.post("/relationships", (req, res): void => {
  const parsed = CreateRelationshipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const sourceExists = nodes.some((node) => node.id === parsed.data.sourceId);
  const targetExists = nodes.some((node) => node.id === parsed.data.targetId);
  if (!sourceExists || !targetExists) {
    res.status(400).json({ error: "Both relationship endpoints must exist" });
    return;
  }
  const relationship: Relationship = { id: id("rel"), ...parsed.data };
  // Auto-label formal context-map types when label empty
  if (CONTEXT_MAP_TYPES.has(relationship.type) && !relationship.label.trim()) {
    relationship.label = relationship.type
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  relationships.push(relationship);
  refreshCounts();
  persist();
  res.status(201).json(CreateRelationshipResponse.parse(relationship));
});

router.delete("/relationships/:id", (req, res): void => {
  const params = DeleteRelationshipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const index = relationships.findIndex((item) => item.id === pathId(params.data.id));
  if (index === -1) {
    res.status(404).json({ error: "Relationship not found" });
    return;
  }
  relationships.splice(index, 1);
  refreshCounts();
  persist();
  res.status(204).send();
});

/** Ubiquitous language glossary */
router.get("/glossary", (_req, res): void => {
  res.json(glossary);
});

router.post("/glossary", (req, res): void => {
  const parsed = parseGlossaryBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (parsed.data.contextId && !contexts.some((c) => c.id === parsed.data.contextId)) {
    res.status(400).json({ error: "Bounded context not found" });
    return;
  }
  const term: GlossaryTerm = { id: id("term"), ...parsed.data };
  glossary.push(term);
  persist();
  res.status(201).json(term);
});

router.patch("/glossary/:id", (req, res): void => {
  const term = glossary.find((t) => t.id === pathId(req.params.id));
  if (!term) {
    res.status(404).json({ error: "Glossary term not found" });
    return;
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.term === "string" && b.term.trim()) term.term = b.term.trim();
  if (typeof b.definition === "string") term.definition = b.definition;
  if (b.contextId === null || typeof b.contextId === "string") term.contextId = b.contextId as string | null;
  if (Array.isArray(b.aliases)) term.aliases = b.aliases.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.relatedNodeIds))
    term.relatedNodeIds = b.relatedNodeIds.filter((x): x is string => typeof x === "string");
  persist();
  res.json(term);
});

router.delete("/glossary/:id", (req, res): void => {
  const index = glossary.findIndex((t) => t.id === pathId(req.params.id));
  if (index === -1) {
    res.status(404).json({ error: "Glossary term not found" });
    return;
  }
  glossary.splice(index, 1);
  persist();
  res.status(204).send();
});

router.get("/schema-connections", (_req, res): void => {
  res.json(ListSchemaConnectionsResponse.parse(connections));
});

router.post("/schema-connections", (req, res): void => {
  const parsed = CreateSchemaConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const connection: Connection = {
    id: id("connection"),
    name: parsed.data.name,
    engine: parsed.data.engine,
    host: parsed.data.host,
    database: parsed.data.database,
    status: "pending",
    tableCount: 0,
    lastIntrospectedAt: null,
  };
  connections.push(connection);
  persist();
  res.status(201).json(CreateSchemaConnectionResponse.parse(connection));
});

router.post("/schema-connections/:id/introspect", (req, res): void => {
  const params = IntrospectSchemaConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const connection = connections.find((item) => item.id === pathId(params.data.id));
  if (!connection) {
    res.status(404).json({ error: "Schema connection not found" });
    return;
  }
  const snapshot = schemaFor(connection);
  snapshots.set(connection.id, snapshot);
  connection.status = "connected";
  connection.tableCount = snapshot.tables.length;
  connection.lastIntrospectedAt = snapshot.generatedAt;
  persist();
  res.json(IntrospectSchemaConnectionResponse.parse(snapshot));
});

export default router;
