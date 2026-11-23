import { PurchaseStatus, type PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { ApiModule } from '../src/api.module';
import { configureApiApp } from '../src/app.setup';
import type { PurchaseResultMessage } from '../src/common/messages/purchase-result.message';
import { DATABASE, type Database } from '../src/infrastructure/database/database.tokens';
import { REDIS } from '../src/infrastructure/redis/redis.tokens';
import { createSale, truncateAll } from './support/test-database';
import { createTestSqsClient, drainQueue } from './support/test-queue';

/** Parses an SSE body into `{ event, data }` pairs. */
function parseSse(body: string): { event: string; data: unknown }[] {
  return body
    .split('\n\n')
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const field = (name: string) =>
        block
          .split('\n')
          .find((line) => line.startsWith(`${name}:`))
          ?.slice(name.length + 1)
          .trim();
      return { event: field('event') ?? 'message', data: JSON.parse(field('data') ?? 'null') };
    });
}

/** Polls `read` until `done` holds (or ~5s pass) and returns the last value. */
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  let value = await read();
  for (let i = 0; i < 50 && !done(value); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  return value;
}

describe('Notifications (results queue → Redis → SSE)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let redis: Redis;
  let sqs: SQSClient;
  const requestsQueue = process.env.PURCHASE_REQUESTS_QUEUE_URL!;
  const resultsQueue = process.env.PURCHASE_RESULTS_QUEUE_URL!;

  beforeAll(async () => {
    sqs = createTestSqsClient();
    await drainQueue(sqs, resultsQueue);

    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApiApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get(DATABASE);
    redis = app.get(REDIS);
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

  const createRequest = async (saleId: string, userId: string) =>
    (
      await app.inject({
        method: 'POST',
        url: `/api/flash-sales/${saleId}/purchase-requests`,
        payload: { userId },
      })
    ).json<PurchaseRequestResponse>();

  const publishResult = (request: PurchaseRequestResponse, status: PurchaseStatus) =>
    sqs.send(
      new SendMessageCommand({
        QueueUrl: resultsQueue,
        MessageBody: JSON.stringify({
          purchaseRequestId: request.purchaseRequestId,
          flashSaleId: request.flashSaleId,
          userId: request.userId,
          status,
          processedAt: new Date().toISOString(),
        } satisfies PurchaseResultMessage),
      }),
    );

  const eventsUrl = (r: PurchaseRequestResponse) =>
    `/api/flash-sales/${r.flashSaleId}/purchase-requests/${r.purchaseRequestId}/events`;

  it('streams PENDING, then the final result, then closes', async () => {
    const sale = await createSale(db, { stock: 10 });
    const request = await createRequest(sale.id, 'alice');

    const stream = app.inject({ method: 'GET', url: eventsUrl(request) });
    await new Promise((resolve) => setTimeout(resolve, 200)); // let the stream open
    await publishResult(request, PurchaseStatus.SUCCESS);
    const res = await stream;

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const statuses = parseSse(res.body)
      .filter((e) => e.event === 'status')
      .map((e) => (e.data as PurchaseRequestResponse).status);
    expect(statuses).toEqual([PurchaseStatus.PENDING, PurchaseStatus.SUCCESS]);
  });

  it('makes the final status available to polling clients', async () => {
    const sale = await createSale(db, { stock: 10 });
    const request = await createRequest(sale.id, 'alice');

    await publishResult(request, PurchaseStatus.SOLD_OUT);

    const status = await waitFor(
      async () =>
        (
          await app.inject({
            method: 'GET',
            url: `/api/flash-sales/${sale.id}/purchase-requests?userId=alice`,
          })
        ).json<PurchaseRequestResponse>().status,
      (s) => s !== PurchaseStatus.PENDING,
    );
    expect(status).toBe(PurchaseStatus.SOLD_OUT);
  });

  it('returns 404 instead of a stream for an unknown request', async () => {
    const sale = await createSale(db, { stock: 10 });

    const res = await app.inject({
      method: 'GET',
      url: `/api/flash-sales/${sale.id}/purchase-requests/00000000-0000-4000-8000-000000000000/events`,
    });

    expect(res.statusCode).toBe(404);
  });
});
