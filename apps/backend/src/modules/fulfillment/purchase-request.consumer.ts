import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import type { Env } from '../../common/config/env.schema';
import { SqsConsumer } from '../../infrastructure/queue/sqs-consumer';
import { SQS_CLIENT } from '../../infrastructure/queue/queue.tokens';
import { FulfillmentService } from './fulfillment.service';

/** Connects the purchase-requests queue to the fulfillment service for the worker's lifetime. */
@Injectable()
export class PurchaseRequestConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly consumer: SqsConsumer;

  constructor(
    @Inject(SQS_CLIENT) sqs: SQSClient,
    config: ConfigService<Env, true>,
    fulfillment: FulfillmentService,
  ) {
    this.consumer = new SqsConsumer(sqs, {
      name: 'purchase-requests',
      queueUrl: config.get('PURCHASE_REQUESTS_QUEUE_URL', { infer: true }),
      pollers: config.get('WORKER_POLLERS', { infer: true }),
      handler: (body) => fulfillment.handle(body),
    });
  }

  onApplicationBootstrap(): void {
    this.consumer.start();
  }

  /** Runs before connections close, so in-flight messages can finish cleanly. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
