/**
 * The diagram canvas: elements you can drag around, bounded-context boundaries, and
 * relationships drawn as clean orthogonal lines that avoid the elements.
 *
 * Interaction is handled by React Flow (pan / zoom / drag / connect gesture); layout, placement
 * and edge routing are our own (see src/diagram). The canvas is controlled: positions live in
 * the workspace, and `onMove` reports every change so the page can save it.
 */
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { LayoutGrid } from 'lucide-react';
import {
  BOUNDARY_PAD,
  BOUNDARY_TOP,
  MIN_GAP,
  boundsOf,
  collides,
  placeAmong,
  planFullLayout,
  planPlacement,
  snap,
  type BoardMode,
  type Position,
} from '@/diagram/layout';
import type { GeneralizationConstraint } from '@/diagram/relations';
import { GRID, placeLabels, routeEdges, type Rect, type Route } from '@/diagram/router';
import { notify } from '@/lib/toast';
import { ConnectionLine, MarkerDefs, edgeTypes, nodeTypes } from './diagram-parts';

export type DiagramItem = {
  id: string;
  kind: string;
  name: string;
  description: string;
  status: string;
  methods: string[];
  contextId: string;
  color: string;
  x: number | null;
  y: number | null;
  /** Context map only. */
  purpose?: string;
  elements?: number;
  /** "schema.table" when this Entity is Physical; null otherwise. Designer/Event storming only. */
  physicalTable?: string | null;
  generalizationConstraint?: GeneralizationConstraint;
};
export type DiagramEdge = { id: string; source: string; target: string; type: string; label: string };
export type DiagramContext = { id: string; name: string; color: string };
export type Move = { id: string; x: number; y: number };

export type DiagramProps = {
  mode: BoardMode;
  items: DiagramItem[];
  edges: DiagramEdge[];
  /** Bounded contexts, for the boundaries drawn around elements (designer board). */
  contexts: DiagramContext[];
  selectedId: string | null;
  selectedEdgeId: string | null;
  /** Elements that stay bright; everything else is dimmed (search / context filter). */
  matchIds?: Set<string> | null;
  /** Elements to emphasise together (event-storming chain). */
  highlightIds?: Set<string>;
  showGrid: boolean;
  showLabels: boolean;
  /** Changing this re-frames the view on `focusIds` (or on everything when empty). */
  focusKey?: string;
  focusIds?: string[];
  onSelectItem: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onMove: (moves: Move[]) => void;
  onConnect: (sourceId: string, targetId: string) => void;
  onDropKind?: (kind: string, at: Position) => void;
  onDeleteSelected?: () => void;
};

const SIZES: Record<BoardMode, { w: number; h: number }> = {
  designer: { w: 12 * GRID, h: 7 * GRID },
  storm: { w: 10 * GRID, h: 6 * GRID },
  contexts: { w: 14 * GRID, h: 7 * GRID },
};
const NODE_TYPE: Record<BoardMode, string> = { designer: 'element', storm: 'sticky', contexts: 'context' };
const BOUNDARY_PREFIX = 'boundary:';

