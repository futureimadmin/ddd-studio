/**
 * Automatic layout and placement for the diagram.
 *
 * - `layoutGraph` arranges items with a layered (Sugiyama-style) layout, one connected group at a
 *   time, then packs the groups onto rows. Isolated elements form a tidy grid instead of a
 *   single tall column.
 * - `layoutGrouped` does that inside each bounded context, then arranges the contexts.
 * - `findFreeSlot` / `placeAmong` put a new or dropped element on the nearest free spot.
 *
 * Everything lands on the router's grid, and nothing overlaps.
 */
import dagre from '@dagrejs/dagre';
import { GRID, type Rect } from './router';

export type Size = { w: number; h: number };
export type LayoutItem = Size & { id: string };
export type LayoutEdge = { source: string; target: string };
export type Position = { x: number; y: number };

export type LayoutOptions = {
  direction?: 'LR' | 'TB';
  /** Gap between elements in the same layer. */
  nodesep?: number;
  /** Gap between layers (leave room for the lines that run between them). */
  ranksep?: number;
  /** Rows never grow wider than this (by default they aim for a landscape block that grows with the content). */
  maxWidth?: number;
  /**
   * A linked group wider than this is folded into balanced rows of layers (left to right layout only),
   * so a long chain becomes a compact block instead of one very wide strip.
   */
  foldWidth?: number;
  /** Gap between separately laid-out groups. */
  gap?: number;
};

export const snap = (n: number) => Math.round(n / GRID) * GRID;

/**
 * Minimum clearance between elements. Two facing elements need room for a line to leave one,
 * turn, and enter the other (two stub cells at each end plus a lane): five cells.
 */
export const MIN_GAP = 5 * GRID;
const snapUp = (n: number) => Math.ceil(n / GRID) * GRID;

/** Space a bounded-context boundary keeps around its members, and the header strip above them. */
export const BOUNDARY_PAD = 2 * GRID;
export const BOUNDARY_TOP = 3 * GRID;

type Box = { ids: string[]; pos: Map<string, Position>; w: number; h: number };

