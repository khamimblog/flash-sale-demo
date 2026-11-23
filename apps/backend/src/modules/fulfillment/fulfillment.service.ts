import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import { purchaseRequestMessageSchema } from '../../common/messages/purchase-request.message';
import type { PurchaseResultMessage } from '../../common/messages/purchase-result.message';
import { QueuePublisher } from '../../infrastructure/queue/queue-publisher';
import { SaleAvailabilityStore } from '../sale/sale-availability.store';
import { FulfillmentRepository } from './fulfillment.repository';

@Injectable()
export class FulfillmentService {
  private readonly resultsQueueUrl: string;

  constructor(
    private readonly repository: FulfillmentRepository,
    private readonly availability: SaleAvailabilityStore,
    private readonly publisher: QueuePublisher,
    config: ConfigService<Env, true>,
  ) {
    this.resultsQueueUrl = config.get('PURCHASE_RESULTS_QUEUE_URL', { infer: true });
  }

  /**
   * Handles one purchase-request message. Any thrown error leaves the message on the
   * queue for retry; because `fulfill` is idempotent, a retry after a partial failure
   * (e.g. committed but not yet published) simply republishes the same result.
   * Malformed messages fail validation on every attempt and end up in the DLQ.
   */
  async handle(body: unknown): Promise<void> {
    const request = purchaseRequestMessageSchema.parse(body);

    const outcome = await this.repository.fulfill(request);
    if (outcome.soldOut) {
      await this.availability.markSoldOut(request.flashSaleId);
    }

    const result: PurchaseResultMessage = {
      purchaseRequestId: request.purchaseRequestId,
      flashSaleId: request.flashSaleId,
      userId: request.userId,
      status: outcome.status,
      processedAt: new Date().toISOString(),
    };
    await this.publisher.publish(this.resultsQueueUrl, result);
  }
}
