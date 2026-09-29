/** How each relationship type looks, and which type to pick when the user just drags A onto B. */

/**
 * Context-mapping (strategic) types. These describe integration between two *bounded contexts*
 * as wholes (DDD's Customer-Supplier, Conformist, Anti-Corruption Layer, Open Host Service,
 * Published Language, Partnership, Shared Kernel, Separate Ways) — they belong on the Context
 * Map. Everything else is a tactical, element-level relationship and belongs on the Domain
 * designer / Event storming boards.
 */
export const CONTEXT_MAP_TYPES = [
  'shared-kernel',
  'customer-supplier',
  'conformist',
  'anti-corruption',
  'open-host-service',
  'published-language',
  'partnership',
  'separate-ways',
] as const;
export const CONTEXT_MAP_TYPE_SET = new Set<string>(CONTEXT_MAP_TYPES);
export const isStrategicType = (type: string) => CONTEXT_MAP_TYPE_SET.has(type);

/** Tactical types that express strong structural ownership — DDD discourages these across a context boundary. */
const STRUCTURAL_TYPES = new Set(['composition', 'aggregation', 'owns']);
export const isStructuralType = (type: string) => STRUCTURAL_TYPES.has(type);

export const RELATION_COLORS: Record<string, string> = {
  uses: 'hsl(var(--primary))',
  aggregation: 'hsl(var(--accent))',
  composition: 'hsl(var(--accent))',
  generalization: 'hsl(var(--chart-4))',
  specialization: 'hsl(var(--chart-4))',
  publishes: 'hsl(var(--chart-3))',
  subscribes: 'hsl(var(--chart-3))',
  triggers: 'hsl(var(--chart-3))',
  'reacts-to': 'hsl(var(--chart-5, var(--chart-3)))',
  orchestrates: 'hsl(var(--primary))',
  choreographs: 'hsl(var(--accent))',
  'projects-to': 'hsl(var(--chart-2))',
  handles: 'hsl(var(--primary))',
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
  'separate-ways': 'hsl(var(--muted-foreground))',
};

export const colorFor = (type: string) => RELATION_COLORS[type] ?? 'hsl(var(--accent))';

export type MarkerShape = 'arrow' | 'arrow-filled' | 'diamond-hollow' | 'diamond-filled' | 'triangle';
export type EdgeStyle = { start?: MarkerShape; end?: MarkerShape; dash?: string };

/** UML notation for each relationship type. */
export function styleFor(type: string): EdgeStyle {
  switch (type) {
    case 'composition':
    case 'owns':
      return { start: 'diamond-filled', end: 'arrow' };
    case 'aggregation':
      return { start: 'diamond-hollow', end: 'arrow' };
    // Generalization: solid line, hollow triangle (class inheritance — "is a").
    case 'generalization':
      return { end: 'triangle' };
    // Specialization / Realization: dashed line, hollow triangle — UML's Realization notation
    // ("implements"), reused here for the subtype-facing direction of a hierarchy too.
    case 'specialization':
      return { end: 'triangle', dash: '6 4' };
    case 'uses':
    case 'subscribes':
      return { end: 'arrow', dash: '7 5' };
    case 'publishes':
    case 'triggers':
    case 'orchestrates':
    case 'projects-to':
    case 'handles':
    case 'invokes':
    case 'exposed-by':
      return { end: 'arrow-filled' };
    case 'reacts-to':
    case 'choreographs':
      return { end: 'arrow', dash: '4 4' };
    case 'shared-kernel':
    case 'partnership':
      return { start: 'arrow', end: 'arrow' };
    case 'customer-supplier':
    case 'conformist':
    case 'open-host-service':
    case 'published-language':
    case 'anti-corruption':
      return { end: 'arrow-filled', dash: '2 4' };
    case 'separate-ways':
      return { dash: '1 6' };
    default:
      return { end: 'arrow' };
  }
}

export const MARKER_SHAPES: MarkerShape[] = ['arrow', 'arrow-filled', 'diamond-hollow', 'diamond-filled', 'triangle'];
/** Distinct colours in use, so one marker per shape and colour can be defined once. */
export const MARKER_COLORS = [...new Set(Object.values(RELATION_COLORS)), 'hsl(var(--accent))'];
export const markerId = (shape: MarkerShape, color: string) => `ddd-mk-${shape}-${MARKER_COLORS.indexOf(color)}`;

/**
 * The arrowhead/diamond geometry for each marker shape, in its own small coordinate box.
 * Shared by the canvas's <marker> defs (diagram-parts.tsx) and the palette's inline previews
 * (symbol-palette.tsx), so what you pick in the palette is exactly what you see on the canvas.
 */
