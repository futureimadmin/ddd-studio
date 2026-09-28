import assert from "node:assert/strict";
import { test } from "node:test";
import { elementNameFromTable, importSchema } from "../src/domain/import-schema";
import { readPostgresSchema } from "../src/introspect/postgres";
import { buildSnapshot } from "../src/introspect/schema";
import { tempStore } from "./helpers";

test("PostgreSQL introspection SQL works against a real Postgres (PGlite)", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE customers (id uuid PRIMARY KEY, email varchar(120) NOT NULL, nickname text);
    CREATE TABLE orders (
      id serial PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id),
      total numeric(10,2) NOT NULL
    );
    CREATE TABLE order_lines (
      order_id integer NOT NULL REFERENCES orders(id),
      line_no integer NOT NULL,
      sku varchar(64) NOT NULL,
      PRIMARY KEY (order_id, line_no)
    );
    CREATE VIEW recent_orders AS SELECT * FROM orders;
  `);

  const raw = await readPostgresSchema(async (sql) => (await db.query(sql)).rows as Array<Record<string, unknown>>);
  const snapshot = buildSnapshot("conn-1", raw);
  await db.close();

  assert.deepEqual(snapshot.tables.map((t) => `${t.schema}.${t.name}`).sort(), [
    "public.customers",
    "public.order_lines",
    "public.orders",
  ], "views and system schemas are excluded");

  const customers = snapshot.tables.find((t) => t.name === "customers")!;
  assert.deepEqual(customers.columns.map((c) => c.name), ["id", "email", "nickname"], "column order is preserved");
  assert.equal(customers.columns[0].primaryKey, true);
  assert.equal(customers.columns[1].nullable, false);
  assert.equal(customers.columns[2].nullable, true);
  assert.equal(customers.columns[1].type, "character varying(120)");

  const lines = snapshot.tables.find((t) => t.name === "order_lines")!;
  assert.deepEqual(lines.columns.filter((c) => c.primaryKey).map((c) => c.name), ["order_id", "line_no"], "composite keys");

  assert.deepEqual(
    snapshot.foreignKeys.map((f) => `${f.sourceTable}->${f.targetTable}`).sort(),
    ["public.order_lines->public.orders", "public.orders->public.customers"],
  );
});

test("buildSnapshot collapses composite foreign keys and ignores dangling ones", () => {
  const col = (table: string) => ({ schema: "s", table, column: "id", type: "int", nullable: false, primaryKey: true, rowEstimate: 0 });
  const snap = buildSnapshot("c", {
    columns: [col("a"), col("b")],
    foreignKeys: [
      { sourceSchema: "s", sourceTable: "a", targetSchema: "s", targetTable: "b" },
      { sourceSchema: "s", sourceTable: "a", targetSchema: "s", targetTable: "b" },
      { sourceSchema: "s", sourceTable: "a", targetSchema: "s", targetTable: "ghost" },
    ],
  });
  assert.equal(snap.foreignKeys.length, 1);
});

test("table names become element names", () => {
  const cases: Record<string, string> = {
    orders: "Order",
    order_lines: "OrderLine",
    categories: "Category",
    status: "Status",
    address: "Address",
    classes: "Class",
    boxes: "Box",
    CustomerAccounts: "CustomerAccount",
    "": "Table",
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(elementNameFromTable(input), expected, input);
});

test("importing a discovered schema creates draft elements and FK relationships, idempotently", () => {
  const store = tempStore({ seedSample: false });
  store.state.contexts.push({ id: "ctx", name: "Sales", purpose: "", color: "#112233", nodeCount: 0, relationshipCount: 0, x: null, y: null });
  const snapshot = buildSnapshot("c", {
    columns: [
      { schema: "public", table: "orders", column: "id", type: "int", nullable: false, primaryKey: true, rowEstimate: 10 },
      { schema: "public", table: "customers", column: "id", type: "int", nullable: false, primaryKey: true, rowEstimate: 5 },
      { schema: "public", table: "audit_log", column: "id", type: "int", nullable: false, primaryKey: true, rowEstimate: 99 },
    ],
    foreignKeys: [{ sourceSchema: "public", sourceTable: "orders", targetSchema: "public", targetTable: "customers" }],
  });

  const first = importSchema(store, snapshot, "ctx", ["public.orders", "public.customers"]);
  assert.deepEqual([first.created, first.reused, first.relationships, first.skippedTables], [2, 0, 1, ["public.audit_log"]]);
  const order = store.state.nodes.find((n) => n.name === "Order")!;
  assert.equal(order.kind, "entity");
  assert.equal(order.status, "needs-review");
  assert.ok(order.tags.includes("table:public.orders"));

  const second = importSchema(store, snapshot, "ctx");
  assert.deepEqual([second.created, second.reused, second.relationships], [1, 2, 0], "only the newly selected table is created");
  assert.equal(store.state.relationships.length, 1);
});
