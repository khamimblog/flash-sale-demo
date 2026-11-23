import type { PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../infrastructure/database/database.tokens';
import { purchaseRequests, type PurchaseRequest } from '../../infrastructure/database/schema';

/**
 * Durable fallback for request lookups when the Redis copy is missing
 * (expired, or Redis lost data). Only contains requests the worker has processed.
 */
@Injectable()
export class PurchaseRequestRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(flashSaleId: string, id: string): Promise<PurchaseRequestResponse | null> {
    const [row] = await this.db
      .select()
      .from(purchaseRequests)
      .where(and(eq(purchaseRequests.flashSaleId, flashSaleId), eq(purchaseRequests.id, id)));
    return row ? toResponse(row) : null;
  }

  async findLatestByUser(
    flashSaleId: string,
    userId: string,
  ): Promise<PurchaseRequestResponse | null> {
    const [row] = await this.db
      .select()
      .from(purchaseRequests)
      .where(
        and(eq(purchaseRequests.flashSaleId, flashSaleId), eq(purchaseRequests.userId, userId)),
      )
      .orderBy(desc(purchaseRequests.acceptedAt))
      .limit(1);
    return row ? toResponse(row) : null;
  }
}

function toResponse(row: PurchaseRequest): PurchaseRequestResponse {
  return {
    purchaseRequestId: row.id,
    flashSaleId: row.flashSaleId,
    userId: row.userId,
    status: row.status,
    updatedAt: (row.processedAt ?? row.acceptedAt).toISOString(),
  };
}
