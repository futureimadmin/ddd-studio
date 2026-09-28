import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Save, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { invalidateModel, useGetWorkspace, useResetWorkspace, useUpdateWorkspace } from '@/lib/api';
import { setPreferences, usePreferences } from '@/lib/preferences';
import { notify } from '@/lib/toast';

const sectionClass = 'border border-border bg-card p-5 md:p-6';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const workspace = useGetWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const resetWorkspace = useResetWorkspace();
  const { showGrid } = usePreferences();

  const saved = workspace.data?.projectName ?? '';
  const [projectName, setProjectName] = useState('');
  useEffect(() => setProjectName(saved), [saved]);
  const dirty = projectName.trim() !== saved && projectName.trim().length > 0;

  const saveName = () =>
    updateWorkspace.mutate(
      { data: { projectName: projectName.trim() } },
      { onSuccess: () => { invalidateModel(queryClient); notify('Project name saved'); } },
    );

  const reset = (seedSample: boolean) => {
    const what = seedSample ? 'replace everything with the sample Commerce Platform workspace' : 'delete every context, element, relationship and glossary term';
    if (!window.confirm(`This will ${what}. This cannot be undone. Continue?`)) return;
    resetWorkspace.mutate(
      { data: { seedSample } },
      { onSuccess: () => { invalidateModel(queryClient); notify(seedSample ? 'Sample workspace loaded' : 'Workspace cleared'); } },
    );
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-primary"><span className="h-1.5 w-1.5 bg-primary" /> studio preferences</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl" data-testid="text-settings-title">Workspace settings</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">The project name is saved with the workspace on the server. Canvas options are remembered by this browser.</p>
      </div>

      <div className="max-w-3xl space-y-5">
        <section className={sectionClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center bg-primary/10 text-primary"><SlidersHorizontal size={17} /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Workspace identity</h2>
              <p className="mt-1 text-xs text-muted-foreground">Shown in the header and used to name exports and generated packages.</p>
            </div>
          </div>
          <div className="mt-6 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1.5 block font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Project name</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && dirty && saveName()} disabled={workspace.isPending} data-testid="input-settings-project-name" className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
            </label>
            <button type="button" onClick={saveName} disabled={!dirty || updateWorkspace.isPending} data-testid="button-save-settings" className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Save size={15} /> {updateWorkspace.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center bg-secondary text-secondary-foreground"><Eye size={17} /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Canvas</h2>
              <p className="mt-1 text-xs text-muted-foreground">Stored in this browser only.</p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-5 py-2">
            <div>
              <div className="text-sm font-medium">Show canvas grid</div>
              <div className="mt-1 text-xs text-muted-foreground">Keep spatial rhythm visible while modeling</div>
            </div>
            <button type="button" onClick={() => setPreferences({ showGrid: !showGrid })} aria-pressed={showGrid} aria-label="Show canvas grid" data-testid="toggle-settings-grid" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showGrid ? 'bg-accent' : 'bg-muted'}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${showGrid ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </section>

        <section className="border border-destructive/30 bg-card p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center bg-destructive/10 text-destructive"><TriangleAlert size={17} /></div>
            <div>
              <h2 className="font-display text-xl font-semibold">Start over</h2>
              <p className="mt-1 text-xs text-muted-foreground">Replaces the whole workspace. Export the model first if you want to keep it.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => reset(false)} disabled={resetWorkspace.isPending} data-testid="button-reset-empty" className="border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">Clear workspace</button>
            <button type="button" onClick={() => reset(true)} disabled={resetWorkspace.isPending} data-testid="button-reset-sample" className="border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50">Load sample workspace</button>
          </div>
        </section>
      </div>
    </div>
  );
}
