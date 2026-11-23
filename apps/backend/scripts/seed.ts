/**
 * Creates a product and a flash sale for it.
 *
 *   pnpm db:seed                                  # 1000 units, starts now, lasts 5m
 *   pnpm db:seed --stock 100 --starts-in 1m --duration 10m
 *   pnpm db:seed --reset                          # wipe all sale data first
 *
 * Stress tests call this with --reset to start every run from a known state.
 */
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseDuration } from '../src/common/utils/duration';
import * as schema from '../src/infrastructure/database/schema';

const { values: args } = parseArgs({
  options: {
    stock: { type: 'string', default: '1000' },
    'starts-in': { type: 'string', default: '0s' },
    duration: { type: 'string', default: '5m' },
    reset: { type: 'boolean', default: false },
  },
});

async function seed(): Promise<void> {
  const stock = Number(args.stock);
  if (!Number.isInteger(stock) || stock <= 0) throw new Error('--stock must be a positive integer');

  const startsAt = new Date(Date.now() + parseDuration(args['starts-in']));
  const endsAt = new Date(startsAt.getTime() + parseDuration(args.duration));

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://flashsale:flashsale@localhost:5433/flashsale',
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
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

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
