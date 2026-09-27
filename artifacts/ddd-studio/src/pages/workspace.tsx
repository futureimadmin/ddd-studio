import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  GitBranch,
  Link2,
  Map as MapIcon,
  Minus,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  X,
  Zap,
  Sparkles,
} from 'lucide-react';
import {
  getGetWorkspaceQueryKey,
  getListBoundedContextsQueryKey,
  getListDomainNodesQueryKey,
  getListRelationshipsQueryKey,
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
  useUpdateBoundedContext,
  useUpdateDomainNode,
} from '@workspace/api-client-react';
import { DomainMap } from '../components/domain-map';
import { EVENT_KINDS, EventSticky, SymbolPalette } from '../components/symbol-palette';

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
  const [zoom, setZoom] = useState(1);
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
  const [toast, setToast] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeStack, setCodeStack] = useState('typescript-express');
  const [codePackage, setCodePackage] = useState('');
  const [codeScope, setCodeScope] = useState<'full' | 'commands' | 'events' | 'read-models' | 'sagas'>('full');
  const [codeIncludeTests, setCodeIncludeTests] = useState(false);
  const [codeResult, setCodeResult] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<string>('');
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [activeRelationType, setActiveRelationType] = useState<string | null>(null);

  const createContext = useCreateBoundedContext();
  const updateContext = useUpdateBoundedContext();
  const deleteContext = useDeleteBoundedContext();
  const createNode = useCreateDomainNode();
  const updateNode = useUpdateDomainNode();
  const deleteNode = useDeleteDomainNode();
  const createRelationship = useCreateRelationship();
  const deleteRelationship = useDeleteRelationship();

  const selectedNode = nodes.find((node) => node.id === selectedId);
  const selectedContext = contexts.find((context) => context.id === selectedId);

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

  const invalidateMap = () => {
    void queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListBoundedContextsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDomainNodesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListRelationshipsQueryKey() });
  };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  
  const downloadExport = async () => {
    try {
      const res = await fetch('/api/workspace/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || 'ddd-export.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify('Domain model exported as JSON');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const runCodegen = async () => {
    setCodeBusy(true);
    setCodeResult(null);
    try {
      const res = await fetch('/api/ai/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stack: codeStack,
          packageName: codePackage.trim() || undefined,
          scope: codeScope,
          includeTests: codeIncludeTests,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Code generation failed');
      const files = body.codegen?.files ?? [];
      const preview = files
        .slice(0, 12)
        .map((f: { path: string; description?: string }) => `// ${f.path}${f.description ? ` — ${f.description}` : ''}`)
        .join('\n');
      const full = JSON.stringify(
        {
          generator: body.generator,
          source: body.source,
          model: body.model,
          summary: body.codegen?.summary,
          fileCount: files.length,
          files: files.map((f: { path: string; language: string; description: string; content: string }) => ({
            path: f.path,
            language: f.language,
            description: f.description,
            content: f.content,
          })),
        },
        null,
        2,
      );
      setCodeResult(full);
      const genName = body.generator?.name ?? body.source;
      notify(`${genName}: ${files.length} files — ${body.codegen?.summary || 'done'}`);
      // Offer download of full codegen result
      const blob = new Blob([full], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ddd-codegen-${(body.codegen?.packageName || 'domain').replace(/[^a-z0-9_-]+/gi, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      void preview;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Code generation failed');
    } finally {
      setCodeBusy(false);
    }
  };

const runAiDesign = async (apply: boolean) => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiPreview('');
    try {
      const res = await fetch('/api/ai/generate-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim(), apply, mode: 'merge' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'AI design failed');
      setAiPreview(JSON.stringify(body.design, null, 2));
      const designerName =
        body.designer?.name ??
        (body.source === 'mock' ? 'Studio Sketch Designer' : 'Gemini ADK Designer');
      if (apply) {
        invalidateMap();
        setModal(null);
        notify(`${designerName}: applied to the map`);
      } else {
        notify(`${designerName}: preview ready — review then Apply`);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'AI design failed');
    } finally {
      setAiBusy(false);
    }
  };


  const openNewNode = (kind = 'aggregate') => {
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
          x: 20 + ((nodes.length * 13) % 65),
          y: 18 + ((nodes.length * 19) % 65),
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
          setConnectFromId(null);
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

  const onPickKind = (kind: string) => {
    openNewNode(kind);
  };

  const onPickRelation = (type: string) => {
    setActiveRelationType(type);
    setConnectFromId(null);
    notify(`Connect mode: ${type} — click source, then target`);
  };

  const onConnectEnd = (targetId: string) => {
    if (!connectFromId || !activeRelationType || connectFromId === targetId) {
      setConnectFromId(null);
      return;
    }
    const source = nodes.find((n) => n.id === connectFromId);
    createRelationship.mutate(
      {
        data: {
          sourceId: connectFromId,
          targetId,
          type: activeRelationType as (typeof relationshipTypes)[number],
          label: '',
          contextId: source?.contextId ?? contexts[0]?.id ?? '',
        },
      },
      {
        onSuccess: () => {
          invalidateMap();
          setConnectFromId(null);
          notify(`${activeRelationType} linked`);
        },
      },
    );
  };

  const onSelectNode = (id: string) => {
    if (activeRelationType && viewTab === 'designer') {
      if (!connectFromId) {
        setConnectFromId(id);
        setSelectedId(id);
        return;
      }
      onConnectEnd(id);
      return;
    }
    setSelectedId(id);
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/x-ddd-kind');
    if (kind) openNewNode(kind);
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
      {toast && (
        <div
          className="fixed right-5 top-20 z-50 flex items-center gap-2 border border-accent/30 bg-card px-4 py-3 text-sm shadow-xl animate-rise-in"
          data-testid="status-toast"
        >
          <Check size={15} className="text-accent" />
          {toast}
        </div>
      )}

      <div className="mb-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-primary">
            <span className="h-1.5 w-1.5 bg-primary" /> living model
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl" data-testid="text-workspace-title">
            {workspace.data?.projectName ?? 'Order platform'}
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
              setAiPreview('');
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
                setConnectFromId(null);
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

      {activeRelationType && viewTab === 'designer' && (
        <div className="mb-3 flex items-center justify-between gap-3 border border-primary/40 bg-primary/5 px-3 py-2 text-xs" data-testid="connect-mode-banner">
          <span>
            Connect mode: <strong>{activeRelationType}</strong>
            {connectFromId ? ' — now click the target element' : ' — click the source element'}
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveRelationType(null);
              setConnectFromId(null);
            }}
            className="font-medium text-primary hover:underline"
          >
            Cancel
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
            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(0.8, Number((value - 0.1).toFixed(1))))}
                data-testid="button-zoom-out"
                className="flex h-7 w-7 items-center justify-center hover:bg-muted"
              >
                <Minus size={14} />
              </button>
              <span className="w-9 text-center font-mono-ui text-[10px]">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(1.3, Number((value + 0.1).toFixed(1))))}
                data-testid="button-zoom-in"
                className="flex h-7 w-7 items-center justify-center hover:bg-muted"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="flex min-h-[610px]" onDragOver={(e) => e.preventDefault()} onDrop={onCanvasDrop}>
            {(viewTab === 'designer' || viewTab === 'event-storming') && (
              <SymbolPalette
                mode={viewTab === 'event-storming' ? 'event-storming' : 'designer'}
                onPickKind={onPickKind}
                onPickRelation={onPickRelation}
                activeRelationType={activeRelationType}
                connectMode={Boolean(activeRelationType)}
              />
            )}

            <div className="min-w-0 flex-1">
              {viewTab === 'designer' && (
                <DomainMap
                  nodes={visibleNodes}
                  relationships={domainRelationships}
                  contexts={contexts}
                  selectedId={selectedId}
                  zoom={zoom}
                  onSelect={onSelectNode}
                  showLabels={false}
                  connectFromId={connectFromId}
                  onConnectEnd={onConnectEnd}
                />
              )}
              {viewTab === 'context-map' && (
                <DomainMap
                  nodes={nodes}
                  relationships={relationships}
                  contexts={contexts}
                  selectedId={selectedId}
                  zoom={zoom}
                  onSelect={setSelectedId}
                  showLabels
                  contextMode
                />
              )}
              {viewTab === 'event-storming' && (
                <DomainMap
                  nodes={visibleEvents}
                  relationships={relationships}
                  contexts={contexts}
                  selectedId={selectedId}
                  zoom={zoom}
                  onSelect={onSelectNode}
                  showLabels
                  timelineMode
                  highlightIds={chainHighlight}
                  connectFromId={connectFromId}
                  onConnectEnd={onConnectEnd}
                />
              )}
            </div>
          </div>
        </section>

        <aside className="border border-border bg-card">
          {selectedNode ? (
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
        <Modal title="AI domain design" eyebrow="gemini · adk 2.x" onClose={() => setModal(null)} testId="modal-ai-design">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Describe the product or problem. Two designers share the same JSON schema:
              <strong className="text-foreground"> Gemini ADK Designer</strong> (live, needs API key) and
              <strong className="text-foreground"> Studio Sketch Designer</strong> (offline mock).
              Both emit bounded contexts, elements, relationships, and glossary for the canvas — design only, not code.
            </p>
            <Field
              label="Design prompt"
              value={aiPrompt}
              onChange={setAiPrompt}
              placeholder="e.g. Multi-tenant SaaS billing with subscriptions, invoices, and dunning across Finance and Customer Success contexts"
              testId="input-ai-prompt"
              multiline
            />
            {aiPreview && (
              <pre
                className="max-h-48 overflow-auto border border-border bg-muted/40 p-3 font-mono-ui text-[10px] leading-relaxed"
                data-testid="text-ai-preview"
              >
                {aiPreview}
              </pre>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={aiBusy || !aiPrompt.trim()}
                onClick={() => void runAiDesign(false)}
                data-testid="button-ai-preview"
                className="flex-1 border border-border py-2.5 text-sm font-medium hover:border-primary disabled:opacity-50"
              >
                {aiBusy ? 'Working…' : 'Preview JSON'}
              </button>
              <button
                type="button"
                disabled={aiBusy || !aiPrompt.trim()}
                onClick={() => void runAiDesign(true)}
                data-testid="button-ai-apply"
                className="flex-1 bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {aiBusy ? 'Applying…' : 'Generate & apply to map'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'codegen' && (
        <Modal title="Generate code" eyebrow="export json → gemini adk" onClose={() => setModal(null)} testId="modal-codegen">
          <div className="space-y-4">
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
  };
  contexts: Array<{ id: string; name: string }>;
  nodes: Array<{ id: string; name: string }>;
  relationships: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string }>;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    status: 'draft' | 'validated' | 'needs-review';
    tags: string[];
    methods: string[];
    invariants: string[];
    eventVersion: string;
    eventPayloadSchema: string;
    eventCompatibility: 'backward' | 'forward' | 'full' | 'none';
    sagaStyle?: 'orchestration' | 'choreography' | 'none';
    cqrsSide?: 'command' | 'query' | 'both' | 'none';
  }) => void;
  onDelete: () => void;
  onDeleteRelationship: (id: string) => void;
}) {
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description);
  const [status, setStatus] = useState(node.status);
  const [tags, setTags] = useState(node.tags.join(', '));
  const [methods, setMethods] = useState((node.methods ?? []).join('\n'));
  const [invariants, setInvariants] = useState((node.invariants ?? []).join('\n'));
  const [eventVersion, setEventVersion] = useState(node.eventVersion ?? '1.0.0');
  const [eventPayloadSchema, setEventPayloadSchema] = useState(node.eventPayloadSchema ?? '');
  const [eventCompatibility, setEventCompatibility] = useState(node.eventCompatibility ?? 'backward');
  const [sagaStyle, setSagaStyle] = useState((node as { sagaStyle?: string }).sagaStyle ?? 'none');
  const [cqrsSide, setCqrsSide] = useState((node as { cqrsSide?: string }).cqrsSide ?? 'none');
  useEffect(() => {
    setName(node.name);
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
  }, [node]);
  const context = contexts.find((item) => item.id === node.contextId);
  const related = relationships.filter((item) => item.sourceId === node.id || item.targetId === node.id);
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
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Belongs to</span>
          <span className="text-xs font-medium">{context?.name ?? 'Unassigned'}</span>
        </div>
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
