import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { StudioShell } from '@/components/studio-shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import ConnectionsPage from '@/pages/connections';
import NotFound from '@/pages/not-found';
import SettingsPage from '@/pages/settings';
import GlossaryPage from '@/pages/glossary';
import WorkspacePage from '@/pages/workspace';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <StudioShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={WorkspacePage} />
          <Route path="/connections" component={ConnectionsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/glossary" component={GlossaryPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </StudioShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
