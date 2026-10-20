import { useEffect, useRef, type ReactNode, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/shell';
import { PageSkeleton, RequireAdmin, RequireAuth, useAccount, useTitle } from '@/lib/auth';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import CheckPage from '@/pages/check';
import ScanPage from '@/pages/scan';
import HistoryPage from '@/pages/history';
import CasesPage from '@/pages/cases';
import Resources from '@/pages/resources';
import Integrations from '@/pages/integrations';
import Dashboard from '@/pages/dashboard';
import AdminPage from '@/pages/admin';
import AdminScanPage from '@/pages/admin-scan';
import { AuthFrame } from '@/pages/auth';
import { ErrorPanel } from '@/components/scan-bits';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true } },
});

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(192 50% 24%)',
    colorForeground: 'hsl(205 32% 15%)',
    colorMutedForeground: 'hsl(205 12% 38%)',
    colorDanger: 'hsl(8 62% 46%)',
    colorBackground: 'hsl(42 45% 98%)',
    colorInput: 'hsl(40 38% 96%)',
    colorInputForeground: 'hsl(205 32% 15%)',
    colorNeutral: 'hsl(205 20% 30%)',
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(42_45%_98%)] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[hsl(36_22%_84%)] shadow-[0_24px_60px_-30px_hsl(194_45%_17%/0.45)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: "!font-['Fraunces'] !text-2xl !font-semibold text-[hsl(205_32%_15%)]",
    headerSubtitle: 'text-[hsl(205_12%_38%)]',
    socialButtonsBlockButtonText: 'text-[hsl(205_32%_15%)] font-medium',
    formFieldLabel: 'text-[hsl(205_32%_18%)] font-medium',
    footerActionLink: 'text-[hsl(192_50%_24%)] font-semibold hover:text-[hsl(192_50%_18%)]',
    footerActionText: 'text-[hsl(205_12%_38%)]',
    dividerText: 'text-[hsl(205_12%_40%)]',
    identityPreviewEditButton: 'text-[hsl(192_50%_24%)]',
    formFieldSuccessText: 'text-[hsl(152_32%_30%)]',
    alertText: 'text-[hsl(8_62%_40%)]',
    logoBox: 'h-12 justify-center',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'border border-[hsl(36_22%_80%)] bg-[hsl(40_38%_96%)] hover:bg-[hsl(38_40%_89%)]',
    formButtonPrimary: 'bg-[hsl(192_50%_24%)] text-[hsl(40_45%_96%)] hover:bg-[hsl(192_50%_20%)] shadow-none',
    formFieldInput: 'border border-[hsl(36_20%_80%)] bg-[hsl(40_38%_96%)] text-[hsl(205_32%_15%)]',
    footerAction: 'bg-[hsl(38_40%_92%)] py-3',
    dividerLine: 'bg-[hsl(36_22%_82%)]',
    alert: 'border border-[hsl(8_62%_46%/0.3)] bg-[hsl(8_62%_46%/0.08)]',
    otpCodeFieldInput: 'border border-[hsl(36_20%_75%)] text-[hsl(205_32%_15%)]',
    formFieldRow: 'gap-3',
    main: 'gap-5',
  },
};

function SignInPage() {
  useTitle('Sign in');
  return (
    <AuthFrame mode="sign-in">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthFrame>
  );
}

function SignUpPage() {
  useTitle('Create your account');
  return (
    <AuthFrame mode="sign-up">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthFrame>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        void qc.cancelQueries();
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: account, isError, refetch } = useAccount();
  if (!isLoaded) return <PageSkeleton />;
  if (!isSignedIn) return <Landing />;
  if (isError) return <Shell><ErrorPanel title="We couldn't load your account" onRetry={() => refetch()} /></Shell>;
  if (!account) return <Shell><PageSkeleton /></Shell>;
  return <Redirect to={account.role === 'admin' ? '/admin' : '/dashboard'} />;
}

function guard(C: ComponentType, admin = false) {
  return function Guarded() {
    return admin ? <RequireAdmin><C /></RequireAdmin> : <RequireAuth><C /></RequireAuth>;
  };
}

const GDashboard = guard(Dashboard);
const GCheck = guard(CheckPage);
const GHistory = guard(HistoryPage);
const GCases = guard(CasesPage);
const GScan = guard(ScanPage);
const GAdmin = guard(AdminPage, true);
const GAdminScan = guard(AdminScanPage, true);
const GIntegrations = guard(TitledIntegrations, true);

function TitledResources() { useTitle('Verify & report'); return <Resources />; }
function TitledIntegrations() { useTitle('Integrations'); return <Integrations />; }

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route>
        <Shell>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/dashboard" component={GDashboard} />
              <Route path="/check" component={GCheck} />
              <Route path="/scans/:id" component={GScan} />
              <Route path="/history" component={GHistory} />
              <Route path="/cases" component={GCases} />
              <Route path="/admin" component={GAdmin} />
              <Route path="/admin/scans/:id" component={GAdminScan} />
              <Route path="/resources" component={TitledResources} />
              <Route path="/integrations" component={GIntegrations} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </Shell>
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your checks, cases and evidence' } },
        signUp: { start: { title: 'Create your ScamFind account', subtitle: 'Keep every offer check and case in one place, on any device' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
