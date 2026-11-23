import { check, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products';

/**
 * A time-boxed sale of one product. Stock allocated to the sale lives here
 * (not on the product), so this row is what the purchase transaction locks.
 */
export const flashSales = pgTable(
  'flash_sales',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    totalStock: integer().notNull(),
    remainingStock: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('flash_sales_window_valid', sql`${t.endsAt} > ${t.startsAt}`),
    check('flash_sales_total_stock_positive', sql`${t.totalStock} > 0`),
    // Last line of defence against overselling, independent of application code.
    check(
      'flash_sales_remaining_stock_in_range',
      sql`${t.remainingStock} BETWEEN 0 AND ${t.totalStock}`,
    ),
  ],
);

export type FlashSale = typeof flashSales.$inferSelect;
export type NewFlashSale = typeof flashSales.$inferInsert;
