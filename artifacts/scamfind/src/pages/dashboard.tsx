import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSummary, getGetSummaryQueryKey, useGetBrowserScanCount, getGetBrowserScanCountQueryKey,
  useImportBrowserScans, getListScansQueryKey,
} from '@workspace/api-client-react';
import { ArrowRight, ScanSearch, Inbox, Download, Loader2, Lock, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shell';
import { EmptyPanel, ErrorPanel, StatusPill, VerdictBadge, ScoreBar } from '@/components/scan-bits';
import { useAccount, useTitle } from '@/lib/auth';
import { errorMessage, relative } from '@/lib/scan-utils';
import { NotificationPrefsPanel } from '@/components/integration-panels';

function ImportNotice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useGetBrowserScanCount({ query: { queryKey: getGetBrowserScanCountQueryKey(), staleTime: 60_000 } });
  const imp = useImportBrowserScans();
  if (!data || data.count === 0) return null;
  function run() {
    imp.mutate(undefined, {
      onSuccess: (r) => {
        qc.setQueryData(getGetBrowserScanCountQueryKey(), { count: 0 });
        qc.invalidateQueries({ queryKey: getGetBrowserScanCountQueryKey() });
        qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        qc.invalidateQueries({ queryKey: getListScansQueryKey() });
        toast({ title: `Imported ${r.count} check${r.count === 1 ? '' : 's'}`, description: 'They are now part of your account history.' });
      },
      onError: (e) => toast({ title: 'Import failed', description: errorMessage(e), variant: 'destructive' }),
    });
  }
  return (
    <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-accent/50 bg-accent/10 p-5 rise sm:flex-row sm:items-center" data-testid="panel-import">
      <Inbox className="h-6 w-6 shrink-0 text-caution" />
      <div className="flex-1">
        <div className="font-medium"><span data-testid="text-import-count">{data.count}</span> earlier check{data.count === 1 ? '' : 's'} found from before you had an account</div>
        <p className="text-sm text-muted-foreground">They were made on this device without signing in. Nothing is moved unless you choose to import them into your account.</p>
      </div>
      <Button onClick={run} disabled={imp.isPending} data-testid="button-import">
        {imp.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Import into my account
      </Button>
    </div>
  );
}

export default function Dashboard() {
  useTitle('My dashboard');
  const { data: account } = useAccount();
  const { data, isLoading, isError, refetch } = useGetSummary({ query: { queryKey: getGetSummaryQueryKey(), staleTime: 30_000 } });
  const first = account?.name?.split(' ')[0];

  return (
    <>
      <PageHeader eyebrow="Personal dashboard" title={<>{first ? <>Hello, {first}.</> : 'Hello.'} <span className="italic text-primary">Here's where things stand.</span></>}>
        <Button asChild size="lg"><Link href="/check" data-testid="link-dashboard-check"><ScanSearch className="mr-2 h-4 w-4" /> Check an offer</Link></Button>
      </PageHeader>
      <ImportNotice />
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
      ) : isError || !data ? (
        <ErrorPanel title="Your overview didn't load" onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4 rise">
              {[
                { k: 'Offers checked', v: data.total },
                { k: 'Flagged', v: data.flagged },
                { k: 'Few flags', v: data.genuine },
                { k: 'Open cases', v: data.openCases },
              ].map((s) => (
                <div key={s.k} className="bg-card p-5">
                  <div className="font-display text-4xl font-semibold" data-testid={`stat-${s.k.toLowerCase().replace(/ /g, '-')}`}>{s.v}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border bg-card rise" style={{ animationDelay: '80ms' }}>
              <div className="flex items-center justify-between border-b px-5 py-3.5">
                <span className="font-medium">Recent activity</span>
                <Link href="/history" className="text-xs text-primary hover:underline" data-testid="link-dashboard-history">All history</Link>
              </div>
              {data.recent.length === 0 ? (
                <div className="p-5">
                  <EmptyPanel icon={<ScanSearch className="h-5 w-5" />} title="No checks on your account yet" body="Paste an offer you're unsure about. The read, its evidence and your notes will be saved here." action={<Button asChild><Link href="/check" data-testid="link-dashboard-empty-check">Check your first offer <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>} />
                </div>
              ) : (
                <div className="divide-y">
                  {data.recent.slice(0, 8).map((s) => (
                    <Link key={s.id} href={`/scans/${s.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/50" data-testid={`link-recent-${s.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.title || 'Untitled offer'}</div>
                        <div className="truncate text-xs text-muted-foreground">{s.sender || 'No sender'} · {relative(s.createdAt)}</div>
                      </div>
                      <div className="hidden sm:block"><ScoreBar score={s.score} /></div>
                      <StatusPill status={s.status} />
                      <VerdictBadge verdict={s.verdict} />
                    </Link>
                  ))}
                </div>
              )}
              {data.total > 0 && <div className="border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground">avg analysis {Math.round(data.averageDurationMs)} ms</div>}
            </div>
          </div>
          <aside className="space-y-4 rise" style={{ animationDelay: '140ms' }}>
            <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
              <Lock className="mb-2 h-5 w-5 text-accent" />
              <p className="font-display text-lg leading-snug">Saved to your account, on any device.</p>
              <p className="mt-2 text-sm text-primary-foreground/75">Content is encrypted at rest. Authorised ScamFind reviewers may open your cases to help with follow-up.</p>
            </div>
            <div className="rounded-2xl border bg-card p-5 text-sm">
              <Clock className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">Retention</div>
              <p className="mt-1 text-muted-foreground">Routine checks: 90 days. Escalated cases: up to 24 months.</p>
              <Link href="/cases" className="mt-3 inline-flex items-center gap-1 text-primary hover:underline" data-testid="link-dashboard-cases">Manage cases <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="rounded-2xl border bg-card p-5 text-sm">
              <ShieldCheck className="mb-2 h-5 w-5 text-safe" />
              <p className="text-muted-foreground">A real employer will never ask you to pay to get hired.</p>
              <Link href="/resources" className="mt-3 inline-flex items-center gap-1 text-primary hover:underline" data-testid="link-dashboard-resources">How to verify <ArrowRight className="h-3.5 w-3.5" /></Link>
              <a href="#email-alerts" className="mt-2 flex items-center gap-1 text-primary hover:underline" data-testid="link-dashboard-notifications">Case update emails <ArrowRight className="h-3.5 w-3.5" /></a>
            </div>
          </aside>
        </div>
      )}
      <div id="email-alerts" className="mt-8 scroll-mt-6"><NotificationPrefsPanel /></div>
    </>
  );
}
