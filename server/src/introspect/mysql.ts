import { DEFAULT_PORTS, asBool, asCount, asText, lowerKeys, type ConnectionParams, type RawSchema } from "./schema";

const COLUMNS_SQL = `
SELECT c.TABLE_SCHEMA AS schema_name, c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name,
       c.COLUMN_TYPE AS data_type, (c.IS_NULLABLE = 'YES') AS nullable,
       (c.COLUMN_KEY = 'PRI') AS primary_key, t.TABLE_ROWS AS row_estimate
FROM information_schema.COLUMNS c
JOIN information_schema.TABLES t
  ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
WHERE c.TABLE_SCHEMA = ?
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`;

const FOREIGN_KEYS_SQL = `
SELECT TABLE_SCHEMA AS source_schema, TABLE_NAME AS source_table,
       REFERENCED_TABLE_SCHEMA AS target_schema, REFERENCED_TABLE_NAME AS target_table
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`;

export async function introspectMysql(params: ConnectionParams): Promise<RawSchema> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: params.host,
    port: params.port ?? DEFAULT_PORTS.mysql,
    database: params.database,
    user: params.username,
    password: params.password,
    connectTimeout: 10_000,
  });
  try {
    const [columns] = await connection.query({ sql: COLUMNS_SQL, values: [params.database], rowsAsArray: false });
    const [fks] = await connection.query({ sql: FOREIGN_KEYS_SQL, values: [params.database], rowsAsArray: false });
    return {
      columns: (columns as Array<Record<string, unknown>>).map((raw) => {
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
      foreignKeys: (fks as Array<Record<string, unknown>>).map((raw) => {
        const r = lowerKeys(raw);
        return {
          sourceSchema: asText(r.source_schema),
          sourceTable: asText(r.source_table),
          targetSchema: asText(r.target_schema),
          targetTable: asText(r.target_table),
        };
      }),
    };
  } finally {
    await connection.end().catch(() => undefined);
  }
}
