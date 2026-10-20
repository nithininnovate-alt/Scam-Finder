import { useTitle } from '@/lib/auth';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetScan,
  getGetScanQueryKey,
  useUpdateScan,
  useDeleteScan,
  getListScansQueryKey,
  getGetSummaryQueryKey,
  type Scan,
} from '@workspace/api-client-react';
import {
  ArrowLeft, CheckCircle2, CircleSlash, AlertTriangle, Info, FileDown, FileJson, Trash2, ThumbsUp, ThumbsDown,
  Quote, Copy, Check, Link2Off, ExternalLink, Loader2, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ErrorPanel, RiskDial, StatusPill, VerdictBadge } from '@/components/scan-bits';
import { download, errorMessage, shortDate, statusLabel, utc, verdictPlain } from '@/lib/scan-utils';
import { cn } from '@/lib/utils';
import { PdfSourceNote, UrlChecksPanel, defang } from '@/components/report-extras';
import { PhoneCheckPanel } from '@/components/phone-check';
import { TextSearchPanel } from '@/components/text-search';
import { IpCheckPanel } from '@/components/ip-check';

const CHECK_ICON = {
  passed: { icon: CheckCircle2, cls: 'text-safe', label: 'Passed' },
  warning: { icon: AlertTriangle, cls: 'text-caution', label: 'Warning' },
  unavailable: { icon: CircleSlash, cls: 'text-unknown', label: 'Unavailable' },
  info: { icon: Info, cls: 'text-primary', label: 'Info' },
} as const;

function Section({ n, title, children, className }: { n: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-2xl border bg-card p-5 sm:p-6 rise [overflow-wrap:anywhere]', className)}>
      <h2 className="mb-4 flex items-baseline gap-3 text-xl font-semibold">
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
      data-testid={`button-copy-${label}`}
    >
      {done ? <Check className="h-3 w-3 text-safe" /> : <Copy className="h-3 w-3" />} {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function CaseEditor({ scan }: { scan: Scan }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateScan();
  const [notes, setNotes] = useState(scan.notes ?? '');
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (initFor.current !== scan.id) {
      initFor.current = scan.id;
      setNotes(scan.notes ?? '');
    }
  }, [scan.id, scan.notes]);

  function patch(data: { status?: Scan['status']; notes?: string; feedback?: 'helpful' | 'incorrect' }, msg: string) {
    update.mutate(
      { id: scan.id, data },
      {
        onSuccess: (s) => {
          qc.setQueryData(getGetScanQueryKey(scan.id), s);
          qc.invalidateQueries({ queryKey: getListScansQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          toast({ title: msg });
        },
        onError: (e) => toast({ title: 'Could not save', description: errorMessage(e), variant: 'destructive' }),
      },
    );
  }

  const dirty = notes !== (scan.notes ?? '');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Status</span>
        <Select value={scan.status} onValueChange={(v) => patch({ status: v as Scan['status'] }, `Marked as ${statusLabel[v]}`)}>
          <SelectTrigger className="w-44" data-testid="select-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['new', 'triaged', 'escalated', 'closed'] as const).map((s) => (
              <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {scan.dueAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-due">
            <Clock className="h-3.5 w-3.5" /> Follow up by {shortDate(scan.dueAt)}
          </span>
        )}
      </div>
      {scan.status === 'escalated' && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">Escalated cases are kept for up to 24 months instead of the usual 90 days, so your evidence stays available.</p>
      )}
      <div className="space-y-2">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={10000}
          placeholder="Your notes — who you called, what the company said, reference numbers from a complaint you filed…"
          className="min-h-[110px]"
          data-testid="input-notes"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || update.isPending} onClick={() => patch({ notes }, 'Notes saved')} data-testid="button-save-notes">
            {update.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Save notes
          </Button>
          {dirty && <span className="text-xs text-caution">Unsaved changes</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="text-sm text-muted-foreground">Was this read useful?</span>
        <Button size="sm" variant={scan.feedback === 'helpful' ? 'default' : 'outline'} onClick={() => patch({ feedback: 'helpful' }, 'Thanks for the feedback')} data-testid="button-feedback-helpful">
          <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> Helpful
        </Button>
        <Button size="sm" variant={scan.feedback === 'incorrect' ? 'default' : 'outline'} onClick={() => patch({ feedback: 'incorrect' }, 'Noted — thanks for flagging')} data-testid="button-feedback-incorrect">
          <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Seems wrong
        </Button>
      </div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
    </div>
  );
}

export default function ScanPage() {
  useTitle('Report');
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: scan, isLoading, isError, refetch } = useGetScan(id, { query: { enabled: !!id, queryKey: getGetScanQueryKey(id) } });
  const del = useDeleteScan();

  if (isLoading) return <ReportSkeleton />;
  if (isError || !scan)
    return (
      <div className="space-y-4">
        <Link href="/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> History</Link>
        <ErrorPanel title="This report isn't available" onRetry={() => refetch()} />
        <p className="text-center text-xs text-muted-foreground">Reports are visible only to the account that created them (and authorised reviewers), and routine reports expire after 90 days.</p>
      </div>
    );

  function remove() {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListScansQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          qc.removeQueries({ queryKey: getGetScanQueryKey(id) });
          toast({ title: 'Report deleted' });
          setLocation('/history');
        },
        onError: (e) => toast({ title: 'Could not delete', description: errorMessage(e), variant: 'destructive' }),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back"><ArrowLeft className="h-4 w-4" /> History</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/scans/${scan.id}/report`} download data-testid="link-export-pdf"><FileDown className="mr-1.5 h-4 w-4" /> PDF report</a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => download(`scamfind-${scan.id}.json`, JSON.stringify(scan, null, 2), 'application/json')} data-testid="button-export-json">
            <FileJson className="mr-1.5 h-4 w-4" /> JSON
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-alert" data-testid="button-delete"><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                <AlertDialogDescription>The original text, evidence and notes will be removed permanently. Export a copy first if you may need it for a complaint.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <ReportBody scan={scan} caseSlot={<CaseEditor scan={scan} />} />
    </div>
  );
}

