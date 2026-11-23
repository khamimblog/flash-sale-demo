import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisKeys } from '../../infrastructure/redis/redis-keys';
import { REDIS } from '../../infrastructure/redis/redis.tokens';

/**
 * Fast, shared "this sale is sold out" hint.
 *
 * Only the worker sets it, and only after Postgres has confirmed stock hit zero,
 * so it can never cause a false "sold out". The API checks it (inside the purchase
 * reservation script) to reject requests without touching the queue or the database.
 * Postgres remains the source of truth.
 */
@Injectable()
export class SaleAvailabilityStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async markSoldOut(flashSaleId: string): Promise<void> {
    await this.redis.set(RedisKeys.soldOut(flashSaleId), '1');
  }
}
