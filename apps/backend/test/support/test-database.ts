import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../../src/infrastructure/database/database.tokens';
import * as schema from '../../src/infrastructure/database/schema';

/** Separate database so integration tests never touch local dev data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://flashsale:flashsale@localhost:5433/flashsale_test';

export function connectTestDatabase(): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 20 });
  return { db: drizzle(pool, { schema, casing: 'snake_case' }), pool };
}

export async function truncateAll(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE ${schema.orders}, ${schema.purchaseRequests}, ${schema.flashSales}, ${schema.products}`,
  );
}

export async function createSale(
  db: Database,
  options: { stock: number; startsAt?: Date; endsAt?: Date },
): Promise<schema.FlashSale> {
  const [product] = await db
    .insert(schema.products)
    .values({ name: 'Test Earbuds', price: '79.00' })
    .returning();

  const [sale] = await db
    .insert(schema.flashSales)
    .values({
      productId: product.id,
      startsAt: options.startsAt ?? new Date(Date.now() - 60_000),
      endsAt: options.endsAt ?? new Date(Date.now() + 60_000),
      totalStock: options.stock,
      remainingStock: options.stock,
    })
    .returning();
  return sale;
}
