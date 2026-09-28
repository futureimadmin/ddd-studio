import { DEFAULT_PORTS, asBool, asCount, asText, lowerKeys, type ConnectionParams, type RawSchema } from "./schema";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

const COLUMNS_SQL = `
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       NOT a.attnotnull AS nullable,
       EXISTS (
         SELECT 1 FROM pg_index i
         WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey)
       ) AS primary_key,
       GREATEST(c.reltuples, 0)::bigint AS row_estimate
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\\_toast%'
  AND n.nspname NOT LIKE 'pg\\_temp%'
ORDER BY n.nspname, c.relname, a.attnum`;

const FOREIGN_KEYS_SQL = `
SELECT ns.nspname AS source_schema, cl.relname AS source_table,
       nt.nspname AS target_schema, ct.relname AS target_table
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = cl.relnamespace
JOIN pg_class ct ON ct.oid = con.confrelid
JOIN pg_namespace nt ON nt.oid = ct.relnamespace
WHERE con.contype = 'f'
  AND ns.nspname NOT IN ('pg_catalog', 'information_schema')`;

/** Reads the schema through any `query(sql)` function — a live client, or PGlite in tests. */
export async function readPostgresSchema(query: QueryFn): Promise<RawSchema> {
  const [columns, fks] = await Promise.all([query(COLUMNS_SQL), query(FOREIGN_KEYS_SQL)]);
  return {
    columns: columns.map((raw) => {
      const r = lowerKeys(raw);
      return {
        schema: asText(r.schema_name),
        table: asText(r.table_name),
        column: asText(r.column_name),
        type: asText(r.data_type),
        nullable: asBool(r.nullable),
        primaryKey: asBool(r.primary_key),
        rowEstimate: asCount(r.row_estimate),
      };
    }),
    foreignKeys: fks.map((raw) => {
      const r = lowerKeys(raw);
      return {
        sourceSchema: asText(r.source_schema),
        sourceTable: asText(r.source_table),
        targetSchema: asText(r.target_schema),
        targetTable: asText(r.target_table),
      };
    }),
  };
}

export async function introspectPostgres(params: ConnectionParams): Promise<RawSchema> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: params.host,
    port: params.port ?? DEFAULT_PORTS.postgres,
    database: params.database,
    user: params.username,
    password: params.password,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
  });
  await client.connect();
  try {
    // Read-only by construction: the tool only ever issues catalog SELECTs.
    await client.query("SET default_transaction_read_only = on");
    return await readPostgresSchema(async (sql) => (await client.query(sql)).rows);
  } finally {
    await client.end().catch(() => undefined);
  }
}
