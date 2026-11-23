import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describePurchase, type FeedbackTone, type PurchaseState } from '../purchase-state';

const TONE_STYLES: Record<FeedbackTone, { container: string; badge: string; Icon: LucideIcon }> = {
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    badge: 'bg-emerald-600',
    Icon: CheckCircle2,
  },
  info: {
    container: 'border-violet-200 bg-violet-50 text-violet-950',
    badge: 'bg-primary',
    Icon: Info,
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 text-amber-950',
    badge: 'bg-amber-500',
    Icon: AlertTriangle,
  },
  error: {
    container: 'border-rose-200 bg-rose-50 text-rose-950',
    badge: 'bg-rose-600',
    Icon: XCircle,
  },
};

/** Result banner for the purchase attempt. The live region announces changes to screen readers. */
export function PurchaseFeedback({ state }: { state: PurchaseState }) {
  const feedback = describePurchase(state);
  const style = feedback && TONE_STYLES[feedback.tone];
  const Icon = state.phase === 'pending' ? Loader2 : style?.Icon;

  return (
    <div aria-live="polite" aria-atomic="true">
      {feedback && style && Icon && (
        <div
          role="status"
          className={cn('flex items-center gap-4 rounded-2xl border px-5 py-4', style.container)}
        >
          <span
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full text-white',
              style.badge,
            )}
          >
            <Icon className={cn('size-6', state.phase === 'pending' && 'animate-spin')} aria-hidden />
          </span>
          <div>
            <p className="text-lg font-semibold">{feedback.title}</p>
            <p className="text-sm opacity-90">{feedback.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
