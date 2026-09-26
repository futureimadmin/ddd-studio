import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { useListBoundedContexts } from '@workspace/api-client-react';

type GlossaryTerm = {
  id: string;
  term: string;
  definition: string;
  contextId: string | null;
  aliases: string[];
  relatedNodeIds: string[];
};

async function fetchGlossary(): Promise<GlossaryTerm[]> {
  const res = await fetch('/api/glossary');
  if (!res.ok) throw new Error('Failed to load glossary');
  return res.json();
}

export default function GlossaryPage() {
  const contextsQuery = useListBoundedContexts();
  const contexts = contextsQuery.data ?? [];
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    term: '',
    definition: '',
    contextId: '',
    aliases: '',
  });
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTerms(await fetchGlossary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () =>
      terms.filter((t) => {
        if (filter !== 'all' && t.contextId !== filter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q) ||
          t.aliases.some((a) => a.toLowerCase().includes(q))
        );
      }),
    [terms, filter, search],
  );

  const save = async () => {
    if (!form.term.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: form.term.trim(),
          definition: form.definition.trim(),
          contextId: form.contextId || null,
          aliases: form.aliases
            .split(/[,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          relatedNodeIds: [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Save failed');
      }
      setForm({ term: '', definition: '', contextId: '', aliases: '' });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this term?')) return;
    await fetch(`/api/glossary/${id}`, { method: 'DELETE' });
    await reload();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="page-glossary">
      <div className="border-b border-border px-6 py-5 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
              <BookOpen size={14} /> ubiquitous language
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Glossary</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Shared vocabulary per bounded context. Terms anchor names on the map to agreed meaning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search terms…"
              data-testid="input-glossary-search"
              className="h-9 w-44 border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="select-glossary-context"
              className="h-9 border border-input bg-background px-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All contexts</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-6 overflow-auto p-6 md:grid-cols-[320px_1fr] md:px-8">
        <div className="border border-border bg-card p-4">
          <div className="mb-3 font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Add term</div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Term</span>
              <input
                value={form.term}
                onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
                data-testid="input-glossary-term"
                className="h-9 w-full border border-input bg-background px-3 text-sm"
                placeholder="e.g. Reserve"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Definition</span>
              <textarea
                value={form.definition}
                onChange={(e) => setForm((f) => ({ ...f, definition: e.target.value }))}
                data-testid="input-glossary-definition"
                className="min-h-[100px] w-full resize-none border border-input bg-background px-3 py-2 text-sm"
                placeholder="Agreed meaning in this context…"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Context</span>
              <select
                value={form.contextId}
                onChange={(e) => setForm((f) => ({ ...f, contextId: e.target.value }))}
                data-testid="select-glossary-form-context"
                className="h-9 w-full border border-input bg-background px-2 text-sm"
              >
                <option value="">Workspace-wide</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Aliases</span>
              <input
                value={form.aliases}
                onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                data-testid="input-glossary-aliases"
                className="h-9 w-full border border-input bg-background px-3 text-sm"
                placeholder="comma-separated"
              />
            </label>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !form.term.trim()}
              data-testid="button-glossary-save"
              className="flex w-full items-center justify-center gap-2 bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus size={14} /> {saving ? 'Saving…' : 'Add to glossary'}
            </button>
          </div>
        </div>

        <div>
          {error && (
            <div className="mb-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-glossary-error">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading glossary…</div>
          ) : visible.length === 0 ? (
            <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No terms yet. Capture the language of each bounded context.
            </div>
          ) : (
            <ul className="space-y-3" data-testid="list-glossary-terms">
              {visible.map((term) => {
                const ctx = contexts.find((c) => c.id === term.contextId);
                return (
                  <li
                    key={term.id}
                    className="border border-border bg-card p-4"
                    data-testid={`glossary-term-${term.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-display text-lg font-semibold">{term.term}</div>
                        <div className="mt-0.5 font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground">
                          {ctx?.name ?? 'Workspace-wide'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(term.id)}
                        data-testid={`button-delete-term-${term.id}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{term.definition}</p>
                    {term.aliases.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {term.aliases.map((a) => (
                          <span key={a} className="border border-border px-2 py-0.5 font-mono-ui text-[10px] text-muted-foreground">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
