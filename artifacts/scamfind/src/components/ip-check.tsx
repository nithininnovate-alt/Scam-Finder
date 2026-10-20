import type { Scan } from '@workspace/api-client-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = { checked: boolean; onChange: (value: boolean) => void; ip?: string; onIpChange?: (value: string) => void; disabled?: boolean; batch?: boolean };

export function IpConsent({ checked, onChange, ip, onIpChange, disabled, batch }: Props) {
  const id = batch ? 'check-ip-batch' : 'check-ip';
  return (
    <div className="min-w-0 rounded-xl border bg-card/70 p-4 [overflow-wrap:anywhere]">
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={value => onChange(value === true)} disabled={disabled} className="mt-0.5" data-testid={id} />
        <div className="min-w-0">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">Optional: check a selected public IP with AbuseIPDB</Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Only the public IP you select is shared with AbuseIPDB—not the email, headers, offer or PDF. Your own IP is never filled in automatically. This is a lookup only; no abuse reports are submitted.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">IP reports can concern shared servers or unrelated activity. They do not identify a recruiter or establish offer safety, and do not change the risk score.</p>
        </div>
      </div>
      {checked && (batch ? (
        <p className="mt-3 text-xs text-muted-foreground">Review an optional <code>ip_address</code> CSV column before uploading. Only one public IPv4 or IPv6 address per row is checked. Blank, private and reserved addresses are skipped.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <Label htmlFor="selected-ip" className="text-xs">Public IP address you consent to share</Label>
          <Input id="selected-ip" value={ip ?? ''} onChange={event => onIpChange?.(event.target.value)} disabled={disabled} maxLength={45} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Paste a public IPv4 or IPv6 address" data-testid="input-ip-address" />
          <p className="text-xs text-muted-foreground">If you use an IP from email headers, mail-server hops may not belong to the sender. Do not enter a website URL or hostname. Reports use a 90-day lookback.</p>
        </div>
      ))}
    </div>
  );
}

export function IpCheckPanel({ scan }: { scan: Scan }) {
  if (scan.ipCheckRequested === undefined && !scan.ipCheck) return null;
  const result = scan.ipCheck;
  if (!scan.ipCheckRequested) return <p className="text-sm text-muted-foreground" data-testid="panel-ip-check">Not requested. No IP from this scan was shared with AbuseIPDB.</p>;
  return (
    <div className="min-w-0 space-y-3 text-sm [overflow-wrap:anywhere]" data-testid="panel-ip-check">
      <p className="font-medium" data-testid="status-ip-check">{result?.status === 'checked' ? 'Community IP reputation—not identity verification' : result?.status === 'skipped' ? 'IP lookup skipped' : 'IP lookup unavailable'}</p>
      {result?.ip && <code className="block break-all rounded-lg bg-muted p-3" data-testid="text-checked-ip">{result.ip}</code>}
      {result?.status === 'checked' && <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ['AbuseIPDB abuse-confidence', `${result.abuseConfidenceScore}/100`],
          ['Reports in lookback period', result.totalReports],
          ['Country code', result.countryCode || 'Not provided'],
          ['ISP', result.isp || 'Not provided'],
          ['Usage type', result.usageType || 'Not provided'],
          ['Lookback', `${result.lookbackDays} days`],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1">{value}</dd></div>)}
      </dl>}
      <p className="text-muted-foreground">{result?.detail ?? 'A result was not recorded. No safety conclusion was assumed.'}</p>
      {result?.lastReportedAt && <p className="text-xs text-muted-foreground">Last reported: {new Date(result.lastReportedAt).toLocaleString()}</p>}
      {result?.checkedAt && <p className="text-xs text-muted-foreground">Checked: {new Date(result.checkedAt).toLocaleString()}. Saved results are a snapshot, not continuous monitoring.</p>}
      <p className="text-xs text-muted-foreground">The abuse-confidence value is AbuseIPDB's community-report metric, not ScamFind's risk score or a probability that this offer is fraudulent.</p>
    </div>
  );
}
