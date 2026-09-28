/** The visual pieces of the diagram: element cards, stickies, context boxes, boundaries, routed edges. */
import {
  Handle,
  Position,
  useConnection,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { EVENT_KINDS } from '@/components/symbol-palette';
import { MARKER_COLORS, MARKER_SHAPES, colorFor, markerId, styleFor, type MarkerShape } from '@/diagram/relations';
import { toPath, type Point } from '@/diagram/router';

// ---------------------------------------------------------------------------- node data

export type ElementData = {
  name: string;
  kind: string;
  description: string;
  status: string;
  methods: string[];
  color: string;
  dimmed: boolean;
};
export type ContextBoxData = { name: string; purpose: string; color: string; elements: number; dimmed: boolean };
export type BoundaryData = { name: string; color: string; count: number };
export type ElementNodeType = Node<ElementData, 'element'>;
export type StickyNodeType = Node<ElementData, 'sticky'>;
export type ContextNodeType = Node<ContextBoxData, 'context'>;
export type BoundaryNodeType = Node<BoundaryData, 'boundary'>;

const statusDot = (status: string) => (status === 'validated' ? 'bg-accent' : status === 'needs-review' ? 'bg-destructive' : 'bg-primary');

/**
 * Four small dots to start a connection from (shown on hover), plus one invisible full-size
 * target that only becomes active while a connection is being dragged — so you can drop a line
 * anywhere on the element, and still drag the element itself the rest of the time.
 */
function ConnectHandles() {
  const connection = useConnection();
  return (
    <>
      {(
        [
          ['top', Position.Top],
          ['right', Position.Right],
          ['bottom', Position.Bottom],
          ['left', Position.Left],
        ] as const
      ).map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} isConnectableEnd={false} className={`ddd-handle ddd-handle-${id}`} title="Drag to another element to connect" />
      ))}
      <Handle
        id="drop"
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        className="ddd-drop"
        style={{ pointerEvents: connection.inProgress ? 'all' : 'none' }}
      />
    </>
  );
}

const ring = (selected: boolean | undefined) => (selected ? 'border-primary ring-2 ring-primary/25' : 'border-border');

export function ElementNode({ data, selected }: NodeProps<ElementNodeType>) {
  return (
    <div
      className={`ddd-node relative flex h-full w-full flex-col overflow-hidden border bg-card text-left shadow-sm transition-shadow hover:shadow-md ${ring(selected)}`}
      style={{ opacity: data.dimmed ? 0.28 : 1 }}
      data-testid="node-card"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: data.color }} />
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2 pl-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">{data.kind}</span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(data.status)}`} title={data.status} />
        </div>
        <div className="mt-0.5 truncate text-[13px] font-semibold leading-tight" data-testid="text-node-name">
          {data.name}
        </div>
        <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{data.description || 'No description yet'}</div>
        <div className="mt-auto flex items-center gap-2 border-t border-border pt-1 font-mono-ui text-[9px] text-muted-foreground">
          <span className="shrink-0 uppercase tracking-[.1em]">
            {data.methods.length} {data.methods.length === 1 ? 'method' : 'methods'}
          </span>
          {data.methods[0] && <span className="min-w-0 truncate text-foreground/70">{data.methods[0]}</span>}
        </div>
      </div>
      <ConnectHandles />
    </div>
  );
}

export function StickyNode({ data, selected }: NodeProps<StickyNodeType>) {
  const meta = EVENT_KINDS.find((k) => k.kind === data.kind);
  const color = meta?.color ?? 'bg-amber-400/90 text-amber-950';
  return (
    <div
      className={`ddd-node relative flex h-full w-full flex-col border border-black/10 p-3 text-left shadow-md ${color} ${
        selected ? 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-background' : ''
      }`}
      style={{ opacity: data.dimmed ? 0.28 : 1 }}
      data-testid="event-sticky"
    >
      <div className="flex items-center gap-1 font-mono-ui text-[8px] uppercase tracking-[.1em] opacity-70">
        <StickyNote size={10} />
        {data.kind.replace(/-/g, ' ')}
      </div>
      <div className="mt-1 line-clamp-2 text-xs font-semibold leading-snug">{data.name}</div>
      <div className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-80">{data.description || '…'}</div>
      <ConnectHandles />
    </div>
  );
}

export function ContextNode({ data, selected }: NodeProps<ContextNodeType>) {
  return (
    <div
      className={`ddd-node relative flex h-full w-full flex-col border-2 bg-card px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md ${
        selected ? 'ring-2 ring-primary/25' : ''
      }`}
      style={{ borderColor: data.color, opacity: data.dimmed ? 0.28 : 1 }}
      data-testid="context-card"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: data.color }} />
        <span className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">bounded context</span>
      </div>
      <div className="truncate font-display text-sm font-semibold" data-testid="text-context-name">
        {data.name}
      </div>
      <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{data.purpose || 'No purpose yet'}</div>
      <div className="mt-auto font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground">
        {data.elements} {data.elements === 1 ? 'element' : 'elements'}
      </div>
      <ConnectHandles />
    </div>
  );
}

/**
 * The bounded-context boundary drawn around its elements. The body lets clicks and panning
 * through; only the title strip is grabbable, and dragging it moves the whole context.
 */
