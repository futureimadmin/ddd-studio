import { DEFAULT_PORTS, asBool, asCount, asText, lowerKeys, type ConnectionParams, type RawSchema } from "./schema";

/** Reads the connecting user's own schema (USER_* views). `database` is the service name. */
const COLUMNS_SQL = `
SELECT c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name,
       c.DATA_TYPE || CASE
         WHEN c.DATA_TYPE IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR') THEN '(' || c.CHAR_LENGTH || ')'
         WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL THEN '(' || c.DATA_PRECISION || ',' || NVL(c.DATA_SCALE, 0) || ')'
         ELSE '' END AS data_type,
       CASE WHEN c.NULLABLE = 'Y' THEN 1 ELSE 0 END AS nullable,
       CASE WHEN EXISTS (
         SELECT 1 FROM USER_CONS_COLUMNS cc
         JOIN USER_CONSTRAINTS k ON k.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
         WHERE k.CONSTRAINT_TYPE = 'P' AND cc.TABLE_NAME = c.TABLE_NAME AND cc.COLUMN_NAME = c.COLUMN_NAME
       ) THEN 1 ELSE 0 END AS primary_key,
       NVL(t.NUM_ROWS, 0) AS row_estimate
FROM USER_TAB_COLUMNS c
JOIN USER_TABLES t ON t.TABLE_NAME = c.TABLE_NAME
ORDER BY c.TABLE_NAME, c.COLUMN_ID`;

const FOREIGN_KEYS_SQL = `
SELECT a.TABLE_NAME AS source_table, b.TABLE_NAME AS target_table
FROM USER_CONSTRAINTS a
JOIN USER_CONSTRAINTS b ON a.R_CONSTRAINT_NAME = b.CONSTRAINT_NAME
WHERE a.CONSTRAINT_TYPE = 'R'`;

export async function introspectOracle(params: ConnectionParams): Promise<RawSchema> {
  const { default: oracledb } = await import("oracledb");
  const schema = params.username.toUpperCase();
  // Thin mode (the default) is pure JavaScript: no Oracle Instant Client needed.
  const connection = await oracledb.getConnection({
    user: params.username,
    password: params.password,
    connectString: `${params.host}:${params.port ?? DEFAULT_PORTS.oracle}/${params.database}`,
  });
  try {
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const columns = await connection.execute<Record<string, unknown>>(COLUMNS_SQL, [], opts);
    const fks = await connection.execute<Record<string, unknown>>(FOREIGN_KEYS_SQL, [], opts);
    return {
      columns: (columns.rows ?? []).map((raw) => {
        const r = lowerKeys(raw);
        return {
          schema,
          table: asText(r.table_name),
          column: asText(r.column_name),
          type: asText(r.data_type),
          nullable: asBool(r.nullable),
          primaryKey: asBool(r.primary_key),
          rowEstimate: asCount(r.row_estimate),
        };
      }),
      foreignKeys: (fks.rows ?? []).map((raw) => {
        const r = lowerKeys(raw);
        return { sourceSchema: schema, sourceTable: asText(r.source_table), targetSchema: schema, targetTable: asText(r.target_table) };
      }),
    };
  } finally {
    await connection.close().catch(() => undefined);
  }
}
