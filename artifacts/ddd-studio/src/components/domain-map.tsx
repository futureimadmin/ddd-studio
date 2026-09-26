import { useMemo } from 'react';
import { ArrowRight, CircleDot, Link2 } from 'lucide-react';

type MapNode = {
  id: string;
  contextId: string;
  kind: string;
  name: string;
  description: string;
  status: string;
  methods?: string[];
};

type MapRelationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label: string;
};

type MapContext = {
  id: string;
  color: string;
};

type DomainMapProps = {
  nodes: MapNode[];
  relationships: MapRelationship[];
  contexts: MapContext[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string) => void;
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
};

function getGridPosition(index: number, count: number) {
  const columns = count <= 6 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 3 ? [17, 50, 83][column] : [12, 37, 63, 88][column];
  const y = rows === 1 ? 50 : 14 + (row / (rows - 1)) * 72;
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

export function DomainMap({ nodes, relationships, contexts, selectedId, zoom, onSelect }: DomainMapProps) {
  const positions = useMemo(() => {
    const next = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, index) => next.set(node.id, getGridPosition(index, nodes.length)));
    return next;
  }, [nodes]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const visibleRelationships = relationships.filter(
    (relationship) => positions.has(relationship.sourceId) && positions.has(relationship.targetId),
  );
  const rows = Math.max(1, Math.ceil(nodes.length / (nodes.length <= 6 ? 3 : 4)));
  const canvasHeight = Math.max(700, rows * 230 + 100);

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
          <defs>
            <marker id="domain-map-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L9,4.5 L0,9 z" fill="hsl(var(--accent))" />
            </marker>
          </defs>
          {visibleRelationships.map((relationship) => {
            const sourcePosition = positions.get(relationship.sourceId)!;
            const targetPosition = positions.get(relationship.targetId)!;
            const color = relationColors[relationship.type] ?? 'hsl(var(--accent))';
            const label = relationship.label || relationship.type;
            const labelX = ((sourcePosition.x + targetPosition.x) / 2) * 10;
            const labelY = ((sourcePosition.y + targetPosition.y) / 2) * 10 - 8;
            return (
              <g key={relationship.id}>
                <path
                  d={edgePath(sourcePosition, targetPosition)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.2"
                  strokeDasharray={relationship.type === 'uses' || relationship.type === 'subscribes' ? '8 6' : undefined}
                  strokeLinecap="round"
                  markerEnd="url(#domain-map-arrow)"
                  opacity=".9"
                />
                <rect x={labelX - Math.max(24, label.length * 3.3)} y={labelY - 9} width={Math.max(48, label.length * 6.6)} height="18" rx="3" fill="hsl(var(--card) / .94)" stroke={color} strokeOpacity=".38" />
                <text x={labelX} y={labelY + 3} fill="hsl(var(--foreground))" fontSize="10" fontWeight="500" textAnchor="middle">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
        {nodes.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
            <div className="max-w-sm border border-dashed border-border bg-card/80 p-8 text-center">
              <CircleDot size={28} className="mx-auto text-primary" />
              <h3 className="mt-4 font-display text-xl font-semibold">No elements match this view</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Try another context or clear your search, then keep shaping the map.</p>
            </div>
          </div>
        ) : (
          nodes.map((node) => {
            const position = positions.get(node.id)!;
            const context = contexts.find((item) => item.id === node.contextId);
            const methods = node.methods ?? [];
            const isSelected = node.id === selectedId;
            return (
              <button
                type="button"
                key={node.id}
                onClick={() => onSelect(node.id)}
                data-testid={`node-card-${node.id}`}
                className={`absolute z-10 flex min-h-[148px] w-[142px] -translate-x-1/2 -translate-y-1/2 flex-col border bg-card px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-[calc(50%+3px)] hover:shadow-md ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: context?.color ?? '#e7a94b' }} />
                  <span className="truncate font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">{node.kind}</span>
                </div>
                <div className="truncate text-xs font-semibold" data-testid={`text-node-name-${node.id}`}>{node.name}</div>
                <div className="mt-1 line-clamp-2 min-h-[28px] text-[10px] leading-relaxed text-muted-foreground">{node.description || 'No description yet'}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${node.status === 'validated' ? 'bg-accent' : node.status === 'needs-review' ? 'bg-destructive' : 'bg-primary'}`} />
                  <span className="font-mono-ui text-[9px] text-muted-foreground">{node.status}</span>
                </div>
                <div className="mt-auto border-t border-border pt-2">
                  <div className="flex items-center gap-1 font-mono-ui text-[8px] uppercase tracking-[.1em] text-muted-foreground">
                    <Link2 size={10} /> {methods.length} {methods.length === 1 ? 'method' : 'methods'}
                  </div>
                  {methods.length > 0 && <div className="mt-1 truncate text-[9px] text-foreground/70">{methods[0]}</div>}
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-3 border border-border bg-card/90 px-3 py-2 font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground shadow-sm">
        <span className="flex items-center gap-1.5"><ArrowRight size={11} className="text-accent" /> {visibleRelationships.length} visible connections</span>
        <span className="hidden text-border sm:inline">•</span>
        <span className="hidden sm:inline">auto-arranged</span>
      </div>
    </div>
  );
}