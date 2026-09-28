import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, placeLabels, routeCrosses, routeEdges, toPath, type EdgeSpec, type Rect, type Route } from "../src/diagram/router";

const W = 192;
const H = 112;
const node = (id: string, col: number, row: number, w = W, h = H): Rect => ({ id, x: col * GRID, y: row * GRID, w, h });
const edge = (id: string, source: string, target: string): EdgeSpec => ({ id, source, target });

const orthogonal = (r: Route) => r.points.every((p, i) => i === 0 || p.x === r.points[i - 1].x || p.y === r.points[i - 1].y);
const bends = (r: Route) => r.points.length - 2;

/** Do two routes run along the same line for a non-zero length? (Perpendicular crossings are fine.) */
function sharesLane(a: Route, b: Route): boolean {
  for (let i = 0; i + 1 < a.points.length; i += 1) {
    for (let j = 0; j + 1 < b.points.length; j += 1) {
      const [a0, a1, b0, b1] = [a.points[i], a.points[i + 1], b.points[j], b.points[j + 1]];
      if (a0.y === a1.y && b0.y === b1.y && a0.y === b0.y) {
        if (Math.min(Math.max(a0.x, a1.x), Math.max(b0.x, b1.x)) - Math.max(Math.min(a0.x, a1.x), Math.min(b0.x, b1.x)) > 0) return true;
      }
      if (a0.x === a1.x && b0.x === b1.x && a0.x === b0.x) {
        if (Math.min(Math.max(a0.y, a1.y), Math.max(b0.y, b1.y)) - Math.max(Math.min(a0.y, a1.y), Math.min(b0.y, b1.y)) > 0) return true;
      }
    }
  }
  return false;
}

test("two elements side by side: one straight, perpendicular line from border to border", () => {
  const rects = [node("a", 0, 0), node("b", 30, 0)];
  const route = routeEdges(rects, [edge("e", "a", "b")]).get("e")!;
  assert.equal(route.fallback, false);
  assert.equal(route.sourceSide, "right");
  assert.equal(route.targetSide, "left");
  assert.equal(route.points[0].x, rects[0].x + W, "starts on the source right border");
  assert.equal(route.points.at(-1)!.x, rects[1].x, "ends on the target left border");
  assert.ok(orthogonal(route));
  assert.ok(bends(route) <= 2, "at most a small jog between the two port rows");
});

test("an element in the way is routed around, not through (the PlantUML ortho case)", () => {
  const rects = [node("a", 0, 0), node("blocker", 20, 0), node("b", 40, 0)];
  const route = routeEdges(rects, [edge("e", "a", "b")]).get("e")!;
  assert.equal(route.fallback, false, "a clear path exists so no fallback elbow");
  assert.ok(orthogonal(route));
  assert.equal(routeCrosses(route, rects[1]), false, "must not touch the blocker");
  assert.equal(routeCrosses(route, rects[0]), false);
  assert.equal(routeCrosses(route, rects[2]), false);
  assert.ok(bends(route) >= 2, "needs to step around it");
});

test("a wall of elements is skirted around its end", () => {
  const rects = [node("a", 0, 12), node("b", 60, 12), ...[0, 1, 2, 3, 4].map((i) => node(`w${i}`, 30, i * 8 - 4, 96, 112))];
  const route = routeEdges(rects, [edge("e", "a", "b")]).get("e")!;
  for (const r of rects.slice(2)) assert.equal(routeCrosses(route, r), false, `crosses ${r.id}`);
  assert.equal(route.fallback, false);
});

test("parallel relationships between the same two elements get separate lanes", () => {
  const rects = [node("a", 0, 0), node("b", 30, 0)];
  const routes = routeEdges(rects, [edge("e1", "a", "b"), edge("e2", "a", "b"), edge("e3", "a", "b")]);
  const list = [...routes.values()];
  for (let i = 0; i < list.length; i += 1) {
    assert.ok(orthogonal(list[i]));
    for (let j = i + 1; j < list.length; j += 1) assert.equal(sharesLane(list[i], list[j]), false, `${list[i].id} overlaps ${list[j].id}`);
  }
  assert.equal(new Set(list.map((r) => r.points[0].y)).size, 3, "three distinct exit ports on the same side");
});

test("a vertical pair connects bottom to top", () => {
  const route = routeEdges([node("a", 0, 0), node("b", 2, 20)], [edge("e", "a", "b")]).get("e")!;
  assert.equal(route.sourceSide, "bottom");
  assert.equal(route.targetSide, "top");
  assert.ok(orthogonal(route));
});

test("edges to elements left, right, above and below use the facing sides", () => {
  const routes = routeEdges(
    [node("c", 20, 20), node("left", 0, 20), node("right", 40, 20), node("up", 20, 0), node("down", 20, 40)],
    [edge("1", "c", "left"), edge("2", "c", "right"), edge("3", "c", "up"), edge("4", "c", "down")],
  );
  assert.deepEqual(["1", "2", "3", "4"].map((id) => routes.get(id)!.sourceSide), ["left", "right", "top", "bottom"]);
});

test("self loops and dangling edges are ignored, not crashed on", () => {
  const routes = routeEdges([node("a", 0, 0)], [edge("s", "a", "a"), edge("d", "a", "ghost")]);
  assert.equal(routes.size, 0);
});

