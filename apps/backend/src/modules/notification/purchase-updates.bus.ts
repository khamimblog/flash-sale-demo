import type { PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Subject, type Observable } from 'rxjs';
import { RedisChannels } from '../../infrastructure/redis/redis-keys';
import { REDIS } from '../../infrastructure/redis/redis.tokens';

/**
 * Cross-instance fan-out of purchase updates via Redis pub/sub.
 *
 * SQS hands each result to exactly one API instance, but the user's SSE
 * connection may live on any instance. The receiving instance publishes the
 * update here, and every instance re-emits it locally on `updates$`.
 */
@Injectable()
export class PurchaseUpdatesBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PurchaseUpdatesBus.name);
  private readonly subscriber: Redis;
  private readonly updates = new Subject<PurchaseRequestResponse>();

  readonly updates$: Observable<PurchaseRequestResponse> = this.updates.asObservable();

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    // A connection in subscriber mode cannot run other commands, so it gets its own.
    this.subscriber = redis.duplicate();
  }

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', (_channel: string, payload: string) => {
      try {
        this.updates.next(JSON.parse(payload) as PurchaseRequestResponse);
      } catch (error) {
        this.logger.warn({ err: error }, 'Ignoring malformed purchase update');
      }
    });
    await this.subscriber.subscribe(RedisChannels.purchaseUpdates);
  }

  async publish(update: PurchaseRequestResponse): Promise<void> {
    await this.redis.publish(RedisChannels.purchaseUpdates, JSON.stringify(update));
  }

  /** Completing the subject ends every open SSE stream, so clients reconnect elsewhere. */
  async onModuleDestroy(): Promise<void> {
    this.updates.complete();
    await this.subscriber.quit();
  }
}
