-- CreateSequence (shared by Message.seq, Message.updatedSeq and Contact.updatedSeq)
CREATE SEQUENCE change_seq AS BIGINT;

-- CreateEnum
CREATE TYPE "PoliteParticle" AS ENUM ('kha', 'khrap');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('following', 'unfollowed');

-- CreateEnum
CREATE TYPE "AiState" AS ENUM ('idle', 'replying');

-- CreateEnum
CREATE TYPE "HandoffReason" AS ENUM ('customer_sent_image', 'customer_sent_video', 'customer_sent_non_text', 'budget_reached', 'ai_not_in_knowledge', 'ai_needs_human_action', 'ai_unsafe_or_offtopic', 'ai_other', 'ai_failed', 'ai_timeout');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'internal');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('customer', 'admin', 'ai', 'system');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'video', 'sticker', 'other', 'event');

-- CreateEnum
CREATE TYPE "OtherKind" AS ENUM ('audio', 'file', 'location', 'unknown');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'ready', 'failed', 'too_large');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "KbStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "AiUsageKind" AS ENUM ('reply', 'ingest');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('ok', 'handoff', 'refused', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lineChannelSecretEnc" TEXT,
    "lineAccessTokenEnc" TEXT,
    "lineBotName" TEXT,
    "lineBasicId" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" TEXT NOT NULL DEFAULT 'claude',
    "aiModel" TEXT NOT NULL DEFAULT 'claude-opus-5-5',
    "aiDailyBudgetUsd" DECIMAL(18,9) NOT NULL DEFAULT 2,
    "aiPoliteParticle" "PoliteParticle" NOT NULL DEFAULT 'kha',
    "aiInstructions" TEXT NOT NULL DEFAULT '',
    "lastWebhookAt" TIMESTAMPTZ(3),
    "lastLineError" TEXT,
    "lastLineErrorAt" TIMESTAMPTZ(3),
    "lastAiError" TEXT,
    "lastAiErrorAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "followStatus" "FollowStatus" NOT NULL DEFAULT 'following',
    "followedAt" TIMESTAMPTZ(3),
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "needsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "needsAdminReason" "HandoffReason",
    "aiState" "AiState" NOT NULL DEFAULT 'idle',
    "aiStateAt" TIMESTAMPTZ(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMPTZ(3),
    "lastMessagePreview" TEXT,
    "lastMessageBy" "MessageAuthor",
    "lastMessageType" "MessageType",
    "replyToken" TEXT,
    "replyTokenExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedSeq" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT nextval('change_seq'),
    "updatedSeq" BIGINT NOT NULL DEFAULT 0,
    "contactId" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "type" "MessageType" NOT NULL,
    "otherKind" "OtherKind",
    "eventCode" TEXT,
    "text" TEXT,
    "mediaUrl" TEXT,
    "previewUrl" TEXT,
    "mediaStatus" "MediaStatus",
    "stickerPackageId" TEXT,
    "stickerId" TEXT,
    "lineMessageId" TEXT,
    "deliveryStatus" "DeliveryStatus",
    "deliveryError" TEXT,
    "retryKey" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbDocument" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "pageCount" INTEGER,
    "tokenCount" INTEGER,
    "extractedText" TEXT,
    "status" "KbStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KbDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" UUID NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "contactId" UUID,
    "messageId" UUID,
    "documentId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(18,9) NOT NULL,
    "outcome" "AiOutcome" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedReply" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CannedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_lineUserId_key" ON "Contact"("lineUserId");

-- CreateIndex
CREATE INDEX "Contact_lastMessageAt_idx" ON "Contact"("lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Contact_needsAdmin_idx" ON "Contact"("needsAdmin");

-- CreateIndex
CREATE INDEX "Contact_unreadCount_idx" ON "Contact"("unreadCount");

-- CreateIndex
CREATE INDEX "Contact_updatedSeq_idx" ON "Contact"("updatedSeq");

-- CreateIndex
CREATE UNIQUE INDEX "Message_seq_key" ON "Message"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Message_lineMessageId_key" ON "Message"("lineMessageId");

-- CreateIndex
CREATE INDEX "Message_contactId_seq_idx" ON "Message"("contactId", "seq");

-- CreateIndex
CREATE INDEX "Message_contactId_updatedSeq_idx" ON "Message"("contactId", "updatedSeq");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_webhookEventId_key" ON "WebhookEvent"("webhookEventId");

-- CreateIndex
CREATE UNIQUE INDEX "KbDocument_sha256_key" ON "KbDocument"("sha256");

-- CreateIndex
CREATE INDEX "KbDocument_status_idx" ON "KbDocument"("status");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_contactId_createdAt_idx" ON "AiUsage"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "CannedReply_sortOrder_idx" ON "CannedReply"("sortOrder");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KbDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Settings holds exactly one row
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_single_row" CHECK ("id" = 1);

-- updatedSeq: Contact and Message share change_seq with Message.seq
CREATE FUNCTION set_updated_seq() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Message' AND TG_OP = 'INSERT' THEN
    NEW."updatedSeq" := NEW."seq";
  ELSE
    NEW."updatedSeq" := nextval('change_seq');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Message_updated_seq" BEFORE INSERT OR UPDATE ON "Message"
  FOR EACH ROW EXECUTE FUNCTION set_updated_seq();
CREATE TRIGGER "Contact_updated_seq" BEFORE INSERT OR UPDATE ON "Contact"
  FOR EACH ROW EXECUTE FUNCTION set_updated_seq();
