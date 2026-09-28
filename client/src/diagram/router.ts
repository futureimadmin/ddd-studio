/**
 * Orthogonal connector routing — the equivalent of PlantUML's `skinparam linetype ortho`, but
 * aware of the elements on the canvas.
 *
 * Every edge is a polyline of horizontal and vertical segments that
 *   - leaves and enters an element perpendicular to its side, through a port,
 *   - never passes through another element,
 *   - takes as few bends as it can,
 *   - keeps to its own lane, so parallel relationships run side by side instead of on top of
 *     each other, and crossings are avoided where a reasonable detour exists.
 *
 * How: the canvas is a grid of GRID-pixel cells. Elements block cells. Each edge is found with A*
 * over (cell, heading) states, where bends, crossings, overlapping another edge's lane and
 * hugging an element cost extra. Edges are routed shortest-first, and each routed edge marks its
 * lane as occupied for the ones after it.
 *
 * Pure and dependency-free (no DOM), so it is unit-tested. Element rectangles are expected on the
 * grid (the canvas snaps to it).
 */

export const GRID = 16;

export type Point = { x: number; y: number };
export type Rect = { id: string; x: number; y: number; w: number; h: number };
export type Side = 'left' | 'right' | 'top' | 'bottom';
export type EdgeSpec = { id: string; source: string; target: string };

export type Route = {
  id: string;
  /** Vertices of the polyline, first on the source border, last on the target border. */
  points: Point[];
  /** A good place for a label: the middle of the longest segment. */
  labelAt: Point;
  sourceSide: Side;
  targetSide: Side;
  /** True when no obstacle-free path existed and a plain elbow was drawn instead. */
  fallback: boolean;
  /** Identifies the ports this route was built for; used to decide whether it can be reused. */
  signature: string;
};

export type RouteOptions = {
  /**
   * Routes from a previous call. An edge keeps its old route if its ports are unchanged and the
   * route is still clear of every element, so moving one element does not make the rest of the
   * diagram jump around.
   */
  previous?: Map<string, Route>;
};

const COST = { bend: 5, near: 3, cross: 10, overlap: 60 } as const;
/** Free cells kept around the outermost elements so edges can loop around them. */
const MARGIN = 10;
/** Cells an edge runs straight out of a port before it may turn. */
const STUB = 2;

// heading: 0 right, 1 down, 2 left, 3 up
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const OUTWARD: Record<Side, number> = { right: 0, bottom: 1, left: 2, top: 3 };

type Cell = { cx: number; cy: number };
type Ports = { sSide: Side; tSide: Side; sPort: Cell; tPort: Cell };

const sideOf = (s: Rect, t: Rect): [Side, Side] => {
  const dx = t.x + t.w / 2 - (s.x + s.w / 2);
  const dy = t.y + t.h / 2 - (s.y + s.h / 2);
  // Compare separation relative to size, so a wide element above another still connects vertically.
  const horizontal = Math.abs(dx) / ((s.w + t.w) / 2) >= Math.abs(dy) / ((s.h + t.h) / 2);
  if (horizontal) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
};

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    let i = this.keys.length;
    this.keys.push(key);
    this.vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p];
      this.vals[i] = this.vals[p];
      i = p;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }
  pop(): number {
    const top = this.vals[0];
    const key = this.keys.pop()!;
    const val = this.vals.pop()!;
    const n = this.keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.keys[c + 1] < this.keys[c]) c += 1;
        if (this.keys[c] >= key) break;
        this.keys[i] = this.keys[c];
        this.vals[i] = this.vals[c];
        i = c;
      }
      this.keys[i] = key;
      this.vals[i] = val;
    }
    return top;
  }
}

