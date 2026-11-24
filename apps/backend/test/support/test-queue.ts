import {
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

export function createTestSqsClient(): SQSClient {
  return new SQSClient({ region: 'us-east-1', endpoint: process.env.SQS_ENDPOINT });
}

/**
 * Short, so tests never wait out a long timeout: when a consumer stops, its aborted
 * long-poll can still be handed a message by the queue, hiding it until this expires.
 */
const TEST_VISIBILITY_TIMEOUT_SECONDS = '2';

export async function ensureQueue(sqs: SQSClient, name: string): Promise<void> {
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
  // Set separately so queues left over from earlier runs are updated too.
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl,
      Attributes: { VisibilityTimeout: TEST_VISIBILITY_TIMEOUT_SECONDS },
    }),
  );
}

/** Receives and deletes every message currently on the queue; returns their parsed bodies. */
export async function drainQueue<T = unknown>(sqs: SQSClient, queueUrl: string): Promise<T[]> {
  const bodies: T[] = [];
  for (;;) {
    const { Messages = [] } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 0,
      }),
    );
    if (Messages.length === 0) return bodies;

    bodies.push(...Messages.map((m) => JSON.parse(m.Body ?? 'null') as T));
    await sqs.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: Messages.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle })),
      }),
    );
  }
}
