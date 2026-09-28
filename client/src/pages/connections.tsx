import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, Check, Database, Eye, KeyRound, LoaderCircle, Lock, Plus, RefreshCw, Table2, Trash2, X } from 'lucide-react';
import {
  ApiError,
  getConnectionSnapshot,
  getListSchemaConnectionsQueryKey,
  invalidateModel,
  useCreateSchemaConnection,
  useDeleteSchemaConnection,
  useImportSchema,
  useIntrospectSchemaConnection,
  useListBoundedContexts,
  useListSchemaConnections,
  type Connection,
  type SchemaSnapshot,
} from '@/lib/api';
import { notify } from '@/lib/toast';

type Engine = Connection['engine'];

const engines: Array<{ value: Engine; label: string; mark: string; color: string; port: number }> = [
  { value: 'postgres', label: 'PostgreSQL', mark: 'PG', color: '#3f83a8', port: 5432 },
  { value: 'mysql', label: 'MySQL', mark: 'MY', color: '#c28d3a', port: 3306 },
  { value: 'oracle', label: 'Oracle', mark: 'OR', color: '#bf594f', port: 1521 },
  { value: 'db2', label: 'IBM Db2', mark: 'DB', color: '#6588c5', port: 50000 },
];
const engineOf = (value: string) => engines.find((e) => e.value === value) ?? engines[0];

const inputClass = 'h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary';
const labelClass = 'mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground';

function ModalFrame({ eyebrow, title, onClose, testId, children }: { eyebrow: string; title: string; onClose: () => void; testId: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" data-testid={testId}>
      <div className="max-h-[92dvh] w-full max-w-xl overflow-auto border border-border bg-card shadow-2xl animate-rise-in">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{eyebrow}</div>
            <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
          </div>
          <button type="button" onClick={onClose} data-testid="button-close-connection-modal" className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted">
            <X size={17} />
          </button>
        </div>
        <div className="space-y-5 p-6">{children}</div>
      </div>
    </div>
  );
}

const SECURITY_NOTE = 'The password is used to read this schema and is kept in server memory for this session only — it is never written to disk.';

function ConnectionModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateSchemaConnection();
  const [form, setForm] = useState({ name: '', engine: 'postgres' as Engine, host: '', port: '5432', database: '', username: '', password: '' });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const complete = form.name.trim() && form.host.trim() && form.database.trim() && form.username.trim() && form.password;

  const submit = () => {
    if (!complete) return;
    const port = Number(form.port);
    create.mutate(
      {
        data: {
          name: form.name.trim(),
          engine: form.engine,
          host: form.host.trim(),
          port: Number.isInteger(port) && port > 0 ? port : undefined,
          database: form.database.trim(),
          username: form.username.trim(),
          password: form.password,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListSchemaConnectionsQueryKey() });
          notify('Connection profile saved');
          onClose();
        },
      },
    );
  };

  return (
    <ModalFrame eyebrow="new data source" title="Connect a schema" onClose={onClose} testId="modal-connection">
      <div>
        <span className={labelClass}>Database engine</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {engines.map((engine) => (
            <button
              type="button"
              key={engine.value}
              onClick={() => set({ engine: engine.value, port: String(engine.port) })}
              data-testid={`button-engine-${engine.value}`}
              className={`flex items-center gap-2 border px-3 py-2 text-left text-xs transition-colors ${form.engine === engine.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
            >
              <span className="flex h-7 w-7 items-center justify-center font-mono-ui text-[9px] font-semibold text-card" style={{ backgroundColor: engine.color }}>{engine.mark}</span>
              {engine.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className={labelClass}>Profile name</span><input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Production orders" data-testid="input-connection-name" className={inputClass} /></label>
        <label><span className={labelClass}>{form.engine === 'oracle' ? 'Service name' : 'Database'}</span><input value={form.database} onChange={(e) => set({ database: e.target.value })} placeholder="orders" data-testid="input-connection-database" className={inputClass} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
        <label><span className={labelClass}>Host</span><input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="db.internal.example" data-testid="input-connection-host" className={inputClass} /></label>
        <label><span className={labelClass}>Port</span><input value={form.port} onChange={(e) => set({ port: e.target.value })} inputMode="numeric" data-testid="input-connection-port" className={inputClass} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className={labelClass}>Username</span><input value={form.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" data-testid="input-connection-username" className={inputClass} /></label>
        <label><span className={labelClass}>Password</span><input type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" data-testid="input-connection-password" className={inputClass} /></label>
      </div>
      <div className="flex items-start gap-2 border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Lock size={14} className="mt-0.5 shrink-0" style={{ color: engineOf(form.engine).color }} /> {SECURITY_NOTE}
      </div>
      <button type="button" onClick={submit} disabled={create.isPending || !complete} data-testid="button-save-connection" className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {create.isPending ? 'Saving connection…' : 'Save connection'}
      </button>
    </ModalFrame>
  );
}

/** Shown when the server no longer holds a connection's password (e.g. after a restart). */
function CredentialsModal({ connection, busy, onSubmit, onClose }: { connection: Connection; busy: boolean; onSubmit: (creds: { username?: string; password: string }) => void; onClose: () => void }) {
  const [username, setUsername] = useState(connection.username);
  const [password, setPassword] = useState('');
  return (
    <ModalFrame eyebrow="credentials needed" title={connection.name} onClose={onClose} testId="modal-credentials">
      <p className="text-sm text-muted-foreground">The server does not hold the credentials for this connection. Enter them to run discovery.</p>
      {!connection.username && (
        <label className="block"><span className={labelClass}>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="input-credentials-username" className={inputClass} /></label>
      )}
      <label className="block"><span className={labelClass}>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus data-testid="input-credentials-password" className={inputClass} /></label>
      <div className="flex items-start gap-2 border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><Lock size={14} className="mt-0.5 shrink-0" /> {SECURITY_NOTE}</div>
      <button type="button" onClick={() => onSubmit({ username: connection.username ? undefined : username.trim(), password })} disabled={busy || !password || (!connection.username && !username.trim())} data-testid="button-submit-credentials" className="w-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? 'Discovering…' : 'Introspect schema'}
      </button>
    </ModalFrame>
  );
}

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const connectionsQuery = useListSchemaConnections();
  const contexts = useListBoundedContexts().data ?? [];
  const introspect = useIntrospectSchemaConnection();
  const remove = useDeleteSchemaConnection();
  const importSchema = useImportSchema();

  const [modalOpen, setModalOpen] = useState(false);
  const [needsCredentials, setNeedsCredentials] = useState<Connection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, SchemaSnapshot>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importContext, setImportContext] = useState('');

  const connections = connectionsQuery.data ?? [];
  const selected = connections.find((c) => c.id === selectedId) ?? connections[0];
  const snapshot = selected ? snapshots[selected.id] : undefined;
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: getListSchemaConnectionsQueryKey() });

  // Restore the last discovery for this session when switching to a connection (null means "not yet").
  useEffect(() => {
    if (!selected || snapshots[selected.id]) return;
    let cancelled = false;
    getConnectionSnapshot(selected.id)
      .then((result) => !cancelled && result && setSnapshots((all) => ({ ...all, [selected.id]: result })))
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Default to importing everything into the first context whenever a new snapshot arrives.
  useEffect(() => {
    if (snapshot) setPicked(new Set(snapshot.tables.map((t) => `${t.schema}.${t.name}`)));
  }, [snapshot]);
  useEffect(() => {
    if (!importContext && contexts.length) setImportContext(contexts[0].id);
  }, [contexts, importContext]);

  const runIntrospection = (connection: Connection, creds?: { username?: string; password?: string }) => {
    setSelectedId(connection.id);
    introspect.mutate(
      { id: connection.id, data: creds },
      {
        onSuccess: (result) => {
          setSnapshots((all) => ({ ...all, [connection.id]: result }));
          setNeedsCredentials(null);
          notify(`Schema discovery complete — ${result.tables.length} tables`);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'credentials_required') setNeedsCredentials(connection);
        },
        onSettled: () => {
          refreshList();
          void queryClient.invalidateQueries({ queryKey: ['workspace'] });
        },
      },
    );
  };

  const runImport = () => {
    if (!selected || !snapshot || !importContext || picked.size === 0) return;
    importSchema.mutate(
      { id: selected.id, data: { contextId: importContext, tables: [...picked] } },
      {
        onSuccess: (result) => {
          invalidateModel(queryClient);
          notify(`Imported ${result.created} draft element${result.created === 1 ? '' : 's'}${result.reused ? `, ${result.reused} already on the map` : ''}, ${result.relationships} relationship${result.relationships === 1 ? '' : 's'}`);
        },
      },
    );
  };

  const deleteConnection = (connection: Connection) => {
    if (!window.confirm(`Remove the connection "${connection.name}"? Your source database is not touched.`)) return;
    remove.mutate({ id: connection.id }, { onSuccess: () => { refreshList(); notify('Connection removed'); } });
  };

  const togglePicked = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const busyId = introspect.isPending ? introspect.variables?.id : undefined;
  const tableKeys = useMemo(() => (snapshot ? snapshot.tables.map((t) => `${t.schema}.${t.name}`) : []), [snapshot]);

  if (connectionsQuery.isLoading) {
    return <div className="space-y-6 p-5 md:p-8"><div className="h-8 w-64 animate-pulse rounded-sm bg-muted" /><div className="h-32 animate-pulse rounded-sm bg-muted" /><div className="h-32 animate-pulse rounded-sm bg-muted" /></div>;
  }
  if (connectionsQuery.isError) {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center p-6">
        <div className="border border-destructive/30 bg-card p-8 text-center">
          <h2 className="font-display text-2xl font-semibold">Could not load connections</h2>
          <p className="mt-2 text-sm text-muted-foreground">{connectionsQuery.error.message}</p>
          <button type="button" onClick={() => void connectionsQuery.refetch()} data-testid="button-retry-connections" className="mt-5 inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><RefreshCw size={14} /> Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8">
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-accent"><span className="h-1.5 w-1.5 bg-accent" /> reverse engineering</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl" data-testid="text-connections-title">Schema connections</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Bring the physical model into the conversation. Discover tables, keys and foreign keys, then import them as draft elements on the map.</p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} data-testid="button-add-connection" className="inline-flex w-fit items-center gap-2 bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground"><Plus size={15} /> Add connection</button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          {connections.length === 0 ? (
            <div className="border border-dashed border-border bg-card p-12 text-center">
              <Database size={30} className="mx-auto text-primary" />
              <h2 className="mt-4 font-display text-2xl font-semibold">No schemas connected</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Connect a database to turn tables into a map of business concepts.</p>
              <button type="button" onClick={() => setModalOpen(true)} data-testid="button-empty-add-connection" className="mt-5 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect a database</button>
            </div>
          ) : (
            connections.map((connection) => {
              const engine = engineOf(connection.engine);
              const active = connection.id === selected?.id;
              const busy = busyId === connection.id;
              return (
                <div key={connection.id} onClick={() => setSelectedId(connection.id)} className={`cursor-pointer border bg-card p-4 transition-colors ${active ? 'border-primary/70' : 'border-border hover:border-border/80'}`} data-testid={`card-connection-${connection.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center font-mono-ui text-[10px] font-semibold text-card" style={{ backgroundColor: engine.color }}>{engine.mark}</div>
                      <div>
                        <h2 className="font-display text-lg font-semibold">{connection.name}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{connection.username ? `${connection.username}@` : ''}{connection.host}{connection.port ? `:${connection.port}` : ''}</span>
                          <span className="text-border">/</span>
                          <span>{connection.database}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 font-mono-ui text-[10px] uppercase tracking-wider ${connection.status === 'connected' ? 'text-accent' : connection.status === 'error' ? 'text-destructive' : 'text-primary'}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />{connection.status}
                    </div>
                  </div>
                  {connection.status === 'error' && connection.lastError && (
                    <p className="mt-3 break-words border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid={`text-connection-error-${connection.id}`}>{connection.lastError}</p>
                  )}
                  <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-3">
                    <div className="flex gap-6">
                      <div><div className="font-display text-xl font-semibold">{connection.tableCount}</div><div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">tables found</div></div>
                      <div><div className="text-xs font-medium">{connection.lastIntrospectedAt ? new Date(connection.lastIntrospectedAt).toLocaleString() : 'Not yet'}</div><div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">last discovery</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteConnection(connection); }} aria-label={`Remove ${connection.name}`} data-testid={`button-delete-connection-${connection.id}`} className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); runIntrospection(connection); }} disabled={introspect.isPending} data-testid={`button-introspect-${connection.id}`} className="inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary disabled:opacity-60">
                        {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} {busy ? 'Discovering…' : 'Introspect schema'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <aside className="border border-border bg-card">
          {snapshot && selected ? (
            <div className="p-5" data-testid="panel-schema-preview">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-accent">discovery result</div>
                  <h2 className="mt-1 font-display text-xl font-semibold">{selected.name}</h2>
                </div>
                <Check size={16} className="text-accent" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-px border border-border bg-border">
                <div className="bg-background p-3"><div className="font-display text-xl font-semibold">{snapshot.tables.length}</div><div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">tables</div></div>
                <div className="bg-background p-3"><div className="font-display text-xl font-semibold">{snapshot.foreignKeys.length}</div><div className="font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground">foreign keys</div></div>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  <span>tables to import</span>
                  <button type="button" onClick={() => setPicked(picked.size === tableKeys.length ? new Set() : new Set(tableKeys))} className="normal-case tracking-normal underline-offset-2 hover:text-primary hover:underline" data-testid="button-toggle-all-tables">
                    {picked.size === tableKeys.length ? 'Select none' : 'Select all'}
                  </button>
                </div>
                <div className="max-h-[270px] space-y-1 overflow-auto">
                  {snapshot.tables.map((table) => {
                    const key = `${table.schema}.${table.name}`;
                    return (
                      <label key={key} className="flex cursor-pointer items-center justify-between gap-2 border border-border px-3 py-2 text-xs hover:border-primary/50">
                        <span className="flex min-w-0 items-center gap-2">
                          <input type="checkbox" checked={picked.has(key)} onChange={() => togglePicked(key)} data-testid={`checkbox-table-${key}`} />
                          <Table2 size={13} className="shrink-0 text-primary" /><span className="truncate">{key}</span>
                        </span>
                        <span className="shrink-0 font-mono-ui text-[10px] text-muted-foreground">{table.columns.length} cols</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                {contexts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Create a bounded context on the <Link href="/" className="text-primary underline">domain map</Link> first, then import the tables into it.</p>
                ) : (
                  <>
                    <label className="block">
                      <span className={labelClass}>Import into context</span>
                      <select value={importContext} onChange={(e) => setImportContext(e.target.value)} data-testid="select-import-context" className={inputClass}>
                        {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                    <button type="button" onClick={runImport} disabled={importSchema.isPending || picked.size === 0} data-testid="button-import-schema" className="flex w-full items-center justify-center gap-2 bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                      {importSchema.isPending ? 'Importing…' : `Import ${picked.size} table${picked.size === 1 ? '' : 's'} as draft elements`} <ArrowRight size={14} />
                    </button>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">Each table becomes a draft entity marked “needs review”; foreign keys become relationships. Tables already imported are reused.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col justify-between p-5">
              <div>
                <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground">schema discovery</div>
                <h2 className="mt-2 font-display text-2xl font-semibold">Read the shape beneath.</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Select a profile and run introspection to see how tables and foreign keys can inform your domain language.</p>
              </div>
              <div className="space-y-3 border-t border-border pt-5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Table2 size={14} className="text-primary" /> Tables become candidate entities</div>
                <div className="flex items-center gap-2"><KeyRound size={14} className="text-accent" /> Foreign keys become relationships</div>
                <div className="flex items-center gap-2"><Eye size={14} className="text-muted-foreground" /> Read-only: nothing is changed in your source</div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {modalOpen && <ConnectionModal onClose={() => setModalOpen(false)} />}
      {needsCredentials && (
        <CredentialsModal
          connection={needsCredentials}
          busy={introspect.isPending}
          onClose={() => setNeedsCredentials(null)}
          onSubmit={(creds) => runIntrospection(needsCredentials, creds)}
        />
      )}
    </div>
  );
}
