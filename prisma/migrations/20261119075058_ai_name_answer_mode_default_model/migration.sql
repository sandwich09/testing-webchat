-- AI name, answer scope and the new default model (docs/architecture/data-model.md, "Migration
-- ที่หก", ADR 0026). Additive only: a new enum, a nullable column, a column with a default, and a
-- new column default for "aiModel". Changing a default never rewrites existing rows, so the
-- Settings row of an existing install keeps the model it holds; the admin changes it in Settings.
-- "aiAnswerMode" is added with DEFAULT 'general', so an existing row gets 'general' too.
-- Prisma also generated a drift fix for "Message"."seq" (SET/DROP DEFAULT and DROP SEQUENCE
-- "change_seq") because it cannot read the dbgenerated nextval default of init. That would break
-- polling, so it was removed by hand, as in the earlier migrations.

-- CreateEnum
CREATE TYPE "AiAnswerMode" AS ENUM ('knowledge_only', 'general');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "aiAnswerMode" "AiAnswerMode" NOT NULL DEFAULT 'general',
ADD COLUMN     "aiName" TEXT,
ALTER COLUMN "aiModel" SET DEFAULT 'claude-sonnet-5-5';
