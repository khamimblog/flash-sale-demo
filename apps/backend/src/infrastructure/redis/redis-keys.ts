/**
 * All Redis keys in one place.
 *
 * Every key is namespaced by sale and wrapped in a `{hash tag}`, so all keys of one
 * sale land in the same Redis Cluster slot and can be used together in one Lua script.
 */
const sale = (flashSaleId: string) => `flash-sale:{${flashSaleId}}`;

/** Long enough to outlive any sale. Losing a key early is safe: see each key's notes. */
export const SALE_KEY_TTL_SECONDS = 24 * 60 * 60;

export const RedisKeys = {
  /**
   * Units the API may still admit: decremented per accepted request, so only about
   * `stock` requests ever reach the queue. Seeded from Postgres on first use, which
   * also makes a lost key safe (it can only over-admit; the database rejects extras).
   * Postgres remains the source of truth.
   */
  stock: (flashSaleId: string) => `${sale(flashSaleId)}:stock`,

  /** Points a user at their single purchase request for this sale (the dedupe key). */
  userRequest: (flashSaleId: string, userId: string) => `${sale(flashSaleId)}:user:${userId}`,

  /** Hash holding a purchase request's latest status. */
  request: (flashSaleId: string, purchaseRequestId: string) =>
    `${sale(flashSaleId)}:request:${purchaseRequestId}`,

  /** SCAN pattern matching every key of every sale (used by dev/test resets). */
  allSalesPattern: 'flash-sale:*',
} as const;

/** Pub/sub channels. */
export const RedisChannels = {
  /** Final purchase outcomes, fanned out to every API instance holding SSE connections. */
  purchaseUpdates: 'purchase-request-updates',
} as const;
