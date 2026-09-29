import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTEXT_MAP_TYPES,
  GENERALIZATION_CONSTRAINTS,
  GENERALIZATION_CONSTRAINT_META,
  MARKER_GEOMETRY,
  MARKER_SHAPES,
  inferRelation,
  isStrategicType,
  isStructuralType,
  styleFor,
} from "../src/diagram/relations";

test("strategic (context-mapping) types are exactly the eight DDD context-map patterns", () => {
  assert.deepEqual(
    [...CONTEXT_MAP_TYPES].sort(),
    ["anti-corruption", "conformist", "customer-supplier", "open-host-service", "partnership", "published-language", "separate-ways", "shared-kernel"],
  );
  for (const t of CONTEXT_MAP_TYPES) assert.equal(isStrategicType(t), true, t);
  for (const t of ["uses", "composition", "publishes", "triggers", "handles"]) assert.equal(isStrategicType(t), false, t);
});

test("composition/aggregation/owns are the structural types DDD discourages across a context boundary", () => {
  for (const t of ["composition", "aggregation", "owns"]) assert.equal(isStructuralType(t), true, t);
  for (const t of ["uses", "customer-supplier", "publishes", "invokes"]) assert.equal(isStructuralType(t), false, t);
});

test("inferRelation: aggregate <-> aggregate-root is composition, oriented aggregate -> root", () => {
  assert.deepEqual(inferRelation("aggregate", "aggregate-root"), { type: "composition", swap: false });
  assert.deepEqual(inferRelation("aggregate-root", "aggregate"), { type: "composition", swap: true });
});

test("inferRelation: command -> event is triggers; event -> policy is reacts-to, reversed to policy -> event", () => {
  assert.deepEqual(inferRelation("command", "domain-event"), { type: "triggers", swap: false });
  assert.deepEqual(inferRelation("domain-event", "policy"), { type: "reacts-to", swap: true });
  assert.deepEqual(inferRelation("policy", "domain-event"), { type: "reacts-to", swap: false });
});

test("inferRelation: anything -> resource is exposed-by (the resource is exposed by the other element)", () => {
  assert.deepEqual(inferRelation("service", "resource"), { type: "exposed-by", swap: false });
  assert.deepEqual(inferRelation("resource", "service"), { type: "exposed-by", swap: true });
});

test("generalization is a solid line; specialization/realization is dashed — they must look different", () => {
  const gen = styleFor("generalization");
  const spec = styleFor("specialization");
  assert.equal(gen.end, "triangle");
  assert.equal(spec.end, "triangle", "same hollow-triangle arrowhead as generalization");
  assert.equal(gen.dash, undefined, "generalization is a solid line");
  assert.ok(spec.dash, "specialization/realization is dashed, so it reads as a different relationship");
});

test("every marker shape referenced by styleFor has real, non-degenerate geometry", () => {
  for (const shape of MARKER_SHAPES) {
    const g = MARKER_GEOMETRY[shape];
    assert.ok(g.w > 0 && g.h > 0, `${shape} has zero size`);
    assert.match(g.path, /^M/, `${shape} path should start with a moveto`);
  }
});

test("generalization-set constraints: AND/OR/XOR each have a label and a hint", () => {
  assert.deepEqual([...GENERALIZATION_CONSTRAINTS].sort(), ["and", "or", "xor"]);
  for (const c of GENERALIZATION_CONSTRAINTS) {
    assert.ok(GENERALIZATION_CONSTRAINT_META[c].label.length > 0, c);
    assert.ok(GENERALIZATION_CONSTRAINT_META[c].hint.length > 0, c);
  }
});

test("inferRelation never returns a strategic (context-map) type — those need two contexts, not two elements", () => {
  const kinds = ["aggregate", "aggregate-root", "entity", "value-object", "repository", "service", "resource", "domain-event", "command", "policy", "actor", "saga", "anti-corruption-layer"];
  for (const a of kinds) {
    for (const b of kinds) {
      const { type } = inferRelation(a, b);
      assert.equal(isStrategicType(type), false, `${a} -> ${b} inferred ${type}`);
    }
  }
});
