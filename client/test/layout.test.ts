import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOUNDARY_PAD,
  BOUNDARY_TOP,
  boundsOf,
  collides,
  findFreeSlot,
  layoutGraph,
  layoutGrouped,
  placeAmong,
  type GroupedItem,
  type LayoutItem,
} from "../src/diagram/layout";
import { GRID, routeCrosses, routeEdges, type Rect } from "../src/diagram/router";

const W = 192;
const H = 112;
const items = (n: number, prefix = "n"): LayoutItem[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w: W, h: H }));

function rectsOf(list: LayoutItem[], positions: Map<string, { x: number; y: number }>): Rect[] {
  return list.map((i) => ({ id: i.id, ...positions.get(i.id)!, w: i.w, h: i.h }));
}

function assertNoOverlap(rects: Rect[], gap = GRID) {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.equal(collides(rects[i], rects[j], gap), false, `${rects[i].id} overlaps ${rects[j].id}`);
    }
  }
}

test("a chain lays out left to right on the grid without overlap", () => {
  const list = items(5);
  const edges = list.slice(1).map((n, i) => ({ source: list[i].id, target: n.id }));
  const { positions } = layoutGraph(list, edges, { direction: "LR", foldWidth: Infinity });
  const rects = rectsOf(list, positions);
  assertNoOverlap(rects);
  for (const r of rects) assert.ok(r.x % GRID === 0 && r.y % GRID === 0, `${r.id} is off the grid`);
  for (let i = 1; i < rects.length; i += 1) assert.ok(rects[i].x > rects[i - 1].x, "each step is to the right of the last");
});

test("a long chain folds into balanced rows instead of one very wide strip", () => {
  const list = items(8);
  const edges = list.slice(1).map((n, i) => ({ source: list[i].id, target: n.id }));
  const { positions, width } = layoutGraph(list, edges, { direction: "LR", foldWidth: 1000 });
  const rects = rectsOf(list, positions);
  assertNoOverlap(rects);
  assert.ok(width <= 1000 + W, `folded layout is still ${width}px wide`);
  assert.ok(new Set(rects.map((r) => r.y)).size >= 2, "more than one row");
  // and every connection can still be drawn cleanly around the elements
  const routes = routeEdges(rects, edges.map((e, i) => ({ id: `e${i}`, ...e })));
  for (const route of routes.values()) {
    assert.equal(route.fallback, false, `${route.id} could not be routed`);
    for (const r of rects) assert.equal(routeCrosses(route, r), false, `${route.id} crosses ${r.id}`);
  }
});

test("a short chain is left alone", () => {
  const list = items(3);
  const edges = list.slice(1).map((n, i) => ({ source: list[i].id, target: n.id }));
  const { positions } = layoutGraph(list, edges, { direction: "LR", foldWidth: 1000 });
  assert.equal(new Set(rectsOf(list, positions).map((r) => r.y)).size, 1, "one row");
});

test("isolated elements form a compact grid, not one tall column", () => {
  const list = items(24);
  const { positions, width, height } = layoutGraph(list, []);
  assertNoOverlap(rectsOf(list, positions));
  assert.ok(width > height * 0.7, `layout is ${width}x${height}: too tall and narrow`);
  assert.ok(new Set([...positions.values()].map((p) => p.x)).size > 1, "more than one column");
});

test("unlinked groups are packed side by side and do not overlap", () => {
  const list = items(12);
  const edges = [
    { source: "n0", target: "n1" }, { source: "n1", target: "n2" },
    { source: "n3", target: "n4" }, { source: "n4", target: "n5" }, { source: "n4", target: "n6" },
    { source: "n7", target: "n8" },
  ];
  const { positions } = layoutGraph(list, edges);
  assertNoOverlap(rectsOf(list, positions));
});

test("duplicate, self and dangling edges are tolerated", () => {
  const list = items(3);
  const { positions } = layoutGraph(list, [
    { source: "n0", target: "n1" },
    { source: "n0", target: "n1" },
    { source: "n2", target: "n2" },
    { source: "n2", target: "ghost" },
  ]);
  assert.equal(positions.size, 3);
});