export function ReportBody({ scan, caseSlot, caseTitle = 'Case notes' }: { scan: Scan; caseSlot: ReactNode; caseTitle?: string }) {
  const unavailable = scan.checks.filter((c) => c.status === 'unavailable');
  const summaryText = `ScamFind case summary\nReport ID: ${scan.id}\nVerdict: ${scan.verdict} (risk indicator ${scan.score}/100, confidence ${scan.confidence})\nSender: ${scan.sender || 'not provided'}\nDomain: ${scan.domain || 'n/a'}\nReceived for analysis: ${utc(scan.createdAt)}\nSHA-256: ${scan.hash}\nSignals:\n${scan.signals.map((s) => `- ${s.title}: "${s.evidence}"`).join('\n')}`;
  const certMail = `mailto:incident@cert-in.org.in?subject=${encodeURIComponent('Suspected recruitment fraud - ' + (scan.title || scan.id))}&body=${encodeURIComponent(summaryText.slice(0, 1800))}`;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8 rise">
        <div className="ledger pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1fr)_250px]">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={scan.verdict} className="text-sm" />
              <StatusPill status={scan.status} />
              <span className="font-mono text-[11px] text-muted-foreground">{utc(scan.createdAt)}</span>
            </div>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl" data-testid="text-scan-title">{scan.title || 'Untitled offer'}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground" data-testid="text-sender">{scan.sender || 'No sender provided'}{scan.domain ? ` · ${scan.domain}` : ''}</p>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed">{verdictPlain[scan.verdict]}</p>
          </div>
          <div className="flex flex-col items-center">
            <RiskDial score={scan.score} verdict={scan.verdict} size={220} />
            <div className="mt-3 max-w-xs text-center text-xs text-muted-foreground">Confidence: <span className="font-medium text-foreground" data-testid="text-confidence">Reduced — see check coverage below</span></div>
          </div>
        </div>
        <div className="relative mt-6 rounded-xl bg-secondary/70 p-4 text-sm leading-relaxed">
          <strong className="font-medium">How to read this. </strong>
          The score is a risk indicator from 0 to 100 built from weighted rules and available public domain checks — not a probability. Money-demand signals set a minimum of 60, and a free mailbox sender sets a minimum of 40. Attachment-hash reputation is not connected and does not affect this score.{scan.linkCheckRequested ? ' You opted in to a Google Web Risk link lookup; results are listed with the links below.' : ''}
          {unavailable.length > 0 && <> Confidence is reduced because {unavailable.length} check{unavailable.length > 1 ? 's were' : ' was'} unavailable: {unavailable.map((c) => c.name).join(', ')}.</>}
          {' '}No machine-learning models are used. A low score alone does not verify that an offer is legitimate.
          <p className="mt-2 text-xs text-muted-foreground">{scan.confidence}</p>
        </div>
        <PdfSourceNote scan={scan} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section n="01" title={`Evidence found (${scan.signals.length})`}>
          {scan.signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warning patterns matched. That is reassuring but not proof — verify the company and recruiter independently before sharing documents.</p>
          ) : (
            <ol className="space-y-4">
              {[...scan.signals].sort((a, b) => b.weight - a.weight).map((s) => (
                <li key={s.id} className="group rounded-xl border p-4 transition-shadow hover:shadow-md" data-testid={`card-signal-${s.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-sans text-base font-semibold">{s.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{s.category}</span>
                      <span className="font-mono text-xs text-caution">+{s.weight}</span>
                    </div>
                  </div>
                  {s.evidence && (
                    <blockquote className="relative mt-3 rounded-lg border-l-[3px] border-accent bg-accent/10 py-2 pl-8 pr-3 font-mono text-[13px] leading-relaxed">
                      <Quote className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-accent" />
                      {s.evidence}
                    </blockquote>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <div className="space-y-6">
          <Section n="02" title="Checks run">
            <ul className="space-y-3">
              {scan.checks.map((c, i) => {
                const m = CHECK_ICON[c.status] ?? CHECK_ICON.info;
                return (
                  <li key={i} className="flex gap-3" data-testid={`row-check-${i}`}>
                    <m.icon className={cn('mt-0.5 h-4 w-4 shrink-0', m.cls)} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.name} <span className={cn('ml-1 font-mono text-[10px] uppercase', m.cls)}>{m.label}</span></div>
                      <div className="text-xs leading-relaxed text-muted-foreground">{c.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section n="03" title="Your next steps">
            <ol className="space-y-2.5">
              {scan.checklist.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary font-mono text-[10px] text-primary-foreground">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section n="04" title={caseTitle}>
          {caseSlot}
        </Section>

        <Section n="05" title="Report it, if you choose">
          <p className="mb-4 text-sm text-muted-foreground">These open official sites in a new tab. ScamFind does not submit complaints for you — export the PDF first and attach it.</p>
          <div className="space-y-2">
            {[
              { href: 'https://cybercrime.gov.in', t: 'India — National Cyber Crime Portal', d: 'Or call the 1930 helpline, especially if money was lost' },
              { href: 'https://www.cert-in.org.in', t: 'CERT-In', d: 'Indian Computer Emergency Response Team' },
              { href: 'https://reportfraud.ftc.gov', t: 'US — FTC ReportFraud', d: 'Federal Trade Commission' },
              { href: 'https://apwg.org/reportphishing/', t: 'APWG', d: 'Anti-Phishing Working Group' },
            ].map((r) => (
              <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/60" data-testid={`link-report-${r.t.split(' ')[0].toLowerCase()}`}>
                <div><div className="text-sm font-medium">{r.t}</div><div className="text-xs text-muted-foreground">{r.d}</div></div>
                <ExternalLink className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
            <a href={certMail} className="flex items-center justify-between rounded-lg bg-primary px-3 py-2.5 text-primary-foreground hover:opacity-95" data-testid="link-cert-email">
              <div><div className="text-sm font-medium">Draft an email to incident@cert-in.org.in</div><div className="text-xs opacity-75">Opens your mail app with this case summary — you review and send</div></div>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </Section>
      </div>

      {(scan.phoneCheckRequested !== undefined || scan.phoneCheck) && (
        <Section n="PHONE" title="Phone number check"><PhoneCheckPanel scan={scan} /></Section>
      )}
      {(scan.textSearchRequested !== undefined || scan.textSearch) && (
        <Section n="SEARCH" title="Phrase reuse search"><TextSearchPanel scan={scan} /></Section>
      )}
      {(scan.ipCheckRequested !== undefined || scan.ipCheck) && (
        <Section n="IP" title="Public-IP reputation"><IpCheckPanel scan={scan} /></Section>
      )}
      {(scan.links.length > 0 || (scan.urlChecks?.length ?? 0) > 0 || scan.linkCheckRequested) && (
        <Section n="06" title="Links found in the message">
          <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Link2Off className="h-3.5 w-3.5" /> Shown as plain text and never opened or fetched by ScamFind. Do not visit them to check.</p>
          <ul className="space-y-1.5">
            {scan.links.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5" data-testid={`text-link-${i}`}>
                <code className="break-all font-mono text-xs">{defang(l)}</code>
                <CopyBtn value={l} label={`link-${i}`} />
              </li>
            ))}
          </ul>
          {(scan.linkCheckRequested !== undefined || (scan.urlChecks?.length ?? 0) > 0) && <div className="mt-5 border-t pt-4">
            <h3 className="mb-2 font-sans text-sm font-semibold">Link reputation lookup</h3>
            <UrlChecksPanel scan={scan} />
          </div>}
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section n="07" title="Readable offer content">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed" data-testid="text-original">{scan.text}</pre>
          {scan.headers && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Raw email headers</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 font-mono text-[11px]" data-testid="text-headers">{scan.headers}</pre>
            </details>
          )}
        </Section>

        <Section n="08" title="Audit trail">
          <p className="mb-4 text-xs text-muted-foreground">The hash covers the submitted UTF-8 source text{scan.pdfSource ? ' (for PDFs, the extracted text)' : ''}, not original uploaded file bytes. Preserve your original email separately. This is a screening record, not a certified forensic chain of custody.</p>
          <dl className="mb-5 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2"><dt className="shrink-0 text-muted-foreground">SHA-256</dt><dd className="flex min-w-0 items-start gap-1"><code className="min-w-0 break-all text-right font-mono" data-testid="text-hash">{scan.hash}</code><CopyBtn value={scan.hash} label="hash" /></dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Engine</dt><dd className="font-mono">{scan.engineVersion}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Analysis time</dt><dd className="font-mono">{scan.durationMs} ms</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Source</dt><dd className="font-mono">{scan.source}</dd></div>
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">Report ID</dt><dd className="min-w-0 break-all text-right font-mono">{scan.id}</dd></div>
          </dl>
          <ol className="relative space-y-4 border-l pl-5">
            {scan.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                <div className="font-mono text-[11px] text-muted-foreground">{utc(t.at)}</div>
                <div className="text-sm">{t.description}</div>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
