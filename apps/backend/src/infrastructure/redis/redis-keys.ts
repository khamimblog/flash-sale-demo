/**
 * All Redis keys in one place.
 *
 * Every key is namespaced by sale and wrapped in a `{hash tag}`, so all keys of one
 * sale land in the same Redis Cluster slot and can be used together in one Lua script.
 */
const sale = (flashSaleId: string) => `flash-sale:{${flashSaleId}}`;

export const RedisKeys = {
  /** Present once the database has confirmed the sale has no stock left. */
  soldOut: (flashSaleId: string) => `${sale(flashSaleId)}:sold-out`,

  /** Points a user at their single purchase request for this sale (the dedupe key). */
  userRequest: (flashSaleId: string, userId: string) => `${sale(flashSaleId)}:user:${userId}`,

  /** Hash holding a purchase request's latest status. */
  request: (flashSaleId: string, purchaseRequestId: string) =>
    `${sale(flashSaleId)}:request:${purchaseRequestId}`,
} as const;

/** Pub/sub channels. */
export const RedisChannels = {
  /** Final purchase outcomes, fanned out to every API instance holding SSE connections. */
  purchaseUpdates: 'purchase-request-updates',
} as const;
