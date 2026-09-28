import type { Connection, SchemaSnapshot } from "../domain/model";
import { introspectDb2 } from "./db2";
import { introspectMysql } from "./mysql";
import { introspectOracle } from "./oracle";
import { introspectPostgres } from "./postgres";
import { IntrospectionError, buildSnapshot, type ConnectionParams, type RawSchema } from "./schema";

export { IntrospectionError } from "./schema";

const TIMEOUT_MS = 30_000;

const drivers: Record<Connection["engine"], (params: ConnectionParams) => Promise<RawSchema>> = {
  postgres: introspectPostgres,
  mysql: introspectMysql,
  oracle: introspectOracle,
  db2: introspectDb2,
};

/** Connect with the stored profile + password and discover tables, columns, keys and FKs. */
export async function introspectConnection(connection: Connection, password: string): Promise<SchemaSnapshot> {
  const params: ConnectionParams = {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    password,
  };

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IntrospectionError(`Timed out after ${TIMEOUT_MS / 1000}s`, "timeout")), TIMEOUT_MS);
  });

  try {
    const raw = await Promise.race([drivers[connection.engine](params), timeout]);
    return buildSnapshot(connection.id, raw);
  } catch (err) {
    if (err instanceof IntrospectionError) throw err;
    // Driver messages can echo connection details; make sure the password never leaves this process.
    const message = (err instanceof Error ? err.message : String(err)).split(password).join("***");
    throw new IntrospectionError(message, "connect");
  } finally {
    clearTimeout(timer);
  }
}
