import {
  Box,
  Boxes,
  Circle,
  Command,
  Database,
  Hexagon,
  Layers,
  Link2,
  Package,
  Shield,
  Sparkles,
  StickyNote,
  User,
  Zap,
} from 'lucide-react';

export const DOMAIN_KINDS = [
  { kind: 'aggregate', label: 'Aggregate', icon: Package, hint: 'Consistency boundary' },
  { kind: 'aggregate-root', label: 'Aggregate root', icon: Hexagon, hint: 'Owns invariants' },
  { kind: 'entity', label: 'Entity', icon: Box, hint: 'Identity over time' },
  { kind: 'value-object', label: 'Value object', icon: Circle, hint: 'Immutable by value' },
  { kind: 'repository', label: 'Repository', icon: Database, hint: 'Persistence port' },
  { kind: 'service', label: 'Domain service', icon: Layers, hint: 'Cross-entity logic' },
  { kind: 'resource', label: 'Resource / API', icon: Boxes, hint: 'Exposed capability' },
  { kind: 'read-model', label: 'Read model', icon: Sparkles, hint: 'Query projection' },
] as const;

export const EVENT_KINDS = [
  { kind: 'domain-event', label: 'Domain event', icon: Zap, hint: 'Something happened', color: 'bg-amber-400/90 text-amber-950' },
  { kind: 'command', label: 'Command', icon: Command, hint: 'Intent to change', color: 'bg-sky-400/90 text-sky-950' },
  { kind: 'policy', label: 'Policy', icon: Shield, hint: 'When X then Y', color: 'bg-violet-400/90 text-violet-950' },
  { kind: 'actor', label: 'Actor', icon: User, hint: 'Person or system', color: 'bg-emerald-400/90 text-emerald-950' },
] as const;

export const UML_RELATIONSHIPS = [
  { type: 'composition', label: 'Composition', symbol: '◆——▷', hint: 'Strong has-a (owns lifecycle)' },
  { type: 'aggregation', label: 'Aggregation', symbol: '◇——▷', hint: 'Shared has-a' },
  { type: 'generalization', label: 'Generalization', symbol: '——△', hint: 'Is-a / inherits' },
  { type: 'specialization', label: 'Specialization', symbol: '——△', hint: 'Specializes' },
  { type: 'uses', label: 'Uses / dependency', symbol: '····▷', hint: 'Depends on' },
  { type: 'publishes', label: 'Publishes', symbol: '——▶', hint: 'Emits event' },
  { type: 'subscribes', label: 'Subscribes', symbol: '····▷', hint: 'Reacts to event' },
  { type: 'owns', label: 'Owns', symbol: '◆——▷', hint: 'Ownership' },
  { type: 'invokes', label: 'Invokes', symbol: '——▶', hint: 'Calls' },
  { type: 'exposed-by', label: 'Exposed by', symbol: '——▶', hint: 'API surface' },
] as const;

type SymbolPaletteProps = {
  mode: 'designer' | 'event-storming';
  onPickKind: (kind: string) => void;
  onPickRelation: (type: string) => void;
  activeRelationType: string | null;
  connectMode: boolean;
};

export function SymbolPalette({ mode, onPickKind, onPickRelation, activeRelationType, connectMode }: SymbolPaletteProps) {
  const kinds = mode === 'event-storming' ? EVENT_KINDS : DOMAIN_KINDS;

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-border bg-card" data-testid="symbol-palette">
      <div className="border-b border-border px-3 py-3">
        <div className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">Palette</div>
        <div className="mt-0.5 text-xs font-semibold">{mode === 'event-storming' ? 'Event storming' : 'Model elements'}</div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="mb-2 px-1 font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">
          {mode === 'event-storming' ? 'Drag / click to add' : 'Elements'}
        </div>
        <div className="space-y-1">
          {kinds.map((item) => {
            const Icon = item.icon;
            const stormColor = 'color' in item ? item.color : undefined;
            return (
              <button
                type="button"
                key={item.kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-ddd-kind', item.kind);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onPickKind(item.kind)}
                data-testid={`palette-kind-${item.kind}`}
                className={`flex w-full items-center gap-2 border px-2 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/60 ${
                  stormColor ? `border-transparent ${stormColor}` : 'border-border bg-background'
                }`}
                title={item.hint}
              >
                <Icon size={14} strokeWidth={1.7} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {mode === 'designer' && (
          <>
            <div className="mb-2 mt-4 flex items-center gap-1.5 px-1 font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">
              <Link2 size={11} /> UML relationships
            </div>
            <div className="space-y-1">
              {UML_RELATIONSHIPS.map((rel) => (
                <button
                  type="button"
                  key={rel.type}
                  onClick={() => onPickRelation(rel.type)}
                  data-testid={`palette-relation-${rel.type}`}
                  className={`flex w-full flex-col gap-0.5 border px-2 py-1.5 text-left transition-colors ${
                    activeRelationType === rel.type && connectMode
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                  title={rel.hint}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium">{rel.label}</span>
                    <span className="font-mono-ui text-[10px] text-muted-foreground">{rel.symbol}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">{rel.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted-foreground">
              Select a UML type, then click source element → target element. Lines use symbols only — no text labels.
            </p>
          </>
        )}

        {mode === 'event-storming' && (
          <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted-foreground">
            Click a sticky or drag it onto the board. Commands, events, policies, and actors live on this board only.
          </p>
        )}
      </div>
    </aside>
  );
}

export function EventSticky({
  node,
  selected,
  onSelect,
}: {
  node: { id: string; kind: string; name: string; description: string; status: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = EVENT_KINDS.find((k) => k.kind === node.kind);
  const color = meta?.color ?? 'bg-amber-400/90 text-amber-950';
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`event-sticky-${node.id}`}
      className={`flex min-h-[100px] w-[140px] flex-col border border-black/10 p-3 text-left shadow-md transition-transform hover:-translate-y-0.5 ${color} ${
        selected ? 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-background' : ''
      }`}
    >
      <div className="flex items-center gap-1 font-mono-ui text-[8px] uppercase tracking-[.1em] opacity-70">
        <StickyNote size={10} />
        {node.kind.replace('-', ' ')}
      </div>
      <div className="mt-1 text-xs font-semibold leading-snug">{node.name}</div>
      <div className="mt-1 line-clamp-3 text-[10px] leading-relaxed opacity-80">{node.description || '…'}</div>
    </button>
  );
}
