import { SaleStatus } from '@flash-sale-demo/shared-types';

interface SaleStatusMeta {
  label: string;
  /** Colour of the status dot. */
  dotClass: string;
  /** Text shown on the Buy button while the sale is in this state. */
  buyLabel: string;
}

export const SALE_STATUS_META: Record<SaleStatus, SaleStatusMeta> = {
  [SaleStatus.UPCOMING]: { label: 'Upcoming', dotClass: 'bg-amber-400', buyLabel: 'Sale starts soon' },
  [SaleStatus.ACTIVE]: { label: 'Live', dotClass: 'bg-emerald-400', buyLabel: 'Buy Now' },
  [SaleStatus.SOLD_OUT]: { label: 'Sold out', dotClass: 'bg-rose-400', buyLabel: 'Sold out' },
  [SaleStatus.ENDED]: { label: 'Ended', dotClass: 'bg-slate-400', buyLabel: 'Sale ended' },
};
