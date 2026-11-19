# Domain และ Port

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

เอกสารนี้เป็นสัญญาของแกนกลาง: type ของ domain, ฟังก์ชันล้วน และ interface ของทุก port ผู้เขียน use case, adapter จริง และ adapter ปลอม ต้องยึดลายเซ็นและความหมายในไฟล์นี้ตรงตัว

- ภาพรวมของชั้นและรายชื่อ port อยู่ใน [backend](backend.md)
- ขั้นตอนของแต่ละ use case อยู่ใน [use-cases](use-cases.md)
- รูปแบบ HTTP อยู่ใน [api-contract](api-contract.md)
- รหัส error ทุกตัวและข้อความภาษาไทยอยู่ใน [error-catalog](error-catalog.md)
- ตารางและ field อยู่ใน [data-model](data-model.md)
- ค่าของ constant ทุกตัวอยู่ใน [project-setup](project-setup.md#10-ค่าคงที่ของระบบ)

## กติการ่วม

- โค้ดในไฟล์นี้อยู่ใน `src/core/domain/` และ `src/core/ports/` จึงห้ามใช้ zod, `Date.now()`, `new Date()` แบบไม่มีอาร์กิวเมนต์ และ `process.env` ดู [code-style](../guidelines/code-style.md)
- เวลาเป็น `Date` ที่หมายถึงจุดเวลา UTC ถือว่า immutable ห้ามแก้ค่าใน object
- เงินในแกนกลางเป็นจำนวนเต็ม `bigint` หน่วย nano-USD (10^-9 ดอลลาร์) เพราะราคาต่อล้าน token ทุกตัวในตารางราคาแปลงเป็นจำนวนเต็มต่อ token ได้พอดี ฐานข้อมูลเก็บเป็นทศนิยมแม่นยำ และ API ส่งเป็นสตริง ดู [api-contract](api-contract.md#การแปลงค่า)
- Repository คืน `Result` เฉพาะผลที่คาดได้ เช่น ไม่พบ หรือซ้ำ ความล้มเหลวของฐานข้อมูล (ต่อไม่ได้, timeout) ให้ throw และถูกดักที่ขอบของ route หรือตัวดักงานหลังตอบ ตาม [backend](backend.md#หลักการ)
- Port ที่เรียกบริการภายนอก (LINE, Claude, ที่เก็บไฟล์) ห้าม throw ความล้มเหลวที่คาดได้ ต้องคืน `Result` ด้วยรหัสที่ระบุในลายเซ็นเท่านั้น ส่วน bug ของโปรแกรมให้ throw ได้

## Result และ error

```ts
// src/core/domain/result.ts
export type ErrorCode = (typeof ERROR_CODES)[number];
// ERROR_CODES เป็น const array ใน src/core/domain/error-codes.ts
// มีรหัสครบตาม error-catalog.md ทุกตัว ไม่มากไม่น้อยกว่านั้น

export interface AppError<C extends ErrorCode = ErrorCode> {
  code: C;
  /** ข้อความสำหรับนักพัฒนา ห้ามมีเนื้อหาข้อความ ชื่อผู้ใช้ token หรือ secret */
  detail?: string;
  /** มีค่าเฉพาะรหัสที่ลงท้ายด้วย .rate_limited route ใช้ตั้ง header Retry-After */
  retryAfterSeconds?: number;
}

export type Result<T, C extends ErrorCode = ErrorCode> =
  | { ok: true; value: T }
  | { ok: false; error: AppError<C> };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <C extends ErrorCode>(code: C, detail?: string, retryAfterSeconds?: number): Result<never, C> =>
  ({ ok: false, error: { code, detail, retryAfterSeconds } });
```

- `detail` ไม่ถูกส่งถึงหน้าเว็บ route ใช้เฉพาะ `code` ดู [api-contract](api-contract.md#รูปแบบ-error)
- ลายเซ็นของ port และ use case ระบุรหัสที่คืนได้เป็น union ของ literal ห้ามคืนรหัสนอกรายการ

## Id

```ts
// src/core/domain/ids.ts
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ContactId = Brand<string, "ContactId">;         // UUIDv7
export type MessageId = Brand<string, "MessageId">;         // UUIDv7 (ขาออกของแอดมินสร้างที่หน้าเว็บ)
export type DocumentId = Brand<string, "DocumentId">;       // UUIDv7
export type UsageId = Brand<string, "UsageId">;             // UUIDv7
export type NoteId = Brand<string, "NoteId">;               // UUIDv7
export type LineUserId = Brand<string, "LineUserId">;       // userId ของ LINE
export type LineMessageId = Brand<string, "LineMessageId">; // message.id ของ LINE
export type WebhookEventId = Brand<string, "WebhookEventId">;
export type StorageKey = Brand<string, "StorageKey">;       // path ในที่เก็บไฟล์
export type UploadId = Brand<string, "UploadId">;           // token สุ่ม 128 bit แบบ base64url
export type Seq = Brand<bigint, "Seq">;                     // จาก sequence เดียวของฐานข้อมูล
export type NanoUsd = Brand<bigint, "NanoUsd">;             // 1 USD = 1_000_000_000n
export type LineAccessToken = Brand<string, "LineAccessToken">;
```

- การแปลงสตริงจากภายนอกเป็น id ทำที่ขอบเท่านั้น: route หลังตรวจ schema, adapter หลังอ่านจากฐานข้อมูลหรือ LINE
- `MessageId` ที่หน้าเว็บสร้างต้องเป็น UUID (รุ่นใดก็ได้) route ตรวจรูปแบบ แกนกลางไม่ตรวจซ้ำ

## Enum

ค่าตรงกับ enum ใน [data-model](data-model.md#prisma-schema), DTO ใน [api-contract](api-contract.md#dto-ร่วม), หน้าจอใน [ui-screens](../specs/ui-screens.md) และ stub ใน [stubs-and-fixtures](../qa/stubs-and-fixtures.md) ทุกค่า การเพิ่มค่าต้องแก้ทั้งห้าที่ใน commit เดียวกัน

```ts
export type FollowStatus = "following" | "unfollowed";
export type AiState = "idle" | "replying";
export type MessageDirection = "inbound" | "outbound" | "internal";
export type MessageAuthor = "customer" | "admin" | "ai" | "system";
export type MessageType = "text" | "image" | "video" | "audio" | "sticker" | "other" | "event";
export type OtherKind = "audio" | "file" | "location" | "unknown";
export type MediaStatus = "pending" | "ready" | "failed" | "too_large";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type DocumentStatus = "processing" | "ready" | "failed";
export type UsageKind = "reply" | "ingest" | "guard";
/** blocked: ข้อความถูกกันเพราะอยู่นอกขอบเขตหัวข้อ ดู specs/topic-guard.md */
export type UsageOutcome = "ok" | "handoff" | "refused" | "failed" | "cancelled" | "blocked";
export type AiProvider = "claude";
export type AiModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type PoliteParticle = "ค่ะ" | "ครับ";
/** บรรทัด "ข้อมูลที่ใช้ตอบ" ของคำสั่งระบบ ดู specs/ai-prompt.md ข้อ 2.2.1 */
export type AiAnswerMode = "knowledge_only" | "general";
export type SendChannel = "reply" | "push";
/** สิ่งที่รู้เกี่ยวกับ Channel secret ที่เก็บไว้ ดู specs/admin-backoffice.md */
export type LineSecretStatus = "verified" | "unchecked" | "no_channel_id";
export type RateLimitAction = "unlock" | "unlock_no_ip" | "send_message" | "upload_ticket" | "pdf_ingest" | "typing" | "guard_test" | "note_create" | "rich_menu_tap";

/** เหตุผลที่โมเดลเลือกเมื่อ needsAdmin เป็น true ตาม ai-prompt.md ข้อ 5 */
export type ModelHandoffReason = "not_in_knowledge" | "needs_human_action" | "unsafe_or_offtopic" | "other";

/** เหตุผลของสถานะรอแอดมิน เก็บใน Contact.needsAdminReason ข้อความไทยอยู่ใน error-catalog */
export type HandoffReason =
  | "customer_sent_image"     // ผู้ใช้ส่งรูป
  | "customer_sent_video"     // ผู้ใช้ส่งวิดีโอ
  | "customer_sent_non_text"  // สติกเกอร์ เสียง ไฟล์ ตำแหน่ง หรือชนิดอื่น
  | "budget_reached"          // งบของวันนี้เต็ม
  | "ai_not_in_knowledge"     // ai_ + ModelHandoffReason
  | "ai_needs_human_action"
  | "ai_unsafe_or_offtopic"
  | "ai_other"
  | "ai_failed"               // เรียกโมเดลไม่สำเร็จ, ถูกปฏิเสธ, ถูกตัด, ไม่ตรง schema, ส่งคำตอบไม่สำเร็จ
  | "ai_timeout"              // aiState ค้างเกิน AI_STUCK_AFTER_MS
  | "customer_asked_admin"    // ผู้ใช้กดปุ่ม "คุยกับแอดมิน" ของ rich menu หรือการ์ดต้อนรับ
  | "ai_unavailable";         // ผู้ใช้กดปุ่ม "คุยกับ AI" ขณะ kill switch ปิด

/** บรรทัดเหตุการณ์ในแชท (Message ชนิด event) ข้อความไทยอยู่ใน error-catalog */
export type EventCode =
  | `handoff.${HandoffReason}`
  | "ai.turned_off_by_admin"   // แอดมินส่งข้อความ AI ตอบแทนของผู้ใช้จึงถูกปิด
  | "guard.blocked"            // ข้อความนอกขอบเขตหัวข้อ AI ส่งข้อความปฏิเสธแทน ไม่ขึ้นรอแอดมิน
  | "contact.followed"
  | "contact.unfollowed"
  // ปุ่มของ rich menu และการ์ดต้อนรับ: อยู่บนแถวขาเข้าชนิด text ของการกด (ข้อความคือชื่อปุ่ม)
  | "customer.tapped_ai_on"
  | "customer.tapped_admin"
  | "customer.tapped_how_to"
  | "welcome.sent";            // อยู่บนแถวขาออกของการ์ดต้อนรับ
```

## Entity

```ts
export interface Contact {
  id: ContactId;
  lineUserId: LineUserId;
  displayName: string | null;
  pictureUrl: string | null;
  followStatus: FollowStatus;
  followedAt: Date | null;
  aiEnabled: boolean;               // สวิตช์ AI ตอบแทน จำค่าไว้แม้ kill switch ปิด
  needsAdmin: boolean;
  needsAdminReason: HandoffReason | null;
  aiState: AiState;
  aiStateAt: Date | null;
  unreadCount: number;
  lastMessageAt: Date | null;       // เวลาข้อความขาเข้าล่าสุดของผู้ใช้: ค่าที่รายชื่อใช้เรียง null ก่อนข้อความแรก
  lastMessagePreview: string | null; // ข้อความตัวอักษรไม่เกิน PREVIEW_TEXT_MAX_CHARS หรือ null เมื่อเป็นสื่อ
  lastMessageBy: "customer" | "admin" | "ai" | null;
  lastMessageType: Exclude<MessageType, "event"> | null;
  replyToken: string | null;
  replyTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedSeq: Seq;
}

export interface Message {
  id: MessageId;
  seq: Seq;                         // ลำดับการบันทึก ไม่เปลี่ยน
  updatedSeq: Seq;
  contactId: ContactId;
  direction: MessageDirection;
  author: MessageAuthor;
  type: MessageType;
  text: string | null;
  mediaUrl: string | null;
  previewUrl: string | null;
  mediaStatus: MediaStatus | null;  // null เมื่อไม่ใช่รูป วิดีโอ หรือเสียง
  mediaFailure: MediaFailure | null;  // เหตุผลของสื่อขาเข้าที่ failed: unsupported_type, external_source, download_failed, interrupted (MEDIA_FAILURES) null ในแถวที่บันทึกก่อนมีค่านี้
  mediaDurationMs: number | null;   // เสียงขาเข้า: message.duration (ms) null เมื่อไม่รู้
  stickerPackageId: string | null;
  stickerId: string | null;
  otherKind: OtherKind | null;
  eventCode: EventCode | null;
  lineMessageId: LineMessageId | null; // มีค่าเฉพาะขาเข้า
  quotedLineMessageId: LineMessageId | null; // ขาเข้า: id ของ LINE ที่ผู้ใช้ตอบกลับด้วย "ตอบกลับ" null เมื่อไม่มี
  lineSentIds: readonly LineMessageId[];     // ขาออก: sentMessages[].id ของ LINE ตามลำดับส่วน ว่างก่อนส่งหรือเมื่อ LINE ไม่ให้
  deliveryStatus: DeliveryStatus | null; // มีค่าเฉพาะขาออก
  deliveryError: ErrorCode | null;
  retryKey: string | null;          // ขาออก: เท่ากับ id
  createdAt: Date;
  sentAt: Date | null;
  firstPushAt: Date | null;         // ขาออก: เวลาที่ push ครั้งแรกเริ่ม ไม่เลื่อนเมื่อส่งอีกครั้ง null เมื่อยังไม่เคย push
}

export interface Settings {
  aiEnabled: boolean;               // kill switch
  aiProvider: AiProvider;
  aiModel: AiModelId;
  aiDailyBudget: NanoUsd;
  aiPoliteParticle: PoliteParticle;
  aiInstructions: string;           // คำแนะนำสำหรับ AI (บล็อก <custom_instructions>) ว่างเมื่อไม่มี
  aiName: string | null;            // ชื่อ AI ตัดช่องว่างแล้ว ใช้ตามที่พิมพ์ null เมื่อไม่ตั้ง (normalizeAiName)
  aiAnswerMode: AiAnswerMode;       // ขอบเขตคำตอบ
  guardEnabled: boolean;            // ขอบเขตหัวข้อ ดู specs/topic-guard.md
  guardTopics: string[];            // 0 ถึง GUARD_MAX_TOPICS หัวข้อ ตัดช่องว่างแล้ว ไม่ซ้ำ (เปิดอยู่ต้องมีอย่างน้อย 1)
  howToText: string;                // ข้อความของปุ่ม "วิธีทดสอบ" '' คือข้อความเริ่มต้น (howToTextOf)
  welcomeEnabled: boolean;          // ส่งการ์ดต้อนรับเมื่อมี follow
  welcomeText: string;              // เนื้อการ์ดต้อนรับ '' คือข้อความเริ่มต้น (welcomeTextOf)
  richMenu: { id: string; publishedAt: Date } | null; // เมนูที่แอปตั้งเป็นค่าเริ่มต้นที่ LINE
  richMenuError: { code: ErrorCode; at: Date } | null; // การ publish หรือนำออกที่ล้มล่าสุด
  lineConfigured: boolean;          // มี credential ที่เข้ารหัสไว้ทั้งสองค่า
  lineBotName: string | null;
  lineBasicId: string | null;
  lineChannelId: string | null;     // ไม่ใช่ความลับ null เมื่อบันทึกก่อนมีช่อง Channel ID
  lineSecretVerifiedAt: Date | null; // เวลาที่ LINE ยืนยันคู่ Channel ID กับ secret ล่าสุด
  lastWebhookAt: Date | null;
  lastLineError: { code: ErrorCode; at: Date } | null;
  lastAiError: { code: ErrorCode; at: Date } | null;
}

/** ค่าจริงของ credential อยู่ในหน่วยความจำเท่านั้น ไม่มี API ใดคืนค่านี้ */
export interface LineCredentials {
  channelSecret: string;
  channelAccessToken: LineAccessToken;
}

export interface EncryptedLineCredentials {
  channelSecretEnc: string;
  channelAccessTokenEnc: string;
}

export interface KbDocument {
  id: DocumentId;
  fileName: string;
  sizeBytes: number;
  sha256: string;                   // hex ตัวเล็ก 64 ตัว
  pageCount: number | null;
  tokenCount: number | null;
  status: DocumentStatus;
  error: ErrorCode | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KbDocumentWithText extends KbDocument {
  extractedText: string | null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiUsageRecord {
  id: UsageId;
  kind: UsageKind;
  contactId: ContactId | null;      // มีค่าเมื่อ kind = reply และเมื่อ kind = guard ของข้อความผู้ใช้ (null เมื่อเป็นการทดลองจากหน้าตั้งค่า)
  messageId: MessageId | null;      // ข้อความของ AI ที่ส่ง ถ้ามี (kind = guard outcome blocked คือข้อความปฏิเสธ)
  documentId: DocumentId | null;    // มีค่าเมื่อ kind = ingest
  provider: AiProvider;
  model: string;                    // โมเดลที่ API รายงาน อาจไม่อยู่ใน AiModelId เมื่อมีการสลับโมเดลสำรอง
  usage: TokenUsage;
  cost: NanoUsd;
  outcome: UsageOutcome;
  error: ErrorCode | null;
  createdAt: Date;
}

```

### Event ของ LINE หลังแปลง

Adapter ของ LINE แปลง payload เป็น type นี้ แกนกลางไม่เห็น JSON ของ LINE ชื่อ field ของ LINE ที่อ่านอยู่ใน [api-contract](api-contract.md#post-apilinewebhook)

```ts
export type InboundLineMessage =
  | { type: "text"; lineMessageId: LineMessageId; text: string }
  | { type: "image" | "video"; lineMessageId: LineMessageId; hostedByLine: boolean }
  | { type: "sticker"; lineMessageId: LineMessageId; packageId: string; stickerId: string }
  | { type: "other"; lineMessageId: LineMessageId; otherKind: OtherKind };

interface LineEventBase {
  webhookEventId: WebhookEventId;
  timestamp: Date;
  isRedelivery: boolean;
}

export type LineEvent =
  | (LineEventBase & { kind: "message"; userId: LineUserId; replyToken: string | null; message: InboundLineMessage })
  | (LineEventBase & { kind: "follow"; userId: LineUserId; replyToken: string | null })
  | (LineEventBase & { kind: "unfollow"; userId: LineUserId })
  // ปุ่มของ rich menu หรือการ์ดต้อนรับ data ยาวไม่เกิน POSTBACK_DATA_MAX_CHARS และยังไม่ได้ตรวจว่าแอปสร้าง
  | (LineEventBase & { kind: "postback"; userId: LineUserId; replyToken: string | null; data: string })
  | (LineEventBase & { kind: "unsupported"; lineType: string });
```

- Event ที่ไม่ได้มาจากแชทหนึ่งต่อหนึ่ง (กลุ่ม, ห้อง) ถูกแปลงเป็น `unsupported`
- `hostedByLine` เป็น `false` เมื่อสื่ออยู่บน URL ภายนอก ระบบไม่ดาวน์โหลด และตั้ง `mediaStatus` เป็น `failed` เพราะ server ดึงเฉพาะจาก host ของ LINE

### ข้อความขาออกหนึ่งชิ้นสำหรับ LINE

```ts
export type OutboundLinePart =
  | { type: "text"; text: string }
  | { type: "image"; originalUrl: string; previewUrl: string }
  | { type: "video"; originalUrl: string; previewUrl: string }
  | { type: "card"; card: WelcomeCard }; // การ์ดต้อนรับ adapter แปลงเป็น Flex bubble
```

`WelcomeCard` (`rich-menu.model.ts`) เป็นค่าที่ไม่ขึ้นกับ LINE: `altText`, `logoUrl` (HTTPS หรือ null), `titleLine`, `accountName`, `body`, `note` และ `buttons` สามปุ่ม (`label`, `data`, `displayText`, `style` เป็น `primary`, `secondary` หรือ `link`) สร้างด้วย `buildWelcomeCard` ส่วน `RichMenuSpec` (`width`, `height`, `name`, `chatBarText`, `areas`) สร้างด้วย `richMenuSpec()` ค่าทั้งสองและข้อความที่ผู้ใช้เห็นอยู่ใน `rich-menu.logic.ts` ([line-messaging](../specs/line-messaging.md#rich-menu))

## ค่าคงที่

ค่าทั้งหมดอยู่ใน `src/core/domain/constants.ts` ค่าของแต่ละตัวอยู่ในตาราง [ค่าคงที่ของระบบ](project-setup.md#10-ค่าคงที่ของระบบ) ที่เดียว ไฟล์นี้อ้างด้วยชื่อเท่านั้น ค่าที่มาจาก environment variable (`AI_DEBOUNCE_MS`, `AI_STUCK_AFTER_MS` ส่งผ่าน config, `RATE_LIMIT_SCALE`) ถูกส่งเข้ามาผ่าน `UseCaseConfig` ดู [use-cases](use-cases.md#การประกอบ)

ชื่อที่แกนกลางใช้: `POLL_OVERLAP_SEQ`, `POLL_PAGE_LIMIT`, `AI_HISTORY_LIMIT`, `AI_REPLY_MAX_CHARS`, `AI_MAX_ROUNDS_PER_RUN`, `AI_STUCK_AFTER_MS`, `AI_MAX_TOKENS`, `AI_EXTRACT_MAX_TOKENS`, `LINE_LOADING_SECONDS`, `KNOWLEDGE_CAPACITY_TOKENS`, `PDF_MAX_BYTES`, `PDF_MAX_PAGES`, `IMAGE_MAX_BYTES`, `VIDEO_MAX_BYTES`, `PREVIEW_MAX_BYTES`, `UPLOAD_TICKET_TTL_MS`, `LINE_TEXT_MAX_CHARS`, `LINE_MAX_PARTS_PER_REQUEST`, `REPLY_TOKEN_USABLE_MS`, `LINE_RETRY_KEY_WINDOW_MS`, `LINE_CHANNEL_ID_MAX_CHARS`, `MEDIA_JOB_BUDGET_MS`, `MEDIA_CONTENT_CALL_WORST_MS`, `MEDIA_STATUS_CALL_WORST_MS`, `MEDIA_NOT_READY_POLL_MS`, `STORAGE_PUT_TIMEOUT_MS`, `STORAGE_CALL_TIMEOUT_MS`, `MEDIA_STORE_CALL_WORST_MS`, `ADMIN_TEXT_MAX_CHARS`, `PREVIEW_TEXT_MAX_CHARS`, `PREVIEW_TEXT_MAX_UNITS`, `PROXY_BODY_MAX_BYTES` (ค่าของ `next.config.ts`), `MESSAGE_PAGE_LIMIT`, `CONTACT_PAGE_LIMIT`, `CONTACT_SEARCH_MAX_CHARS`, `AI_INSTRUCTIONS_MAX_CHARS`, `AI_NAME_MAX_CHARS`, `HOW_TO_TEXT_MAX_CHARS`, `WELCOME_TEXT_MAX_CHARS`, `POSTBACK_DATA_MAX_CHARS`, `RICH_MENU_WIDTH`, `RICH_MENU_HEIGHT`, `AI_DAILY_BUDGET_MAX_USD`, `ACCESS_COOKIE_TTL_MS`, `WEBHOOK_MAX_BODY_BYTES`, `JSON_MAX_BODY_BYTES`, `DEFAULT_AI_MODEL`, `DEFAULT_AI_DAILY_BUDGET_USD`, `DEFAULT_POLITE_PARTICLE`, `DEFAULT_AI_ANSWER_MODE`, ค่าของขอบเขตหัวข้อ `GUARD_MAX_TOPICS`, `GUARD_TOPIC_MAX_CHARS`, `GUARD_TEST_MAX_CHARS`, `GUARD_MODEL`, `GUARD_MAX_TOKENS`, `GUARD_TIMEOUT_MS`, `GUARD_CONTEXT_TURNS`, `GUARD_REFUSAL_MAX_TOPICS`, ค่าของโปรไฟล์ `PROFILE_REFRESH_AFTER_MS` และค่าจำกัดความถี่ `RATE_LIMIT_UNLOCK`, `RATE_LIMIT_SEND_MESSAGE`, `RATE_LIMIT_UPLOAD_TICKET`, `RATE_LIMIT_PDF_INGEST`, `RATE_LIMIT_TYPING`, `RATE_LIMIT_GUARD_TEST`, `RATE_LIMIT_NOTE_CREATE`, `RATE_LIMIT_RICH_MENU_TAP`

ค่าจำกัดความถี่ประกาศเป็น `RATE_LIMIT_RULES: Record<RateLimitAction, { limit: number; windowMs: number; scaled: boolean }>` ซึ่งอ่านค่าจาก constant ข้างบน `scaled` เป็น false เฉพาะ `unlock`

## ฟังก์ชันล้วนของ domain

ทุกฟังก์ชันไม่มีผลข้างเคียง ไม่อ่านเวลาเอง และมี unit test ครอบทุกแถวในคอลัมน์กฎ

### AI

```ts
export interface AiReplyConditionsInput {
  killSwitchOn: boolean;
  contact: Pick<Contact, "aiEnabled" | "followStatus">;
  latestInbound: Pick<Message, "type">;
  todayCost: NanoUsd;
  dailyBudget: NanoUsd;
}
export type AiReplyDecision =
  | { reply: true }
  | { reply: false; reason: "kill_switch_off" | "contact_ai_off" | "unfollowed"; handoff: null }
  | { reply: false; reason: "not_text"; handoff: HandoffReason }
  | { reply: false; reason: "budget_reached"; handoff: "budget_reached" };

export function shouldAiReply(input: AiReplyConditionsInput): AiReplyDecision;
```

ตรวจตามลำดับนี้ และคืนเหตุผลแรกที่ไม่ผ่าน:

| ลำดับ | เงื่อนไขที่ไม่ผ่าน | ผล |
| --- | --- | --- |
| 1 | `killSwitchOn` เป็น false | `kill_switch_off` ไม่ขึ้นรอแอดมิน |
| 2 | `contact.aiEnabled` เป็น false | `contact_ai_off` ไม่ขึ้นรอแอดมิน |
| 3 | `contact.followStatus` เป็น `unfollowed` | `unfollowed` ไม่ขึ้นรอแอดมิน |
| 4 | `latestInbound.type` ไม่ใช่ `text` | `not_text` พร้อม `handoffReasonForType(type)` |
| 5 | `todayCost >= dailyBudget` | `budget_reached` |

ลำดับ 4 มาก่อน 5 เพื่อให้เหตุผลบนหน้าจอเป็นเรื่องที่แอดมินแก้ได้ตรงที่สุด กฎ "ข้อ 3 หรือ 4 ไม่ผ่านขณะที่ข้อ 1 และ 2 ผ่าน" ใน [ai-reply](../specs/ai-reply.md#เงื่อนไขที่-ai-จะตอบ) ตรงกับแถว 4 และ 5 ที่นี่ ส่วนการเลิกติดตามไม่ขึ้นรอแอดมินเพราะตอบไม่ได้อยู่แล้ว

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `handoffReasonForType` | `(type: Exclude<MessageType, "text" \| "event">) => HandoffReason` | image → `customer_sent_image`, video → `customer_sent_video`, sticker และ other → `customer_sent_non_text` |
| `handoffReasonFromModel` | `(r: ModelHandoffReason \| null) => HandoffReason` | `"ai_" + r` และ null → `ai_other` |
| `handoffText` | `(particle: PoliteParticle) => string` | คืน `ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะ{p}` โดย `{p}` คือคำลงท้ายที่ตั้งไว้ในรูปที่ถูกต้องหลัง "นะ": `ค่ะ` → `คะ`, `ครับ` → `ครับ` ผลจึงเป็น "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ" หรือ "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะครับ" |
| `buildSystemInstructions` | `(s: Pick<Settings, "aiName" \| "aiAnswerMode" \| "aiPoliteParticle" \| "aiInstructions">) => string` | เติม slot ของแม่แบบคำสั่งระบบตาม [ai-prompt](../specs/ai-prompt.md#2-คำสั่งระบบ) ผลต้องเหมือนเดิมทุกไบต์เมื่อ input เดิม (เพื่อ prompt caching) ไม่มีเวลา id ชื่อ LINE OA หรือชื่อผู้ใช้ |
| `normalizeAiName` | `(raw: string \| null) => string \| null` | ตัดช่องว่างหัวท้าย เหลือว่างคืน null |
| `formatKnowledgeBase` | `(docs: { fileName: string; text: string }[]) => string` | บล็อก `<knowledge>` ตาม [ai-prompt ข้อ 2.3](../specs/ai-prompt.md#23-บล็อกคลังความรู้) รวมการ escape และบล็อกของคลังว่าง ต่อเอกสารตามลำดับที่ได้รับ |
| `toHistoryTurns` | `(messages: Message[]) => ChatTurn[]` | ตาม [ai-prompt ข้อ 4](../specs/ai-prompt.md#4-ประวัติแชท): ข้าม `type = event` และข้อความขาออกที่ `deliveryStatus` เป็น `pending` หรือ `failed`, ผู้ใช้เป็น `customer` ส่วนแอดมินกับ AI เป็น `assistant`, สื่อแทนด้วยคำในวงเล็บเหลี่ยมตามตารางข้อ 4.2, รวมข้อความติดกันของฝั่งเดียวกันด้วยบรรทัดใหม่, ตัด turn ของ `assistant` ที่อยู่หน้าสุดทิ้ง ผลต้องจบด้วย turn ของ `customer` ถ้าไม่จบ คืน array ว่าง |
| `sanitizeAiReply` | `(text: string) => string \| null` | ทำความสะอาดตาม [ai-prompt ข้อ 6](../specs/ai-prompt.md#6-การทำความสะอาดคำตอบ) คืน null เมื่อผลว่าง หรือยาวเกิน `AI_REPLY_MAX_CHARS` |
| `replyLinks` | `(reply: string) => string[]` | ลิงก์ในคำตอบตาม [ai-prompt ข้อ 6.1](../specs/ai-prompt.md#61-ลิงก์ในคำตอบ): URL ที่ขึ้นต้นด้วย `http://` หรือ `https://`, host ที่ขึ้นต้นด้วย `www.` และ domain ที่ตามด้วย path ไม่รวมเครื่องหมายวรรคตอนท้าย ไม่นับราคา เวลา และอีเมล ([`reply-links.logic.ts`](../../src/core/domain/reply-links.logic.ts)) |
| `disallowedLinks` | `(reply: string, sources: readonly string[]) => string[]` | ลิงก์ของ `replyLinks(reply)` ที่ไม่มีใน `sources` (ข้อความคลังความรู้และคำแนะนำสำหรับ AI) เทียบด้วย `normalizeLink`: ไม่สนใจ scheme, `www.`, ตัวพิมพ์ และ `/` ท้าย และนับ host ของลิงก์ที่แอดมินเขียนว่าอนุญาตด้วย array ว่างคือส่งได้ |
| `noResponseUsage` | `(r: Pick<AiUsageRecord, "id" \| "kind" \| "contactId" \| "documentId" \| "provider" \| "model" \| "createdAt">) => AiUsageRecord` | แถวของการเรียกที่ไม่ได้คำตอบ: `outcome = failed`, token และ `cost` เป็นศูนย์, `error = ai.no_response`, `messageId = null` ([`usage.logic.ts`](../../src/core/domain/usage.logic.ts)) คู่กับ `isNoResponse(code)` |
| `formatPromptNow` | `(now: Date) => string` | ข้อความเวลาปัจจุบันตาม [ai-prompt ข้อ 3](../specs/ai-prompt.md#3-โครงของ-request) เขต `Asia/Bangkok` ปีพุทธศักราช เช่น `เวลาปัจจุบัน: วันพุธที่ 18 พฤศจิกายน 2569 14:32 (เวลาไทย)` |
| `isAiStateStuck` | `(c: Pick<Contact, "aiState" \| "aiStateAt">, now: Date, stuckAfterMs: number) => boolean` | true เมื่อ `aiState = replying` และ `aiStateAt` เก่ากว่า `now - stuckAfterMs` หรือเป็น null |
| `usageOutcomeOf` | `(r: ChatModelResponse) => { outcome: UsageOutcome; error: ErrorCode \| null; handoff: HandoffReason \| null }` | `refused` → (`refused`, `ai.refused`, `ai_failed`), `truncated` → (`failed`, `ai.truncated`, `ai_failed`), `completed` กับ output null → (`failed`, `ai.invalid_output`, `ai_failed`), output ที่ `needsAdmin` true → (`handoff`, null, `handoffReasonFromModel(output.handoffReason)`), นอกนั้น (`ok`, null, null) |

### การส่งทาง LINE

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `replyTokenExpiry` | `(eventTimestamp: Date, isRedelivery: boolean) => Date \| null` | คืน null เมื่อเป็นการส่งซ้ำของ LINE ไม่เช่นนั้นคืน `eventTimestamp + REPLY_TOKEN_USABLE_MS` |
| `retryKeyExpiresAt` | `(m: Pick<Message, "firstPushAt">) => Date \| null` | `firstPushAt + LINE_RETRY_KEY_WINDOW_MS` ไม่มี `firstPushAt` คืน null (LINE ยังไม่เคยเห็น key) |
| `isRetryKeyExpired` | `(m: Pick<Message, "firstPushAt">, now: Date) => boolean` | true เมื่อ `now >= retryKeyExpiresAt(m)` ปลายหน้าต่างนับว่าผ่าน ไม่มีหน้าต่างคืน false |
| `lineSecretStatus` | `(s: Pick<Settings, "lineChannelId" \| "lineSecretVerifiedAt">) => LineSecretStatus` | ไม่มี Channel ID → `no_channel_id`, มีแต่ `lineSecretVerifiedAt` เป็น null → `unchecked`, นอกนั้น `verified` |
| `chooseSendChannel` | `(c: Pick<Contact, "replyToken" \| "replyTokenExpiresAt">, now: Date) => { channel: "reply"; replyToken: string } \| { channel: "push" }` | `reply` เมื่อมี token และ `now < replyTokenExpiresAt` นอกนั้น `push` |
| `splitLineText` | `(text: string, limit = LINE_TEXT_MAX_CHARS) => string[]` | ถ้าไม่เกิน limit คืนก้อนเดียว ไม่เช่นนั้นตัดที่บรรทัดใหม่หรือช่องว่างสุดท้ายก่อน limit ถ้าไม่มี ตัดที่ขอบ grapheme ด้วย `Intl.Segmenter` เพื่อไม่แยกสระกับพยัญชนะไทย ไม่คืนก้อนว่าง ความยาวนับเป็น UTF-16 code unit จนกว่าจะยืนยันวิธีนับของ LINE |
| `toOutboundParts` | `(m: Pick<Message, "type" \| "text" \| "mediaUrl" \| "previewUrl">) => OutboundLinePart[]` | text → `splitLineText` ต่อก้อน, image และ video → หนึ่งชิ้น ถ้าได้เกิน `LINE_MAX_PARTS_PER_REQUEST` เป็น bug เพราะ route จำกัดความยาวไว้แล้ว ให้ throw |
| `previewOf` | `(m: Pick<Message, "type" \| "text">) => { type: Exclude<MessageType, "event">; text: string \| null }` | text → ตัดเหลือ `PREVIEW_TEXT_MAX_CHARS` ตัวแรกตามขอบ grapheme และไม่เกิน `PREVIEW_TEXT_MAX_UNITS` หน่วย UTF-16 (ตัดที่ขอบ grapheme ก่อนหน้า เช่นตัวอักษรที่มีเครื่องหมายซ้อนยาวมาก) และแทนบรรทัดใหม่ด้วยช่องว่าง, ชนิดอื่น → text เป็น null ชนิด event ห้ามส่งเข้ามา (throw) |

### สื่อและไฟล์

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `sniffContentType` | `(leadingBytes: Uint8Array) => SniffedType \| null` | ดู magic bytes อย่างน้อย 16 ไบต์แรก: `FF D8 FF` → `image/jpeg`, `89 50 4E 47 0D 0A 1A 0A` → `image/png`, `GIF8` → `image/gif`, `RIFF....WEBP` → `image/webp`, ไบต์ 4 ถึง 7 เป็น `ftyp` แล้ว brand ไม่ใช่ `qt  ` → `video/mp4`, `%PDF-` → `application/pdf` นอกนั้น null |
| `outboundMediaRule` | `(kind: "image" \| "video") => { contentTypes: string[]; maxBytes: number }` | image → `image/jpeg`, `image/png` ไม่เกิน `IMAGE_MAX_BYTES`, video → `video/mp4` ไม่เกิน `VIDEO_MAX_BYTES` |
| `inboundMediaMaxBytes` | `(type: "image" \| "video") => number` | image → `IMAGE_MAX_BYTES`, video → `VIDEO_MAX_BYTES` |
| `isAllowedInboundType` | `(type: "image" \| "video", sniffed: SniffedType \| null) => boolean` | image รับ jpeg, png, gif, webp ส่วน video รับ mp4 |
| `outboundStorageKeys` | `(uploadId: UploadId, contentType: string) => { original: StorageKey; preview: StorageKey }` | `outbound/{uploadId}/original.{jpg\|png\|mp4}` และ `outbound/{uploadId}/preview.jpg` |
| `inboundStorageKeys` | `(token: string, ext: string) => { original: StorageKey; preview: StorageKey }` | `inbound/{token}/original.{ext}` และ `inbound/{token}/preview.jpg` |

`SniffedType` คือ `"image/jpeg" | "image/png" | "image/gif" | "image/webp" | "video/mp4" | "application/pdf"`

### เงินและเวลา

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `computeCost` | `(usage: TokenUsage, model: string, table: PriceTable) => { cost: NanoUsd; priceKnown: boolean }` | ผลรวมของ token แต่ละประเภทคูณราคาต่อ token ของโมเดลนั้น ถ้าไม่มีโมเดลในตาราง ใช้ราคาที่สูงที่สุดของแต่ละประเภทในตาราง และคืน `priceKnown: false` เพื่อให้งบไม่ถูกประเมินต่ำ |
| `parseUsd` | `(s: string) => NanoUsd \| null` | รับ `^\d{1,6}(\.\d{1,9})?$` นอกนั้น null |
| `formatUsd` | `(n: NanoUsd, decimals: 2 \| 6) => string` | ปัดครึ่งขึ้น จุดเป็นตัวคั่นทศนิยม ไม่มีจุลภาค |
| `bangkokDayRange` | `(now: Date) => { from: Date; to: Date }` | ช่วง `[00:00, 24:00)` ของวันตามเวลาไทย (UTC+7 ไม่มี daylight saving) แสดงเป็น UTC เช่น `2026-11-18T05:00Z` → `2026-11-17T17:00Z` ถึง `2026-11-18T17:00Z` |
| `bangkokMonthRange` | `(month: string) => { from: Date; to: Date } \| null` | รับ `YYYY-MM` คืนช่วงวันแรกถึงวันแรกของเดือนถัดไปตามเวลาไทย รูปแบบผิดคืน null |
| `bangkokMonthOf` | `(now: Date) => string` | เดือนปัจจุบันตามเวลาไทยในรูป `YYYY-MM` |

```ts
/** ราคาต่อ token หน่วย nano-USD ซึ่งเท่ากับราคาต่อล้าน token หน่วย milli-USD */
export interface ModelPrice {
  input: bigint; output: bigint; cacheRead: bigint; cacheWrite: bigint;
}
export interface PriceTable {
  asOf: string;                       // วันที่อ้างอิง เช่น "2026-11-03"
  models: Readonly<Record<string, ModelPrice>>;
}
// ตัวอย่างการแปลง: $4.00 ต่อล้าน token = 4000n nano-USD ต่อ token
```

ค่าในตารางราคาอยู่ในไฟล์ config ตาม [usage-cost](../specs/usage-cost.md#การคำนวณราคา) ส่งเข้าแกนกลางผ่าน `UseCaseConfig`

### การจำกัดความถี่

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `rateWindowStart` | `(now: Date, windowMs: number) => Date` | ปัดลงเป็นจุดเริ่มของหน้าต่างแบบคงที่ `floor(now / windowMs) * windowMs` |
| `effectiveLimit` | `(action: RateLimitAction, scale: number) => number` | `RATE_LIMIT_RULES[action].limit` คูณ `scale` เมื่อ `scaled` เป็น true ไม่เช่นนั้นค่าเดิม |
| `isRateLimited` | `(bucket: { count: number }, limit: number) => boolean` | true เมื่อ `count > limit` (count รวมครั้งปัจจุบันแล้ว ใช้หลัง `hit`) |
| `retryAfterSeconds` | `(windowStart: Date, windowMs: number, now: Date) => number` | วินาทีที่เหลือจนจบหน้าต่าง ปัดขึ้น อย่างน้อย 1 |

### คลังความรู้

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `knowledgeOverflow` | `(usedTokens: number, addingTokens: number, capacity = KNOWLEDGE_CAPACITY_TOKENS) => number` | จำนวน token ที่เกิน คืน 0 เมื่อไม่เกิน |

### ขอบเขตหัวข้อ

อยู่ใน `src/core/domain/topic-guard.logic.ts` พฤติกรรมอยู่ใน [topic-guard](../specs/topic-guard.md) ข้อความของ prompt อยู่ใน [ai-prompt ข้อ 9](../specs/ai-prompt.md#9-prompt-ของขอบเขตหัวข้อ)

```ts
export type GuardTopicsIssue = "too_many" | "too_long" | "duplicate";
```

| ฟังก์ชัน | ลายเซ็น | กฎ |
| --- | --- | --- |
| `guardRefusalText` | `(particle: PoliteParticle, topics: readonly string[]) => string` | ข้อความที่ผู้ใช้ได้เมื่อขอบเขตหัวข้อกัน บอกชื่อหัวข้อที่บันทึกไว้ไม่เกิน `GUARD_REFUSAL_MAX_TOPICS` หัวข้อ เช่น `ตอนนี้คุยได้เฉพาะเรื่อง “มุกตลกไทย” และ “มุกจากภาพยนตร์” นะคะ` รูปแบบเต็มอยู่ใน [topic-guard](../specs/topic-guard.md) `{p}` ตามกฎเดียวกับ `handoffText` ไม่ตั้งค่าได้ ([ADR 0024](../adr/0024-scope-reductions.md), [ADR 0031](../adr/0031-settings-tabs-user-wording-and-neutral-prompt.md)) |
| `normalizeGuardTopics` | `(raw: readonly string[]) => { topics: string[]; issue: GuardTopicsIssue \| null }` | ตัดช่องว่างหัวท้ายของแต่ละรายการ ทิ้งรายการว่าง คงลำดับเดิม แล้วตรวจตามลำดับ: เกิน `GUARD_MAX_TOPICS` รายการ → `too_many`, รายการใดยาวเกิน `GUARD_TOPIC_MAX_CHARS` ตัว → `too_long`, มีสองรายการเท่ากันทุกตัวอักษร → `duplicate` นอกนั้น `issue` เป็น null ไม่ตัดรายการทิ้งเอง contract ของ `PATCH /api/settings` และหน้าตั้งค่าใช้ฟังก์ชันนี้ผ่าน `src/contracts/` |
| `guardContextTurns` | `(history: ChatTurn[], n = GUARD_CONTEXT_TURNS) => { message: string; context: ChatTurn[] }` | `history` มาจาก `toHistoryTurns` จึงจบด้วย `customer` เสมอ: `message` คือ `text` ของ turn สุดท้าย และ `context` คือ turn ก่อนหน้าไม่เกิน `n` turn ตามลำดับเดิม history ว่างหรือไม่จบด้วย `customer` เป็น bug ให้ throw |
| `buildGuardRulesBlock` | `(topics: string[]) => string` | บล็อก `<topic_guard>` ที่ต่อท้ายคำสั่งระบบของการตอบแชทเมื่อขอบเขตหัวข้อเปิด ตาม [ai-prompt ข้อ 9.5](../specs/ai-prompt.md#95-บล็อกที่ต่อท้ายคำสั่งระบบของการตอบแชท) แทน `<` และ `>` ในหัวข้อด้วย `‹` และ `›` ผลเหมือนเดิมทุกไบต์เมื่อ input เดิม |
| `buildGuardClassifierPrompt` | `(input: { topics: string[]; message: string; context: ChatTurn[] }) => { system: string; userText: string }` | คำสั่งระบบและข้อความ user ของการคัดกรองตาม [ai-prompt ข้อ 9.1 ถึง 9.2](../specs/ai-prompt.md#91-คำสั่งระบบของการคัดกรอง) รวมการ escape ข้อความของผู้ใช้และบริบท adapter ของ Claude เรียกฟังก์ชันนี้ |
| `guardVerdictOf` | `(r: TopicGuardResponse, topics: string[]) => { verdict: "allowed" \| "blocked" \| "failed"; matchedTopic: string \| null; error: ErrorCode \| null }` | `refused` → (`failed`, `ai.refused`), `truncated` → (`failed`, `ai.truncated`), `completed` กับ `verdict` null → (`failed`, `ai.invalid_output`), `allowed: false` → (`blocked`, null, null), `allowed: true` → (`allowed`, `matchedTopic` ถ้าตรงกับหัวข้อใน `topics` ทุกตัวอักษร ไม่เช่นนั้น null, null) |

ฟังก์ชันล้วนฝั่งหน้าจอ เช่น การรวมผล polling, การจัดกลุ่มข้อความ และรูปแบบเวลา อยู่ใน `src/features/*/` ไม่ใช่แกนกลาง สัญญาของมันอยู่ใน [ui-screens](../specs/ui-screens.md#8-ฟังก์ชันล้วนฝั่งหน้าจอ)

## Port

ทุก method ที่ไม่ได้ระบุว่า sync คืน `Promise` ทุก method ที่เรียกภายนอกมี timeout ภายใน adapter และ retry เฉพาะเครือข่ายล่ม, 5xx และ 429 ตามเวลาที่ผู้ให้บริการกำหนด ไม่เกิน 2 ครั้ง

ชุดทดสอบของ port (ดู [test-strategy](../qa/test-strategy.md#กฎ)) ต้องตรวจทุกข้อในคอลัมน์ "ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน"

### การกดที่ไม่เริ่ม AI

`NO_AI_TAP_EVENT_CODES` (`customer.tapped_admin`, `customer.tapped_how_to`) และ `isNoAiTap(message)` ใน `rich-menu.logic.ts`: การกดที่ตอบด้วยข้อความคงที่อย่างเดียว `MessageRepository.latestInbound` ข้ามแถวเหล่านี้ และ `GenerateAiReply` วางแถวเหล่านี้กับข้อความคงที่ที่ตามมาไว้ก่อนข้อความที่กำลังตอบ ([use-cases GenerateAiReply](use-cases.md#generateaireply))

### MessagingGateway

```ts
/** บอทที่ token ใช้: userId และ basicId ของ GET /v2/bot/info */
export interface LineBotIdentity { botUserId: string; basicId: string }

export interface MessagingGateway {
  /** sync: HMAC-SHA256 ของ rawBody ด้วย channelSecret แบบ base64 เทียบกับ signature แบบ timing-safe */
  verifySignature(rawBody: string, signature: string, channelSecret: string): boolean;

  /** sync: แปลง JSON ของ webhook เป็น LineEvent ตรวจเข้มเฉพาะ field ที่ใช้ */
  parseEvents(rawBody: string): Result<LineEvent[], "webhook.payload_invalid">;

  reply(
    token: LineAccessToken, replyToken: string, parts: OutboundLinePart[],
  ): Promise<Result<{ sentIds: LineMessageId[] }, // sentMessages[].id ตามลำดับ อ่านแบบผ่อนปรน อาจว่าง
    "line.reply_token_invalid" | "line.unauthorized" | "line.rate_limited" | "line.reply_failed" | "line.unavailable">>;

  push(
    token: LineAccessToken, to: LineUserId, parts: OutboundLinePart[], retryKey: string,
  ): Promise<Result<{ alreadyAccepted: boolean; sentIds: LineMessageId[] }, // 409 ที่รับไปแล้ว: sentIds ว่าง
    "line.unauthorized" | "line.quota_exceeded" | "line.rate_limited" | "line.push_failed" | "line.unavailable">>;

  getProfile(token: LineAccessToken, userId: LineUserId): Promise<Result<
    { displayName: string; pictureUrl: string | null },
    "line.profile_unavailable" | "line.unauthorized" | "line.unavailable">>;

  /** เฉพาะ HTTP 200 คือไฟล์ 2xx อื่น (202 ระหว่าง transcode) เป็น line.content_not_ready */
  downloadContent(
    token: LineAccessToken, lineMessageId: LineMessageId, variant: "original" | "preview", maxBytes: number,
  ): Promise<Result<
    { stream: ReadableStream<Uint8Array>; contentType: string | null; sizeBytes: number | null },
    "line.content_unavailable" | "line.content_not_ready" | "media.too_large" | "line.unauthorized" | "line.unavailable">>;

  /** LINE เตรียมไฟล์ของข้อความเสร็จหรือยัง เรียกครั้งเดียว ไม่ retry */
  getContentStatus(token: LineAccessToken, lineMessageId: LineMessageId): Promise<Result<
    "processing" | "succeeded" | "failed",
    "line.content_unavailable" | "line.unauthorized" | "line.unavailable">>;

  showLoading(token: LineAccessToken, userId: LineUserId, seconds: number): Promise<Result<void,
    "line.loading_failed" | "line.unauthorized" | "line.unavailable">>;

  /** ตรวจว่า secret เป็นของ Channel ID ด้วย token แบบ client credentials ที่เพิกถอนทันที ไม่คืน ไม่เก็บ ไม่ log */
  /** bot: บอทของ channel อ่านด้วย token ชั่วคราวก่อนเพิกถอน null เมื่ออ่านไม่ได้ */
  verifyChannelSecret(channelId: string, channelSecret: string): Promise<Result<
    { bot: LineBotIdentity | null },
    "line.channel_secret_invalid" | "line.unavailable">>;

  /** ใช้ตรวจ access token ทั้งตอนบันทึกและตอนทดสอบการเชื่อมต่อ */
  getBotInfo(token: LineAccessToken): Promise<Result<
    { botName: string; basicId: string; botUserId: string },
    "line.credentials_invalid" | "line.unavailable">>;

  // Rich menu: RichMenuError = "line.unauthorized" | "line.rate_limited" | "line.rich_menu_failed" | "line.unavailable"
  createRichMenu(token: LineAccessToken, menu: RichMenuSpec): Promise<Result<{ richMenuId: string }, RichMenuError>>;
  /** อัปโหลดรูป PNG ของแอปไปที่เมนู (host ของ content) */
  uploadRichMenuImage(token: LineAccessToken, richMenuId: string): Promise<Result<void, RichMenuError>>;
  setDefaultRichMenu(token: LineAccessToken, richMenuId: string): Promise<Result<void, RichMenuError>>;
  /** ไม่มีเมนูเริ่มต้นไม่ใช่ error */
  clearDefaultRichMenu(token: LineAccessToken): Promise<Result<void, RichMenuError>>;
  /** เมนูที่ LINE ไม่รู้จัก (404) ถือว่าลบแล้ว */
  deleteRichMenu(token: LineAccessToken, richMenuId: string): Promise<Result<void, RichMenuError>>;
}
```

`LineAccessToken` ถูกส่งทุกครั้ง adapter ไม่อ่านฐานข้อมูลเอง (adapter ห้ามเรียก adapter อื่น) use case ได้ค่ามาจาก `SettingsRepository` และ `SecretCipher`

| Method | ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- | --- |
| `verifySignature` | signature ว่าง หรือ base64 ผิดรูป คืน false ไม่ throw ใช้ raw body ตรงตัว ไม่ parse ก่อน |
| `parseEvents` | `events` ว่างคืน `ok([])` (ปุ่ม Verify ของ LINE) event ที่ field ที่ใช้ผิดรูปถูกแปลงเป็น `unsupported` ไม่ทำให้ทั้งก้อนล้ม คืน `webhook.payload_invalid` เฉพาะเมื่อ body ไม่ใช่ JSON หรือไม่มี array `events` ลำดับของผลตรงกับลำดับใน payload |
| `reply` | ส่งทุกชิ้นในคำขอเดียว คืน `line.reply_token_invalid` เฉพาะเมื่อ LINE ตอบ 400 ที่ `message` ตรงกับ `/invalid reply token/i` (token หมดอายุหรือถูกใช้แล้ว) ซึ่งผู้เรียกจะเปลี่ยนเป็น push ได้อย่างปลอดภัย 400 อื่น (body ผิดรูป มี `details[].property`) คืน `line.reply_failed` ซึ่งผู้เรียกห้าม push payload เดิมต่อ เครือข่ายล่มหรือ 5xx หลัง retry คืน `line.unavailable` ซึ่งหมายถึงไม่รู้ผล ผู้เรียกห้าม push ต่อเอง |
| `push` | ใส่ header `X-Line-Retry-Key` ทุกครั้งรวมทุก retry ค่าเป็น UUID version 5 (variant RFC 4122) จาก 16 byte แรกของ SHA-256 ของ `retryKey` ตัวจริงทำผ่าน `toLineRetryKey` ตัวปลอมจำ `retryKey` ตรงตัว ถ้า LINE ตอบว่ารับคำขอนี้ไปแล้ว (สมมติว่าเป็น 409 ต้องยืนยัน) คืน `ok({ alreadyAccepted: true })` ตัวปลอมต้องจำ retryKey และไม่บันทึกการส่งซ้ำ แยก `line.quota_exceeded` ออกจาก `line.rate_limited` ด้วยข้อความของ LINE (ต้องยืนยัน) |
| `getProfile` | timeout `LINE_PROFILE_TIMEOUT_MS` และไม่ retry เพราะเรียกก่อนตอบ webhook (ผู้ใช้ใหม่) หรือในงานดึงใหม่หลังตอบ 404 หรือ timeout คืน `line.profile_unavailable` |
| `downloadContent` | ดึงจาก host ข้อมูลของ LINE ที่กำหนดตายตัวเท่านั้น เฉพาะ 200 คือไฟล์ 202 หรือ 2xx อื่นคืน `line.content_not_ready` โดยไม่อ่าน body ถ้า `Content-Length` เกิน `maxBytes` คืน `media.too_large` โดยไม่อ่าน body ถ้าไม่มี `Content-Length` stream ที่คืนต้อง error เมื่ออ่านเกิน `maxBytes` ด้วย error ที่มี `code: "media.too_large"` (ตัวจริงใช้ `LineContentTooLargeError` ตัวปลอมใช้ `FakeContentTooLargeError`) การขาดของ stream แบบอื่นต้องไม่มีรหัสนี้ ตัวจริงตัด body เอง (ไม่พึ่ง fetch) เมื่อ `LINE_CONTENT_TIMEOUT_MS` ของรอบที่ได้คำตอบหมด หรือเมื่อไม่มี chunk ใหม่นาน `LINE_CONTENT_IDLE_TIMEOUT_MS` ขณะผู้อ่านรออยู่ ด้วย `LineContentTimeoutError` ที่ไม่มีรหัส `media.too_large` ([ADR 0033](../adr/0033-buffer-inbound-media-and-stage-deadlines.md)) 404 หรือ 410 คืน `line.content_unavailable` variant `preview` ใช้กับวิดีโอเท่านั้น (ต้องยืนยัน endpoint ภาพตัวอย่างของ LINE) |
| `getContentStatus` | `GET /v2/bot/message/{id}/content/transcoding` ครั้งเดียวด้วย `LINE_REQUEST_TIMEOUT_MS` คืน `processing` ระหว่างที่ `downloadContent` ยังได้ `line.content_not_ready` แล้ว `succeeded` (ตัวปลอมและ harness นับคำตอบ "ยังไม่พร้อม" รวมกันทั้งสอง method) |
| `verifyChannelSecret` | `POST /v2/oauth/accessToken` แบบ form (`grant_type=client_credentials`, `client_id`, `client_secret`) ไม่มี bearer และไม่ retry (แต่ละครั้งออก token) 200 แล้วอ่าน `GET /v2/bot/info` ด้วย token นั้นครั้งเดียวไม่ retry (`userId` และ `basicId` คือ `LineBotIdentity` ของ channel ตอบไม่ได้หรือผิดรูปได้ `bot: null`) แล้วเพิกถอนด้วย `POST /v2/oauth/revoke` ทันทีแบบ best effort คืน ok, 4xx ที่ไม่ใช่ 429 คืน `line.channel_secret_invalid`, 429, 5xx, timeout และเครือข่ายคืน `line.unavailable` (ตรวจไม่ได้) secret และ token ไม่อยู่ใน detail ของ error |
| `showLoading` | ไม่ retry ผู้เรียกไม่ถือผลเป็นความล้มเหลว `seconds` ที่ LINE ไม่รับคืน `line.loading_failed` |
| `getBotInfo` | 401 หรือ 403 คืน `line.credentials_invalid` `botUserId` คือ `userId` ของบอท ใช้เทียบกับบอทของ Channel ID ใน `SetLineCredentials` และ `TestLineConnection` ([ADR 0028](../adr/0028-review-fixes-concurrency-polling-and-ci.md)) |
| `createRichMenu` | `POST /v2/bot/richmenu` ครั้งเดียว (ไม่ retry) body จาก `toLineRichMenu` 2xx ที่ไม่มี `richMenuId` ที่ปลอดภัยใน path คืน `line.rich_menu_failed` |
| `uploadRichMenuImage` | `POST {data host}/v2/bot/richmenu/{id}/content` ด้วย `image/png` ครั้งเดียว เมนูที่ไม่มี หรือมีรูปแล้ว คืน `line.rich_menu_failed` |
| `setDefaultRichMenu` | `POST /v2/bot/user/all/richmenu/{id}` เมนูที่ไม่มี หรือยังไม่มีรูป คืน `line.rich_menu_failed` |
| `clearDefaultRichMenu`, `deleteRichMenu` | `DELETE` ทำซ้ำได้ 404 คืน ok |
| ทุกเมธอดของ rich menu | 401 → `line.unauthorized`, 429 → `line.rate_limited`, 5xx และไม่มีคำตอบ → `line.unavailable`, 4xx อื่น → `line.rich_menu_failed` id ที่มีอักขระนอก `[A-Za-z0-9_-]` คืน `line.rich_menu_failed` โดยไม่เรียก LINE |
| `parseEvents` (postback) | `type: postback` ที่มี `postback.data` เป็น string ไม่เกิน `POSTBACK_DATA_MAX_CHARS` เป็น `postback` นอกนั้น `unsupported` |
| `reply` (card) | ชิ้น `card` เป็นข้อความ Flex หนึ่งข้อความ (`toFlexWelcome`) |

### ChatModel

```ts
export type ChatRole = "customer" | "assistant"; // assistant: ข้อความของแอดมินหรือ AI
export interface ChatTurn { role: ChatRole; text: string }

export interface ChatModelRequest {
  model: AiModelId;
  systemInstructions: string;     // จาก buildSystemInstructions
  knowledgeText: string;          // จาก KnowledgeSource เป็นบล็อก <knowledge> เสมอ (คลังว่างเป็นบล็อกว่าง)
  history: ChatTurn[];            // จาก toHistoryTurns ไม่ว่าง และจบด้วย customer
  now: Date;                      // เวลาปัจจุบันจาก Clock adapter แปลงด้วย formatPromptNow
  maxTokens: number;              // AI_MAX_TOKENS
}

export interface ChatOutput { reply: string; needsAdmin: boolean; handoffReason: ModelHandoffReason | null }

export interface ChatModelResponse {
  stop: "completed" | "refused" | "truncated";
  /** null เมื่อ stop ไม่ใช่ completed หรือคำตอบไม่ตรง schema */
  output: ChatOutput | null;
  usage: TokenUsage;
  servedModel: string;            // ชื่อโมเดลที่ API รายงาน
}

export interface ChatModel {
  generateReply(req: ChatModelRequest): Promise<Result<ChatModelResponse,
    "ai.unavailable" | "ai.no_response" | "ai.rate_limited" | "ai.auth_failed" | "ai.bad_request">>;
}
```

| ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- |
| ทุกครั้งที่ API ตอบกลับมา (รวมการปฏิเสธและคำตอบที่ถูกตัด) คืน `ok` พร้อม `usage` เพื่อให้บันทึกต้นทุนได้ คืน error เฉพาะเมื่อไม่มีคำตอบจาก API |
| `ai.no_response` คือคำขอที่อาจถึงผู้ให้บริการแล้วแต่ไม่ได้คำตอบ (timeout, ถูกตัดที่ `callDeadlineMs`, การเชื่อมต่อหลุด หรือ stream ขาด) ซึ่งอาจถูกคิดเงิน แกนกลางบันทึกแถว `AiUsage` ที่ยอดเป็นศูนย์ ([usage-cost](../specs/usage-cost.md#การเรียกที่ไม่ได้คำตอบ)) `ai.unavailable` คือ API ตอบ 5xx, 408, 409 หรือยังไม่ได้ส่งอะไรออกไป (การเชื่อมต่อถูกปฏิเสธ หา host ไม่เจอ) |
| `output` ผ่านการตรวจ schema ตาม [ai-prompt ข้อ 5.2](../specs/ai-prompt.md#52-schema-ที่ระบบตรวจซ้ำ-zod-ใน-adapter) แล้ว: `reply` เป็นสตริง, `needsAdmin` เป็น boolean และ `handoffReason` เป็นค่าของ `ModelHandoffReason` หรือ null (เมื่อ `needsAdmin` เป็น true แต่ได้ null ให้เป็น `other`) ไม่มี field อื่น ตรวจความยาวและเนื้อหาต่อที่ `sanitizeAiReply` ในแกนกลาง |
| `now` ถูกใส่เป็นข้อความระบบตัวสุดท้ายหลังประวัติ ไม่อยู่ใน `system` เพื่อไม่ให้ cache ของส่วนหน้าเปลี่ยน ตัวปลอมเก็บค่า `now` ที่ได้รับไว้ให้ test ตรวจ |
| ไม่มีเครื่องมือให้โมเดลเรียก และไม่ stream |
| ตัวปลอมรับผลที่ตั้งไว้ล่วงหน้าต่อคำขอ และเก็บคำขอที่ได้รับไว้ให้ test ตรวจ |

### DocumentExtractor

```ts
export interface ExtractRequest {
  model: AiModelId;
  pdf: Uint8Array;               // ผ่านการตรวจขนาดและชนิดแล้ว
  maxTokens: number;             // AI_EXTRACT_MAX_TOKENS
}
export interface ExtractResponse {
  stop: "completed" | "refused" | "truncated";
  text: string | null;           // null เมื่อ stop ไม่ใช่ completed หรือข้อความว่าง
  pageCount: number | null;
  usage: TokenUsage;
  servedModel: string;
}

export interface DocumentExtractor {
  extract(req: ExtractRequest): Promise<Result<ExtractResponse,
    "ai.unavailable" | "ai.no_response" | "ai.rate_limited" | "ai.auth_failed" | "ai.bad_request">>;
  /** นับ token ของข้อความด้วย tokenizer ของโมเดลนั้น */
  countTokens(model: AiModelId, text: string): Promise<Result<number,
    "ai.unavailable" | "ai.no_response" | "ai.rate_limited" | "ai.auth_failed" | "ai.bad_request">>;
}
```

| ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- |
| `text` คงตัวคั่นหน้าในรูป `=== หน้า N ===` ขึ้นบรรทัดใหม่ก่อนเนื้อหาของแต่ละหน้า ตามคำสั่งใน [ai-prompt ข้อ 7](../specs/ai-prompt.md#7-prompt-ของการแปลง-pdf) `pageCount` คือจำนวนตัวคั่นที่พบ ถ้าไม่พบเลย `pageCount` เป็น null |
| `text` ผ่านการจัดบรรทัดตาม ai-prompt ข้อ 7.3 แล้ว และเป็น null เมื่อว่างหรือเป็นคำ `EMPTY_DOCUMENT` โดย `stop` ยังเป็น `completed` |
| คืน `ok` พร้อม `usage` ทุกครั้งที่ API ตอบ เหมือน `ChatModel` |
| `countTokens` ไม่บันทึกต้นทุน (ต้องยืนยันว่า endpoint นับ token ไม่คิดเงิน) |
| `extract` และ `countTokens` ใช้ความหมายของ `ai.no_response` และ `ai.unavailable` เดียวกับ `ChatModel` การเรียกทั้งสองจบไม่เกิน `callDeadlineMs` ของตัวเอง ([Adapter ของ Claude](#adapter-ของ-claude)) |

### TopicGuard

คัดกรองว่าข้อความล่าสุดของผู้ใช้อยู่ในหัวข้อที่แอดมินกำหนดหรือไม่ เป็นการเรียกโมเดลแยกจากการตอบแชท ([ADR 0020](../adr/0020-topic-guardrail-as-separate-check.md)) ใช้ `GUARD_MODEL` เสมอ ไม่ขึ้นกับโมเดลที่ตั้งในหน้าตั้งค่า

```ts
export interface TopicGuardRequest {
  topics: string[];               // หัวข้อที่บันทึกไว้ ไม่ว่าง
  message: string;                // turn สุดท้ายของผู้ใช้ จาก guardContextTurns
  context: ChatTurn[];            // ไม่เกิน GUARD_CONTEXT_TURNS turn ก่อนหน้า เพื่อให้ตัดสินข้อความต่อเนื่อง เช่น "ขออีกมุก"
  model: AiModelId;               // GUARD_MODEL
  maxTokens: number;              // GUARD_MAX_TOKENS
  timeoutMs: number;              // GUARD_TIMEOUT_MS
}

// TopicVerdict และ TopicGuardResponse อยู่ใน src/core/domain/topic-guard.model.ts เพราะ guardVerdictOf ใช้ และ port re-export (แบบเดียวกับ ChatTurn)
export interface TopicVerdict { allowed: boolean; matchedTopic: string | null }

export interface TopicGuardResponse {
  stop: "completed" | "refused" | "truncated";
  /** null เมื่อ stop ไม่ใช่ completed หรือคำตอบไม่ตรง schema */
  verdict: TopicVerdict | null;
  usage: TokenUsage;
  servedModel: string;
}

export interface TopicGuard {
  classify(req: TopicGuardRequest): Promise<Result<TopicGuardResponse,
    "ai.unavailable" | "ai.no_response" | "ai.rate_limited" | "ai.auth_failed" | "ai.bad_request">>;
}
```

ผลของ `classify` มี `allowed`, `matchedTopic`, `usage` และ `servedModel` ตามที่ตกลง โดย `allowed` กับ `matchedTopic` อยู่ใน `verdict` เพื่อให้คำตอบที่ถูกปฏิเสธ ถูกตัด หรือไม่ตรง schema ยังคืน `usage` ให้บันทึกต้นทุนได้ เหมือน `ChatModel`

| ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- |
| ทุกครั้งที่ API ตอบกลับมา (รวมการปฏิเสธและคำตอบที่ถูกตัด) คืน `ok` พร้อม `usage` คืน error เฉพาะเมื่อไม่มีคำตอบจาก API |
| `verdict` ผ่าน zod ตาม [ai-prompt ข้อ 9.3](../specs/ai-prompt.md#93-schema-ของผลการคัดกรอง) แล้ว: `allowed` เป็น boolean และ `matchedTopic` เป็นสตริงหรือ null ไม่มี field อื่น การเทียบ `matchedTopic` กับรายการหัวข้อทำใน `guardVerdictOf` ของแกนกลาง |
| `timeoutMs` ใช้เป็น timeout ของคำขอนั้น retry ไม่เกิน `CLAUDE_GUARD_MAX_RETRIES` ครั้ง และทั้งการเรียกจบไม่เกิน `callDeadlineMs({ timeoutMs, maxRetries: CLAUDE_GUARD_MAX_RETRIES })` ไม่ stream ไม่มีเครื่องมือ ความหมายของ `ai.no_response` เดียวกับ `ChatModel` |
| ตัวปลอมรับผลที่ตั้งไว้ล่วงหน้าต่อคำขอ ค่าเริ่มต้นคือ `allowed: true` และเก็บคำขอที่ได้รับไว้ให้ test ตรวจ |

### KnowledgeSource

```ts
export interface KnowledgeSource {
  /** ความรู้ทั้งคลังที่สถานะ ready เรียงตาม createdAt แล้ว id */
  getKnowledge(): Promise<{ text: string; documentCount: number; tokenCount: number }>;
}
```

- ผลต้องเหมือนเดิมทุกไบต์เมื่อคลังไม่เปลี่ยน เพื่อ prompt caching ใช้ `formatKnowledgeBase`
- Adapter จริงอยู่ที่ `src/adapters/prisma/knowledge-source.adapter.ts` และ query ตาราง KbDocument ตรง ไม่เรียก `KnowledgeRepository` เพราะ adapter ห้ามเรียก adapter อื่น
- คลังว่างคืน `{ text: formatKnowledgeBase([]), documentCount: 0, tokenCount: 0 }` ซึ่งเป็นบล็อกของคลังว่างตาม [ai-prompt ข้อ 2.3](../specs/ai-prompt.md#23-บล็อกคลังความรู้)

### FileStorage

ทางอัปโหลดตรงจาก browser มีสองแบบ หน้าเว็บทำตาม `strategy` ของ `UploadTarget` โดยไม่ต้องรู้ว่าอยู่ใน production หรือ Docker

```ts
export type UploadTarget =
  | {
      strategy: "http_put";             // ดิสก์ในเครื่อง
      key: StorageKey;
      contentType: string;
      maxSizeBytes: number;
      url: string;                      // path ของ PUT /api/local-storage/*key ที่เซ็นแล้ว ไม่มี origin (browser PUT ไปที่ origin ที่เปิดอยู่)
      headers: Record<string, string>;  // อย่างน้อย Content-Type
    }
  | {
      strategy: "vercel_blob_client";   // Vercel Blob
      key: StorageKey;
      contentType: string;
      maxSizeBytes: number;
      pathname: string;                 // เท่ากับ key
      clientToken: string;              // token ที่จำกัด pathname ชนิด ขนาด และเวลา (ต้องยืนยันความสามารถของ SDK)
    };

export interface StoredObject {
  publicUrl: string;                    // HTTPS สาธารณะ (local: URL ของ GET /api/local-storage/*key)
  sizeBytes: number;
}

export interface FileStorage {
  issueUpload(spec: {
    key: StorageKey; contentType: string; sizeBytes: number; expiresAt: Date;
  }): Promise<Result<UploadTarget, "storage.unavailable">>;

  put(key: StorageKey, body: ReadableStream<Uint8Array>, opts: {
    contentType: string; maxSizeBytes: number;
  }): Promise<Result<StoredObject, "media.too_large" | "storage.unavailable">>;

  inspect(key: StorageKey): Promise<Result<
    StoredObject & { contentType: string | null; leadingBytes: Uint8Array },
    "upload.not_found" | "storage.unavailable">>;

  /** อ่านไฟล์ ใช้เฉพาะ adapter ดิสก์ในเครื่องผ่าน route GET /api/local-storage/*key */
  read(key: StorageKey): Promise<Result<
    { stream: ReadableStream<Uint8Array>; contentType: string; sizeBytes: number },
    "media.not_found" | "storage.unavailable">>;

  /** เขียนไฟล์ที่ browser PUT เข้ามา ใช้เฉพาะ adapter ดิสก์ในเครื่อง */
  acceptSignedPut(key: StorageKey, query: { exp: string; sig: string }, contentType: string,
    body: ReadableStream<Uint8Array>, now: Date,
  ): Promise<Result<StoredObject,
    "upload.signature_invalid" | "upload.expired" | "upload.content_mismatch" | "upload.incomplete" | "media.too_large" | "storage.unavailable">>;

  delete(key: StorageKey): Promise<Result<void, "storage.unavailable">>;
}
```

| Method | ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- | --- |
| `issueUpload` | ไฟล์ที่อัปโหลดด้วยสิทธิ์นี้ต้องอยู่ที่ `key` ตรงตัว ไม่มีการเติมส่วนสุ่มต่อท้าย (Blob: ต้องยืนยันว่าตั้ง `addRandomSuffix: false` ได้) สิทธิ์จำกัดชนิดเป็น `contentType` และขนาดเป็น `sizeBytes` ที่แน่นอนของไฟล์ (target คืนค่านี้เป็น `maxSizeBytes`): ที่เก็บแบบ local รับเฉพาะขนาดนี้พอดี Blob รับไม่เกินนี้ หมดอายุที่ `expiresAt` |
| `put` | อ่าน body ตามลำดับ ถ้าเกิน `maxSizeBytes` หยุดอ่าน ไม่เหลือส่วนที่เขียนแล้ว และคืน `media.too_large` body ที่ error กลางทางทำให้ไม่สำเร็จ (throw หรือ `storage.unavailable`) และไม่เหลือไฟล์ เขียนทับ key เดิมได้ ดิสก์ในเครื่องเขียนแบบ stream ส่วน Blob อ่านทั้งไฟล์เข้าหน่วยความจำก่อนแล้วอัปโหลดครั้งเดียวด้วยความยาวที่รู้ (ไม่ส่ง stream ต่อเข้า SDK) และการอัปโหลดไม่เกิน `STORAGE_PUT_TIMEOUT_MS` ([ADR 0033](../adr/0033-buffer-inbound-media-and-stage-deadlines.md)) |
| `inspect` | คืนอย่างน้อย 16 ไบต์แรกของไฟล์ (หรือทั้งไฟล์ถ้าสั้นกว่า) และ URL สาธารณะ ไม่มีไฟล์คืน `upload.not_found` (Blob: อ่าน 16 ไบต์แรกจาก URL ของ Blob ด้วย Range header ซึ่งเป็น host ที่กำหนดตายตัว ทั้ง `head` และการอ่านไม่เกิน `STORAGE_CALL_TIMEOUT_MS`) |
| `read` | ไม่มีไฟล์คืน `media.not_found` Adapter ของ Blob คืน `media.not_found` เสมอ เพราะไฟล์บน Blob เปิดจาก URL ของ Blob ตรง |
| `acceptSignedPut` | ตรวจ `sig` เป็น HMAC ของ `key`, `contentType`, ขนาดที่เซ็น และ `exp` แบบ timing-safe, `exp` ผ่านไปแล้วคืน `upload.expired`, `Content-Type` ไม่ตรงคืน `upload.content_mismatch`, body ยาวกว่าขนาดที่เซ็นคืน `media.too_large`, สั้นกว่าคืน `upload.incomplete` (body ที่ถูกตัดระหว่างทาง) และไม่เก็บไฟล์ Adapter ของ Blob คืน `upload.signature_invalid` เสมอ |
| `delete` | ไม่มีไฟล์ถือว่าสำเร็จ (idempotent) Blob: ไม่เกิน `STORAGE_CALL_TIMEOUT_MS` |

URL สาธารณะอยู่ในผลของ `put` และ `inspect` แทนที่จะเป็น method แยก เพราะ Blob อาจรู้ URL หลังเขียนเสร็จเท่านั้น (ต้องยืนยัน) Adapter ดิสก์ในเครื่องสร้าง URL จาก `APP_BASE_URL` ที่ composition ส่งให้

### Repository

ทุก method ที่แก้แถวของ Contact หรือ Message ต้องตั้ง `updatedSeq` เป็นค่าใหม่จาก sequence เดียวกับ `seq` ในคำสั่งเดียวกัน ดู [api-contract](api-contract.md#protocol-ของ-polling)

#### ContactRepository

```ts
export type ContactFilter = "all" | "unread" | "needs_admin";
export interface ContactListCursor { sortAt: Date; id: ContactId }

export interface ContactRepository {
  findById(id: ContactId): Promise<Contact | null>;

  /** สร้างถ้ายังไม่มี (aiEnabled false, following) คืนแถวเดิมถ้ามีแล้ว */
  ensure(input: { id: ContactId; lineUserId: LineUserId; now: Date }): Promise<{ contact: Contact; created: boolean }>;

  updateProfile(id: ContactId, p: { displayName: string | null; pictureUrl: string | null }): Promise<void>;
  /** Compare-and-set ใน statement เดียว: ตั้ง profileFetchedAt = now เมื่อค่าเดิมเป็น null หรือไม่หลัง staleBefore คืน true เมื่อจองได้ ผู้เรียกพร้อมกันได้ true เพียงหนึ่ง (data-model กฎของ repository ข้อ 19) */
  claimProfileRefresh(id: ContactId, now: Date, staleBefore: Date): Promise<boolean>;
  setFollowStatus(id: ContactId, status: FollowStatus, at: Date): Promise<boolean>;

  /** หลังบันทึกข้อความขาเข้าใหม่: unreadCount + 1, lastMessageAt และข้อความล่าสุด (เมื่อไม่เก่ากว่า lastMessageAt เดิม), reply token ถ้า expiresAt ใหม่กว่าของเดิม */
  recordInbound(id: ContactId, i: {
    at: Date; preview: ReturnType<typeof previewOf>;
    replyToken: string | null; replyTokenExpiresAt: Date | null;
  }): Promise<void>;

  /** หลังบันทึกข้อความขาออก: ข้อความล่าสุดและผู้ส่งเท่านั้น ไม่แตะ lastMessageAt (ลำดับของรายชื่อตามผู้ใช้) และ unreadCount */
  recordOutbound(id: ContactId, o: { preview: ReturnType<typeof previewOf>; by: "admin" | "ai" }): Promise<void>;

  /** compare-and-clear: ล้าง token เฉพาะเมื่อยังเป็นค่าเดิม คืน true เมื่อผู้เรียกได้สิทธิ์ใช้ token */
  consumeReplyToken(id: ContactId, replyToken: string): Promise<boolean>;

  setAiEnabled(id: ContactId, enabled: boolean): Promise<void>;
  /** ตั้ง needsAdmin true พร้อมเหตุผล ถ้าเป็นอยู่แล้วเปลี่ยนเหตุผลเป็นค่าใหม่ */
  setNeedsAdmin(id: ContactId, reason: HandoffReason): Promise<void>;
  clearNeedsAdmin(id: ContactId): Promise<void>;
  markRead(id: ContactId): Promise<void>;

  /** atomic: เปลี่ยน idle → replying และตั้ง aiStateAt = now คืน false ถ้าไม่ใช่ idle */
  tryAcquireAiLock(id: ContactId, now: Date): Promise<boolean>;
  releaseAiLock(id: ContactId): Promise<void>;
  /** atomic: ทุกแถวที่ replying และ aiStateAt < staleBefore → idle, needsAdmin true, เหตุผล ai_timeout คืน id ของแถวที่เปลี่ยน */
  recoverStuckAiStates(staleBefore: Date): Promise<ContactId[]>;

  list(q: { filter: ContactFilter; search: string | null; before: ContactListCursor | null; limit: number }):
    Promise<{ contacts: Contact[]; next: ContactListCursor | null }>;
  listChangedAfter(after: Seq, limit: number): Promise<{ contacts: Contact[]; hasMore: boolean }>;
  maxUpdatedSeq(): Promise<Seq>;
  countByFilter(): Promise<{ all: number; unread: number; needsAdmin: number }>;
}
```

| Method | ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- | --- |
| `ensure` | ปลอดภัยเมื่อเรียกพร้อมกันด้วย `lineUserId` เดียวกัน: ได้แถวเดียว และมีผู้เรียกได้ `created: true` คนเดียว |
| `setFollowStatus` | compare-and-set คำสั่งเดียวตามเวลาของ event: เปลี่ยนเฉพาะเมื่อ `followStatusAt` เป็น NULL หรือไม่ใหม่กว่า `at` และสถานะเปลี่ยนจริง (หรือ `following` ของแถวที่ยังไม่มี `followedAt` คือ Contact ที่เพิ่งสร้างจาก follow) แล้วตั้ง `followStatusAt = at` `following` ตั้ง `followedAt = at`, `unfollowed` ล้าง `replyToken` และ `replyTokenExpiresAt` คืน true เมื่อแถวเปลี่ยน |
| `recordInbound` | `lastMessageAt` ไม่ถอยหลัง ถ้า `at` เก่ากว่าค่าเดิม ไม่แก้ข้อความล่าสุด แต่ยังเพิ่ม unreadCount |
| `recordOutbound` | แก้ข้อความล่าสุดและผู้ส่ง ไม่แก้ `lastMessageAt` และ unreadCount ลำดับของ `list` จึงไม่เปลี่ยน |
| `consumeReplyToken` | สองผู้เรียกพร้อมกันด้วย token เดียวกัน ได้ true คนเดียว |
| `tryAcquireAiLock` | สองผู้เรียกพร้อมกัน ได้ true คนเดียว ไม่ยึดล็อกที่ค้างแทน การคืนสภาพทำโดย `recoverStuckAiStates` เท่านั้น |
| `releaseAiLock` | ตั้ง idle และ aiStateAt เป็น null ถ้าเป็น idle อยู่แล้วไม่ผิด |
| `list` | เรียง `coalesce(lastMessageAt, createdAt)` (ข้อความล่าสุดของผู้ใช้) ใหม่ไปเก่า แล้ว id ใหม่ไปเก่า cursor ข้ามแถวที่ค่าเท่ากันได้ถูกต้องด้วย id `search` เทียบ displayName แบบ contains ไม่สนตัวพิมพ์ `filter`: unread คือ unreadCount > 0, needs_admin คือ needsAdmin true |
| `listChangedAfter` | `updatedSeq > after` เรียงจากน้อยไปมาก ไม่กรอง |
| ไม่พบ | `findById` คืน null ส่วน method ที่แก้แถวซึ่งไม่มีอยู่ไม่ทำอะไรและไม่ throw |

#### ContactNoteRepository

```ts
/** โน้ตของแอดมิน ([webchat-inbox](../specs/webchat-inbox.md#โน้ตของแอดมิน)) entity: { id: NoteId; contactId: ContactId; text: string; createdAt: Date } */
export interface ContactNoteRepository {
  insert(note: ContactNote): Promise<ContactNote>;
  /** ใหม่ไปเก่า (createdAt แล้ว id) ไม่เกิน limit */
  listForContact(contactId: ContactId, limit: number): Promise<ContactNote[]>;
  /** ลบโน้ตของผู้ใช้คนนั้น false เมื่อไม่มีหรือเป็นของคนอื่น */
  delete(contactId: ContactId, id: NoteId): Promise<boolean>;
}
```

ชุดทดสอบของ port (`contact-note-repository.suite.ts`) รันกับตัวปลอมและ Postgres: ทุก field กลับมาเหมือนเดิม, เรียงใหม่ไปเก่าโดย id ตัดสินเมื่อเวลาเท่ากัน, limit, ลบได้เฉพาะของผู้ใช้คนนั้น, ผู้ใช้ที่ไม่มีถูกปฏิเสธ (foreign key)

#### MessageRepository

```ts
// firstPushAt เริ่มเป็น null; quotedLineMessageId, mediaDurationMs และ mediaFailure ไม่บังคับ (null)
// webhookEventId: key ของแถวขาเข้าที่ไม่มี lineMessageId (การกดปุ่ม) ไม่อยู่ใน Message
export type NewMessage = Omit<Message, "seq" | "updatedSeq" | "firstPushAt" | "mediaFailure"> & {
  mediaFailure?: MediaFailure | null;
  webhookEventId?: WebhookEventId | null;
};

export interface MessageRepository {
  findById(id: MessageId): Promise<Message | null>;
  /** insert-if-absent ด้วย lineMessageId หรือ webhookEventId เมื่อไม่มี lineMessageId คืนแถวที่มีอยู่เมื่อซ้ำ */
  insertInboundIfAbsent(m: NewMessage): Promise<{ inserted: boolean; message: Message }>;
  /** insert-if-absent ด้วย id */
  insertOutboundIfAbsent(m: NewMessage): Promise<{ inserted: boolean; message: Message }>;
  insertEvent(m: NewMessage): Promise<Message>;

  markSent(id: MessageId, at: Date, lineSentIds: readonly LineMessageId[]): Promise<Message>; // เก็บ id ของส่วนที่ส่ง
  /** ข้อความของผู้ใช้คนนั้นที่ lineMessageId หรือหนึ่งใน lineSentIds อยู่ใน lineIds query เดียวต่อหน้า (การตอบกลับ) */
  findByLineIds(contactId: ContactId, lineIds: readonly LineMessageId[]): Promise<Message[]>;
  markFailed(id: MessageId, code: ErrorCode): Promise<Message>;
  /** compare-and-set: failed → pending ล้าง deliveryError และตั้งเวลาเริ่มของการส่งรอบนี้เป็น at คืน false ถ้าสถานะไม่ใช่ failed */
  markPendingIfFailed(id: MessageId, at: Date): Promise<boolean>;
  /** compare-and-set บน firstPushAt IS NULL: เวลาของ push ครั้งแรก ครั้งถัดไปไม่เปลี่ยนอะไร */
  recordFirstPush(id: MessageId, at: Date): Promise<void>;
  /** compare-and-set บน mediaStatus = pending: ตั้ง ready พร้อม URL ทั้งสอง คืน false ถ้าไม่มีแถวหรือไม่ใช่ pending แล้ว */
  setMediaReady(id: MessageId, mediaUrl: string, previewUrl: string): Promise<boolean>;
  /** compare-and-set บน mediaStatus = pending เหมือน setMediaReady */
  /** failed บันทึก failure (ค่าเริ่มต้น download_failed) too_large ไม่มี */
  setMediaStatus(id: MessageId, status: Exclude<MediaStatus, "ready" | "pending">, failure?: MediaFailure): Promise<boolean>;
  /** คำสั่งเดียว: สื่อของผู้ใช้คนนั้นที่ยัง pending และ createdAt ก่อน staleBefore เป็น failed คืน id ที่แก้ */
  failStuckMedia(contactId: ContactId, staleBefore: Date): Promise<MessageId[]>;
  /** คำสั่งเดียว: ข้อความขาออกของผู้ใช้คนนั้นที่ยัง pending และเริ่มส่งรอบนี้ก่อน staleBefore เป็น failed ด้วย line.send_interrupted คืน id ที่แก้ */
  failStuckDeliveries(contactId: ContactId, staleBefore: Date): Promise<MessageId[]>;

  /** ข้อความขาเข้าล่าสุดของผู้ใช้คนนั้นตาม seq ที่ AI ตอบได้: ข้ามการกดที่ตอบด้วยข้อความคงที่ (`NO_AI_TAP_EVENT_CODES`: `customer.tapped_admin`, `customer.tapped_how_to`) */
  latestInbound(contactId: ContactId): Promise<Message | null>;
  /** limit ข้อความล่าสุดที่ไม่ใช่ event เรียงเก่าไปใหม่ */
  recentForAi(contactId: ContactId, limit: number): Promise<Message[]>;

  listLatest(contactId: ContactId, limit: number): Promise<{ messages: Message[]; hasOlder: boolean }>;
  listBefore(contactId: ContactId, beforeSeq: Seq, limit: number): Promise<{ messages: Message[]; hasOlder: boolean }>;
  listChangedAfter(contactId: ContactId, after: Seq, limit: number): Promise<{ messages: Message[]; hasMore: boolean }>;
  maxUpdatedSeq(contactId: ContactId): Promise<Seq>;
  countForContact(contactId: ContactId): Promise<{ total: number; byAi: number }>;
  /** จำนวนบรรทัดเหตุการณ์ (type = event) ทุกผู้ใช้ที่ createdAt อยู่ใน [from, to) แยกตาม eventCode รหัสที่ไม่มีแถวไม่อยู่ในผล */
  countEventsByCode(range: DateRange): Promise<Partial<Record<EventCode, number>>>;
}
```

| Method | ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- | --- |
| `insert*IfAbsent` | ใช้ insert แบบข้ามเมื่อซ้ำ แล้วอ่านแถวที่มีอยู่ ไม่ดัก error ของ unique constraint ([ADR 0010](../adr/0010-reply-token-first-and-idempotency.md)) เรียกพร้อมกันได้ `inserted: true` คนเดียว |
| `markSent`, `markFailed` | คืนแถวหลังแก้ แก้แถวที่ไม่มีอยู่เป็น bug ให้ throw |
| `setMediaReady`, `setMediaStatus` | compare-and-set บน `mediaStatus = pending` (UPDATE ... WHERE id AND mediaStatus = pending) แก้ได้ครั้งเดียว เรียกพร้อมกันได้ `true` คนเดียว แถวที่ไม่ใช่ pending แล้วหรือไม่มีอยู่คืน false และไม่แก้อะไร ใช้ให้ `StoreInboundMedia` สองรอบของข้อความเดียวกันไม่ทับผลกัน |
| `recordFirstPush` | UPDATE ... WHERE id AND `firstPushAt IS NULL` ครั้งแรกเท่านั้นที่ตั้งค่า การส่งอีกครั้งไม่เลื่อน ผู้เรียกพร้อมกันได้ค่าเดียว แถวที่ไม่มีไม่ใช่ error `RetryMessage` ใช้ค่านี้วัดหน้าต่างของ retry key |
| `markPendingIfFailed` | ตั้งเวลาเริ่มของการส่งรอบนี้ (`Message.deliveryAttemptAt`) เป็น `at` ซึ่ง `failStuckDeliveries` ใช้วัด แถว pending ที่ insert ใหม่ใช้ `createdAt` เป็นเวลาเริ่ม ค่านี้ไม่อยู่ใน entity `Message` |
| `failStuckMedia`, `failStuckDeliveries` | UPDATE ... RETURNING คำสั่งเดียว เงื่อนไขบนสถานะ `pending` และเวลา (`createdAt` ของสื่อ, `deliveryAttemptAt` หรือ `createdAt` ของการส่ง) น้อยกว่า `staleBefore` อย่างเคร่งครัด เฉพาะผู้ใช้ที่ระบุ แถวที่แก้ได้ `updatedSeq` ใหม่ เรียกพร้อมกันหลายผู้เรียกแต่ละ id กลับไปที่ผู้เรียกคนเดียว การส่งที่คืนสภาพแล้วคง `retryKey` เดิม จึงกด "ส่งอีกครั้ง" ได้ ([data-model กฎของ repository ข้อ 13](data-model.md#กฎของ-repository)) |
| `listLatest`, `listBefore` | คืนเรียง seq น้อยไปมาก (เก่าไปใหม่) รวมข้อความชนิด event |
| `listChangedAfter` | `updatedSeq > after` เรียง updatedSeq น้อยไปมาก |
| `maxUpdatedSeq` | ไม่มีข้อความคืน `0n` |
| `countForContact` | `total` ไม่นับ event, `byAi` นับ author = ai |
| `countEventsByCode` | นับเฉพาะ `type = event` ของทุกผู้ใช้ ช่วงเป็น `[from, to)` ตาม `createdAt` ใช้ใน `GetGuardrailStats` |

#### SettingsRepository

```ts
export interface SettingsRepository {
  /** แถวเดียว ถ้ายังไม่มีสร้างด้วยค่าเริ่มต้น: aiEnabled false, DEFAULT_AI_MODEL, DEFAULT_AI_DAILY_BUDGET_USD, DEFAULT_POLITE_PARTICLE, คำแนะนำว่าง, aiName null, DEFAULT_AI_ANSWER_MODE, guardEnabled false, guardTopics ว่าง */
  get(): Promise<Settings>;
  update(patch: Partial<Pick<Settings,
    "aiEnabled" | "aiModel" | "aiDailyBudget" | "aiPoliteParticle" | "aiInstructions"
    | "aiName" | "aiAnswerMode" | "guardEnabled" | "guardTopics"
    | "howToText" | "welcomeEnabled" | "welcomeText">>): Promise<Settings>; // aiName null ล้างชื่อ undefined ไม่แก้
  getEncryptedLineCredentials(): Promise<EncryptedLineCredentials | null>;
  saveLineCredentials(c: EncryptedLineCredentials, bot: { botName: string; basicId: string },
    channel: { channelId: string; secretVerifiedAt: Date | null }): Promise<void>;
  /** ผลการตรวจ secret ภายหลัง: เวลาที่ LINE ยืนยัน หรือ null เมื่อ LINE ปฏิเสธคู่นี้ */
  recordLineSecretCheck(verifiedAt: Date | null): Promise<void>;
  updateLineBotInfo(bot: { botName: string; basicId: string }): Promise<void>;
  recordWebhookReceived(at: Date): Promise<void>;
  recordLineError(e: { code: ErrorCode; at: Date } | null): Promise<void>;
  recordAiError(e: { code: ErrorCode; at: Date } | null): Promise<void>;
  /** เมนูที่ publish (null หลังนำออก) และล้าง richMenuError */
  recordRichMenu(menu: { id: string; publishedAt: Date } | null): Promise<void>;
  /** compare-and-set: บันทึก menu (และล้าง richMenuError) เฉพาะเมื่อ id ที่เก็บยังเป็น expectedId (null คือไม่มี) */
  replaceRichMenu(expectedId: string | null, menu: { id: string; publishedAt: Date }): Promise<boolean>;
  recordRichMenuError(e: { code: ErrorCode; at: Date }): Promise<void>;
  /** ตรวจการต่อฐานข้อมูล throw เมื่อต่อไม่ได้ */
  ping(): Promise<void>;
}
```

ค่าเริ่มต้นของระบบที่ติดตั้งใหม่อยู่ใน [project-setup](project-setup.md#101-แกนกลาง): kill switch ปิด ระบบจึงไม่ใช้เงินจนกว่าแอดมินจะเปิดเอง

#### KnowledgeRepository

```ts
export interface KnowledgeRepository {
  create(d: { id: DocumentId; fileName: string; sizeBytes: number; sha256: string; now: Date }):
    Promise<Result<KbDocument, "knowledge.duplicate">>;
  findById(id: DocumentId): Promise<KbDocument | null>;
  findBySha256(sha256: string): Promise<KbDocument | null>;
  getWithText(id: DocumentId): Promise<KbDocumentWithText | null>;
  /** ไม่มี extractedText เรียง createdAt ใหม่ไปเก่า */
  list(): Promise<KbDocument[]>;
  /** ใช้ตอนลองใหม่: compare-and-set บน status = failed ตั้ง processing ล้าง error ข้อความ จำนวนหน้า และ token แทนค่าไฟล์ */
  restartProcessing(id: DocumentId, d: { fileName: string; sizeBytes: number; sha256: string; now: Date }):
    Promise<Result<KbDocument, "knowledge.duplicate" | "knowledge.not_found" | "knowledge.not_retryable">>;
  markReady(id: DocumentId, d: { text: string; pageCount: number | null; tokenCount: number; now: Date }): Promise<boolean>;
  markFailed(id: DocumentId, d: { code: ErrorCode; pageCount: number | null; tokenCount: number | null; now: Date }): Promise<boolean>;
  /** คำสั่งเดียว: เอกสารที่ยัง processing และ updatedAt ก่อน staleBefore เป็น failed ด้วย knowledge.extract_interrupted และ updatedAt = now คืน id ที่แก้ */
  failStuckProcessing(staleBefore: Date, now: Date): Promise<DocumentId[]>;
  delete(id: DocumentId): Promise<boolean>;
  sumReadyTokens(): Promise<number>;
}
```

- `create` และ `restartProcessing` คืน `knowledge.duplicate` เมื่อชน unique ของ sha256 (ใช้ insert แบบข้ามเมื่อซ้ำ)
- `restartProcessing` เป็น compare-and-set บน `status = failed` (UPDATE ... WHERE id AND status = failed) ไม่มีแถวคืน `knowledge.not_found` มีแถวแต่ไม่ใช่ failed คืน `knowledge.not_retryable` และไม่แก้อะไร การลองใหม่สองครั้งพร้อมกันจึงสำเร็จครั้งเดียว อีกครั้งได้ `knowledge.not_retryable`
- `markReady`, `markFailed`, `delete` คืน false เมื่อแถวไม่มีแล้ว เช่น ถูกลบระหว่างแปลง ผู้เรียกไม่ถือเป็นความผิดพลาด
- `failStuckProcessing` เป็น UPDATE ... RETURNING คำสั่งเดียวบน `status = processing` และ `updatedAt < staleBefore` คงค่าไฟล์ไว้ "ลองใหม่" (`restartProcessing`) จึงใช้ได้ทันที เรียกพร้อมกันแต่ละ id กลับไปที่ผู้เรียกคนเดียว

#### UsageRepository

```ts
export interface DateRange { from: Date; to: Date } // [from, to)

export interface UsageByContactRow {
  contactId: ContactId | null;      // null เมื่อ Contact ถูกลบตาม runbook
  displayName: string | null;
  pictureUrl: string | null;
  replyCount: number;               // แถว kind = reply ทุก outcome
  okCount: number;                  // แถว kind = reply ที่ outcome = ok
  usage: TokenUsage;                // ผลรวมของแถว kind = reply
  cost: NanoUsd;                    // ผลรวมของแถว kind = reply
}

export interface UsageRepository {
  insert(r: AiUsageRecord): Promise<void>;
  sumCost(range: DateRange): Promise<NanoUsd>;
  reportByContact(range: DateRange): Promise<UsageByContactRow[]>;
  ingestSummary(range: DateRange): Promise<{ count: number; usage: TokenUsage; cost: NanoUsd }>;
  /** แถว kind = guard ทุก outcome รวมการทดลองจากหน้าตั้งค่า */
  guardSummary(range: DateRange): Promise<{ count: number; usage: TokenUsage; cost: NanoUsd }>;
  /** guardBlocked: kind = guard outcome = blocked, outputRejected: ทุก kind ที่ error เป็น ai.invalid_output หรือ ai.refused */
  countSafetyOutcomes(range: DateRange): Promise<{ guardBlocked: number; outputRejected: number }>;
  /** แถวทุก kind ในช่วงที่ error เป็น ai.no_response */
  countNoResponse(range: DateRange): Promise<number>;
  listForContact(contactId: ContactId, range: DateRange): Promise<AiUsageRecord[]>;
}
```

- `sumCost` รวมทุก kind และทุก outcome ใน `[from, to)` ตาม `createdAt` ไม่มีแถวคืน `0n`
- `reportByContact` รวมเฉพาะแถว kind = reply (แถว guard แยกไปที่ `guardSummary`) เรียง cost มากไปน้อย, `listForContact` คืนทุก kind ของผู้ใช้นั้น เรียง createdAt ใหม่ไปเก่า
- `guardSummary`, `ingestSummary`, `countSafetyOutcomes` และ `countNoResponse` ไม่มีแถวคืนศูนย์ทุกค่า

#### WebhookEventRepository

```ts
export interface WebhookEventRepository {
  has(id: WebhookEventId): Promise<boolean>;
  /** insert แบบข้ามเมื่อซ้ำ คืน true เมื่อแถวนี้ถูกเพิ่มจริง */
  insertIfAbsent(e: { webhookEventId: WebhookEventId; type: string; receivedAt: Date }): Promise<boolean>;
}
```

#### RateLimitRepository

```ts
export interface RateLimitRepository {
  /**
   * atomic: แถวเดียวต่อ key ถ้า windowStart ของแถวเก่ากว่าค่าที่ส่งมา ตั้ง count = 1 และ windowStart ใหม่
   * ไม่เช่นนั้น count + 1 คืน count หลังเพิ่ม
   */
  hit(key: string, windowStart: Date): Promise<{ count: number }>;
  /** atomic: คืนหนึ่งครั้งของหน้าต่างนี้ (count - 1 ไม่ต่ำกว่า 0) ไม่มีแถวหรือแถวเป็นหน้าต่างอื่นไม่เปลี่ยน */
  refund(key: string, windowStart: Date): Promise<void>;
}
```

`key` อยู่ในรูป `{action}:{keyedHash}` โดย action เป็นค่าของ `RateLimitAction` และ keyedHash มาจาก `ContentHasher.keyedHash(ip หรือ contactId)` จึงไม่มี IP ดิบในฐานข้อมูล ค่าจำกัดอยู่ใน [project-setup](project-setup.md#102-การจำกัดความถี่)

### SecretCipher

```ts
export interface SecretCipher {
  /** AES-256-GCM, nonce สุ่มต่อครั้ง คืนสตริงที่รวม nonce, ciphertext และ tag */
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): Result<string, "secret.decrypt_failed">;
}
```

ถอดรหัสไม่ได้ (key เปลี่ยน หรือข้อมูลถูกแก้) คืน `secret.decrypt_failed` use case แปลงเป็น `line.credentials_unreadable`

### AccessTokenSigner

```ts
export interface AccessTokenSigner {
  /** sync: เทียบกับ ACCESS_CODE แบบ timing-safe */
  checkCode(code: string): boolean;
  /** sync: token แบบ HMAC ที่มีเวลาหมดอายุอยู่ข้างใน */
  issue(now: Date): { token: string; expiresAt: Date };
  /** sync: false เมื่อ signature ผิด ผิดรูป หรือหมดอายุ */
  verify(token: string, now: Date): boolean;
}
```

| ความหมายที่ตัวจริงและตัวปลอมต้องตรงกัน |
| --- |
| Key ของ signature ขึ้นกับทั้ง secret และรหัสเข้าใช้: token ที่ออกด้วย secret อื่น หรือด้วย secret เดียวกันแต่รหัสอื่น ตรวจไม่ผ่าน ส่วน instance ใหม่ที่สร้างด้วย secret และรหัสเดิม (เช่น หลัง deploy) ตรวจผ่าน ([access-gate](../specs/access-gate.md#พฤติกรรม) ข้อ 6) |
| `checkCode` เทียบแบบเวลาคงที่ทุกความยาว รหัสไม่อยู่ใน token |

### ContentHasher (port ที่เพิ่ม)

แกนกลางต้อง hash ไฟล์ PDF และ IP แต่ห้าม import `node:crypto` เอง จึงเพิ่ม port นี้ Adapter อยู่ใน `src/adapters/system/`

```ts
export interface ContentHasher {
  /** sync: hex ตัวเล็ก */
  sha256(bytes: Uint8Array): string;
  /** sync: HMAC-SHA256 ด้วย SESSION_SECRET แบบ base64url ใช้กับ IP ก่อนเป็น key ของการจำกัดความถี่ */
  keyedHash(value: string): string;
}
```

### Clock

```ts
export interface ClockTimer {
  /** resolve เมื่อถึงเวลา ไม่ resolve หลัง cancel */
  fired: Promise<void>;
  /** หยุดตัวจับเวลา เรียกซ้ำหรือเรียกหลังยิงแล้วได้ */
  cancel(): void;
}

export interface Clock {
  now(): Date;
  /** ตัวปลอมเลื่อนเวลาทันทีโดยไม่รอจริง */
  sleep(ms: number): Promise<void>;
  /** เพดานเวลาที่ use case ใช้แข่งกับงาน ตัวปลอมยิงเมื่อเวลาถูกเลื่อนถึงเท่านั้น (sleep, advance, set) */
  startTimer(ms: number): ClockTimer;
}
```

`startTimer` มีเพื่อให้งานที่ไม่จบ (stream ที่ค้าง การเรียกที่ไม่คืนผล) ถูกตัดได้ทั้งในระบบจริงและใน test ผู้ใช้คือ `StoreInboundMedia` ([use-cases](use-cases.md#storeinboundmedia)) ชุดทดสอบของ port ตรวจว่ายิงหลังเวลาผ่าน ไม่ยิงก่อนเวลา และไม่ยิงหลัง `cancel`

### IdGenerator

```ts
export interface IdGenerator {
  /** UUIDv7 */
  contactId(): ContactId;
  messageId(): MessageId;
  documentId(): DocumentId;
  usageId(): UsageId;
  noteId(): NoteId;
  requestId(): string;
  /** ค่าสุ่ม 128 bit จาก CSPRNG แบบ base64url ใช้กับชื่อไฟล์ที่ต้องเดาไม่ได้ */
  randomToken(): string;
}
```

UUIDv7 เรียงตามเวลาจึงเดาได้บางส่วน ห้ามใช้เป็นชื่อไฟล์สาธารณะ ใช้ `randomToken()` แทน

### Logger

```ts
export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  requestId?: string;
  contactId?: ContactId;
  messageId?: MessageId;
  documentId?: DocumentId;
  usageId?: UsageId;
  route?: string;              // แม่แบบของ path เช่น "/api/contacts/:id/messages" ไม่ใช่ path จริง
  method?: string;
  httpStatus?: number;
  durationMs?: number;
  errorCode?: ErrorCode;
  errorName?: string;          // ชื่อ class ของ exception เท่านั้น ไม่มี message และ stack
  lineEventType?: string;
  eventCount?: number;
  channel?: SendChannel;
  attempt?: number;
  outcome?: string;            // ค่าจาก union ของ outcome ในแกนกลางเท่านั้น
  reason?: string;             // HandoffReason หรือเหตุผลจาก AiReplyDecision
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costNanoUsd?: string;
  sizeBytes?: number;
  stage?: string;              // ขั้นของงาน ค่าจาก union ในแกนกลางเท่านั้น (MediaStoreStage)
  pageCount?: number;
  tokenCount?: number;
  count?: number;
}

export interface Logger {
  log(level: LogLevel, event: LogEvent, fields?: LogFields): void;
}
```

- Adapter เขียน JSON หนึ่งบรรทัดต่อเหตุการณ์ทาง stdout: `{ "ts", "level", "event", ...fields }` และทิ้ง key ที่ไม่อยู่ใน `LogFields` แม้ type จะกันไว้แล้ว (กันการ cast)
- ห้ามมี: เนื้อหาข้อความ, ชื่อและรูปของผู้ใช้, `lineUserId`, IP, เนื้อหา PDF, ชื่อไฟล์, prompt, คำตอบของ AI, token, secret, signature และ error message ของ library ตาม [ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md)
- ชื่อเหตุการณ์เป็น `{พื้นที่}.{สิ่ง}.{สิ่งที่เกิด}` ตัวเล็ก คั่นด้วยจุด และคำในแต่ละส่วนคั่นด้วย `_`
- Log ของขอบเขตหัวข้อใช้เฉพาะ field ใน `LogFields` ห้ามมีข้อความของผู้ใช้ หัวข้อ ข้อความปฏิเสธ หรือ `matchedTopic`

```ts
export type LogEvent =
  // HTTP และงานหลังตอบ
  | "http.request.completed"        // info: route, method, httpStatus, durationMs
  | "http.request.failed"           // error: exception ที่ไม่คาดคิด → 500
  | "http.origin.rejected"          // warn
  | "job.run.failed"                // error: exception ในงานหลังตอบ
  // รหัสเข้าใช้
  | "access.unlock.succeeded"
  | "access.unlock.failed"
  | "access.unlock.rate_limited"
  | "access.unlock.client_ip_missing" // warn: คำขอที่ไม่มี IP นับในถัง unlock_no_ip
  // Webhook และ LINE
  | "line.webhook.received"         // eventCount
  | "line.webhook.signature_invalid"
  | "line.webhook.not_configured"
  | "line.webhook.payload_invalid"
  | "line.webhook.event_duplicate"
  | "line.webhook.event_unsupported" // lineEventType
  | "line.webhook.event_failed"
  | "line.webhook.batch_unstored"   // error: eventCount, errorCode db.unavailable ทุก event ล้มและฐานข้อมูลล่ม ตอบ 503
  | "line.profile.fetch_failed"
  | "line.profile.refreshed"
  | "line.send.succeeded"           // channel, messageId
  | "line.send.failed"              // channel, errorCode
  | "line.send.reply_token_rejected"
  | "line.send.stuck_recovered"     // warn: contactId, count (line.send_interrupted)
  | "line.send.retry_expired"       // warn: messageId, contactId ส่งอีกครั้งหลังหน้าต่างของ retry key
  | "line.loading.failed"
  | "line.credentials.saved"        // outcome (verified หรือ unchecked), errorCode เมื่อตรวจ secret ไม่ได้
  | "line.credentials.rejected"     // errorCode
  | "line.credentials.unreadable"
  | "line.connection.tested"        // outcome (failed, verified, unchecked หรือ no_channel_id)
  // Rich menu และข้อความต้อนรับ: ไม่มี postback data และไม่มีข้อความใด ๆ
  | "line.postback.received"        // info: contactId, reason (ปุ่ม ai_on, admin หรือ how_to)
  | "line.postback.ignored"         // info: postback data ที่แอปไม่ได้สร้าง ไม่บันทึกค่า
  | "line.postback.rate_limited"    // info: contactId, reason
  | "line.rich_menu.action_handled" // info: contactId, reason, outcome (ผลของปุ่ม)
  | "line.rich_menu.published"
  | "line.rich_menu.publish_failed" // warn: errorCode, outcome (ขั้นที่ล้ม create, upload หรือ set_default)
  | "line.rich_menu.removed"
  | "line.rich_menu.remove_failed"  // warn: errorCode
  | "line.rich_menu.cleanup_failed" // warn: errorCode ลบเมนูเก่าหรือเมนูที่สร้างค้างไม่สำเร็จ
  | "line.welcome.sent"             // info: contactId, messageId
  | "line.welcome.skipped"          // info: contactId, reason (welcome_disabled)
  | "line.welcome.failed"           // warn: contactId, errorCode ตอบด้วย reply token ไม่สำเร็จ ไม่ push
  // สื่อและอัปโหลด
  | "media.store.started"           // info: messageId ก่อนขั้นแรกของงาน
  | "media.store.downloaded"        // info: messageId, sizeBytes ที่อ่านจาก LINE ครบ
  | "media.store.uploaded"          // info: messageId, sizeBytes ที่ที่เก็บไฟล์รับ
  | "media.store.succeeded"         // info: messageId, sizeBytes, durationMs
  | "media.store.failed"            // warn: outcome (สถานะ หรือ deadline), errorCode, stage, durationMs
  | "media.store.not_ready"         // info: messageId, attempt ระหว่างรอ LINE เตรียมไฟล์
  | "media.store.stuck_recovered"   // warn: contactId, count
  | "upload.ticket.issued"
  | "upload.ticket.rejected"
  | "upload.file.discarded"
  | "upload.local_put.rejected"
  // AI
  | "ai.reply.skipped"              // reason
  | "ai.reply.superseded"
  | "ai.reply.locked"
  | "ai.reply.handoff"              // reason
  | "ai.reply.sent"
  | "ai.reply.cancelled"
  | "ai.reply.failed"               // errorCode
  | "ai.reply.stuck_recovered"      // count
  | "ai.model.called"               // model, tokens, costNanoUsd, outcome, durationMs
  | "ai.price_unknown_model"        // model (ชื่อตามที่ usage-cost กำหนด เป็นข้อยกเว้นของรูปแบบสามส่วน)
  // ขอบเขตหัวข้อ (ชื่อสองส่วนตามที่กำหนดใน specs/topic-guard.md เป็นข้อยกเว้นของรูปแบบสามส่วน)
  | "guard.checked"                 // info: contactId, model, tokens, costNanoUsd, outcome (ok หรือ blocked), durationMs
  | "guard.blocked"                 // info: contactId, messageId (ข้อความปฏิเสธ), reason ("classifier" หรือ "chat_model")
  | "guard.failed"                  // warn: contactId, errorCode, durationMs
  // คลังความรู้
  | "knowledge.ingest.started"
  | "knowledge.ingest.succeeded"    // pageCount, tokenCount
  | "knowledge.ingest.failed"       // errorCode
  | "knowledge.ingest.stuck_recovered" // warn: count (knowledge.extract_interrupted)
  | "knowledge.document.deleted"
  // ตั้งค่า
  | "settings.values.updated"
  // โน้ตของแอดมิน: field เฉพาะ contactId ไม่มีข้อความ
  | "contact.note.added"
  | "contact.note.deleted"
  | "contact.note.rate_limited";
```

## Adapter ของ Claude

ข้อนี้ผูกกับ `ChatModel`, `DocumentExtractor` และ `TopicGuard` ข้อความของ prompt, schema ของคำตอบ และโครงของ request อยู่ใน [ai-prompt](../specs/ai-prompt.md) ไฟล์นี้กำหนดเฉพาะการเรียก SDK ข้อเท็จจริงด้านล่างยืนยันจากเอกสารอ้างอิง SDK ของ Anthropic ที่ใช้ตอนเขียน (ข้อมูล ณ 2026-11-03) ส่วนที่มีคำว่า "ต้องยืนยันกับเอกสาร SDK" ต้องตรวจกับ SDK รุ่นที่ติดตั้งก่อนเขียนโค้ด เหตุผลของการเลือกอยู่ใน [ADR 0007](../adr/0007-ai-provider-port-and-default-model.md) และ [ai-reply](../specs/ai-reply.md#โมเดลและผู้ให้บริการ)

### ข้อเท็จจริงที่ยืนยันแล้ว

- Package ทางการคือ `@anthropic-ai/sdk` สร้าง client ด้วย `new Anthropic()` ซึ่งอ่าน `ANTHROPIC_API_KEY` เอง และรับ `baseURL` สำหรับชี้ไป stub
- `timeout` ของ client ใน TypeScript เป็นมิลลิวินาที และ `maxRetries` ค่าเริ่มต้นคือ 2 โดย retry 408, 409, 429, 5xx และเครือข่ายล่ม
- Error เป็น class ของ SDK เช่น `Anthropic.RateLimitError`, `Anthropic.AuthenticationError`, `Anthropic.BadRequestError` ทุกตัวสืบจาก `Anthropic.APIError` ซึ่งมี `status` ห้ามแยกด้วยการเทียบข้อความ
- โมเดล: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`
- Claude Opus 5.5 ปิดการคิดไม่ได้ ห้ามส่ง `thinking` และห้ามส่ง `temperature`, `top_p`, `top_k` ระดับการคิดตั้งด้วย `output_config: { effort: "low" }` (ค่าเริ่มต้นของ Opus 5.5 คือ `medium` จึงต้องตั้งเอง) token ที่ใช้คิดถูกนับเป็น output
- Structured output ตั้งที่ `output_config.format` ตัวช่วยของ SDK คือ `client.messages.parse({ ..., output_config: { format: zodOutputFormat(schema) } })` จาก `@anthropic-ai/sdk/helpers/zod` และผลอยู่ที่ `response.parsed_output` ซึ่งเป็น null เมื่อ parse ไม่ได้
- Prompt caching แบบอัตโนมัติ: ส่ง `cache_control: { type: "ephemeral" }` ที่ระดับบนของคำขอ cache เป็นแบบ prefix เนื้อหาที่คงที่ต้องอยู่หน้า ลำดับที่ API ประกอบคือ `system` แล้ว `messages` ขีดขั้นต่ำของความยาวที่ cache ได้บนโมเดลกลุ่ม 5.5 คือ 512 token
- การสลับโมเดลสำรองฝั่ง server: เรียก `client.beta.messages.create` พร้อม `betas: ["server-side-fallback-2026-07-01"]` และ `fallbacks: "default"` ใช้กับ Haiku 5.5 ไม่ได้ จึงไม่ส่งสอง field นี้เมื่อโมเดลเป็น Haiku เป้าหมายที่ server สลับไปของ Opus 5.5 คือ `claude-opus-5` หรือ `claude-opus-4-8` ส่วน Sonnet 5.5 คือ `claude-sonnet-5` และบางหมวดของการปฏิเสธไม่มีโมเดลสำรอง จึงยังได้ `refusal`
- ต้องตรวจ `stop_reason` ก่อนอ่าน `content` ทุกครั้ง: `end_turn` ปกติ, `max_tokens` ถูกตัด, `refusal` ถูกปฏิเสธ (มี `stop_details` เป็นข้อมูลประกอบ) ค่าอื่นเช่น `tool_use`, `pause_turn`, `stop_sequence` ไม่ควรเกิด ถือเป็นคำตอบไม่ตรง schema
- Usage: `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens` โดย `input_tokens` เป็นเฉพาะส่วนที่ไม่ได้มาจาก cache
- โมเดลที่ตอบจริงอยู่ที่ `response.model` ใช้คำนวณต้นทุน
- คำขอแบบไม่ stream ใช้ `max_tokens` ได้ถึง 16000 ถ้าต้องการมากกว่านั้นต้อง stream แล้วเรียก `.finalMessage()` จาก `client.messages.stream(...)`
- PDF ส่งเป็น content block `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }` วางก่อน text block ใน user message base64 ต้องไม่มีขึ้นบรรทัด API รับไม่เกิน 32 MB และ 600 หน้า ซึ่งเพดานของเรา (4 MB, 30 หน้า) ต่ำกว่า
- นับ token: `client.messages.countTokens({ model, messages })` คืน `input_tokens`

### เวลาสูงสุดของการเรียกหนึ่งครั้ง

`timeout` ของ SDK ครอบเฉพาะการรอ header ของคำตอบในแต่ละ attempt (`fetchWithTimeout` ใน SDK รุ่นที่ติดตั้ง) stream ที่เริ่มแล้วจึงยาวได้ไม่จำกัด และ SDK รอตาม `Retry-After` ก่อน retry โดยไม่มีเพดาน adapter จึงส่ง `signal` ที่ตัดทั้งการเรียกที่ `callDeadlineMs` = `timeoutMs` × (1 + `maxRetries`) + `CLAUDE_RETRY_WAIT_MAX_MS` × `maxRetries` (`callOptions` ใน [`claude.mapper.ts`](../../src/adapters/claude/claude.mapper.ts)) ใช้กับการตอบแชท การคัดกรอง การแปลง PDF (รวม stream) และ count_tokens (timeout `CLAUDE_COUNT_TOKENS_TIMEOUT_MS`) ค่าอยู่ใน [project-setup ข้อ 10.4](project-setup.md#104-adapter-และ-route)

### การแปลง error

`mapClaudeError` แปลง error ของ SDK เป็นรหัสของ port ตามลำดับ:

| Error | รหัส |
| --- | --- |
| `APIConnectionTimeoutError`, `APIUserAbortError` (ถูกตัดที่ `callDeadlineMs`), `APIConnectionError` อื่น และ stream ที่ขาด (`AnthropicError` ที่ไม่มี status) | `ai.no_response` คำขออาจถึงผู้ให้บริการแล้ว ([usage-cost](../specs/usage-cost.md#การเรียกที่ไม่ได้คำตอบ)) |
| `APIConnectionError` ที่ `cause` มี `code` เป็น `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH` หรือ `ENETUNREACH` | `ai.unavailable` ยังไม่ได้ส่งอะไรออกไป |
| 429 | `ai.rate_limited` พร้อม `retryAfterSeconds` |
| 401, 403 | `ai.auth_failed` |
| 400 และ 4xx อื่น | `ai.bad_request` |
| 5xx, 408, 409 | `ai.unavailable` |

### คำขอของ `ChatModel.generateReply`

| ส่วนของคำขอ | ค่า |
| --- | --- |
| Method ของ SDK | Opus และ Sonnet: `client.beta.messages.create` ส่วน Haiku: `client.messages.create` |
| `model` | `req.model` |
| `max_tokens` | `req.maxTokens` (`AI_MAX_TOKENS`) |
| `output_config` | `{ effort: "low", format: <schema ของ ChatOutput> }` |
| `thinking`, `temperature`, `top_p`, `top_k`, `tools`, `stream` | ไม่ส่ง |
| `cache_control` | `{ type: "ephemeral" }` ที่ระดับบน |
| `system` | array ของ text block สองก้อน เรียงคงที่: (1) `req.systemInstructions` (2) `req.knowledgeText` ที่มี `cache_control: { type: "ephemeral" }` ตาม [ai-prompt ข้อ 3](../specs/ai-prompt.md#3-โครงของ-request) |
| `messages` | จาก `req.history` ตามลำดับ: `customer` → `user`, `assistant` → `assistant` แล้วต่อท้ายด้วย `{ role: "system", content: formatPromptNow(req.now) }` เป็นตัวสุดท้าย (ต้องยืนยันกับเอกสาร SDK ว่ารับ role `system` ใน `messages` ถ้าไม่รับ ให้ใช้ทางสำรองใน ai-prompt ข้อ 3) ไม่มี prefill |
| `betas`, `fallbacks` | `["server-side-fallback-2026-07-01"]` และ `"default"` เฉพาะ Opus และ Sonnet |
| Timeout และ retry | `timeout` = `CLAUDE_REPLY_TIMEOUT_MS`, `maxRetries` = `CLAUDE_REPLY_MAX_RETRIES` รวมกันต้องน้อยกว่า `AI_STUCK_AFTER_MS` และ `WEBHOOK_MAX_DURATION_S` |

Schema ของคำตอบที่ส่งใน `output_config.format` และที่ตรวจซ้ำด้วย zod อยู่ใน [ai-prompt ข้อ 5](../specs/ai-prompt.md#5-รูปแบบคำตอบ): `reply`, `needsAdmin`, `handoffReason` ชื่อ field ตรงกับ `ChatOutput` จึงไม่ต้องแปลงชื่อ

การอ่านผล:

| ลำดับ | ตรวจ | ผลของ port |
| --- | --- | --- |
| 1 | `stop_reason === "refusal"` | `ok({ stop: "refused", output: null, ... })` |
| 2 | `stop_reason === "max_tokens"` | `ok({ stop: "truncated", output: null, ... })` |
| 3 | `stop_reason !== "end_turn"` | `ok({ stop: "completed", output: null, ... })` |
| 4 | ต่อ text block ทั้งหมด (ข้าม `thinking` และชนิดอื่น) แล้ว parse เป็น JSON และผ่าน zod schema | `ok({ stop: "completed", output, ... })` ไม่ผ่านให้ `output: null` |
| ทุกกรณี | usage | ค่าที่เป็น null หรือไม่มีให้เป็น 0 |
| ทุกกรณี | `servedModel` | `response.model` |

การแปลง error ของ SDK (ไล่จากเฉพาะไปทั่วไป):

| Error ของ SDK | รหัส |
| --- | --- |
| `RateLimitError` (429) หลัง retry ของ SDK | `ai.rate_limited` |
| `AuthenticationError` (401) หรือ `APIError` ที่ `status` เป็น 403 | `ai.auth_failed` |
| `BadRequestError` (400) | `ai.bad_request` |
| `APIError` อื่นที่ `status` ≥ 500, error ของการเชื่อมต่อ, timeout | `ai.unavailable` |

ต้องยืนยันกับเอกสาร SDK:

- `client.beta.messages.create` รับ `output_config.format` ที่สร้างจาก `zodOutputFormat(...)` ได้หรือไม่ และ beta namespace มี `parse` หรือไม่ ถ้าไม่มี ให้ส่ง JSON schema ตรงใน `output_config.format` แล้ว parse text block ด้วย zod เอง ตารางการอ่านผลด้านบนเขียนไว้ให้ใช้ได้ทั้งสองทาง
- การใช้ `fallbacks` ร่วมกับ structured output
- การวาง `cache_control` เพิ่มที่ text block ของความรู้ใน `system` ร่วมกับแบบอัตโนมัติที่ระดับบน เพื่อให้ส่วนความรู้ยัง cache ได้เมื่อประวัติ 20 ข้อความเลื่อนไป ถ้าใช้ร่วมกันไม่ได้ ให้ใช้แบบอัตโนมัติอย่างเดียว
- ชื่อ class error ของการเชื่อมต่อและ timeout ใน SDK รุ่นที่ติดตั้ง
- เมื่อมีการสลับโมเดลสำรอง usage รวม token ของทั้งสองโมเดลหรือไม่ และราคาแต่ละส่วนคิดอย่างไร ระบบนี้คิดทั้งหมดด้วยราคาของ `response.model` ซึ่งอาจคลาดเคลื่อน

### คำขอของ `DocumentExtractor.extract`

| ส่วนของคำขอ | ค่า |
| --- | --- |
| Method ของ SDK | แบบ stream: `client.messages.stream(...)` แล้วรวมเป็นข้อความสุดท้ายด้วย `.finalMessage()` (Opus และ Sonnet ใช้ namespace beta พร้อม `betas` และ `fallbacks` เหมือนข้างบน ต้องยืนยันว่า beta มี `stream`) |
| `model` | `req.model` |
| `max_tokens` | `req.maxTokens` (`AI_EXTRACT_MAX_TOKENS`) เพราะข้อความ 30 หน้ารวมการคิดอาจเกินขีดของคำขอแบบไม่ stream |
| `output_config` | `{ effort: "low" }` ไม่มี format เพราะผลเป็นข้อความล้วน |
| `system` และ `messages` | ตาม [ai-prompt ข้อ 7](../specs/ai-prompt.md#7-prompt-ของการแปลง-pdf) ซึ่งสั่งให้ขึ้นแต่ละหน้าด้วย `=== หน้า N ===` |
| Timeout และ retry | `timeout` = `CLAUDE_EXTRACT_TIMEOUT_MS`, `maxRetries` = `CLAUDE_EXTRACT_MAX_RETRIES` ต้องน้อยกว่า `KNOWLEDGE_MAX_DURATION_S` (ต้องยืนยันกับ Vercel ถ้าไม่ได้ต้องลด `PDF_MAX_PAGES`) |

การอ่านผลและการแปลง error เหมือน `generateReply` ยกเว้นข้อ 4: ต่อ text block ทั้งหมดเป็นข้อความ จัดบรรทัดตาม ai-prompt ข้อ 7.3 แล้วนับตัวคั่นหน้าเป็น `pageCount` ผลที่ว่างหรือเป็น `EMPTY_DOCUMENT` คืน `text: null`

### คำขอของ `TopicGuard.classify`

Adapter อยู่ที่ `src/adapters/claude/claude-topic-guard.adapter.ts`

| ส่วนของคำขอ | ค่า |
| --- | --- |
| Method ของ SDK | `client.messages.create` (ไม่ใช่ beta เพราะ Haiku 5.5 ไม่รองรับการสลับโมเดลสำรองฝั่ง server จึงไม่ส่ง `betas` และ `fallbacks`) |
| `model` | `req.model` (`GUARD_MODEL`) |
| `max_tokens` | `req.maxTokens` (`GUARD_MAX_TOKENS`) |
| `output_config` | `{ effort: "low", format: <schema ของ TopicVerdict> }` ตาม [ai-prompt ข้อ 9.3](../specs/ai-prompt.md#93-schema-ของผลการคัดกรอง) |
| `thinking`, `temperature`, `top_p`, `top_k`, `tools`, `stream`, `cache_control` | ไม่ส่ง |
| `system` และ `messages` | จาก `buildGuardClassifierPrompt(req)`: `system` เป็นข้อความเดียว และ `messages` มี user turn เดียว ตาม [ai-prompt ข้อ 9.2](../specs/ai-prompt.md#92-โครงของ-request) |
| Timeout และ retry | `timeout` = `req.timeoutMs` (`GUARD_TIMEOUT_MS`) เป็น option ต่อคำขอ, `maxRetries` = `CLAUDE_GUARD_MAX_RETRIES` |

การอ่านผลเหมือนตารางของ `generateReply` โดยข้อ 4 parse เป็น `TopicVerdict` ไม่ผ่านให้ `verdict: null` และการแปลง error ใช้ตารางเดียวกัน

`countTokens` เรียก `client.messages.countTokens({ model, messages: [{ role: "user", content: text }] })` แล้วใช้ `input_tokens` ค่านี้รวม overhead ของรูปแบบข้อความเล็กน้อย ซึ่งยอมรับได้สำหรับเพดานของคลัง
