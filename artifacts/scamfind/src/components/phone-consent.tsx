import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  batch?: boolean;
  number?: string;
  country?: string;
  onNumberChange?: (number: string) => void;
  onCountryChange?: (country: string) => void;
};

export function PhoneConsent({ checked, onChange, disabled, batch, number, country, onNumberChange, onCountryChange }: Props) {
  const id = batch ? 'check-phone-batch' : 'check-phone';
  return (
    <div className="rounded-xl border bg-card/70 p-4" data-testid={`panel-${id}`}>
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={value => onChange(value === true)} disabled={disabled} className="mt-0.5" data-testid={id} />
        <div className="min-w-0">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">Optional: check a selected phone number with Numverify</Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Only the number you select and, for local numbers, its country code are shared with Numverify. Full offers and PDFs are not sent.
            Number validity, carrier and line type do not prove recruiter identity or safety and do not change the risk score.
          </p>
        </div>
      </div>
      {checked && (batch ? (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="text-phone-csv-help">
          Add optional CSV columns <code>phone</code> and <code>country_code</code>. Each row checks only its selected number, never numbers extracted from the offer. Blank or incomplete entries are skipped. Each lookup uses the service's API allowance.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div>
            <Label htmlFor="phone-number" className="text-xs">Selected phone number</Label>
            <Input id="phone-number" type="tel" value={number ?? ''} onChange={e => onNumberChange?.(e.target.value)} disabled={disabled} maxLength={40} placeholder="+ country code and number" data-testid="input-phone-number" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="phone-country" className="text-xs">Country for local numbers</Label>
            <Input id="phone-country" value={country ?? ''} onChange={e => onCountryChange?.(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} disabled={disabled} maxLength={2} placeholder="e.g. IN or GB" data-testid="input-phone-country" className="mt-1 uppercase" />
          </div>
        </div>
      ))}
    </div>
  );
}
