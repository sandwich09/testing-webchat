-- Fixes from the project review (docs/architecture/data-model.md, "Migration ที่สิบเอ็ด",
-- ADR 0028). Additive only: new nullable columns, a new enum, indexes and a database setting,
-- so the code before this migration keeps working. Prisma also generated a drift fix for
-- "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE "change_seq"); that would break polling,
-- so it was removed by hand, as before. The two indexes on expressions and a predicate cannot be
-- written in schema.prisma; `prisma migrate diff` leaves them alone.

-- Every timestamp is read and written in UTC by the driver adapter only while the session time
-- zone is UTC. A startup parameter is not reliably passed through a transaction-mode pooler, so
-- the database default is pinned instead. It applies to sessions opened after this statement.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET "TimeZone" TO %L', current_database(), 'UTC');
END
$$;

-- CreateEnum
CREATE TYPE "MediaFailure" AS ENUM ('unsupported_type', 'external_source', 'download_failed', 'interrupted');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "followStatusAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mediaFailure" "MediaFailure",
ADD COLUMN     "webhookEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_webhookEventId_key" ON "Message"("webhookEventId");

-- The order of the contact list (ContactRepository.list): newest customer message first.
CREATE INDEX "Contact_list_order_idx" ON "Contact" ((COALESCE("lastMessageAt", "createdAt")) DESC, "id" DESC);

-- Stuck AI recovery (recoverStuckAiStates) runs on every list poll; only replying rows matter.
CREATE INDEX "Contact_ai_replying_idx" ON "Contact" ("aiStateAt") WHERE "aiState" = 'replying';
