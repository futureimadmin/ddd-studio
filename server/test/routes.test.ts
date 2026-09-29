import "./env";

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer, type TestServer } from "./helpers";

let s: TestServer;
let ctxId: string;
let otherCtxId: string;

before(async () => {
  s = await startServer();
});
after(async () => {
  await s.close();
});

test("health", async () => {
  const r = await s.call("GET", "/api/healthz");
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "ok");
});

test("unknown API routes 404 as JSON", async () => {
  const r = await s.call("GET", "/api/nope");
  assert.equal(r.status, 404);
  assert.match(r.body.error, /No such endpoint/);
});

test("malformed JSON is a 400, not a 500", async () => {
  const res = await fetch(`${s.url}/api/bounded-contexts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(res.status, 400);
});

test("bounded contexts: validation, create, update", async () => {
  assert.equal((await s.call("POST", "/api/bounded-contexts", { name: "  " })).status, 400);
  assert.equal((await s.call("POST", "/api/bounded-contexts", { name: "X", color: "red" })).status, 400);
  const a = await s.call("POST", "/api/bounded-contexts", { name: "Orders", purpose: "Sell things", color: "#e87554" });
  assert.equal(a.status, 201);
  ctxId = a.body.id;
  const b = await s.call("POST", "/api/bounded-contexts", { name: "Billing" });
  otherCtxId = b.body.id;
  assert.equal(b.body.color, "#6588c5", "colour is defaulted");
  const patched = await s.call("PATCH", `/api/bounded-contexts/${ctxId}`, { purpose: "Capture orders" });
  assert.equal(patched.body.purpose, "Capture orders");
  assert.equal((await s.call("PATCH", "/api/bounded-contexts/missing", { purpose: "x" })).status, 404);
});

let aggregateId: string;
let rootId: string;

test("domain nodes: defaults, unknown context, validated aggregate needs root + invariants", async () => {
  assert.equal((await s.call("POST", "/api/domain-nodes", { contextId: "nope", kind: "entity", name: "E" })).status, 400);
  assert.equal((await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "not-a-kind", name: "E" })).status, 400);

  const agg = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "aggregate", name: "Order" });
  assert.equal(agg.status, 201);
  aggregateId = agg.body.id;
  assert.equal(agg.body.status, "draft");
  assert.equal(agg.body.eventVersion, "1.0.0");

  const root = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "aggregate-root", name: "OrderRoot", methods: ["assertInvariants()"] });
  rootId = root.body.id;

  const rejected = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "aggregate", name: "Bad", status: "validated" });
  assert.equal(rejected.status, 400);
  assert.ok(rejected.body.issues.length > 0);
  const list = await s.call("GET", "/api/domain-nodes");
  assert.ok(!list.body.some((n: { name: string }) => n.name === "Bad"), "rejected create leaves nothing behind");
});

test("a rejected PATCH leaves the node exactly as it was", async () => {
  const before = (await s.call("GET", "/api/domain-nodes")).body.find((n: { id: string }) => n.id === aggregateId);
  const r = await s.call("PATCH", `/api/domain-nodes/${aggregateId}`, { status: "validated", name: "Renamed", description: "changed" });
  assert.equal(r.status, 400);
  const after = (await s.call("GET", "/api/domain-nodes")).body.find((n: { id: string }) => n.id === aggregateId);
  assert.deepEqual(after, before);
});

test("relationships: endpoints, self-links, duplicates, context defaulting, auto-labels", async () => {
  const base = { sourceId: aggregateId, targetId: rootId, type: "composition" };
  assert.equal((await s.call("POST", "/api/relationships", { ...base, targetId: "ghost" })).status, 400);
  assert.equal((await s.call("POST", "/api/relationships", { ...base, targetId: aggregateId })).status, 400);
  assert.equal((await s.call("POST", "/api/relationships", { ...base, type: "telepathy" })).status, 400);

  const ok = await s.call("POST", "/api/relationships", base);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.contextId, ctxId, "defaults to the source's context");
  assert.equal((await s.call("POST", "/api/relationships", base)).status, 409);

  const cm = await s.call("POST", "/api/relationships", { sourceId: aggregateId, targetId: rootId, type: "customer-supplier" });
  assert.equal(cm.body.label, "Customer Supplier");
});

test("now the aggregate can be validated once it has invariants", async () => {
  const r = await s.call("PATCH", `/api/domain-nodes/${aggregateId}`, { status: "validated", invariants: ["Total must be positive"] });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "validated");
});

test("moving a node to another context re-homes its outgoing relationships", async () => {
  await s.call("PATCH", `/api/domain-nodes/${aggregateId}`, { contextId: otherCtxId });
  const rels = (await s.call("GET", "/api/relationships")).body.filter((r: { sourceId: string }) => r.sourceId === aggregateId);
  assert.ok(rels.length > 0 && rels.every((r: { contextId: string }) => r.contextId === otherCtxId));
});

test("a relationship can be edited and reversed without losing its identity", async () => {
  const a = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "Left" });
  const b = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "Right" });
  const rel = await s.call("POST", "/api/relationships", { sourceId: a.body.id, targetId: b.body.id, type: "uses" });

  const typed = await s.call("PATCH", `/api/relationships/${rel.body.id}`, { type: "aggregation" });
  assert.equal(typed.body.type, "aggregation");
  assert.equal(typed.body.id, rel.body.id);

  const reversed = await s.call("PATCH", `/api/relationships/${rel.body.id}`, { sourceId: b.body.id, targetId: a.body.id });
  assert.equal(reversed.body.sourceId, b.body.id);
  assert.equal(reversed.body.targetId, a.body.id);

  assert.equal((await s.call("PATCH", `/api/relationships/${rel.body.id}`, { sourceId: a.body.id, targetId: a.body.id })).status, 400);
  assert.equal((await s.call("PATCH", `/api/relationships/${rel.body.id}`, { type: "telepathy" })).status, 400);
  assert.equal((await s.call("PATCH", "/api/relationships/ghost", { type: "uses" })).status, 404);

  const other = await s.call("POST", "/api/relationships", { sourceId: a.body.id, targetId: b.body.id, type: "aggregation" });
  const clash = await s.call("PATCH", `/api/relationships/${other.body.id}`, { sourceId: b.body.id, targetId: a.body.id });
  assert.equal(clash.status, 409, "reversing into an existing identical relationship is refused");
});

test("layout: batch-save positions for elements and contexts, ignoring unknown ids", async () => {
  const n = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "Placed" });
  assert.equal(n.body.x, null, "new elements start unplaced");
  const r = await s.call("PUT", "/api/workspace/layout", {
    nodes: [{ id: n.body.id, x: 320, y: -48 }, { id: "ghost", x: 1, y: 1 }],
    contexts: [{ id: ctxId, x: 64, y: 96 }],
  });
  assert.equal(r.body.updated, 2);
  const node = (await s.call("GET", "/api/domain-nodes")).body.find((x: { id: string }) => x.id === n.body.id);
  assert.deepEqual([node.x, node.y], [320, -48]);
  const ctx = (await s.call("GET", "/api/bounded-contexts")).body.find((c: { id: string }) => c.id === ctxId);
  assert.deepEqual([ctx.x, ctx.y], [64, 96]);
  assert.equal((await s.call("PUT", "/api/workspace/layout", { nodes: [{ id: n.body.id, x: "left", y: 1 }] })).status, 400);
  // and a single element can still be moved through the normal update
  const moved = await s.call("PATCH", `/api/domain-nodes/${n.body.id}`, { x: 16, y: 32 });
  assert.deepEqual([moved.body.x, moved.body.y], [16, 32]);
});

test("entities: Logical by default, can be marked Physical with a table, and reset by going back to Logical", async () => {
  const created = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "Customer" });
  assert.equal(created.body.representation, "logical");
  assert.equal(created.body.physicalTable, null);
  assert.equal(created.body.generalizationConstraint, "none");

  const conn = await s.call("POST", "/api/schema-connections", {
    name: "warehouse", engine: "postgres", host: "h", database: "d", username: "u", password: "p",
  });

  const physical = await s.call("PATCH", `/api/domain-nodes/${created.body.id}`, {
    representation: "physical",
    physicalTable: { connectionId: conn.body.id, schema: "public", table: "customers" },
  });
  assert.equal(physical.status, 200);
  assert.deepEqual(physical.body.physicalTable, { connectionId: conn.body.id, schema: "public", table: "customers" });

  assert.equal(
    (await s.call("PATCH", `/api/domain-nodes/${created.body.id}`, { physicalTable: { connectionId: "x", schema: "", table: "t" } })).status,
    400,
    "an empty schema/table is rejected",
  );

  const backToLogical = await s.call("PATCH", `/api/domain-nodes/${created.body.id}`, { representation: "logical" });
  assert.equal(backToLogical.body.representation, "logical");
  assert.equal(backToLogical.body.physicalTable, null, "the stale table reference is dropped, not left dangling");
});

test("deleting a schema connection resets any entity that pointed at one of its tables back to Logical", async () => {
  const conn = await s.call("POST", "/api/schema-connections", {
    name: "temp-db", engine: "mysql", host: "h", database: "d", username: "u", password: "p",
  });
  const entity = await s.call("POST", "/api/domain-nodes", {
    contextId: ctxId, kind: "entity", name: "Invoice",
    representation: "physical", physicalTable: { connectionId: conn.body.id, schema: "dbo", table: "invoices" },
  });
  assert.equal(entity.body.representation, "physical");

  assert.equal((await s.call("DELETE", `/api/schema-connections/${conn.body.id}`)).status, 204);

  const after = (await s.call("GET", "/api/domain-nodes")).body.find((n: { id: string }) => n.id === entity.body.id);
  assert.equal(after.representation, "logical");
  assert.equal(after.physicalTable, null);
});

test("model validation flags a Physical element with no table, and a Physical non-Entity, as warnings only", async () => {
  const noTable = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "NoTable", representation: "physical" });
  assert.equal(noTable.status, 201, "a warning-level issue never blocks a draft create");
  const onAggregate = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "aggregate", name: "PhysicalAgg", representation: "physical" });

  const validation = await s.call("GET", "/api/model/validate");
  const codes = (id: string) => validation.body.issues.filter((i: { nodeId: string }) => i.nodeId === id).map((i: { code: string }) => i.code);
  assert.ok(codes(noTable.body.id).includes("PHYSICAL_WITHOUT_TABLE"));
  assert.ok(codes(onAggregate.body.id).includes("PHYSICAL_ON_NON_ENTITY"));
  assert.ok(validation.body.issues.every((i: { severity: string; nodeId?: string }) => i.severity !== "error" || i.nodeId !== noTable.body.id));
});

test("generalization-set constraint: round-trips, and warns when set without at least two subtypes", async () => {
  const base = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "Payment" });
  const set = await s.call("PATCH", `/api/domain-nodes/${base.body.id}`, { generalizationConstraint: "xor" });
  assert.equal(set.body.generalizationConstraint, "xor");
  assert.equal((await s.call("PATCH", `/api/domain-nodes/${base.body.id}`, { generalizationConstraint: "not-a-type" })).status, 400);

  let validation = await s.call("GET", "/api/model/validate");
  assert.ok(validation.body.issues.some((i: { nodeId: string; code: string }) => i.nodeId === base.body.id && i.code === "GENERALIZATION_CONSTRAINT_UNUSED"));

  const cardPayment = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "CardPayment" });
  const cashPayment = await s.call("POST", "/api/domain-nodes", { contextId: ctxId, kind: "entity", name: "CashPayment" });
  await s.call("POST", "/api/relationships", { sourceId: cardPayment.body.id, targetId: base.body.id, type: "generalization" });
  await s.call("POST", "/api/relationships", { sourceId: cashPayment.body.id, targetId: base.body.id, type: "specialization" });

  validation = await s.call("GET", "/api/model/validate");
  assert.ok(!validation.body.issues.some((i: { nodeId: string; code: string }) => i.nodeId === base.body.id && i.code === "GENERALIZATION_CONSTRAINT_UNUSED"));
});

test("glossary CRUD with validation", async () => {
  assert.equal((await s.call("POST", "/api/glossary", { term: "" })).status, 400);
  assert.equal((await s.call("POST", "/api/glossary", { term: "T", contextId: "ghost" })).status, 400);
  const t = await s.call("POST", "/api/glossary", { term: "Order", definition: "A purchase", aliases: ["Sale"], relatedNodeIds: [aggregateId, "ghost"] });
  assert.equal(t.status, 201);
  assert.deepEqual(t.body.relatedNodeIds, [aggregateId], "unknown node ids are dropped");
  const patched = await s.call("PATCH", `/api/glossary/${t.body.id}`, { definition: "A customer purchase" });
  assert.equal(patched.body.definition, "A customer purchase");
  assert.equal((await s.call("DELETE", `/api/glossary/${t.body.id}`)).status, 204);
  assert.equal((await s.call("DELETE", `/api/glossary/${t.body.id}`)).status, 404);
});

test("project name can be changed and is part of the workspace + export", async () => {
  assert.equal((await s.call("PATCH", "/api/workspace", { projectName: " " })).status, 400);
  const r = await s.call("PATCH", "/api/workspace", { projectName: "Shop" });
  assert.equal(r.body.projectName, "Shop");
  const exp = await s.call("GET", "/api/workspace/export");
  assert.equal(exp.body.projectName, "Shop");
  assert.equal(exp.body.schemaVersion, "1.0.0");
  assert.ok(exp.body.elements.length >= 2);
});

test("deleting a node removes its relationships and glossary references", async () => {
  const term = await s.call("POST", "/api/glossary", { term: "Root", relatedNodeIds: [rootId] });
  assert.equal((await s.call("DELETE", `/api/domain-nodes/${rootId}`)).status, 204);
  const rels = (await s.call("GET", "/api/relationships")).body;
  assert.ok(rels.every((r: { sourceId: string; targetId: string }) => r.sourceId !== rootId && r.targetId !== rootId));
  const terms = (await s.call("GET", "/api/glossary")).body;
  assert.deepEqual(terms.find((t: { id: string }) => t.id === term.body.id).relatedNodeIds, []);
});

// ---------------------------------------------------------------- schema connections

test("connections: password is never returned and introspection asks for it after a restart", async () => {
  const created = await s.call("POST", "/api/schema-connections", {
    name: "db", engine: "postgres", host: "127.0.0.1", port: 1, database: "d", username: "u", password: "s3cret",
  });
  assert.equal(created.status, 201);
  assert.ok(!JSON.stringify(created.body).includes("s3cret"));
  assert.equal(created.body.username, "u");
  assert.equal(created.body.port, 1);

  s.store.passwords.clear(); // what a server restart does
  const r = await s.call("POST", `/api/schema-connections/${created.body.id}/introspect`, {});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "credentials_required");
});

test("a failing introspection records the error on the connection and never echoes the password", async () => {
  const created = await s.call("POST", "/api/schema-connections", {
    name: "unreachable", engine: "postgres", host: "127.0.0.1", port: 1, database: "d", username: "u", password: "pw-should-not-leak",
  });
  const r = await s.call("POST", `/api/schema-connections/${created.body.id}/introspect`, {});
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes("pw-should-not-leak"));
  const conn = (await s.call("GET", "/api/schema-connections")).body.find((c: { id: string }) => c.id === created.body.id);
  assert.equal(conn.status, "error");
  assert.ok(conn.lastError);
});

test("DB2 without the optional driver reports how to enable it", async () => {
  const created = await s.call("POST", "/api/schema-connections", {
    name: "mainframe", engine: "db2", host: "127.0.0.1", database: "d", username: "u", password: "p",
  });
  const r = await s.call("POST", `/api/schema-connections/${created.body.id}/introspect`, {});
  assert.equal(r.status, 501);
  assert.match(r.body.error, /ibm_db/);
});

test("importing before introspecting is a clear 409; connections can be deleted", async () => {
  const created = await s.call("POST", "/api/schema-connections", {
    name: "tmp", engine: "mysql", host: "h", database: "d", username: "u", password: "p",
  });
  const r = await s.call("POST", `/api/schema-connections/${created.body.id}/import`, { contextId: ctxId });
  assert.equal(r.status, 409);
  assert.equal((await s.call("DELETE", `/api/schema-connections/${created.body.id}`)).status, 204);
  assert.equal((await s.call("DELETE", `/api/schema-connections/${created.body.id}`)).status, 404);
});

// ---------------------------------------------------------------- AI (offline sketch path)

test("AI: auth-status explains why the sketch designer is used", async () => {
  const r = await s.call("GET", "/api/ai/auth-status");
  assert.equal(r.body.ok, false);
  assert.equal(r.body.mode, "offline");
  assert.match(r.body.reason, /DDD_AI_OFFLINE/);
});

test("AI: generate-domain validates input, previews without applying, then applies the previewed design", async () => {
  assert.equal((await s.call("POST", "/api/ai/generate-domain", { prompt: "" })).status, 400);
  assert.equal((await s.call("POST", "/api/ai/generate-domain", { prompt: "x".repeat(8001) })).status, 400);

  const contextsBefore = (await s.call("GET", "/api/bounded-contexts")).body.length;
  const preview = await s.call("POST", "/api/ai/generate-domain", { prompt: "Library lending", apply: false });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.source, "mock");
  assert.match(preview.body.fallbackReason, /DDD_AI_OFFLINE/, "the UI can tell the user it is not Gemini");
  assert.equal((await s.call("GET", "/api/bounded-contexts")).body.length, contextsBefore, "preview changes nothing");

  const applied = await s.call("POST", "/api/ai/apply-domain", { design: preview.body.design });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.applyResult.added.contexts, 2);
  const wsName = (await s.call("GET", "/api/workspace")).body.projectName;
  assert.equal(wsName, "Shop", "merging a design must not rename the user's project");
  const again = await s.call("POST", "/api/ai/apply-domain", { design: preview.body.design });
  assert.equal(again.body.applyResult.added.contexts, 0, "re-applying merges instead of duplicating");
  assert.equal(again.body.applyResult.added.elements, 0);
});

test("AI: apply-domain rejects garbage and keeps valid parts of a partly-bad design", async () => {
  assert.equal((await s.call("POST", "/api/ai/apply-domain", { design: { nope: true } })).status, 400);
  const r = await s.call("POST", "/api/ai/apply-domain", {
    design: {
      projectName: "Partial",
      boundedContexts: [{ key: "a", name: "Alpha", purpose: "p", color: "not-a-colour" }],
      elements: [
        { key: "ok", contextKey: "a", kind: "entity", name: "Thing" },
        { key: "bad-kind", contextKey: "a", kind: "spaceship", name: "Nope" },
        { key: "orphan", contextKey: "zzz", kind: "entity", name: "Lost" },
      ],
      relationships: [{ sourceKey: "ok", targetKey: "missing", type: "uses" }],
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.applyResult.added.elements, 1);
  assert.equal(r.body.applyResult.added.relationships, 0);
  assert.equal(r.body.dropped.length, 3);
  const alpha = (await s.call("GET", "/api/bounded-contexts")).body.find((c: { name: string }) => c.name === "Alpha");
  assert.match(alpha.color, /^#[0-9a-f]{6}$/i, "an invalid AI colour is replaced, not stored");
});

test("AI: generate-code produces the sketch bundle offline and refuses an empty model", async () => {
  const r = await s.call("POST", "/api/ai/generate-code", { scope: "full" });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "mock");
  assert.ok(r.body.codegen.files.length > 0);
  assert.ok(r.body.codegen.files.every((f: { path: string }) => !f.path.startsWith("/") && !f.path.includes("..")));
  assert.equal((await s.call("POST", "/api/ai/generate-code", { scope: "galaxy" })).status, 400);

  await s.call("POST", "/api/workspace/reset", { seedSample: false });
  const empty = await s.call("POST", "/api/ai/generate-code", {});
  assert.equal(empty.status, 400);
});

test("the design JSON Schema is served from the same Zod definition", async () => {
  const r = await s.call("GET", "/api/ai/domain-design-schema");
  assert.equal(r.status, 200);
  assert.ok(r.body.properties.boundedContexts);
  assert.ok(r.body.properties.elements.items.properties.kind.enum.includes("command-handler"));
});

test("reset to the sample workspace and back to empty", async () => {
  const sample = await s.call("POST", "/api/workspace/reset", { seedSample: true });
  assert.equal(sample.body.projectName, "Commerce Platform");
  assert.ok(sample.body.nodes.length > 0);
  const empty = await s.call("POST", "/api/workspace/reset", { seedSample: false });
  assert.equal(empty.body.nodes.length, 0);
  assert.equal(empty.body.stats.contexts, 0);
});

test("deleting a context cascades to nodes, relationships and glossary", async () => {
  const c = await s.call("POST", "/api/bounded-contexts", { name: "Temp" });
  const n1 = await s.call("POST", "/api/domain-nodes", { contextId: c.body.id, kind: "entity", name: "A" });
  const n2 = await s.call("POST", "/api/domain-nodes", { contextId: c.body.id, kind: "entity", name: "B" });
  await s.call("POST", "/api/relationships", { sourceId: n1.body.id, targetId: n2.body.id, type: "uses" });
  await s.call("POST", "/api/glossary", { term: "Temp term", contextId: c.body.id });
  assert.equal((await s.call("DELETE", `/api/bounded-contexts/${c.body.id}`)).status, 204);
  const w = (await s.call("GET", "/api/workspace")).body;
  assert.equal(w.nodes.length, 0);
  assert.equal(w.relationships.length, 0);
  assert.equal(w.glossary.length, 0);
});
