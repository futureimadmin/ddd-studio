import "./env";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDomainDesign } from "../src/ai/design-schema";

const base = {
  projectName: "P",
  boundedContexts: [
    { key: "a", name: "A", purpose: "", color: "#111111" },
    { key: "b", name: "B", purpose: "", color: "#222222" },
  ],
  elements: [
    { key: "a-agg", contextKey: "a", kind: "aggregate", name: "AAgg" },
    { key: "a-root", contextKey: "a", kind: "aggregate-root", name: "ARoot" },
    { key: "b-svc", contextKey: "b", kind: "service", name: "BSvc" },
  ],
};

test("strategic relationships may name contexts; they resolve to a representative element", () => {
  const { design, dropped } = parseDomainDesign({
    ...base,
    relationships: [
      { sourceKey: "a", targetKey: "b", type: "customer-supplier", label: "A is customer" },
      { sourceKey: "b", targetKey: "a", type: "anti-corruption" },
    ],
  });
  assert.deepEqual(dropped, []);
  assert.deepEqual(
    design.relationships!.map((r) => [r.sourceKey, r.targetKey]),
    [["a-root", "b-svc"], ["b-svc", "a-root"]],
    "prefers an aggregate-root, falls back to any element",
  );
});

test("non-strategic relationships between contexts are still rejected, and reported", () => {
  const { design, dropped } = parseDomainDesign({
    ...base,
    relationships: [
      { sourceKey: "a", targetKey: "b", type: "uses" },
      { sourceKey: "a-agg", targetKey: "a-root", type: "composition" },
      { sourceKey: "a-agg", targetKey: "nope", type: "uses" },
      { sourceKey: "a-agg", targetKey: "a-agg", type: "uses" },
    ],
  });
  assert.equal(design.relationships!.length, 1);
  assert.equal(dropped.length, 3);
});

test("a document without contexts is an error, not an empty success", () => {
  assert.throws(() => parseDomainDesign({ projectName: "P", boundedContexts: [{ key: 1 }] }), /no valid bounded contexts/);
  assert.throws(() => parseDomainDesign({ nope: true }), /not a valid document/);
});
