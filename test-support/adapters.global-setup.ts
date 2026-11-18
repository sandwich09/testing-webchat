import { execFileSync } from 'node:child_process';
import pg from 'pg';
import {
  ADAPTER_TEST_ADMIN_DATABASE_URL,
  ADAPTER_TEST_DATABASE_NAME,
  ADAPTER_TEST_DATABASE_URL,
} from './adapters.constants';

async function ensureTestDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: ADAPTER_TEST_ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      ADAPTER_TEST_DATABASE_NAME,
    ]);
    if (existing.rowCount === 0) {
      // Identifiers cannot be bound as parameters; the name is a fixed constant.
      await client.query(`CREATE DATABASE "${ADAPTER_TEST_DATABASE_NAME}"`);
    }
  } finally {
    await client.end();
  }
}

function migrateTestDatabase(): void {
  // prisma.config.ts reads DIRECT_URL first; variables already set win over .env.
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DIRECT_URL: ADAPTER_TEST_DATABASE_URL,
      DATABASE_URL: ADAPTER_TEST_DATABASE_URL,
    },
  });
}

export default async function setup(): Promise<void> {
  await ensureTestDatabase();
  migrateTestDatabase();
}