export function BoundaryNode({ data }: NodeProps<BoundaryNodeType>) {
  return (
    <div
      className="h-full w-full rounded-2xl"
      style={{ border: `1.5px dashed ${data.color}`, backgroundColor: `${data.color}12`, pointerEvents: 'none' }}
      data-testid="context-boundary"
    >
      <div
        className="ddd-boundary-handle inline-flex cursor-grab items-center gap-2 rounded-br-xl rounded-tl-2xl px-3 py-1.5 active:cursor-grabbing"
        style={{ pointerEvents: 'auto', backgroundColor: `${data.color}26` }}
        title="Drag to move the whole context"
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
        <span className="font-display text-xs font-semibold">{data.name}</span>
        <span className="font-mono-ui text-[9px] uppercase tracking-[.1em] text-muted-foreground">{data.count}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- edges

export type RoutedEdgeData = {
  points: Point[];
  labelAt: Point;
  type: string;
  label: string;
  showLabel: boolean;
  dimmed: boolean;
  emphasis: boolean;
};
export type RoutedEdgeType = Edge<RoutedEdgeData, 'routed'>;

const url = (shape: MarkerShape | undefined, color: string) => (shape ? `url(#${markerId(shape, color)})` : undefined);

export function RoutedEdge({ data, selected }: EdgeProps<RoutedEdgeType>) {
  if (!data) return null;
  const color = colorFor(data.type);
  const style = styleFor(data.type);
  const d = toPath(data.points);
  const label = data.label || data.type;
  const width = Math.max(48, label.length * 6.4 + 14);
  return (
    <g style={{ opacity: data.dimmed ? 0.16 : 1, transition: 'opacity .15s' }} data-testid="relationship-edge">
      {/* wide invisible stroke: an easy click target */}
      <path className="react-flow__edge-interaction" d={d} fill="none" stroke="transparent" strokeWidth={18} />
      {selected && <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />}
      <path
        className="react-flow__edge-path"
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={selected || data.emphasis ? 3 : 2}
        strokeDasharray={style.dash}
        strokeLinejoin="round"
        strokeLinecap="round"
        markerStart={url(style.start, color)}
        markerEnd={url(style.end, color)}
      />
      {data.showLabel && (
        <g transform={`translate(${data.labelAt.x} ${data.labelAt.y})`} pointerEvents="none">
          <rect x={-width / 2} y={-10} width={width} height={20} rx={4} style={{ fill: 'hsl(var(--card) / .96)', stroke: color }} strokeOpacity={0.45} />
          <text y={4} textAnchor="middle" fontSize={10} fontWeight={500} style={{ fill: 'hsl(var(--foreground))' }}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/** The dashed elbow shown while a connection is being dragged. */
export function ConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const mid = (fromX + toX) / 2;
  return (
    <g>
      <path d={`M ${fromX} ${fromY} L ${mid} ${fromY} L ${mid} ${toY} L ${toX} ${toY}`} fill="none" strokeWidth={2} strokeDasharray="6 4" style={{ stroke: 'hsl(var(--primary))' }} />
      <circle cx={toX} cy={toY} r={5} style={{ fill: 'hsl(var(--primary))' }} />
    </g>
  );
}

// ---------------------------------------------------------------------------- shared SVG definitions

const GEOMETRY: Record<MarkerShape, { w: number; h: number; refX: number; orient: string; path: string; filled: boolean; hollow?: boolean }> = {
  arrow: { w: 10, h: 10, refX: 9, orient: 'auto-start-reverse', path: 'M0,0 L10,5 L0,10', filled: false },
  'arrow-filled': { w: 10, h: 10, refX: 9, orient: 'auto-start-reverse', path: 'M0,0 L10,5 L0,10 z', filled: true },
  'diamond-hollow': { w: 14, h: 10, refX: 1, orient: 'auto', path: 'M0,5 L7,0 L14,5 L7,10 z', filled: false, hollow: true },
  'diamond-filled': { w: 14, h: 10, refX: 1, orient: 'auto', path: 'M0,5 L7,0 L14,5 L7,10 z', filled: true },
  triangle: { w: 12, h: 10, refX: 11, orient: 'auto', path: 'M0,0 L12,5 L0,10 z', filled: false, hollow: true },
};

/** Markers can not inherit an edge's colour, so one is defined per shape and colour. */
export function MarkerDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {MARKER_COLORS.flatMap((color) =>
          MARKER_SHAPES.map((shape) => {
            const g = GEOMETRY[shape];
            return (
              <marker key={`${shape}-${color}`} id={markerId(shape, color)} markerWidth={g.w} markerHeight={g.h} refX={g.refX} refY={5} orient={g.orient} markerUnits="userSpaceOnUse">
                <path
                  d={g.path}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  style={{ stroke: color, fill: g.filled ? color : g.hollow ? 'hsl(var(--card))' : 'none' }}
                />
              </marker>
            );
          }),
        )}
      </defs>
    </svg>
  );
}

export const nodeTypes = { element: ElementNode, sticky: StickyNode, context: ContextNode, boundary: BoundaryNode };
export const edgeTypes = { routed: RoutedEdge };
