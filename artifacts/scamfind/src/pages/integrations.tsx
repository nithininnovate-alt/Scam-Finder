import { useListProviders } from '@workspace/api-client-react';
import { Plug, CircleDot, CircleDashed } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell';
import { EmptyPanel, ErrorPanel } from '@/components/scan-bits';
import { cn } from '@/lib/utils';

export default function Integrations() {
  const { data, isLoading, isError, refetch } = useListProviders();
  const active = (data ?? []).filter((p) => p.status === 'active');
  const off = (data ?? []).filter((p) => p.status !== 'active');

  return (
    <>
      <PageHeader eyebrow="What's connected" title="Honest about what runs today" />
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-muted-foreground rise">
        ScamFind currently relies on built-in rules. Capabilities marked "not connected" are not used in any result, and their checks show as unavailable in your reports with reduced confidence.
      </p>
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : isError ? (
        <ErrorPanel title="Couldn't load capabilities" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyPanel icon={<Plug className="h-5 w-5" />} title="No capabilities listed" body="Nothing is reported as connected right now." />
      ) : (
        <div className="space-y-10">
          {[{ t: 'Active', list: active }, { t: 'Not connected', list: off }].map((g) =>
            g.list.length ? (
              <section key={g.t}>
                <h2 className="mb-3 text-xl font-semibold">{g.t} <span className="font-mono text-sm text-muted-foreground">{g.list.length}</span></h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.list.map((p, i) => (
                    <div key={p.name} className={cn('rounded-2xl border p-5 rise', p.status === 'active' ? 'bg-card' : 'border-dashed bg-transparent')} style={{ animationDelay: `${i * 50}ms` }} data-testid={`card-provider-${i}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{p.capability}</span>
                        <span className={cn('inline-flex items-center gap-1 text-xs', p.status === 'active' ? 'text-safe' : 'text-unknown')}>
                          {p.status === 'active' ? <CircleDot className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                          {p.status === 'active' ? 'Active' : 'Not connected'}
                        </span>
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
