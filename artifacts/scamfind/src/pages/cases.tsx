import { useTitle } from '@/lib/auth';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useListScans, getListScansQueryKey, useUpdateScan, getGetScanQueryKey, getGetSummaryQueryKey, type Scan } from '@workspace/api-client-react';
import { FolderKanban, Clock, ChevronRight, StickyNote, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shell';
import { EmptyPanel, ErrorPanel, VerdictBadge } from '@/components/scan-bits';
import { errorMessage, shortDate, statusLabel, utc } from '@/lib/scan-utils';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { key: 'new', hint: 'Just checked' },
  { key: 'triaged', hint: 'Verifying independently' },
  { key: 'escalated', hint: 'Reported or kept as evidence' },
  { key: 'closed', hint: 'Resolved' },
] as const;

function CaseCard({ scan }: { scan: Scan }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateScan();
  const overdue = scan.dueAt && scan.status !== 'closed' && new Date(scan.dueAt).getTime() < Date.now();
  const last = scan.timeline[scan.timeline.length - 1];

  function move(status: Scan['status']) {
    update.mutate(
      { id: scan.id, data: { status } },
      {
        onSuccess: (s) => {
          qc.setQueryData(getGetScanQueryKey(scan.id), s);
          qc.invalidateQueries({ queryKey: getListScansQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          toast({ title: `Moved to ${statusLabel[status]}` });
        },
        onError: (e) => toast({ title: 'Could not update', description: errorMessage(e), variant: 'destructive' }),
      },
    );
  }

  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', update.isPending && 'opacity-60')} data-testid={`card-case-${scan.id}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <Link href={`/scans/${scan.id}`} className="min-w-0 font-medium leading-snug hover:text-primary" data-testid={`link-case-${scan.id}`}>
          {scan.title || 'Untitled offer'}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{scan.score}</span>
      </div>
      <VerdictBadge verdict={scan.verdict} />
      {scan.notes && (
        <p className="mt-3 line-clamp-2 flex gap-1.5 text-xs text-muted-foreground"><StickyNote className="mt-0.5 h-3 w-3 shrink-0" />{scan.notes}</p>
      )}
      {last && <p className="mt-2 truncate text-[11px] text-muted-foreground" title={utc(last.at)}>{last.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className={cn('inline-flex items-center gap-1 text-[11px]', overdue ? 'text-alert' : 'text-muted-foreground')}>
          <Clock className="h-3 w-3" /> {scan.dueAt ? `${overdue ? 'Overdue' : 'Due'} ${shortDate(scan.dueAt)}` : 'No due date'}
        </span>
        <Select value={scan.status} onValueChange={(v) => move(v as Scan['status'])}>
          <SelectTrigger className="h-7 w-[110px] text-xs" data-testid={`select-case-status-${scan.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>{COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{statusLabel[c.key]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function CasesPage() {
  useTitle('Cases');
  const { data, isLoading, isError, refetch } = useListScans();
  const [mobileCol, setMobileCol] = useState<string>('new');
  const grouped = useMemo(() => {
    const g: Record<string, Scan[]> = { new: [], triaged: [], escalated: [], closed: [] };
    (data ?? []).forEach((s) => (g[s.status] ?? g.new).push(s));
    Object.values(g).forEach((l) => l.sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '')));
    return g;
  }, [data]);

  return (
    <>
      <PageHeader eyebrow="Cases · your account" title="Track what you're following up" />
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-muted-foreground rise">
        A personal board for the offers you've checked. It isn't a shared workspace — nobody else sees it. Escalated cases are retained beyond the standard 90 days.
      </p>
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">{COLUMNS.map((c) => <Skeleton key={c.key} className="h-72 rounded-2xl" />)}</div>
      ) : isError ? (
        <ErrorPanel title="Cases didn't load" onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyPanel
          icon={<FolderKanban className="h-5 w-5" />}
          title="No cases yet"
          body="Every offer you check becomes a case here, so you can note who you contacted and when to follow up."
          action={<Button asChild><Link href="/check" data-testid="link-start-case">Check an offer <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex gap-1 overflow-x-auto md:hidden">
            {COLUMNS.map((c) => (
              <button key={c.key} onClick={() => setMobileCol(c.key)} className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-xs', mobileCol === c.key ? 'bg-primary text-primary-foreground' : 'bg-secondary')} data-testid={`button-col-${c.key}`}>
                {statusLabel[c.key]} · {grouped[c.key].length}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {COLUMNS.map((c, i) => (
              <div key={c.key} className={cn('rounded-2xl bg-secondary/50 p-3 rise', mobileCol !== c.key && 'hidden md:block')} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold">{statusLabel[c.key]}<ChevronRight className="h-3 w-3 text-muted-foreground" /></div>
                    <div className="text-[11px] text-muted-foreground">{c.hint}</div>
                  </div>
                  <span className="rounded-md bg-card px-2 py-0.5 font-mono text-xs">{grouped[c.key].length}</span>
                </div>
                <div className="space-y-3">
                  {grouped[c.key].length === 0 ? (
                    <div className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Nothing here</div>
                  ) : (
                    grouped[c.key].map((s) => <CaseCard key={s.id} scan={s} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