export const MARKER_GEOMETRY: Record<MarkerShape, { w: number; h: number; refX: number; orient: string; path: string; filled: boolean; hollow?: boolean }> = {
  arrow: { w: 10, h: 10, refX: 9, orient: 'auto-start-reverse', path: 'M0,0 L10,5 L0,10', filled: false },
  'arrow-filled': { w: 10, h: 10, refX: 9, orient: 'auto-start-reverse', path: 'M0,0 L10,5 L0,10 z', filled: true },
  'diamond-hollow': { w: 14, h: 10, refX: 1, orient: 'auto', path: 'M0,5 L7,0 L14,5 L7,10 z', filled: false, hollow: true },
  'diamond-filled': { w: 14, h: 10, refX: 1, orient: 'auto', path: 'M0,5 L7,0 L14,5 L7,10 z', filled: true },
  triangle: { w: 12, h: 10, refX: 11, orient: 'auto', path: 'M0,0 L12,5 L0,10 z', filled: false, hollow: true },
};

/**
 * UML generalization-set constraints: set on a shared *superclass* element (two or more
 * generalization/specialization arrows point at it) to say whether an instance can be more than
 * one subtype at once. Not a connection between two elements — a badge on that one element.
 */
export const GENERALIZATION_CONSTRAINTS = ['and', 'or', 'xor'] as const;
export type GeneralizationConstraint = (typeof GENERALIZATION_CONSTRAINTS)[number] | 'none';
export const GENERALIZATION_CONSTRAINT_META: Record<(typeof GENERALIZATION_CONSTRAINTS)[number], { label: string; hint: string }> = {
  and: { label: 'AND (overlapping)', hint: 'Can be more than one subtype at once' },
  or: { label: 'OR (inclusive)', hint: 'At least one subtype applies' },
  xor: { label: 'XOR (disjoint)', hint: 'Exactly one subtype at a time' },
};

const DOMAIN_LEAF = new Set(['entity', 'value-object']);
const AGGREGATE_LIKE = new Set(['aggregate', 'aggregate-root']);

export type Inferred = { type: string; /** Draw the relationship the other way round (target → source). */ swap: boolean };

/**
 * The relationship that almost always makes sense between two kinds of element, so that dragging
 * one onto the other needs no further input. Anything unusual falls back to a plain dependency;
 * the type can be changed afterwards by selecting the line.
 */
export function inferRelation(sourceKind: string, targetKind: string): Inferred {
  const pair = (a: string, b: string) => sourceKind === a && targetKind === b;
  if (sourceKind === 'aggregate' && targetKind === 'aggregate-root') return { type: 'composition', swap: false };
  if (sourceKind === 'aggregate-root' && targetKind === 'aggregate') return { type: 'composition', swap: true };
  if (AGGREGATE_LIKE.has(sourceKind) && DOMAIN_LEAF.has(targetKind)) return { type: 'composition', swap: false };
  if (DOMAIN_LEAF.has(sourceKind) && AGGREGATE_LIKE.has(targetKind)) return { type: 'composition', swap: true };
  if (pair('entity', 'value-object')) return { type: 'composition', swap: false };
  if (pair('value-object', 'entity')) return { type: 'composition', swap: true };
  if (AGGREGATE_LIKE.has(sourceKind) && targetKind === 'domain-event') return { type: 'publishes', swap: false };
  if (sourceKind === 'domain-event' && AGGREGATE_LIKE.has(targetKind)) return { type: 'publishes', swap: true };
  if (sourceKind === 'command' && targetKind === 'domain-event') return { type: 'triggers', swap: false };
  if ((sourceKind === 'actor' || sourceKind === 'policy') && targetKind === 'command') return { type: 'triggers', swap: false };
  if (sourceKind === 'domain-event' && (targetKind === 'policy' || targetKind === 'saga' || targetKind === 'process-manager')) {
    return { type: 'reacts-to', swap: true };
  }
  if ((sourceKind === 'policy' || sourceKind === 'saga' || sourceKind === 'process-manager') && targetKind === 'domain-event') {
    return { type: 'reacts-to', swap: false };
  }
  if (sourceKind === 'command-handler' && targetKind === 'command') return { type: 'handles', swap: false };
  if (sourceKind === 'command' && targetKind === 'command-handler') return { type: 'handles', swap: true };
  if (sourceKind === 'query-handler' && targetKind === 'read-model') return { type: 'uses', swap: false };
  if (sourceKind === 'domain-event' && targetKind === 'read-model') return { type: 'projects-to', swap: false };
  if (sourceKind === 'repository' && AGGREGATE_LIKE.has(targetKind)) return { type: 'uses', swap: false };
  if (sourceKind === 'resource' && targetKind !== 'resource') return { type: 'exposed-by', swap: true };
  if (targetKind === 'resource') return { type: 'exposed-by', swap: false };
  // 'anti-corruption' itself is a context-mapping type (two *contexts*, drawn on the Context Map) —
  // an ACL's tactical link to another element is a plain dependency (it translates what it uses).
  if (sourceKind === 'anti-corruption-layer') return { type: 'uses', swap: false };
  if (sourceKind === 'saga' || sourceKind === 'process-manager') return { type: 'orchestrates', swap: false };
  return { type: 'uses', swap: false };
}
