import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tempDir, tempStore } from "./helpers";

test("first run starts with a blank workspace", () => {
  const store = tempStore();
  assert.equal(store.state.projectName, "Untitled workspace");
  assert.equal(store.state.contexts.length, 0);
  assert.equal(store.state.nodes.length, 0);
  assert.equal(store.state.relationships.length, 0);
  assert.equal(store.state.glossary.length, 0);
  assert.equal(store.state.connections.length, 0);
});

test("the sample workspace is opt-in, ships unplaced, and carries derived node fields", () => {
  const store = tempStore({ seedSample: true });
  assert.equal(store.state.projectName, "Commerce Platform");
  assert.ok(store.state.nodes.length > 5);
  assert.ok(store.state.nodes.every((n) => n.x === null && n.y === null), "the client lays the sample out");
  assert.ok(store.state.contexts.every((c) => c.x === null && c.y === null));
  assert.ok(store.state.nodes.every((n) => typeof n.cqrsSide === "string"));
  assert.equal(store.state.connections.length, 0, "no fake connection is seeded");
});

test("reset can load the sample or clear back to blank", () => {
  const store = tempStore();
  store.reset(true);
  assert.ok(store.state.nodes.length > 0);
  store.reset(false);
  assert.equal(store.state.nodes.length, 0);
  assert.equal(store.state.projectName, "Untitled workspace");
});

test("workspace survives a restart and never stores passwords", () => {
  const dir = tempDir();
  const first = tempStore({ dir, seedSample: false });
  const id = first.id("context");
  first.state.contexts.push({ id, name: "Billing", purpose: "Invoices", color: "#112233", nodeCount: 0, relationshipCount: 0, x: null, y: null });
  first.state.connections.push({
    id: "c1", name: "db", engine: "postgres", host: "h", port: 5432, database: "d", username: "u",
    status: "pending", tableCount: 0, lastIntrospectedAt: null, lastError: null,
  });
  first.passwords.set("c1", "hunter2-secret");
  first.state.projectName = "Renamed";
  first.save();

  const raw = fs.readFileSync(path.join(dir, "workspace.json"), "utf8");
  assert.ok(!raw.includes("hunter2-secret"), "password must not reach disk");

  const second = tempStore({ dir, seedSample: false });
  assert.equal(second.state.projectName, "Renamed");
  assert.equal(second.passwords.size, 0);
  assert.equal(second.state.contexts[0].name, "Billing");
  assert.equal(second.passwords.size, 0, "credentials are session-only");
});

test("a corrupt workspace.json is set aside, not overwritten", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "workspace.json"), "{ this is not json", "utf8");
  const store = tempStore({ dir });
  assert.equal(store.state.projectName, "Untitled workspace");
  const backups = fs.readdirSync(dir).filter((f) => f.includes(".corrupt-"));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), "utf8"), "{ this is not json");
});

test("legacy files (nodes without newer fields, connections without port) still load", () => {
  const dir = tempDir();
  fs.writeFileSync(
    path.join(dir, "workspace.json"),
    JSON.stringify({
      projectName: "Legacy",
      contexts: [{ id: "c", name: "Ctx", purpose: "", color: "#aabbcc", nodeCount: 0, relationshipCount: 0 }],
      nodes: [{ id: "n", contextId: "c", kind: "command", name: "Do", description: "", status: "draft", x: 1, y: 2, tags: [], methods: [] }],
      relationships: [],
      glossary: [],
      connections: [{ id: "k", name: "old", engine: "mysql", host: "h", database: "d", status: "connected", tableCount: 3, lastIntrospectedAt: null }],
    }),
  );
  const store = tempStore({ dir });
  assert.equal(store.state.nodes[0].cqrsSide, "command");
  assert.equal(store.state.nodes[0].eventVersion, "1.0.0");
  assert.equal(store.state.connections[0].port, null);
});

test("positions round-trip, and pre-pixel (percentage) layouts are discarded so the client re-lays them out", () => {
  const dir = tempDir();
  const first = tempStore({ dir });
  first.state.contexts.push({ id: "c", name: "C", purpose: "", color: "#112233", nodeCount: 0, relationshipCount: 0, x: 320, y: 64 });
  first.state.nodes.push({
    id: "n", contextId: "c", kind: "entity", name: "N", description: "", status: "draft", x: 480, y: 96, tags: [], methods: [],
    invariants: [], eventVersion: "1.0.0", eventPayloadSchema: "", eventCompatibility: "backward", sagaStyle: "none", cqrsSide: "none",
  });
  first.save();
  const again = tempStore({ dir });
  assert.deepEqual([again.state.nodes[0].x, again.state.nodes[0].y], [480, 96]);
  assert.deepEqual([again.state.contexts[0].x, again.state.contexts[0].y], [320, 64]);

  // An old file: no layoutVersion, coordinates were percentages.
  const legacyDir = tempDir();
  fs.writeFileSync(path.join(legacyDir, "workspace.json"), JSON.stringify({
    projectName: "Old",
    contexts: [{ id: "c", name: "C", purpose: "", color: "#112233", nodeCount: 0, relationshipCount: 0 }],
    nodes: [{ id: "n", contextId: "c", kind: "entity", name: "N", description: "", status: "draft", x: 42, y: 17, tags: [], methods: [] }],
    relationships: [], glossary: [], connections: [],
  }));
  const legacy = tempStore({ dir: legacyDir });
  assert.deepEqual([legacy.state.nodes[0].x, legacy.state.nodes[0].y], [null, null]);
});

test("ids never collide", () => {
  const store = tempStore({ seedSample: false });
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) {
    const id = store.id("x");
    assert.ok(!seen.has(id));
    seen.add(id);
    store.state.glossary.push({ id, term: `t${i}`, definition: "", contextId: null, aliases: [], relatedNodeIds: [] });
  }
});
