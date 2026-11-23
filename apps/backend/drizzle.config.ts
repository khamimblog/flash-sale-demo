import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './src/infrastructure/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://flashsale:flashsale@localhost:5433/flashsale',
  },
  casing: 'snake_case',
  strict: true,
});
