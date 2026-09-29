import { useState, type ReactNode } from 'react';
import {
  Box,
  Boxes,
  ChevronDown,
  Circle,
  Command,
  Database,
  GitBranch,
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
import {
  GENERALIZATION_CONSTRAINTS,
  GENERALIZATION_CONSTRAINT_META,
  MARKER_GEOMETRY,
  colorFor,
  styleFor,
  type MarkerShape,
} from '@/diagram/relations';

export const DOMAIN_KINDS = [
  { kind: 'aggregate', label: 'Aggregate', icon: Package, hint: 'Consistency boundary' },
  { kind: 'aggregate-root', label: 'Aggregate root', icon: Hexagon, hint: 'Owns invariants' },
  { kind: 'entity', label: 'Entity', icon: Box, hint: 'Identity over time' },
  { kind: 'value-object', label: 'Value object', icon: Circle, hint: 'Immutable by value' },
  { kind: 'repository', label: 'Repository', icon: Database, hint: 'Persistence port' },
  { kind: 'service', label: 'Domain service', icon: Layers, hint: 'Cross-entity logic' },
  { kind: 'resource', label: 'Resource / API', icon: Boxes, hint: 'Exposed capability' },
  { kind: 'read-model', label: 'Read model', icon: Sparkles, hint: 'Query projection' },
  { kind: 'anti-corruption-layer', label: 'Anti-corruption layer', icon: Shield, hint: 'Translate foreign models' },
  { kind: 'saga', label: 'Saga', icon: GitBranch, hint: 'Long-running process' },
  { kind: 'process-manager', label: 'Process manager', icon: GitBranch, hint: 'Orchestrates reactions' },
  { kind: 'command-handler', label: 'Command handler', icon: Command, hint: 'CQRS write executor' },
  { kind: 'query-handler', label: 'Query handler', icon: Sparkles, hint: 'CQRS read executor' },
] as const;

export const EVENT_KINDS = [
  { kind: 'domain-event', label: 'Domain event', icon: Zap, hint: 'Something happened', color: 'bg-amber-400/90 text-amber-950' },
  { kind: 'command', label: 'Command', icon: Command, hint: 'Intent to change', color: 'bg-sky-400/90 text-sky-950' },
  { kind: 'policy', label: 'Policy', icon: Shield, hint: 'When X then Y', color: 'bg-violet-400/90 text-violet-950' },
  { kind: 'actor', label: 'Actor', icon: User, hint: 'Person or system', color: 'bg-emerald-400/90 text-emerald-950' },
] as const;

export const PROCESS_RELATIONSHIPS = [
  { type: 'triggers', label: 'Triggers', symbol: '⚡→', hint: 'Command triggers event' },
  { type: 'reacts-to', label: 'Reacts to', symbol: '←◎', hint: 'Policy/saga listens to event' },
  { type: 'orchestrates', label: 'Orchestrates', symbol: '◆→', hint: 'Central saga coordinates' },
  { type: 'choreographs', label: 'Choreographs', symbol: '⇄', hint: 'Peer event-driven flow' },
  { type: 'projects-to', label: 'Projects to', symbol: '⟹', hint: 'Event projects to read model' },
  { type: 'handles', label: 'Handles', symbol: '▷', hint: 'Handler executes command/query' },
  { type: 'publishes', label: 'Publishes', symbol: '⇢', hint: 'Aggregate publishes event' },
  { type: 'subscribes', label: 'Subscribes', symbol: '⇠', hint: 'Listener subscribes' },
] as const;

/** Tactical, element-to-element UML relationships — used on the Domain designer board only. */
export const UML_RELATIONSHIPS = [
  { type: 'composition', label: 'Composition', hint: 'Strong has-a (owns lifecycle)' },
  { type: 'aggregation', label: 'Aggregation', hint: 'Shared has-a' },
  { type: 'generalization', label: 'Generalization', hint: 'Is-a / inherits' },
  { type: 'specialization', label: 'Specialization / Realization', hint: 'Implement interface' },
  { type: 'uses', label: 'Uses / dependency', hint: 'Depends on' },
  { type: 'publishes', label: 'Publishes', hint: 'Emits event' },
  { type: 'subscribes', label: 'Subscribes', hint: 'Reacts to event' },
  { type: 'owns', label: 'Owns', hint: 'Ownership' },
  { type: 'invokes', label: 'Invokes', hint: 'Calls' },
  { type: 'exposed-by', label: 'Exposed by', hint: 'API surface' },
] as const;

/**
 * Strategic, context-to-context relationships (DDD's context-mapping patterns). These describe two
 * *Bounded Contexts* as wholes, not two elements, so they live in their own group and are only
 * offered on the Context Map — the one board where every node is a Bounded Context. `badge` is a
 * short acronym shown next to the line (these patterns look alike on the wire — dashed, filled
 * arrow — and are told apart by name, the way Vaughn Vernon's books do it).
 */
export const CONTEXT_RELATIONSHIPS = [
  { type: 'shared-kernel', label: 'Shared Kernel', hint: 'Shared model subset', badge: 'SK' },
  { type: 'customer-supplier', label: 'Customer–Supplier', hint: 'Upstream/downstream', badge: 'C→S' },
  { type: 'conformist', label: 'Conformist', hint: 'Downstream conforms', badge: 'CF' },
  { type: 'anti-corruption', label: 'Anti-corruption', hint: 'Translation layer link', badge: 'ACL' },
  { type: 'open-host-service', label: 'Open Host Service', hint: 'Published protocol', badge: 'OHS' },
  { type: 'published-language', label: 'Published Language', hint: 'Shared interchange', badge: 'PL' },
  { type: 'partnership', label: 'Partnership', hint: 'Coordinated success', badge: 'P' },
  { type: 'separate-ways', label: 'Separate Ways', hint: 'No integration', badge: 'SW' },
] as const;

// ---------------------------------------------------------------------------- collapsible section

function Section({ title, icon, storageKey, children }: { title: string; icon?: ReactNode; storageKey: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`palette-section-toggle-${storageKey}`}
        aria-expanded={open}
        className="mb-2 flex w-full items-center justify-between gap-1.5 px-1 font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <ChevronDown size={12} className={`shrink-0 transition-transform duration-150 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------- relationship glyphs

/** Symmetric shapes look identical either way round; only these need mirroring when used as a start marker. */
const MIRROR_AT_START = new Set<MarkerShape>(['arrow', 'arrow-filled', 'triangle']);

function MarkerIcon({ shape, color, atStart }: { shape: MarkerShape; color: string; atStart: boolean }) {
  const g = MARKER_GEOMETRY[shape];
  const fill = g.filled ? color : g.hollow ? 'hsl(var(--card))' : 'none';
  return (
    <svg
      width={g.w * 0.85}
      height={g.h * 0.85}
      viewBox={`0 0 ${g.w} ${g.h}`}
      className="shrink-0"
      style={atStart && MIRROR_AT_START.has(shape) ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path d={g.path} stroke={color} strokeWidth={1.8} strokeLinejoin="round" fill={fill} />
    </svg>
  );
}

/** A bold, correctly-oriented preview of the actual line drawn on the canvas for this relationship type. */
function RelationGlyph({ type }: { type: string }) {
  const { start, end, dash } = styleFor(type);
  const color = colorFor(type);
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {start && <MarkerIcon shape={start} color={color} atStart />}
      <svg width="16" height="4" viewBox="0 0 16 4" className="shrink-0">
        <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="1.8" strokeDasharray={dash} strokeLinecap="round" />
      </svg>
      {end && <MarkerIcon shape={end} color={color} atStart={false} />}
    </span>
  );
}

// ---------------------------------------------------------------------------- relationship picker button

/**
 * One relationship type in a palette group. Works by click (toggles it as the active type) *and*
 * by drag: picking it up arms it immediately, the same way clicking does, so the gesture matches
 * how element kinds are dragged onto the canvas even though a relationship — needing two
 * endpoints — can't itself be "dropped" at a single point. Where you drop (or whether you drop it
 * at all) doesn't matter; letting go anywhere simply ends the drag.
 */
function RelationButton({
  type,
  label,
  hint,
  badge,
  glyph,
  active,
  onPick,
  testId,
}: {
  type: string;
  label: string;
  hint: string;
  badge?: string;
  glyph?: boolean;
  active: boolean;
  onPick: (type: string | null) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-ddd-relation', type);
        e.dataTransfer.effectAllowed = 'copy';
        onPick(type);
      }}
      onClick={() => onPick(active ? null : type)}
      data-testid={testId ?? `palette-relation-${type}`}
      className={`flex w-full flex-col gap-1 border px-2 py-1.5 text-left transition-colors ${
        active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40'
      }`}
      title={hint}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-medium">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          {glyph && <RelationGlyph type={type} />}
          {badge && <span className="font-mono-ui text-[10px] font-bold text-foreground">{badge}</span>}
        </span>
      </div>
      <span className="text-[9px] text-muted-foreground">{hint}</span>
    </button>
  );
}

