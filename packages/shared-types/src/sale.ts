export const SaleStatus = {
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  SOLD_OUT: 'SOLD_OUT',
  ENDED: 'ENDED',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export interface ProductResponse {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Decimal string, e.g. "79.00", to avoid floating-point money. */
  price: string;
}

/** Response of `GET /api/flash-sales/current` and `GET /api/flash-sales/:id`. Dates are ISO-8601. */
export interface FlashSaleResponse {
  id: string;
  status: SaleStatus;
  product: ProductResponse;
  startsAt: string;
  endsAt: string;
  totalStock: number;
  /** Approximate: cached for about a second. The database is the source of truth. */
  remainingStock: number;
  /** Lets the client correct for its own clock skew when rendering countdowns. */
  serverTime: string;
}
