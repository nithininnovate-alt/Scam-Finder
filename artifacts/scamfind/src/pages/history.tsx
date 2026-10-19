import { useTitle } from '@/lib/auth';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useListScans, getListScansQueryKey, useDeleteScan, getGetSummaryQueryKey, getGetScanQueryKey } from '@workspace/api-client-react';
import { Search, Trash2, Download, History as HistoryIcon, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shell';
import { EmptyPanel, ErrorPanel, ScoreBar, StatusPill, VerdictBadge } from '@/components/scan-bits';
import { download, errorMessage, relative, scansToCsv, shortDate } from '@/lib/scan-utils';

const VERDICTS = ['all', 'Likely scam', 'Suspicious', 'Likely genuine', 'Insufficient data'];

export default function HistoryPage() {
  useTitle('History');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useListScans();
  const del = useDeleteScan();
  const [q, setQ] = useState('');
  const [verdict, setVerdict] = useState('all');
  const [sort, setSort] = useState('newest');

  const rows = useMemo(() => {
    const list = (data ?? []).filter((s) => {
      const hay = `${s.title} ${s.sender} ${s.domain} ${s.text.slice(0, 2000)}`.toLowerCase();
      return (verdict === 'all' || s.verdict === verdict) && (!q || hay.includes(q.toLowerCase()));
    });
    return [...list].sort((a, b) =>
      sort === 'risk' ? b.score - a.score : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
    );
  }, [data, q, verdict, sort]);

  function remove(id: string) {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListScansQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          qc.removeQueries({ queryKey: getGetScanQueryKey(id) });
          toast({ title: 'Report deleted' });
        },
        onError: (e) => toast({ title: 'Could not delete', description: errorMessage(e), variant: 'destructive' }),
      },
    );
  }

  return (
    <>
      <PageHeader eyebrow="History · your account" title="Everything you've checked">
        <Button variant="outline" disabled={!rows.length} onClick={() => download('scamfind-history.csv', scansToCsv(rows), 'text/csv')} data-testid="button-export-csv">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </PageHeader>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row rise">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, sender, domain or text" className="pl-9" data-testid="input-search" />
        </div>
        <Select value={verdict} onValueChange={setVerdict}>
          <SelectTrigger className="sm:w-48" data-testid="select-verdict"><SelectValue /></SelectTrigger>
          <SelectContent>{VERDICTS.map((v) => <SelectItem key={v} value={v}>{v === 'all' ? 'All verdicts' : v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="sm:w-40" data-testid="select-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="risk">Highest risk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : isError ? (
        <ErrorPanel title="History didn't load" onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyPanel
          icon={<HistoryIcon className="h-5 w-5" />}
          title="No checks yet"
          body="When you analyse an offer it lands here. It is saved to your account, encrypted at rest, and kept 90 days unless escalated (24 months)."
          action={<Button asChild><Link href="/check" data-testid="link-first-check">Check your first offer <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyPanel icon={<Search className="h-5 w-5" />} title="Nothing matches" body="Try a different word or clear the verdict filter." action={<Button variant="outline" onClick={() => { setQ(''); setVerdict('all'); }} data-testid="button-clear-filters">Clear filters</Button>} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card rise">
          <div className="hidden grid-cols-[1fr_140px_100px_110px_90px_40px] gap-4 border-b px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
            <span>Offer</span><span>Verdict</span><span>Risk</span><span>Case</span><span>Date</span><span />
          </div>
          <div className="divide-y">
            {rows.map((s) => (
              <div key={s.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-secondary/40 md:grid-cols-[1fr_140px_100px_110px_90px_40px]" data-testid={`row-scan-${s.id}`}>
                <Link href={`/scans/${s.id}`} className="min-w-0" data-testid={`link-scan-${s.id}`}>
                  <div className="truncate font-medium group-hover:text-primary">{s.title || 'Untitled offer'}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{s.sender || 'no sender'} · {relative(s.createdAt)}</div>
                </Link>
                <div className="col-start-1 flex flex-wrap items-center gap-3 md:contents">
                  <VerdictBadge verdict={s.verdict} className="w-fit" />
                  <ScoreBar score={s.score} />
                  <span><StatusPill status={s.status} /></span>
                  <span className="text-xs text-muted-foreground">{shortDate(s.createdAt)}</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="row-start-1 col-start-2 rounded-md p-2 text-muted-foreground opacity-60 hover:bg-alert-soft hover:text-alert group-hover:opacity-100 md:row-auto md:col-auto" aria-label="Delete" data-testid={`button-delete-${s.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{s.title || 'Untitled offer'}"?</AlertDialogTitle>
                      <AlertDialogDescription>This permanently removes the report, its evidence and your notes.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => remove(s.id)} data-testid={`button-confirm-delete-${s.id}`}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
          <div className="border-t px-5 py-2.5 text-xs text-muted-foreground">{rows.length} of {data?.length} reports</div>
        </div>
      )}
    </>
  );
}