function components(items: LayoutItem[], edges: LayoutEdge[]): string[][] {
  const parent = new Map(items.map((i) => [i.id, i.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const e of edges) parent.set(find(e.source), find(e.target));
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const root = find(item.id);
    const list = groups.get(root);
    if (list) list.push(item.id);
    else groups.set(root, [item.id]);
  }
  return [...groups.values()];
}

/**
 * Fold a left-to-right layered layout into rows. Layers are the columns of nodes; with N layers
 * that would be wider than `foldWidth`, split them into ceil(width / foldWidth) rows of near-equal
 * length and stack the rows. Connections between rows are drawn by the router.
 */
function fold(pos: Map<string, Position>, size: Map<string, Size>, ranksep: number, rowGap: number, foldWidth: number) {
  const layers = new Map<number, string[]>();
  for (const [id, p] of pos) {
    const key = Math.round(p.x);
    const list = layers.get(key);
    if (list) list.push(id);
    else layers.set(key, [id]);
  }
  const ordered = [...layers.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids);
  const layerWidth = (ids: string[]) => Math.max(...ids.map((id) => size.get(id)!.w));
  const total = ordered.reduce((sum, ids) => sum + layerWidth(ids), 0) + ranksep * (ordered.length - 1);
  if (total <= foldWidth || ordered.length < 3) return null;

  const rows = Math.ceil(total / foldWidth);
  const perRow = Math.ceil(ordered.length / rows);
  const out = new Map<string, Position>();
  let offsetY = 0;
  let width = 0;
  for (let start = 0; start < ordered.length; start += perRow) {
    const row = ordered.slice(start, start + perRow);
    const rowTop = Math.min(...row.flat().map((id) => pos.get(id)!.y));
    let rowBottom = -Infinity;
    let x = 0;
    for (const layer of row) {
      for (const id of layer) {
        const p = pos.get(id)!;
        out.set(id, { x, y: p.y - rowTop + offsetY });
        rowBottom = Math.max(rowBottom, p.y - rowTop + offsetY + size.get(id)!.h);
      }
      x += layerWidth(layer) + ranksep;
    }
    width = Math.max(width, x - ranksep);
    offsetY = rowBottom + rowGap;
  }
  return { pos: out, w: width, h: offsetY - rowGap };
}

export function layoutGraph(
  items: LayoutItem[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): { positions: Map<string, Position>; width: number; height: number } {
  const { direction = 'LR', nodesep = 5 * GRID, ranksep = 7 * GRID, gap = 5 * GRID } = options;
  const size = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const usable = edges.filter((e) => {
    const key = `${e.source}>${e.target}`;
    if (e.source === e.target || !size.has(e.source) || !size.has(e.target) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const boxes: Box[] = components(items, usable).map((ids) => {
    if (ids.length === 1) {
      const it = size.get(ids[0])!;
      return { ids, pos: new Map([[ids[0], { x: 0, y: 0 }]]), w: it.w, h: it.h };
    }
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep, ranksep, marginx: 0, marginy: 0, ranker: 'network-simplex' });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of ids) g.setNode(id, { width: size.get(id)!.w, height: size.get(id)!.h });
    const inGroup = new Set(ids);
    for (const e of usable) if (inGroup.has(e.source) && inGroup.has(e.target)) g.setEdge(e.source, e.target);
    dagre.layout(g);
    const pos = new Map<string, Position>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const n = g.node(id);
      const it = size.get(id)!;
      const x = n.x - it.w / 2;
      const y = n.y - it.h / 2;
      pos.set(id, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + it.w);
      maxY = Math.max(maxY, y + it.h);
    }
    for (const p of pos.values()) {
      p.x -= minX;
      p.y -= minY;
    }
    const folded = direction === 'LR' ? fold(pos, size, ranksep, ranksep, options.foldWidth ?? 1000) : null;
    if (folded) return { ids, pos: folded.pos, w: folded.w, h: folded.h };
    return { ids, pos, w: maxX - minX, h: maxY - minY };
  });

  // Pack: linked groups first (biggest first), isolated elements after, row by row.
  boxes.sort((a, b) => (b.ids.length > 1 ? 1 : 0) - (a.ids.length > 1 ? 1 : 0) || b.w * b.h - a.w * a.h || (a.ids[0] < b.ids[0] ? -1 : 1));
  const totalArea = boxes.reduce((sum, b) => sum + (b.w + gap) * (b.h + gap), 0);
  const widest = Math.max(0, ...boxes.map((b) => b.w));
  const maxWidth = Math.min(options.maxWidth ?? Infinity, Math.max(widest, Math.sqrt(totalArea * 1.8)));

  const positions = new Map<string, Position>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  for (const box of boxes) {
    if (x > 0 && x + box.w > maxWidth) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    for (const [id, p] of box.pos) positions.set(id, { x: snap(x + p.x), y: snap(y + p.y) });
    x += box.w + gap;
    rowH = Math.max(rowH, box.h);
    width = Math.max(width, x - gap);
  }
  return { positions, width: snapUp(width), height: snapUp(y + rowH) };
}

export type GroupedItem = LayoutItem & { group: string };

/**
 * Lay elements out inside their bounded contexts, then arrange the contexts themselves.
 * Cross-context relationships steer where contexts go (upstream above downstream).
 */
export function layoutGrouped(
  items: GroupedItem[],
  edges: LayoutEdge[],
  options: { direction?: 'LR' | 'TB'; maxWidth?: number } = {},
): Map<string, Position> {
  const groupOf = new Map(items.map((i) => [i.id, i.group]));
  const members = new Map<string, GroupedItem[]>();
  for (const item of items) {
    const list = members.get(item.group);
    if (list) list.push(item);
    else members.set(item.group, [item]);
  }

  const inner = new Map<string, ReturnType<typeof layoutGraph>>();
  const outerItems: LayoutItem[] = [];
  for (const [group, list] of members) {
    const ids = new Set(list.map((i) => i.id));
    const laid = layoutGraph(
      list,
      edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
      { direction: options.direction ?? 'LR', maxWidth: 1100, foldWidth: 900 },
    );
    inner.set(group, laid);
    outerItems.push({ id: group, w: laid.width + 2 * BOUNDARY_PAD, h: laid.height + BOUNDARY_TOP + BOUNDARY_PAD });
  }

  const groupEdges: LayoutEdge[] = [];
  for (const e of edges) {
    const a = groupOf.get(e.source);
    const b = groupOf.get(e.target);
    if (a && b && a !== b) groupEdges.push({ source: a, target: b });
  }
  const outer = layoutGraph(outerItems, groupEdges, {
    direction: 'LR',
    foldWidth: 1900,
    nodesep: 6 * GRID,
    ranksep: 8 * GRID,
    gap: 6 * GRID,
    maxWidth: options.maxWidth ?? 1900,
  });

  const result = new Map<string, Position>();
  for (const [group, laid] of inner) {
    const origin = outer.positions.get(group)!;
    for (const [id, p] of laid.positions) {
      result.set(id, { x: snap(origin.x + BOUNDARY_PAD + p.x), y: snap(origin.y + BOUNDARY_TOP + p.y) });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------- placement

export const boundsOf = (rects: Rect[]): { x: number; y: number; w: number; h: number } | null => {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** Do the two rectangles come closer than `gap` pixels to one another? */
export const collides = (a: Rect, b: Rect, gap: number): boolean =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/**
 * The free spot nearest to `near` where an element of `size` fits without touching any of
 * `others` (keeping `gap` clear). Searches outward in rings on the grid.
 */
export function findFreeSlot(
  size: Size,
  near: Position,
  others: Rect[],
  gap = MIN_GAP,
  /** Extra rule a spot must satisfy (for example: must not make two context boundaries overlap). */
  accept?: (x: number, y: number) => boolean,
): Position {
  const start = { x: snap(near.x), y: snap(near.y) };
  const fits = (x: number, y: number) => !others.some((o) => collides({ id: '', x, y, w: size.w, h: size.h }, o, gap)) && (!accept || accept(x, y));
  if (fits(start.x, start.y)) return start;
  for (let ring = 1; ring <= 400; ring += 1) {
    let best: Position | null = null;
    let bestDist = Infinity;
    const consider = (dx: number, dy: number) => {
      const x = start.x + dx * GRID;
      const y = start.y + dy * GRID;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist && fits(x, y)) {
        best = { x, y };
        bestDist = dist;
      }
    };
    for (let d = -ring; d <= ring; d += 1) {
      consider(d, -ring);
      consider(d, ring);
      if (d > -ring && d < ring) {
        consider(-ring, d);
        consider(ring, d);
      }
    }
    if (best) return best;
  }
  return start;
}

/** Snap a dropped element to the grid and, if it lands on something, slide it to the nearest free spot. */
export function placeAmong(size: Size, wanted: Position, others: Rect[], gap = MIN_GAP, accept?: (x: number, y: number) => boolean): Position {
  return findFreeSlot(size, wanted, others, gap, accept);
}

// ---------------------------------------------------------------------------- planning

export type BoardMode = 'designer' | 'storm' | 'contexts';
export type PlaceItem = { id: string; /** Bounded context (designer board). */ group?: string; x: number | null; y: number | null };

const ORIGIN: Position = { x: 2 * GRID, y: 2 * GRID };

const shift = (positions: Map<string, Position>, dx: number, dy: number) => {
  const out = new Map<string, Position>();
  for (const [id, p] of positions) out.set(id, { x: snap(p.x + dx), y: snap(p.y + dy) });
  return out;
};

/** A complete fresh layout for every item on a board. */
export function planFullLayout(mode: BoardMode, items: Array<{ id: string; group?: string }>, edges: LayoutEdge[], size: Size): Map<string, Position> {
  if (!items.length) return new Map();
  if (mode === 'designer') {
    const laid = layoutGrouped(
      items.map((i) => ({ id: i.id, group: i.group ?? '', ...size })),
      edges,
      { direction: 'LR' },
    );
    return shift(laid, ORIGIN.x, ORIGIN.y);
  }
  const { positions } = layoutGraph(
    items.map((i) => ({ id: i.id, ...size })),
    edges,
    { direction: 'LR', nodesep: mode === 'contexts' ? 8 * GRID : 5 * GRID, ranksep: mode === 'contexts' ? 16 * GRID : 8 * GRID, maxWidth: mode === 'contexts' ? 1500 : 2000, foldWidth: mode === 'contexts' ? 1300 : 1500 },
  );
  return shift(positions, ORIGIN.x, ORIGIN.y);
}

/**
 * Positions for the items that do not have one yet, leaving everything already placed exactly where it is:
 * - a blank board gets a full layout;
 * - a new element in a context that already has elements goes to the nearest free spot beside them;
 * - elements of a brand-new context are laid out together as a block to the right of the existing diagram.
 */
export function planPlacement(args: { mode: BoardMode; items: PlaceItem[]; edges: LayoutEdge[]; size: Size }): Map<string, Position> {
  const { mode, items, edges, size } = args;
  const placed = items.filter((i) => i.x !== null && i.y !== null);
  const unplaced = items.filter((i) => i.x === null || i.y === null);
  if (!unplaced.length) return new Map();
  if (!placed.length) return planFullLayout(mode, unplaced, edges, size);

  const rectOf = (i: PlaceItem, p?: Position): Rect => ({ id: i.id, x: p?.x ?? i.x!, y: p?.y ?? i.y!, ...size });
  const obstacles: Rect[] = placed.map((i) => rectOf(i));
  const result = new Map<string, Position>();
  const place = (item: PlaceItem, near: Position) => {
    const p = findFreeSlot(size, near, obstacles);
    result.set(item.id, p);
    obstacles.push(rectOf(item, p));
  };

  const room = boundsOf(obstacles)!;
  const rightOfEverything = { x: room.x + room.w + 6 * GRID, y: room.y };
  const ordered = [...unplaced].sort((a, b) => (a.id < b.id ? -1 : 1));

  if (mode === 'designer') {
    const groupsWithPlaced = new Set(placed.map((i) => i.group ?? ''));
    const owner = new Map(items.map((i) => [i.id, i.group ?? '']));
    const fresh: PlaceItem[] = [];
    for (const item of ordered) {
      const group = item.group ?? '';
      if (!groupsWithPlaced.has(group)) {
        fresh.push(item);
        continue;
      }
      const b = boundsOf(obstacles.filter((o) => owner.get(o.id) === group))!;
      place(item, { x: b.x + b.w / 2 - size.w / 2, y: b.y + b.h / 2 - size.h / 2 });
    }
    if (fresh.length) {
      const block = planFullLayout(mode, fresh, edges, size);
      for (const [id, p] of shift(block, rightOfEverything.x - ORIGIN.x, rightOfEverything.y - ORIGIN.y)) result.set(id, p);
    }
    return result;
  }

  // Storm board / context map: next to whatever the new element is linked to, else to the right.
  for (const item of ordered) {
    const linked = edges
      .flatMap((e) => (e.source === item.id ? [e.target] : e.target === item.id ? [e.source] : []))
      .map((id) => obstacles.find((o) => o.id === id))
      .filter((o): o is Rect => !!o);
    const near = linked.length
      ? { x: linked.reduce((s, o) => s + o.x, 0) / linked.length + size.w + MIN_GAP, y: linked.reduce((s, o) => s + o.y, 0) / linked.length }
      : rightOfEverything;
    place(item, near);
  }
  return result;
}