function Canvas(props: DiagramProps) {
  const { mode, items, edges, contexts, selectedId, selectedEdgeId, matchIds, highlightIds, showGrid, showLabels } = props;
  const { onSelectItem, onSelectEdge, onMove, onConnect, onDropKind, onDeleteSelected } = props;
  const size = SIZES[mode];
  const rf = useReactFlow();

  const [transient, setTransient] = useState<Record<string, Position>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const routesRef = useRef<Map<string, Route>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Latest geometry, for callbacks that run on a timer. */
  const latest = useRef<{ rects: Rect[]; boundaries: Rect[] }>({ rects: [], boundaries: [] });
  const boundaryDrag = useRef<{ start: Position; members: Record<string, Position> } | null>(null);
  const persistedPlan = useRef('');

  // ------------------------------------------------------------------ positions
  const itemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const usableEdges = useMemo(() => edges.filter((e) => e.source !== e.target && itemIds.has(e.source) && itemIds.has(e.target)), [edges, itemIds]);
  const layoutEdges = useMemo(() => usableEdges.map((e) => ({ source: e.source, target: e.target })), [usableEdges]);

  /** Positions for elements that do not have one yet (new, imported, AI-generated, or the sample). */
  const plan = useMemo(
    () => planPlacement({ mode, items: items.map((i) => ({ id: i.id, group: i.contextId, x: i.x, y: i.y })), edges: layoutEdges, size }),
    [mode, items, layoutEdges, size],
  );

  const rects = useMemo<Rect[]>(
    () =>
      items.map((it) => {
        const p = transient[it.id] ?? (it.x !== null && it.y !== null ? { x: it.x, y: it.y } : (plan.get(it.id) ?? { x: 0, y: 0 }));
        return { id: it.id, x: p.x, y: p.y, w: size.w, h: size.h };
      }),
    [items, transient, plan, size],
  );

  // Save first placements once. A blank board is also framed so the whole layout is in view.
  const planKey = useMemo(() => [...plan.keys()].sort().join('|'), [plan]);
  useEffect(() => {
    if (!plan.size) {
      persistedPlan.current = '';
      return;
    }
    if (persistedPlan.current === planKey) return;
    persistedPlan.current = planKey;
    const wholeBoard = plan.size === items.length;
    onMove([...plan].map(([id, p]) => ({ id, x: p.x, y: p.y })));
    if (wholeBoard) window.setTimeout(() => fitTo(undefined, 250), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  // ------------------------------------------------------------------ routing
  const routes = useMemo(() => {
    const next = routeEdges(
      rects,
      usableEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      { previous: routesRef.current },
    );
    routesRef.current = next;
    return next;
  }, [rects, usableEdges]);

  /** Labels are placed after routing so they never sit on top of each other or an element. */
  const labelAnchors = useMemo(() => {
    if (!showLabels) return new Map<string, { x: number; y: number }>();
    const sizes = new Map(usableEdges.map((e) => [e.id, { w: Math.max(48, (e.label || e.type).length * 6.4 + 14), h: 20 }]));
    return placeLabels([...routes.values()], sizes, rects);
  }, [showLabels, usableEdges, routes, rects]);

  // ------------------------------------------------------------------ boundaries (designer)
  const boundaries = useMemo(() => {
    if (mode !== 'designer') return [];
    const byContext = new Map<string, Rect[]>();
    items.forEach((it, i) => {
      const list = byContext.get(it.contextId);
      if (list) list.push(rects[i]);
      else byContext.set(it.contextId, [rects[i]]);
    });
    return contexts
      .filter((c) => byContext.has(c.id))
      .map((c) => {
        const members = byContext.get(c.id)!;
        const b = boundsOf(members)!;
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          count: members.length,
          x: b.x - BOUNDARY_PAD,
          y: b.y - BOUNDARY_TOP,
          w: b.w + 2 * BOUNDARY_PAD,
          h: b.h + BOUNDARY_TOP + BOUNDARY_PAD,
        };
      });
  }, [mode, items, rects, contexts]);

  latest.current = {
    rects,
    boundaries: boundaries.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
  };

  /**
   * Frame some rectangles (default: everything). Computed here from our own geometry rather than by
   * React Flow, so it is exact and does not depend on when React Flow finishes measuring.
   */
  const fitTo = useCallback(
    (only?: string[], duration = 0) => {
      const el = wrapperRef.current;
      const { rects: all, boundaries: frames } = latest.current;
      const targets = only ? all.filter((r) => only.includes(r.id)) : [...all, ...frames];
      if (!el || !targets.length) return;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const b = boundsOf(targets)!;
      const pad = only ? 96 : 48;
      const zoom = Math.max(0.15, Math.min(1, (width - 2 * pad) / b.w, (height - 2 * pad) / b.h));
      void rf.setViewport(
        { x: (width - b.w * zoom) / 2 - b.x * zoom, y: (height - b.h * zoom) / 2 - b.y * zoom, zoom },
        duration ? { duration } : undefined,
      );
    },
    [rf],
  );

  // ------------------------------------------------------------------ react-flow nodes and edges
  const dimmedNode = useCallback(
    (id: string) => (matchIds ? !matchIds.has(id) : false) || (!!highlightIds && highlightIds.size > 0 && !highlightIds.has(id)),
    [matchIds, highlightIds],
  );

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = boundaries.map((b) => ({
      id: BOUNDARY_PREFIX + b.id,
      type: 'boundary',
      position: { x: b.x, y: b.y },
      data: { name: b.name, color: b.color, count: b.count },
      // initialWidth/Height (not width/height): the minimap needs dimensions on the node object, while React Flow still measures the real size.
      initialWidth: b.w,
      initialHeight: b.h,
      style: { width: b.w, height: b.h, pointerEvents: 'none' as const },
      zIndex: -1,
      selectable: false,
      focusable: false,
      connectable: false,
      draggable: true,
      dragHandle: '.ddd-boundary-handle',
    }));
    items.forEach((it, i) => {
      const dimmed = dimmedNode(it.id);
      out.push({
        id: it.id,
        type: NODE_TYPE[mode],
        position: { x: rects[i].x, y: rects[i].y },
        initialWidth: size.w,
        initialHeight: size.h,
        style: { width: size.w, height: size.h },
        selected: selected.has(it.id),
        data:
          mode === 'contexts'
            ? { name: it.name, purpose: it.purpose ?? '', color: it.color, elements: it.elements ?? 0, dimmed }
            : {
                name: it.name,
                kind: it.kind,
                description: it.description,
                status: it.status,
                methods: it.methods,
                color: it.color,
                dimmed,
                physicalTable: it.physicalTable ?? null,
                generalizationConstraint: it.generalizationConstraint ?? 'none',
              },
      });
    });
    return out;
  }, [boundaries, items, rects, mode, size, selected, dimmedNode]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      usableEdges.flatMap((e) => {
        const route = routes.get(e.id);
        if (!route) return [];
        const chain = !!highlightIds && highlightIds.size > 0;
        const inChain = chain && highlightIds!.has(e.source) && highlightIds!.has(e.target);
        const dimmed = (matchIds ? !(matchIds.has(e.source) && matchIds.has(e.target)) : false) || (chain && !inChain);
        return [
          {
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'routed',
            selected: e.id === selectedEdgeId,
            data: { points: route.points, labelAt: labelAnchors.get(e.id) ?? route.labelAt, type: e.type, label: e.label, showLabel: showLabels, dimmed, emphasis: inChain },
          },
        ];
      }),
    [usableEdges, routes, labelAnchors, selectedEdgeId, showLabels, highlightIds, matchIds],
  );

  // ------------------------------------------------------------------ selection sync with the page
  useEffect(() => {
    setSelected((current) => {
      if (selectedId === null) return current.size === 1 ? new Set() : current;
      return current.has(selectedId) ? current : new Set([selectedId]);
    });
  }, [selectedId]);

  // ------------------------------------------------------------------ interaction
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'select') {
        setSelected((prev) => {
          const next = new Set(prev);
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
          return next;
        });
      } else if (change.type === 'position' && change.position) {
        const position = change.position;
        if (change.id.startsWith(BOUNDARY_PREFIX)) {
          const drag = boundaryDrag.current;
          if (!drag) continue;
          const dx = snap(position.x - drag.start.x);
          const dy = snap(position.y - drag.start.y);
          setTransient(Object.fromEntries(Object.entries(drag.members).map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }])));
        } else {
          setTransient((prev) => ({ ...prev, [change.id]: position }));
        }
      }
    }
  }, []);

  const onNodeDragStart = useCallback(
    (_: unknown, node: Node) => {
      if (!node.id.startsWith(BOUNDARY_PREFIX)) return;
      const context = node.id.slice(BOUNDARY_PREFIX.length);
      const members: Record<string, Position> = {};
      items.forEach((it, i) => {
        if (it.contextId === context) members[it.id] = { x: rects[i].x, y: rects[i].y };
      });
      boundaryDrag.current = { start: { x: node.position.x, y: node.position.y }, members };
    },
    [items, rects],
  );

  /** The boundary drawn around a set of elements of one context. */
  const boundaryRect = useCallback((members: Rect[]): Rect => {
    const b = boundsOf(members)!;
    return { id: '', x: b.x - BOUNDARY_PAD, y: b.y - BOUNDARY_TOP, w: b.w + 2 * BOUNDARY_PAD, h: b.h + BOUNDARY_TOP + BOUNDARY_PAD };
  }, []);

  const contextOf = useMemo(() => new Map(items.map((i) => [i.id, i.contextId])), [items]);

  /** Would these rectangles make one context's boundary run into another's? (designer board only) */
  const boundariesStayApart = useCallback(
    (all: Rect[]): boolean => {
      if (mode !== 'designer') return true;
      const groups = new Map<string, Rect[]>();
      for (const r of all) {
        const ctx = contextOf.get(r.id);
        if (!ctx) continue;
        const list = groups.get(ctx);
        if (list) list.push(r);
        else groups.set(ctx, [r]);
      }
      const boxes = [...groups.values()].map(boundaryRect);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) if (collides(boxes[i], boxes[j], GRID)) return false;
      }
      return true;
    },
    [mode, contextOf, boundaryRect],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node, dragged: Node[]) => {
      if (node.id.startsWith(BOUNDARY_PREFIX)) {
        const drag = boundaryDrag.current;
        boundaryDrag.current = null;
        setTransient({});
        if (!drag) return;
        const dx = snap(node.position.x - drag.start.x);
        const dy = snap(node.position.y - drag.start.y);
        if (dx === 0 && dy === 0) return;
        const moves = Object.entries(drag.members).map(([id, p]) => ({ id, x: p.x + dx, y: p.y + dy }));
        const others = rects.filter((r) => !(r.id in drag.members));
        const moved = moves.map((m) => ({ id: m.id, x: m.x, y: m.y, ...size }));
        const clash = moved.some((m) => others.some((o) => collides(m, o, MIN_GAP))) || !boundariesStayApart([...others, ...moved]);
        if (clash) notify('No room there: the context would overlap another one.', 'warning');
        else onMove(moves);
        return;
      }

      const movedIds = new Set(dragged.filter((n) => !n.id.startsWith(BOUNDARY_PREFIX)).map((n) => n.id));
      const solid = rects.filter((r) => !movedIds.has(r.id));
      // Compare with where each element is *saved* (not with `rects`, which already includes the drag in progress).
      const saved = new Map(items.map((i) => [i.id, i.x !== null && i.y !== null ? { x: i.x, y: i.y } : undefined]));
      const moves: Move[] = [];
      let relocated = false;
      for (const n of dragged) {
        if (n.id.startsWith(BOUNDARY_PREFIX)) continue;
        // Never let two elements overlap: a drop onto another element slides to the nearest free spot.
        const wanted = { x: snap(n.position.x), y: snap(n.position.y) };
        const spot = placeAmong(size, wanted, solid, MIN_GAP, (x, y) => boundariesStayApart([...solid, { id: n.id, x, y, ...size }]));
        if (Math.hypot(spot.x - wanted.x, spot.y - wanted.y) > 3 * GRID) relocated = true;
        solid.push({ id: n.id, ...spot, ...size });
        const old = saved.get(n.id);
        if (!old || old.x !== spot.x || old.y !== spot.y) moves.push({ id: n.id, ...spot });
      }
      setTransient({});
      if (relocated) notify('Moved to the nearest free spot: elements can not overlap, and neither can two contexts.', 'warning');
      if (moves.length) onMove(moves);
    },
    [rects, items, size, onMove, boundariesStayApart],
  );

  const handleConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) onConnect(c.source, c.target);
    },
    [onConnect],
  );

  const tidy = () => {
    const laid = planFullLayout(mode, items.map((i) => ({ id: i.id, group: i.contextId })), layoutEdges, size);
    routesRef.current = new Map();
    onMove([...laid].map(([id, p]) => ({ id, x: p.x, y: p.y })));
    window.setTimeout(() => fitTo(undefined, 250), 120);
  };

  const dropKind = (event: DragEvent) => {
    // A relationship type is already armed the moment it's picked up (see the palette) — a
    // relationship needs two endpoints, so there is nothing more to do with wherever it lands.
    // preventDefault() here just keeps the cursor showing "allowed" instead of "no drop" while
    // dragging over the canvas, so the gesture doesn't look broken.
    if (event.dataTransfer.types.includes('application/x-ddd-relation')) {
      event.preventDefault();
      return;
    }
    const kind = event.dataTransfer.getData('application/x-ddd-kind');
    if (!kind || !onDropKind) return;
    event.preventDefault();
    const p = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onDropKind(kind, { x: snap(p.x - size.w / 2), y: snap(p.y - size.h / 2) });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea, select, button')) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDeleteSelected?.();
    }
  };

  // Frame the whole diagram once it has content. (React Flow's own fit-on-init can run before it
  // knows the container size, which leaves an existing diagram partly off-screen.)
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !items.length) return;
    framed.current = true;
    window.setTimeout(() => fitTo(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Re-frame when the page asks (context filter changed).
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    const ids = (props.focusIds ?? []).filter((id) => itemIds.has(id));
    const timer = window.setTimeout(
      () => fitTo(ids.length ? ids : undefined, 350),
      50,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusKey]);

  return (
    <div
      ref={wrapperRef}
      className="ddd-canvas relative h-full w-full outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-ddd-relation')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        } else if (onDropKind && e.dataTransfer.types.includes('application/x-ddd-kind')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={dropKind}
      data-testid="diagram-canvas"
      data-mode={mode}
    >
      <MarkerDefs />
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        // Edges are fully controlled from `rfEdges`; this just satisfies React Flow's controlled-component contract.
        onEdgesChange={() => {}}
        onNodeClick={(event, node) => {
          if (node.id.startsWith(BOUNDARY_PREFIX) || event.shiftKey || event.ctrlKey || event.metaKey) return;
          onSelectItem(node.id);
        }}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onPaneClick={() => {
          onSelectItem(null);
          onSelectEdge(null);
        }}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={handleConnect}
        isValidConnection={(c) => c.source !== c.target}
        connectionLineComponent={ConnectionLine}
        connectionRadius={36}
        snapToGrid
        snapGrid={[GRID, GRID]}
        nodeDragThreshold={3}
        selectNodesOnDrag={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        onError={(code, message) => console.error('[RF ERROR]', code, message)}
        minZoom={0.15}
        maxZoom={1.75}

      >
        {showGrid && <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.3} color="hsl(var(--border))" />}
        <Controls showInteractive={false} position="bottom-left" onFitView={() => fitTo(undefined, 250)} />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeStrokeWidth={2}
          nodeColor={(n) => (n.type === 'boundary' ? 'transparent' : ((n.data as { color?: string }).color ?? '#94a3b8'))}
          maskColor="hsl(var(--background) / .65)"
          style={{ width: 160, height: 100 }}
        />
        <Panel position="top-right">
          <button
            type="button"
            onClick={tidy}
            disabled={!items.length}
            data-testid="button-tidy"
            title="Re-arrange everything into a clean layout"
            className="inline-flex items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-medium shadow-sm hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <LayoutGrid size={14} /> Tidy layout
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function DiagramCanvas(props: DiagramProps) {
  // One provider per board, so switching tabs never carries routes or transient state across.
  return (
    <ReactFlowProvider key={props.mode}>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
