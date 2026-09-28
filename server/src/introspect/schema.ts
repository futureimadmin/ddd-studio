import type { SchemaSnapshot } from "../domain/model";

/** Engine-neutral rows every driver produces; `buildSnapshot` turns them into a SchemaSnapshot. */
export type RawSchema = {
  columns: Array<{
    schema: string;
    table: string;
    column: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    /** Planner row estimate for the column's table (repeated per column). */
    rowEstimate: number;
  }>;
  foreignKeys: Array<{ sourceSchema: string; sourceTable: string; targetSchema: string; targetTable: string }>;
};

export type ConnectionParams = {
  host: string;
  port: number | null;
  database: string;
  username: string;
  password: string;
};

export class IntrospectionError extends Error {
  constructor(
    message: string,
    readonly code: "connect" | "query" | "unsupported" | "timeout",
  ) {
    super(message);
    this.name = "IntrospectionError";
  }
}

export const DEFAULT_PORTS = { postgres: 5432, mysql: 3306, oracle: 1521, db2: 50000 } as const;

/** Rows come back with driver-specific casing/types (bigint strings, 1/0 flags, upper-case keys). */
export function lowerKeys(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
}
export const asBool = (v: unknown) => v === true || v === 1 || v === "1" || v === "t" || v === "Y";
export const asCount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function buildSnapshot(connectionId: string, raw: RawSchema): SchemaSnapshot {
  const tables = new Map<string, SchemaSnapshot["tables"][number]>();
  for (const col of raw.columns) {
    const key = `${col.schema}.${col.table}`;
    let table = tables.get(key);
    if (!table) {
      table = { name: col.table, schema: col.schema, rowEstimate: col.rowEstimate, columns: [] };
      tables.set(key, table);
    }
    table.columns.push({ name: col.column, type: col.type, nullable: col.nullable, primaryKey: col.primaryKey });
  }

  const seen = new Set<string>();
  const foreignKeys: SchemaSnapshot["foreignKeys"] = [];
  for (const fk of raw.foreignKeys) {
    const sourceTable = `${fk.sourceSchema}.${fk.sourceTable}`;
    const targetTable = `${fk.targetSchema}.${fk.targetTable}`;
    const key = `${sourceTable}->${targetTable}`;
    // Composite keys produce one row per column; a table pair is one relationship.
    if (seen.has(key) || !tables.has(sourceTable) || !tables.has(targetTable)) continue;
    seen.add(key);
    foreignKeys.push({ sourceTable, targetTable });
  }

  return { connectionId, tables: [...tables.values()], foreignKeys, generatedAt: new Date().toISOString() };
}
