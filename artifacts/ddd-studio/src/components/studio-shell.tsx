import { Link, useLocation } from 'wouter';
import { Activity, BookOpen, Boxes, ChevronRight, Database, GitBranch, Settings2, Sparkles } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Domain map', icon: GitBranch, key: 'map' },
  { href: '/glossary', label: 'Glossary', icon: BookOpen, key: 'glossary' },
  { href: '/connections', label: 'Schema connections', icon: Database, key: 'connections' },
  { href: '/settings', label: 'Workspace settings', icon: Settings2, key: 'settings' },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="noise-layer flex min-h-[100dvh] bg-background text-foreground">
      <aside className="hidden w-[250px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-6">
          <div className="relative flex h-9 w-9 items-center justify-center border border-sidebar-primary/60 bg-sidebar-primary/10 text-sidebar-primary">
            <Boxes size={20} strokeWidth={1.8} />
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-sidebar-primary" />
          </div>
          <div>
            <div className="font-display text-[17px] font-semibold tracking-tight">DDD Studio</div>
            <div className="font-mono-ui text-[9px] uppercase tracking-[.22em] text-sidebar-foreground/50">modeling workbench</div>
          </div>
        </div>
        <div className="px-4 py-6">
          <div className="mb-3 px-3 font-mono-ui text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/40">Workspace</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  href={item.href}
                  key={item.key}
                  data-testid={`link-nav-${item.key}`}
                  className={`group flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${active ? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground' : 'border-transparent text-sidebar-foreground/60 hover:border-sidebar-foreground/30 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}
                >
                  <Icon size={16} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  {active && <ChevronRight size={14} className="ml-auto text-sidebar-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="border border-sidebar-border bg-sidebar-accent/60 p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-sidebar-foreground">
              <Activity size={13} className="text-sidebar-primary" />
              API connected
            </div>
            <div className="mt-2 font-mono-ui text-[10px] leading-relaxed text-sidebar-foreground/45">Changes are persisted as you model. Your map is the source of truth.</div>
          </div>
          <div className="mt-4 flex items-center gap-2 px-2 text-[11px] text-sidebar-foreground/45">
            <Sparkles size={13} />
            <span>Studio build 0.4</span>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] items-center justify-between border-b border-border bg-card/70 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center border border-primary/60 bg-primary/10 text-primary"><Boxes size={17} /></div>
            <span className="hidden font-display text-lg font-semibold sm:inline">DDD Studio</span>
            <nav className="ml-1 flex items-center gap-1 border-l border-border pl-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
                return <Link href={item.href} key={`mobile-${item.key}`} data-testid={`link-mobile-nav-${item.key}`} aria-label={item.label} className={`flex h-8 w-8 items-center justify-center ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Icon size={15} /></Link>;
              })}
            </nav>
          </div>
          <div className="hidden items-center gap-2 font-mono-ui text-[11px] text-muted-foreground md:flex">
            <span className="text-foreground/50">workspace</span><ChevronRight size={13} /><span className="text-foreground">order-platform</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 border border-border bg-background/70 px-3 py-1.5 font-mono-ui text-[10px] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-line" /> synced just now
            </div>
            <div className="flex h-8 w-8 items-center justify-center bg-secondary font-display text-xs font-semibold text-secondary-foreground" data-testid="avatar-workspace">AM</div>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
