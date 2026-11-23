import { PurchaseStatus } from '@flash-sale-demo/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { PurchaseRequestMessage } from '../../common/messages/purchase-request.message';
import {
  DATABASE,
  type Database,
  type DatabaseTransaction,
} from '../../infrastructure/database/database.tokens';
import { flashSales, orders, purchaseRequests } from '../../infrastructure/database/schema';
import { isWithinWindow } from '../sale/sale-status';

export interface FulfillmentOutcome {
  status: PurchaseStatus;
  /** True when the database confirms the sale has no stock left. */
  soldOut: boolean;
}

@Injectable()
export class FulfillmentRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Decides a purchase request atomically. Correctness relies on the database,
   * not on application locks:
   *   - `purchase_requests.id` primary key   → redelivered messages are detected
   *   - `orders (flash_sale_id, user_id)` unique → one item per user
   *   - conditional `UPDATE ... WHERE remaining_stock > 0` → no overselling
   */
  fulfill(request: PurchaseRequestMessage): Promise<FulfillmentOutcome> {
    return this.db.transaction(async (tx) => {
      const isFirstDelivery = await this.recordRequest(tx, request);
      if (!isFirstDelivery) return this.previousOutcome(tx, request.purchaseRequestId);

      const outcome = await this.decide(tx, request);

      await tx
        .update(purchaseRequests)
        .set({ status: outcome.status, processedAt: new Date() })
        .where(eq(purchaseRequests.id, request.purchaseRequestId));

      return outcome;
    });
  }

  /**
   * Steps are ordered from cheapest to most contended, so the hot stock row is
   * only locked by requests that can actually buy.
   */
  private async decide(
    tx: DatabaseTransaction,
    request: PurchaseRequestMessage,
  ): Promise<FulfillmentOutcome> {
    const [sale] = await tx
      .select({
        startsAt: flashSales.startsAt,
        endsAt: flashSales.endsAt,
        remainingStock: flashSales.remainingStock,
      })
      .from(flashSales)
      .where(eq(flashSales.id, request.flashSaleId));

    // 1. Sale window, judged by when the API accepted the request (not when we process it).
    if (!isWithinWindow(sale, new Date(request.acceptedAt))) {
      return { status: PurchaseStatus.SALE_NOT_ACTIVE, soldOut: false };
    }

    // 2. Cheap early exit from a non-locking read. Not relied on for correctness.
    if (sale.remainingStock === 0) {
      return { status: PurchaseStatus.SOLD_OUT, soldOut: true };
    }

    // 3. One item per user: the unique constraint decides, even under concurrency.
    const [order] = await tx
      .insert(orders)
      .values({
        flashSaleId: request.flashSaleId,
        userId: request.userId,
        purchaseRequestId: request.purchaseRequestId,
      })
      .onConflictDoNothing({ target: [orders.flashSaleId, orders.userId] })
      .returning({ id: orders.id });
    if (!order) {
      return { status: PurchaseStatus.ALREADY_PURCHASED, soldOut: false };
    }

    // 4. Take one unit. Row lock + re-checked WHERE means concurrent workers can never oversell.
    const [stock] = await tx
      .update(flashSales)
      .set({ remainingStock: sql`${flashSales.remainingStock} - 1` })
      .where(and(eq(flashSales.id, request.flashSaleId), gt(flashSales.remainingStock, 0)))
      .returning({ remainingStock: flashSales.remainingStock });
    if (!stock) {
      // Sold out between steps 2 and 4: undo the order inserted in step 3.
      await tx.delete(orders).where(eq(orders.id, order.id));
      return { status: PurchaseStatus.SOLD_OUT, soldOut: true };
    }

    return { status: PurchaseStatus.SUCCESS, soldOut: stock.remainingStock === 0 };
  }

  /** Returns false if this request was already recorded, i.e. the message is a redelivery. */
  private async recordRequest(
    tx: DatabaseTransaction,
    request: PurchaseRequestMessage,
  ): Promise<boolean> {
    const inserted = await tx
      .insert(purchaseRequests)
      .values({
        id: request.purchaseRequestId,
        flashSaleId: request.flashSaleId,
        userId: request.userId,
        status: PurchaseStatus.PENDING,
        acceptedAt: new Date(request.acceptedAt),
      })
      .onConflictDoNothing({ target: purchaseRequests.id })
      .returning({ id: purchaseRequests.id });
    return inserted.length > 0;
  }

  private async previousOutcome(
    tx: DatabaseTransaction,
    purchaseRequestId: string,
  ): Promise<FulfillmentOutcome> {
    // The earlier delivery committed atomically, so its status is already final.
    const [previous] = await tx
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, purchaseRequestId));
    return { status: previous.status, soldOut: previous.status === PurchaseStatus.SOLD_OUT };
  }
}
