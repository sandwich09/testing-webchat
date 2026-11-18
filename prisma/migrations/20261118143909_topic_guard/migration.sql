-- Topic guard (docs/architecture/data-model.md, "Migration ที่สอง"). Additive only.
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand. ALTER TYPE ... ADD VALUE is accepted even inside a
-- transaction (PostgreSQL 12+) as long as nothing in the same transaction uses the new value, and
-- nothing in this file does.

-- AlterEnum
ALTER TYPE "AiOutcome" ADD VALUE 'blocked';

-- AlterEnum
ALTER TYPE "AiUsageKind" ADD VALUE 'guard';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "guardEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "guardRefusalText" TEXT NOT NULL DEFAULT 'คุยได้เฉพาะหัวข้อที่กำหนดไว้นะคะ',
ADD COLUMN     "guardTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
