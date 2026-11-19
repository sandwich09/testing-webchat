-- When the current delivery attempt of an outbound message started (docs/architecture/data-model.md,
-- "Migration ที่สาม"). Additive only: one nullable column, so the code before this migration keeps
-- working. Rows written before it stay NULL and are judged by "createdAt".
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand, as in the topic_guard migration.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deliveryAttemptAt" TIMESTAMPTZ(3);
