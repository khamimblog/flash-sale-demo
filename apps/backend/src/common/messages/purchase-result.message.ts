import { PurchaseStatus } from '@flash-sale-demo/shared-types';
import { z } from 'zod';

export const purchaseResultMessageSchema = z.object({
  purchaseRequestId: z.uuid(),
  flashSaleId: z.uuid(),
  userId: z.string().min(1),
  status: z.enum(PurchaseStatus),
  processedAt: z.iso.datetime(),
});

export type PurchaseResultMessage = z.infer<typeof purchaseResultMessageSchema>;
