import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronDown, CircleDot, GitBranch, Link2, Minus, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
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

const nodeKinds = ['aggregate', 'aggregate-root', 'entity', 'value-object', 'domain-event', 'command', 'policy', 'actor', 'read-model', 'repository', 'service', 'resource'] as const;
const relationshipTypes = ['uses', 'aggregation', 'composition', 'generalization', 'specialization', 'publishes', 'subscribes', 'owns', 'invokes', 'exposed-by'] as const;
const contextColors = ['#e7a94b', '#3e9b9a', '#d8755e', '#6588c5', '#8c71b7'];

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className}`} />;
}

function Field({ label, value, onChange, placeholder, testId, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; testId: string; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} data-testid={testId} className="min-h-[78px] w-full resize-none border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/10" /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} data-testid={testId} className="h-10 w-full border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/10" />}
    </label>
  );
}

function Modal({ title, eyebrow, children, onClose, testId }: { title: string; eyebrow: string; children: React.ReactNode; onClose: () => void; testId: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" data-testid={testId}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-auto border border-border bg-card shadow-2xl animate-rise-in">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div><div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{eyebrow}</div><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{title}</h2></div>
          <button type="button" onClick={onClose} data-testid="button-close-modal" className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={17} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
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
  const [modal, setModal] = useState<'context' | 'node' | 'relationship' | null>(null);
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [nodeForm, setNodeForm] = useState({ contextId: '', kind: 'aggregate', name: '', description: '', status: 'draft', tags: '' });
  const [contextForm, setContextForm] = useState({ name: '', purpose: '', color: contextColors[0] });
  const [relationshipForm, setRelationshipForm] = useState({ sourceId: '', targetId: '', type: 'uses', label: '', contextId: '' });
  const [toast, setToast] = useState('');

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
  const visibleNodes = useMemo(() => nodes.filter((node) => (contextFilter === 'all' || node.contextId === contextFilter) && (!search || `${node.name} ${node.kind} ${node.description}`.toLowerCase().includes(search.toLowerCase()))), [nodes, contextFilter, search]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const invalidateMap = () => {
    void queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListBoundedContextsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDomainNodesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListRelationshipsQueryKey() });
  };
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };

  const openNewNode = () => {
    setNodeForm({ contextId: contextFilter === 'all' ? contexts[0]?.id ?? '' : contextFilter, kind: 'aggregate', name: '', description: '', status: 'draft', tags: '' });
    setModal('node');
  };
  const saveNode = () => {
    if (!nodeForm.name.trim() || !nodeForm.contextId) return;
    createNode.mutate({ data: { ...nodeForm, name: nodeForm.name.trim(), description: nodeForm.description.trim(), status: nodeForm.status as 'draft' | 'validated' | 'needs-review', kind: nodeForm.kind as typeof nodeKinds[number], x: 20 + (nodes.length * 13) % 65, y: 18 + (nodes.length * 19) % 65, tags: nodeForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean) } }, { onSuccess: () => { invalidateMap(); setModal(null); notify('Node added to the map'); } });
  };
  const saveContext = () => {
    if (!contextForm.name.trim()) return;
    const payload = { name: contextForm.name.trim(), purpose: contextForm.purpose.trim(), color: contextForm.color };
    if (editingContext) updateContext.mutate({ id: editingContext, data: payload }, { onSuccess: () => { invalidateMap(); setModal(null); notify('Context updated'); } });
    else createContext.mutate({ data: payload }, { onSuccess: () => { invalidateMap(); setModal(null); notify('Bounded context created'); } });
  };
  const saveRelationship = () => {
    if (!relationshipForm.sourceId || !relationshipForm.targetId || !relationshipForm.contextId || relationshipForm.sourceId === relationshipForm.targetId) return;
    createRelationship.mutate({ data: relationshipForm as { sourceId: string; targetId: string; type: 'uses'; label: string; contextId: string } }, { onSuccess: () => { invalidateMap(); setModal(null); notify('Semantic relationship connected'); } });
  };
  const beginEditContext = (id: string) => {
    const context = contexts.find((item) => item.id === id);
    if (context) { setEditingContext(id); setContextForm({ name: context.name, purpose: context.purpose, color: context.color }); setModal('context'); }
  };

  const isLoading = workspace.isLoading || contextsQuery.isLoading || nodesQuery.isLoading || relationshipsQuery.isLoading;
  if (isLoading && !contexts.length && !nodes.length) {
    return <div className="space-y-6 p-5 md:p-8"><Skeleton className="h-8 w-64" /><div className="grid gap-4 md:grid-cols-[1fr_280px]"><Skeleton className="h-[520px]" /><Skeleton className="h-[520px]" /></div></div>;
  }
  if ((workspace.isError || contextsQuery.isError || nodesQuery.isError) && !contexts.length) {
    return <div className="flex min-h-[70dvh] items-center justify-center p-6"><div className="max-w-sm border border-destructive/30 bg-card p-8 text-center"><div className="font-display text-2xl font-semibold">The map is unavailable</div><p className="mt-2 text-sm text-muted-foreground">The workspace could not be loaded. Try the connection again.</p><button onClick={() => { void workspace.refetch(); void contextsQuery.refetch(); void nodesQuery.refetch(); }} data-testid="button-retry-workspace" className="mt-6 inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><RefreshCw size={14} /> Retry load</button></div></div>;
  }

  return (
    <div className="relative min-h-[calc(100dvh-76px)] p-5 md:p-8">
      {toast && <div className="fixed right-5 top-20 z-50 flex items-center gap-2 border border-accent/30 bg-card px-4 py-3 text-sm shadow-xl animate-rise-in" data-testid="status-toast"><Check size={15} className="text-accent" />{toast}</div>}
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-primary"><span className="h-1.5 w-1.5 bg-primary" /> living model</div><h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl" data-testid="text-workspace-title">{workspace.data?.projectName ?? 'Order platform'}</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Shape the language your team builds around. Every node is a decision made visible.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingContext(null); setContextForm({ name: '', purpose: '', color: contextColors[contexts.length % contextColors.length] }); setModal('context'); }} data-testid="button-add-context" className="inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"><Plus size={15} /> Add context</button><button type="button" onClick={() => { setRelationshipForm({ sourceId: '', targetId: '', type: 'uses', label: '', contextId: contextFilter === 'all' ? contexts[0]?.id ?? '' : contextFilter }); setModal('relationship'); }} data-testid="button-add-relationship" className="inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"><Link2 size={15} /> Connect</button><button type="button" onClick={openNewNode} data-testid="button-add-node" className="inline-flex items-center gap-2 bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"><Plus size={15} /> Add model element</button></div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {[['CONTEXTS', contexts.length, 'mapped boundaries'], ['ELEMENTS', nodes.length, 'domain language'], ['RELATIONSHIPS', relationships.length, 'explicit semantics'], ['OPEN REVIEWS', nodes.filter((node) => node.status === 'needs-review').length, 'need a decision']].map(([label, value, hint]) => <div className="bg-card px-4 py-3.5" key={label} data-testid={`stat-${String(label).toLowerCase()}`}><div className="font-mono-ui text-[10px] tracking-[.16em] text-muted-foreground">{label}</div><div className="mt-1 flex items-baseline gap-2"><span className="font-display text-2xl font-semibold">{value}</span><span className="hidden text-[11px] text-muted-foreground sm:inline">{hint}</span></div></div>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1 overflow-auto">
          <button type="button" onClick={() => { setContextFilter('all'); setSelectedId(null); }} data-testid="filter-context-all" className={`whitespace-nowrap px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[.08em] ${contextFilter === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>all contexts</button>
          {contexts.map((context) => <button type="button" key={context.id} onClick={() => { setContextFilter(context.id); setSelectedId(context.id); }} data-testid={`filter-context-${context.id}`} className={`flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs ${contextFilter === context.id ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted'}`}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: context.color }} />{context.name}</button>)}
        </div>
        <label className="flex items-center gap-2 border-l border-border pl-3 text-muted-foreground"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an element" data-testid="input-search-nodes" className="w-[130px] bg-transparent text-xs outline-none placeholder:text-muted-foreground/60" /></label>
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <section className="min-h-[610px] overflow-hidden border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold"><GitBranch size={15} className="text-primary" /> Domain topology <span className="font-mono-ui text-[10px] font-normal text-muted-foreground">{visibleNodes.length} visible</span></div><div className="flex items-center gap-1 text-muted-foreground"><button type="button" data-testid="button-zoom-out" className="flex h-7 w-7 items-center justify-center hover:bg-muted"><Minus size={14} /></button><span className="w-9 text-center font-mono-ui text-[10px]">100%</span><button type="button" data-testid="button-zoom-in" className="flex h-7 w-7 items-center justify-center hover:bg-muted"><Plus size={14} /></button></div></div>
          <div className="grid-paper relative min-h-[566px] overflow-hidden bg-background/60">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/.08),transparent_27%),radial-gradient(circle_at_85%_80%,hsl(var(--accent)/.06),transparent_28%)]" />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 566" preserveAspectRatio="none">{relationships.filter((relationship) => nodeMap.has(relationship.sourceId) && nodeMap.has(relationship.targetId)).map((relationship) => { const source = nodeMap.get(relationship.sourceId)!; const target = nodeMap.get(relationship.targetId)!; return <g key={relationship.id}><line x1={`${source.x}%`} y1={`${source.y}%`} x2={`${target.x}%`} y2={`${target.y}%`} stroke="hsl(var(--accent) / .56)" strokeWidth="1.4" strokeDasharray={relationship.type === 'uses' ? '5 4' : undefined} /><circle cx={`${target.x}%`} cy={`${target.y}%`} r="3" fill="hsl(var(--accent))" /><text x={`${(source.x + target.x) / 2}%`} y={`${(source.y + target.y) / 2 - 2}%`} fill="hsl(var(--muted-foreground))" fontSize="9" textAnchor="middle">{relationship.label || relationship.type}</text></g>; })}</svg>
            {visibleNodes.length === 0 ? <div className="absolute inset-0 flex items-center justify-center p-8"><div className="max-w-sm border border-dashed border-border bg-card/80 p-8 text-center"><CircleDot size={28} className="mx-auto text-primary" /><h3 className="mt-4 font-display text-xl font-semibold">{contexts.length ? 'No elements match this view' : 'Start with a bounded context'}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{contexts.length ? 'Try another context or clear your search, then keep shaping the map.' : 'A context gives your domain language a boundary. Create one, then add the first aggregate.'}</p><button type="button" onClick={contexts.length ? () => { setContextFilter('all'); setSearch(''); } : () => setModal('context')} data-testid="button-empty-map-action" className="mt-5 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{contexts.length ? 'Show everything' : 'Create context'}</button></div></div> : visibleNodes.map((node, index) => { const context = contexts.find((item) => item.id === node.contextId); const isSelected = node.id === selectedId; return <button type="button" key={node.id} onClick={() => setSelectedId(node.id)} data-testid={`node-card-${node.id}`} className={`absolute w-[142px] -translate-x-1/2 -translate-y-1/2 border bg-card px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-[calc(50%+3px)] hover:shadow-md ${isSelected ? 'z-10 border-primary ring-2 ring-primary/20' : 'border-border'}`} style={{ left: `${Math.min(88, Math.max(12, node.x || 18 + index * 16))}%`, top: `${Math.min(88, Math.max(12, node.y || 20 + index * 14))}%` }}><div className="mb-1 flex items-center justify-between gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: context?.color ?? '#e7a94b' }} /><span className="font-mono-ui text-[9px] uppercase tracking-[.08em] text-muted-foreground">{node.kind}</span></div><div className="truncate text-xs font-semibold" data-testid={`text-node-name-${node.id}`}>{node.name}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{node.description || 'No description yet'}</div><div className="mt-2 flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${node.status === 'validated' ? 'bg-accent' : node.status === 'needs-review' ? 'bg-destructive' : 'bg-primary'}`} /><span className="font-mono-ui text-[9px] text-muted-foreground">{node.status}</span></div></button>; })}
          </div>
        </section>
        <aside className="border border-border bg-card">
          {selectedNode ? <NodeInspector node={selectedNode} contexts={contexts} relationships={relationships} onClose={() => setSelectedId(null)} onSave={(data) => updateNode.mutate({ id: selectedNode.id, data }, { onSuccess: () => { invalidateMap(); notify('Element updated'); } })} onDelete={() => { if (window.confirm(`Delete ${selectedNode.name}?`)) deleteNode.mutate({ id: selectedNode.id }, { onSuccess: () => { invalidateMap(); setSelectedId(null); notify('Element removed'); } }); }} onDeleteRelationship={(id) => { if (window.confirm('Delete this semantic relationship?')) deleteRelationship.mutate({ id }, { onSuccess: () => { invalidateMap(); notify('Relationship removed'); } }); }} /> : selectedContext ? <ContextInspector context={selectedContext} onEdit={() => beginEditContext(selectedContext.id)} onDelete={() => { if (window.confirm(`Delete ${selectedContext.name}?`)) deleteContext.mutate({ id: selectedContext.id }, { onSuccess: () => { invalidateMap(); setSelectedId(null); notify('Context removed'); } }); }} /> : <div className="flex min-h-[610px] flex-col justify-between p-5"><div><div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground">model inspector</div><h2 className="mt-2 font-display text-2xl font-semibold">Make meaning explicit.</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Select an element on the map to inspect its role, status, and semantic connections.</p></div><div className="space-y-3 border-t border-border pt-5 text-xs text-muted-foreground"><div className="flex items-center justify-between"><span>Tip</span><span className="font-mono-ui text-[10px]">click any node</span></div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" /> draft — still forming</div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" /> validated — team language</div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-destructive" /> needs review — open decision</div></div></div>}
        </aside>
      </div>
      {modal === 'context' && <Modal title={editingContext ? 'Edit context' : 'New bounded context'} eyebrow="boundary definition" onClose={() => setModal(null)} testId="modal-context"><div className="space-y-4"><Field label="Name" value={contextForm.name} onChange={(value) => setContextForm((form) => ({ ...form, name: value }))} placeholder="e.g. Fulfillment" testId="input-context-name" /><Field label="Purpose" value={contextForm.purpose} onChange={(value) => setContextForm((form) => ({ ...form, purpose: value }))} placeholder="What responsibility lives here?" testId="input-context-purpose" multiline /><div><span className="mb-2 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Boundary color</span><div className="flex gap-2">{contextColors.map((color) => <button type="button" key={color} onClick={() => setContextForm((form) => ({ ...form, color }))} data-testid={`button-color-${color.slice(1)}`} className={`h-8 w-8 rounded-full border-2 ${contextForm.color === color ? 'border-foreground' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div></div><button type="button" onClick={saveContext} disabled={createContext.isPending || updateContext.isPending || !contextForm.name.trim()} data-testid="button-save-context" className="mt-2 w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{createContext.isPending || updateContext.isPending ? 'Saving boundary…' : editingContext ? 'Save context' : 'Create bounded context'}</button></div></Modal>}
      {modal === 'node' && <Modal title="Add model element" eyebrow="domain language" onClose={() => setModal(null)} testId="modal-node"><div className="space-y-4"><Field label="Name" value={nodeForm.name} onChange={(value) => setNodeForm((form) => ({ ...form, name: value }))} placeholder="e.g. Shipment" testId="input-node-name" /><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Kind</span><select value={nodeForm.kind} onChange={(event) => setNodeForm((form) => ({ ...form, kind: event.target.value }))} data-testid="select-node-kind" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary">{nodeKinds.map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select></label><label><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Context</span><select value={nodeForm.contextId} onChange={(event) => setNodeForm((form) => ({ ...form, contextId: event.target.value }))} data-testid="select-node-context" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Choose context</option>{contexts.map((context) => <option value={context.id} key={context.id}>{context.name}</option>)}</select></label></div><Field label="Description" value={nodeForm.description} onChange={(value) => setNodeForm((form) => ({ ...form, description: value }))} placeholder="What does this element know or do?" testId="input-node-description" multiline /><Field label="Tags" value={nodeForm.tags} onChange={(value) => setNodeForm((form) => ({ ...form, tags: value }))} placeholder="payments, invariant, external" testId="input-node-tags" /><button type="button" onClick={saveNode} disabled={createNode.isPending || !nodeForm.name.trim() || !nodeForm.contextId} data-testid="button-save-node" className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{createNode.isPending ? 'Adding element…' : 'Add to domain map'}</button></div></Modal>}
      {modal === 'relationship' && <Modal title="Connect semantics" eyebrow="explicit relationship" onClose={() => setModal(null)} testId="modal-relationship"><div className="space-y-4"><label className="block"><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">From</span><select value={relationshipForm.sourceId} onChange={(event) => setRelationshipForm((form) => ({ ...form, sourceId: event.target.value }))} data-testid="select-relationship-source" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Select source</option>{nodes.map((node) => <option value={node.id} key={node.id}>{node.name} · {node.kind}</option>)}</select></label><label className="block"><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Relationship</span><select value={relationshipForm.type} onChange={(event) => setRelationshipForm((form) => ({ ...form, type: event.target.value }))} data-testid="select-relationship-type" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary">{relationshipTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></label><label className="block"><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">To</span><select value={relationshipForm.targetId} onChange={(event) => setRelationshipForm((form) => ({ ...form, targetId: event.target.value }))} data-testid="select-relationship-target" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Select target</option>{nodes.map((node) => <option value={node.id} key={node.id}>{node.name} · {node.kind}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><Field label="Label" value={relationshipForm.label} onChange={(value) => setRelationshipForm((form) => ({ ...form, label: value }))} placeholder="initiates" testId="input-relationship-label" /><label><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Context</span><select value={relationshipForm.contextId} onChange={(event) => setRelationshipForm((form) => ({ ...form, contextId: event.target.value }))} data-testid="select-relationship-context" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Choose context</option>{contexts.map((context) => <option value={context.id} key={context.id}>{context.name}</option>)}</select></label></div><button type="button" onClick={saveRelationship} disabled={createRelationship.isPending || !relationshipForm.sourceId || !relationshipForm.targetId || !relationshipForm.contextId} data-testid="button-save-relationship" className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{createRelationship.isPending ? 'Connecting…' : 'Create relationship'}</button></div></Modal>}
    </div>
  );
}

function ContextInspector({ context, onEdit, onDelete }: { context: { id: string; name: string; purpose: string; color: string; nodeCount: number; relationshipCount: number }; onEdit: () => void; onDelete: () => void }) {
  return <div className="p-5" data-testid={`inspector-context-${context.id}`}><div className="flex items-start justify-between"><div><div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: context.color }} /> bounded context</div><h2 className="mt-2 font-display text-2xl font-semibold">{context.name}</h2></div><button type="button" onClick={onDelete} data-testid="button-delete-context" className="text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button></div><p className="mt-5 text-sm leading-relaxed text-muted-foreground">{context.purpose || 'No purpose statement yet.'}</p><div className="mt-7 grid grid-cols-2 gap-px border border-border bg-border"><div className="bg-background p-3"><div className="font-display text-xl font-semibold">{context.nodeCount}</div><div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">elements</div></div><div className="bg-background p-3"><div className="font-display text-xl font-semibold">{context.relationshipCount}</div><div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">connections</div></div></div><button type="button" onClick={onEdit} data-testid="button-edit-context" className="mt-6 flex w-full items-center justify-center gap-2 border border-border py-2.5 text-sm font-medium hover:border-primary hover:text-primary">Edit boundary <ArrowRight size={14} /></button></div>;
}

