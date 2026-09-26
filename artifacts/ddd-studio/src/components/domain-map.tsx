import { useMemo } from 'react';
import { ArrowRight, CircleDot } from 'lucide-react';

export type MapNode = {
  id: string;
  contextId: string;
  kind: string;
  name: string;
  description: string;
  status: string;
  methods?: string[];
  x?: number;
  y?: number;
};

export type MapRelationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label: string;
  contextId?: string;
};

export type MapContext = {
  id: string;
  name?: string;
  color: string;
  purpose?: string;
};

type DomainMapProps = {
  nodes: MapNode[];
  relationships: MapRelationship[];
  contexts: MapContext[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string) => void;
  /** When true, draw text labels on edges (Context Map only). Designer uses UML symbols only. */
  showLabels?: boolean;
  /** When true, render larger context boxes instead of domain element cards. */
  contextMode?: boolean;
  /** Optional: start a relationship from this node (connect mode). */
  connectFromId?: string | null;
  onConnectStart?: (id: string) => void;
  onConnectEnd?: (id: string) => void;
};

const relationColors: Record<string, string> = {
  uses: 'hsl(var(--primary))',
  aggregation: 'hsl(var(--accent))',
  composition: 'hsl(var(--accent))',
  generalization: 'hsl(var(--chart-4))',
  specialization: 'hsl(var(--chart-4))',
  publishes: 'hsl(var(--chart-3))',
  subscribes: 'hsl(var(--chart-3))',
  owns: 'hsl(var(--chart-2))',
  invokes: 'hsl(var(--primary))',
  'exposed-by': 'hsl(var(--chart-4))',
  'shared-kernel': 'hsl(var(--chart-2))',
  'customer-supplier': 'hsl(var(--primary))',
  conformist: 'hsl(var(--muted-foreground))',
  'anti-corruption': 'hsl(var(--destructive))',
  'open-host-service': 'hsl(var(--chart-3))',
  'published-language': 'hsl(var(--chart-3))',
  partnership: 'hsl(var(--accent))',
  'separate-ways': 'hsl(var(--border))',
};

function getGridPosition(index: number, count: number) {
  const columns = count <= 6 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 3 ? [17, 50, 83][column] : [12, 37, 63, 88][column];
  const y = rows === 1 ? 50 : 14 + (row / Math.max(1, rows - 1)) * 72;
  return { x, y };
}

function edgePath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const startX = source.x * 10;
  const startY = source.y * 10;
  const endX = target.x * 10;
  const endY = target.y * 10;
  const distance = Math.max(70, Math.abs(endX - startX) * 0.32);
  const direction = endX >= startX ? 1 : -1;
  return `M ${startX} ${startY} C ${startX + distance * direction} ${startY}, ${endX - distance * direction} ${endY}, ${endX} ${endY}`;
}

/** UML-style markers for relationship types (no text labels in designer). */
function RelationshipMarkers() {
  return (
    <defs>
      {/* Open arrow — uses / invokes / publishes / subscribes */}
      <marker id="uml-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L10,5 L0,10" fill="none" stroke="context-stroke" strokeWidth="1.5" />
      </marker>
      {/* Filled arrow */}
      <marker id="uml-arrow-filled" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
      </marker>
      {/* Hollow diamond — aggregation (has-a shared) */}
      <marker id="uml-diamond-hollow" markerWidth="14" markerHeight="10" refX="1" refY="5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,5 L7,0 L14,5 L7,10 z" fill="hsl(var(--card))" stroke="context-stroke" strokeWidth="1.4" />
      </marker>
      {/* Filled diamond — composition (has-a strong / owns) */}
      <marker id="uml-diamond-filled" markerWidth="14" markerHeight="10" refX="1" refY="5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,5 L7,0 L14,5 L7,10 z" fill="context-stroke" stroke="context-stroke" strokeWidth="1.4" />
      </marker>
      {/* Hollow triangle — generalization / specialization */}
      <marker id="uml-triangle" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L12,5 L0,10 z" fill="hsl(var(--card))" stroke="context-stroke" strokeWidth="1.4" />
      </marker>
      {/* Simple filled arrow for context map labels */}
      <marker id="domain-map-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L9,4.5 L0,9 z" fill="hsl(var(--accent))" />
      </marker>
    </defs>
  );
}

