import { useSyncExternalStore } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'warning';
type Toast = { id: number; message: string; tone: Tone };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a short message. Errors stay a little longer. */
export function notify(message: string, tone: Tone = 'success') {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }].slice(-4);
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, tone === 'success' ? 2600 : 6000);
}

export const notifyError = (error: unknown) => notify(error instanceof Error ? error.message : 'Something went wrong', 'error');

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts);
  return (
    <div className="pointer-events-none fixed right-5 top-20 z-50 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          data-testid={t.tone === 'error' ? 'status-toast-error' : 'status-toast'}
          className={`pointer-events-auto flex items-start gap-2 border bg-card px-4 py-3 text-sm shadow-xl animate-rise-in ${t.tone === 'error' ? 'border-destructive/40' : t.tone === 'warning' ? 'border-primary/50' : 'border-accent/30'}`}
        >
          {t.tone === 'error' ? <X size={15} className="mt-0.5 shrink-0 text-destructive" /> : t.tone === 'warning' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-primary" /> : <Check size={15} className="mt-0.5 shrink-0 text-accent" />}
          <span className="min-w-0 break-words">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
