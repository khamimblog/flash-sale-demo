import type {
  CreatePurchaseRequestBody,
  FlashSaleResponse,
  PurchaseRequestResponse,
} from '@flash-sale-demo/shared-types';
import { ApiError, apiRequest } from '@/lib/api-client';

export interface FlashSale extends FlashSaleResponse {
  /** serverTime − local time, measured on receipt. Add it to Date.now() for server time. */
  clockOffsetMs: number;
}

const salePath = (saleId: string) => `/api/flash-sales/${saleId}`;
const requestsPath = (saleId: string) => `${salePath(saleId)}/purchase-requests`;

export async function fetchCurrentSale(signal?: AbortSignal): Promise<FlashSale> {
  const { data } = await apiRequest<FlashSaleResponse>('/api/flash-sales/current', { signal });
  return { ...data, clockOffsetMs: Date.parse(data.serverTime) - Date.now() };
}

export async function createPurchaseRequest(
  saleId: string,
  userId: string,
): Promise<{ request: PurchaseRequestResponse; existing: boolean }> {
  const { status, data } = await apiRequest<PurchaseRequestResponse>(requestsPath(saleId), {
    method: 'POST',
    body: { userId } satisfies CreatePurchaseRequestBody,
  });
  // 202 = newly queued, 200 = this user already had a request for this sale.
  return { request: data, existing: status === 200 };
}

export async function fetchPurchaseRequest(
  saleId: string,
  purchaseRequestId: string,
): Promise<PurchaseRequestResponse> {
  const { data } = await apiRequest<PurchaseRequestResponse>(
    `${requestsPath(saleId)}/${purchaseRequestId}`,
  );
  return data;
}

/** The user's request for this sale, or null if they never tried to buy. */
export async function findPurchaseRequestByUser(
  saleId: string,
  userId: string,
): Promise<PurchaseRequestResponse | null> {
  try {
    const query = new URLSearchParams({ userId });
    const { data } = await apiRequest<PurchaseRequestResponse>(`${requestsPath(saleId)}?${query}`);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const purchaseEventsUrl = (saleId: string, purchaseRequestId: string) =>
  `${requestsPath(saleId)}/${purchaseRequestId}/events`;
