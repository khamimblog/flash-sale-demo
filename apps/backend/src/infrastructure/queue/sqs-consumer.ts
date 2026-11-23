import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';

export type MessageHandler = (body: unknown) => Promise<void>;

export interface SqsConsumerOptions {
  name: string;
  queueUrl: string;
  /** Number of concurrent long-polling loops. Each loop handles up to 10 messages at a time. */
  pollers: number;
  handler: MessageHandler;
}

const MAX_BATCH_SIZE = 10; // SQS limit
const LONG_POLL_SECONDS = 20; // SQS maximum; avoids busy-polling an empty queue
const ERROR_BACKOFF_MS = 1_000;

/**
 * Minimal at-least-once SQS consumer.
 *
 * - A message is deleted only after its handler succeeds.
 * - A failed message is left alone: it reappears after the visibility timeout and,
 *   after `maxReceiveCount` attempts, the queue's redrive policy moves it to the DLQ.
 * - Handlers must therefore be idempotent.
 */
export class SqsConsumer {
  private readonly logger: Logger;
  private readonly shutdown = new AbortController();
  private loops: Promise<void>[] = [];

  constructor(
    private readonly sqs: SQSClient,
    private readonly options: SqsConsumerOptions,
  ) {
    this.logger = new Logger(`SqsConsumer:${options.name}`);
  }

  start(): void {
    this.loops = Array.from({ length: this.options.pollers }, () => this.poll());
    this.logger.log(`Started ${this.options.pollers} poller(s)`);
  }

  /** Stops polling and waits for in-flight messages to finish. */
  async stop(): Promise<void> {
    this.shutdown.abort();
    await Promise.all(this.loops);
    this.logger.log('Stopped');
  }

  private get stopping(): boolean {
    return this.shutdown.signal.aborted;
  }

  private async poll(): Promise<void> {
    while (!this.stopping) {
      try {
        const { Messages = [] } = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.options.queueUrl,
            MaxNumberOfMessages: MAX_BATCH_SIZE,
            WaitTimeSeconds: LONG_POLL_SECONDS,
          }),
          { abortSignal: this.shutdown.signal },
        );
        if (Messages.length > 0) await this.processBatch(Messages);
      } catch (error) {
        if (this.stopping) return; // receive was aborted by shutdown
        this.logger.error({ err: error }, 'Polling failed; backing off');
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  private async processBatch(messages: Message[]): Promise<void> {
    const results = await Promise.allSettled(
      messages.map(async (message) => this.options.handler(JSON.parse(message.Body ?? ''))),
    );

    const succeeded = messages.filter((_, i) => results[i].status === 'fulfilled');
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(
          { err: result.reason, messageId: messages[i].MessageId },
          'Message handling failed; it will be retried',
        );
      }
    });

    if (succeeded.length > 0) {
      await this.sqs.send(
        new DeleteMessageBatchCommand({
          QueueUrl: this.options.queueUrl,
          Entries: succeeded.map((message, i) => ({
            Id: String(i),
            ReceiptHandle: message.ReceiptHandle,
          })),
        }),
      );
    }
  }
}
