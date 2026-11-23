import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import type { AppConfigService } from '../../common/config/app-config.service';
import { QueuePublisher } from './queue-publisher';
import { SQS_CLIENT } from './queue.tokens';

/**
 * SQS client. Locally it points at ElasticMQ (SQS-compatible) via SQS_ENDPOINT;
 * on AWS the endpoint is left unset and the SDK uses the real service.
 */
@Global()
@Module({
  providers: [
    {
      provide: SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) =>
        new SQSClient({
          region: config.get('AWS_REGION', { infer: true }),
          endpoint: config.get('SQS_ENDPOINT', { infer: true }),
        }),
    },
    QueuePublisher,
  ],
  exports: [SQS_CLIENT, QueuePublisher],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(SQS_CLIENT) private readonly sqs: SQSClient) {}

  onApplicationShutdown(): void {
    this.sqs.destroy();
  }
}