test("cycles do not break layout", () => {
  const list = items(3);
  const { positions } = layoutGraph(list, [
    { source: "n0", target: "n1" }, { source: "n1", target: "n2" }, { source: "n2", target: "n0" },
  ]);
  assertNoOverlap(rectsOf(list, positions));
});

function grouped(contexts: number, perContext: number): { list: GroupedItem[]; edges: { source: string; target: string }[] } {
  const list: GroupedItem[] = [];
  const edges: { source: string; target: string }[] = [];
  for (let c = 0; c < contexts; c += 1) {
    for (let i = 0; i < perContext; i += 1) list.push({ id: `c${c}n${i}`, group: `ctx${c}`, w: W, h: H });
    for (let i = 1; i < perContext; i += 2) edges.push({ source: `c${c}n0`, target: `c${c}n${i}` });
  }
  for (let c = 1; c < contexts; c += 1) edges.push({ source: `c${c - 1}n0`, target: `c${c}n0` });
  return { list, edges };
}

test("bounded contexts keep their elements together and their boundaries apart", () => {
  const { list, edges } = grouped(4, 9);
  const positions = layoutGrouped(list, edges);
  const rects = rectsOf(list, positions);
  assertNoOverlap(rects);

  const boundaryOf = (group: string) => {
    const b = boundsOf(rects.filter((r) => list.find((i) => i.id === r.id)!.group === group))!;
    return { id: group, x: b.x - BOUNDARY_PAD, y: b.y - BOUNDARY_TOP, w: b.w + 2 * BOUNDARY_PAD, h: b.h + BOUNDARY_TOP + BOUNDARY_PAD };
  };
  const boundaries = ["ctx0", "ctx1", "ctx2", "ctx3"].map(boundaryOf);
  for (let i = 0; i < boundaries.length; i += 1) {
    for (let j = i + 1; j < boundaries.length; j += 1) {
      assert.equal(collides(boundaries[i], boundaries[j], 0), false, `boundary ${boundaries[i].id} overlaps ${boundaries[j].id}`);
    }
  }
});

test("a full grouped layout can be routed with no line through any element", () => {
  const { list, edges } = grouped(3, 8);
  const positions = layoutGrouped(list, edges);
  const rects = rectsOf(list, positions);
  const routes = routeEdges(rects, edges.map((e, i) => ({ id: `e${i}`, ...e })));
  let fallbacks = 0;
  for (const route of routes.values()) {
    if (route.fallback) { fallbacks += 1; continue; }
    for (const r of rects) assert.equal(routeCrosses(route, r), false, `${route.id} crosses ${r.id}`);
  }
  assert.equal(fallbacks, 0, "every edge found a clear path");
});

test("findFreeSlot returns the wanted spot when free, and the nearest free one when not", () => {
  const others: Rect[] = [{ id: "a", x: 0, y: 0, w: W, h: H }];
  const size = { w: W, h: H };
  assert.deepEqual(findFreeSlot(size, { x: 800, y: 0 }, others), { x: 800, y: 0 });
  const slot = findFreeSlot(size, { x: 20, y: 20 }, others);
  assert.equal(collides({ id: "n", ...slot, ...size }, others[0], 2 * GRID), false);
  assert.ok(slot.x % GRID === 0 && slot.y % GRID === 0);
  const dist = Math.hypot(slot.x - 20, slot.y - 20);
  assert.ok(dist < 300, `slid ${dist}px: should be the nearest free spot, not far away`);
});

test("dropping onto a crowd finds space between and around, never on top", () => {
  const others: Rect[] = [];
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 3; r += 1) others.push({ id: `${c}${r}`, x: c * 240, y: r * 160, w: W, h: H });
  const spot = placeAmong({ w: W, h: H }, { x: 300, y: 100 }, others);
  for (const o of others) assert.equal(collides({ id: "n", ...spot, w: W, h: H }, o, 2 * GRID), false);
});

test("repeated placement keeps producing non-overlapping elements", () => {
  const placed: Rect[] = [];
  for (let i = 0; i < 40; i += 1) {
    const p = placeAmong({ w: W, h: H }, { x: 100, y: 100 }, placed);
    placed.push({ id: `p${i}`, ...p, w: W, h: H });
  }
  assertNoOverlap(placed, 2 * GRID);
});
