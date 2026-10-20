import { useTitle } from '@/lib/auth';
import { useRef, useState, type DragEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateScan,
  useUploadPdfScan,
  useGetSummary,
  getGetSummaryQueryKey,
  getListScansQueryKey,
  type Scan,
} from '@workspace/api-client-react';
import { ArrowRight, FileUp, Loader2, ShieldCheck, Sparkles, Table2, Download, X, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shell';
import { ErrorPanel, ScoreBar, VerdictBadge } from '@/components/scan-bits';
import { MAX_CHARS, MAX_FILE, download, errorMessage, parseCsv, relative, scansToCsv } from '@/lib/scan-utils';
import { cn } from '@/lib/utils';
import { LinkConsent } from '@/components/link-consent';

const MAX_PDF = 5 * 1024 * 1024;

const SAMPLES = [
  {
    label: 'Upfront “training fee” offer',
    title: 'Data Entry Associate — work from home',
    sender: 'hr.globalcareers2024@gmail.com',
    text: `Dear Candidate,

Congratulations! You have been shortlisted for the post of Data Entry Associate (Work From Home) with a salary of Rs 48,500 per month. No interview required.

To confirm your seat, please pay a refundable training and laptop security deposit of Rs 3,999 via UPI to careers.hrdesk@okaxis within 24 hours. Seats are limited and the offer will be cancelled after the deadline.

Kindly share your Aadhaar, PAN and bank account details on WhatsApp +91 98XXX XXX12 for onboarding.

Regards,
Priya Menon
HR Recruitment Cell`,
  },
  {
    label: 'Ordinary recruiter follow-up',
    title: 'Interview scheduling — Product Analyst',
    sender: 'talent@lumenfield.io',
    text: `Hi Arjun,

Thanks for applying to the Product Analyst role at Lumenfield. We'd like to schedule a 45-minute video interview with our analytics lead, Tomás Reyes.

Could you share two or three slots that work for you next week? The interview will cover a short case discussion; no preparation materials are required.

You can find the full job description on our careers page, and feel free to reply with any questions.

Best,
Hana Kobayashi
Talent Partner, Lumenfield`,
  },
  {
    label: 'Cheque-and-equipment pattern',
    title: 'Remote Administrative Assistant',
    sender: 'recruit@northwind-staffing-jobs.net',
    text: `Hello,

After reviewing your resume on an online job board we are pleased to offer you the Remote Administrative Assistant position ($34/hr). Interviews are held by text chat on Telegram only.

We will mail you a cheque for $2,850 to purchase your home-office equipment from our approved vendor. Deposit the cheque and send the balance by gift cards or crypto to the vendor so they can ship today.

This is urgent. Reply immediately to secure the role.`,
  },
];

type Mode = 'paste' | 'upload';

function SingleForm() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const createScan = useCreateScan();
  const uploadPdf = useUploadPdfScan();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [localOcr, setLocalOcr] = useState(false);
  const [checkLinks, setCheckLinks] = useState(false);
  const [text, setText] = useState('');
  const [sender, setSender] = useState('');
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('paste');
  const [sample, setSample] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const over = text.length > MAX_CHARS;
  const pending = createScan.isPending || uploadPdf.isPending;
  const canSubmit = (pdfFile ? true : text.trim().length > 0 && !over) && !pending;

  async function readFile(f: File) {
    if (pending) return;
    setLocalOcr(false);
    setErr(null);
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') {
      if (f.size > MAX_PDF) { setErr('That PDF is over 5 MB. Try exporting only the offer pages.'); return; }
      setPdfFile(f);
      setText('');
      setFileName(f.name);
      setMode('upload');
      setSample(null);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
      return;
    }
    if (!["txt", "html", "eml"].includes(ext ?? '')) {
      setErr(ext === 'msg' ? 'Outlook .msg files are not supported yet. Save the message as .eml or paste its text.' : 'Supported files: .pdf, .txt, .html, .eml');
      return;
    }
    if (f.size > MAX_FILE) {
      setErr('That file is over 1 MB. Try pasting the relevant part instead.');
      return;
    }
    const content = await f.text();
    setPdfFile(null);
    setText(content);
    setFileName(f.name);
    setMode('upload');
    setSample(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  }

  function applySample(s: (typeof SAMPLES)[number]) {
    setLocalOcr(false);
    setText(s.text);
    setSender(s.sender);
    setTitle(s.title);
    setFileName(null);
    setPdfFile(null);
    setMode('paste');
    setSample(s.label);
    setErr(null);
  }

  function clear() {
    setLocalOcr(false);
    setText('');
    setSender('');
    setTitle('');
    setFileName(null);
    setPdfFile(null);
    setCheckLinks(false);
    setSample(null);
    setMode('paste');
    setErr(null);
  }

  async function submit() {
    setErr(null);
    try {
      const scan = pdfFile
        ? await uploadPdf.mutateAsync({ data: { file: pdfFile, sender: sender.trim() || undefined, title: title.trim() || undefined, checkLinks: checkLinks ? 'true' : 'false', localOcr: localOcr ? 'true' : 'false' } })
        : await createScan.mutateAsync({
        data: {
          text,
          checkLinks,
          sender: sender.trim() || undefined,
          title: title.trim() || undefined,
          fileName: fileName ?? undefined,
          source: mode,
        },
      });
      qc.invalidateQueries({ queryKey: getListScansQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      toast({ title: 'Analysis ready', description: `${scan.verdict} — risk indicator ${scan.score}/100` });
      setLocation(`/scans/${scan.id}`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Illustrative examples — these fill the form only, they are not real scans
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s, i) => (
            <button
              key={s.label}
              onClick={() => applySample(s)}
              data-testid={`button-sample-${i}`}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary',
                sample === s.label && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              Example: {s.label}
            </button>
          ))}
        </div>
      </div>

      {pdfFile ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
          className={cn('relative overflow-hidden rounded-xl border bg-secondary/40 p-5 rise', drag && 'ring-4 ring-accent/20')} data-testid="panel-pdf-selected">
          <div className="ledger pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative flex items-start gap-4">
            <span className="grid h-12 w-10 shrink-0 place-items-center rounded-md border bg-card font-mono text-[10px] font-semibold text-alert">PDF</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm" data-testid="text-pdf-file">{pdfFile.name}</div>
              <div className="text-xs text-muted-foreground">{(pdfFile.size / 1024).toFixed(1)} KB · up to 5 MB and 20 pages</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {uploadPdf.isPending ? (localOcr ? 'Reading the text layer and running local OCR… This may take up to two minutes.' : 'Uploading and extracting the text layer on the server…') : 'The server screens the text layer. Enable local OCR below to also read scanned pages and image text. Originals are not retained. Password-protected or damaged PDFs cannot be read. This does not verify authenticity or detect malware.'}
              </p>
            </div>
            <button onClick={clear} disabled={pending} className="rounded p-1 hover:bg-background" aria-label="Remove PDF" data-testid="button-remove-pdf"><X className="h-4 w-4" /></button>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={localOcr} disabled={pending} onChange={e => setLocalOcr(e.target.checked)} className="mt-1" data-testid="checkbox-local-ocr" />
            <span>Use local OCR for this document
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Optional English text recognition for scanned or mixed PDFs. Document bytes stay inside the app; no external OCR service receives them. Temporary page images are deleted after processing. OCR may misread or miss text; check the extracted evidence. This choice resets for each new file and is separate from external link checks.</span>
            </span>
          </label>
        </div>
      ) : (
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn('relative rounded-xl border bg-background/60 transition-all focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10', drag && 'border-accent ring-4 ring-accent/20')}
      >
        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setSample(null); }}
          placeholder="Paste the full offer here — the message body, any links, and the signature. The more context, the clearer the read."
          className="min-h-[240px] resize-y border-0 bg-transparent p-4 font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
          data-testid="input-offer-text"
        />
        {drag && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-accent/10 font-display text-lg text-primary">
            Drop a .pdf, .txt, .html or .eml file
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary hover:bg-secondary"
              data-testid="button-upload"
            >
              <FileUp className="h-3.5 w-3.5" /> Upload .pdf, .txt, .html or .eml
            </button>
            <span className="hidden sm:inline">or drag a file in · PDF 5 MB, others 1 MB · .msg not supported yet</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,.txt,.html,.eml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }}
              data-testid="input-file"
            />
          </div>
          <span className={cn('font-mono', over && 'text-alert')} data-testid="text-char-count">
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>
      </div>
      )}

      {fileName && !pdfFile && (
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs rise">
          <FileText className="h-3.5 w-3.5 text-primary" />
          Loaded <span className="font-mono">{fileName}</span> as text. HTML is never run; the server strips tags and reads email headers.
          <button onClick={clear} className="ml-auto rounded p-0.5 hover:bg-background" aria-label="Remove file" data-testid="button-remove-file"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sender">Sender email <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="sender" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="recruiter@company.com" maxLength={320} data-testid="input-sender" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">Label for your records <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Analyst role via LinkedIn" maxLength={160} data-testid="input-title" />
        </div>
      </div>

      <LinkConsent checked={checkLinks} onChange={setCheckLinks} disabled={pending} />

      {err && <div className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert rise" data-testid="text-form-error">{err}</div>}
      {over && <div className="text-sm text-alert">That is over 200,000 characters. Trim it to the offer itself.</div>}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={submit} disabled={!canSubmit} className="group h-12 px-6 text-base" data-testid="button-analyse">
          {pending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {pdfFile ? 'Extracting PDF text…' : 'Reading the evidence…'}</>
          ) : (
            <>Analyse this offer <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></>
          )}
        </Button>
        {(text || pdfFile) && !pending && (
          <Button variant="ghost" onClick={clear} data-testid="button-clear">Clear</Button>
        )}
        <span className="text-xs text-muted-foreground">Text signals, available domain checks and, if ticked, link lookups. Usually a few seconds.</span>
      </div>
    </div>
  );
}

