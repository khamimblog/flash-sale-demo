import {
  FINAL_PURCHASE_STATUSES,
  type PurchaseRequestResponse,
  type PurchaseStatus,
} from '@flash-sale-demo/shared-types';
import { fetchPurchaseRequest, purchaseEventsUrl } from './api';

export const isFinalStatus = (status: PurchaseStatus) => FINAL_PURCHASE_STATUSES.includes(status);

const POLL_INTERVAL_MS = 2_000;

/**
 * Follows a purchase request until its status is final, then stops.
 *
 * Uses Server-Sent Events. EventSource reconnects by itself after transient drops
 * (and after the server's periodic stream rotation). If the stream cannot be used
 * at all (readyState CLOSED), it falls back to polling the status endpoint.
 *
 * Returns an unsubscribe function.
 */
export function watchPurchaseRequest(
  saleId: string,
  purchaseRequestId: string,
  onUpdate: (request: PurchaseRequestResponse) => void,
): () => void {
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const deliver = (request: PurchaseRequestResponse) => {
    if (stopped) return;
    onUpdate(request);
    if (isFinalStatus(request.status)) stop();
  };

  const poll = async () => {
    try {
      deliver(await fetchPurchaseRequest(saleId, purchaseRequestId));
    } catch {
      // Transient failure; try again on the next tick.
    }
    if (!stopped) pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  const source = new EventSource(purchaseEventsUrl(saleId, purchaseRequestId));
  source.addEventListener('status', (event) => {
    deliver(JSON.parse((event as MessageEvent<string>).data) as PurchaseRequestResponse);
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED && !stopped && !pollTimer) void poll();
  };

  function stop() {
    stopped = true;
    source.close();
    clearTimeout(pollTimer);
  }

  return stop;
}
