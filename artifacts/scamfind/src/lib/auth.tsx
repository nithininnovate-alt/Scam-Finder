import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { Link, Redirect } from 'wouter';
import { ShieldAlert } from 'lucide-react';
import { useGetAccount, getGetAccountQueryKey } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ErrorPanel } from '@/components/scan-bits';

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ScamFind`;
  }, [title]);
}

/** Server-owned account. Only fetched once Clerk reports a signed-in session. */
export function useAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  const enabled = isLoaded && !!isSignedIn;
  const q = useGetAccount({ query: { enabled, queryKey: getGetAccountQueryKey(), staleTime: 60_000 } });
  return { ...q, enabled, authLoaded: isLoaded, signedIn: !!isSignedIn };
}

export function PageSkeleton() {
  return (
    <div className="space-y-5" data-testid="skeleton-page">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageSkeleton />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: account, isLoading, isError, refetch, authLoaded, signedIn } = useAccount();
  if (!authLoaded) return <PageSkeleton />;
  if (!signedIn) return <Redirect to="/sign-in" />;
  if (isLoading) return <PageSkeleton />;
  if (isError || !account) return <ErrorPanel title="We couldn't confirm your account" onRetry={() => refetch()} />;
  if (account.role !== 'admin') return <Forbidden />;
  return <>{children}</>;
}

export function Forbidden() {
  useTitle('Not permitted');
  return (
    <div className="mx-auto max-w-xl pt-6 rise" data-testid="panel-forbidden">
      <div className="relative overflow-hidden rounded-3xl border bg-card p-8">
        <div className="ledger pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-alert">403 · Review desk</div>
          <ShieldAlert className="mb-3 h-8 w-8 text-alert" />
          <h1 className="text-3xl font-semibold">This area is for authorised reviewers.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your account is a personal account, so the system-wide review desk is closed to you. Reviewer access is granted on the server, not from this screen. Your own checks and cases are still right where you left them.
          </p>
          <Button asChild className="mt-6"><Link href="/dashboard" data-testid="link-forbidden-dashboard">Go to my dashboard</Link></Button>
        </div>
      </div>
    </div>
  );
}
