import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Copy,
  Database,
  Flag,
  FolderInput,
  GitBranch,
  Link2,
  Map as MapIcon,
  Palette as ColorIcon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shapes,
  StickyNote,
  Trash2,
  X,
  Zap,
  Sparkles,
} from 'lucide-react';
import {
  downloadJson,
  applyDomain,
  getGetWorkspaceQueryKey,
  getListBoundedContextsQueryKey,
  getListDomainNodesQueryKey,
  saveLayout,
  useResetWorkspace,
  useUpdateRelationship,
  useUpdateWorkspace,
  fetchExport,
  generateCode,
  generateDomain,
  invalidateModel,
  useAiAuthStatus,
  useCreateBoundedContext,
  useCreateDomainNode,
  useCreateRelationship,
  useDeleteBoundedContext,
  useDeleteDomainNode,
  useDeleteRelationship,
  useGetWorkspace,
  useListBoundedContexts,
  useListDomainNodes,
  useListRelationships,
  useListSchemaConnections,
  useUpdateBoundedContext,
  useUpdateDomainNode,
  getConnectionSnapshot,
  type AiAuthStatus,
  type Context,
  type DomainNode,
  type GenerateDomainResult,
  type Relationship,
  type SchemaSnapshot,
  type WorkspaceSnapshot,
} from '@/lib/api';
import { usePreferences } from '@/lib/preferences';
import { notify, notifyError } from '@/lib/toast';
import { DiagramCanvas, type DiagramEdge, type DiagramItem, type Move } from '@/components/diagram-canvas';
import { ContextMenu, type MenuItem } from '@/components/context-menu';
import { GENERALIZATION_CONSTRAINTS, inferRelation, isStrategicType, isStructuralType } from '@/diagram/relations';
import { CONTEXT_RELATIONSHIPS, EVENT_KINDS, EventSticky, SymbolPalette, UML_RELATIONSHIPS } from '@/components/symbol-palette';

const nodeKinds = [
  'aggregate',
  'aggregate-root',
  'entity',
  'value-object',
  'domain-event',
  'command',
  'policy',
  'actor',
  'read-model',
  'repository',
  'service',
  'resource',
  'anti-corruption-layer',
  'saga',
  'process-manager',
] as const;
const relationshipTypes = [
  'uses',
  'aggregation',
  'composition',
  'generalization',
  'specialization',
  'publishes',
  'subscribes',
  'triggers',
  'reacts-to',
  'orchestrates',
  'choreographs',
  'projects-to',
  'handles',
  'owns',
  'invokes',
  'exposed-by',
  'shared-kernel',
  'customer-supplier',
  'conformist',
  'anti-corruption',
  'open-host-service',
  'published-language',
  'partnership',
  'separate-ways',
] as const;
const contextColors = ['#e7a94b', '#3e9b9a', '#d8755e', '#6588c5', '#8c71b7'];
const EVENT_KIND_SET = new Set([
  ...EVENT_KINDS.map((k) => k.kind),
  'command-handler',
  'query-handler',
  'saga',
  'process-manager',
  'read-model',
]);

type ViewTab = 'designer' | 'context-map' | 'event-storming';

