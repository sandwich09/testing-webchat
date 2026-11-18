# Data model

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

ฐานข้อมูลคือ PostgreSQL 17 เข้าถึงผ่าน Prisma 7 ตารางด้านล่างอธิบายความหมายของแต่ละ field ชื่อและชนิดจริงอยู่ในหัวข้อ [Prisma schema](#prisma-schema) ท้ายเอกสาร Type ของ domain และสัญญาของ repository อยู่ใน [domain-and-ports](domain-and-ports.md)

## ข้อกำหนดร่วม

- id สร้างในแอป เป็น UUID แบบเรียงตามเวลา
- เวลาเก็บเป็น UTC ทั้งหมด
- ราคาเก็บเป็นทศนิยมแบบแม่นยำ ไม่ใช้ float
- ไม่มี type ของ Prisma ออกนอก adapter โดย repository แปลงเป็น entity ของ domain
- เวลาทุก field แอปเป็นผู้ใส่จาก port `Clock` ฐานข้อมูลไม่มีค่าเริ่มต้นของเวลา เพื่อให้ test ควบคุมเวลาได้
- ฐานข้อมูลมี sequence เดียวชื่อ `change_seq` ใช้ทั้ง `Message.seq`, `Message.updatedSeq` และ `Contact.updatedSeq` ซึ่งฐานข้อมูลตั้งให้ทุกครั้งที่แถวถูกสร้างหรือแก้ ใช้เป็น cursor ของ polling ตาม [api-contract](api-contract.md#protocol-ของ-polling)
- เงินเก็บเป็น `Decimal(18, 9)` (ดอลลาร์ ทศนิยม 9 ตำแหน่ง) ส่วนแกนกลางใช้จำนวนเต็มหน่วย nano-USD ตาม [domain-and-ports](domain-and-ports.md#กติการ่วม) จึงแปลงได้พอดีไม่มีการปัด

## ตาราง

### Settings (แถวเดียว)

| Field | หมายเหตุ |
| --- | --- |
| lineChannelSecretEnc, lineAccessTokenEnc | เข้ารหัสด้วย AES-256-GCM ไม่มี API ใดคืนค่า |
| lineBotName, lineBasicId | ได้จากการทดสอบการเชื่อมต่อ |
| aiEnabled | kill switch ค่าเริ่มต้นปิด ([ค่าเริ่มต้นของระบบที่ติดตั้งใหม่](project-setup.md#101-แกนกลาง)) |
| aiProvider, aiModel | ค่าเริ่มต้น `claude` และ `DEFAULT_AI_MODEL` |
| aiDailyBudgetUsd | งบต่อวัน ค่าเริ่มต้น `DEFAULT_AI_DAILY_BUDGET_USD` |
| aiPoliteParticle | `ค่ะ` หรือ `ครับ` ค่าเริ่มต้น `DEFAULT_POLITE_PARTICLE` |
| aiInstructions | คำแนะนำสำหรับ AI ที่ร้านเขียนเอง |
| guardEnabled | ขอบเขตหัวข้อ ค่าเริ่มต้นปิด ([topic-guard](../specs/topic-guard.md)) |
| guardTopics | รายการหัวข้อ (array ของข้อความ) ค่าเริ่มต้นว่าง ไม่เกิน `GUARD_MAX_TOPICS` รายการ |
| guardRefusalText | ข้อความที่ส่งให้ลูกค้าเมื่อถูกกัน ค่าเริ่มต้น `DEFAULT_GUARD_REFUSAL_TEXT` |
| lastWebhookAt, lastLineError, lastLineErrorAt, lastAiError, lastAiErrorAt | ใช้ในส่วนสถานะระบบ error เก็บเป็นรหัสจาก [error-catalog](error-catalog.md) ไม่เก็บข้อความจากบริการภายนอก |
| updatedAt | |

### Contact

ลูกค้าหนึ่งคนบน LINE เท่ากับหนึ่งแชท

| Field | หมายเหตุ |
| --- | --- |
| lineUserId | unique |
| displayName, pictureUrl | จาก profile API อาจว่างได้ |
| followStatus, followedAt | `following` หรือ `unfollowed` และเวลาที่เพิ่มเพื่อนล่าสุด ใช้ในแผงข้อมูลลูกค้า |
| aiEnabled | สวิตช์ AI ตอบแทนรายลูกค้า ลูกค้าใหม่เป็น false จำค่าไว้แม้ kill switch ปิด และกลายเป็น false เมื่อแอดมินส่งข้อความ ([ai-reply](../specs/ai-reply.md#เมื่อแอดมินตอบเอง)) |
| needsAdmin, needsAdminReason | สถานะรอแอดมิน และเหตุผลเป็นค่าของ `HandoffReason`: `customer_sent_image`, `customer_sent_video`, `customer_sent_non_text`, `budget_reached`, `ai_not_in_knowledge`, `ai_needs_human_action`, `ai_unsafe_or_offtopic`, `ai_other`, `ai_failed`, `ai_timeout` ข้อความไทยอยู่ใน [error-catalog](error-catalog.md#เหตุผลของสถานะรอแอดมิน) |
| aiState, aiStateAt | `idle` หรือ `replying` ใช้ตรวจงานที่ค้าง และเป็น lock ต่อลูกค้า |
| unreadCount, lastMessageAt, lastMessagePreview, lastMessageBy, lastMessageType | ใช้ในรายชื่อ `lastMessagePreview` มีค่าเฉพาะข้อความตัวอักษร ชนิดอื่นหน้าเว็บแสดงคำตาม `lastMessageType` |
| replyToken, replyTokenExpiresAt | token ล่าสุดที่ยังไม่ได้ใช้ |
| createdAt | |
| updatedSeq | ค่าใหม่จาก sequence ของ `Message.seq` ทุกครั้งที่แถวถูกสร้างหรือแก้ ใช้เป็น cursor ของ polling รายชื่อ |

Index: `lastMessageAt`, และ `needsAdmin` กับ `unreadCount` สำหรับตัวกรอง และ `updatedSeq` สำหรับ polling

### Message

| Field | หมายเหตุ |
| --- | --- |
| seq | เลขลำดับเพิ่มขึ้นเรื่อย ๆ ใช้เป็น cursor ของ polling และลำดับการแสดง |
| contactId | |
| direction | `inbound`, `outbound` หรือ `internal` (บรรทัดเหตุการณ์ ไม่ได้ส่งถึงใคร) |
| author | `customer`, `admin`, `ai` หรือ `system` (บรรทัดเหตุการณ์) |
| type | `text`, `image`, `video`, `sticker`, `other`, `event` |
| otherKind | `audio`, `file`, `location` หรือ `unknown` เมื่อ type เป็น `other` ใช้แสดงป้ายบอกประเภท |
| eventCode | รหัสของบรรทัดเหตุการณ์ (`EventCode` ใน [domain-and-ports](domain-and-ports.md#enum): `handoff.{HandoffReason}`, `ai.turned_off_by_admin`, `guard.blocked`, `contact.followed`, `contact.unfollowed`) เช่น `handoff.customer_sent_image` เมื่อ type เป็น `event` ข้อความไทยอยู่ใน [error-catalog](error-catalog.md#บรรทัดเหตุการณ์) |
| text | |
| mediaUrl, previewUrl, mediaStatus | สำหรับรูปและวิดีโอ `mediaStatus` เป็น `pending`, `ready`, `failed` หรือ `too_large` |
| stickerPackageId, stickerId | |
| lineMessageId | unique ใช้กันข้อความขาเข้าซ้ำ |
| deliveryStatus, deliveryError | `pending`, `sent`, `failed` เฉพาะข้อความขาออก `deliveryError` เป็นรหัสจาก [error-catalog](error-catalog.md) |
| retryKey | ใช้กับ LINE ทุกครั้งที่ส่งข้อความเดิม เท่ากับ id ของข้อความขาออก |
| createdAt, sentAt | |
| updatedSeq | เท่ากับ `seq` ตอนสร้าง และได้ค่าใหม่ทุกครั้งที่แถวถูกแก้ เช่น สถานะการส่งหรือสถานะสื่อ ใช้ใน polling |

id ของข้อความขาออกสร้างที่หน้าเว็บ จึงกันการส่งซ้ำได้ด้วย primary key

Index: `(contactId, seq)` และ `(contactId, updatedSeq)` (`countEventsByCode` ของส่วน Guardrails กรองด้วย `type` และ `createdAt` ไม่มี index เพิ่ม เพราะข้อมูลของร้านเดียวมีไม่มาก)

### WebhookEvent

| Field | หมายเหตุ |
| --- | --- |
| webhookEventId | unique ใช้กัน event ซ้ำ |
| type, receivedAt | |

### KbDocument

| Field | หมายเหตุ |
| --- | --- |
| fileName, sizeBytes, sha256 | sha256 เป็น unique ไม่เก็บไฟล์ต้นฉบับ |
| pageCount, tokenCount | |
| extractedText | ข้อความที่ AI ใช้ตอบ |
| status, error | `processing`, `ready`, `failed` และ `error` เป็นรหัสจาก [error-catalog](error-catalog.md) |
| createdAt, updatedAt | |

### AiUsage

หนึ่งแถวต่อการเรียกโมเดลหนึ่งครั้ง

| Field | หมายเหตุ |
| --- | --- |
| kind | `reply`, `ingest` หรือ `guard` (การคัดกรองขอบเขตหัวข้อ รวมการทดลองจากหน้าตั้งค่า) |
| contactId, messageId | มีค่าเมื่อ kind เป็น `reply` หรือ `guard` (`messageId` ว่างเมื่อไม่ได้ส่งข้อความ, `guard` ที่ถูกกันชี้ข้อความปฏิเสธ, การทดลองจากหน้าตั้งค่าไม่มีทั้งสองค่า) และถูกตั้งเป็นว่างเมื่อลบลูกค้าหรือข้อความ เพื่อคงยอดรวม |
| documentId | มีค่าเมื่อ kind เป็น `ingest` ถูกตั้งเป็นว่างเมื่อลบไฟล์ |
| provider, model | โมเดลที่ API รายงานว่าตอบจริง |
| inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens | จาก usage ของ API |
| costUsd | คำนวณจากตารางราคาใน [usage-cost](../specs/usage-cost.md#การคำนวณราคา) เก็บเป็น `Decimal(18, 9)` |
| outcome, error | `ok`, `handoff`, `refused`, `failed`, `cancelled` (AI ถูกปิดหลังเรียกโมเดล จึงไม่ได้ส่ง), `blocked` (นอกขอบเขตหัวข้อ ส่งข้อความปฏิเสธแทน) และ `error` เป็นรหัสจาก [error-catalog](error-catalog.md) |
| createdAt | |

### CannedReply

| Field | หมายเหตุ |
| --- | --- |
| title, text | ข้อความสำเร็จรูปของร้าน |
| sortOrder | ลำดับในรายการ |
| createdAt, updatedAt | |

### RateLimitBucket

| Field | หมายเหตุ |
| --- | --- |
| key | primary key แถวเดียวต่อ key ในรูป `{action}:{keyedHash}` ของ IP หรือของ id ของลูกค้าสำหรับ loading ฝั่ง LINE |
| windowStart, count | หน้าต่างปัจจุบันของ key นั้น |

## ความสัมพันธ์

```
Contact 1 ── * Message
Contact 1 ── * AiUsage (kind = reply, guard)
Message 1 ── * AiUsage (kind = reply, guard)
KbDocument 1 ── * AiUsage (kind = ingest)
```

## Migration

- ใช้ `prisma migrate` และเก็บไฟล์ใน repo
- Production รันตอน build ของ production เท่านั้น ส่วน Docker รันตอนเริ่ม container ดู [project-setup](project-setup.md)
- มี seed script ใส่ข้อมูลตัวอย่างปลอมสำหรับ Docker ดูหัวข้อ "ข้อมูลตัวอย่าง (seed)" ด้านล่าง
- Migration แรกสร้างด้วย `prisma migrate dev --create-only` แล้วเพิ่ม SQL ที่ Prisma schema บอกไม่ได้ด้วยมือก่อน apply:

```sql
-- at the top of migration.sql, before CREATE TABLE "Message"
CREATE SEQUENCE change_seq AS BIGINT;

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
```

### Migration ที่สอง: ขอบเขตหัวข้อ

Migration แรก (`init`) ถูก apply แล้ว ห้ามแก้ไฟล์ของมัน การเปลี่ยนของขอบเขตหัวข้อเป็น migration ที่สองชื่อ `topic_guard` ซึ่งเพิ่มอย่างเดียว ตามกฎ "ย้อนกลับ" ใน [deploy](../runbooks/deploy.md):

- `Settings` เพิ่มสามคอลัมน์พร้อมค่าเริ่มต้น: `guardEnabled` (`false`), `guardTopics` (`text[]` ค่าเริ่มต้น array ว่าง), `guardRefusalText` (ค่าเริ่มต้นเท่ากับ `DEFAULT_GUARD_REFUSAL_TEXT`) แถวเดิมจึงได้ค่าเริ่มต้นโดยไม่ต้องย้ายข้อมูล
- enum `AiUsageKind` เพิ่มค่า `guard` และ `AiOutcome` เพิ่มค่า `blocked` ด้วย `ALTER TYPE ... ADD VALUE`
- ไม่มีตารางใหม่ ไม่มี enum ของ `eventCode` (เป็น `String`) จึงไม่ต้องแก้ฐานข้อมูลสำหรับ `guard.blocked`

สร้างด้วยคำสั่ง `--create-only` ใน [project-setup ข้อ 5](project-setup.md#5-packagejson) (แถว `db:migrate`) จาก schema ด้านล่าง ลบคำสั่งที่ Prisma สร้างเกินมาสำหรับ `"Message"."seq"` (`SET`/`DROP DEFAULT` และ `DROP SEQUENCE "change_seq"`) ด้วยมือ เพราะ Prisma อ่านค่าเริ่มต้น `nextval` ของ `init` ไม่ได้ และคำสั่งเหล่านั้นทำให้ polling ใช้ไม่ได้ กฎนี้ใช้กับทุก migration ถัดไปด้วย แล้วตรวจว่า SQL มีเฉพาะ `ALTER TABLE "Settings" ADD COLUMN` สามคำสั่งและ `ALTER TYPE` สองคำสั่ง (ต้องยืนยันกับ Prisma 7.10.1 ว่า `ALTER TYPE ... ADD VALUE` ไม่ถูกห่อใน transaction ที่ Postgres ไม่ยอม ถ้าถูกห่อ ให้แยกเป็นไฟล์ migration ของตัวเอง)

`Message.seq` ใช้ค่าเริ่มต้น `nextval('change_seq')` จาก schema (`dbgenerated`) Prisma สร้าง `CREATE TABLE` ที่อ้าง sequence นี้ จึงต้องเพิ่ม `CREATE SEQUENCE` ไว้บนสุดของไฟล์ migration ก่อน apply

ใช้ trigger แทนการให้ทุก method ของ repository ตั้งค่าเอง เพื่อไม่มีทางลืม ค่าที่ trigger ตั้งกลับมาใน `RETURNING` ของ Prisma ตามปกติ ข้อนี้ทำให้ [domain-and-ports](domain-and-ports.md) ที่ให้ repository ตั้ง `updatedSeq` เป็นจริงโดยไม่ต้องเขียนโค้ด

## Prisma schema

ไฟล์ `prisma/schema.prisma` ทั้งไฟล์ ข้อกำหนด:

- id เป็น `String @id @db.Uuid` สร้างในแอปเป็น UUIDv7 ไม่มีค่าเริ่มต้นในฐานข้อมูล ยกเว้น `Settings` ซึ่งมีแถวเดียวและใช้ `Int @id @default(1)`
- `Message.seq` เป็น `BigInt @default(dbgenerated("nextval('change_seq')"))` และ unique ส่วน `updatedSeq` ของ Contact และ Message ประกาศเป็น `BigInt @default(0)` แล้ว trigger ใน migration แรกตั้งค่าจริง
- เวลาเป็น `DateTime @db.Timestamptz(3)` และเงินเป็น `Decimal @db.Decimal(18, 9)`
- ชื่อตารางและคอลัมน์ใช้ชื่อ model และ field ตรงตัว ไม่มี `@map` SQL ที่เขียนเองจึงอ้างชื่อแบบมีเครื่องหมายคำพูด เช่น `"Contact"."aiState"`
- ค่า enum เป็นตัวพิมพ์เล็กตามตารางข้างบน `PoliteParticle` ใช้ `kha` แทน "ค่ะ" และ `khrap` แทน "ครับ" เพราะชื่อ enum ของ Prisma เป็นภาษาไทยไม่ได้

ข้อที่ต้องยืนยันกับ Prisma 7.10.1 ตอน scaffold:

1. Generator ชื่อ `prisma-client` (ตัวใหม่ที่ต้องกำหนด `output`) และ option `moduleFormat`, `runtime`
2. `datasource` ใน schema ไม่มี `url` แล้ว URL อยู่ใน `prisma.config.ts` ดู [project-setup](project-setup.md)
3. Prisma 7 ใช้ query compiler กับ driver adapter โดยไม่มี query engine binary
4. Path ที่ import client ที่ generate แล้ว (สมมติว่าเป็น `./generated/client` จาก `src/adapters/prisma/`)

ถ้าข้อใดต่าง ให้แก้ส่วน `generator` และ `datasource` เท่านั้น ส่วน model ไม่ขึ้นกับข้อเหล่านี้

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/adapters/prisma/generated"
  moduleFormat = "esm"
  runtime      = "nodejs"
}

datasource db {
  provider = "postgresql"
}

enum PoliteParticle {
  kha
  khrap
}

enum FollowStatus {
  following
  unfollowed
}

enum AiState {
  idle
  replying
}

enum HandoffReason {
  customer_sent_image
  customer_sent_video
  customer_sent_non_text
  budget_reached
  ai_not_in_knowledge
  ai_needs_human_action
  ai_unsafe_or_offtopic
  ai_other
  ai_failed
  ai_timeout
}

enum MessageDirection {
  inbound
  outbound
  internal
}

enum MessageAuthor {
  customer
  admin
  ai
  system
}

enum MessageType {
  text
  image
  video
  sticker
  other
  event
}

enum OtherKind {
  audio
  file
  location
  unknown
}

enum MediaStatus {
  pending
  ready
  failed
  too_large
}

enum DeliveryStatus {
  pending
  sent
  failed
}

enum KbStatus {
  processing
  ready
  failed
}

enum AiUsageKind {
  reply
  ingest
  guard
}

enum AiOutcome {
  ok
  handoff
  refused
  failed
  cancelled
  blocked
}

model Settings {
  id                   Int            @id @default(1)
  lineChannelSecretEnc String?
  lineAccessTokenEnc   String?
  lineBotName          String?
  lineBasicId          String?
  aiEnabled            Boolean        @default(false)
  aiProvider           String         @default("claude")
  aiModel              String         @default("claude-opus-5-5")
  aiDailyBudgetUsd     Decimal        @default(2) @db.Decimal(18, 9)
  aiPoliteParticle     PoliteParticle @default(kha)
  aiInstructions       String         @default("")
  guardEnabled         Boolean        @default(false)
  guardTopics          String[]       @default([])
  guardRefusalText     String         @default("คุยได้เฉพาะหัวข้อที่กำหนดไว้นะคะ")
  lastWebhookAt        DateTime?      @db.Timestamptz(3)
  lastLineError        String?
  lastLineErrorAt      DateTime?      @db.Timestamptz(3)
  lastAiError          String?
  lastAiErrorAt        DateTime?      @db.Timestamptz(3)
  updatedAt            DateTime       @db.Timestamptz(3)
}

model Contact {
  id                  String            @id @db.Uuid
  lineUserId          String            @unique
  displayName         String?
  pictureUrl          String?
  followStatus        FollowStatus      @default(following)
  followedAt          DateTime?         @db.Timestamptz(3)
  aiEnabled           Boolean           @default(false)
  needsAdmin          Boolean           @default(false)
  needsAdminReason    HandoffReason?
  aiState             AiState           @default(idle)
  aiStateAt           DateTime?         @db.Timestamptz(3)
  unreadCount         Int               @default(0)
  lastMessageAt       DateTime?         @db.Timestamptz(3)
  lastMessagePreview  String?
  lastMessageBy       MessageAuthor?
  lastMessageType     MessageType?
  replyToken          String?
  replyTokenExpiresAt DateTime?         @db.Timestamptz(3)
  createdAt           DateTime          @db.Timestamptz(3)
  updatedSeq          BigInt            @default(0)

  messages Message[]
  aiUsages AiUsage[]

  @@index([lastMessageAt(sort: Desc)])
  @@index([needsAdmin])
  @@index([unreadCount])
  @@index([updatedSeq])
}

model Message {
  id               String           @id @db.Uuid
  seq              BigInt           @unique @default(dbgenerated("nextval('change_seq')"))
  updatedSeq       BigInt           @default(0)
  contactId        String           @db.Uuid
  direction        MessageDirection
  author           MessageAuthor
  type             MessageType
  otherKind        OtherKind?
  eventCode        String?
  text             String?
  mediaUrl         String?
  previewUrl       String?
  mediaStatus      MediaStatus?
  stickerPackageId String?
  stickerId        String?
  lineMessageId    String?          @unique
  deliveryStatus   DeliveryStatus?
  deliveryError    String?
  retryKey         String?          @db.Uuid
  createdAt        DateTime         @db.Timestamptz(3)
  sentAt           DateTime?        @db.Timestamptz(3)

  contact  Contact   @relation(fields: [contactId], references: [id], onDelete: Restrict)
  aiUsages AiUsage[]

  @@index([contactId, seq])
  @@index([contactId, updatedSeq])
}

model WebhookEvent {
  id             String   @id @db.Uuid
  webhookEventId String   @unique
  type           String
  receivedAt     DateTime @db.Timestamptz(3)
}

model KbDocument {
  id            String   @id @db.Uuid
  fileName      String
  sizeBytes     Int
  sha256        String   @unique @db.Char(64)
  pageCount     Int?
  tokenCount    Int?
  extractedText String?
  status        KbStatus
  error         String?
  createdAt     DateTime @db.Timestamptz(3)
  updatedAt     DateTime @db.Timestamptz(3)

  aiUsages AiUsage[]

  @@index([status])
}

model AiUsage {
  id               String      @id @db.Uuid
  kind             AiUsageKind
  contactId        String?     @db.Uuid
  messageId        String?     @db.Uuid
  documentId       String?     @db.Uuid
  provider         String
  model            String
  inputTokens      Int
  outputTokens     Int
  cacheReadTokens  Int         @default(0)
  cacheWriteTokens Int         @default(0)
  costUsd          Decimal     @db.Decimal(18, 9)
  outcome          AiOutcome
  error            String?
  createdAt        DateTime    @db.Timestamptz(3)

  contact  Contact?    @relation(fields: [contactId], references: [id], onDelete: SetNull)
  message  Message?    @relation(fields: [messageId], references: [id], onDelete: SetNull)
  document KbDocument? @relation(fields: [documentId], references: [id], onDelete: SetNull)

  @@index([createdAt])
  @@index([contactId, createdAt])
}

model CannedReply {
  id        String   @id @db.Uuid
  title     String
  text      String
  sortOrder Int
  createdAt DateTime @db.Timestamptz(3)
  updatedAt DateTime @db.Timestamptz(3)

  @@index([sortOrder])
}

model RateLimitBucket {
  key         String   @id
  windowStart DateTime @db.Timestamptz(3)
  count       Int

  @@index([windowStart])
}
```

`src/adapters/prisma/prisma-client.ts` สร้าง client ครั้งเดียวต่อ process ด้วย `new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 5 }) })` และเก็บไว้ใน `globalThis` ระหว่าง `next dev` เพื่อไม่ให้ hot reload เปิด connection ใหม่ (ขนาด pool 5 เป็นสมมติฐานสำหรับ connection แบบ pooled ของ Neon ต้องยืนยันเมื่อ deploy)

## กฎของ repository

สัญญาของแต่ละ method อยู่ใน [domain-and-ports](domain-and-ports.md) หัวข้อนี้บอกว่า adapter ของ Prisma ทำให้สัญญานั้นเป็นจริงอย่างไร

1. **กันซ้ำด้วย insert แบบข้ามเมื่อซ้ำ:** `WebhookEvent` และ `Message` ขาเข้าบันทึกด้วย `createMany({ data: [row], skipDuplicates: true })` ซึ่งเป็น `INSERT ... ON CONFLICT DO NOTHING` ถ้า `count` เป็น 0 แปลว่าซ้ำ แล้วอ่านแถวเดิมด้วย unique key (`webhookEventId` หรือ `lineMessageId`) คืนไปพร้อม `inserted: false` ห้ามใช้แบบอ่านก่อนแล้วจึงเขียน
2. **ข้อความขาออกซ้ำ:** ใช้วิธีเดียวกับข้อ 1 โดย unique key คือ id ที่หน้าเว็บสร้าง
3. **สร้าง Contact พร้อมกัน:** `ensure` ใช้ `createMany({ skipDuplicates: true })` กับ `lineUserId` แล้วอ่านแถว ผู้ที่ได้ `count` เป็น 1 คือผู้สร้าง
4. **บันทึกข้อความขาเข้ากับ Contact:** `recordInbound` ใช้ `unreadCount: { increment: 1 }` และแก้ `lastMessage*` ด้วยเงื่อนไข `lastMessageAt` เดิมว่างหรือเก่ากว่า ผ่าน `$executeRaw` คำสั่งเดียว จึงไม่ถอยหลังเมื่อ event มาไม่เรียงลำดับ
5. **แปลงเป็น entity ของ domain:** แต่ละ repository มี `<entity>.mapper.ts` ที่แปลงทั้งสองทาง
   - `BigInt` ของ `seq` และ `updatedSeq` แปลงเป็น type `Seq` ของ domain
   - `Decimal` ของเงินแปลงเป็น `NanoUsd` (`bigint`) ของ domain โดยคูณ 10^9 จากค่าแบบ string ไม่ผ่าน float คอลัมน์เป็น `Decimal(18, 9)` จึงแปลงทั้งสองทางได้พอดี ไม่มีการปัด
   - enum ของ Prisma แปลงเป็น literal union ของ domain และ `PoliteParticle` แปลง `kha`/`khrap` เป็น "ค่ะ"/"ครับ"
   - id แปลงเป็น branded type ของ domain
6. **Type ของ Prisma ไม่ออกนอก adapter:** method ของ repository รับและคืนเฉพาะ type ของ domain `src/adapters/prisma/index.ts` export เฉพาะ factory ของ repository ไม่ export client หรือ type ที่ generate
7. **เวลาจาก `Clock`:** ทุก method ที่เขียนเวลารับค่าจาก use case ไม่มี `@updatedAt` และ `@default(now())` ใน schema
8. **Lock ของ AI ต่อลูกค้า:** conditional update ที่มีรอบเดียวชนะ
   - `tryAcquireAiLock`: `updateMany({ where: { id, aiState: 'idle' }, data: { aiState: 'replying', aiStateAt: now } })` ซึ่งเป็น `UPDATE "Contact" SET ... WHERE "id" = $1 AND "aiState" = 'idle'` Postgres ล็อกแถวระหว่าง UPDATE รอบที่มาทีหลังจึงเห็น `replying` และได้ `count` เป็น 0 คืน `count === 1`
   - รอบที่ได้ false ถอนตัว การตอบข้อความที่มาระหว่างถือ lock เป็นหน้าที่ของผู้ถือ lock ตาม `AI_MAX_ROUNDS_PER_RUN` ใน [use-cases](use-cases.md#generateaireply)
   - `releaseAiLock`: `updateMany({ where: { id }, data: { aiState: 'idle', aiStateAt: null } })`
   - `recoverStuckAiStates(staleBefore)`: `UPDATE "Contact" SET "aiState" = 'idle', "aiStateAt" = NULL, "needsAdmin" = true, "needsAdminReason" = 'ai_timeout' WHERE "aiState" = 'replying' AND "aiStateAt" < $1 RETURNING "id"` ผ่าน `$queryRaw` คำสั่งเดียว คืน id ของแถวที่คืนสภาพ ซึ่ง use case ใช้บันทึกบรรทัดเหตุการณ์ `ListContacts` เรียกทุกครั้งโดย `staleBefore = now - AI_STUCK_AFTER_MS` ตาม [ai-reply](../specs/ai-reply.md#งานที่ค้าง)
9. **ใช้ reply token ครั้งเดียว:** `consumeReplyToken` ใช้ `updateMany({ where: { id, replyToken: token }, data: { replyToken: null, replyTokenExpiresAt: null } })` ได้ 1 จึงใช้ token นั้นได้ แอดมินกับ AI จึงไม่ใช้ token เดียวกันพร้อมกัน
10. **Polling ด้วย `updatedSeq`:** trigger ใน migration แรกตั้ง `updatedSeq` จาก sequence ของ `Message.seq` ทุกครั้งที่ Contact หรือ Message ถูกสร้างหรือแก้ ข้อความใหม่, สถานะการส่ง, สถานะสื่อ และการเปลี่ยนของ Contact จึงมาทางเดียวกัน

    ```sql
    -- MessageRepository.listChangedAfter(contactId, after, limit)
    SELECT * FROM "Message"
    WHERE "contactId" = $contactId AND "updatedSeq" > $after
    ORDER BY "updatedSeq" ASC
    LIMIT $limit + 1          -- แถวเกินหนึ่งแถวบอก hasMore

    -- ContactRepository.listChangedAfter(after, limit)
    SELECT * FROM "Contact" WHERE "updatedSeq" > $after ORDER BY "updatedSeq" ASC LIMIT $limit + 1
    ```

    - ช่วงย้อนหลัง: หน้าเว็บส่ง `after` เป็น cursor ล่าสุดลบ `POLL_OVERLAP_SEQ` แล้วรวมผลด้วย id โดยแถวที่ `updatedSeq` สูงกว่าแทนของเดิม ช่วงนี้จับแถวที่ได้เลข sequence ไปก่อนแต่ commit ช้ากว่าแถวที่หน้าเว็บเห็นแล้ว รายละเอียดของ protocol อยู่ใน [api-contract](api-contract.md#protocol-ของ-polling)
    - sequence ใช้ร่วมทั้งระบบ `POLL_OVERLAP_SEQ` จึงครอบคลุมการเขียนพร้อมกันได้เท่าค่านั้นในช่วงที่ transaction หนึ่งยังไม่ commit ซึ่งพอสำหรับร้านเดียว
    - `limit` คือ `POLL_PAGE_LIMIT` ถ้า `hasMore` หน้าเว็บโหลดหน้าล่าสุดใหม่แทนการต่อ cursor
    - โหลดย้อนหลัง: `WHERE "contactId" = $1 AND "seq" < $beforeSeq ORDER BY "seq" DESC LIMIT MESSAGE_PAGE_LIMIT + 1` แล้วกลับลำดับ
    - ลำดับการแสดงใช้ `seq` ไม่ใช้ `updatedSeq`
11. **Rate limit:** หนึ่งแถวต่อ key แบบหน้าต่างคงที่ `windowStart = floor(now / window) × window` คำนวณใน use case แล้ว `hit` ทำด้วย SQL เดียวที่ไม่มี race

    ```sql
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES ($key, $windowStart, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < EXCLUDED."windowStart" THEN 1
                     ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = GREATEST("RateLimitBucket"."windowStart", EXCLUDED."windowStart")
    RETURNING "count"
    ```

    - `peek` อ่านโดยไม่เพิ่ม: `SELECT "count" FROM "RateLimitBucket" WHERE "key" = $key AND "windowStart" = $windowStart` ไม่มีแถวหรือหน้าต่างเก่าคืน 0
    - รูปแบบของ `key` อยู่ใน [domain-and-ports](domain-and-ports.md#ratelimitrepository) ไม่มี IP ดิบในฐานข้อมูล
    - การลองรหัสเข้าใช้นับเฉพาะรหัสผิด ตาม [access-gate](../specs/access-gate.md) จึงใช้ `peek` ก่อนตรวจรหัส และ `hit` เมื่อรหัสผิด ([use-cases](use-cases.md#unlockaccess))
    - เมื่อ `RETURNING "count"` เป็น 1 ลบแถวที่ `windowStart` เก่ากว่า 1 วันในคำสั่งถัดไป ตารางจึงไม่โตตามจำนวน IP
12. **ยอดใช้จ่ายของวัน:** รวม `costUsd` ของ `AiUsage` ที่ `createdAt` อยู่ในช่วงเที่ยงคืนถึงเที่ยงคืนตามเวลาไทย ช่วงเวลาคำนวณใน domain แล้วส่งเป็นเวลา UTC สองค่าให้ repository

## ข้อมูลตัวอย่าง (seed)

`prisma/seed.ts` ใส่ข้อมูลปลอมทั้งหมดของร้านสมมติ "ต้นหอม คาเฟ่" ให้หน้าจอใน Docker ตรงกับภาพตัวอย่าง ไม่มีข้อมูลของคนจริง

### วิธีทำงาน

- รันด้วย `pnpm db:seed` ใน service `seed` ของ compose ดู [project-setup](project-setup.md)
- อ่านเฉพาะ `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY` และ `APP_BASE_URL` จาก `process.env` สร้าง Prisma client, adapter ของ `SecretCipher` และ adapter ของที่เก็บไฟล์แบบ local เอง ไม่ผ่าน `src/composition/env.ts`
- Idempotent: ทุกแถวมี id คงที่ (UUIDv7 ที่สร้างครั้งเดียวแล้วเขียนไว้ใน `seed.ts`) เขียนด้วย `createMany({ skipDuplicates: true })` และ `Settings` ด้วย `upsert` ที่ `update: {}` การรันซ้ำจึงไม่ทับสิ่งที่แอดมินแก้
- เวลาทุกค่าคำนวณย้อนจากเวลาที่รัน seed ครั้งแรก เพื่อให้รายชื่อแสดง "วันนี้", "เมื่อวาน" และชื่อวันครบ
- Credential ปลอมของ LINE ประกาศใน `e2e/fixtures/line/credentials.ts` (`STUB_CHANNEL_SECRET` และ `STUB_CHANNEL_ACCESS_TOKEN` ค่าตาม [stubs-and-fixtures](../qa/stubs-and-fixtures.md#2-การต่อกับแอป)) seed เข้ารหัสแล้วเก็บ และ E2E ใช้ค่าเดียวกันเซ็น webhook
- รูปตัวอย่าง `prisma/seed-assets/latte.jpg` เป็นภาพที่สร้างเอง ไม่มีบุคคลหรือโลโก้ seed คัดลอกเข้าที่เก็บไฟล์แบบ local ที่ key `inbound/seed-latte-sample-0001/original.jpg` (ต้องตรงรูปแบบที่ `GET /api/local-storage/*key` ยอมให้อ่าน ไม่เช่นนั้นรูปตอบ 404) แล้วใช้ URL ที่ adapter คืน

### Settings

| Field | ค่า |
| --- | --- |
| lineBotName, lineBasicId | `ต้นหอม คาเฟ่`, `@000test` |
| credential | `STUB_CHANNEL_SECRET`, `STUB_CHANNEL_ACCESS_TOKEN` ที่เข้ารหัสแล้ว |
| aiEnabled | เปิด เพื่อให้ผู้ตรวจลอง AI ตอบแทนกับ stub ได้ทันที (ต่างจากค่าเริ่มต้นของระบบที่ติดตั้งใหม่ซึ่งปิด) |
| aiModel, aiDailyBudgetUsd, aiPoliteParticle | ค่าเริ่มต้นของ schema (`DEFAULT_AI_MODEL`, `DEFAULT_AI_DAILY_BUDGET_USD`, `DEFAULT_POLITE_PARTICLE`) |
| aiInstructions | `ตอบสุภาพ เป็นกันเอง ถ้าลูกค้าถามเรื่องจัดเลี้ยงหรือสั่งจำนวนมาก ให้แอดมินตอบ` |
| guardEnabled, guardTopics, guardRefusalText | ปิด, `มุกตลกไทย`, `มีมจากละครและซีรีส์`, `มุกจากภาพยนตร์` (ตัวอย่างสำหรับเดโม เปิดเองที่หน้าตั้งค่า), ค่าเริ่มต้นของ schema |
| lastWebhookAt | 1 นาทีก่อนรัน |

### ลูกค้า 7 คน

ทุกคนไม่มี `pictureUrl` หน้าเว็บจึงแสดงตัวอักษรแรกของชื่อ และ `lineUserId` เป็นค่าปลอมรูปแบบ `U` ตามด้วย hex 32 ตัว เช่น `U00000000000000000000000000000001`

| # | ชื่อ | สถานะ | AI ตอบแทน | ยังไม่อ่าน | ข้อความ (เก่าไปใหม่, เวลาก่อนรัน seed) |
| --- | --- | --- | --- | --- | --- |
| 1 | มะลิ ใจดี | ติดตามอยู่, รอแอดมิน (`ai_needs_human_action`) | เปิด | 1 | ลูกค้า "สวัสดีค่ะ ร้านเปิดกี่โมงคะ" (50 นาที) · AI "ร้านเปิดทุกวัน 08:00–18:00 ค่ะ" (50 นาที) · ลูกค้า "รับจัดเลี้ยงนอกสถานที่ไหมคะ" (6 นาที) · AI "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ" (6 นาที) · บรรทัดเหตุการณ์ `handoff.ai_needs_human_action` (6 นาที) |
| 2 | พีช | ติดตามอยู่ | ปิด | 2 | ลูกค้า "มีเค้กส้มไหมคะ" (2 นาที) · ลูกค้า "วันนี้ยังเหลือไหม" (1 นาที) |
| 3 | Somchai K. | ติดตามอยู่ | ปิด | 0 | ลูกค้า "จองโต๊ะ 4 คน บ่ายสองได้ไหมครับ" (3 ชั่วโมง) · แอดมิน "ได้ค่ะ จองไว้ให้แล้ว" ส่งแล้ว (3 ชั่วโมง) · ลูกค้า "ขอบคุณครับ" (3 ชั่วโมง) |
| 4 | ป้าแดง | ติดตามอยู่ | ปิด | 1 | ลูกค้า "ขอบคุณที่ส่งไวนะจ๊ะ" (เมื่อวาน) · ลูกค้าส่งสติกเกอร์ (เมื่อวาน) |
| 5 | ต้นข้าว | ติดตามอยู่ | ปิด | 0 | ลูกค้าส่งรูป `ready` (2 วันก่อน) · แอดมิน "ลาเต้เย็นแก้วนี้ 65 บาทค่ะ" ส่งแล้ว (2 วันก่อน) |
| 6 | นนท์ | เลิกติดตามแล้ว | ปิด | 0 | ลูกค้า "ยกเลิกออเดอร์ครับ" (4 วันก่อน) · แอดมิน "รับทราบค่ะ" ส่งแล้ว (4 วันก่อน) |
| 7 | แพรวา | ติดตามอยู่ | ปิด | 0 | ลูกค้า "ส่งเมนูให้หน่อยค่ะ" (9 วันก่อน) · แอดมิน "เดี๋ยวส่งให้นะคะ" ส่งไม่สำเร็จ `deliveryError` เป็น `line.push_failed` (9 วันก่อน) |

- สติกเกอร์ของป้าแดงใช้ `stickerPackageId` `446` และ `stickerId` `1988` ซึ่งเป็นตัวอย่างที่พบในเอกสารของ LINE (ต้องยืนยันว่าแสดงได้ ถ้าไม่ได้หน้าเว็บแสดงป้ายแทน)
- ข้อความของลูกค้าทุกข้อความมี `lineMessageId` ปลอมที่ไม่ซ้ำ ข้อความขาออกมี `retryKey` เท่ากับ id บรรทัดเหตุการณ์มี `direction` `internal`, `author` `system`, `type` `event` และ `eventCode` ตามตาราง
- `lastMessage*` และ `unreadCount` ของแต่ละคนตรงกับข้อความสุดท้ายในตาราง

### ข้อความสำเร็จรูป

| sortOrder | title | text |
| --- | --- | --- |
| 1 | เวลาเปิดร้าน | ร้านเปิดทุกวัน 08:00–18:00 ค่ะ |
| 2 | ที่จอดรถ | มีที่จอดรถหน้าร้าน 4 คัน และจอดริมถนนได้ค่ะ |
| 3 | ช่องทางชำระเงิน | รับเงินสด โอนผ่านพร้อมเพย์ และบัตรเครดิตค่ะ |
| 4 | ขอบคุณ | ขอบคุณที่อุดหนุนต้นหอม คาเฟ่ ค่ะ |

### คลังความรู้

หนึ่งไฟล์สถานะ `ready`: `fileName` เป็น `เมนูและราคา.pdf`, `sizeBytes` 182344, `pageCount` 2, `tokenCount` 1850 และ `sha256` เป็นค่าปลอม 64 ตัว `extractedText` เป็นเมนูสั้น ๆ ภาษาไทยราว 15 บรรทัด เช่น ชื่อเครื่องดื่ม ราคา เวลาเปิดปิด และนโยบายจองโต๊ะ เขียนไว้ใน `seed.ts`

### AiUsage

| kind | ผูกกับ | model | outcome |
| --- | --- | --- | --- |
| `ingest` | ไฟล์ในคลังความรู้ | `claude-opus-5-5` | `ok` |
| `reply` | มะลิ, ข้อความ AI แรก | `claude-opus-5-5` | `ok` |
| `reply` | มะลิ, ข้อความ AI ที่สอง | `claude-opus-5-5` | `handoff` |

จำนวน token เป็นค่าสมมติที่ใกล้เคียงจริง และ `costUsd` คำนวณด้วยฟังก์ชันราคาเดียวกับระบบจาก `pricing.constants.ts` ไม่เขียนตัวเลขเงินตายตัว
