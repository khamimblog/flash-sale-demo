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

type Decision = Omit<FulfillmentOutcome, 'redelivered'>;

@Injectable()
export class FulfillmentRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  fulfill(request: PurchaseRequestMessage): Promise<FulfillmentOutcome> {
    return this.db.transaction(async (tx) => {
      const isFirstDelivery = await this.recordRequest(tx, request);
      if (!isFirstDelivery) return this.previousOutcome(tx, request.purchaseRequestId);

      const decision = await this.decide(tx, request);

      await tx
        .update(purchaseRequests)
        .set({ status: decision.status, processedAt: new Date() })
        .where(eq(purchaseRequests.id, request.purchaseRequestId));

      return { ...decision, redelivered: false };
    });
  }

  private async decide(
    tx: DatabaseTransaction,
    request: PurchaseRequestMessage,
  ): Promise<Decision> {
    const [sale] = await tx
      .select({
        startsAt: flashSales.startsAt,
        endsAt: flashSales.endsAt,
        remainingStock: flashSales.remainingStock,
      })
      .from(flashSales)
      .where(eq(flashSales.id, request.flashSaleId));

    if (!isWithinWindow(sale, new Date(request.acceptedAt))) {
      return { status: PurchaseStatus.SALE_NOT_ACTIVE, soldOut: false };
    }

    if (sale.remainingStock === 0) {
      return { status: PurchaseStatus.SOLD_OUT, soldOut: true };
    }

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

    const [stock] = await tx
      .update(flashSales)
      .set({ remainingStock: sql`${flashSales.remainingStock} - 1` })
      .where(and(eq(flashSales.id, request.flashSaleId), gt(flashSales.remainingStock, 0)))
      .returning({ remainingStock: flashSales.remainingStock });
    if (!stock) {
      await tx.delete(orders).where(eq(orders.id, order.id));
      return { status: PurchaseStatus.SOLD_OUT, soldOut: true };
    }

    return { status: PurchaseStatus.SUCCESS, soldOut: stock.remainingStock === 0 };
  }

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