export function routeEdges(rects: Rect[], edges: EdgeSpec[], options: RouteOptions = {}): Map<string, Route> {
  const result = new Map<string, Route>();
  const byId = new Map(rects.map((r) => [r.id, r]));
  const specs = edges.filter((e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target));
  if (!specs.length) return result;

  // ------------------------------------------------------------------ grid
  const cellsOf = (r: Rect) => ({
    cx0: Math.round(r.x / GRID),
    cy0: Math.round(r.y / GRID),
    cx1: Math.round((r.x + r.w) / GRID),
    cy1: Math.round((r.y + r.h) / GRID),
  });
  const cells = new Map(rects.map((r) => [r.id, cellsOf(r)]));
  let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
  for (const c of cells.values()) {
    minCx = Math.min(minCx, c.cx0);
    minCy = Math.min(minCy, c.cy0);
    maxCx = Math.max(maxCx, c.cx1);
    maxCy = Math.max(maxCy, c.cy1);
  }
  minCx -= MARGIN;
  minCy -= MARGIN;
  maxCx += MARGIN;
  maxCy += MARGIN;
  const nx = maxCx - minCx;
  const ny = maxCy - minCy;
  const idx = (cx: number, cy: number) => (cy - minCy) * nx + (cx - minCx);
  const inGrid = (cx: number, cy: number) => cx >= minCx && cx < maxCx && cy >= minCy && cy < maxCy;

  const blocked = new Uint8Array(nx * ny);
  const near = new Uint8Array(nx * ny);
  for (const c of cells.values()) {
    for (let cy = c.cy0 - 1; cy <= c.cy1; cy += 1) {
      for (let cx = c.cx0 - 1; cx <= c.cx1; cx += 1) {
        if (!inGrid(cx, cy)) continue;
        const inside = cx >= c.cx0 && cx < c.cx1 && cy >= c.cy0 && cy < c.cy1;
        if (inside) blocked[idx(cx, cy)] = 1;
        else near[idx(cx, cy)] = 1;
      }
    }
  }
  const hUsed = new Uint8Array(nx * ny);
  const vUsed = new Uint8Array(nx * ny);

  const centerOf = ({ cx, cy }: Cell): Point => ({ x: (cx + 0.5) * GRID, y: (cy + 0.5) * GRID });

  // ------------------------------------------------------------------ ports
  const sides = new Map<string, [Side, Side]>();
  type Attach = { edge: string; end: 's' | 't'; other: number };
  const attachments = new Map<string, Attach[]>();
  const attach = (node: string, side: Side, a: Attach) => {
    const key = `${node}|${side}`;
    const list = attachments.get(key);
    if (list) list.push(a);
    else attachments.set(key, [a]);
  };
  for (const e of specs) {
    const s = byId.get(e.source)!;
    const t = byId.get(e.target)!;
    const [ss, ts] = sideOf(s, t);
    sides.set(e.id, [ss, ts]);
    const vertical = (side: Side) => side === 'left' || side === 'right';
    // Order attachments by where the other end is, so lines fan out without crossing.
    attach(e.source, ss, { edge: e.id, end: 's', other: vertical(ss) ? t.y + t.h / 2 : t.x + t.w / 2 });
    attach(e.target, ts, { edge: e.id, end: 't', other: vertical(ts) ? s.y + s.h / 2 : s.x + s.w / 2 });
  }

  const slot = new Map<string, number>();
  for (const [key, list] of attachments) {
    const [node, side] = key.split('|') as [string, Side];
    const c = cells.get(node)!;
    const span = side === 'left' || side === 'right' ? c.cy1 - c.cy0 : c.cx1 - c.cx0;
    list.sort((a, b) => a.other - b.other || (a.edge < b.edge ? -1 : 1));
    list.forEach((a, i) => {
      const offset = Math.min(span - 1, Math.max(0, Math.round(((i + 1) * span) / (list.length + 1)) - 1));
      slot.set(`${a.edge}|${a.end}`, offset);
    });
  }

  const portCell = (node: string, side: Side, offset: number): Cell => {
    const c = cells.get(node)!;
    if (side === 'right') return { cx: c.cx1, cy: c.cy0 + offset };
    if (side === 'left') return { cx: c.cx0 - 1, cy: c.cy0 + offset };
    if (side === 'bottom') return { cx: c.cx0 + offset, cy: c.cy1 };
    return { cx: c.cx0 + offset, cy: c.cy0 - 1 };
  };

  const ports = new Map<string, Ports>();
  for (const e of specs) {
    const [sSide, tSide] = sides.get(e.id)!;
    ports.set(e.id, {
      sSide,
      tSide,
      sPort: portCell(e.source, sSide, slot.get(`${e.id}|s`)!),
      tPort: portCell(e.target, tSide, slot.get(`${e.id}|t`)!),
    });
  }
  const signatureOf = (p: Ports) => `${p.sSide}${p.sPort.cx},${p.sPort.cy}>${p.tSide}${p.tPort.cx},${p.tPort.cy}`;

  // ------------------------------------------------------------------ helpers over finished routes
  const cellAtPixel = (x: number, y: number): Cell => ({ cx: Math.floor(x / GRID), cy: Math.floor(y / GRID) });
  const isBlockedPixel = (x: number, y: number) => {
    const { cx, cy } = cellAtPixel(x, y);
    return !inGrid(cx, cy) || blocked[idx(cx, cy)] === 1;
  };
  /** Walk a polyline in half-cell steps; true if it touches an element. */
  const polylineBlocked = (points: Point[]) => {
    for (let i = 0; i + 1 < points.length; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const ux = Math.sign(b.x - a.x);
      const uy = Math.sign(b.y - a.y);
      for (let d = GRID / 4; d < len; d += GRID / 2) {
        if (isBlockedPixel(a.x + ux * d, a.y + uy * d)) return true;
      }
    }
    return false;
  };
  const markPolyline = (points: Point[]) => {
    for (let i = 0; i + 1 < points.length; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const horizontal = a.y === b.y;
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const ux = Math.sign(b.x - a.x);
      const uy = Math.sign(b.y - a.y);
      for (let d = GRID / 4; d < len; d += GRID / 2) {
        const { cx, cy } = cellAtPixel(a.x + ux * d, a.y + uy * d);
        if (!inGrid(cx, cy)) continue;
        (horizontal ? hUsed : vUsed)[idx(cx, cy)] = 1;
      }
    }
  };

  const simplify = (pts: Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of pts) {
      const n = out.length;
      if (n && out[n - 1].x === p.x && out[n - 1].y === p.y) continue;
      if (n >= 2) {
        const a = out[n - 2];
        const b = out[n - 1];
        if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
      }
      out.push(p);
    }
    return out;
  };

  const border = (node: string, side: Side, port: Cell): Point => {
    const c = cells.get(node)!;
    const centre = centerOf(port);
    if (side === 'right') return { x: c.cx1 * GRID, y: centre.y };
    if (side === 'left') return { x: c.cx0 * GRID, y: centre.y };
    if (side === 'bottom') return { x: centre.x, y: c.cy1 * GRID };
    return { x: centre.x, y: c.cy0 * GRID };
  };

  const labelPoint = (pts: Point[]): Point => {
    let best = 0;
    let at = pts[0];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const len = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
      if (len > best) {
        best = len;
        at = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      }
    }
    return at;
  };

  const elbow = (a: Point, b: Point, horizontalFirst: boolean): Point[] =>
    horizontalFirst
      ? simplify([a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b])
      : simplify([a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b]);

  // ------------------------------------------------------------------ A*
  const states = nx * ny * 4;
  const g = new Float32Array(states);
  const parent = new Int32Array(states);

  const search = (start: Cell, startHeading: number, goal: Cell, inward: number): Cell[] | null => {
    if (!inGrid(start.cx, start.cy) || !inGrid(goal.cx, goal.cy)) return null;
    if (blocked[idx(start.cx, start.cy)] || blocked[idx(goal.cx, goal.cy)]) return null;
    g.fill(Infinity);
    const heap = new MinHeap();
    const startState = idx(start.cx, start.cy) * 4 + startHeading;
    g[startState] = 0;
    parent[startState] = -1;
    heap.push(Math.abs(goal.cx - start.cx) + Math.abs(goal.cy - start.cy), startState);

    while (heap.size) {
      const state = heap.pop();
      const cellIndex = state >> 2;
      const heading = state & 3;
      const cx = (cellIndex % nx) + minCx;
      const cy = Math.floor(cellIndex / nx) + minCy;
      const here = g[state];

      if (cx === goal.cx && cy === goal.cy) {
        const cells: Cell[] = [];
        for (let s = state; s !== -1; s = parent[s]) {
          const ci = s >> 2;
          cells.push({ cx: (ci % nx) + minCx, cy: Math.floor(ci / nx) + minCy });
        }
        return cells.reverse();
      }

      for (let nh = 0; nh < 4; nh += 1) {
        if (nh === ((heading + 2) & 3)) continue; // no U-turns
        const ncx = cx + DX[nh];
        const ncy = cy + DY[nh];
        if (!inGrid(ncx, ncy)) continue;
        const ni = idx(ncx, ncy);
        if (blocked[ni]) continue;
        let cost = 1;
        if (near[ni]) cost += COST.near;
        if (nh !== heading) cost += COST.bend;
        const horizontal = nh === 0 || nh === 2;
        if (horizontal) {
          if (hUsed[ni]) cost += COST.overlap;
          else if (vUsed[ni]) cost += COST.cross;
        } else if (vUsed[ni]) cost += COST.overlap;
        else if (hUsed[ni]) cost += COST.cross;
        // Facing the wrong way when reaching the goal costs a bend.
        if (ncx === goal.cx && ncy === goal.cy && nh !== inward) cost += COST.bend;

        const next = ni * 4 + nh;
        const total = here + cost;
        if (total < g[next]) {
          g[next] = total;
          parent[next] = state;
          heap.push(total + Math.abs(goal.cx - ncx) + Math.abs(goal.cy - ncy), next);
        }
      }
    }
    return null;
  };

  const routeOne = (e: EdgeSpec, p: Ports): Route => {
    const sBorder = border(e.source, p.sSide, p.sPort);
    const tBorder = border(e.target, p.tSide, p.tPort);
    const out = OUTWARD[p.sSide];
    const inward = (OUTWARD[p.tSide] + 2) & 3;
    const stubOf = (port: Cell, heading: number): Cell => ({ cx: port.cx + DX[heading] * (STUB - 1), cy: port.cy + DY[heading] * (STUB - 1) });
    const sStub = stubOf(p.sPort, out);
    const tStub = stubOf(p.tPort, OUTWARD[p.tSide]);

    const found = search(sStub, out, tStub, inward);
    let points: Point[];
    let fallback = false;
    if (found) {
      // source border -> source port -> ... -> target port -> target border
      points = simplify([sBorder, centerOf(p.sPort), ...found.map(centerOf), centerOf(p.tPort), tBorder]);
    } else {
      fallback = true;
      points = elbow(sBorder, tBorder, p.sSide === 'left' || p.sSide === 'right');
    }
    return {
      id: e.id,
      points,
      labelAt: labelPoint(points),
      sourceSide: p.sSide,
      targetSide: p.tSide,
      fallback,
      signature: signatureOf(p),
    };
  };

  // ------------------------------------------------------------------ route
  // Edges that can keep their previous route do; the rest are routed shortest first.
  const pending: EdgeSpec[] = [];
  for (const e of specs) {
    const old = options.previous?.get(e.id);
    const p = ports.get(e.id)!;
    if (old && !old.fallback && old.signature === signatureOf(p) && !polylineBlocked(old.points)) {
      result.set(e.id, old);
      markPolyline(old.points);
    } else pending.push(e);
  }
  const distance = (e: EdgeSpec) => {
    const s = byId.get(e.source)!;
    const t = byId.get(e.target)!;
    return Math.abs(s.x + s.w / 2 - (t.x + t.w / 2)) + Math.abs(s.y + s.h / 2 - (t.y + t.h / 2));
  };
  pending.sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : 1));
  for (const e of pending) {
    const route = routeOne(e, ports.get(e.id)!);
    result.set(e.id, route);
    markPolyline(route.points);
  }
  return result;
}

