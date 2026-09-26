import { Router, type IRouter } from "express";
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
  | "resource";

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
  | "exposed-by";

type Relationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  label: string;
  contextId: string;
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

const contexts: Context[] = [
  {
    id: "context-orders",
    name: "Orders",
    purpose: "Capture purchase intent and coordinate fulfillment.",
    color: "#e87554",
    nodeCount: 7,
    relationshipCount: 5,
  },
  {
    id: "context-inventory",
    name: "Inventory",
    purpose: "Keep stock truthful across warehouses and channels.",
    color: "#55b7a8",
    nodeCount: 5,
    relationshipCount: 4,
  },
  {
    id: "context-payments",
    name: "Payments",
    purpose: "Authorize, capture, and reconcile money movement.",
    color: "#9184d8",
    nodeCount: 4,
    relationshipCount: 3,
  },
];

const nodes: DomainNode[] = [
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
  },
];

const relationships: Relationship[] = [
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
];

const connections: Connection[] = [
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

const snapshots = new Map<string, SchemaSnapshot>();

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function pathId(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function refreshCounts() {
  for (const context of contexts) {
    context.nodeCount = nodes.filter((node) => node.contextId === context.id).length;
    context.relationshipCount = relationships.filter(
      (relationship) => relationship.contextId === context.id,
    ).length;
  }
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

const router: IRouter = Router();

router.get("/workspace", (_req, res): void => {
  refreshCounts();
  res.json(
    GetWorkspaceResponse.parse({
      projectName: "Commerce Platform",
      contexts,
      nodes,
      relationships,
      connections,
      stats: {
        contexts: contexts.length,
        nodes: nodes.length,
        relationships: relationships.length,
        connections: connections.length,
      },
    }),
  );
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
  const node: DomainNode = { id: id("node"), ...parsed.data };
  nodes.push(node);
  refreshCounts();
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
  Object.assign(node, body.data);
  refreshCounts();
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
  refreshCounts();
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
  relationships.push(relationship);
  refreshCounts();
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
  res.json(IntrospectSchemaConnectionResponse.parse(snapshot));
});

export default router;