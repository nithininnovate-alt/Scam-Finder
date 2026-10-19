import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { scoreTone, statusLabel, toneSoft, toneText, verdictTone, type Tone } from '@/lib/scan-utils';

const STROKE: Record<Tone, string> = {
  safe: 'hsl(var(--safe))',
  caution: 'hsl(var(--caution))',
  alert: 'hsl(var(--alert))',
  unknown: 'hsl(var(--unknown))',
};

export function RiskDial({ score, verdict, size = 180 }: { score: number; verdict: string; size?: number }) {
  const tone = verdict === 'Insufficient data' ? 'unknown' : scoreTone(score);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(score), 80);
    return () => clearTimeout(t);
  }, [score]);
  const r = 70;
  const c = Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size * 0.62 }} data-testid="dial-risk">
      <svg viewBox="0 0 180 112" className="h-full w-full">
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M20 95 A70 70 0 0 1 160 95"
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * shown) / 100}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className={cn('font-display text-5xl font-semibold leading-none', toneText[tone])} data-testid="text-score">{score}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">risk indicator / 100</div>
      </div>
    </div>
  );
}

export function VerdictBadge({ verdict, className }: { verdict: string; className?: string }) {
  const tone = verdictTone(verdict);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', toneSoft[tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {verdict}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'border-primary/30 text-primary',
    triaged: 'border-[hsl(var(--caution)/.4)] text-caution',
    escalated: 'border-[hsl(var(--alert)/.4)] text-alert',
    closed: 'border-border text-muted-foreground',
  };
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider', styles[status])}>
      {statusLabel[status] ?? status}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: STROKE[tone] }} />
      </div>
      <span className={cn('font-mono text-xs', toneText[tone])}>{score}</span>
    </div>
  );
}

export function ErrorPanel({ title = 'We could not load this', onRetry }: { title?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center rise" data-testid="state-error">
      <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-caution" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        The connection may have dropped. Nothing you entered has been lost on our side.
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="button-retry">
          <RotateCcw className="mr-2 h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyPanel({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-10 text-center rise" data-testid="state-empty">
      <div className="ledger pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">{icon}</div>
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
