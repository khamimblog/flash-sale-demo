import { validateEnv } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  PURCHASE_REQUESTS_QUEUE_URL: 'http://localhost:9324/000000000000/purchase-requests',
  PURCHASE_RESULTS_QUEUE_URL: 'http://localhost:9324/000000000000/purchase-results',
};

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...validEnv, API_PORT: '4000' });

    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_POOL_SIZE).toBe(20);
  });

  it('fails fast with a readable message when required values are missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
