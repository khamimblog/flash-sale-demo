import { randomUUID } from 'node:crypto';
import { PurchaseStatus } from '@flash-sale-demo/shared-types';
import { count, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { PurchaseRequestMessage } from '../src/common/messages/purchase-request.message';
import type { Database } from '../src/infrastructure/database/database.tokens';
import { flashSales, orders, purchaseRequests } from '../src/infrastructure/database/schema';
import { FulfillmentRepository } from '../src/modules/fulfillment/fulfillment.repository';
import { connectTestDatabase, createSale, truncateAll } from './support/test-database';

describe('FulfillmentRepository (Postgres)', () => {
  let db: Database;
  let pool: Pool;
  let repository: FulfillmentRepository;

  beforeAll(() => {
    ({ db, pool } = connectTestDatabase());
    repository = new FulfillmentRepository(db);
  });
  beforeEach(() => truncateAll(db));
  afterAll(() => pool.end());

  const request = (
    flashSaleId: string,
    userId: string,
    acceptedAt = new Date(),
  ): PurchaseRequestMessage => ({
    purchaseRequestId: randomUUID(),
    flashSaleId,
    userId,
    acceptedAt: acceptedAt.toISOString(),
  });

  const remainingStock = async (flashSaleId: string) => {
    const [sale] = await db.select().from(flashSales).where(eq(flashSales.id, flashSaleId));
    return sale.remainingStock;
  };

  const orderCount = async (flashSaleId: string) => {
    const [row] = await db
      .select({ value: count() })
      .from(orders)
      .where(eq(orders.flashSaleId, flashSaleId));
    return row.value;
  };

  const tally = (statuses: PurchaseStatus[]) =>
    statuses.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});

  describe('single requests', () => {
    it('sells one unit and records the order', async () => {
      const sale = await createSale(db, { stock: 5 });

      const outcome = await repository.fulfill(request(sale.id, 'alice'));

      expect(outcome).toEqual({ status: PurchaseStatus.SUCCESS, soldOut: false });
      expect(await remainingStock(sale.id)).toBe(4);
      expect(await orderCount(sale.id)).toBe(1);
    });

    it('reports sold out when the last unit is taken', async () => {
      const sale = await createSale(db, { stock: 1 });

      const outcome = await repository.fulfill(request(sale.id, 'alice'));

      expect(outcome).toEqual({ status: PurchaseStatus.SUCCESS, soldOut: true });
    });

    it('rejects a second purchase by the same user', async () => {
      const sale = await createSale(db, { stock: 5 });
      await repository.fulfill(request(sale.id, 'alice'));

      const outcome = await repository.fulfill(request(sale.id, 'alice'));

      expect(outcome.status).toBe(PurchaseStatus.ALREADY_PURCHASED);
      expect(await remainingStock(sale.id)).toBe(4);
    });

    it('rejects purchases once stock is exhausted', async () => {
      const sale = await createSale(db, { stock: 1 });
      await repository.fulfill(request(sale.id, 'alice'));

      const outcome = await repository.fulfill(request(sale.id, 'bob'));

      expect(outcome).toEqual({ status: PurchaseStatus.SOLD_OUT, soldOut: true });
      expect(await orderCount(sale.id)).toBe(1);
    });

    it.each([
      ['before the sale starts', -1],
      ['exactly when the sale ends', 60_000],
    ])('rejects a request accepted %s', async (_label, offsetFromEndMs) => {
      const endsAt = new Date(Date.now() + 60_000);
      const startsAt = new Date(endsAt.getTime() - 60_000);
      const sale = await createSale(db, { stock: 5, startsAt, endsAt });
      const acceptedAt =
        offsetFromEndMs < 0
          ? new Date(startsAt.getTime() - 1)
          : new Date(startsAt.getTime() + offsetFromEndMs);

      const outcome = await repository.fulfill(request(sale.id, 'alice', acceptedAt));

      expect(outcome.status).toBe(PurchaseStatus.SALE_NOT_ACTIVE);
      expect(await remainingStock(sale.id)).toBe(5);
    });

    it('honours requests accepted in-window even if processed after the sale ended', async () => {
      const sale = await createSale(db, {
        stock: 5,
        startsAt: new Date(Date.now() - 120_000),
        endsAt: new Date(Date.now() - 60_000),
      });
      const acceptedInWindow = new Date(Date.now() - 90_000);

      const outcome = await repository.fulfill(request(sale.id, 'alice', acceptedInWindow));

      expect(outcome.status).toBe(PurchaseStatus.SUCCESS);
    });
  });

  describe('idempotency', () => {
    it('returns the original outcome when the same message is delivered twice', async () => {
      const sale = await createSale(db, { stock: 5 });
      const message = request(sale.id, 'alice');

      const first = await repository.fulfill(message);
      const second = await repository.fulfill(message);

      expect(second).toEqual(first);
      expect(await remainingStock(sale.id)).toBe(4);
      expect(await orderCount(sale.id)).toBe(1);
    });

    it('records the final status on the purchase request', async () => {
      const sale = await createSale(db, { stock: 5 });
      const message = request(sale.id, 'alice');

      await repository.fulfill(message);

      const [row] = await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, message.purchaseRequestId));
      expect(row.status).toBe(PurchaseStatus.SUCCESS);
      expect(row.processedAt).toBeInstanceOf(Date);
    });
  });

  describe('concurrency', () => {
    it('never oversells when many users buy at once', async () => {
      const stock = 50;
      const buyers = 300;
      const sale = await createSale(db, { stock });

      const outcomes = await Promise.all(
        Array.from({ length: buyers }, (_, i) => repository.fulfill(request(sale.id, `user-${i}`))),
      );

      const statuses = tally(outcomes.map((o) => o.status));
      expect(statuses[PurchaseStatus.SUCCESS]).toBe(stock);
      expect(statuses[PurchaseStatus.SOLD_OUT]).toBe(buyers - stock);
      expect(await remainingStock(sale.id)).toBe(0);
      expect(await orderCount(sale.id)).toBe(stock);
    });

    it('sells at most one unit to a user who sends many requests at once', async () => {
      const sale = await createSale(db, { stock: 10 });

      const outcomes = await Promise.all(
        Array.from({ length: 25 }, () => repository.fulfill(request(sale.id, 'alice'))),
      );

      const statuses = tally(outcomes.map((o) => o.status));
      expect(statuses[PurchaseStatus.SUCCESS]).toBe(1);
      expect(statuses[PurchaseStatus.ALREADY_PURCHASED]).toBe(24);
      expect(await remainingStock(sale.id)).toBe(9);
    });

    it('processes concurrent redeliveries of the same message exactly once', async () => {
      const sale = await createSale(db, { stock: 10 });
      const message = request(sale.id, 'alice');

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () => repository.fulfill(message)),
      );

      expect(new Set(outcomes.map((o) => o.status))).toEqual(new Set([PurchaseStatus.SUCCESS]));
      expect(await remainingStock(sale.id)).toBe(9);
      expect(await orderCount(sale.id)).toBe(1);
    });
  });
});
