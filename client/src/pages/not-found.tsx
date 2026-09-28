import { Link } from 'wouter';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-sm border border-border bg-card p-8 text-center" data-testid="page-not-found">
        <Compass size={28} className="mx-auto text-primary" />
        <h1 className="mt-4 font-display text-2xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-sm text-muted-foreground">That page does not exist in DDD Studio.</p>
        <Link href="/" className="mt-6 inline-flex bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Back to the domain map
        </Link>
      </div>
    </div>
  );
}
