import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { RedisKeys } from '../src/infrastructure/redis/redis-keys';
import { SaleStockCounter } from '../src/modules/sale/sale-stock-counter';

describe('SaleStockCounter (Redis)', () => {
  let redis: Redis;
  let counter: SaleStockCounter;
  const saleId = randomUUID();
  const stockKey = RedisKeys.stock(saleId);

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL!);
    counter = new SaleStockCounter(redis);
  });
  beforeEach(() => redis.flushdb());
  afterAll(() => redis.quit());

  it('zeroes the counter when the database confirms the sale is sold out', async () => {
    await redis.set(stockKey, 3); // Redis over-counted, e.g. after re-seeding a lost key

    await counter.markSoldOut(saleId);

    expect(await redis.get(stockKey)).toBe('0');
  });

  it('gives an unused unit back', async () => {
    await redis.set(stockKey, 0);

    await counter.restoreUnit(saleId);

    expect(await redis.get(stockKey)).toBe('1');
  });

  it('does not create the counter when it is missing, so it is re-seeded from Postgres', async () => {
    await counter.restoreUnit(saleId);

    expect(await redis.exists(stockKey)).toBe(0);
  });
});
