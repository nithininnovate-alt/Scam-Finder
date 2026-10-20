import type { Scan } from '@workspace/api-client-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { defang } from '@/components/report-extras';

type Props = { checked: boolean; onChange: (value: boolean) => void; phrase?: string; onPhraseChange?: (value: string) => void; disabled?: boolean; batch?: boolean };

export function TextSearchConsent({ checked, onChange, phrase, onPhraseChange, disabled, batch }: Props) {
  const id = batch ? 'check-search-batch' : 'check-search';
  return (
    <div className="min-w-0 rounded-xl border bg-card/70 p-4 [overflow-wrap:anywhere]">
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={value => onChange(value === true)} disabled={disabled} className="mt-0.5" data-testid={id} />
        <div className="min-w-0">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">Optional: search a reviewed phrase for text reuse</Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Only your selected phrase is sent to SerpAPI and Google—not the offer or PDF. Remove names, personal or confidential details before sharing.
            Matching pages do not prove fraud; no matches do not prove safety. This does not affect the risk score.
          </p>
        </div>
      </div>
      {checked && (batch ? (
        <p className="mt-3 text-xs text-muted-foreground">Add an optional <code>search_phrase</code> CSV column and review every phrase before uploading. Blank or unsuitable phrases are skipped. Each row may use one search credit.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <Label htmlFor="search-phrase" className="text-xs">Phrase you have reviewed and consent to share</Label>
          <Input id="search-phrase" value={phrase ?? ''} onChange={event => onPhraseChange?.(event.target.value)} disabled={disabled} maxLength={180} autoComplete="off" placeholder="for example: refundable training and equipment deposit" data-testid="input-search-phrase" />
          <p className="text-xs text-muted-foreground">Use 3–24 words and 15–180 characters. Numbers, email addresses and web addresses are blocked. Choose a short excerpt, not the entire offer. Up to 5 search results; search coverage is incomplete.</p>
        </div>
      ))}
    </div>
  );
}

export function TextSearchPanel({ scan }: { scan: Scan }) {
  if (scan.textSearchRequested === undefined && !scan.textSearch) return null;
  const result = scan.textSearch;
  if (!scan.textSearchRequested) return <p className="text-sm text-muted-foreground" data-testid="panel-text-search">Not requested. No phrase was shared with SerpAPI or Google.</p>;
  const labels = { matches_found: 'Possible text reuse—not proof of fraud', no_matches: 'No organic results—not proof of safety', unavailable: 'Search unavailable', skipped: 'Search skipped' };
  return (
    <div className="min-w-0 space-y-3 text-sm [overflow-wrap:anywhere]" data-testid="panel-text-search">
      <p className="font-medium" data-testid="status-text-search">{result ? labels[result.status] : 'Search unavailable'}</p>
      {result?.phrase && <blockquote className="rounded-lg bg-muted p-3" data-testid="text-searched-phrase">“{result.phrase}”</blockquote>}
      <p className="text-muted-foreground">{result?.detail ?? 'A result was not recorded. No safety conclusion was assumed.'}</p>
      {!!result?.results.length && <ol className="space-y-3">{result.results.map((hit, i) => (
        <li key={`${hit.url}-${i}`} className="rounded-lg border p-3">
          <p className="font-medium">{hit.title}</p>
          <code className="mt-1 block break-all text-xs text-muted-foreground">{defang(hit.url)}</code>
          {hit.snippet && <p className="mt-2 text-muted-foreground">{hit.snippet}</p>}
        </li>
      ))}</ol>}
      <p className="text-xs text-muted-foreground">Source: Google results via SerpAPI. Links are shown as plain text, not visited or validated. Result titles and snippets are third-party content, not findings endorsed by ScamFind.</p>
      {result?.checkedAt && <p className="text-xs text-muted-foreground">Checked {new Date(result.checkedAt).toLocaleString()}. Saved results are a snapshot, not continuous monitoring.</p>}
    </div>
  );
}
