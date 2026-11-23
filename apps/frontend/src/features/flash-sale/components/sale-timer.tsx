import { SaleStatus } from '@flash-sale-demo/shared-types';
import { Fragment } from 'react';
import { splitDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FlashSale } from '../api';
import { SALE_STATUS_META } from '../sale-status-meta';

const STATUS_HEADLINE: Record<SaleStatus, string> = {
  [SaleStatus.UPCOMING]: 'Upcoming',
  [SaleStatus.ACTIVE]: 'Active',
  [SaleStatus.SOLD_OUT]: 'Sold out',
  [SaleStatus.ENDED]: 'Ended',
};

/** Sale status on the left, countdown (to start or to end) on the right. */
export function SaleTimer({ sale, now }: { sale: FlashSale; now: number }) {
  const countdownTarget =
    sale.status === SaleStatus.UPCOMING
      ? { label: 'Sale starts in', at: Date.parse(sale.startsAt) }
      : sale.status === SaleStatus.ACTIVE
        ? { label: 'Sale ends in', at: Date.parse(sale.endsAt) }
        : null;

  return (
    <div className="grid overflow-hidden rounded-2xl border bg-violet-50 sm:grid-cols-[auto_1fr]">
      <div className="space-y-1 bg-white/60 px-6 py-5">
        <p className="text-sm font-medium text-muted-foreground">Sale Status</p>
        <p className="flex items-center gap-2 text-3xl font-bold text-primary">
          <span
            className={cn('size-3 rounded-full', SALE_STATUS_META[sale.status].dotClass)}
            aria-hidden
          />
          {STATUS_HEADLINE[sale.status]}
        </p>
        {countdownTarget && (
          <p className="text-sm text-muted-foreground">{countdownTarget.label}:</p>
        )}
      </div>
      <div className="flex items-center justify-center px-4 py-5">
        {countdownTarget ? (
          <Countdown remainingMs={countdownTarget.at - now} />
        ) : (
          <p className="text-muted-foreground">
            {sale.status === SaleStatus.SOLD_OUT
              ? 'Every item has been claimed.'
              : 'This sale has ended.'}
          </p>
        )}
      </div>
    </div>
  );
}

function Countdown({ remainingMs }: { remainingMs: number }) {
  const { days, hours, minutes, seconds } = splitDuration(remainingMs);
  const units = [
    { label: 'Days', value: days },
    { label: 'Hours', value: hours },
    { label: 'Minutes', value: minutes },
    { label: 'Seconds', value: seconds },
  ];

  return (
    <div role="timer" className="flex items-start gap-2 sm:gap-4">
      {units.map((unit, i) => (
        <Fragment key={unit.label}>
          {i > 0 && <span className="pt-1 text-2xl font-semibold text-primary/60">:</span>}
          <div className="flex min-w-12 flex-col items-center">
            <span className="text-3xl font-bold tabular-nums text-primary sm:text-4xl">
              {String(unit.value).padStart(2, '0')}
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">{unit.label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
