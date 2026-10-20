import type { Scan } from '@workspace/api-client-react';
import { Phone } from 'lucide-react';
import { utc } from '@/lib/scan-utils';

export function PhoneCheckPanel({ scan }: { scan: Scan }) {
  if (scan.phoneCheckRequested === undefined && !scan.phoneCheck) return null;
  const check = scan.phoneCheck;
  if (!scan.phoneCheckRequested && !check) return <p className="text-xs text-muted-foreground" data-testid="text-phonecheck-off">Phone lookup was not requested. No phone number was shared with Numverify.</p>;
  const labels = { valid: 'Recognized number — not identity verification', invalid: 'Number not recognized', unavailable: 'Lookup unavailable', skipped: 'Skipped — no lookup' };
  return (
    <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]" data-testid="panel-phone-check">
      <p className="text-xs text-muted-foreground">You opted in to sharing one selected phone number with Numverify. This is numbering-plan information, not proof of ownership, reachability or a genuine job. It does not change the risk score.</p>
      {check ? (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-mono text-sm" data-testid="text-phonecheck-number"><Phone className="h-4 w-4" />{check.internationalFormat || check.number || 'No complete number supplied'}</span>
            <span className="rounded bg-muted px-2 py-1 text-xs" data-testid="status-phonecheck">{labels[check.status]}</span>
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Country</dt><dd>{check.countryName || check.countryCode || 'Not provided'}</dd></div>
            <div><dt className="text-muted-foreground">Carrier</dt><dd>{check.carrier || 'Not provided'}</dd></div>
            <div><dt className="text-muted-foreground">Line type</dt><dd>{check.lineType || 'Not provided'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{check.detail}</p>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">Checked: {utc(check.checkedAt)}</p>
        </div>
      ) : <p className="text-sm">No phone lookup result is available.</p>}
    </div>
  );
}
