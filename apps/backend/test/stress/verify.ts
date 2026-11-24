/**
 * Runs after the k6 burst: waits for the queues to drain, then checks the sale's
 * guarantees against Postgres (the source of truth).
 *
 *   tsx verify.ts [path/to/k6-summary.json]
 *
 * Exits 1 if any check fails.
 */
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { RedisKeys } from '../../src/infrastructure/redis/redis-keys';

const DRAIN_TIMEOUT_MS = 5 * 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (copy .env.example to .env)`);
  return value;
}

const queues = {
  requests: requireEnv('PURCHASE_REQUESTS_QUEUE_URL'),
  results: requireEnv('PURCHASE_RESULTS_QUEUE_URL'),
  requestsDlq: `${requireEnv('PURCHASE_REQUESTS_QUEUE_URL')}-dlq`,
  resultsDlq: `${requireEnv('PURCHASE_RESULTS_QUEUE_URL')}-dlq`,
};

const sqs = new SQSClient({ region: requireEnv('AWS_REGION'), endpoint: process.env.SQS_ENDPOINT });
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
const redis = new Redis(requireEnv('REDIS_URL'));

async function main(): Promise<void> {
  const accepted = readAcceptedCount(process.argv[2]);

  const drainedInMs = await waitForQueuesToDrain();
  console.log(`Queues drained ${(drainedInMs / 1000).toFixed(1)}s after the burst ended\n`);

  const sale = await one<{ id: string; total_stock: number; remaining_stock: number }>(
    'SELECT id, total_stock, remaining_stock FROM flash_sales ORDER BY created_at DESC LIMIT 1',
  );
  const orders = await one<{ total: number; buyers: number }>(
    'SELECT count(*)::int AS total, count(DISTINCT user_id)::int AS buyers FROM orders WHERE flash_sale_id = $1',
    [sale.id],
  );
  const statuses = await many<{ status: string; count: number }>(
    'SELECT status, count(*)::int AS count FROM purchase_requests WHERE flash_sale_id = $1 GROUP BY status ORDER BY status',
    [sale.id],
  );
  const timing = await one<{ p50: number; p95: number; max: number }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95,
            max(ms) AS max
       FROM (SELECT extract(epoch FROM processed_at - accepted_at) * 1000 AS ms
               FROM purchase_requests WHERE flash_sale_id = $1) t`,
    [sale.id],
  );
  const counter = await redis.get(RedisKeys.stock(sale.id));
  const deadLetters =
    (await queueDepth(queues.requestsDlq)) + (await queueDepth(queues.resultsDlq));

  const count = (status: string) => statuses.find((s) => s.status === status)?.count ?? 0;
  const processed = statuses.reduce((sum, s) => sum + s.count, 0);
  const sold = sale.total_stock - sale.remaining_stock;

  console.log('Sale         ', { totalStock: sale.total_stock, remainingStock: sale.remaining_stock });
  console.log('Orders       ', orders);
  console.log('Requests     ', Object.fromEntries(statuses.map((s) => [s.status, s.count])));
  console.log('Accepted→decided (ms)', {
    p50: Math.round(timing.p50),
    p95: Math.round(timing.p95),
    max: Math.round(timing.max),
  });
  console.log('Redis counter', counter, '\n');

  const checks: [string, boolean][] = [
    ['No oversell: orders ≤ total stock', orders.total <= sale.total_stock],
    ['Stock adds up: orders = total − remaining', orders.total === sold],
    ['One item per user: no buyer has two orders', orders.total === orders.buyers],
    ['Every SUCCESS has an order', count('SUCCESS') === orders.total],
    ['Nothing left pending', count('PENDING') === 0],
    ['No messages dead-lettered', deadLetters === 0],
  ];
  if (accepted !== undefined) {
    checks.push([`Every accepted request was processed (${accepted} × 202)`, processed === accepted]);
    if (accepted >= sale.total_stock) {
      checks.push(['Demand ≥ stock, so the sale sold out', sale.remaining_stock === 0]);
      checks.push(['Redis counter agrees: 0 left', counter === '0']);
    }
  }

  for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

/** The k6 summary's count of 202 responses, if a summary file was given. */
function readAcceptedCount(summaryPath: string | undefined): number | undefined {
  if (!summaryPath) return undefined;
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
    metrics: Record<string, { count?: number }>;
  };
  return summary.metrics.purchase_accepted?.count ?? 0;
}

async function waitForQueuesToDrain(): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DRAIN_TIMEOUT_MS) {
    const depths = await Promise.all([queueDepth(queues.requests), queueDepth(queues.results)]);
    if (depths.every((depth) => depth === 0)) return Date.now() - startedAt;
    await sleep(500);
  }
  throw new Error('Queues did not drain in time. Are the API and worker running?');
}

/** Visible + in-flight messages. */
async function queueDepth(queueUrl: string): Promise<number> {
  const { Attributes = {} } = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    }),
  );
  return (
    Number(Attributes.ApproximateNumberOfMessages ?? 0) +
    Number(Attributes.ApproximateNumberOfMessagesNotVisible ?? 0)
  );
}

async function one<T>(query: string, params: unknown[] = []): Promise<T> {
  return (await many<T>(query, params))[0];
}

async function many<T>(query: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(query, params)).rows as T[];
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqs.destroy();
    await Promise.all([pool.end(), redis.quit()]);
  });