test("unchanged routes are reused when something else moves", () => {
  const rects = [node("a", 0, 0), node("b", 30, 0), node("c", 0, 20), node("d", 30, 20)];
  const edges = [edge("ab", "a", "b"), edge("cd", "c", "d")];
  const first = routeEdges(rects, edges);
  const moved = rects.map((r) => (r.id === "d" ? { ...r, x: 60 * GRID, y: 30 * GRID } : r));
  const second = routeEdges(moved, edges, { previous: first });
  assert.strictEqual(second.get("ab"), first.get("ab"), "a-b keeps its route");
  assert.notStrictEqual(second.get("cd"), first.get("cd"), "c-d follows its element");
});

test("a route is recomputed when an element is dropped onto it", () => {
  const rects = [node("a", 0, 0), node("b", 40, 0)];
  const first = routeEdges(rects, [edge("e", "a", "b")]);
  const intruder = node("x", 18, 0);
  const second = routeEdges([...rects, intruder], [edge("e", "a", "b")], { previous: first });
  assert.notStrictEqual(second.get("e"), first.get("e"));
  assert.equal(routeCrosses(second.get("e")!, intruder), false);
});

test("a fully enclosed target falls back to an elbow instead of throwing", () => {
  const rects = [
    node("a", 0, 0),
    node("b", 30, 0),
    node("n1", 30, -8, 192, 96),
    node("n2", 30, 7, 192, 96),
    node("n3", 42, -8, 96, 300),
    node("n4", 18, -8, 96, 300),
  ];
  const routes = routeEdges(rects, [edge("e", "a", "b")]);
  assert.ok(routes.get("e"));
  assert.ok(routes.get("e")!.points.length >= 2);
});

test("random diagrams: every route is orthogonal and clears every element", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 12; trial += 1) {
    const cols = 6;
    const rows = 4;
    const slots = Array.from({ length: cols * rows }, (_, i) => i)
      .sort(() => rnd() - 0.5)
      .slice(0, 14 + Math.floor(rnd() * 6));
    const rects = slots.map((c, i) => node(`n${i}`, (c % cols) * 20 + 2, Math.floor(c / cols) * 12 + 2));
    const edges: EdgeSpec[] = [];
    for (let i = 0; i < rects.length * 1.4; i += 1) {
      const a = Math.floor(rnd() * rects.length);
      const b = Math.floor(rnd() * rects.length);
      if (a !== b) edges.push(edge(`e${i}`, `n${a}`, `n${b}`));
    }
    const routes = routeEdges(rects, edges);
    let fallbacks = 0;
    for (const route of routes.values()) {
      assert.ok(orthogonal(route), `${route.id} has a diagonal segment`);
      if (route.fallback) {
        fallbacks += 1;
        continue;
      }
      for (const r of rects) assert.equal(routeCrosses(route, r), false, `trial ${trial}: ${route.id} crosses ${r.id}`);
    }
    assert.ok(fallbacks <= Math.ceil(routes.size * 0.1), `trial ${trial}: too many fallbacks (${fallbacks}/${routes.size})`);
  }
});

test("performance: a large diagram routes fast, and moving one element is faster still", () => {
  const rects: Rect[] = [];
  for (let i = 0; i < 60; i += 1) rects.push(node(`n${i}`, (i % 10) * 20 + 2, Math.floor(i / 10) * 12 + 2));
  const edges: EdgeSpec[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 90; i += 1) {
    const a = Math.floor(rnd() * 60);
    const b = Math.floor(rnd() * 60);
    if (a !== b) edges.push(edge(`e${i}`, `n${a}`, `n${b}`));
  }
  let t = performance.now();
  const full = routeEdges(rects, edges);
  const fullMs = performance.now() - t;
  const moved = rects.map((r) => (r.id === "n5" ? { ...r, x: r.x + 3 * GRID } : r));
  t = performance.now();
  routeEdges(moved, edges, { previous: full });
  const incrementalMs = performance.now() - t;
  console.log(`      60 elements / ${edges.length} edges: full ${fullMs.toFixed(0)} ms, one element moved ${incrementalMs.toFixed(0)} ms`);
  assert.ok(fullMs < 2500, `full route took ${fullMs} ms`);
  assert.ok(incrementalMs < 800, `incremental took ${incrementalMs} ms`);
});

test("labels on crowded lines are placed apart from each other and from every element", () => {
  const rects = [node("a", 0, 0), node("b", 40, 0), node("c", 40, 20)];
  const edges = [edge("e1", "a", "b"), edge("e2", "a", "b"), edge("e3", "a", "c"), edge("e4", "b", "c")];
  const routes = [...routeEdges(rects, edges).values()];
  const sizes = new Map(routes.map((r) => [r.id, { w: 96, h: 20 }]));
  const anchors = placeLabels(routes, sizes, rects);
  const boxes = routes.map((r) => {
    const p = anchors.get(r.id)!;
    return { id: r.id, x: p.x - 48, y: p.y - 10, w: 96, h: 20 };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (const el of rects) {
      assert.equal(boxes[i].x < el.x + el.w && boxes[i].x + boxes[i].w > el.x && boxes[i].y < el.y + el.h && boxes[i].y + boxes[i].h > el.y, false, `label ${boxes[i].id} sits on ${el.id}`);
    }
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      assert.equal(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y, false, `labels ${a.id} and ${b.id} overlap`);
    }
  }
});

test("toPath rounds corners and stays on the polyline", () => {
  const d = toPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  assert.equal(d, "M 0 0 L 92 0 Q 100 0 100 8 L 100 100");
  assert.equal(toPath([{ x: 0, y: 0 }]), "");
});
