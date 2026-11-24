import {
  FINAL_PURCHASE_STATUSES,
  type PurchaseRequestResponse,
  type PurchaseStatus,
} from '@flash-sale-demo/shared-types';
import { Injectable, type MessageEvent } from '@nestjs/common';
import { Observable, filter, of } from 'rxjs';
import { purchaseResultMessageSchema } from '../../common/messages/purchase-result.message';
import { PurchaseRequestStore } from '../purchase/purchase-request.store';
import { PurchaseService } from '../purchase/purchase.service';
import { PurchaseUpdatesBus } from './purchase-updates.bus';

/** Keeps proxies and load balancers from closing an idle stream. */
const HEARTBEAT_INTERVAL_MS = 15_000;
/** Upper bound per stream; EventSource reconnects automatically if the result is still pending. */
const MAX_STREAM_DURATION_MS = 60_000;

const isFinal = (status: PurchaseStatus) => FINAL_PURCHASE_STATUSES.includes(status);

@Injectable()
export class NotificationService {
  constructor(
    private readonly purchases: PurchaseService,
    private readonly store: PurchaseRequestStore,
    private readonly bus: PurchaseUpdatesBus,
  ) {}

  async handleResult(body: unknown): Promise<void> {
    const result = purchaseResultMessageSchema.parse(body);
    const update: PurchaseRequestResponse = {
      purchaseRequestId: result.purchaseRequestId,
      flashSaleId: result.flashSaleId,
      userId: result.userId,
      status: result.status,
      updatedAt: result.processedAt,
    };
    await this.store.save(update);
    await this.bus.publish(update);
  }

  async watch(flashSaleId: string, purchaseRequestId: string): Promise<Observable<MessageEvent>> {
    const current = await this.purchases.findById(flashSaleId, purchaseRequestId);
    if (isFinal(current.status)) return of(statusEvent(current));

    return new Observable<MessageEvent>((stream) => {
      const send = (request: PurchaseRequestResponse) => {
        stream.next(statusEvent(request));
        if (isFinal(request.status)) stream.complete();
      };

      send(current);

      const updates = this.bus.updates$
        .pipe(filter((update) => update.purchaseRequestId === purchaseRequestId))
        .subscribe({ next: send, complete: () => stream.complete() });

      this.purchases
        .findById(flashSaleId, purchaseRequestId)
        .then((latest) => isFinal(latest.status) && send(latest))
        .catch(() => undefined);

      const heartbeat = setInterval(
        () => stream.next({ type: 'heartbeat', data: {} }),
        HEARTBEAT_INTERVAL_MS,
      );

      const timeout = setTimeout(() => stream.complete(), MAX_STREAM_DURATION_MS);

      return () => {
        updates.unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(timeout);
      };
    });
  }
}

function statusEvent(request: PurchaseRequestResponse): MessageEvent {
  return { type: 'status', data: request };
}
