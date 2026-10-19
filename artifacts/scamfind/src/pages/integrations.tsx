import { useListProviders, getListProvidersQueryKey } from '@workspace/api-client-react';
import { Plug } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell';
import { EmptyPanel, ErrorPanel } from '@/components/scan-bits';
import { AdminIntegrationPanel, NotificationPrefsPanel, StatusChip } from '@/components/integration-panels';
import { useAccount } from '@/lib/auth';
import { cn } from '@/lib/utils';

export default function Integrations() {
  const { data, isLoading, isError, refetch } = useListProviders({ query: { queryKey: getListProvidersQueryKey(), staleTime: 60_000 } });
  const { data: account, signedIn } = useAccount();
  const on = (data ?? []).filter((p) => p.status === 'active' || p.status === 'configured');
  const off = (data ?? []).filter((p) => p.status !== 'active' && p.status !== 'configured');

  return (
    <>
      <PageHeader eyebrow="What's connected" title="Honest about what runs today" />
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-muted-foreground rise">
        Every check starts with ScamFind's built-in rules. Link reputation lookups with Google Web Risk run only when you tick the box on a check. Capabilities marked "not connected" or "error" are not used in any result, and show as unavailable in reports with reduced confidence.
      </p>
      {signedIn && account && (
        <div className="mb-12 space-y-6">
          <NotificationPrefsPanel />
          {account.role === 'admin' && <AdminIntegrationPanel />}
        </div>
      )}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : isError ? (
        <ErrorPanel title="Couldn't load capabilities" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyPanel icon={<Plug className="h-5 w-5" />} title="No capabilities listed" body="Nothing is reported as connected right now." />
      ) : (
        <div className="space-y-10">
          {[{ t: 'Available', list: on }, { t: 'Not running', list: off }].map((g) =>
            g.list.length ? (
              <section key={g.t}>
                <h2 className="mb-3 text-xl font-semibold">{g.t} <span className="font-mono text-sm text-muted-foreground">{g.list.length}</span></h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.list.map((p, i) => (
                    <div key={p.name} className={cn('rounded-2xl border p-5 rise', p.status === 'active' || p.status === 'configured' ? 'bg-card' : 'border-dashed bg-transparent')} style={{ animationDelay: `${i * 50}ms` }} data-testid={`card-provider-${i}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{p.capability}</span>
                        <StatusChip status={p.status} testId={`status-provider-${i}`} />
                      </div>
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}
    </>
  );
}
