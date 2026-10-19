import type { Scan } from '@workspace/api-client-react';

export type Tone = 'safe' | 'caution' | 'alert' | 'unknown';

export function verdictTone(verdict: string): Tone {
  if (verdict === 'Likely genuine') return 'safe';
  if (verdict === 'Suspicious') return 'caution';
  if (verdict === 'Likely scam') return 'alert';
  return 'unknown';
}

export function scoreTone(score: number): Tone {
  if (score >= 55) return 'alert';
  if (score >= 25) return 'caution';
  return 'safe';
}

export const toneText: Record<Tone, string> = {
  safe: 'text-safe',
  caution: 'text-caution',
  alert: 'text-alert',
  unknown: 'text-unknown',
};
export const toneSoft: Record<Tone, string> = {
  safe: 'bg-safe-soft text-safe',
  caution: 'bg-caution-soft text-caution',
  alert: 'bg-alert-soft text-alert',
  unknown: 'bg-unknown-soft text-unknown',
};
export const toneSolid: Record<Tone, string> = {
  safe: 'bg-safe',
  caution: 'bg-caution',
  alert: 'bg-alert',
  unknown: 'bg-unknown',
};

export const verdictPlain: Record<string, string> = {
  'Likely genuine': 'Few warning patterns found. That alone does not prove the offer is real, so still verify it independently.',
  Suspicious: 'Some patterns match known recruitment scams. Pause before sharing documents or money and verify through official channels.',
  'Likely scam': 'Several strong warning patterns appear together. Do not pay, share IDs or bank details until you have verified this independently.',
  'Insufficient data': 'There is not enough content to judge. Try pasting the full message including the sender and any links.',
};

export const statusLabel: Record<string, string> = {
  new: 'New',
  triaged: 'Reviewing',
  escalated: 'Escalated',
  closed: 'Closed',
};

export function utc(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function shortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relative(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Minimal RFC4180 CSV parser */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const s = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function csvCell(v: string | number): string {
  const original = String(v ?? '');
  const s = typeof v === 'string' && /^[\s]*[=+@-]/.test(original) ? `'${original}` : original;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function scansToCsv(scans: Scan[]): string {
  const head = ['id', 'title', 'sender', 'verdict', 'score', 'confidence', 'status', 'createdAt', 'signals'];
  const lines = scans.map((s) =>
    [s.id, s.title, s.sender, s.verdict, s.score, s.confidence, s.status, s.createdAt, s.signals.map((g) => g.title).join('; ')]
      .map(csvCell)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { data?: { error?: string; message?: string }; message?: string };
    return anyE.data?.error || anyE.data?.message || anyE.message || 'Something went wrong';
  }
  return 'Something went wrong';
}

export const MAX_CHARS = 200_000;
export const MAX_FILE = 1024 * 1024;
