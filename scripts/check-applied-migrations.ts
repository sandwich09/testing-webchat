// D1 at deploy time: fails when a migration the database has applied is missing from
// prisma/migrations or its migration.sql changed since. `prisma migrate deploy` applies pending
// migrations only and accepts both cases silently (verified with Prisma 7.10.1), so this runs
// right before it against the same database.
//   pnpm migrations:applied   (reads DIRECT_URL, else DATABASE_URL)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { findAppliedMismatches, MIGRATIONS_DIR } from './migrations.logic';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (url === undefined || url === '') {
  console.error('migrations:applied: DIRECT_URL or DATABASE_URL is required.');
  process.exit(1);
}

const local = new Map<string, string>();
for (const dir of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
  const file = `${MIGRATIONS_DIR}/${dir.name}/migration.sql`;
  if (dir.isDirectory() && existsSync(file)) {
    local.set(dir.name, createHash('sha256').update(readFileSync(file)).digest('hex'));
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const table = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS "exists"`,
  );
  const applied =
    table.rows[0]?.exists === true
      ? (
          await client.query<{ name: string; checksum: string }>(
            `SELECT "migration_name" AS "name", "checksum" FROM "_prisma_migrations"
             WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL ORDER BY 1`,
          )
        ).rows
      : [];
  const mismatches = findAppliedMismatches(applied, local);
  if (mismatches.length === 0) {
    console.log(`migrations:applied: ok (${String(applied.length)} applied migration(s) match).`);
  } else {
    for (const m of mismatches) console.error(`${MIGRATIONS_DIR}/${m.name}: ${m.reason}`);
    console.error(
      '\nApplied migrations are immutable. Restore the files from Git history and put the change in a new migration directory.',
    );
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
