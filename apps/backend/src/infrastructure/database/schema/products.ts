import { check, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Catalog item. Exists independently of any sale. */
export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    imageUrl: text(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('products_price_non_negative', sql`${t.price} >= 0`)],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
