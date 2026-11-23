/**
 * Environment for integration tests. Runs before any test module is imported, so
 * the app's config validation sees these values. Everything points at isolated
 * resources: a separate database, Redis DB index 1 and dedicated test queues.
 */
const SQS_ENDPOINT = 'http://localhost:9324';

export const TEST_QUEUES = {
  purchaseRequests: 'purchase-requests-test',
  purchaseResults: 'purchase-results-test',
} as const;

export const testQueueUrl = (name: string) => `${SQS_ENDPOINT}/000000000000/${name}`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgres://flashsale:flashsale@localhost:5433/flashsale_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  SQS_ENDPOINT,
  PURCHASE_REQUESTS_QUEUE_URL: testQueueUrl(TEST_QUEUES.purchaseRequests),
  PURCHASE_RESULTS_QUEUE_URL: testQueueUrl(TEST_QUEUES.purchaseResults),
  // Tests create and delete sales between cases; caching would leak state across them.
  SALE_CACHE_TTL_MS: '0',
});
