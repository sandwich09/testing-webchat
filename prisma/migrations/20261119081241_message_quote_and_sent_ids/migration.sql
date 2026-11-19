-- Quoted messages (docs/architecture/data-model.md, "Migration ที่เจ็ด"). Additive only: two new
-- columns on "Message" and one index, so the code before this migration keeps working.
-- "quotedLineMessageId" is the LINE message id an inbound text quotes (message.quotedMessageId);
-- "lineSentIds" holds the LINE ids of the parts of an outbound message (sentMessages[].id) so a
-- quote of a message the admin or the AI sent can be found. Rows written before stay NULL and
-- empty: quotes of them show as unavailable.
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand, as in the earlier migrations.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "lineSentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "quotedLineMessageId" TEXT;

-- CreateIndex
CREATE INDEX "Message_lineSentIds_idx" ON "Message" USING GIN ("lineSentIds");
