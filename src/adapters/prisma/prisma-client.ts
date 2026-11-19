import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export type { PrismaClient };

const POOL_MAX = 5;

const globalForPrisma = globalThis as unknown as { __webchatPrisma?: PrismaClient };

/**
 * One client per process. The instance is kept on `globalThis` so `next dev` hot reloads
 * do not open a new connection pool each time.
 */
export function getPrismaClient(databaseUrl: string): PrismaClient {
  globalForPrisma.__webchatPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: POOL_MAX }),
  });
  return globalForPrisma.__webchatPrisma;
}