function NodeInspector({ node, contexts, relationships, onClose, onSave, onDelete, onDeleteRelationship }: { node: { id: string; contextId: string; kind: string; name: string; description: string; status: string; tags: string[] }; contexts: Array<{ id: string; name: string }>; relationships: Array<{ id: string; sourceId: string; targetId: string; type: string; label: string }>; onClose: () => void; onSave: (data: { name: string; description: string; status: 'draft' | 'validated' | 'needs-review'; tags: string[] }) => void; onDelete: () => void; onDeleteRelationship: (id: string) => void }) {
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description);
  const [status, setStatus] = useState(node.status);
  const [tags, setTags] = useState(node.tags.join(', '));
  const context = contexts.find((item) => item.id === node.contextId);
  const related = relationships.filter((item) => item.sourceId === node.id || item.targetId === node.id);
  return <div className="p-5" data-testid={`inspector-node-${node.id}`}><div className="flex items-start justify-between"><div><div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{node.kind}</div><h2 className="mt-2 font-display text-2xl font-semibold">{node.name}</h2></div><div className="flex gap-1"><button type="button" onClick={onDelete} data-testid="button-delete-node" className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button><button type="button" onClick={onClose} data-testid="button-close-inspector" className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted"><X size={15} /></button></div></div><div className="mt-5 space-y-4"><Field label="Name" value={name} onChange={setName} testId="input-inspector-name" /><Field label="Description" value={description} onChange={setDescription} placeholder="Describe the responsibility" testId="input-inspector-description" multiline /><label className="block"><span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)} data-testid="select-inspector-status" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="draft">draft</option><option value="validated">validated</option><option value="needs-review">needs-review</option></select></label><Field label="Tags" value={tags} onChange={setTags} placeholder="invariant, core" testId="input-inspector-tags" /></div><div className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between"><span className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Belongs to</span><span className="text-xs font-medium">{context?.name ?? 'Unassigned'}</span></div><div className="mt-4"><div className="mb-2 font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Semantic connections <span className="text-foreground/50">({related.length})</span></div>{related.length ? <div className="space-y-2">{related.map((item) => <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 size={12} className="text-accent" /><span>{item.label || item.type}</span><ArrowRight size={11} /><span className="min-w-0 flex-1 truncate text-foreground">{item.sourceId === node.id ? item.targetId : item.sourceId}</span><button type="button" onClick={() => onDeleteRelationship(item.id)} data-testid={`button-delete-relationship-${item.id}`} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button></div>)}</div> : <div className="text-xs text-muted-foreground">No relationships yet.</div>}</div></div><button type="button" onClick={() => onSave({ name: name.trim(), description: description.trim(), status: status as 'draft' | 'validated' | 'needs-review', tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) })} disabled={!name.trim()} data-testid="button-save-node-inspector" className="mt-6 w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save element</button></div>;
}
