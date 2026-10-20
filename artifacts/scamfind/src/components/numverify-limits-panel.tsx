import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetIntegrationSettingsQueryKey, useUpdateNumverifyLimits,
  type NumverifyUsage, type IntegrationSettings,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { errorMessage, utc } from '@/lib/scan-utils';

export function NumverifyLimitsPanel({ usage }: { usage: NumverifyUsage }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useUpdateNumverifyLimits();
  const [daily, setDaily] = useState(String(usage.dailyLimit));
  const [monthly, setMonthly] = useState(String(usage.monthlyLimit));
  const [editing, setEditing] = useState(false);
  // Other administrators' saves refresh untouched forms, not unsaved input.
  useEffect(() => {
    if (!editing) {
      setDaily(String(usage.dailyLimit));
      setMonthly(String(usage.monthlyLimit));
    }
  }, [usage.dailyLimit, usage.monthlyLimit, editing]);
  const validLimit = (value: string) => /^\d+$/.test(value) && Number(value) <= 2147483647;
  const dirty = Number(daily) !== usage.dailyLimit || Number(monthly) !== usage.monthlyLimit;
  const valid = validLimit(daily) && validLimit(monthly);
  return (
    <div className="mt-8 rounded-xl border bg-background/60 p-4" data-testid="panel-numverify-limits">
      <h3 className="text-lg font-semibold">Phone lookup allowance</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Numverify limits apply across all accounts and server instances. Set them to fit your provider plan.
        Saving here never changes your provider subscription or enables a paid upgrade.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[
          { title: 'Today (UTC)', used: usage.dailyUsed, left: usage.dailyRemaining, limit: usage.dailyLimit, reset: usage.dailyResetsAt },
          { title: 'This month (UTC)', used: usage.monthlyUsed, left: usage.monthlyRemaining, limit: usage.monthlyLimit, reset: usage.monthlyResetsAt },
        ].map(period => (
          <div key={period.title} className="rounded-lg bg-secondary/70 p-3">
            <div className="text-sm font-medium">{period.title}</div>
            <p className="mt-1 text-sm">{period.used.toLocaleString()} reserved / {period.limit.toLocaleString()} limit</p>
            <p className="text-sm font-medium">{period.left.toLocaleString()} remaining</p>
            <p className="mt-1 text-xs text-muted-foreground">Resets {utc(period.reset)}</p>
          </div>
        ))}
      </div>
      <form className="mt-4" onSubmit={event => {
        event.preventDefault();
        if (!valid || !dirty || save.isPending) return;
        save.mutate({ data: { dailyLimit: Number(daily), monthlyLimit: Number(monthly) } }, {
          onSuccess: async saved => {
            qc.setQueryData<IntegrationSettings>(getGetIntegrationSettingsQueryKey(),
              current => current ? { ...current, numverifyUsage: saved } : current);
            await qc.invalidateQueries({ queryKey: getGetIntegrationSettingsQueryKey() });
            setEditing(false);
            toast({ title: 'Phone lookup limits saved' });
          },
          onError: error => toast({ title: 'Could not save limits', description: errorMessage(error), variant: 'destructive' }),
        });
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="numverify-daily-limit">Daily lookup limit</Label>
            <Input id="numverify-daily-limit" type="number" min="0" max="2147483647" step="1" required value={daily} disabled={save.isPending}
              onChange={event => { setEditing(true); setDaily(event.target.value); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numverify-monthly-limit">Monthly lookup limit</Label>
            <Input id="numverify-monthly-limit" type="number" min="0" max="2147483647" step="1" required value={monthly} disabled={save.isPending}
              onChange={event => { setEditing(true); setMonthly(event.target.value); }} />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Zero pauses new provider lookups. Both limits must have allowance. Lowering a limit does not erase usage.
          Failed provider attempts count; cached results and connection checks do not.
          These are application reservations, not your provider's billing balance; other apps using the same key are not counted.
          Periods reset at midnight UTC and the first of each UTC calendar month, which may differ from your provider's billing cycle.
          Usage summaries contain no phone numbers or API keys.
        </p>
        {(!usage.dailyRemaining || !usage.monthlyRemaining) && <p className="mt-2 text-sm text-caution" role="status">New provider lookups are paused or the allowance is exhausted. Cached results can still be returned.</p>}
        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={!dirty || !valid || save.isPending}>{save.isPending ? 'Saving…' : 'Save phone limits'}</Button>
          {editing && <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(false)}>Reset form</Button>}
        </div>
      </form>
    </div>
  );
}
