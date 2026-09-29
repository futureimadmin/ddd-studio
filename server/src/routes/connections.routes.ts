/** Database connection profiles, schema discovery, and importing tables as draft elements. */
import { Router, type IRouter } from "express";
import { importSchema } from "../domain/import-schema";
import {
  ConnectionInputSchema,
  ImportSchemaInputSchema,
  IntrospectInputSchema,
  type Connection,
} from "../domain/model";
import type { Store } from "../domain/store";
import { IntrospectionError, introspectConnection } from "../introspect";
import { HttpError, param, parse } from "./http";

export function connectionRoutes(store: Store): IRouter {
  const router = Router();
  const { state } = store;

  const find = (id: string): Connection => {
    const connection = state.connections.find((c) => c.id === id);
    if (!connection) throw new HttpError(404, "Schema connection not found");
    return connection;
  };

  router.get("/schema-connections", (_req, res) => {
    res.json(state.connections);
  });

  router.post("/schema-connections", (req, res) => {
    const { password, port, ...profile } = parse(ConnectionInputSchema, req.body);
    const connection: Connection = {
      id: store.id("connection"),
      ...profile,
      port: port ?? null,
      status: "pending",
      tableCount: 0,
      lastIntrospectedAt: null,
      lastError: null,
    };
    state.connections.push(connection);
    // The password is kept in memory for this server session only — never written to workspace.json.
    store.passwords.set(connection.id, password);
    store.save();
    res.status(201).json(connection);
  });

  router.delete("/schema-connections/:id", (req, res) => {
    const connection = find(param(req.params.id));
    state.connections = state.connections.filter((c) => c.id !== connection.id);
    store.passwords.delete(connection.id);
    store.snapshots.delete(connection.id);
    // A Physical entity that pointed at a table on this connection goes back to Logical rather than
    // keeping a dangling reference.
    for (const node of state.nodes) {
      if (node.physicalTable?.connectionId === connection.id) {
        node.representation = "logical";
        node.physicalTable = null;
      }
    }
    store.save();
    res.status(204).send();
  });

  router.post("/schema-connections/:id/introspect", async (req, res) => {
    const connection = find(param(req.params.id));
    const { password: supplied, username } = parse(IntrospectInputSchema, req.body);
    if (username) connection.username = username;
    const password = supplied ?? store.passwords.get(connection.id);
    if (!password || !connection.username) {
      throw new HttpError(409, "The server does not hold the credentials for this connection. Enter them to continue.", {
        code: "credentials_required",
      });
    }
    try {
      const snapshot = await introspectConnection(connection, password);
      store.passwords.set(connection.id, password);
      store.snapshots.set(connection.id, snapshot);
      connection.status = "connected";
      connection.tableCount = snapshot.tables.length;
      connection.lastIntrospectedAt = snapshot.generatedAt;
      connection.lastError = null;
      store.save();
      res.json(snapshot);
    } catch (err) {
      if (err instanceof IntrospectionError && err.code === "unsupported") throw err;
      connection.status = "error";
      connection.lastError = err instanceof Error ? err.message : "Introspection failed";
      store.save();
      throw err;
    }
  });

  /** The last discovery result for this server session (lets the UI restore its preview). */
  router.get("/schema-connections/:id/snapshot", (req, res) => {
    const connection = find(param(req.params.id));
    // `null` (not 404): "nothing discovered yet" is a normal state, not an error.
    res.json(store.snapshots.get(connection.id) ?? null);
  });

  router.post("/schema-connections/:id/import", (req, res) => {
    const connection = find(param(req.params.id));
    const input = parse(ImportSchemaInputSchema, req.body);
    const snapshot = store.snapshots.get(connection.id);
    if (!snapshot) throw new HttpError(409, "Introspect this connection before importing its tables");
    if (!state.contexts.some((c) => c.id === input.contextId)) throw new HttpError(400, "Bounded context not found");
    res.status(201).json(importSchema(store, snapshot, input.contextId, input.tables));
  });

  return router;
}
