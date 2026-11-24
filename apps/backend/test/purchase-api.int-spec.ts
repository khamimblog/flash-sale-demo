import {
  PurchaseStatus,
  SaleStatus,
  type FlashSaleResponse,
  type PurchaseRequestResponse,
} from '@flash-sale-demo/shared-types';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { ApiModule } from '../src/api.module';
import { configureApiApp } from '../src/app.setup';
import type { PurchaseRequestMessage } from '../src/common/messages/purchase-request.message';
import type { Database } from '../src/infrastructure/database/database.tokens';
import { DATABASE } from '../src/infrastructure/database/database.tokens';
import { QueuePublisher } from '../src/infrastructure/queue/queue-publisher';
import { RedisKeys } from '../src/infrastructure/redis/redis-keys';
import { REDIS } from '../src/infrastructure/redis/redis.tokens';
import { createSale, truncateAll } from './support/test-database';
import { createTestSqsClient, drainQueue } from './support/test-queue';

describe('Purchase API (HTTP → Redis → SQS)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let redis: Redis;
  let sqs: SQSClient;
  const requestsQueue = process.env.PURCHASE_REQUESTS_QUEUE_URL!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApiApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get(DATABASE);
    redis = app.get(REDIS);
    sqs = createTestSqsClient();
  });

  beforeEach(async () => {
    await truncateAll(db);
    await redis.flushdb();
    await drainQueue(sqs, requestsQueue);
  });

  afterAll(async () => {
    sqs.destroy();
    await app.close();
  });

  const purchase = (saleId: string, userId: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/flash-sales/${saleId}/purchase-requests`,
      payload: { userId },
    });

  describe('GET /api/flash-sales/current', () => {
    it('returns the active sale with its product', async () => {
      const sale = await createSale(db, { stock: 10 });

      const res = await app.inject({ method: 'GET', url: '/api/flash-sales/current' });

      expect(res.statusCode).toBe(200);
      const body = res.json<FlashSaleResponse>();
      expect(body).toMatchObject({
        id: sale.id,
        status: SaleStatus.ACTIVE,
        totalStock: 10,
        remainingStock: 10,
      });
      expect(body.product.name).toBe('Test Earbuds');
      expect(Date.parse(body.serverTime)).not.toBeNaN();
    });

    it('returns 404 when no sale exists', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/flash-sales/current' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/flash-sales/:saleId/purchase-requests', () => {
    it('accepts the request (202) and enqueues it for the worker', async () => {
      const sale = await createSale(db, { stock: 10 });

      const res = await purchase(sale.id, 'alice@example.com');

      expect(res.statusCode).toBe(202);
      const body = res.json<PurchaseRequestResponse>();
      expect(body).toMatchObject({
        flashSaleId: sale.id,
        userId: 'alice@example.com',
        status: PurchaseStatus.PENDING,
      });

      const queued = await drainQueue<PurchaseRequestMessage>(sqs, requestsQueue);
      expect(queued).toEqual([
        expect.objectContaining({
          purchaseRequestId: body.purchaseRequestId,
          flashSaleId: sale.id,
          userId: 'alice@example.com',
        }),
      ]);
    });

    it('returns the existing request (200) when the same user buys again', async () => {
      const sale = await createSale(db, { stock: 10 });
      const first = (await purchase(sale.id, 'alice@example.com')).json<PurchaseRequestResponse>();

      const res = await purchase(sale.id, '  ALICE@example.com ');

      expect(res.statusCode).toBe(200);
      expect(res.json<PurchaseRequestResponse>().purchaseRequestId).toBe(first.purchaseRequestId);
      expect(await drainQueue(sqs, requestsQueue)).toHaveLength(1);
    });

    it('enqueues exactly one request when a user sends many at once', async () => {
      const sale = await createSale(db, { stock: 10 });

      const responses = await Promise.all(
        Array.from({ length: 50 }, () => purchase(sale.id, 'alice')),
      );

      const codes = responses.map((r) => r.statusCode);
      expect(codes.filter((c) => c === 202)).toHaveLength(1);
      expect(codes.filter((c) => c === 200)).toHaveLength(49);
      const ids = new Set(responses.map((r) => r.json<PurchaseRequestResponse>().purchaseRequestId));
      expect(ids.size).toBe(1);
      expect(await drainQueue(sqs, requestsQueue)).toHaveLength(1);
    });

    it('rejects with 409 SALE_NOT_ACTIVE before the sale starts', async () => {
      const sale = await createSale(db, {
        stock: 10,
        startsAt: new Date(Date.now() + 60_000),
        endsAt: new Date(Date.now() + 120_000),
      });

      const res = await purchase(sale.id, 'alice');

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ status: PurchaseStatus.SALE_NOT_ACTIVE });
    });

    it('admits only as many requests as there is stock, rejecting the rest without enqueuing', async () => {
      const sale = await createSale(db, { stock: 5 });

      const responses = await Promise.all(
        Array.from({ length: 100 }, (_, i) => purchase(sale.id, `user-${i}`)),
      );

      const codes = responses.map((r) => r.statusCode);
      expect(codes.filter((c) => c === 202)).toHaveLength(5);
      expect(codes.filter((c) => c === 409)).toHaveLength(95);
      expect(responses.find((r) => r.statusCode === 409)!.json()).toMatchObject({
        status: PurchaseStatus.SOLD_OUT,
      });
      expect(await drainQueue(sqs, requestsQueue)).toHaveLength(5);
      expect(await redis.get(RedisKeys.stock(sale.id))).toBe('0');
    });

    it('rejects with 409 SOLD_OUT once the worker has zeroed the counter', async () => {
      const sale = await createSale(db, { stock: 10 });
      await redis.set(RedisKeys.stock(sale.id), 0);

      const res = await purchase(sale.id, 'alice');

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ status: PurchaseStatus.SOLD_OUT });
      expect(await drainQueue(sqs, requestsQueue)).toHaveLength(0);
    });

    it('still returns a buyer their own request after the sale sells out', async () => {
      const sale = await createSale(db, { stock: 1 });
      const first = (await purchase(sale.id, 'alice')).json<PurchaseRequestResponse>();
      expect((await purchase(sale.id, 'bob')).statusCode).toBe(409);

      const res = await purchase(sale.id, 'alice');

      expect(res.statusCode).toBe(200);
      expect(res.json<PurchaseRequestResponse>().purchaseRequestId).toBe(first.purchaseRequestId);
    });

    it('gives the unit back and lets the user retry when enqueueing fails', async () => {
      const sale = await createSale(db, { stock: 1 });
      jest
        .spyOn(app.get(QueuePublisher), 'publish')
        .mockRejectedValueOnce(new Error('SQS unavailable'));

      const failed = await purchase(sale.id, 'alice');

      expect(failed.statusCode).toBe(503);
      expect(await redis.get(RedisKeys.stock(sale.id))).toBe('1');
      expect((await purchase(sale.id, 'alice')).statusCode).toBe(202);
    });

    it.each([
      ['missing userId', undefined],
      ['empty userId', '   '],
      ['non-string userId', 42],
      ['overlong userId', 'a'.repeat(255)],
    ])('returns 400 for %s', async (_label, userId) => {
      const sale = await createSale(db, { stock: 10 });

      const res = await purchase(sale.id, userId);

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for an unknown sale', async () => {
      const res = await purchase('00000000-0000-4000-8000-000000000000', 'alice');

      expect(res.statusCode).toBe(404);
    });
  });

  describe('purchase request lookups', () => {
    it('finds a request by id and by user', async () => {
      const sale = await createSale(db, { stock: 10 });
      const created = (await purchase(sale.id, 'alice')).json<PurchaseRequestResponse>();

      const byId = await app.inject({
        method: 'GET',
        url: `/api/flash-sales/${sale.id}/purchase-requests/${created.purchaseRequestId}`,
      });
      const byUser = await app.inject({
        method: 'GET',
        url: `/api/flash-sales/${sale.id}/purchase-requests?userId=ALICE`,
      });

      expect(byId.statusCode).toBe(200);
      expect(byId.json()).toEqual(created);
      expect(byUser.statusCode).toBe(200);
      expect(byUser.json()).toEqual(created);
    });

    it('returns 404 for a user who never tried to buy', async () => {
      const sale = await createSale(db, { stock: 10 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/flash-sales/${sale.id}/purchase-requests?userId=nobody`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  it('serves product images as static assets', async () => {
    const res = await app.inject({ method: 'GET', url: '/static/products/aurora-earbuds.svg' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
  });
});
