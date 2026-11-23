import { Inject, Injectable } from '@nestjs/common';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SQS_CLIENT } from './queue.tokens';

@Injectable()
export class QueuePublisher {
  constructor(@Inject(SQS_CLIENT) private readonly sqs: SQSClient) {}

  async publish(queueUrl: string, message: object): Promise<void> {
    await this.sqs.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }),
    );
  }
}
