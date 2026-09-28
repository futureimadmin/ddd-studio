import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, type Rect } from "../src/diagram/router";
import { MIN_GAP, collides, findFreeSlot, planFullLayout, planPlacement, type PlaceItem } from "../src/diagram/layout";

const SIZE = { w: 192, h: 112 };
const rectFor = (id: string, p: { x: number; y: number }): Rect => ({ id, ...p, ...SIZE });

function noOverlap(rects: Rect[], gap: number) {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.equal(collides(rects[i], rects[j], gap), false, `${rects[i].id} overlaps ${rects[j].id}`);
    }
  }
}

function contexts(count: number, per: number) {
  const items: PlaceItem[] = [];
  const edges: { source: string; target: string }[] = [];
  for (let c = 0; c < count; c += 1) {
    for (let i = 0; i < per; i += 1) items.push({ id: `c${c}n${i}`, group: `g${c}`, x: null, y: null });
    for (let i = 1; i < per; i += 2) edges.push({ source: `c${c}n0`, target: `c${c}n${i}` });
  }
  for (let c = 1; c < count; c += 1) edges.push({ source: `c${c - 1}n0`, target: `c${c}n0` });
  return { items, edges };
}

test("a blank board is laid out in full, keeping room for lines between elements", () => {
  const { items, edges } = contexts(3, 6);
  const plan = planPlacement({ mode: "designer", items, edges, size: SIZE });
  assert.equal(plan.size, items.length);
  noOverlap([...plan].map(([id, p]) => rectFor(id, p)), MIN_GAP - 1);
});

test("nothing is planned when everything is already placed", () => {
  const items: PlaceItem[] = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 400, y: 0 }];
  assert.equal(planPlacement({ mode: "designer", items, edges: [], size: SIZE }).size, 0);
});

test("a new element in an existing context lands beside its context, and nothing already placed moves", () => {
  const placed: PlaceItem[] = [
    { id: "a", group: "g", x: 64, y: 64 },
    { id: "b", group: "g", x: 384, y: 64 },
    { id: "other", group: "h", x: 2000, y: 64 },
  ];
  const plan = planPlacement({ mode: "designer", items: [...placed, { id: "new", group: "g", x: null, y: null }], edges: [], size: SIZE });
  assert.deepEqual([...plan.keys()], ["new"], "only the new element gets a position");
  const spot = plan.get("new")!;
  for (const p of placed) assert.equal(collides(rectFor("new", spot), rectFor(p.id, { x: p.x!, y: p.y! }), MIN_GAP), false);
  assert.ok(spot.x < 1200, "stays near its own context, not near the other one");
});

test("a whole new context is laid out as a block to the right of the existing diagram", () => {
  const placed: PlaceItem[] = [{ id: "a", group: "g", x: 64, y: 64 }, { id: "b", group: "g", x: 400, y: 64 }];
  const fresh: PlaceItem[] = ["n1", "n2", "n3"].map((id) => ({ id, group: "new", x: null, y: null }));
  const plan = planPlacement({ mode: "designer", items: [...placed, ...fresh], edges: [{ source: "n1", target: "n2" }], size: SIZE });
  assert.equal(plan.size, 3);
  for (const p of plan.values()) assert.ok(p.x >= 400 + SIZE.w + 4 * GRID, "clear of the existing elements");
  noOverlap([...plan].map(([id, p]) => rectFor(id, p)), GRID);
});

test("on the storm board a new sticky is placed next to what it is linked to", () => {
  const placed: PlaceItem[] = [{ id: "cmd", x: 64, y: 64 }, { id: "far", x: 1600, y: 800 }];
  const plan = planPlacement({
    mode: "storm",
    items: [...placed, { id: "evt", x: null, y: null }],
    edges: [{ source: "cmd", target: "evt" }],
    size: { w: 160, h: 96 },
  });
  const spot = plan.get("evt")!;
  assert.ok(Math.hypot(spot.x - 64, spot.y - 64) < 700, "close to the command it is linked to");
});

test("findFreeSlot honours an extra rule, e.g. keeping two context boundaries apart", () => {
  const others: Rect[] = [{ id: "a", x: 0, y: 0, ...SIZE }];
  // Refuse anything left of x = 1000, even though it is free.
  const spot = findFreeSlot(SIZE, { x: 400, y: 0 }, others, MIN_GAP, (x) => x >= 1000);
  assert.ok(spot.x >= 1000, `expected x >= 1000, got ${spot.x}`);
  assert.equal(collides({ id: "n", ...spot, ...SIZE }, others[0], MIN_GAP), false);
});

test("planFullLayout on an empty list is a no-op", () => {
  assert.equal(planFullLayout("designer", [], [], SIZE).size, 0);
});
