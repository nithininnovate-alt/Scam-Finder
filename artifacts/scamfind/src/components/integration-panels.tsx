import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetNotificationPreferences, getGetNotificationPreferencesQueryKey, useUpdateNotificationPreferences,
  useGetIntegrationSettings, getGetIntegrationSettingsQueryKey, useUpdateIntegrationSettings,
  useRefreshIntegrationStatus, useSendTestEmail, getListProvidersQueryKey,
  type IntegrationSettings, type EmailDelivery,
} from '@workspace/api-client-react';
import { BellRing, Loader2, Lock, Mail, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ErrorPanel } from '@/components/scan-bits';
import { errorMessage, utc } from '@/lib/scan-utils';
import { cn } from '@/lib/utils';

type Status = IntegrationSettings['emailStatus'];
export const STATUS_META: Record<Status, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-safe-soft text-safe' },
  configured: { label: 'Configured', cls: 'bg-caution-soft text-caution' },
  not_connected: { label: 'Not connected', cls: 'bg-unknown-soft text-unknown' },
  error: { label: 'Error', cls: 'bg-alert-soft text-alert' },
};
export function StatusChip({ status, testId }: { status: Status; testId?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.not_connected;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', m.cls)} data-testid={testId}><span className="h-1.5 w-1.5 rounded-full bg-current" />{m.label}</span>;
}

const DELIVERY: Record<EmailDelivery['status'], { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'text-unknown' },
  sending: { label: 'Sending', cls: 'text-caution' },
  sent: { label: 'Accepted by provider', cls: 'text-safe' },
  failed: { label: 'Failed', cls: 'text-alert' },
  cancelled: { label: 'Cancelled', cls: 'text-muted-foreground' },
};

export function NotificationPrefsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useGetNotificationPreferences({ query: { queryKey: getGetNotificationPreferencesQueryKey(), staleTime: 30_000 } });
  const update = useUpdateNotificationPreferences();

  if (isLoading) return <Skeleton className="h-44 rounded-2xl" />;
  if (isError || !data) return <ErrorPanel title="Couldn't load your notification settings" onRetry={() => refetch()} />;
  const canEnable = data.ready || data.enabled;

  function toggle(enabled: boolean) {
    update.mutate({ data: { enabled } }, {
      onSuccess: (p) => {
        qc.setQueryData(getGetNotificationPreferencesQueryKey(), p);
        qc.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
        toast({ title: p.enabled ? 'Case update emails on' : 'Case update emails off' });
      },
      onError: (e) => { toast({ title: 'Could not change setting', description: errorMessage(e), variant: 'destructive' }); qc.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() }); },
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6 rise" data-testid="panel-notifications">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary"><BellRing className="h-4 w-4 text-primary" /></span>
          <div>
            <h2 className="text-xl font-semibold">Case update emails</h2>
            <p className="mt-1 text-sm text-muted-foreground">An email when a reviewer changes the status or notes on one of your cases.</p>
          </div>
        </div>
        <Switch checked={data.enabled} disabled={update.isPending || (!data.enabled && !canEnable)} onCheckedChange={toggle} aria-label="Case update emails" data-testid="switch-notifications" />
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-secondary/70 px-3 py-2"><span className="text-muted-foreground">Sent only to your verified address</span><div className="mt-0.5 font-mono text-foreground" data-testid="text-notify-email">{data.email || 'No verified address on file'}</div></div>
        <div className="rounded-lg bg-secondary/70 px-3 py-2"><span className="text-muted-foreground">Availability</span><div className={cn('mt-0.5', data.ready ? 'text-safe' : 'text-caution')} data-testid="text-notify-ready">{data.message || (data.ready ? 'Ready' : 'Not available yet')}</div></div>
      </div>
      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted-foreground"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Off unless you turn it on. Emails say that a case changed — they never include the offer text or anyone's notes. Sign in to read the update. You can switch alerts off at any time.</p>
    </section>
  );
}

