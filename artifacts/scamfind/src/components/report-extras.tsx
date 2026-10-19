import type { Scan, UrlCheck } from '@workspace/api-client-react';
import { AlertTriangle, CircleSlash, FileText, MinusCircle, ShieldQuestion } from 'lucide-react';
import { utc } from '@/lib/scan-utils';
import { cn } from '@/lib/utils';

export const defang = (u: string) => u.replace(/^http/i, 'hxxp').replace(/\./g, '[.]');

const URL_META: Record<UrlCheck['status'], { label: string; cls: string; icon: typeof AlertTriangle }> = {
  listed: { label: 'Listed by Web Risk', cls: 'bg-alert-soft text-alert', icon: AlertTriangle },
  not_listed: { label: 'No match found', cls: 'bg-unknown-soft text-unknown', icon: ShieldQuestion },
  unavailable: { label: 'Lookup unavailable', cls: 'bg-caution-soft text-caution', icon: CircleSlash },
  skipped: { label: 'Skipped', cls: 'bg-muted text-muted-foreground', icon: MinusCircle },
};

export function PdfSourceNote({ scan }: { scan: Scan }) {
  const p = scan.pdfSource;
  if (!p) return null;
  return (
    <div className="relative mt-4 flex gap-3 rounded-xl border bg-card/80 p-4 text-sm" data-testid="panel-pdf-source">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <div className="font-medium">From PDF <span className="font-mono text-xs" data-testid="text-pdf-name">{p.fileName}</span> <span className="text-xs text-muted-foreground">· {p.pages} page{p.pages === 1 ? '' : 's'}</span></div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Only the text layer extracted from the PDF was screened. Images, scans, signatures, letterheads and layout were not examined, and nothing here says whether the document is authentic. The original file was not kept.</p>
        {p.warning && <p className="mt-1.5 text-xs text-caution" data-testid="text-pdf-warning">{p.warning}</p>}
      </div>
    </div>
  );
}

export function UrlChecksPanel({ scan }: { scan: Scan }) {
  const checks = scan.urlChecks ?? [];
  if (!scan.linkCheckRequested && checks.length === 0) {
    if (scan.linkCheckRequested === false && scan.links.length > 0)
      return <p className="text-xs text-muted-foreground" data-testid="text-urlcheck-off">Link reputation lookup was not requested for this check, so no links were shared with Google Web Risk.</p>;
    return null;
  }
  return (
    <div data-testid="panel-url-checks">
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        You opted in to a Google Web Risk lookup. Only cleaned links were sent; ScamFind never visited them. "No match found" means the link was not on Google's list at that moment — it is not a safety guarantee.
      </p>
      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No eligible public http(s) links were looked up.</p>
      ) : (
        <ul className="space-y-2">
          {checks.map((c, i) => {
            const m = URL_META[c.status] ?? URL_META.skipped;
            return (
              <li key={i} className="rounded-lg border p-3" data-testid={`row-urlcheck-${i}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="min-w-0 break-all font-mono text-xs">{defang(c.url)}</code>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', m.cls)} data-testid={`status-urlcheck-${i}`}>
                    <m.icon className="h-3 w-3" /> {m.label}
                  </span>
                </div>
                {c.threatTypes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.threatTypes.map((t) => <span key={t} className="rounded bg-alert-soft px-1.5 py-0.5 font-mono text-[10px] uppercase text-alert">{t.replace(/_/g, ' ')}</span>)}
                  </div>
                )}
                {c.detail && <p className="mt-1.5 text-xs text-muted-foreground">{c.detail}</p>}
                {c.checkedAt && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{utc(c.checkedAt)}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