type SymbolPaletteProps = {
  mode: 'designer' | 'event-storming' | 'context-map';
  onPickKind?: (kind: string) => void;
  /** Choose the type for the next connections, or `null` to let Studio pick from the two element kinds. */
  onPickRelation: (type: string | null) => void;
  activeRelationType: string | null;
};

export function SymbolPalette({ mode, onPickKind, onPickRelation, activeRelationType }: SymbolPaletteProps) {
  const kinds = mode === 'event-storming' ? EVENT_KINDS : DOMAIN_KINDS;

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-border bg-card" data-testid="symbol-palette">
      <div className="border-b border-border px-3 py-3">
        <div className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">Palette</div>
        <div className="mt-0.5 text-xs font-semibold">
          {mode === 'event-storming' ? 'Event storming' : mode === 'context-map' ? 'Context map' : 'Model elements'}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {mode !== 'context-map' && (
          <Section title={mode === 'event-storming' ? 'Drag / click to add' : 'Elements'} storageKey="elements">
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
                    onClick={() => onPickKind?.(item.kind)}
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
          </Section>
        )}

        {mode === 'event-storming' && (
          <Section title="Process links" icon={<Link2 size={11} />} storageKey="process-links">
            <div className="space-y-1">
              {PROCESS_RELATIONSHIPS.map((rel) => (
                <button
                  type="button"
                  key={rel.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-ddd-relation', rel.type);
                    e.dataTransfer.effectAllowed = 'copy';
                    onPickRelation(rel.type);
                  }}
                  onClick={() => onPickRelation(activeRelationType === rel.type ? null : rel.type)}
                  data-testid={`palette-relation-${rel.type}`}
                  className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${
                    activeRelationType === rel.type ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border'
                  }`}
                  title={rel.hint}
                >
                  <span className="font-mono text-[12px] font-bold text-primary">{rel.symbol}</span>
                  <span className="flex-1">{rel.label}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {(mode === 'designer' || mode === 'context-map') && (
          <Section
            title={mode === 'context-map' ? 'Bounded Context relationships' : 'UML relationships'}
            icon={<Link2 size={11} />}
            storageKey={mode === 'context-map' ? 'context-relationships' : 'uml-relationships'}
          >
            <button
              type="button"
              onClick={() => onPickRelation(null)}
              data-testid="palette-relation-auto"
              className={`mb-1 flex w-full flex-col gap-0.5 border px-2 py-1.5 text-left transition-colors ${
                activeRelationType === null ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40'
              }`}
              title={mode === 'context-map' ? 'Studio uses Customer–Supplier by default' : 'Studio picks the relationship from the two element kinds'}
            >
              <span className="text-[11px] font-medium">Auto</span>
              <span className="text-[9px] text-muted-foreground">
                {mode === 'context-map' ? 'Defaults to Customer–Supplier' : 'Chosen from the two element kinds'}
              </span>
            </button>
            <div className="space-y-1">
              {(mode === 'context-map' ? CONTEXT_RELATIONSHIPS : UML_RELATIONSHIPS).map((rel) => (
                <RelationButton
                  key={rel.type}
                  type={rel.type}
                  label={rel.label}
                  hint={rel.hint}
                  badge={'badge' in rel ? rel.badge : undefined}
                  glyph
                  active={activeRelationType === rel.type}
                  onPick={onPickRelation}
                />
              ))}
            </div>
            <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted-foreground">
              {mode === 'context-map'
                ? 'Drag a type here (or click it), then drag from the dot on one Bounded Context to another. These relationships only ever connect two Bounded Contexts.'
                : 'Drag from the dot on an element to another element to connect them. Pick a type here — by dragging it or clicking it — to use it for the next connections, or leave it on Auto. Select a line to change or reverse it.'}
            </p>
          </Section>
        )}

        {mode === 'designer' && (
          <Section title="Generalization set" storageKey="generalization-set">
            <div className="space-y-1.5">
              {GENERALIZATION_CONSTRAINTS.map((c) => (
                <div key={c} className="flex items-center gap-2 border border-border bg-background px-2 py-1.5" title={GENERALIZATION_CONSTRAINT_META[c].hint}>
                  <span className="flex h-5 min-w-[28px] items-center justify-center rounded-full bg-primary px-1.5 font-mono-ui text-[9px] font-bold uppercase text-primary-foreground">
                    {c}
                  </span>
                  <span className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">{GENERALIZATION_CONSTRAINT_META[c].hint}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 px-1 text-[10px] leading-relaxed text-muted-foreground">
              A constraint on a shared superclass with two or more Generalization/Specialization arrows pointing at it — set it from that element&apos;s inspector, not by dragging.
            </p>
          </Section>
        )}

        {mode === 'event-storming' && (
          <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted-foreground">
            Click a sticky or drag it onto the board. To link two stickies, drag from the dot on one to the other; the link type is picked from the two kinds unless you choose one above.
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
