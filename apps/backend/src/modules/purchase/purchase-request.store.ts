import { PurchaseStatus, type PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import Redis, { type Result } from 'ioredis';
import { RedisKeys, SALE_KEY_TTL_SECONDS } from '../../infrastructure/redis/redis-keys';
import { REDIS } from '../../infrastructure/redis/redis.tokens';

/**
 * Atomically: return the user's existing request, or reject if no units are left, or
 * take a unit and reserve a new request. One script means no race between concurrent
 * clicks by the same user, and the stock counter can never go below zero.
 *
 * KEYS: 1 stock counter, 2 user → request pointer, 3 request hash
 * ARGV: 1 request id, 2 sale id, 3 user id, 4 status, 5 updatedAt, 6 ttl seconds,
 *       7 stock to seed the counter with if it does not exist yet (from Postgres)
 * Returns: {'EXISTING', id} | {'SOLD_OUT'} | {'CREATED', id}
 */
const RESERVE_SCRIPT = `
local existing = redis.call('GET', KEYS[2])
if existing then return {'EXISTING', existing} end
redis.call('SET', KEYS[1], ARGV[7], 'NX', 'EX', ARGV[6])
if tonumber(redis.call('GET', KEYS[1])) <= 0 then return {'SOLD_OUT'} end
redis.call('DECR', KEYS[1])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[6])
redis.call('HSET', KEYS[3], 'flashSaleId', ARGV[2], 'userId', ARGV[3], 'status', ARGV[4], 'updatedAt', ARGV[5])
redis.call('EXPIRE', KEYS[3], ARGV[6])
return {'CREATED', ARGV[1]}
`;

/**
 * Undoes a reservation: forgets the request and gives its unit back. The unit is only
 * returned while the counter exists (if it was lost, the next reserve re-seeds it).
 *
 * KEYS: 1 stock counter, 2 user → request pointer, 3 request hash
 */
const RELEASE_SCRIPT = `
redis.call('DEL', KEYS[2], KEYS[3])
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('INCR', KEYS[1]) end
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reservePurchaseRequest(
      ...keysAndArgs: (string | number)[]
    ): Result<[string, string?], Context>;
    releasePurchaseRequest(...keys: string[]): Result<null, Context>;
  }
}

export interface ReserveInput {
  flashSaleId: string;
  userId: string;
  purchaseRequestId: string;
  acceptedAt: Date;
  /** Postgres' remaining stock, used only if the Redis counter does not exist yet. */
  remainingStock: number;
}

export type ReserveResult =
  | { outcome: 'CREATED' | 'EXISTING'; purchaseRequestId: string }
  | { outcome: 'SOLD_OUT' };

@Injectable()
export class PurchaseRequestStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.redis.defineCommand('reservePurchaseRequest', { numberOfKeys: 3, lua: RESERVE_SCRIPT });
    this.redis.defineCommand('releasePurchaseRequest', { numberOfKeys: 3, lua: RELEASE_SCRIPT });
  }

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const { flashSaleId, userId, purchaseRequestId } = input;
    const [outcome, id] = await this.redis.reservePurchaseRequest(
      RedisKeys.stock(flashSaleId),
      RedisKeys.userRequest(flashSaleId, userId),
      RedisKeys.request(flashSaleId, purchaseRequestId),
      purchaseRequestId,
      flashSaleId,
      userId,
      PurchaseStatus.PENDING,
      input.acceptedAt.toISOString(),
      SALE_KEY_TTL_SECONDS,
      input.remainingStock,
    );
    return outcome === 'SOLD_OUT'
      ? { outcome }
      : { outcome: outcome as 'CREATED' | 'EXISTING', purchaseRequestId: id! };
  }

  /** Undoes a reservation whose message could not be enqueued, so the user can retry. */
  async release(flashSaleId: string, userId: string, purchaseRequestId: string): Promise<void> {
    await this.redis.releasePurchaseRequest(
      RedisKeys.stock(flashSaleId),
      RedisKeys.userRequest(flashSaleId, userId),
      RedisKeys.request(flashSaleId, purchaseRequestId),
    );
  }

  async save(request: PurchaseRequestResponse): Promise<void> {
    const key = RedisKeys.request(request.flashSaleId, request.purchaseRequestId);
    await this.redis
      .multi()
      .hset(key, {
        flashSaleId: request.flashSaleId,
        userId: request.userId,
        status: request.status,
        updatedAt: request.updatedAt,
      })
      .expire(key, SALE_KEY_TTL_SECONDS)
      .exec();
  }

  async findById(
    flashSaleId: string,
    purchaseRequestId: string,
  ): Promise<PurchaseRequestResponse | null> {
    const hash = await this.redis.hgetall(RedisKeys.request(flashSaleId, purchaseRequestId));
    if (!hash.status) return null;
    return {
      purchaseRequestId,
      flashSaleId,
      userId: hash.userId,
      status: hash.status as PurchaseStatus,
      updatedAt: hash.updatedAt,
    };
  }

  async findIdByUser(flashSaleId: string, userId: string): Promise<string | null> {
    return this.redis.get(RedisKeys.userRequest(flashSaleId, userId));
  }
}