type RowResult = { row: number; title: string; status: 'pending' | 'ok' | 'error'; scan?: Scan; error?: string };

function BatchForm() {
  const qc = useQueryClient();
  const createScan = useCreateScan();
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [checkLinks, setCheckLinks] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function run(f: File) {
    setErr(null);
    if (f.size > MAX_FILE) { setErr('CSV must be 1 MB or smaller.'); return; }
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) { setErr('No data rows found. The first row must be the header: text,sender,title'); return; }
    const head = parsed[0].map((h) => h.trim().toLowerCase());
    const ti = head.indexOf('text');
    if (ti < 0) { setErr('Missing a "text" column. Expected header: text,sender,title'); return; }
    const si = head.indexOf('sender');
    const li = head.indexOf('title');
    const data = parsed.slice(1);
    const init: RowResult[] = data.map((r, i) => ({ row: i + 2, title: (li >= 0 ? r[li] : '') || `Row ${i + 2}`, status: 'pending' }));
    setRows(init);
    setRunning(true);
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const text = (r[ti] ?? '').trim();
      let res: RowResult;
      if (!text) res = { ...init[i], status: 'error', error: 'Empty text' };
      else if (text.length > MAX_CHARS) res = { ...init[i], status: 'error', error: 'Over 200,000 characters' };
      else {
        try {
          const scan = await createScan.mutateAsync({
            data: { text, sender: (si >= 0 ? r[si]?.trim() : '') || undefined, title: (li >= 0 ? r[li]?.trim() : '') || undefined, source: 'batch', checkLinks },
          });
          res = { ...init[i], status: 'ok', scan };
        } catch (e) {
          res = { ...init[i], status: 'error', error: errorMessage(e) };
        }
      }
      setRows((prev) => prev.map((p, j) => (j === i ? res : p)));
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: getListScansQueryKey() });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
  }

  const done = rows.filter((r) => r.status !== 'pending').length;
  const ok = rows.filter((r) => r.scan).map((r) => r.scan as Scan);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed bg-background/60 p-6 text-center">
        <Table2 className="mx-auto mb-2 h-6 w-6 text-primary" />
        <p className="font-medium">Check several offers at once</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Upload a CSV with a header row of <span className="font-mono text-foreground">text,sender,title</span>. Only <span className="font-mono">text</span> is required. Each row is analysed one after another.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => ref.current?.click()} disabled={running} data-testid="button-batch-upload">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            {running ? `Analysing ${done} of ${rows.length}` : 'Choose CSV'}
          </Button>
          <Button variant="outline" onClick={() => download('scamfind-template.csv', 'text,sender,title\n"Paste offer text here",recruiter@example.com,Example role\n', 'text/csv')} data-testid="button-batch-template">
            Template
          </Button>
        </div>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ''; }} data-testid="input-batch-file" />
      </div>
      <LinkConsent id="check-links-batch" checked={checkLinks} onChange={setCheckLinks} disabled={running} />
      {err && <div className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{err}</div>}
      {rows.length > 0 && (
        <div className="space-y-3 rise">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(done / rows.length) * 100}%` }} />
          </div>
          <div className="divide-y rounded-xl border bg-card">
            {rows.map((r) => (
              <div key={r.row} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid={`row-batch-${r.row}`}>
                <span className="w-12 font-mono text-xs text-muted-foreground">#{r.row}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {r.status === 'error' && <span className="text-xs text-alert">{r.error}</span>}
                {r.scan && (
                  <Link href={`/scans/${r.scan.id}`} className="flex items-center gap-3 hover:underline">
                    <ScoreBar score={r.scan.score} />
                    <VerdictBadge verdict={r.scan.verdict} />
                  </Link>
                )}
              </div>
            ))}
          </div>
          {!running && ok.length > 0 && (
            <Button variant="outline" onClick={() => download('scamfind-batch-results.csv', scansToCsv(ok), 'text/csv')} data-testid="button-batch-export">
              <Download className="mr-2 h-4 w-4" /> Export results CSV
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Overview() {
  const { data, isLoading, isError, refetch } = useGetSummary();
  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  if (isError || !data) return <ErrorPanel title="Overview unavailable" onRetry={() => refetch()} />;
  const stats = [
    { k: 'Offers checked', v: data.total },
    { k: 'Flagged', v: data.flagged },
    { k: 'Few flags', v: data.genuine },
    { k: 'Open cases', v: data.openCases },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border">
        {stats.map((s) => (
          <div key={s.k} className="bg-card p-4">
            <div className="font-display text-3xl font-semibold" data-testid={`stat-${s.k.toLowerCase().replace(/ /g, '-')}`}>{s.v}</div>
            <div className="text-xs text-muted-foreground">{s.k}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">Your recent checks</span>
          <Link href="/history" className="text-xs text-primary hover:underline" data-testid="link-all-history">All history</Link>
        </div>
        {data.recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing here yet. Your first check will appear here, saved to your account.
          </div>
        ) : (
          <div className="divide-y">
            {data.recent.slice(0, 5).map((s) => (
              <Link key={s.id} href={`/scans/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50" data-testid={`link-recent-${s.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.title || 'Untitled offer'}</div>
                  <div className="text-xs text-muted-foreground">{relative(s.createdAt)}</div>
                </div>
                <VerdictBadge verdict={s.verdict} />
              </Link>
            ))}
          </div>
        )}
        {data.total > 0 && (
          <div className="border-t px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
            avg analysis {Math.round(data.averageDurationMs)} ms
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckPage() {
  useTitle('Check an offer');
  return (
    <>
      <PageHeader eyebrow="Offer checker" title={<>Unexpected offer? <span className="italic text-primary">Let's look at it together.</span></>} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm rise sm:p-7" style={{ animationDelay: '60ms' }}>
          <Tabs defaultValue="single">
            <TabsList className="mb-6">
              <TabsTrigger value="single" data-testid="tab-single">One offer</TabsTrigger>
              <TabsTrigger value="batch" data-testid="tab-batch">Batch CSV</TabsTrigger>
            </TabsList>
            <TabsContent value="single"><SingleForm /></TabsContent>
            <TabsContent value="batch"><BatchForm /></TabsContent>
          </Tabs>
        </div>
        <aside className="space-y-6 rise" style={{ animationDelay: '140ms' }}>
          <Overview />
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
            <ShieldCheck className="mb-2 h-5 w-5 text-accent" />
            <p className="font-display text-lg leading-snug">A real employer will never ask you to pay to get hired.</p>
            <p className="mt-2 text-sm text-primary-foreground/75">Whatever the result, you can always verify through the company's own website before replying.</p>
            <Link href="/resources" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline" data-testid="link-resources-cta">
              How to verify <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ScamFind uses transparent rules, not a trained model. Link lookups with Google Web Risk run only if you opt in. Results are a risk indicator, not a probability or a guarantee.
          </p>
        </aside>
      </div>
    </>
  );
}
