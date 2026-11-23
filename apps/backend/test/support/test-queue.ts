import {
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

export function createTestSqsClient(): SQSClient {
  return new SQSClient({ region: 'us-east-1', endpoint: process.env.SQS_ENDPOINT });
}

export async function ensureQueue(sqs: SQSClient, name: string): Promise<void> {
  await sqs.send(new CreateQueueCommand({ QueueName: name }));
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
