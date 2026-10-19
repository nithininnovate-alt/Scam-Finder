import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminScan, getGetAdminScanQueryKey, useUpdateAdminScan, getListAdminScansQueryKey, getGetAdminSummaryQueryKey,
  useListAdminScans, type Scan,
} from '@workspace/api-client-react';
import { ArrowLeft, FileDown, Loader2, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ErrorPanel } from '@/components/scan-bits';
import { ReportBody } from '@/pages/scan';
import { useTitle } from '@/lib/auth';
import { errorMessage, shortDate, statusLabel } from '@/lib/scan-utils';

function AdminCaseEditor({ scan }: { scan: Scan }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateAdminScan();
  const [notes, setNotes] = useState(scan.notes ?? '');
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (initFor.current !== scan.id) { initFor.current = scan.id; setNotes(scan.notes ?? ''); }
  }, [scan.id, scan.notes]);

  function patch(data: { status?: Scan['status']; notes?: string }, msg: string) {
    update.mutate({ id: scan.id, data }, {
      onSuccess: (s) => {
        qc.setQueryData(getGetAdminScanQueryKey(scan.id), s);
        qc.invalidateQueries({ queryKey: getListAdminScansQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
        toast({ title: msg });
      },
      onError: (e) => toast({ title: 'Could not save', description: errorMessage(e), variant: 'destructive' }),
    });
  }
  const dirty = notes !== (scan.notes ?? '');
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-muted-foreground">You are editing as a reviewer. The owner sees these changes, and they are recorded under your account in the audit trail.</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Status</span>
        <Select value={scan.status} onValueChange={(v) => patch({ status: v as Scan['status'] }, `Marked as ${statusLabel[v]}`)}>
          <SelectTrigger className="w-44" data-testid="select-admin-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['new', 'triaged', 'escalated', 'closed'] as const).map((s) => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {scan.dueAt && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Follow up by {shortDate(scan.dueAt)}</span>}
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={10000} className="min-h-[120px]" placeholder="Review notes — what was verified, who was contacted…" data-testid="input-admin-notes" />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || update.isPending} onClick={() => patch({ notes }, 'Notes saved')} data-testid="button-admin-save-notes">
          {update.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Save notes
        </Button>
        {dirty && <span className="text-xs text-caution">Unsaved changes</span>}
      </div>
      {scan.feedback && <p className="border-t pt-3 text-xs text-muted-foreground">Owner feedback on this read: <span className="font-medium text-foreground">{scan.feedback}</span></p>}
    </div>
  );
}

export default function AdminScanPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  useTitle('Evidence review');
  const { data: scan, isLoading, isError, refetch } = useGetAdminScan(id, {
    query: { enabled: !!id, queryKey: getGetAdminScanQueryKey(id), staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true },
  });
  const { data: cases } = useListAdminScans();
  const owner = useMemo(() => cases?.find((c) => c.scan.id === id), [cases, id]);

  const back = <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-admin-back"><ArrowLeft className="h-4 w-4" /> Admin dashboard</Link>;
  if (isLoading) return <div className="space-y-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>;
  if (isError || !scan) return <div className="space-y-4">{back}<ErrorPanel title="This case isn't available" onRetry={() => refetch()} /><p className="text-center text-xs text-muted-foreground">Only account-owned cases can be reviewed. The case may have been deleted by its owner or expired.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/admin/scans/${scan.id}/report`} download data-testid="link-admin-export-pdf"><FileDown className="mr-1.5 h-4 w-4" /> PDF report</a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm rise" data-testid="banner-admin-case">
        <ShieldCheck className="h-4 w-4 text-caution" />
        <span className="font-medium">Reviewer view</span>
        <span className="text-muted-foreground">Owner:</span>
        <span data-testid="text-owner">{owner ? <>{owner.ownerName || 'Unnamed'} <span className="font-mono text-xs text-muted-foreground">{owner.ownerEmail}</span></> : <span className="text-muted-foreground">loading…</span>}</span>
        <span className="ml-auto text-xs text-muted-foreground">Deletion stays with the owner.</span>
      </div>
      <ReportBody scan={scan} caseSlot={<AdminCaseEditor scan={scan} />} caseTitle="Review status & notes" />
    </div>
  );
}
