-- Admin notes on a contact (docs/architecture/data-model.md, "Migration ที่แปด"). Additive only:
-- one new table with a foreign key to "Contact" and one index, so the code before it keeps
-- working. Notes are admin-only: never sent to LINE or the AI model, never logged.
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand, as in the earlier migrations.

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactNote_contactId_createdAt_idx" ON "ContactNote"("contactId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
