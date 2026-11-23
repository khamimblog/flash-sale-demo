import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { flashSales } from './flash-sales';
import { purchaseRequests } from './purchase-requests';

/** A successful purchase. One row = one unit sold. */
export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    flashSaleId: uuid()
      .notNull()
      .references(() => flashSales.id),
    userId: text().notNull(),
    purchaseRequestId: uuid()
      .notNull()
      .references(() => purchaseRequests.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Enforces "one item per user" at the database level.
    unique('orders_one_per_user_per_sale').on(t.flashSaleId, t.userId),
    unique('orders_purchase_request_id_unique').on(t.purchaseRequestId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
