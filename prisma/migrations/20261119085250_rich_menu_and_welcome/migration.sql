-- Rich menu, its button actions and the welcome card (docs/architecture/data-model.md,
-- "Migration ที่สิบ", ADR 0027). Additive only: two new values of "HandoffReason" and seven
-- Settings columns with defaults or NULL, so the code before this migration keeps working.
-- Existing installs get the welcome card on (welcomeEnabled true) and the default texts ('').
-- PostgreSQL 12 and later (Neon and the compose image run 17) accept several ADD VALUE in one
-- migration. Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP
-- SEQUENCE "change_seq"); that would break polling, so it was removed by hand, as before.

-- AlterEnum
ALTER TYPE "HandoffReason" ADD VALUE 'customer_asked_admin';
ALTER TYPE "HandoffReason" ADD VALUE 'ai_unavailable';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "howToText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "richMenuError" TEXT,
ADD COLUMN     "richMenuErrorAt" TIMESTAMPTZ(3),
ADD COLUMN     "richMenuId" TEXT,
ADD COLUMN     "richMenuPublishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "welcomeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "welcomeText" TEXT NOT NULL DEFAULT '';
