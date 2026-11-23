import { SaleStatus } from '@flash-sale-demo/shared-types';

export interface SaleWindow {
  startsAt: Date;
  endsAt: Date;
}

/** Inclusive start, exclusive end: [startsAt, endsAt). */
export function isWithinWindow(sale: SaleWindow, at: Date): boolean {
  return at >= sale.startsAt && at < sale.endsAt;
}

export function deriveSaleStatus(
  sale: SaleWindow & { remainingStock: number },
  now: Date,
): SaleStatus {
  if (now < sale.startsAt) return SaleStatus.UPCOMING;
  if (now >= sale.endsAt) return SaleStatus.ENDED;
  if (sale.remainingStock <= 0) return SaleStatus.SOLD_OUT;
  return SaleStatus.ACTIVE;
}
