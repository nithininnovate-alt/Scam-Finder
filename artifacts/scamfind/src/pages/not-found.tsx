import { useTitle } from '@/lib/auth';
import { Link } from 'wouter';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyPanel } from '@/components/scan-bits';

export default function NotFound() {
  useTitle('Not found');
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyPanel
        icon={<Compass className="h-5 w-5" />}
        title="This page doesn't exist"
        body="The link may be mistyped, or a report may have been deleted or expired."
        action={<Button asChild><Link href="/" data-testid="link-home">Back to ScamFind</Link></Button>}
      />
    </div>
  );
}
