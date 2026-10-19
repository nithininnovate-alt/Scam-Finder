import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, FileSearch, FolderLock, Clock } from 'lucide-react';
import { Logo } from '@/components/shell';

const POINTS = [
  { icon: FileSearch, t: 'Evidence, quoted', d: 'Every flag points to the exact line in the message that triggered it.' },
  { icon: FolderLock, t: 'Saved to your account', d: 'Checks and cases follow you across devices, encrypted at rest.' },
  { icon: Clock, t: 'Clear retention', d: 'Routine checks are kept 90 days. Escalated cases are kept up to 24 months.' },
];

export function AuthFrame({ mode, children }: { mode: 'sign-in' | 'sign-up'; children: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="ledger pointer-events-none absolute inset-0 opacity-[0.07]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[hsl(38_82%_58%/0.18)] blur-3xl" />
        <Link href="/" className="relative" data-testid="link-auth-home"><Logo /></Link>
        <div className="relative max-w-md rise">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-primary">{mode === 'sign-in' ? 'Welcome back' : 'Before you reply'}</div>
          <h1 className="text-4xl font-semibold leading-[1.1]">
            {mode === 'sign-in' ? <>Your evidence is <span className="italic text-sidebar-primary">where you left it.</span></> : <>Read the offer <span className="italic text-sidebar-primary">before</span> it reads you.</>}
          </h1>
          <ul className="mt-10 space-y-6">
            {POINTS.map((p, i) => (
              <li key={p.t} className="flex gap-4 rise" style={{ animationDelay: `${120 + i * 90}ms` }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-sidebar-border"><p.icon className="h-4 w-4 text-sidebar-primary" /></span>
                <div><div className="font-medium">{p.t}</div><div className="text-sm text-sidebar-foreground/65">{p.d}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative max-w-sm text-xs leading-relaxed text-sidebar-foreground/50">
          Authorised ScamFind reviewers can see account-owned cases to help with follow-up. Results are a rule-based risk indicator, not a guarantee.
        </p>
      </aside>
      <main className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="flex w-full max-w-[440px] items-center justify-between lg:hidden">
          <Link href="/" data-testid="link-auth-home-mobile"><Logo /></Link>
        </div>
        {children}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-auth-back"><ArrowLeft className="h-4 w-4" /> Back to ScamFind</Link>
      </main>
    </div>
  );
}
