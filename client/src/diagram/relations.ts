/** How each relationship type looks, and which type to pick when the user just drags A onto B. */

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
    case 'generalization':
    case 'specialization':
      return { end: 'triangle' };
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
  if (sourceKind === 'anti-corruption-layer') return { type: 'anti-corruption', swap: false };
  if (sourceKind === 'saga' || sourceKind === 'process-manager') return { type: 'orchestrates', swap: false };
  return { type: 'uses', swap: false };
}
