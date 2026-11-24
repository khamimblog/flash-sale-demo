import { PurchaseStatus } from '@flash-sale-demo/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import { purchaseRequestMessageSchema } from '../../common/messages/purchase-request.message';
import type { PurchaseResultMessage } from '../../common/messages/purchase-result.message';
import { QueuePublisher } from '../../infrastructure/queue/queue-publisher';
import { SaleStockCounter } from '../sale/sale-stock-counter';
import { FulfillmentRepository, type FulfillmentOutcome } from './fulfillment.repository';

const UNUSED_UNIT_STATUSES: ReadonlySet<PurchaseStatus> = new Set([
  PurchaseStatus.ALREADY_PURCHASED,
  PurchaseStatus.SALE_NOT_ACTIVE,
]);

@Injectable()
export class FulfillmentService {
  private readonly resultsQueueUrl: string;

  constructor(
    private readonly repository: FulfillmentRepository,
    private readonly stockCounter: SaleStockCounter,
    private readonly publisher: QueuePublisher,
    config: ConfigService<Env, true>,
  ) {
    this.resultsQueueUrl = config.get('PURCHASE_RESULTS_QUEUE_URL', { infer: true });
  }

  async handle(body: unknown): Promise<void> {
    const request = purchaseRequestMessageSchema.parse(body);

    const outcome = await this.repository.fulfill(request);
    await this.syncStockCounter(request.flashSaleId, outcome);

    const result: PurchaseResultMessage = {
      purchaseRequestId: request.purchaseRequestId,
      flashSaleId: request.flashSaleId,
      userId: request.userId,
      status: outcome.status,
      processedAt: new Date().toISOString(),
    };
    await this.publisher.publish(this.resultsQueueUrl, result);
  }

  private async syncStockCounter(flashSaleId: string, outcome: FulfillmentOutcome): Promise<void> {
    if (outcome.soldOut) {
      await this.stockCounter.markSoldOut(flashSaleId);
    } else if (!outcome.redelivered && UNUSED_UNIT_STATUSES.has(outcome.status)) {
      await this.stockCounter.restoreUnit(flashSaleId);
    }
  }
}
