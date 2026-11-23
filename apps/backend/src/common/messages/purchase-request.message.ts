import { z } from 'zod';

/** Published by the API to the purchase-requests queue; consumed by the worker. */
export const purchaseRequestMessageSchema = z.object({
  purchaseRequestId: z.uuid(),
  flashSaleId: z.uuid(),
  userId: z.string().min(1),
  /** When the API accepted the request. The sale window is judged against this. */
  acceptedAt: z.iso.datetime(),
});

export type PurchaseRequestMessage = z.infer<typeof purchaseRequestMessageSchema>;
