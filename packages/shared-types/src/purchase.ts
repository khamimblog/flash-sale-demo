export const PurchaseStatus = {
  /** Accepted and queued; the worker has not decided yet. */
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  SOLD_OUT: 'SOLD_OUT',
  SALE_NOT_ACTIVE: 'SALE_NOT_ACTIVE',
  FAILED: 'FAILED',
} as const;
export type PurchaseStatus = (typeof PurchaseStatus)[keyof typeof PurchaseStatus];

export const FINAL_PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  PurchaseStatus.SUCCESS,
  PurchaseStatus.ALREADY_PURCHASED,
  PurchaseStatus.SOLD_OUT,
  PurchaseStatus.SALE_NOT_ACTIVE,
  PurchaseStatus.FAILED,
];

/** Body of `POST /api/flash-sales/:saleId/purchase-requests`. */
export interface CreatePurchaseRequestBody {
  userId: string;
}

/**
 * Returned by:
 * - `POST /api/flash-sales/:saleId/purchase-requests` (202 new, 200 existing for this user)
 * - `GET  /api/flash-sales/:saleId/purchase-requests/:id`
 * - `GET  /api/flash-sales/:saleId/purchase-requests?userId=`
 */
export interface PurchaseRequestResponse {
  purchaseRequestId: string;
  flashSaleId: string;
  userId: string;
  status: PurchaseStatus;
  updatedAt: string;
}

/** Body of a 409 from `POST .../purchase-requests` when the request is rejected up front. */
export interface PurchaseRejectedResponse {
  status: typeof PurchaseStatus.SOLD_OUT | typeof PurchaseStatus.SALE_NOT_ACTIVE;
  message: string;
}
