import { z } from 'zod';

export const purchaseRequestMessageSchema = z.object({
  purchaseRequestId: z.uuid(),
  flashSaleId: z.uuid(),
  userId: z.string().min(1),
  acceptedAt: z.iso.datetime(),
});

export type PurchaseRequestMessage = z.infer<typeof purchaseRequestMessageSchema>;
