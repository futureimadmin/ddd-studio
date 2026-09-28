import { type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { StudioShell } from '@/components/studio-shell';
import { ApiError } from '@/lib/api';
import { Toaster, notifyError } from '@/lib/toast';
import ConnectionsPage from '@/pages/connections';
import GlossaryPage from '@/pages/glossary';
import NotFound from '@/pages/not-found';
import SettingsPage from '@/pages/settings';
import WorkspacePage from '@/pages/workspace';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  mutationCache: new MutationCache({
    // Every failed mutation is reported once, here — unless a page opts a specific error code out
    // because it handles it itself (e.g. asking for a password).
    onError: (error, _variables, _context, mutation) => {
      const silent = (mutation.meta?.silentCodes as string[] | undefined) ?? [];
      if (error instanceof ApiError && error.code && silent.includes(error.code)) return;
      notifyError(error);
    },
  }),
});

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <StudioShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={WorkspacePage} />
          <Route path="/glossary" component={GlossaryPage} />
          <Route path="/connections" component={ConnectionsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </StudioShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
