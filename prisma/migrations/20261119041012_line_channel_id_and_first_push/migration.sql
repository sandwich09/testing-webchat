-- The first push of an outbound message and the LINE Channel ID (docs/architecture/data-model.md,
-- "Migration ที่สี่"). Additive only: three nullable columns, so the code before this migration
-- keeps working. Rows written before it stay NULL: a message without "firstPushAt" has no retry
-- key window yet, and Settings without "lineChannelId" shows the channel secret as unverified.
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand, as in the earlier migrations.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "firstPushAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "lineChannelId" TEXT,
ADD COLUMN     "lineSecretVerifiedAt" TIMESTAMPTZ(3);
