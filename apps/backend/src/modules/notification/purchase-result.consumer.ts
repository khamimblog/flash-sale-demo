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
import { NotificationService } from './notification.service';

/** Connects the purchase-results queue to the notification service for the API's lifetime. */
@Injectable()
export class PurchaseResultConsumer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly consumer: SqsConsumer;

  constructor(
    @Inject(SQS_CLIENT) sqs: SQSClient,
    config: ConfigService<Env, true>,
    notifications: NotificationService,
  ) {
    this.consumer = new SqsConsumer(sqs, {
      name: 'purchase-results',
      queueUrl: config.get('PURCHASE_RESULTS_QUEUE_URL', { infer: true }),
      pollers: config.get('NOTIFICATION_POLLERS', { infer: true }),
      handler: (body) => notifications.handleResult(body),
    });
  }

  onApplicationBootstrap(): void {
    this.consumer.start();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
