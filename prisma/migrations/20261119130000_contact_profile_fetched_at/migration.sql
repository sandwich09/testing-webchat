-- Daily refresh of the LINE profile (docs/architecture/data-model.md, "Migration ที่สิบสอง",
-- ADR 0031). Additive only: one nullable column, so the code before this migration keeps
-- working. Prisma also generated the drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP
-- SEQUENCE "change_seq"); that would break polling, so it was removed by hand, as before.

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "profileFetchedAt" TIMESTAMPTZ(3);