function markersForType(type: string): { start?: string; end?: string; dash?: string } {
  switch (type) {
    case 'composition':
    case 'owns':
      return { start: 'url(#uml-diamond-filled)', end: 'url(#uml-arrow)' };
    case 'aggregation':
      return { start: 'url(#uml-diamond-hollow)', end: 'url(#uml-arrow)' };
    case 'generalization':
    case 'specialization':
      return { end: 'url(#uml-triangle)' };
    case 'uses':
    case 'subscribes':
      return { end: 'url(#uml-arrow)', dash: '7 5' };
    case 'publishes':
    case 'invokes':
    case 'exposed-by':
      return { end: 'url(#uml-arrow-filled)' };
    case 'shared-kernel':
    case 'partnership':
      return { end: 'url(#uml-arrow)', start: 'url(#uml-arrow)' };
    case 'customer-supplier':
    case 'conformist':
    case 'open-host-service':
    case 'published-language':
    case 'anti-corruption':
      return { end: 'url(#uml-arrow-filled)', dash: '2 4' };
    case 'separate-ways':
      return { dash: '1 6' };
    default:
      return { end: 'url(#uml-arrow)' };
  }
}

export function DomainMap({
  nodes,
  relationships,
  contexts,
  selectedId,
  zoom,
  onSelect,
  showLabels = false,
  contextMode = false,
  connectFromId = null,
  onConnectStart,
  onConnectEnd,
}: DomainMapProps) {
  const positions = useMemo(() => {
    const next = new Map<string, { x: number; y: number }>();
    if (contextMode) {
      contexts.forEach((ctx, index) => {
        next.set(ctx.id, getGridPosition(index, Math.max(1, contexts.length)));
      });
    } else {
      nodes.forEach((node, index) => {
        if (typeof node.x === 'number' && typeof node.y === 'number') {
          next.set(node.id, { x: node.x, y: node.y });
        } else {
          next.set(node.id, getGridPosition(index, nodes.length));
        }
      });
    }
    return next;
  }, [nodes, contexts, contextMode]);

  const visibleRelationships = useMemo(() => {
    if (contextMode) {
      // Derive inter-context edges from node relationships that cross contexts
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      const seen = new Set<string>();
      const edges: MapRelationship[] = [];
      for (const rel of relationships) {
        const s = nodeById.get(rel.sourceId);
        const t = nodeById.get(rel.targetId);
        if (!s || !t || s.contextId === t.contextId) continue;
        const key = [s.contextId, t.contextId, rel.type].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          id: `ctx-${rel.id}`,
          sourceId: s.contextId,
          targetId: t.contextId,
          type: rel.type,
          label: rel.label || rel.type,
          contextId: s.contextId,
        });
      }
      return edges.filter((e) => positions.has(e.sourceId) && positions.has(e.targetId));
    }
    return relationships.filter((r) => positions.has(r.sourceId) && positions.has(r.targetId));
  }, [relationships, nodes, positions, contextMode]);

  const itemCount = contextMode ? contexts.length : nodes.length;
  const rows = Math.max(1, Math.ceil(itemCount / (itemCount <= 6 ? 3 : 4)));
  const canvasHeight = Math.max(700, rows * 230 + 100);

  const handleNodeClick = (id: string) => {
    if (connectFromId && connectFromId !== id && onConnectEnd) {
      onConnectEnd(id);
      return;
    }
    if (onConnectStart && !connectFromId) {
      // single click still selects; double-path handled by explicit connect mode from parent
    }
    onSelect(id);
  };

  return (
    <div className="relative min-h-[610px] overflow-auto bg-background/60">
      <div
        className="grid-paper relative min-h-[700px] min-w-[720px] overflow-hidden"
        style={{ height: `${canvasHeight}px`, zoom }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/.08),transparent_27%),radial-gradient(circle_at_85%_80%,hsl(var(--accent)/.06),transparent_28%)]" />
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-label={`${visibleRelationships.length} relationships`}
        >
          <RelationshipMarkers />
          {visibleRelationships.map((relationship) => {
            const sourcePosition = positions.get(relationship.sourceId)!;
            const targetPosition = positions.get(relationship.targetId)!;
            const color = relationColors[relationship.type] ?? 'hsl(var(--accent))';
            const { start, end, dash } = markersForType(relationship.type);
            const label = relationship.label || relationship.type;
            const labelX = ((sourcePosition.x + targetPosition.x) / 2) * 10;
            const labelY = ((sourcePosition.y + targetPosition.y) / 2) * 10 - 8;
            return (
              <g key={relationship.id} style={{ stroke: color }}>
                <path
                  d={edgePath(sourcePosition, targetPosition)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.2"
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  markerStart={start}
                  markerEnd={end ?? 'url(#domain-map-arrow)'}
                  opacity=".92"
                />
                {showLabels && (
                  <>
                    <rect
                      x={labelX - Math.max(24, label.length * 3.3)}
                      y={labelY - 9}
                      width={Math.max(48, label.length * 6.6)}
                      height="18"
                      rx="3"
                      fill="hsl(var(--card) / .94)"
                      stroke={color}
                      strokeOpacity=".38"
                    />
                    <text x={labelX} y={labelY + 3} fill="hsl(var(--foreground))" fontSize="10" fontWeight="500" textAnchor="middle">
                      {label}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {itemCount === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
            <div className="max-w-sm border border-dashed border-border bg-card/80 p-8 text-center">
              <CircleDot size={28} className="mx-auto text-primary" />
              <h3 className="mt-4 font-display text-xl font-semibold">
                {contextMode ? 'No bounded contexts yet' : 'No elements match this view'}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {contextMode
                  ? 'Create a bounded context to start the context map.'
                  : 'Try another context or clear your search, then keep shaping the map.'}
              </p>
            </div>
          </div>
        ) : contextMode ? (
          contexts.map((ctx) => {
            const position = positions.get(ctx.id)!;
            const isSelected = ctx.id === selectedId;
            return (
              <button
                type="button"
                key={ctx.id}
                onClick={() => handleNodeClick(ctx.id)}
                data-testid={`context-card-${ctx.id}`}
                className={`absolute z-10 flex min-h-[120px] w-[180px] -translate-x-1/2 -translate-y-1/2 flex-col border-2 bg-card px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-[calc(50%+3px)] hover:shadow-md ${
                  isSelected ? 'ring-2 ring-primary/25' : ''
                }`}
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  borderColor: ctx.color,
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ctx.color }} />
                  <span className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">bounded context</span>
                </div>
                <div className="truncate font-display text-sm font-semibold" data-testid={`text-context-name-${ctx.id}`}>
                  {ctx.name}
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                  {ctx.purpose || 'No purpose yet'}
                </div>
              </button>
            );
          })
        ) : (
          nodes.map((node) => {
            const position = positions.get(node.id)!;
            const context = contexts.find((item) => item.id === node.contextId);
            const methods = node.methods ?? [];
            const isSelected = node.id === selectedId;
            const isConnectSource = connectFromId === node.id;
            return (
              <button
                type="button"
                key={node.id}
                onClick={() => handleNodeClick(node.id)}
                data-testid={`node-card-${node.id}`}
                className={`absolute z-10 flex min-h-[148px] w-[142px] -translate-x-1/2 -translate-y-1/2 flex-col border bg-card px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-[calc(50%+3px)] hover:shadow-md ${
                  isSelected || isConnectSource ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                } ${connectFromId && !isConnectSource ? 'cursor-crosshair' : ''}`}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: context?.color ?? '#e7a94b' }} />
                  <span className="truncate font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">{node.kind}</span>
                </div>
                <div className="truncate text-xs font-semibold" data-testid={`text-node-name-${node.id}`}>
                  {node.name}
                </div>
                <div className="mt-1 line-clamp-2 min-h-[28px] text-[10px] leading-relaxed text-muted-foreground">
                  {node.description || 'No description yet'}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      node.status === 'validated' ? 'bg-accent' : node.status === 'needs-review' ? 'bg-destructive' : 'bg-primary'
                    }`}
                  />
                  <span className="font-mono-ui text-[9px] text-muted-foreground">{node.status}</span>
                </div>
                <div className="mt-auto border-t border-border pt-2">
                  <div className="font-mono-ui text-[8px] uppercase tracking-[.1em] text-muted-foreground">
                    {methods.length} {methods.length === 1 ? 'method' : 'methods'}
                  </div>
                  {methods.length > 0 && <div className="mt-1 truncate text-[9px] text-foreground/70">{methods[0]}</div>}
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-3 border border-border bg-card/90 px-3 py-2 font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground shadow-sm">
        <span className="flex items-center gap-1.5">
          <ArrowRight size={11} className="text-accent" /> {visibleRelationships.length} visible connections
        </span>
        {!showLabels && !contextMode && (
          <>
            <span className="hidden text-border sm:inline">•</span>
            <span className="hidden sm:inline">UML symbols · no labels</span>
          </>
        )}
        {showLabels && contextMode && (
          <>
            <span className="hidden text-border sm:inline">•</span>
            <span className="hidden sm:inline">context map · labeled</span>
          </>
        )}
      </div>
    </div>
  );
}
