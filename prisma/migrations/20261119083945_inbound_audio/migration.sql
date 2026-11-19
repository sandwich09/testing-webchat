-- Inbound audio (docs/architecture/data-model.md, "Migration ที่เก้า"). Additive only: a new value
-- of the "MessageType" enum and one nullable column, so the code before this migration keeps
-- working (it never reads type 'audio' rows; audio received before stays type 'other').
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand, as in the earlier migrations.

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'audio';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mediaDurationMs" INTEGER;