export function AdminIntegrationPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = getGetIntegrationSettingsQueryKey();
  const { data, isLoading, isError, refetch } = useGetIntegrationSettings({
    query: {
      queryKey: key,
      staleTime: 15_000,
      refetchInterval: (q) => (q.state.data?.deliveries.some((d) => d.status === 'queued' || d.status === 'sending') ? 10_000 : false),
    },
  });
  const save = useUpdateIntegrationSettings();
  const check = useRefreshIntegrationStatus();
  const test = useSendTestEmail();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(false);
  const init = useRef(false);
  useEffect(() => {
    if (data && !init.current) { init.current = true; setEmail(data.senderEmail); setName(data.senderName); setEnabled(data.emailEnabled); }
  }, [data]);

  function after(s: IntegrationSettings) {
    qc.setQueryData(key, s);
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: getListProvidersQueryKey() });
    qc.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
  }

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (isError || !data) return <ErrorPanel title="Couldn't load integration settings" onRetry={() => refetch()} />;
  const dirty = email !== data.senderEmail || name !== data.senderName || enabled !== data.emailEnabled;
  const valid = name.trim().length > 0 && name.length <= 80 && (!enabled || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));

  return (
    <section className="relative overflow-hidden rounded-3xl border bg-card p-5 sm:p-7 rise" data-testid="panel-admin-integrations">
      <div className="ledger pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Reviewer controls</div>
        <h2 className="text-2xl font-semibold">Email sender and connection health</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Settings apply to every account. Keys stay on the server and are never shown here.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            { t: 'Email delivery', s: data.emailStatus, m: data.emailMessage, id: 'email' },
            { t: 'Google Web Risk', s: data.webRiskStatus, m: data.webRiskMessage, id: 'webrisk' },
          ].map((c) => (
            <div key={c.id} className="rounded-xl border bg-background/60 p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{c.t}</span><StatusChip status={c.s} testId={`status-${c.id}`} /></div>
              {c.m && <p className="mt-2 text-xs leading-relaxed text-muted-foreground" data-testid={`text-${c.id}-message`}>{c.m}</p>}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" disabled={check.isPending} data-testid="button-refresh-status"
          onClick={() => check.mutate(undefined, { onSuccess: (s) => { after(s); toast({ title: 'Connection health refreshed', description: 'No email was sent.' }); }, onError: (e) => toast({ title: 'Check failed', description: errorMessage(e), variant: 'destructive' }) })}>
          {check.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Re-check connections
        </Button>
        <span className="ml-3 text-xs text-muted-foreground">Checks health only. Sends nothing.</span>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sender-email">Sender address</Label>
            <Input id="sender-email" type="email" value={email} maxLength={320} onChange={(e) => setEmail(e.target.value)} placeholder="alerts@your-verified-domain.org" data-testid="input-sender-email" />
            <p className="text-[11px] text-muted-foreground">Must be on a domain already verified with your email provider. ScamFind can't list or verify domains from here.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sender-name">Sender name</Label>
            <Input id="sender-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ScamFind case desk" data-testid="input-sender-name" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-secondary/70 px-4 py-3">
          <div><div className="text-sm font-medium">Allow case update emails</div><div className="text-xs text-muted-foreground">When off, nobody can opt in and pending updates are not sent.</div></div>
          <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-email-enabled" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button disabled={!dirty || !valid || save.isPending} data-testid="button-save-integrations"
            onClick={() => save.mutate({ data: { senderEmail: email.trim(), senderName: name.trim(), emailEnabled: enabled } }, {
              onSuccess: (s) => { after(s); setEmail(s.senderEmail); setName(s.senderName); setEnabled(s.emailEnabled); toast({ title: 'Sender settings saved' }); },
              onError: (e) => toast({ title: 'Could not save', description: errorMessage(e), variant: 'destructive' }),
            })}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save settings
          </Button>
          <Button variant="outline" disabled={test.isPending || dirty} data-testid="button-test-email"
            onClick={() => test.mutate(undefined, {
              onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast({ title: 'Test email queued', description: 'Status below updates every 10 seconds.' }); },
              onError: (e) => toast({ title: 'Could not queue test', description: errorMessage(e), variant: 'destructive' }),
            })}>
            {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send test to my verified address
          </Button>
          {dirty && <span className="text-xs text-caution">Save before sending a test.</span>}
        </div>

        <div className="mt-8">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold"><Mail className="h-4 w-4 text-primary" /> Recent deliveries</h3>
          <p className="mb-3 text-xs text-muted-foreground">"Accepted by provider" means the provider took the message, not that it reached an inbox.</p>
          {data.deliveries.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No emails yet. A test send will appear here.</p>
          ) : (
            <div className="divide-y rounded-xl border bg-background/60">
              {data.deliveries.map((d) => {
                const m = DELIVERY[d.status] ?? DELIVERY.queued;
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm" data-testid={`row-delivery-${d.id}`}>
                    <span className="w-24 font-mono text-[10px] uppercase text-muted-foreground">{d.type === 'test' ? 'Test' : 'Case update'}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{d.recipient}</span>
                    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', m.cls)} data-testid={`status-delivery-${d.id}`}>
                      {(d.status === 'queued' || d.status === 'sending') && <Loader2 className="h-3 w-3 animate-spin" />}{m.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{d.attempts} attempt{d.attempts === 1 ? '' : 's'} · {utc(d.createdAt)}</span>
                    {d.error && <span className="w-full text-xs text-alert">{d.error}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="mt-6 flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Tests go only to your own verified primary address. Case update emails contain no offer text or notes.</p>
      </div>
    </section>
  );
}
