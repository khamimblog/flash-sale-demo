/**
 * Creates a product and a flash sale for it.
 *
 *   pnpm db:seed                                  # 1000 units, starts now, lasts 5m
 *   pnpm db:seed --stock 100 --starts-in 1m --duration 10m
 *   pnpm db:seed --reset                          # start from a clean slate first
 *
 * --reset clears every place sale state lives, so nothing from an earlier run survives:
 *   - Postgres: all sale tables
 *   - SQS: pending purchase requests and results (DLQs are kept for inspection)
 *   - Redis: sold-out flags, dedupe keys and request statuses
 * Stop the API and worker first, or in-flight work may still reference the old sale.
 *
 * Stress tests call this with --reset to start every run from a known state.
 */
import { parseArgs } from 'node:util';
import { PurgeQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { parseDuration } from '../src/common/utils/duration';
import * as schema from '../src/infrastructure/database/schema';
import { RedisKeys } from '../src/infrastructure/redis/redis-keys';

const { values: args } = parseArgs({
  options: {
    stock: { type: 'string', default: '1000' },
    'starts-in': { type: 'string', default: '0s' },
    duration: { type: 'string', default: '5m' },
    reset: { type: 'boolean', default: false },
  },
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (copy .env.example to .env)`);
  return value;
}

async function seed(): Promise<void> {
  const stock = Number(args.stock);
  if (!Number.isInteger(stock) || stock <= 0) throw new Error('--stock must be a positive integer');

  const startsAt = new Date(Date.now() + parseDuration(args['starts-in']));
  const endsAt = new Date(startsAt.getTime() + parseDuration(args.duration));

  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    if (args.reset) {
      await purgeQueues();
      await clearRedis();
    }

    const sale = await db.transaction(async (tx) => {
      if (args.reset) {
        await tx.execute(
          sql`TRUNCATE ${schema.orders}, ${schema.purchaseRequests}, ${schema.flashSales}, ${schema.products}`,
        );
      }

      const [product] = await tx
        .insert(schema.products)
        .values({
          name: 'Aurora Wireless Earbuds',
          description: 'Limited-edition earbuds with active noise cancellation.',
          price: '79.00',
          imageUrl: '/static/products/aurora-earbuds.svg',
        })
        .returning();

      const [flashSale] = await tx
        .insert(schema.flashSales)
        .values({
          productId: product.id,
          startsAt,
          endsAt,
          totalStock: stock,
          remainingStock: stock,
        })
        .returning();

      return flashSale;
    });

    console.log(
      `Seeded flash sale ${sale.id}: ${sale.totalStock} units, ` +
        `${sale.startsAt.toISOString()} → ${sale.endsAt.toISOString()}`,
    );
  } finally {
    await pool.end();
  }
}

/** Drops queued messages that would otherwise reference sales we are about to delete. */
async function purgeQueues(): Promise<void> {
  const sqs = new SQSClient({
    region: requireEnv('AWS_REGION'),
    endpoint: process.env.SQS_ENDPOINT,
  });
  try {
    // Note: real SQS allows one purge per queue per 60s; ElasticMQ has no such limit.
    for (const name of ['PURCHASE_REQUESTS_QUEUE_URL', 'PURCHASE_RESULTS_QUEUE_URL']) {
      await sqs.send(new PurgeQueueCommand({ QueueUrl: requireEnv(name) }));
    }
  } finally {
    sqs.destroy();
  }
  console.log('Purged purchase-requests and purchase-results queues');
}

/** Deletes every sale-scoped key. SCAN (not KEYS) so it never blocks Redis. */
async function clearRedis(): Promise<void> {
  const redis = new Redis(requireEnv('REDIS_URL'));
  let deleted = 0;
  try {
    const stream = redis.scanStream({ match: RedisKeys.allSalesPattern, count: 500 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) deleted += await redis.unlink(...keys);
    }
  } finally {
    await redis.quit();
  }
  console.log(`Deleted ${deleted} sale key(s) from Redis`);
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
