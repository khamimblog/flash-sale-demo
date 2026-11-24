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
  /** True when an earlier delivery of this message already decided it. */
  redelivered: boolean;
}

const decided = (status: PurchaseStatus, soldOut = false): FulfillmentOutcome => ({
  status,
  soldOut,
  redelivered: false,
});

@Injectable()
export class FulfillmentRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Every buyer of a sale needs the same stock row, so its lock is taken last and the
   * transaction commits right after: the lock is held for one UPDATE plus the COMMIT.
   */
  fulfill(request: PurchaseRequestMessage): Promise<FulfillmentOutcome> {
    return this.db.transaction(async (tx) => {
      const sale = await this.findSale(tx, request.flashSaleId);
      const status = !isWithinWindow(sale, new Date(request.acceptedAt))
        ? PurchaseStatus.SALE_NOT_ACTIVE
        : sale.remainingStock === 0
          ? PurchaseStatus.SOLD_OUT
          : PurchaseStatus.SUCCESS;

      const isFirstDelivery = await this.recordRequest(tx, request, status);
      if (!isFirstDelivery) return this.previousOutcome(tx, request.purchaseRequestId);
      if (status !== PurchaseStatus.SUCCESS) {
        return decided(status, status === PurchaseStatus.SOLD_OUT);
      }

      const orderId = await this.insertOrder(tx, request);
      if (!orderId) return this.correctStatus(tx, request, PurchaseStatus.ALREADY_PURCHASED);

      const remainingStock = await this.takeUnit(tx, request.flashSaleId);
      if (remainingStock === null) {
        await tx.delete(orders).where(eq(orders.id, orderId));
        return this.correctStatus(tx, request, PurchaseStatus.SOLD_OUT);
      }
      return decided(PurchaseStatus.SUCCESS, remainingStock === 0);
    });
  }

  private async findSale(tx: DatabaseTransaction, flashSaleId: string) {
    const [sale] = await tx
      .select({
        startsAt: flashSales.startsAt,
        endsAt: flashSales.endsAt,
        remainingStock: flashSales.remainingStock,
      })
      .from(flashSales)
      .where(eq(flashSales.id, flashSaleId));
    if (!sale) throw new Error(`Flash sale ${flashSaleId} not found`);
    return sale;
  }

  private async recordRequest(
    tx: DatabaseTransaction,
    request: PurchaseRequestMessage,
    status: PurchaseStatus,
  ): Promise<boolean> {
    const inserted = await tx
      .insert(purchaseRequests)
      .values({
        id: request.purchaseRequestId,
        flashSaleId: request.flashSaleId,
        userId: request.userId,
        status,
        acceptedAt: new Date(request.acceptedAt),
        processedAt: new Date(),
      })
      .onConflictDoNothing({ target: purchaseRequests.id })
      .returning({ id: purchaseRequests.id });
    return inserted.length > 0;
  }

  private async insertOrder(
    tx: DatabaseTransaction,
    request: PurchaseRequestMessage,
  ): Promise<string | null> {
    const [order] = await tx
      .insert(orders)
      .values({
        flashSaleId: request.flashSaleId,
        userId: request.userId,
        purchaseRequestId: request.purchaseRequestId,
      })
      .onConflictDoNothing({ target: [orders.flashSaleId, orders.userId] })
      .returning({ id: orders.id });
    return order?.id ?? null;
  }

  /** Returns the stock left after taking one unit, or null if none was left. */
  private async takeUnit(tx: DatabaseTransaction, flashSaleId: string): Promise<number | null> {
    const [stock] = await tx
      .update(flashSales)
      .set({ remainingStock: sql`${flashSales.remainingStock} - 1` })
      .where(and(eq(flashSales.id, flashSaleId), gt(flashSales.remainingStock, 0)))
      .returning({ remainingStock: flashSales.remainingStock });
    return stock?.remainingStock ?? null;
  }

  private async correctStatus(
    tx: DatabaseTransaction,
    request: PurchaseRequestMessage,
    status: PurchaseStatus,
  ): Promise<FulfillmentOutcome> {
    await tx
      .update(purchaseRequests)
      .set({ status })
      .where(eq(purchaseRequests.id, request.purchaseRequestId));
    return decided(status, status === PurchaseStatus.SOLD_OUT);
  }

  private async previousOutcome(
    tx: DatabaseTransaction,
    purchaseRequestId: string,
  ): Promise<FulfillmentOutcome> {
    const [previous] = await tx
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, purchaseRequestId));
    return {
      status: previous.status,
      soldOut: previous.status === PurchaseStatus.SOLD_OUT,
      redelivered: true,
    };
  }
}
