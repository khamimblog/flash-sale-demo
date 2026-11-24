import { randomUUID } from 'node:crypto';
import { PurchaseStatus } from '@flash-sale-demo/shared-types';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import type { QueuePublisher } from '../../infrastructure/queue/queue-publisher';
import type { SaleStockCounter } from '../sale/sale-stock-counter';
import type { FulfillmentRepository } from './fulfillment.repository';
import { FulfillmentService } from './fulfillment.service';

const RESULTS_QUEUE = 'http://sqs.local/purchase-results';

function setup() {
  const repository = { fulfill: jest.fn() } as unknown as jest.Mocked<FulfillmentRepository>;
  const stockCounter = {
    markSoldOut: jest.fn(),
    restoreUnit: jest.fn(),
  } as unknown as jest.Mocked<SaleStockCounter>;
  const publisher = { publish: jest.fn() } as unknown as jest.Mocked<QueuePublisher>;
  const config = { get: () => RESULTS_QUEUE } as unknown as ConfigService<Env, true>;

  const service = new FulfillmentService(repository, stockCounter, publisher, config);
  return { service, repository, stockCounter, publisher };
}

const message = () => ({
  purchaseRequestId: randomUUID(),
  flashSaleId: randomUUID(),
  userId: 'alice@example.com',
  acceptedAt: new Date().toISOString(),
});

describe('FulfillmentService', () => {
  it('publishes the outcome to the results queue', async () => {
    const { service, repository, publisher, stockCounter } = setup();
    repository.fulfill.mockResolvedValue({ status: PurchaseStatus.SUCCESS, soldOut: false, redelivered: false });
    const request = message();

    await service.handle(request);

    expect(publisher.publish).toHaveBeenCalledWith(
      RESULTS_QUEUE,
      expect.objectContaining({
        purchaseRequestId: request.purchaseRequestId,
        userId: request.userId,
        status: PurchaseStatus.SUCCESS,
      }),
    );
    expect(stockCounter.markSoldOut).not.toHaveBeenCalled();
  });

  it('marks the sale sold out when the database says stock is gone', async () => {
    const { service, repository, stockCounter } = setup();
    repository.fulfill.mockResolvedValue({
      status: PurchaseStatus.SUCCESS,
      soldOut: true,
      redelivered: false,
    });
    const request = message();

    await service.handle(request);

    expect(stockCounter.markSoldOut).toHaveBeenCalledWith(request.flashSaleId);
    expect(stockCounter.restoreUnit).not.toHaveBeenCalled();
  });

  it.each([PurchaseStatus.ALREADY_PURCHASED, PurchaseStatus.SALE_NOT_ACTIVE])(
    'gives the reserved unit back when rejected as %s',
    async (status) => {
      const { service, repository, stockCounter } = setup();
      repository.fulfill.mockResolvedValue({ status, soldOut: false, redelivered: false });
      const request = message();

      await service.handle(request);

      expect(stockCounter.restoreUnit).toHaveBeenCalledWith(request.flashSaleId);
    },
  );

  it('does not give a unit back twice when the message is redelivered', async () => {
    const { service, repository, stockCounter } = setup();
    repository.fulfill.mockResolvedValue({
      status: PurchaseStatus.ALREADY_PURCHASED,
      soldOut: false,
      redelivered: true,
    });

    await service.handle(message());

    expect(stockCounter.restoreUnit).not.toHaveBeenCalled();
  });

  it('rejects malformed messages without touching the database', async () => {
    const { service, repository } = setup();

    await expect(service.handle({ userId: 'bob' })).rejects.toThrow();
    expect(repository.fulfill).not.toHaveBeenCalled();
  });

  it('propagates publish failures so the message is retried', async () => {
    const { service, repository, publisher } = setup();
    repository.fulfill.mockResolvedValue({ status: PurchaseStatus.SUCCESS, soldOut: false, redelivered: false });
    publisher.publish.mockRejectedValue(new Error('SQS unavailable'));

    await expect(service.handle(message())).rejects.toThrow('SQS unavailable');
  });
});
