import {
  DEFAULT_PORTS,
  IntrospectionError,
  asBool,
  asCount,
  asText,
  lowerKeys,
  type ConnectionParams,
  type RawSchema,
} from "./schema";

/** Reads the connecting user's default schema (authid) through SYSCAT. */
const COLUMNS_SQL = `
SELECT c.TABSCHEMA AS schema_name, c.TABNAME AS table_name, c.COLNAME AS column_name,
       c.TYPENAME || CASE WHEN c.TYPENAME IN ('VARCHAR', 'CHARACTER', 'CHAR') THEN '(' || RTRIM(CHAR(c.LENGTH)) || ')' ELSE '' END AS data_type,
       CASE WHEN c.NULLS = 'Y' THEN 1 ELSE 0 END AS nullable,
       CASE WHEN c.KEYSEQ IS NOT NULL THEN 1 ELSE 0 END AS primary_key,
       t.CARD AS row_estimate
FROM SYSCAT.COLUMNS c
JOIN SYSCAT.TABLES t ON t.TABSCHEMA = c.TABSCHEMA AND t.TABNAME = c.TABNAME AND t.TYPE = 'T'
WHERE c.TABSCHEMA = ?
ORDER BY c.TABNAME, c.COLNO`;

const FOREIGN_KEYS_SQL = `
SELECT TABSCHEMA AS source_schema, TABNAME AS source_table,
       REFTABSCHEMA AS target_schema, REFTABNAME AS target_table
FROM SYSCAT.REFERENCES
WHERE TABSCHEMA = ?`;

type Db2Connection = {
  query(sql: string, params: string[]): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
};
type IbmDb = { open(conn: string): Promise<Db2Connection> };

/**
 * DB2 needs IBM's native CLI driver, which is a heavy install on some platforms, so `ibm_db`
 * is optional: `npm install ibm_db -w server`.
 */
async function loadDriver(): Promise<IbmDb> {
  const moduleName = "ibm_db";
  try {
    const mod = (await import(moduleName)) as { default?: IbmDb } & IbmDb;
    return mod.default ?? mod;
  } catch {
    throw new IntrospectionError(
      "DB2 support needs the optional 'ibm_db' package. Install it with: npm install ibm_db -w server",
      "unsupported",
    );
  }
}

export async function introspectDb2(params: ConnectionParams): Promise<RawSchema> {
  const ibmdb = await loadDriver();
  const schema = params.username.toUpperCase();
  const dsn = [
    `DATABASE=${params.database}`,
    `HOSTNAME=${params.host}`,
    `PORT=${params.port ?? DEFAULT_PORTS.db2}`,
    "PROTOCOL=TCPIP",
    `UID=${params.username}`,
    `PWD=${params.password}`,
    "CONNECTTIMEOUT=10",
  ].join(";");
  const connection = await ibmdb.open(dsn);
  try {
    const columns = await connection.query(COLUMNS_SQL, [schema]);
    const fks = await connection.query(FOREIGN_KEYS_SQL, [schema]);
    return {
      columns: columns.map((raw) => {
        const r = lowerKeys(raw);
        return {
          schema: asText(r.schema_name).trim(),
          table: asText(r.table_name).trim(),
          column: asText(r.column_name).trim(),
          type: asText(r.data_type).trim(),
          nullable: asBool(r.nullable),
          primaryKey: asBool(r.primary_key),
          rowEstimate: asCount(r.row_estimate),
        };
      }),
      foreignKeys: fks.map((raw) => {
        const r = lowerKeys(raw);
        return {
          sourceSchema: asText(r.source_schema).trim(),
          sourceTable: asText(r.source_table).trim(),
          targetSchema: asText(r.target_schema).trim(),
          targetTable: asText(r.target_table).trim(),
        };
      }),
    };
  } finally {
    await connection.close().catch(() => undefined);
  }
}