function parseList(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className}`} />;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  testId,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className="min-h-[78px] w-full resize-none border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className="h-10 w-full border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      )}
    </label>
  );
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
  testId,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  onClose: () => void;
  testId: string;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      data-testid={testId}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-auto border border-border bg-card shadow-2xl animate-rise-in">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{eyebrow}</div>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-close-modal"
            className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={17} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}


/** Publisher + listeners chain for event-storming highlight */
function buildEventChain(
  selectedId: string | null,
  nodes: { id: string; kind: string }[],
  relationships: { sourceId: string; targetId: string; type: string }[],
): Set<string> {
  if (!selectedId) return new Set();
  const ids = new Set<string>([selectedId]);
  const chainTypes = new Set([
    'triggers',
    'reacts-to',
    'publishes',
    'subscribes',
    'orchestrates',
    'choreographs',
    'projects-to',
    'handles',
  ]);
  for (const r of relationships) {
    if (!chainTypes.has(r.type)) continue;
    if (r.sourceId === selectedId || r.targetId === selectedId) {
      ids.add(r.sourceId);
      ids.add(r.targetId);
    }
  }
  // one hop expand
  const seed = [...ids];
  for (const r of relationships) {
    if (!chainTypes.has(r.type)) continue;
    if (seed.includes(r.sourceId) || seed.includes(r.targetId)) {
      ids.add(r.sourceId);
      ids.add(r.targetId);
    }
  }
  return ids;
}

export default function WorkspacePage() {
  const queryClient = useQueryClient();
  const workspace = useGetWorkspace();
  const contextsQuery = useListBoundedContexts();
  const nodesQuery = useListDomainNodes();
  const relationshipsQuery = useListRelationships();
  const contexts = contextsQuery.data ?? workspace.data?.contexts ?? [];
  const nodes = nodesQuery.data ?? workspace.data?.nodes ?? [];
  const relationships = relationshipsQuery.data ?? workspace.data?.relationships ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextFilter, setContextFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('designer');
  const [modal, setModal] = useState<'context' | 'node' | 'relationship' | 'context-relationship' | 'ai' | 'codegen' | null>(null);
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [nodeForm, setNodeForm] = useState({
    contextId: '',
    kind: 'aggregate',
    name: '',
    description: '',
    status: 'draft',
    tags: '',
    methods: '',
  });
  const [contextForm, setContextForm] = useState({ name: '', purpose: '', color: contextColors[0] });
  const [relationshipForm, setRelationshipForm] = useState({
    sourceId: '',
    targetId: '',
    type: 'composition',
    label: '',
    contextId: '',
  });
  const [contextRelForm, setContextRelForm] = useState({
    sourceContextId: '',
    targetContextId: '',
    type: 'uses',
    label: '',
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeStack, setCodeStack] = useState('typescript-express');
  const [codePackage, setCodePackage] = useState('');
  const [codeScope, setCodeScope] = useState<'full' | 'commands' | 'events' | 'read-models' | 'sagas'>('full');
  const [codeIncludeTests, setCodeIncludeTests] = useState(false);
  const [codeResult, setCodeResult] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<GenerateDomainResult | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeRelationType, setActiveRelationType] = useState<string | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const { showGrid } = usePreferences();
  const aiStatus = useAiAuthStatus(modal === 'ai' || modal === 'codegen');
  const createContext = useCreateBoundedContext();
  const updateContext = useUpdateBoundedContext();
  const deleteContext = useDeleteBoundedContext();
  const createNode = useCreateDomainNode();
  const updateNode = useUpdateDomainNode();
  const deleteNode = useDeleteDomainNode();
  const createRelationship = useCreateRelationship();
  const deleteRelationship = useDeleteRelationship();
  const updateRelationship = useUpdateRelationship();

  const selectedNode = nodes.find((node) => node.id === selectedId);
  const selectedContext = contexts.find((context) => context.id === selectedId);
  // Context-map lines stand for a real relationship between two elements; their ids carry a prefix.
  const selectedRelationshipId = selectedEdgeId?.startsWith('ctx:') ? selectedEdgeId.slice(4) : selectedEdgeId;
  const selectedRelationship = relationships.find((r) => r.id === selectedRelationshipId);

  const domainNodes = useMemo(() => nodes.filter((n) => !EVENT_KIND_SET.has(n.kind as never)), [nodes]);
  const eventNodes = useMemo(() => nodes.filter((n) => EVENT_KIND_SET.has(n.kind as never)), [nodes]);
  const chainHighlight = useMemo(
    () => (viewTab === 'event-storming' ? buildEventChain(selectedId, nodes, relationships) : new Set<string>()),
    [viewTab, selectedId, nodes, relationships],
  );

  const visibleNodes = useMemo(
    () =>
      domainNodes.filter(
        (node) =>
          (contextFilter === 'all' || node.contextId === contextFilter) &&
          (!search || `${node.name} ${node.kind} ${node.description}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [domainNodes, contextFilter, search],
  );

  const visibleEvents = useMemo(
    () =>
      eventNodes.filter(
        (node) =>
          (contextFilter === 'all' || node.contextId === contextFilter) &&
          (!search || `${node.name} ${node.kind} ${node.description}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [eventNodes, contextFilter, search],
  );

  const domainRelationships = useMemo(
    () =>
      relationships.filter((r) => {
        const s = nodes.find((n) => n.id === r.sourceId);
        const t = nodes.find((n) => n.id === r.targetId);
        return s && t && !EVENT_KIND_SET.has(s.kind as never) && !EVENT_KIND_SET.has(t.kind as never);
      }),
    [relationships, nodes],
  );

  const boardMode = viewTab === 'designer' ? 'designer' : viewTab === 'event-storming' ? 'storm' : 'contexts';
  const colorOf = useMemo(() => new Map(contexts.map((c) => [c.id, c.color])), [contexts]);
  const toItem = useCallback(
    (n: DomainNode): DiagramItem => ({
      id: n.id,
      kind: n.kind,
      name: n.name,
      description: n.description,
      status: n.status,
      methods: n.methods,
      contextId: n.contextId,
      color: colorOf.get(n.contextId) ?? '#e7a94b',
      x: n.x,
      y: n.y,
      physicalTable: n.physicalTable ? `${n.physicalTable.schema}.${n.physicalTable.table}` : null,
      generalizationConstraint: n.generalizationConstraint,
    }),
    [colorOf],
  );
  const designerItems = useMemo(() => domainNodes.map(toItem), [domainNodes, toItem]);
  const stormItems = useMemo(() => eventNodes.map(toItem), [eventNodes, toItem]);
  const contextItems = useMemo<DiagramItem[]>(
    () =>
      contexts.map((c) => ({
        id: c.id,
        kind: 'context',
        name: c.name,
        description: '',
        status: '',
        methods: [],
        contextId: c.id,
        color: c.color,
        x: c.x,
        y: c.y,
        purpose: c.purpose,
        elements: nodes.filter((n) => n.contextId === c.id).length,
      })),
    [contexts, nodes],
  );
  const designerEdges = useMemo<DiagramEdge[]>(
    () =>
      // Strategic (context-mapping) relationships describe two *bounded contexts* as wholes; drawing
      // them between whichever tactical elements happen to stand in for those contexts would be
      // misleading here. They belong on, and only appear on, the Context Map.
      domainRelationships
        .filter((r) => !isStrategicType(r.type))
        .map((r) => ({ id: r.id, source: r.sourceId, target: r.targetId, type: r.type, label: r.label })),
    [domainRelationships],
  );
  const stormEdges = useMemo<DiagramEdge[]>(() => {
    const ids = new Set(eventNodes.map((n) => n.id));
    return relationships
      .filter((r) => ids.has(r.sourceId) && ids.has(r.targetId))
      .map((r) => ({ id: r.id, source: r.sourceId, target: r.targetId, type: r.type, label: r.label }));
  }, [eventNodes, relationships]);
  /** Lines on the context map are the relationships that cross a context boundary, one per pair and type. */
  const contextEdges = useMemo<DiagramEdge[]>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const out: DiagramEdge[] = [];
    for (const rel of relationships) {
      const a = byId.get(rel.sourceId);
      const b = byId.get(rel.targetId);
      if (!a || !b || a.contextId === b.contextId) continue;
      const key = [a.contextId, b.contextId, rel.type].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `ctx:${rel.id}`, source: a.contextId, target: b.contextId, type: rel.type, label: rel.label || rel.type });
    }
    return out;
  }, [nodes, relationships]);
  const boardItems = viewTab === 'designer' ? designerItems : viewTab === 'event-storming' ? stormItems : contextItems;
  const boardEdges = viewTab === 'designer' ? designerEdges : viewTab === 'event-storming' ? stormEdges : contextEdges;
  /** Filters dim instead of hiding, so the layout never shifts under you. */
  const matchIds = useMemo(() => {
    if (contextFilter === 'all' && !search) return null;
    if (viewTab === 'context-map') {
      const q = search.toLowerCase();
      return new Set(
        contexts
          .filter((c) => (contextFilter === 'all' || c.id === contextFilter) && (!q || `${c.name} ${c.purpose}`.toLowerCase().includes(q)))
          .map((c) => c.id),
      );
    }
    return new Set((viewTab === 'designer' ? visibleNodes : visibleEvents).map((n) => n.id));
  }, [contextFilter, search, viewTab, contexts, visibleNodes, visibleEvents]);
  const focusIds = useMemo(
    () =>
      contextFilter === 'all'
        ? []
        : viewTab === 'context-map'
          ? [contextFilter]
          : (viewTab === 'designer' ? domainNodes : eventNodes).filter((n) => n.contextId === contextFilter).map((n) => n.id),
    [contextFilter, viewTab, domainNodes, eventNodes],
  );
  const isBlank = contexts.length === 0 && nodes.length === 0;

  const invalidateMap = () => invalidateModel(queryClient);
  
  const downloadExport = async () => {
    try {
      const doc = await fetchExport();
      const name = doc.projectName.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'model';
      downloadJson(`ddd-export-${name}.json`, doc);
      notify('Domain model exported as JSON');
    } catch (e) {
      notifyError(e);
    }
  };

  const runCodegen = async () => {
    setCodeBusy(true);
    setCodeResult(null);
    try {
      const body = await generateCode({
        stack: codeStack,
        packageName: codePackage.trim() || undefined,
        scope: codeScope,
        includeTests: codeIncludeTests,
      });
      const { files } = body.codegen;
      const bundle = {
        generator: body.generator,
        source: body.source,
        model: body.model,
        fallbackReason: body.fallbackReason,
        summary: body.codegen.summary,
        fileCount: files.length,
        files,
      };
      setCodeResult(JSON.stringify(bundle, null, 2));
      downloadJson(`ddd-codegen-${(body.codegen.packageName || 'domain').replace(/[^a-z0-9_-]+/gi, '-')}.json`, bundle);
      notify(`${body.generator.name}: ${files.length} files — ${body.codegen.summary || 'done'}`);
      if (body.fallbackReason) notify(`Offline sketch used (TypeScript stubs only): ${body.fallbackReason}`, 'warning');
    } catch (e) {
      notifyError(e);
    } finally {
      setCodeBusy(false);
    }
  };

  /** Ask the designer for a proposal and show it; nothing touches the map until "Apply". */
  const runAiDesign = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiResult(null);
    try {
      const result = await generateDomain(aiPrompt.trim(), false);
      setAiResult(result);
      if (result.fallbackReason) notify(`${result.designer.name} used instead of Gemini: ${result.fallbackReason}`, 'warning');
      else notify(`${result.designer.name}: proposal ready — review it, then apply`);
    } catch (e) {
      notifyError(e);
    } finally {
      setAiBusy(false);
    }
  };

  /** Apply exactly the proposal that was previewed — no second model call. */
  const applyAiDesign = async () => {
    if (!aiResult) return;
    setAiBusy(true);
    try {
      const { dropped } = await applyDomain(aiResult.design);
      invalidateMap();
      setModal(null);
      setAiResult(null);
      notify(`${aiResult.designer.name}: applied to the map${dropped.length ? ` (${dropped.length} invalid items skipped)` : ''}`);
    } catch (e) {
      notifyError(e);
    } finally {
      setAiBusy(false);
    }
  };

  const openNewNode = (kind = 'aggregate', at: { x: number; y: number } | null = null) => {
    setPendingPosition(at);
    setNodeForm({
      contextId: contextFilter === 'all' ? contexts[0]?.id ?? '' : contextFilter,
      kind,
      name: '',
      description: '',
      status: 'draft',
      tags: '',
      methods: '',
    });
    setModal('node');
  };

  const saveNode = () => {
    if (!nodeForm.name.trim() || !nodeForm.contextId) return;
    createNode.mutate(
      {
        data: {
          ...nodeForm,
          name: nodeForm.name.trim(),
          description: nodeForm.description.trim(),
          status: nodeForm.status as 'draft' | 'validated' | 'needs-review',
          kind: nodeForm.kind as (typeof nodeKinds)[number],
          // A drop from the palette keeps its position; otherwise the canvas places it beside its context.
          ...(pendingPosition ?? {}),
          tags: parseList(nodeForm.tags),
          methods: parseList(nodeForm.methods),
        },
      },
      {
        onSuccess: () => {
          invalidateMap();
          setModal(null);
          notify(EVENT_KIND_SET.has(nodeForm.kind as never) ? 'Event sticky added' : 'Node added to the map');
        },
      },
    );
  };

  const saveContext = () => {
    if (!contextForm.name.trim()) return;
    const payload = { name: contextForm.name.trim(), purpose: contextForm.purpose.trim(), color: contextForm.color };
    if (editingContext)
      updateContext.mutate(
        { id: editingContext, data: payload },
        {
          onSuccess: () => {
            invalidateMap();
            setModal(null);
            notify('Context updated');
          },
        },
      );
    else
      createContext.mutate(
        { data: payload },
        {
          onSuccess: () => {
            invalidateMap();
            setModal(null);
            notify('Bounded context created');
          },
        },
      );
  };

  const saveRelationship = () => {
    if (
      !relationshipForm.sourceId ||
      !relationshipForm.targetId ||
      !relationshipForm.contextId ||
      relationshipForm.sourceId === relationshipForm.targetId
    )
      return;
    // Designer: no free-text label — UML symbol is the visual; keep label empty
    createRelationship.mutate(
      {
        data: {
          sourceId: relationshipForm.sourceId,
          targetId: relationshipForm.targetId,
          type: relationshipForm.type as (typeof relationshipTypes)[number],
          label: '',
          contextId: relationshipForm.contextId,
        },
      },
      {
        onSuccess: () => {
          invalidateMap();
          setModal(null);
          setActiveRelationType(null);
          notify('UML relationship connected');
        },
      },
    );
  };

  /** Context-map relationship: pick one node from each context (or create placeholders) and link them with a label. */
  const saveContextRelationship = () => {
    if (
      !contextRelForm.sourceContextId ||
      !contextRelForm.targetContextId ||
      contextRelForm.sourceContextId === contextRelForm.targetContextId
    )
      return;
    const sourceNode =
      domainNodes.find((n) => n.contextId === contextRelForm.sourceContextId) ??
      nodes.find((n) => n.contextId === contextRelForm.sourceContextId);
    const targetNode =
      domainNodes.find((n) => n.contextId === contextRelForm.targetContextId) ??
      nodes.find((n) => n.contextId === contextRelForm.targetContextId);
    if (!sourceNode || !targetNode) {
      notify('Add at least one element in each context before linking them');
      return;
    }
    createRelationship.mutate(
      {
        data: {
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          type: contextRelForm.type as (typeof relationshipTypes)[number],
          label: contextRelForm.label.trim() || contextRelForm.type,
          contextId: contextRelForm.sourceContextId,
        },
      },
      {
        onSuccess: () => {
          invalidateMap();
          setModal(null);
          notify('Context map relationship added');
        },
      },
    );
  };

  const beginEditContext = (id: string) => {
    const context = contexts.find((item) => item.id === id);
    if (context) {
      setEditingContext(id);
      setContextForm({ name: context.name, purpose: context.purpose, color: context.color });
      setModal('context');
    }
  };

  const onPickKind = (kind: string) => openNewNode(kind);

  /** Choose the relationship type for the next connections; null lets Studio pick from the two element kinds. */
  const onPickRelation = (type: string | null) => setActiveRelationType(type);

  const onSelectItem = (id: string | null) => {
    setSelectedId(id);
    if (id) setSelectedEdgeId(null);
  };
  const onSelectEdge = (id: string | null) => {
    setSelectedEdgeId(id);
    if (id) setSelectedId(null);
  };

  /** The element that stands for a context when two contexts are linked (the relationship still needs a concrete source/target). */
  const representativeOf = (contextId: string) =>
    domainNodes.find((n) => n.contextId === contextId && n.kind === 'aggregate-root') ??
    domainNodes.find((n) => n.contextId === contextId && n.kind === 'aggregate') ??
    nodes.find((n) => n.contextId === contextId);

  /** Drag on the source, drop on the target: that is the whole gesture. */
  const connectItems = (sourceId: string, targetId: string) => {
    let type = activeRelationType;
    let from: string;
    let to: string;
    let label: string;
    let crossesContexts = false;

    if (viewTab === 'context-map') {
      const a = representativeOf(sourceId);
      const b = representativeOf(targetId);
      if (!a || !b) {
        notify('Add at least one element to each context before linking them.', 'warning');
        return;
      }
      type = type && isStrategicType(type) ? type : 'customer-supplier';
      from = a.id;
      to = b.id;
      label = `${contexts.find((c) => c.id === sourceId)?.name ?? ''} → ${contexts.find((c) => c.id === targetId)?.name ?? ''}`;
    } else {
      const source = nodes.find((n) => n.id === sourceId);
      const target = nodes.find((n) => n.id === targetId);
      if (!source || !target) return;
      from = source.id;
      to = target.id;
      // Bounded-Context relationships (Customer-Supplier, Anti-corruption, …) connect two *contexts*,
      // never two elements — they can only be armed from the Context Map palette, but guard anyway.
      if (type && isStrategicType(type)) type = null;
      if (!type) {
        const guess = inferRelation(source.kind, target.kind);
        type = guess.type;
        if (guess.swap) [from, to] = [to, from];
      }
      crossesContexts = source.contextId !== target.contextId;
      label = `${nodes.find((n) => n.id === from)?.name} → ${nodes.find((n) => n.id === to)?.name}`;
    }

    createRelationship.mutate(
      { data: { sourceId: from, targetId: to, type: type as (typeof relationshipTypes)[number] } },
      {
        onSuccess: (rel) => {
          invalidateMap();
          setSelectedId(null);
          setSelectedEdgeId(viewTab === 'context-map' ? `ctx:${rel.id}` : rel.id);
          if (viewTab === 'context-map') {
            notify(`${label}: ${type} — shown on the Context Map only. Select the line to change it.`);
          } else if (crossesContexts && isStructuralType(type)) {
            notify(
              `${label}: ${type} crosses a bounded context. In DDD, an aggregate normally only owns elements within its own context — consider a context-map relationship (customer-supplier, anti-corruption, …) instead.`,
              'warning',
            );
          } else {
            notify(`${label}: ${type}. Select the line to change it.`);
          }
        },
      },
    );
  };

  /** Remember new positions at once (so nothing snaps back), then save them. */
  const moveItems = (moves: Move[]) => {
    if (!moves.length) return;
    const at = new Map(moves.map((m) => [m.id, m]));
    const relocate = <T extends { id: string; x: number | null; y: number | null }>(list: T[]): T[] =>
      list.map((item) => {
        const m = at.get(item.id);
        return m ? { ...item, x: m.x, y: m.y } : item;
      });
    const onContexts = viewTab === 'context-map';
    if (onContexts) {
      queryClient.setQueryData<Context[]>(getListBoundedContextsQueryKey(), (old) => (old ? relocate(old) : old));
      queryClient.setQueryData<WorkspaceSnapshot>(getGetWorkspaceQueryKey(), (old) => (old ? { ...old, contexts: relocate(old.contexts) } : old));
    } else {
      queryClient.setQueryData<DomainNode[]>(getListDomainNodesQueryKey(), (old) => (old ? relocate(old) : old));
      queryClient.setQueryData<WorkspaceSnapshot>(getGetWorkspaceQueryKey(), (old) => (old ? { ...old, nodes: relocate(old.nodes) } : old));
    }
    saveLayout({ nodes: onContexts ? [] : moves, contexts: onContexts ? moves : [] }).catch((err) => {
      notifyError(err);
      invalidateMap();
    });
  };

  const removeRelationship = (id: string) =>
    deleteRelationship.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateMap();
          setSelectedEdgeId(null);
          notify('Relationship removed');
        },
      },
    );

  /** Delete / Backspace on the canvas. */
  const deleteSelected = () => {
    if (selectedRelationship) {
      removeRelationship(selectedRelationship.id);
      return;
    }
    if (selectedNode && window.confirm(`Delete ${selectedNode.name}?`)) {
      deleteNode.mutate(
        { id: selectedNode.id },
        {
          onSuccess: () => {
            invalidateMap();
            setSelectedId(null);
            notify('Element removed');
          },
        },
      );
    }
  };

  const removeNodeById = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (node && window.confirm(`Delete ${node.name}?`))
      deleteNode.mutate(
        { id },
        {
          onSuccess: () => {
            invalidateMap();
            if (selectedId === id) setSelectedId(null);
            notify('Element removed');
          },
        },
      );
  };

  const removeContextById = (id: string) => {
    const context = contexts.find((c) => c.id === id);
    if (context && window.confirm(`Delete ${context.name}?`))
      deleteContext.mutate(
        { id },
        {
          onSuccess: () => {
            invalidateMap();
            if (selectedId === id) setSelectedId(null);
            notify('Context removed');
          },
        },
      );
  };

  /** Same element, fresh id: name gets " copy", position is cleared so it lands beside its context, and any generalization-set role is dropped (a clone starts with none of the original's subtypes). */
  const duplicateNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const { id: _id, x: _x, y: _y, generalizationConstraint: _constraint, name, ...rest } = node;
    createNode.mutate(
      { data: { ...rest, name: `${name} copy`, x: null, y: null } },
      {
        onSuccess: (created) => {
          invalidateMap();
          setSelectedId(created.id);
          notify('Element duplicated');
        },
      },
    );
  };

  const setNodeStatus = (id: string, status: 'draft' | 'validated' | 'needs-review') =>
    updateNode.mutate({ id, data: { status } }, { onSuccess: () => { invalidateMap(); notify('Status updated'); } });

  const moveNodeToContext = (id: string, contextId: string) =>
    updateNode.mutate(
      { id, data: { contextId, x: null, y: null } },
      { onSuccess: () => { invalidateMap(); notify('Moved to another context'); } },
    );

  const setNodeRepresentation = (id: string, representation: 'logical' | 'physical') =>
    updateNode.mutate({ id, data: { representation } }, { onSuccess: () => { invalidateMap(); notify('Representation updated'); } });

  const setNodeGeneralizationConstraint = (id: string, value: (typeof GENERALIZATION_CONSTRAINTS)[number] | 'none') =>
    updateNode.mutate({ id, data: { generalizationConstraint: value } }, { onSuccess: () => { invalidateMap(); notify('Generalization set updated'); } });

  const setContextColor = (id: string, color: string) =>
    updateContext.mutate({ id, data: { color } }, { onSuccess: () => invalidateMap() });

  const armRelation = (type: string) => {
    setActiveRelationType(type);
    notify(`Drag from the dot on this element to connect it as "${type}".`);
  };

  /** What right-clicking this node offers: a domain element/sticky, or a bounded context on the Context Map. */
  const buildNodeMenu = (id: string): MenuItem[] => {
    if (viewTab === 'context-map') {
      const context = contexts.find((c) => c.id === id);
      if (!context) return [];
      return [
        { kind: 'item', key: 'edit', label: 'Edit context…', icon: Pencil, onSelect: () => beginEditContext(id) },
        {
          kind: 'submenu',
          key: 'color',
          label: 'Change color',
          icon: ColorIcon,
          items: contextColors.map((color) => ({
            kind: 'item',
            key: `color-${color}`,
            label: color,
            active: context.color === color,
            onSelect: () => setContextColor(id, color),
          })),
        },
        {
          kind: 'submenu',
          key: 'relate',
          label: 'Add relationship',
          icon: Link2,
          items: CONTEXT_RELATIONSHIPS.map((rel) => ({
            kind: 'item',
            key: `rel-${rel.type}`,
            label: rel.label,
            active: activeRelationType === rel.type,
            onSelect: () => armRelation(rel.type),
          })),
        },
        { kind: 'separator', key: 'sep-delete' },
        { kind: 'item', key: 'delete', label: 'Delete context', icon: Trash2, danger: true, onSelect: () => removeContextById(id) },
      ];
    }

    const node = nodes.find((n) => n.id === id);
    if (!node) return [];
    const incomingGeneralizations = relationships.filter(
      (r) => r.targetId === node.id && (r.type === 'generalization' || r.type === 'specialization'),
    );

    const items: MenuItem[] = [
      { kind: 'item', key: 'edit', label: 'Edit details', icon: Pencil, onSelect: () => onSelectItem(id) },
      { kind: 'item', key: 'duplicate', label: 'Duplicate', icon: Copy, onSelect: () => duplicateNode(id) },
      {
        kind: 'submenu',
        key: 'status',
        label: 'Change status',
        icon: Flag,
        items: (['draft', 'validated', 'needs-review'] as const).map((status) => ({
          kind: 'item',
          key: `status-${status}`,
          label: status,
          active: node.status === status,
          onSelect: () => setNodeStatus(id, status),
        })),
      },
    ];

    if (viewTab === 'designer') {
      items.push({
        kind: 'submenu',
        key: 'relate',
        label: 'Add relationship',
        icon: Link2,
        items: UML_RELATIONSHIPS.map((rel) => ({
          kind: 'item',
          key: `rel-${rel.type}`,
          label: rel.label,
          active: activeRelationType === rel.type,
          onSelect: () => armRelation(rel.type),
        })),
      });
      items.push({
        kind: 'submenu',
        key: 'move',
        label: 'Move to context',
        icon: FolderInput,
        items: contexts.map((c) => ({
          kind: 'item',
          key: `ctx-${c.id}`,
          label: c.name,
          active: c.id === node.contextId,
          disabled: c.id === node.contextId,
          onSelect: () => moveNodeToContext(id, c.id),
        })),
      });
    }

    if (node.kind === 'entity') {
      items.push({
        kind: 'submenu',
        key: 'representation',
        label: 'Representation',
        icon: Database,
        items: [
          { kind: 'item', key: 'rep-logical', label: 'Logical', active: node.representation !== 'physical', onSelect: () => setNodeRepresentation(id, 'logical') },
          { kind: 'item', key: 'rep-physical', label: 'Physical…', active: node.representation === 'physical', onSelect: () => onSelectItem(id) },
        ],
      });
    }

    if (incomingGeneralizations.length >= 2) {
      items.push({
        kind: 'submenu',
        key: 'generalization',
        label: 'Generalization set',
        icon: Shapes,
        items: (['none', ...GENERALIZATION_CONSTRAINTS] as const).map((value) => ({
          kind: 'item',
          key: `gen-${value}`,
          label: value === 'none' ? 'None' : value.toUpperCase(),
          active: (node.generalizationConstraint ?? 'none') === value,
          onSelect: () => setNodeGeneralizationConstraint(id, value),
        })),
      });
    }

    items.push({ kind: 'separator', key: 'sep-delete' });
    items.push({ kind: 'item', key: 'delete', label: 'Delete', icon: Trash2, danger: true, onSelect: () => removeNodeById(id) });
    return items;
  };

  const isLoading = workspace.isLoading || contextsQuery.isLoading || nodesQuery.isLoading || relationshipsQuery.isLoading;
  if (isLoading && !contexts.length && !nodes.length) {
    return (
      <div className="space-y-6 p-5 md:p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      </div>
    );
  }
  if ((workspace.isError || contextsQuery.isError || nodesQuery.isError) && !contexts.length) {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center p-6">
        <div className="max-w-sm border border-destructive/30 bg-card p-8 text-center">
          <div className="font-display text-2xl font-semibold">The map is unavailable</div>
          <p className="mt-2 text-sm text-muted-foreground">The workspace could not be loaded. Try the connection again.</p>
          <button
            onClick={() => {
              void workspace.refetch();
              void contextsQuery.refetch();
              void nodesQuery.refetch();
            }}
            data-testid="button-retry-workspace"
            className="mt-6 inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw size={14} /> Retry load
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: ViewTab; label: string; icon: typeof GitBranch }[] = [
    { id: 'designer', label: 'Domain designer', icon: GitBranch },
    { id: 'context-map', label: 'Context map', icon: MapIcon },
    { id: 'event-storming', label: 'Event storming', icon: Zap },
  ];

  return (
    <div className="relative min-h-[calc(100dvh-76px)] p-5 md:p-8">
      <div className="mb-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-primary">
            <span className="h-1.5 w-1.5 bg-primary" /> living model
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl" data-testid="text-workspace-title">
            {workspace.data?.projectName ?? 'Workspace'}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Shape bounded contexts, domain language, UML relationships, and event storming in one workbench.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingContext(null);
              setContextForm({ name: '', purpose: '', color: contextColors[contexts.length % contextColors.length] });
              setModal('context');
            }}
            data-testid="button-add-context"
            className="inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={15} /> Add context
          </button>
          <button
            type="button"
            onClick={() => {
              setAiResult(null);
              setModal('ai');
            }}
            data-testid="button-ai-design"
            className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <Sparkles size={15} /> AI design
          </button>
          <button
            type="button"
            onClick={() => void downloadExport()}
            data-testid="button-export-json"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium hover:border-primary"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => {
              setCodeResult(null);
              setModal('codegen');
            }}
            data-testid="button-generate-code"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium hover:border-primary"
          >
            Generate code
          </button>
          {viewTab === 'context-map' && (
            <button
              type="button"
              onClick={() => {
                setContextRelForm({
                  sourceContextId: contexts[0]?.id ?? '',
                  targetContextId: contexts[1]?.id ?? '',
                  type: 'uses',
                  label: '',
                });
                setModal('context-relationship');
              }}
              data-testid="button-add-context-relationship"
              className="inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              <Link2 size={15} /> Link contexts
            </button>
          )}
          {viewTab === 'designer' && (
            <button
              type="button"
              onClick={() => {
                setRelationshipForm({
                  sourceId: '',
                  targetId: '',
                  type: 'composition',
                  label: '',
                  contextId: contextFilter === 'all' ? contexts[0]?.id ?? '' : contextFilter,
                });
                setModal('relationship');
              }}
              data-testid="button-add-relationship"
              className="inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              <Link2 size={15} /> Connect (form)
            </button>
          )}
          <button
            type="button"
            onClick={() => openNewNode(viewTab === 'event-storming' ? 'domain-event' : 'aggregate')}
            data-testid="button-add-node"
            className="inline-flex items-center gap-2 bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <Plus size={15} /> {viewTab === 'event-storming' ? 'Add event sticky' : 'Add model element'}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {(
          [
            ['CONTEXTS', contexts.length, 'mapped boundaries'],
            ['ELEMENTS', domainNodes.length, 'domain language'],
            ['EVENTS', eventNodes.length, 'storm stickies'],
            ['RELATIONSHIPS', relationships.length, 'explicit semantics'],
          ] as const
        ).map(([label, value, hint]) => (
          <div className="bg-card px-4 py-3.5" key={label} data-testid={`stat-${String(label).toLowerCase()}`}>
            <div className="font-mono-ui text-[10px] tracking-[.16em] text-muted-foreground">{label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-semibold">{value}</span>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">{hint}</span>
            </div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border border-border bg-card p-1" data-testid="view-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = viewTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => {
                setViewTab(tab.id);
                setSelectedEdgeId(null);
                setActiveRelationType(null);
                setSelectedId(null);
              }}
              data-testid={`tab-${tab.id}`}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm transition-colors ${
                active ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1 overflow-auto">
          <button
            type="button"
            onClick={() => {
              setContextFilter('all');
              setSelectedId(null);
            }}
            data-testid="filter-context-all"
            className={`whitespace-nowrap px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[.08em] ${
              contextFilter === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            all contexts
          </button>
          {contexts.map((context) => (
            <button
              type="button"
              key={context.id}
              onClick={() => {
                setContextFilter(context.id);
                setSelectedId(context.id);
              }}
              data-testid={`filter-context-${context.id}`}
              className={`flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs ${
                contextFilter === context.id ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: context.color }} />
              {context.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 border-l border-border pl-3 text-muted-foreground">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find an element"
            data-testid="input-search-nodes"
            className="w-[130px] bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </label>
      </div>

      {activeRelationType && (
        <div className="mb-3 flex items-center justify-between gap-3 border border-primary/40 bg-primary/5 px-3 py-2 text-xs" data-testid="connect-mode-banner">
          <span>
            New connections will be drawn as <strong>{activeRelationType}</strong>. Drag from the dot on{' '}
            {viewTab === 'context-map' ? 'one Bounded Context to another' : 'an element to another element'}.
          </span>
          <button type="button" onClick={() => setActiveRelationType(null)} className="font-medium text-primary hover:underline">
            Back to Auto
          </button>
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <section className="min-h-[610px] overflow-hidden border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {viewTab === 'designer' && (
                <>
                  <GitBranch size={15} className="text-primary" /> Domain designer
                  <span className="font-mono-ui text-[10px] font-normal text-muted-foreground">
                    {visibleNodes.length} elements · UML (no labels)
                  </span>
                </>
              )}
              {viewTab === 'context-map' && (
                <>
                  <MapIcon size={15} className="text-primary" /> Context map
                  <span className="font-mono-ui text-[10px] font-normal text-muted-foreground">
                    {contexts.length} contexts · labeled relationships
                  </span>
                </>
              )}
              {viewTab === 'event-storming' && (
                <>
                  <StickyNote size={15} className="text-primary" /> Event storming
                  <span className="font-mono-ui text-[10px] font-normal text-muted-foreground">
                    {visibleEvents.length} stickies
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex">
            <SymbolPalette
              mode={viewTab}
              onPickKind={onPickKind}
              onPickRelation={onPickRelation}
              activeRelationType={activeRelationType}
            />

            <div className="relative h-[70dvh] min-h-[560px] min-w-0 flex-1">
              {isBlank && (
                <FirstRun
                  projectName={workspace.data?.projectName ?? ''}
                  onAddContext={() => {
                    setEditingContext(null);
                    setContextForm({ name: '', purpose: '', color: contextColors[0] });
                    setModal('context');
                  }}
                  onDesignWithAi={() => setModal('ai')}
                />
              )}
              {!isBlank && boardItems.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-6">
                  <div className="border border-dashed border-border bg-card/90 px-4 py-2 text-xs text-muted-foreground">
                    {viewTab === 'context-map'
                      ? 'No bounded contexts yet. Use "Add context".'
                      : viewTab === 'event-storming'
                        ? 'No stickies yet. Click or drag one from the palette.'
                        : 'No elements yet. Click or drag one from the palette.'}
                  </div>
                </div>
              )}
              <DiagramCanvas
                mode={boardMode}
                items={boardItems}
                edges={boardEdges}
                contexts={contexts}
                selectedId={selectedId}
                selectedEdgeId={selectedEdgeId}
                matchIds={matchIds}
                highlightIds={viewTab === 'event-storming' ? chainHighlight : undefined}
                showGrid={showGrid}
                showLabels={viewTab !== 'designer'}
                focusKey={`${viewTab}|${contextFilter}`}
                focusIds={focusIds}
                onSelectItem={onSelectItem}
                onSelectEdge={onSelectEdge}
                onMove={moveItems}
                onConnect={connectItems}
                onDropKind={viewTab === 'context-map' ? undefined : (kind, at) => openNewNode(kind, at)}
                onDeleteSelected={deleteSelected}
                onNodeContextMenu={(id, x, y) => {
                  onSelectItem(id);
                  setNodeMenu({ id, x, y });
                }}
              />
              {nodeMenu && (
                <ContextMenu x={nodeMenu.x} y={nodeMenu.y} items={buildNodeMenu(nodeMenu.id)} onClose={() => setNodeMenu(null)} />
              )}
            </div>
          </div>
        </section>

        <aside className="border border-border bg-card">
          {selectedRelationship ? (
            <EdgeInspector
              key={selectedRelationship.id}
              relationship={selectedRelationship}
              nodes={nodes}
              busy={updateRelationship.isPending}
              onClose={() => setSelectedEdgeId(null)}
              onChange={(data) =>
                updateRelationship.mutate({ id: selectedRelationship.id, data }, { onSuccess: () => { invalidateMap(); notify('Relationship updated'); } })
              }
              onDelete={() => removeRelationship(selectedRelationship.id)}
            />
          ) : selectedNode ? (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              contexts={contexts}
              nodes={nodes}
              relationships={relationships}
              onClose={() => setSelectedId(null)}
              onSave={(data) =>
                updateNode.mutate(
                  { id: selectedNode.id, data: data as never },
                  {
                    onSuccess: () => {
                      invalidateMap();
                      notify('Element updated');
                    },
                    onError: (err: unknown) => {
                      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Update failed';
                      notify(msg);
                    },
                  },
                )
              }
              onDelete={() => {
                if (window.confirm(`Delete ${selectedNode.name}?`))
                  deleteNode.mutate(
                    { id: selectedNode.id },
                    {
                      onSuccess: () => {
                        invalidateMap();
                        setSelectedId(null);
                        notify('Element removed');
                      },
                    },
                  );
              }}
              onDeleteRelationship={(id) => {
                if (window.confirm('Delete this relationship?'))
                  deleteRelationship.mutate(
                    { id },
                    {
                      onSuccess: () => {
                        invalidateMap();
                        notify('Relationship removed');
                      },
                    },
                  );
              }}
            />
          ) : selectedContext ? (
            <ContextInspector
              context={selectedContext}
              onEdit={() => beginEditContext(selectedContext.id)}
              onDelete={() => {
                if (window.confirm(`Delete ${selectedContext.name}?`))
                  deleteContext.mutate(
                    { id: selectedContext.id },
                    {
                      onSuccess: () => {
                        invalidateMap();
                        setSelectedId(null);
                        notify('Context removed');
                      },
                    },
                  );
              }}
            />
          ) : (
            <div className="flex min-h-[610px] flex-col justify-between p-5">
              <div>
                <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground">model inspector</div>
                <h2 className="mt-2 font-display text-2xl font-semibold">Make meaning explicit.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {viewTab === 'context-map'
                    ? 'Select a bounded context to inspect purpose and counts. Link contexts with labeled relationships.'
                    : viewTab === 'event-storming'
                      ? 'Select a sticky to refine the event, command, policy, or actor.'
                      : 'Select an element. Use the palette to draw UML relationships without text labels.'}
                </p>
              </div>
              <div className="space-y-3 border-t border-border pt-5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px]">◆——▷</span> composition / owns
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px]">◇——▷</span> aggregation
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px]">——△</span> generalization
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px]">····▷</span> uses / dependency
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {modal === 'context' && (
        <Modal
          title={editingContext ? 'Edit context' : 'New bounded context'}
          eyebrow="boundary definition"
          onClose={() => setModal(null)}
          testId="modal-context"
        >
          <div className="space-y-4">
            <Field
              label="Name"
              value={contextForm.name}
              onChange={(value) => setContextForm((form) => ({ ...form, name: value }))}
              placeholder="e.g. Fulfillment"
              testId="input-context-name"
            />
            <Field
              label="Purpose"
              value={contextForm.purpose}
              onChange={(value) => setContextForm((form) => ({ ...form, purpose: value }))}
              placeholder="What responsibility lives here?"
              testId="input-context-purpose"
              multiline
            />
            <div>
              <span className="mb-2 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                Boundary color
              </span>
              <div className="flex gap-2">
                {contextColors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => setContextForm((form) => ({ ...form, color }))}
                    data-testid={`button-color-${color.slice(1)}`}
                    className={`h-8 w-8 rounded-full border-2 ${contextForm.color === color ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={saveContext}
              disabled={createContext.isPending || updateContext.isPending || !contextForm.name.trim()}
              data-testid="button-save-context"
              className="mt-2 w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createContext.isPending || updateContext.isPending
                ? 'Saving boundary…'
                : editingContext
                  ? 'Save context'
                  : 'Create bounded context'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'node' && (
        <Modal
          title={EVENT_KIND_SET.has(nodeForm.kind as never) ? 'Add event sticky' : 'Add model element'}
          eyebrow={EVENT_KIND_SET.has(nodeForm.kind as never) ? 'event storming' : 'domain language'}
          onClose={() => setModal(null)}
          testId="modal-node"
        >
          <div className="space-y-4">
            <Field
              label="Name"
              value={nodeForm.name}
              onChange={(value) => setNodeForm((form) => ({ ...form, name: value }))}
              placeholder={EVENT_KIND_SET.has(nodeForm.kind as never) ? 'e.g. OrderPlaced' : 'e.g. Shipment'}
              testId="input-node-name"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Kind</span>
                <select
                  value={nodeForm.kind}
                  onChange={(event) => setNodeForm((form) => ({ ...form, kind: event.target.value }))}
                  data-testid="select-node-kind"
                  className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                >
                  {nodeKinds.map((kind) => (
                    <option value={kind} key={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Context</span>
                <select
                  value={nodeForm.contextId}
                  onChange={(event) => setNodeForm((form) => ({ ...form, contextId: event.target.value }))}
                  data-testid="select-node-context"
                  className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Choose context</option>
                  {contexts.map((context) => (
                    <option value={context.id} key={context.id}>
                      {context.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Field
              label="Description"
              value={nodeForm.description}
              onChange={(value) => setNodeForm((form) => ({ ...form, description: value }))}
              placeholder="What does this element know or do?"
              testId="input-node-description"
              multiline
            />
            {!EVENT_KIND_SET.has(nodeForm.kind as never) && (
              <Field
                label="Methods"
                value={nodeForm.methods}
                onChange={(value) => setNodeForm((form) => ({ ...form, methods: value }))}
                placeholder="place(), cancel(), reserve() — one per line"
                testId="input-node-methods"
                multiline
              />
            )}
            <Field
              label="Tags"
              value={nodeForm.tags}
              onChange={(value) => setNodeForm((form) => ({ ...form, tags: value }))}
              placeholder="payments, invariant, external"
              testId="input-node-tags"
            />
            <button
              type="button"
              onClick={saveNode}
              disabled={createNode.isPending || !nodeForm.name.trim() || !nodeForm.contextId}
              data-testid="button-save-node"
              className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createNode.isPending ? 'Adding…' : EVENT_KIND_SET.has(nodeForm.kind as never) ? 'Add sticky' : 'Add to domain map'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'relationship' && (
        <Modal title="Connect with UML" eyebrow="explicit relationship" onClose={() => setModal(null)} testId="modal-relationship">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">From</span>
              <select
                value={relationshipForm.sourceId}
                onChange={(event) => setRelationshipForm((form) => ({ ...form, sourceId: event.target.value }))}
                data-testid="select-relationship-source"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">Select source</option>
                {domainNodes.map((node) => (
                  <option value={node.id} key={node.id}>
                    {node.name} · {node.kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                UML relationship
              </span>
              <select
                value={relationshipForm.type}
                onChange={(event) => setRelationshipForm((form) => ({ ...form, type: event.target.value }))}
                data-testid="select-relationship-type"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {relationshipTypes.map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">To</span>
              <select
                value={relationshipForm.targetId}
                onChange={(event) => setRelationshipForm((form) => ({ ...form, targetId: event.target.value }))}
                data-testid="select-relationship-target"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">Select target</option>
                {domainNodes.map((node) => (
                  <option value={node.id} key={node.id}>
                    {node.name} · {node.kind}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Context</span>
              <select
                value={relationshipForm.contextId}
                onChange={(event) => setRelationshipForm((form) => ({ ...form, contextId: event.target.value }))}
                data-testid="select-relationship-context"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">Choose context</option>
                {contexts.map((context) => (
                  <option value={context.id} key={context.id}>
                    {context.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] text-muted-foreground">
              Designer edges use UML symbols only (no text labels). Labels are reserved for the Context map.
            </p>
            <button
              type="button"
              onClick={saveRelationship}
              disabled={
                createRelationship.isPending ||
                !relationshipForm.sourceId ||
                !relationshipForm.targetId ||
                !relationshipForm.contextId
              }
              data-testid="button-save-relationship"
              className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createRelationship.isPending ? 'Connecting…' : 'Create UML relationship'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'context-relationship' && (
        <Modal
          title="Link bounded contexts"
          eyebrow="context map"
          onClose={() => setModal(null)}
          testId="modal-context-relationship"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">From context</span>
              <select
                value={contextRelForm.sourceContextId}
                onChange={(e) => setContextRelForm((f) => ({ ...f, sourceContextId: e.target.value }))}
                data-testid="select-ctx-rel-source"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">Select</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                Relationship type
              </span>
              <select
                value={contextRelForm.type}
                onChange={(e) => setContextRelForm((f) => ({ ...f, type: e.target.value }))}
                data-testid="select-ctx-rel-type"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {relationshipTypes.map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">To context</span>
              <select
                value={contextRelForm.targetContextId}
                onChange={(e) => setContextRelForm((f) => ({ ...f, targetContextId: e.target.value }))}
                data-testid="select-ctx-rel-target"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">Select</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Label (shown on context map)"
              value={contextRelForm.label}
              onChange={(v) => setContextRelForm((f) => ({ ...f, label: v }))}
              placeholder="e.g. Customer-Supplier, ACL, Shared Kernel"
              testId="input-ctx-rel-label"
            />
            <p className="text-[11px] text-muted-foreground">
              Context map is the only view that draws text labels on relationships. Requires at least one element in each
              context.
            </p>
            <button
              type="button"
              onClick={saveContextRelationship}
              disabled={
                createRelationship.isPending || !contextRelForm.sourceContextId || !contextRelForm.targetContextId
              }
              data-testid="button-save-context-relationship"
              className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createRelationship.isPending ? 'Linking…' : 'Add context relationship'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'ai' && (
        <Modal title="AI domain design" eyebrow="gemini · adk" onClose={() => setModal(null)} testId="modal-ai-design">
          <div className="space-y-4">
            <AiStatusBanner status={aiStatus.data} loading={aiStatus.isPending} />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Describe the product or problem. The designer proposes bounded contexts, elements, relationships and a glossary
              for the canvas — design only, not code. Review the proposal, then apply it.
            </p>
            <Field
              label="Design prompt"
              value={aiPrompt}
              onChange={(value) => {
                setAiPrompt(value);
                setAiResult(null);
              }}
              placeholder="e.g. Multi-tenant SaaS billing with subscriptions, invoices, and dunning across Finance and Customer Success contexts"
              testId="input-ai-prompt"
              multiline
            />
            {aiResult && (
              <div className="space-y-2" data-testid="panel-ai-result">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-ui text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                  <span className="text-foreground">{aiResult.designer.name}</span>
                  {aiResult.model && <span>{aiResult.model}</span>}
                  <span>{aiResult.design.boundedContexts.length} contexts</span>
                  <span>{aiResult.design.elements?.length ?? 0} elements</span>
                  <span>{aiResult.design.relationships?.length ?? 0} relationships</span>
                  <span>{aiResult.design.glossary?.length ?? 0} terms</span>
                </div>
                {aiResult.design.summary && <p className="text-xs leading-relaxed text-muted-foreground">{aiResult.design.summary}</p>}
                {aiResult.dropped.length > 0 && (
                  <p className="text-xs text-destructive" data-testid="text-ai-dropped">
                    {aiResult.dropped.length} item{aiResult.dropped.length === 1 ? '' : 's'} from the model did not fit the schema and were left out.
                  </p>
                )}
                <pre
                  className="max-h-48 overflow-auto border border-border bg-muted/40 p-3 font-mono-ui text-[10px] leading-relaxed"
                  data-testid="text-ai-preview"
                >
                  {JSON.stringify(aiResult.design, null, 2)}
                </pre>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={aiBusy || !aiPrompt.trim()}
                onClick={() => void runAiDesign()}
                data-testid="button-ai-preview"
                className="flex-1 border border-border py-2.5 text-sm font-medium hover:border-primary disabled:opacity-50"
              >
                {aiBusy && !aiResult ? 'Designing…' : aiResult ? 'Regenerate' : 'Generate design'}
              </button>
              <button
                type="button"
                disabled={aiBusy || !aiResult}
                onClick={() => void applyAiDesign()}
                data-testid="button-ai-apply"
                className="flex-1 bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {aiBusy && aiResult ? 'Applying…' : 'Apply to map'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'codegen' && (
        <Modal title="Generate code" eyebrow="export json → vertex adc · gemini adk" onClose={() => setModal(null)} testId="modal-codegen">
          <div className="space-y-4">
            <AiStatusBanner status={aiStatus.data} loading={aiStatus.isPending} offlineNote="Offline sketch output is TypeScript stubs whichever stack you pick." />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Exports the live domain model as stable JSON, then runs{' '}
              <strong className="text-foreground">Gemini ADK Codegen</strong> (or{' '}
              <strong className="text-foreground">Studio Sketch Codegen</strong> offline) to project source files.
              Design stays the source of truth.
            </p>
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Stack</span>
              <select
                value={codeStack}
                onChange={(e) => setCodeStack(e.target.value)}
                data-testid="select-code-stack"
                className="h-10 w-full border border-input bg-background px-3 text-sm"
              >
                <option value="typescript-express">TypeScript · Express</option>
                <option value="typescript-nestjs">TypeScript · NestJS</option>
                <option value="csharp-dotnet">C# · .NET</option>
                <option value="java-spring">Java · Spring</option>
              </select>
            </label>
            <Field
              label="Package name"
              value={codePackage}
              onChange={setCodePackage}
              placeholder="optional — defaults from project name"
              testId="input-code-package"
            />
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Scope</span>
              <select
                value={codeScope}
                onChange={(e) => setCodeScope(e.target.value as typeof codeScope)}
                data-testid="select-code-scope"
                className="h-10 w-full border border-input bg-background px-3 text-sm"
              >
                <option value="full">Full model</option>
                <option value="commands">Commands & handlers</option>
                <option value="events">Domain events</option>
                <option value="read-models">Read models & queries</option>
                <option value="sagas">Sagas & policies</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={codeIncludeTests}
                onChange={(e) => setCodeIncludeTests(e.target.checked)}
                data-testid="checkbox-code-tests"
              />
              Include test placeholders
            </label>
            {codeResult && (
              <pre
                className="max-h-56 overflow-auto border border-border bg-muted/40 p-3 font-mono-ui text-[10px] leading-relaxed"
                data-testid="text-codegen-preview"
              >
                {codeResult.slice(0, 8000)}
                {codeResult.length > 8000 ? '\n…' : ''}
              </pre>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={codeBusy}
                onClick={() => void downloadExport()}
                data-testid="button-codegen-export-only"
                className="flex-1 border border-border py-2.5 text-sm font-medium hover:border-primary disabled:opacity-50"
              >
                Download export JSON only
              </button>
              <button
                type="button"
                disabled={codeBusy}
                onClick={() => void runCodegen()}
                data-testid="button-codegen-run"
                className="flex-1 bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {codeBusy ? 'Generating…' : 'Generate code (JSON bundle)'}
              </button>
            </div>
          </div>
        </Modal>
      )}


    </div>
  );
}

function ContextInspector({
  context,
  onEdit,
  onDelete,
}: {
  context: { id: string; name: string; purpose: string; color: string; nodeCount: number; relationshipCount: number };
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-5" data-testid={`inspector-context-${context.id}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: context.color }} /> bounded context
          </div>
          <h2 className="mt-2 font-display text-2xl font-semibold">{context.name}</h2>
        </div>
        <button type="button" onClick={onDelete} data-testid="button-delete-context" className="text-muted-foreground hover:text-destructive">
          <Trash2 size={15} />
        </button>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{context.purpose || 'No purpose statement yet.'}</p>
      <div className="mt-7 grid grid-cols-2 gap-px border border-border bg-border">
        <div className="bg-background p-3">
          <div className="font-display text-xl font-semibold">{context.nodeCount}</div>
          <div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">elements</div>
        </div>
        <div className="bg-background p-3">
          <div className="font-display text-xl font-semibold">{context.relationshipCount}</div>
          <div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">connections</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        data-testid="button-edit-context"
        className="mt-6 flex w-full items-center justify-center gap-2 border border-border py-2.5 text-sm font-medium hover:border-primary hover:text-primary"
      >
        Edit boundary <ArrowRight size={14} />
      </button>
    </div>
  );
}

function NodeInspector({
  node,
  contexts,
  nodes,
  relationships,
  onClose,
  onSave,
  onDelete,
  onDeleteRelationship,
}: {
  node: {
    id: string;
    contextId: string;
    kind: string;
    name: string;
    description: string;
    status: string;
    tags: string[];
    methods?: string[];
    invariants?: string[];
    eventVersion?: string;
    eventPayloadSchema?: string;
    eventCompatibility?: string;
    representation?: 'logical' | 'physical';
    physicalTable?: { connectionId: string; schema: string; table: string } | null;
    generalizationConstraint?: (typeof GENERALIZATION_CONSTRAINTS)[number] | 'none';
  };
  contexts: Array<{ id: string; name: string }>;
  nodes: Array<{ id: string; name: string }>;
  relationships: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string }>;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    /** Moving to another context also clears the position, so the canvas re-places it beside its new context. */
    contextId: string;
    x?: null;
    y?: null;
    status: 'draft' | 'validated' | 'needs-review';
    tags: string[];
    methods: string[];
    invariants: string[];
    eventVersion: string;
    eventPayloadSchema: string;
    eventCompatibility: 'backward' | 'forward' | 'full' | 'none';
    sagaStyle?: 'orchestration' | 'choreography' | 'none';
    cqrsSide?: 'command' | 'query' | 'both' | 'none';
    representation?: 'logical' | 'physical';
    physicalTable?: { connectionId: string; schema: string; table: string } | null;
    generalizationConstraint?: (typeof GENERALIZATION_CONSTRAINTS)[number] | 'none';
  }) => void;
  onDelete: () => void;
  onDeleteRelationship: (id: string) => void;
}) {
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description);
  const [contextId, setContextId] = useState(node.contextId);
  const [status, setStatus] = useState(node.status);
  const [tags, setTags] = useState(node.tags.join(', '));
  const [methods, setMethods] = useState((node.methods ?? []).join('\n'));
  const [invariants, setInvariants] = useState((node.invariants ?? []).join('\n'));
  const [eventVersion, setEventVersion] = useState(node.eventVersion ?? '1.0.0');
  const [eventPayloadSchema, setEventPayloadSchema] = useState(node.eventPayloadSchema ?? '');
  const [eventCompatibility, setEventCompatibility] = useState(node.eventCompatibility ?? 'backward');
  const [sagaStyle, setSagaStyle] = useState((node as { sagaStyle?: string }).sagaStyle ?? 'none');
  const [cqrsSide, setCqrsSide] = useState((node as { cqrsSide?: string }).cqrsSide ?? 'none');
  const [representation, setRepresentation] = useState(node.representation ?? 'logical');
  const [physicalConnectionId, setPhysicalConnectionId] = useState(node.physicalTable?.connectionId ?? '');
  const [physicalTableKey, setPhysicalTableKey] = useState(node.physicalTable ? `${node.physicalTable.schema}.${node.physicalTable.table}` : '');
  const [generalizationConstraint, setGeneralizationConstraint] = useState(node.generalizationConstraint ?? 'none');
  useEffect(() => {
    setName(node.name);
    setContextId(node.contextId);
    setDescription(node.description);
    setStatus(node.status);
    setTags(node.tags.join(', '));
    setMethods((node.methods ?? []).join('\n'));
    setInvariants((node.invariants ?? []).join('\n'));
    setEventVersion(node.eventVersion ?? '1.0.0');
    setEventPayloadSchema(node.eventPayloadSchema ?? '');
    setEventCompatibility(node.eventCompatibility ?? 'backward');
    setSagaStyle((node as { sagaStyle?: string }).sagaStyle ?? 'none');
    setCqrsSide((node as { cqrsSide?: string }).cqrsSide ?? 'none');
    setRepresentation(node.representation ?? 'logical');
    setPhysicalConnectionId(node.physicalTable?.connectionId ?? '');
    setPhysicalTableKey(node.physicalTable ? `${node.physicalTable.schema}.${node.physicalTable.table}` : '');
    setGeneralizationConstraint(node.generalizationConstraint ?? 'none');
  }, [node]);
  const context = contexts.find((item) => item.id === node.contextId);
  const related = relationships.filter((item) => item.sourceId === node.id || item.targetId === node.id);
  const incomingGeneralizations = relationships.filter((r) => r.targetId === node.id && (r.type === 'generalization' || r.type === 'specialization'));

  const connectionsQuery = useListSchemaConnections();
  const connections = connectionsQuery.data ?? [];
  const [snapshot, setSnapshot] = useState<SchemaSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  useEffect(() => {
    if (representation !== 'physical' || !physicalConnectionId) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    setSnapshotLoading(true);
    getConnectionSnapshot(physicalConnectionId)
      .then((result) => !cancelled && setSnapshot(result))
      .catch(() => !cancelled && setSnapshot(null))
      .finally(() => !cancelled && setSnapshotLoading(false));
    return () => {
      cancelled = true;
    };
  }, [representation, physicalConnectionId]);
  const tableOptions = snapshot?.tables.map((t) => `${t.schema}.${t.name}`) ?? [];
  const selectedTable = snapshot?.tables.find((t) => `${t.schema}.${t.name}` === physicalTableKey);
  return (
    <div className="p-5" data-testid={`inspector-node-${node.id}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{node.kind}</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">{node.name}</h2>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDelete}
            data-testid="button-delete-node"
            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-close-inspector"
            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted"
          >
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <Field label="Name" value={name} onChange={setName} testId="input-inspector-name" />
        <Field
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="Describe the responsibility"
          testId="input-inspector-description"
          multiline
        />
        <Field
          label="Methods"
          value={methods}
          onChange={setMethods}
          placeholder="place(), cancel(), reserve() — one per line"
          testId="input-inspector-methods"
          multiline
        />
        {(node.kind === 'aggregate' || node.kind === 'aggregate-root' || node.kind === 'saga' || node.kind === 'process-manager' || node.kind === 'anti-corruption-layer') && (
          <Field
            label="Invariants"
            value={invariants}
            onChange={setInvariants}
            placeholder="Business rules — one per line"
            testId="input-inspector-invariants"
            multiline
          />
        )}
        {node.kind === 'domain-event' && (
          <>
            <Field label="Event version" value={eventVersion} onChange={setEventVersion} placeholder="1.0.0" testId="input-inspector-event-version" />
            <label className="block">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Compatibility</span>
              <select
                value={eventCompatibility}
                onChange={(event) => setEventCompatibility(event.target.value)}
                data-testid="select-inspector-event-compat"
                className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="backward">backward</option>
                <option value="forward">forward</option>
                <option value="full">full</option>
                <option value="none">none</option>
              </select>
            </label>
            <Field
              label="Payload contract (JSON Schema or prose)"
              value={eventPayloadSchema}
              onChange={setEventPayloadSchema}
              placeholder='{"type":"object","properties":{...}}'
              testId="input-inspector-event-schema"
              multiline
            />
          </>
        )}
        <label className="block">
          <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            data-testid="select-inspector-status"
            className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          >
            <option value="draft">draft</option>
            <option value="validated">validated</option>
            <option value="needs-review">needs-review</option>
          </select>
        </label>
        <Field label="Tags" value={tags} onChange={setTags} placeholder="invariant, core" testId="input-inspector-tags" />

        {node.kind === 'entity' && (
          <div className="border border-border bg-background/60 p-3">
            <span className="mb-2 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Representation</span>
            <div className="flex gap-1.5">
              {(['logical', 'physical'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRepresentation(r)}
                  data-testid={`button-representation-${r}`}
                  className={`flex-1 border px-2 py-1.5 text-xs font-medium capitalize ${
                    representation === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {representation === 'physical' && (
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="mb-1 block font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Connection</span>
                  <select
                    value={physicalConnectionId}
                    onChange={(e) => {
                      setPhysicalConnectionId(e.target.value);
                      setPhysicalTableKey('');
                    }}
                    data-testid="select-physical-connection"
                    className="h-9 w-full border border-input bg-background px-2 text-xs outline-none focus:border-primary"
                  >
                    <option value="">Choose a connection…</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {physicalConnectionId && (
                  <label className="block">
                    <span className="mb-1 block font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Table</span>
                    {snapshotLoading ? (
                      <div className="text-[11px] text-muted-foreground">Loading tables…</div>
                    ) : tableOptions.length ? (
                      <select
                        value={physicalTableKey}
                        onChange={(e) => setPhysicalTableKey(e.target.value)}
                        data-testid="select-physical-table"
                        className="h-9 w-full border border-input bg-background px-2 text-xs outline-none focus:border-primary"
                      >
                        <option value="">Choose a table…</option>
                        {tableOptions.map((key) => (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        No discovered tables for this session. Introspect this connection on the <span className="font-medium text-foreground">Schema connections</span> page first.
                      </p>
                    )}
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {incomingGeneralizations.length >= 2 && (
          <label className="block">
            <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">
              Generalization set ({incomingGeneralizations.length} subtypes)
            </span>
            <select
              value={generalizationConstraint}
              onChange={(e) => setGeneralizationConstraint(e.target.value as typeof generalizationConstraint)}
              data-testid="select-generalization-constraint"
              className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            >
              <option value="none">None</option>
              {GENERALIZATION_CONSTRAINTS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <label className="block">
          <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Belongs to</span>
          <select
            value={contextId}
            onChange={(e) => setContextId(e.target.value)}
            data-testid="select-inspector-context"
            className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          >
            {!context && <option value={node.contextId}>Unassigned</option>}
            {contexts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {contextId !== node.contextId && (
            <span className="mt-1 block text-[11px] text-muted-foreground">Saving moves this element next to the other elements of {contexts.find((c) => c.id === contextId)?.name}.</span>
          )}
        </label>
        {(node.kind === 'saga' || node.kind === 'process-manager' || node.kind === 'policy') && (
          <label className="mt-4 block">
            <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Saga style</span>
            <select
              value={sagaStyle}
              onChange={(e) => setSagaStyle(e.target.value)}
              className="h-9 w-full border border-input bg-background px-3 text-sm"
            >
              <option value="none">none</option>
              <option value="orchestration">orchestration (central coordinator)</option>
              <option value="choreography">choreography (peer events)</option>
            </select>
          </label>
        )}
        {(node.kind === 'command' ||
          node.kind === 'command-handler' ||
          node.kind === 'query-handler' ||
          node.kind === 'read-model' ||
          node.kind === 'domain-event') && (
          <label className="mt-4 block">
            <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">CQRS side</span>
            <select
              value={cqrsSide}
              onChange={(e) => setCqrsSide(e.target.value)}
              className="h-9 w-full border border-input bg-background px-3 text-sm"
            >
              <option value="none">none</option>
              <option value="command">command (write)</option>
              <option value="query">query (read)</option>
              <option value="both">both</option>
            </select>
          </label>
        )}
        <div className="mt-4">
          <div className="mb-2 font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">
            Connections <span className="text-foreground/50">({related.length})</span>
          </div>
          {related.length ? (
            <div className="space-y-2">
              {related.map((item) => {
                const otherNode = nodes.find((other) => other.id === (item.sourceId === node.id ? item.targetId : item.sourceId));
                return (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Link2 size={12} className="text-accent" />
                    <span>{item.type}</span>
                    <ArrowRight size={11} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{otherNode?.name ?? 'Unknown element'}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteRelationship(item.id)}
                      data-testid={`button-delete-relationship-${item.id}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No relationships yet.</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          onSave({
            contextId,
            ...(contextId !== node.contextId ? { x: null, y: null } : {}),
            name: name.trim(),
            description: description.trim(),
            status: status as 'draft' | 'validated' | 'needs-review',
            tags: parseList(tags),
            methods: parseList(methods),
            invariants: parseList(invariants),
            eventVersion: eventVersion.trim() || '1.0.0',
            eventPayloadSchema,
            eventCompatibility: eventCompatibility as 'backward' | 'forward' | 'full' | 'none',
            sagaStyle: sagaStyle as 'orchestration' | 'choreography' | 'none',
            cqrsSide: cqrsSide as 'command' | 'query' | 'both' | 'none',
            ...(node.kind === 'entity'
              ? {
                  representation,
                  // Only sent when a table is actually resolved (picked, with its snapshot loaded); otherwise
                  // omitted so a save that doesn't touch this field can't wipe an existing table reference
                  // just because this session hasn't (re-)loaded that connection's last discovery.
                  ...(representation === 'physical' && physicalConnectionId && selectedTable
                    ? { physicalTable: { connectionId: physicalConnectionId, schema: selectedTable.schema, table: selectedTable.name } }
                    : {}),
                }
              : {}),
            ...(incomingGeneralizations.length >= 2 ? { generalizationConstraint } : {}),
          })
        }
        disabled={!name.trim()}
        data-testid="button-save-node-inspector"
        className="mt-6 w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Save element
      </button>
    </div>
  );
}

function AiStatusBanner({ status, loading, offlineNote }: { status?: AiAuthStatus; loading: boolean; offlineNote?: string }) {
  if (loading) {
    return <div className="border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Checking Gemini credentials…</div>;
  }
  if (!status) return null;
  if (status.ok) {
    return (
      <div className="border border-accent/30 bg-accent/5 px-3 py-2 text-xs" data-testid="banner-ai-live">
        <span className="font-semibold text-accent">Gemini is live</span>
        <span className="text-muted-foreground"> · Vertex AI · {status.project} · {status.location}</span>
      </div>
    );
  }
  return (
    <div className="border border-primary/40 bg-primary/10 px-3 py-2 text-xs leading-relaxed" data-testid="banner-ai-offline">
      <span className="font-semibold">Offline sketch mode</span>
      <span className="text-muted-foreground"> — Gemini is not being used. {status.reason}</span>
      {offlineNote && <div className="mt-1 text-muted-foreground">{offlineNote}</div>}
    </div>
  );
}

function EdgeInspector({
  relationship,
  nodes,
  busy,
  onClose,
  onChange,
  onDelete,
}: {
  relationship: Relationship;
  nodes: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onChange: (data: { type?: (typeof relationshipTypes)[number]; label?: string; sourceId?: string; targetId?: string }) => void;
  onDelete: () => void;
}) {
  const source = nodes.find((n) => n.id === relationship.sourceId);
  const target = nodes.find((n) => n.id === relationship.targetId);
  const [label, setLabel] = useState(relationship.label);
  useEffect(() => setLabel(relationship.label), [relationship.label]);
  return (
    <div className="p-5" data-testid={`inspector-edge-${relationship.id}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">relationship</div>
          <h2 className="mt-2 font-display text-xl font-semibold leading-tight">
            <span className="break-words">{source?.name ?? '?'}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="break-words">{target?.name ?? '?'}</span>
          </h2>
        </div>
        <button type="button" onClick={onClose} data-testid="button-close-inspector" className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted">
          <X size={15} />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Type</span>
          <select
            value={relationship.type}
            onChange={(e) => onChange({ type: e.target.value as (typeof relationshipTypes)[number] })}
            disabled={busy}
            data-testid="select-edge-type"
            className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          >
            {relationshipTypes.map((t) => (
              <option key={t} value={t}>
                {t}
                {isStrategicType(t) ? ' (context map)' : ''}
              </option>
            ))}
          </select>
          {isStrategicType(relationship.type) && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground" data-testid="text-edge-strategic-hint">
              Context-mapping type: describes two bounded contexts, not these two elements specifically. It only appears on the Context Map, not here.
            </p>
          )}
        </label>
        <Field
          label="Label"
          value={label}
          onChange={setLabel}
          placeholder="optional, shown on the context map and event board"
          testId="input-edge-label"
        />
        <button
          type="button"
          onClick={() => onChange({ label: label.trim() })}
          disabled={busy || label.trim() === relationship.label}
          data-testid="button-save-edge-label"
          className="w-full border border-border py-2 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50"
        >
          Save label
        </button>
      </div>

      <div className="mt-5 flex gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => onChange({ sourceId: relationship.targetId, targetId: relationship.sourceId })}
          disabled={busy}
          data-testid="button-reverse-edge"
          className="flex flex-1 items-center justify-center gap-2 border border-border py-2 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <ArrowLeftRight size={14} /> Reverse
        </button>
        <button
          type="button"
          onClick={onDelete}
          data-testid="button-delete-edge"
          className="flex flex-1 items-center justify-center gap-2 border border-destructive/40 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Tip: press Delete with a line selected to remove it.</p>
    </div>
  );
}

/** What an empty workspace shows: a clear way to begin, never someone else's sample data. */
function FirstRun({ projectName, onAddContext, onDesignWithAi }: { projectName: string; onAddContext: () => void; onDesignWithAi: () => void }) {
  const queryClient = useQueryClient();
  const updateWorkspace = useUpdateWorkspace();
  const resetWorkspace = useResetWorkspace();
  const [name, setName] = useState('');
  const saveName = () => {
    const next = name.trim();
    if (!next || next === projectName) return;
    updateWorkspace.mutate({ data: { projectName: next } }, { onSuccess: () => invalidateModel(queryClient) });
  };
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-auto bg-card/90 p-6 backdrop-blur-[1px]" data-testid="first-run">
      <div className="w-full max-w-lg border border-border bg-card p-8 shadow-lg">
        <div className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-primary">new workspace</div>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Start your domain model</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Name the project, then map the first bounded context, or let Gemini propose a starting point you can reshape.
        </p>
        <label className="mt-6 block">
          <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Project name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            placeholder={projectName || 'e.g. Library Platform'}
            data-testid="input-first-run-name"
            className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onAddContext} data-testid="button-first-context" className="flex flex-1 items-center justify-center gap-2 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            <Plus size={15} /> Add a bounded context
          </button>
          <button type="button" onClick={onDesignWithAi} data-testid="button-first-ai" className="flex flex-1 items-center justify-center gap-2 border border-border px-4 py-2.5 text-sm font-medium hover:border-primary hover:text-primary">
            <Sparkles size={15} /> Design with AI
          </button>
        </div>
        <button
          type="button"
          onClick={() => resetWorkspace.mutate({ data: { seedSample: true } }, { onSuccess: () => { invalidateModel(queryClient); notify('Sample workspace loaded'); } })}
          disabled={resetWorkspace.isPending}
          data-testid="button-first-sample"
          className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline disabled:opacity-50"
        >
          Or explore the sample Commerce Platform workspace
        </button>
      </div>
    </div>
  );
}
