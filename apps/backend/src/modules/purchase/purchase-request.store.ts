import { PurchaseStatus, type PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import Redis, { type Result } from 'ioredis';
import { RedisKeys } from '../../infrastructure/redis/redis-keys';
import { REDIS } from '../../infrastructure/redis/redis.tokens';

/** Long enough to outlive any sale; the database is the fallback after expiry. */
const REQUEST_TTL_SECONDS = 24 * 60 * 60;

/**
 * Atomically: return the user's existing request, or reject if sold out, or reserve a
 * new request. Running this as one script removes the check-then-act race between
 * concurrent clicks by the same user.
 *
 * KEYS: 1 sold-out flag, 2 user → request pointer, 3 request hash
 * ARGV: 1 request id, 2 sale id, 3 user id, 4 status, 5 updatedAt, 6 ttl seconds
 * Returns: {'EXISTING', id} | {'SOLD_OUT'} | {'CREATED', id}
 */
const RESERVE_SCRIPT = `
local existing = redis.call('GET', KEYS[2])
if existing then return {'EXISTING', existing} end
if redis.call('EXISTS', KEYS[1]) == 1 then return {'SOLD_OUT'} end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[6])
redis.call('HSET', KEYS[3], 'flashSaleId', ARGV[2], 'userId', ARGV[3], 'status', ARGV[4], 'updatedAt', ARGV[5])
redis.call('EXPIRE', KEYS[3], ARGV[6])
return {'CREATED', ARGV[1]}
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reservePurchaseRequest(
      ...keysAndArgs: (string | number)[]
    ): Result<[string, string?], Context>;
  }
}

export type ReserveResult =
  | { outcome: 'CREATED' | 'EXISTING'; purchaseRequestId: string }
  | { outcome: 'SOLD_OUT' };

/** Redis-backed, short-lived view of purchase requests: dedupe + live status. */
@Injectable()
export class PurchaseRequestStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.redis.defineCommand('reservePurchaseRequest', { numberOfKeys: 3, lua: RESERVE_SCRIPT });
  }

  async reserve(
    flashSaleId: string,
    userId: string,
    purchaseRequestId: string,
    acceptedAt: Date,
  ): Promise<ReserveResult> {
    const [outcome, id] = await this.redis.reservePurchaseRequest(
      RedisKeys.soldOut(flashSaleId),
      RedisKeys.userRequest(flashSaleId, userId),
      RedisKeys.request(flashSaleId, purchaseRequestId),
      purchaseRequestId,
      flashSaleId,
      userId,
      PurchaseStatus.PENDING,
      acceptedAt.toISOString(),
      REQUEST_TTL_SECONDS,
    );
    return outcome === 'SOLD_OUT'
      ? { outcome }
      : { outcome: outcome as 'CREATED' | 'EXISTING', purchaseRequestId: id! };
  }

  /** Undoes a reservation whose message could not be enqueued, so the user can retry. */
  async release(flashSaleId: string, userId: string, purchaseRequestId: string): Promise<void> {
    await this.redis.del(
      RedisKeys.userRequest(flashSaleId, userId),
      RedisKeys.request(flashSaleId, purchaseRequestId),
    );
  }

  /** Writes the full record (not just the status) so an expired key is recreated whole. */
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
      .expire(key, REQUEST_TTL_SECONDS)
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
