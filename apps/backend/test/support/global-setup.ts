import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { TEST_DATABASE_URL } from './test-database';
import { TEST_QUEUES } from './test-env';
import { createTestSqsClient, ensureQueue } from './test-queue';

/** Prepares isolated test resources: database (created + migrated) and SQS queues. */
export default async function globalSetup(): Promise<void> {
  await prepareDatabase();

  const sqs = createTestSqsClient();
  await Promise.all(Object.values(TEST_QUEUES).map((name) => ensureQueue(sqs, name)));
  sqs.destroy();
}

async function prepareDatabase(): Promise<void> {
  const testUrl = new URL(TEST_DATABASE_URL);
  const databaseName = testUrl.pathname.slice(1);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(__dirname, '../../src/infrastructure/database/migrations'),
    });
  } finally {
    await pool.end();
  }
}
