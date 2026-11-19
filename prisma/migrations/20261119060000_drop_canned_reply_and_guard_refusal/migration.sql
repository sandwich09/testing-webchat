-- approved-destructive: feature removed from scope, never deployed, no production data
-- Drops what the removed canned replies and the fixed refusal text left unused
-- (docs/architecture/data-model.md, "Migration ที่ห้า", ADR 0024). The code before this migration
-- reads "Settings"."guardRefusalText" and the "CannedReply" table, so it must not run against the
-- database after it. No statement for "Message"."seq" or "change_seq": as in the earlier
-- migrations, the nextval default of init stays as it is.

-- DropTable (its index "CannedReply_sortOrder_idx" goes with it)
DROP TABLE "CannedReply";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "guardRefusalText";
