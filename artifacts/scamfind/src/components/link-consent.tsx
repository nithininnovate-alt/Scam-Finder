import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export function LinkConsent({ checked, onChange, id = 'check-links', disabled, className }: { checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean; className?: string }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border border-dashed bg-background/50 p-3.5', checked && 'border-solid border-primary/40 bg-secondary/50', className)}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" data-testid={`checkbox-${id}`} />
      <label htmlFor={id} className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
        <span className="block text-sm font-medium text-foreground">Also look up links against Google Web Risk <span className="font-normal text-muted-foreground">(optional, off by default)</span></span>
        Up to 5 public http(s) links found in the offer are shared with Google Web Risk, with query strings and fragments removed. The message text and any document are never shared. ScamFind only asks Google's list; it never visits the links itself. Some links may be skipped, and "not listed" is not proof a link is safe.
      </label>
    </div>
  );
}
