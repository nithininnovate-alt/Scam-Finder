import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useUser } from '@clerk/react';
import {
  ScanSearch, History, FolderKanban, LifeBuoy, Plug, Menu, X, Lock, LayoutDashboard, ShieldCheck, LogOut, LogIn, UserPlus, Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccount } from '@/lib/auth';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

type NavItem = { href: string; label: string; icon: typeof Home };

const PERSONAL: NavItem[] = [
  { href: '/dashboard', label: 'My dashboard', icon: LayoutDashboard },
  { href: '/check', label: 'Check an offer', icon: ScanSearch },
  { href: '/history', label: 'History', icon: History },
  { href: '/cases', label: 'Cases', icon: FolderKanban },
];
const GUIDE: NavItem[] = [
  { href: '/resources', label: 'Verify & report', icon: LifeBuoy },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-[hsl(38_82%_58%)]">
        <span className="h-3.5 w-3.5 rounded-full border-[2.5px] border-[hsl(194_45%_17%)]" />
        <span className="absolute bottom-[7px] right-[7px] h-[3px] w-2 rotate-45 rounded bg-[hsl(194_45%_17%)]" />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">ScamFind</span>
    </span>
  );
}

function NavGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  const [loc] = useLocation();
  return (
    <div>
      <div className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/40">{title}</div>
      <nav className="flex flex-col gap-0.5">
        {items.map((n) => {
          const active = n.href === '/' ? loc === '/' : loc === n.href || loc.startsWith(n.href + '/') || (n.href === '/history' && loc.startsWith('/scans/'));
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              data-testid={`link-nav-${n.href.replace('/', '') || 'home'}`}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )}
            >
              <n.icon className={cn('h-4 w-4 transition-transform group-hover:scale-110', active && 'text-sidebar-primary')} />
              {n.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { signedIn, data: account } = useAccount();
  if (!signedIn) {
    return (
      <div className="space-y-6">
        <NavGroup title="ScamFind" items={[{ href: '/', label: 'Home', icon: Home }]} onNavigate={onNavigate} />
        <NavGroup title="Guidance" items={GUIDE} onNavigate={onNavigate} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <NavGroup title="Personal" items={PERSONAL} onNavigate={onNavigate} />
      {account?.role === 'admin' && <NavGroup title="Review desk" items={[{ href: '/admin', label: 'Admin dashboard', icon: ShieldCheck }, { href: '/integrations', label: 'Integrations', icon: Plug }]} onNavigate={onNavigate} />}
      <NavGroup title="Guidance" items={GUIDE} onNavigate={onNavigate} />
    </div>
  );
}

function initials(s: string) {
  return s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'SF';
}

function AccountCard() {
  const { signedIn, data: account } = useAccount();
  const { user } = useUser();
  const { signOut } = useClerk();
  if (!signedIn) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-sidebar-border p-3.5 text-xs leading-relaxed text-sidebar-foreground/65">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-sidebar-foreground/90"><Lock className="h-3.5 w-3.5" /> Your account, any device</div>
          Sign in to save checks and cases to your account, encrypted at rest.
        </div>
        <Link href="/sign-up" className="flex items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2.5 text-sm font-medium text-sidebar-primary-foreground hover:opacity-95" data-testid="link-sidebar-signup"><UserPlus className="h-4 w-4" /> Create account</Link>
        <Link href="/sign-in" className="flex items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2.5 text-sm hover:bg-sidebar-accent" data-testid="link-sidebar-signin"><LogIn className="h-4 w-4" /> Sign in</Link>
      </div>
    );
  }
  const name = account?.name || user?.fullName || user?.firstName || 'Your account';
  const email = account?.email || user?.primaryEmailAddress?.emailAddress || '';
  return (
    <div className="rounded-xl border border-sidebar-border p-3" data-testid="card-account">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-primary font-mono text-xs font-semibold text-sidebar-primary-foreground">{initials(name || email)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" data-testid="text-account-name">{name}</div>
          <div className="truncate text-xs text-sidebar-foreground/60" data-testid="text-account-email">{email}</div>
        </div>
        {account?.role === 'admin' && <span className="rounded bg-sidebar-primary/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sidebar-primary">admin</span>}
      </div>
      <button
        onClick={() => void signOut({ redirectUrl: basePath || '/' })}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        data-testid="button-logout"
      >
        <LogOut className="h-3.5 w-3.5" /> Log out
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-[100dvh] md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between overflow-y-auto bg-sidebar p-5 text-sidebar-foreground md:flex">
        <div className="space-y-8">
          <Link href="/" data-testid="link-logo"><Logo /></Link>
          <Nav />
        </div>
        <AccountCard />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <Link href="/" data-testid="link-logo-mobile"><Logo /></Link>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 hover:bg-sidebar-accent" aria-label="Toggle navigation" data-testid="button-menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[56px] z-20 max-h-[calc(100dvh-56px)] space-y-5 overflow-y-auto bg-sidebar p-4 text-sidebar-foreground shadow-xl md:hidden rise">
          <Nav onNavigate={() => setOpen(false)} />
          <AccountCard />
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 md:py-12">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 rise md:flex-row md:items-end md:justify-between">
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary/70">{eyebrow}</div>
        <h1 className="text-3xl font-semibold leading-tight md:text-[2.6rem]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
