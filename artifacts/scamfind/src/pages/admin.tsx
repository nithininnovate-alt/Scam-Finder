import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  useGetAdminSummary, getGetAdminSummaryQueryKey, useListAdminUsers, getListAdminUsersQueryKey,
  useListAdminScans, getListAdminScansQueryKey, type AdminCase,
} from '@workspace/api-client-react';
import { Search, Users, FolderKanban, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shell';
import { EmptyPanel, ErrorPanel, StatusPill, VerdictBadge } from '@/components/scan-bits';
import { useTitle } from '@/lib/auth';
import { relative, shortDate } from '@/lib/scan-utils';
import { cn } from '@/lib/utils';

const POLL = { staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true };

function CaseRow({ c }: { c: AdminCase }) {
  const overdue = c.scan.dueAt && c.scan.status !== 'closed' && new Date(c.scan.dueAt).getTime() < Date.now();
  return (
    <Link href={`/admin/scans/${c.scan.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/50 md:grid-cols-[1.4fr_1fr_auto_auto]" data-testid={`link-admin-case-${c.scan.id}`}>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{c.scan.title || 'Untitled offer'}</div>
        <div className="truncate text-xs text-muted-foreground">{relative(c.scan.createdAt)}{c.scan.dueAt ? ` · due ${shortDate(c.scan.dueAt)}` : ''}{overdue && <span className="ml-1 text-alert">overdue</span>}</div>
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="truncate text-sm">{c.ownerName || 'Unnamed'}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{c.ownerEmail}</div>
      </div>
      <div className="hidden md:block"><StatusPill status={c.scan.status} /></div>
      <VerdictBadge verdict={c.scan.verdict} />
    </Link>
  );
}

function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" data-testid={id} />
    </div>
  );
}

function CasesTab() {
  const { data, isLoading, isError, refetch } = useListAdminScans({ query: { queryKey: getListAdminScansQueryKey(), ...POLL } });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('all');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((c) =>
      (status === 'all' || c.scan.status === status) &&
      (!t || [c.scan.title, c.scan.sender, c.scan.domain, c.ownerName, c.ownerEmail, c.scan.id].some((v) => v?.toLowerCase().includes(t))));
  }, [data, q, status]);
  if (isLoading) return <Skeleton className="h-80 rounded-2xl" />;
  if (isError || !data) return <ErrorPanel title="Cases didn't load" onRetry={() => refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder="Search title, sender, owner or report ID" id="input-admin-case-search" /></div>
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {['all', 'new', 'triaged', 'escalated', 'closed'].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cn('rounded-md px-3 py-1.5 text-xs capitalize', status === s ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')} data-testid={`button-filter-${s}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyPanel icon={<FolderKanban className="h-5 w-5" />} title={data.length === 0 ? 'No account-owned cases yet' : 'No cases match'} body={data.length === 0 ? 'When signed-in users check offers, their cases appear here for review.' : 'Try a different search or status filter.'} /></div>
        ) : (
          <div className="divide-y">{rows.map((c) => <CaseRow key={c.scan.id} c={c} />)}</div>
        )}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{rows.length} of {data.length} cases · refreshes every 30s</p>
    </div>
  );
}

function UsersTab() {
  const { data, isLoading, isError, refetch } = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey(), ...POLL } });
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((u) => !t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
  }, [data, q]);
  if (isLoading) return <Skeleton className="h-80 rounded-2xl" />;
  if (isError || !data) return <ErrorPanel title="Users didn't load" onRetry={() => refetch()} />;
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder="Search name or email" id="input-admin-user-search" />
      <div className="overflow-hidden rounded-2xl border bg-card">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyPanel icon={<Users className="h-5 w-5" />} title={data.length === 0 ? 'No accounts yet' : 'No users match'} body={data.length === 0 ? 'Accounts appear here after people sign up.' : 'Try another name or email.'} /></div>
        ) : (
          <div className="divide-y">
            {rows.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3" data-testid={`row-user-${u.id}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px]">{(u.name || u.email).slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.name || 'Unnamed'}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{u.email}</div>
                </div>
                <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider', u.role === 'admin' ? 'bg-accent/25 text-foreground' : 'bg-secondary text-muted-foreground')}>{u.role}</span>
                <span className="hidden w-28 text-right text-xs text-muted-foreground sm:block">joined {shortDate(u.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Roles are assigned on the server. This view is read-only.</p>
    </div>
  );
}

export default function AdminPage() {
  useTitle('Admin dashboard');
  const { data, isLoading, isError, refetch } = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey(), ...POLL } });
  return (
    <>
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-xs rise" data-testid="banner-admin-scope">
        <ShieldCheck className="h-4 w-4 text-caution" />
        <span><strong className="font-medium">Review desk — system-wide view.</strong> Account-owned cases only; anonymous legacy material is not shown. Your changes are recorded under your name.</span>
      </div>
      <PageHeader eyebrow="Admin" title={<>Every open thread, <span className="italic text-primary">in one place.</span></>} />
      {isLoading ? (
        <Skeleton className="mb-8 h-28 rounded-2xl" />
      ) : isError || !data ? (
        <div className="mb-8"><ErrorPanel title="Summary didn't load" onRetry={() => refetch()} /></div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3 lg:grid-cols-6 rise">
          {[
            { k: 'Users', v: data.users },
            { k: 'Checks', v: data.total },
            { k: 'Flagged', v: data.flagged },
            { k: 'Open cases', v: data.openCases },
            { k: 'Escalated', v: data.escalated, tone: 'text-caution' },
            { k: 'Overdue', v: data.overdue, tone: data.overdue > 0 ? 'text-alert' : '' },
          ].map((s) => (
            <div key={s.k} className="bg-card p-5">
              <div className={cn('font-display text-3xl font-semibold', s.tone)} data-testid={`stat-admin-${s.k.toLowerCase().replace(/ /g, '-')}`}>{s.v}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.k}</div>
            </div>
          ))}
        </div>
      )}
      {data && data.recent.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-2xl border bg-card rise">
          <div className="border-b px-5 py-3.5 font-medium">Latest activity</div>
          <div className="divide-y">{data.recent.slice(0, 5).map((c) => <CaseRow key={c.scan.id} c={c} />)}</div>
        </div>
      )}
      <Tabs defaultValue="cases">
        <TabsList className="mb-5">
          <TabsTrigger value="cases" data-testid="tab-admin-cases">Cases</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-admin-users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="cases"><CasesTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
      </Tabs>
    </>
  );
}
