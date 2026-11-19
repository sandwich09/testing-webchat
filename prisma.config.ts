import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env itself; Node's loader avoids a dotenv dependency.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    // Fallback lets `prisma generate` run without a database (e.g. postinstall in CI).
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      'postgresql://unset:unset@localhost:5432/unset',
  },
});