/** True if any segment of the route passes through the interior of `rect`. Used by tests and by the canvas. */
export function routeCrosses(route: Route, rect: Rect): boolean {
  for (let i = 0; i + 1 < route.points.length; i += 1) {
    const a = route.points[i];
    const b = route.points[i + 1];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (x1 > rect.x && x0 < rect.x + rect.w && y1 > rect.y && y0 < rect.y + rect.h) return true;
  }
  return false;
}

/** SVG path data with softly rounded corners. */
export function toPath(points: Point[], radius = 8): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2, Math.hypot(next.x - cur.x, next.y - cur.y) / 2);
    const ax = cur.x - Math.sign(cur.x - prev.x) * r;
    const ay = cur.y - Math.sign(cur.y - prev.y) * r;
    const bx = cur.x + Math.sign(next.x - cur.x) * r;
    const by = cur.y + Math.sign(next.y - cur.y) * r;
    d += ` L ${ax} ${ay} Q ${cur.x} ${cur.y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Choose where each label sits along its line so that labels never cover one another or an
 * element. For every route the candidates are points on its segments (longest first); the first
 * free one wins, so a label always stays on its own line.
 */
export function placeLabels(routes: Route[], sizes: Map<string, { w: number; h: number }>, obstacles: Rect[]): Map<string, Point> {
  const hit = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  const placed: Rect[] = [];
  const out = new Map<string, Point>();
  for (const route of [...routes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const size = sizes.get(route.id);
    if (!size) continue;
    const segments = route.points
      .slice(0, -1)
      .map((a, i) => ({ a, b: route.points[i + 1], len: Math.abs(route.points[i + 1].x - a.x) + Math.abs(route.points[i + 1].y - a.y) }))
      .sort((x, y) => y.len - x.len);
    const candidates: Point[] = [];
    for (const s of segments) {
      for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        if (s.len >= (t === 0.5 ? 24 : size.w * 0.6)) candidates.push({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
      }
    }
    candidates.push(route.labelAt);
    const boxAt = (p: Point): Rect => ({ id: route.id, x: p.x - size.w / 2, y: p.y - size.h / 2, w: size.w, h: size.h });
    const free = (p: Point) => {
      const box = boxAt(p);
      return !placed.some((q) => hit(box, q, 4)) && !obstacles.some((o) => hit(box, o, 0));
    };
    const chosen = candidates.find(free) ?? route.labelAt;
    out.set(route.id, chosen);
    placed.push(boxAt(chosen));
  }
  return out;
}
