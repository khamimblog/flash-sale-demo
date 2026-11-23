import { z } from 'zod';

/**
 * Single source of truth for runtime configuration.
 * The process fails fast at boot if anything is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(20),

  REDIS_URL: z.url(),

  AWS_REGION: z.string().min(1).default('us-east-1'),
  /** Set for local SQS emulators (ElasticMQ); leave unset on real AWS. */
  SQS_ENDPOINT: z.url().optional(),
  PURCHASE_REQUESTS_QUEUE_URL: z.url(),
  PURCHASE_RESULTS_QUEUE_URL: z.url(),

  /** How long each API instance caches sale details in memory. */
  SALE_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(1_000),

  /** Concurrent SQS long-poll loops per worker process (each handles up to 10 messages). */
  WORKER_POLLERS: z.coerce.number().int().positive().default(4),
  /** Concurrent long-poll loops per API instance for the purchase-results queue. */
  NOTIFICATION_POLLERS: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
