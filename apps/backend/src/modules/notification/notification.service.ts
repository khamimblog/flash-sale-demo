import {
  FINAL_PURCHASE_STATUSES,
  type PurchaseRequestResponse,
  type PurchaseStatus,
} from '@flash-sale-demo/shared-types';
import { Injectable, type MessageEvent } from '@nestjs/common';
import {
  EMPTY,
  Subject,
  catchError,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  interval,
  map,
  merge,
  of,
  startWith,
  takeUntil,
  takeWhile,
  timer,
  type Observable,
} from 'rxjs';
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

  /**
   * Handles one message from the purchase-results queue: record the final status
   * (so polling and late subscribers see it), then notify live subscribers.
   * Both steps are idempotent, so SQS redelivery is harmless.
   */
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

  /**
   * SSE stream for one purchase request: the current status first, then changes,
   * completing once the status is final. Throws 404 before the stream opens if the
   * request does not exist.
   */
  async watch(flashSaleId: string, purchaseRequestId: string): Promise<Observable<MessageEvent>> {
    const current = await this.purchases.findById(flashSaleId, purchaseRequestId);
    if (isFinal(current.status)) return of(statusEvent(current));

    const updates$ = this.bus.updates$.pipe(
      filter((update) => update.purchaseRequestId === purchaseRequestId),
    );
    // Read again after subscribing to updates, so a result that landed between the
    // first read and the subscription is not missed.
    const reread$ = defer(() => this.purchases.findById(flashSaleId, purchaseRequestId)).pipe(
      catchError(() => EMPTY),
    );

    const done$ = new Subject<void>();
    const status$ = merge(updates$, reread$).pipe(
      startWith(current),
      distinctUntilChanged((a, b) => a.status === b.status),
      takeWhile((request) => !isFinal(request.status), true),
      takeUntil(timer(MAX_STREAM_DURATION_MS)),
      finalize(() => done$.next()),
      map(statusEvent),
    );
    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      takeUntil(done$),
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(status$, heartbeat$);
  }
}

function statusEvent(request: PurchaseRequestResponse): MessageEvent {
  return { type: 'status', data: request };
}
