import { afterAll, describe, expect, it } from 'vitest';
import { describeSettingsRepositorySuite } from '@/adapters/fakes';
import type { Clock } from '@/core/ports';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { getPrismaClient } from './prisma-client';
import { createSettingsRepository } from './settings.repository';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);
const clock: Clock = {
  now: () => new Date('2026-11-18T04:00:00.000Z'),
  sleep: () => Promise.resolve(),
  startTimer: () => ({ fired: new Promise<void>(() => undefined), cancel: () => undefined }),
};

afterAll(() => client.$disconnect());

describeSettingsRepositorySuite(async () => {
  await client.settings.deleteMany();
  return createSettingsRepository(client, { clock });
});

describe('createSettingsRepository (Postgres)', () => {
  it('keeps a single row and stamps updatedAt from the injected clock', async () => {
    await client.settings.deleteMany();
    const repo = createSettingsRepository(client, { clock });
    await Promise.all([repo.get(), repo.get(), repo.update({ aiEnabled: true })]);
    const rows = await client.settings.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updatedAt).toEqual(clock.now());
  });

  it('stores the budget as Decimal(18, 9) without rounding', async () => {
    await client.settings.deleteMany();
    const repo = createSettingsRepository(client, { clock });
    await repo.update({ aiDailyBudget: 123_456_789_012_345_678n as never }); // brand: nano-USD
    const row = await client.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect(row.aiDailyBudgetUsd.toFixed(9)).toBe('123456789.012345678');
    expect((await repo.get()).aiDailyBudget).toBe(123_456_789_012_345_678n);
  });

  it('turns AI off with the one SQL statement of the operations runbook, read at once by get', async () => {
    await client.settings.deleteMany();
    const repo = createSettingsRepository(client, { clock });
    await repo.update({ aiEnabled: true });
    // docs/runbooks/operations.md "หยุด AI ทันที", when the web page cannot be reached.
    await client.$executeRawUnsafe('UPDATE "Settings" SET "aiEnabled" = false WHERE "id" = 1;');
    expect((await repo.get()).aiEnabled).toBe(false);
  });

  it('the database runs every session in UTC (database default set by migration)', async () => {
    const rows = await client.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
    expect(rows[0]?.TimeZone).toBe('UTC');
    const setting = await client.$queryRaw<{ setconfig: string[] }[]>`
      SELECT s."setconfig" FROM "pg_db_role_setting" s
      JOIN "pg_database" d ON d."oid" = s."setdatabase"
      WHERE d."datname" = current_database() AND s."setrole" = 0`;
    expect(setting.flatMap((r) => r.setconfig)).toContain('TimeZone=UTC');
  });
});
