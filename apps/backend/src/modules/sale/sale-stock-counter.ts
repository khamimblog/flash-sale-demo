import { Inject, Injectable } from '@nestjs/common';
import Redis, { type Result } from 'ioredis';
import { RedisKeys, SALE_KEY_TTL_SECONDS } from '../../infrastructure/redis/redis-keys';
import { REDIS } from '../../infrastructure/redis/redis.tokens';

/**
 * Gives a unit back only while the counter exists. If the key is gone, the next
 * reservation re-seeds it from Postgres; creating it here would seed it with 1.
 * KEYS: 1 stock counter
 */
const RESTORE_UNIT_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('INCR', KEYS[1]) end
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    restoreSaleUnit(key: string): Result<null, Context>;
  }
}

/**
 * Keeps the Redis stock counter (see `RedisKeys.stock`) in line with what Postgres decided.
 * The API decrements the counter when it accepts a request; the worker corrects it here.
 */
@Injectable()
export class SaleStockCounter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.redis.defineCommand('restoreSaleUnit', { numberOfKeys: 1, lua: RESTORE_UNIT_SCRIPT });
  }

  /** Postgres confirmed no stock is left: stop admitting requests, even if Redis over-counted. */
  async markSoldOut(flashSaleId: string): Promise<void> {
    await this.redis.set(RedisKeys.stock(flashSaleId), 0, 'EX', SALE_KEY_TTL_SECONDS);
  }

  /** A request held a unit but did not use it (e.g. rejected as a duplicate buyer): free it. */
  async restoreUnit(flashSaleId: string): Promise<void> {
    await this.redis.restoreSaleUnit(RedisKeys.stock(flashSaleId));
  }
}
