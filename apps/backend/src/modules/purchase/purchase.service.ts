import { randomUUID } from 'node:crypto';
import { PurchaseStatus, type PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import type { PurchaseRequestMessage } from '../../common/messages/purchase-request.message';
import { QueuePublisher } from '../../infrastructure/queue/queue-publisher';
import { isWithinWindow } from '../sale/sale-status';
import { SaleService } from '../sale/sale.service';
import { PurchaseRejectedException } from './purchase-rejected.exception';
import { PurchaseRequestRepository } from './purchase-request.repository';
import {
  PurchaseRequestStore,
  type ReserveInput,
  type ReserveResult,
} from './purchase-request.store';

export interface CreatePurchaseResult {
  created: boolean;
  request: PurchaseRequestResponse;
}

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);
  private readonly requestsQueueUrl: string;

  constructor(
    private readonly sales: SaleService,
    private readonly store: PurchaseRequestStore,
    private readonly repository: PurchaseRequestRepository,
    private readonly publisher: QueuePublisher,
    config: ConfigService<Env, true>,
  ) {
    this.requestsQueueUrl = config.get('PURCHASE_REQUESTS_QUEUE_URL', { infer: true });
  }

  async create(flashSaleId: string, userId: string): Promise<CreatePurchaseResult> {
    const sale = await this.sales.getSale(flashSaleId);
    const acceptedAt = new Date();
    if (!isWithinWindow(sale, acceptedAt)) {
      throw new PurchaseRejectedException(PurchaseStatus.SALE_NOT_ACTIVE, 'The sale is not open');
    }

    const purchaseRequestId = randomUUID();
    const reservation = await this.reserve({
      flashSaleId,
      userId,
      purchaseRequestId,
      acceptedAt,
      remainingStock: sale.remainingStock,
    });

    if (reservation.outcome === 'SOLD_OUT') {
      throw new PurchaseRejectedException(PurchaseStatus.SOLD_OUT, 'The sale is sold out');
    }
    if (reservation.outcome === 'EXISTING') {
      return {
        created: false,
        request: await this.findById(flashSaleId, reservation.purchaseRequestId),
      };
    }

    await this.enqueue({
      purchaseRequestId,
      flashSaleId,
      userId,
      acceptedAt: acceptedAt.toISOString(),
    });

    return {
      created: true,
      request: {
        purchaseRequestId,
        flashSaleId,
        userId,
        status: PurchaseStatus.PENDING,
        updatedAt: acceptedAt.toISOString(),
      },
    };
  }

  async findById(flashSaleId: string, purchaseRequestId: string): Promise<PurchaseRequestResponse> {
    const request =
      (await this.store.findById(flashSaleId, purchaseRequestId)) ??
      (await this.repository.findById(flashSaleId, purchaseRequestId));
    if (!request) throw new NotFoundException('Purchase request not found');
    return request;
  }

  async findByUser(flashSaleId: string, userId: string): Promise<PurchaseRequestResponse> {
    const id = await this.store.findIdByUser(flashSaleId, userId);
    if (id) return this.findById(flashSaleId, id);

    const request = await this.repository.findLatestByUser(flashSaleId, userId);
    if (!request) throw new NotFoundException('No purchase request for this user');
    return request;
  }

  /** Redis down means we cannot admit safely: fail closed with a retryable 503, not a 500. */
  private async reserve(input: ReserveInput): Promise<ReserveResult> {
    try {
      return await this.store.reserve(input);
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to reserve purchase request');
      throw new ServiceUnavailableException('Could not accept the purchase right now, please retry');
    }
  }

  private async enqueue(message: PurchaseRequestMessage): Promise<void> {
    try {
      await this.publisher.publish(this.requestsQueueUrl, message);
    } catch (error) {
      await this.store.release(message.flashSaleId, message.userId, message.purchaseRequestId);
      this.logger.error({ err: error }, 'Failed to enqueue purchase request');
      throw new ServiceUnavailableException('Could not accept the purchase right now, please retry');
    }
  }
}
