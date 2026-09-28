/** Turn discovered database tables into draft domain elements (candidates to refine, not a final model). */
import { normalizeNode, type SchemaSnapshot } from "./model";
import type { Store } from "./store";

export type ImportResult = { created: number; reused: number; relationships: number; skippedTables: string[] };

const tableTag = (key: string) => `table:${key}`;

/** order_lines -> OrderLine, categories -> Category, status -> Status */
export function elementNameFromTable(table: string): string {
  const words = table
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (!words.length) return "Table";
  const last = words[words.length - 1];
  if (/ies$/.test(last)) words[words.length - 1] = `${last.slice(0, -3)}y`;
  else if (/(ss|us|is)$/.test(last)) words[words.length - 1] = last;
  else if (/(sses|xes|ches|shes)$/.test(last)) words[words.length - 1] = last.slice(0, -2);
  else if (/s$/.test(last) && last.length > 3) words[words.length - 1] = last.slice(0, -1);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

export function importSchema(store: Store, snapshot: SchemaSnapshot, contextId: string, only?: string[]): ImportResult {
  const { state } = store;
  const wanted = only ? new Set(only) : null;
  const result: ImportResult = { created: 0, reused: 0, relationships: 0, skippedTables: [] };
  const nodeIdByTable = new Map<string, string>();

  for (const table of snapshot.tables) {
    const key = `${table.schema}.${table.name}`;
    if (wanted && !wanted.has(key)) {
      result.skippedTables.push(key);
      continue;
    }
    const existing = state.nodes.find((n) => n.contextId === contextId && n.tags.includes(tableTag(key)));
    if (existing) {
      nodeIdByTable.set(key, existing.id);
      result.reused += 1;
      continue;
    }
    const keyColumns = table.columns.filter((c) => c.primaryKey).map((c) => c.name);
    const node = normalizeNode({
      id: store.id("node"),
      contextId,
      kind: "entity",
      name: elementNameFromTable(table.name),
      description:
        `Imported from ${key} (${table.columns.length} columns, ~${table.rowEstimate} rows). ` +
        `Key: ${keyColumns.join(", ") || "none"}. Columns: ${table.columns.map((c) => c.name).join(", ")}.`,
      status: "needs-review",
      tags: ["imported", tableTag(key)],
    });
    state.nodes.push(node);
    nodeIdByTable.set(key, node.id);
    result.created += 1;
  }

  for (const fk of snapshot.foreignKeys) {
    const sourceId = nodeIdByTable.get(fk.sourceTable);
    const targetId = nodeIdByTable.get(fk.targetTable);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    if (state.relationships.some((r) => r.sourceId === sourceId && r.targetId === targetId && r.type === "uses")) continue;
    state.relationships.push({ id: store.id("rel"), sourceId, targetId, type: "uses", label: "references", contextId });
    result.relationships += 1;
  }

  store.save();
  return result;
}
