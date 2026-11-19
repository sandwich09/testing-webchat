# API contract

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

สัญญาของทุก HTTP endpoint ที่หน้าเว็บและ LINE เรียก รวม DTO, รูปแบบ error และ protocol ของ polling ไฟล์นี้เป็นที่เดียวที่กำหนดเรื่องเหล่านี้ Schema ใน `src/contracts/` ต้องตรงกับไฟล์นี้ ส่วนขั้นตอนภายในอยู่ใน [use-cases](use-cases.md), รหัส error อยู่ใน [error-catalog](error-catalog.md), ค่าของ constant อยู่ใน [project-setup](project-setup.md#10-ค่าคงที่ของระบบ) และ function ฝั่งหน้าเว็บที่เรียกแต่ละ endpoint อยู่ใน [ui-screens](../specs/ui-screens.md#16-การเรียก-api)

## กติการ่วม

| เรื่อง | กฎ |
| --- | --- |
| Runtime | Node, `dynamic = "force-dynamic"`, ทุก response มี `Cache-Control: no-store` |
| Content type | JSON ทั้ง request และ response (`application/json; charset=utf-8`) ยกเว้นที่ระบุ |
| ขนาด body | JSON ไม่เกิน `JSON_MAX_BODY_BYTES`, webhook ไม่เกิน `WEBHOOK_MAX_BODY_BYTES`, PDF ไม่เกินที่ระบุใน endpoint เกินตอบ 413 `request.too_large` |
| Cookie | ชื่อ `twa_access` แบบ `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<ACCESS_COOKIE_TTL_MS เป็นวินาที>` ค่าคือ token จาก `AccessTokenSigner` |
| การเข้าระบบ | ทุก endpoint เรียก `VerifyAccess` ก่อน ยกเว้นที่ระบุว่า "เปิด" ไม่ผ่านตอบ 401 `access.unauthorized` |
| ต้นทาง | ทุก method ที่ไม่ใช่ `GET` หรือ `HEAD` ต้องมี header `Origin` เป็น origin แบบ http(s) ที่ตรงกับ origin ของคำขอเอง (scheme จาก `x-forwarded-proto` หรือ `request.url`, host จาก `x-forwarded-host` หรือ `Host`) หรือกับ origin ของ `APP_BASE_URL` ยกเว้น webhook ไม่มี `Origin`, `Origin: null` หรือไม่ตรงทั้งสองตอบ 403 `request.origin_forbidden` proxy.ts และตัวห่อ route ใช้ `isAllowedOrigin` ใน `src/composition/request-origin.ts` ตัวเดียวกัน ([ADR 0025](../adr/0025-same-origin-or-app-base-url.md)) |
| Request id | ทุก response มี `x-request-id` ที่ route สร้างด้วย `IdGenerator.requestId()` |
| การตรวจ | ตรวจ path, query และ body ด้วย zod ใน `src/contracts/` ไม่ผ่านตอบ 400 `request.invalid` field ที่ไม่รู้จักใน JSON body ถือว่าไม่ผ่าน (`strict`) ทุกสตริงของคำขอ (path, query, body รวมสตริงที่ซ้อนใน object หรือ array และชื่อไฟล์ PDF) ที่มี U+0000 ตอบ 400 `request.invalid` ตรวจที่เดียวใน `composition/http-request.ts` ด้วย `hasNulCharacter` เพราะ Postgres ไม่รับอักขระนี้ใน text |
| Id ใน path | id ของแถว (`:id`, `:messageId`, `:noteId`) ต้องเป็น UUID ค่าที่ไม่ใช่ UUID ตอบรหัส not found ของ resource นั้น (404) เหมือน id ที่ไม่มีอยู่ ไม่ส่งต่อถึงฐานข้อมูล (`pathIdSchema`): ลูกค้า `contact.not_found`, โน้ต `note.not_found`, การส่งอีกครั้ง `message.not_found` (ทั้ง `:id` และ `:messageId`), เอกสาร `knowledge.not_found`, ค่าใช้จ่ายรายลูกค้า `contact.not_found` (id ที่ถูกรูปแบบแต่ไม่มียังได้รายการว่าง) |
| ข้อผิดพลาดที่ไม่คาดคิด | ตอบ 500 `internal.unexpected` และ log `http.request.failed` |
| Log ของคำขอ | ตัวห่อ route ใน `composition/` log `http.request.completed` ทุกคำขอ และ `http.origin.rejected` เมื่อต้นทางไม่ตรง route เองไม่เรียก Logger |
| การจำกัดความถี่ | ตอบ 429 พร้อม header `Retry-After` เป็นวินาที |

Error ร่วมด้านบน (`request.invalid`, `request.too_large`, `request.origin_forbidden`, `access.unauthorized`, `internal.unexpected`) ใช้กับทุก endpoint ตามเงื่อนไข และไม่เขียนซ้ำในแต่ละ endpoint

### รูปแบบ error

```json
{ "error": { "code": "line.push_failed", "message": "LINE rejected the push request", "requestId": "0193..." } }
```

- ทุก response มี header `x-request-id`

- `code` เป็นค่าจาก [error-catalog](error-catalog.md) หน้าเว็บแปลงเป็นข้อความไทยด้วยตารางเดียวใน `src/common/error-messages.ts`
- `message` เป็นภาษาอังกฤษสำหรับนักพัฒนา สร้างจาก `code` ไม่ใช้ `detail` ของ `AppError` และไม่มีรายละเอียดภายใน
- การส่งข้อความที่ LINE ปฏิเสธไม่ใช่ error ของ HTTP: endpoint ตอบ 200 และสถานะอยู่ใน `MessageDto.delivery`

### การแปลงค่า

| ชนิด | รูปแบบใน JSON |
| --- | --- |
| เวลา | สตริง ISO-8601 UTC จาก `Date.toISOString()` เช่น `"2026-11-18T07:32:10.123Z"` |
| `seq`, `updatedSeq`, cursor ที่เป็นเลข | สตริงตัวเลขฐานสิบ เช่น `"1048576"` เพราะเป็น bigint ไม่เกิน `9223372036854775807` (ค่าสูงสุดของ bigint ใน Postgres) ค่าที่เกินใน query ตอบ 400 `request.invalid` |
| เงิน | สตริงดอลลาร์ ใช้ `formatUsd`: ต้นทุนมีทศนิยม 6 ตำแหน่ง (`"0.012345"`), งบมี 2 ตำแหน่ง (`"5.00"`) |
| จำนวน token, ขนาดไฟล์, จำนวนหน้า | number |
| ค่าว่าง | `null` เสมอ ไม่ละ field |
| Id | สตริง |

DTO ถูกสร้างจาก entity ใน route ด้วยฟังก์ชันใน `src/composition/to-dto.ts` (route import จาก `@/composition` ส่วน `app/api/_lib/to-dto.ts` re-export ชื่อเดียวกัน เพราะ unit test เก็บเฉพาะ `src/**`) ซึ่งเป็นที่เดียวที่แปลง Route import ได้เฉพาะ type และฟังก์ชันล้วนของ `core/domain` (เช่น `formatUsd`, `parseUsd`, `bangkokMonthOf`) เพื่อแปลงค่า และห้ามเรียก port

### การจำกัดความถี่

ค่าจำกัด หน้าต่าง subject และ `RATE_LIMIT_SCALE` อยู่ใน [project-setup](project-setup.md#102-การจำกัดความถี่) ที่เดียว ตารางนี้บอกเฉพาะว่า endpoint ใดใช้ค่าจำกัดใด

| Action (`RateLimitAction`) | Constant | Endpoint | Error |
| --- | --- | --- | --- |
| `unlock` | `RATE_LIMIT_UNLOCK` | `POST /api/access/unlock` | `access.rate_limited` |
| `unlock_no_ip` | `RATE_LIMIT_UNLOCK_NO_IP` | `POST /api/access/unlock` เมื่อไม่มี IP ของผู้เรียก | `access.rate_limited` |
| `send_message` | `RATE_LIMIT_SEND_MESSAGE` | `POST /api/contacts/:id/messages`, `POST /api/contacts/:id/messages/:messageId/retry` | `message.rate_limited` |
| `upload_ticket` | `RATE_LIMIT_UPLOAD_TICKET` | `POST /api/uploads` | `upload.rate_limited` |
| `pdf_ingest` | `RATE_LIMIT_PDF_INGEST` | `POST /api/knowledge/documents`, `POST /api/knowledge/documents/:id/retry` | `knowledge.rate_limited` |
| `typing` | `RATE_LIMIT_TYPING` | `POST /api/contacts/:id/typing` | ไม่มี ตอบ `shown: false` |
| `guard_test` | `RATE_LIMIT_GUARD_TEST` | `POST /api/settings/guard/test` | `settings.guard_rate_limited` |
| `note_create` | `RATE_LIMIT_NOTE_CREATE` | `POST /api/contacts/:id/notes` | `note.rate_limited` |
| `rich_menu_tap` | `RATE_LIMIT_RICH_MENU_TAP` | `POST /api/line/webhook` ต่อ postback ของลูกค้าหนึ่งคน | ไม่มี การกดนั้นถูกทิ้ง และ webhook ยังตอบ 200 |

## DTO ร่วม

ทุก DTO อยู่ใน `src/contracts/dto.contract.ts` พร้อม zod schema ที่หน้าเว็บใช้ตรวจคำตอบ

```ts
type IsoDate = string;
type SeqString = string;
type UsdString = string;

interface ContactDto {
  id: string;
  displayName: string | null;
  pictureUrl: string | null;
  followStatus: "following" | "unfollowed";
  followedAt: IsoDate | null;
  aiEnabled: boolean;                 // ค่าที่จำไว้ หน้าเว็บแสดงเป็นปิดเมื่อ kill switch ปิด
  needsAdmin: boolean;
  needsAdminReason: HandoffReason | null;
  aiReplying: boolean;                // aiState = replying
  unreadCount: number;
  lastMessage: {                      // ข้อความล่าสุดของใครก็ได้ ยกเว้น at
    at: IsoDate;                      // เวลาข้อความล่าสุดของลูกค้า (ไม่มีใช้ createdAt) คือค่าที่รายชื่อใช้เรียง
    by: "customer" | "admin" | "ai";
    type: "text" | "image" | "video" | "audio" | "sticker" | "other";
    text: string | null;              // ตัดแล้วไม่เกิน PREVIEW_TEXT_MAX_CHARS
  } | null;
  createdAt: IsoDate;
  updatedSeq: SeqString;
}

interface ContactDetailDto extends ContactDto {
  stats: { messageCount: number; aiMessageCount: number };
}

interface MessageDto {
  id: string;
  seq: SeqString;
  updatedSeq: SeqString;
  contactId: string;
  direction: "inbound" | "outbound" | "internal";
  author: "customer" | "admin" | "ai" | "system";
  type: "text" | "image" | "video" | "audio" | "sticker" | "other" | "event";
  text: string | null;
  media: { status: MediaStatus; url: string | null; previewUrl: string | null; durationMs?: number | null; failure?: MediaFailure | null } | null; // รูป วิดีโอ เสียง durationMs: ความยาวของเสียงจาก LINE (ms) server ส่งเสมอ failure: เหตุผลเมื่อ status เป็น failed (unsupported_type, external_source, download_failed, interrupted) null เมื่อสถานะอื่นหรือแถวก่อนมีค่านี้ server ส่งเสมอ
  sticker: { packageId: string; stickerId: string; imageUrl: string } | null;
  otherKind: OtherKind | null;
  eventCode: EventCode | null;
  quote: {                            // ขาเข้าที่ลูกค้าใช้ "ตอบกลับ" ของ LINE, นอกนั้น null หาใน query เดียวกับรายการข้อความ (รวม polling)
    available: boolean;               // false: ไม่รู้จักข้อความต้นทาง field อื่นเป็น null ทั้งหมด
    messageId: string | null;
    author: "customer" | "admin" | "ai" | null;
    type: "text" | "image" | "video" | "sticker" | "other" | null;
    textPreview: string | null;       // ข้อความตัดแบบเดียวกับรายชื่อ (PREVIEW_TEXT_MAX_CHARS)
    mediaKind: "image" | "video" | "sticker" | OtherKind | null;
  } | null;
  delivery: {
    status: DeliveryStatus;
    errorCode: ErrorCode | null;
    retryExpiresAt: IsoDate | null;   // firstPushAt + LINE_RETRY_KEY_WINDOW_MS ตั้งแต่เวลานี้ "ส่งอีกครั้ง" ได้ message.retry_expired, null เมื่อยังไม่เคย push
  } | null;
  createdAt: IsoDate;
  sentAt: IsoDate | null;
}

interface SettingsDto {
  ai: {
    enabled: boolean;                 // kill switch
    provider: "claude";
    model: AiModelId;
    dailyBudgetUsd: UsdString;        // 2 ตำแหน่ง
    todayCostUsd: UsdString;          // 6 ตำแหน่ง ยอดของวันนี้ตามเวลาไทย
    politeParticle: "ค่ะ" | "ครับ";
    instructions: string;             // คำแนะนำสำหรับ AI ว่างเมื่อไม่มี
    name: string | null;              // ชื่อ AI null เมื่อไม่ตั้ง
    answerMode: "knowledge_only" | "general"; // ขอบเขตคำตอบ
  };
  guard: {
    enabled: boolean;                 // ขอบเขตหัวข้อ
    topics: string[];                 // ตามลำดับที่บันทึก
    blockedToday: number;             // AiUsage kind guard outcome blocked ของวันนี้ตามเวลาไทย
  };
  line: {
    configured: boolean;
    status: "connected" | "error" | "not_configured"; // not_configured เมื่อ configured false, error เมื่อมี lastLineError, นอกนั้น connected
    botName: string | null;
    basicId: string | null;
    channelId: string | null;         // ไม่ใช่ความลับ null เมื่อยังไม่เคยบันทึกพร้อม Channel ID
    secretStatus: "verified" | "unchecked" | "no_channel_id"; // lineSecretStatus: LINE ยืนยันคู่แล้ว, มี Channel ID แต่ยังไม่ได้ยืนยัน, ไม่มี Channel ID
    webhookUrl: string;
    lastWebhookAt: IsoDate | null;
  };
  richMenu: {
    published: boolean;               // เมนูของแอปเป็นเมนูเริ่มต้นที่ LINE (ไม่ส่ง id ของเมนู)
    publishedAt: IsoDate | null;
    lastError: { code: ErrorCode; at: IsoDate } | null; // การ publish หรือนำออกที่ล้มล่าสุด
    howToText: string;                // ข้อความของปุ่ม "วิธีทดสอบ" ที่บันทึก '' คือใช้ howToDefault
    howToDefault: string;             // ข้อความเริ่มต้นตามคำลงท้ายปัจจุบัน
  };
  welcome: {
    enabled: boolean;                 // ส่งการ์ดต้อนรับเมื่อเพิ่มเพื่อน
    text: string;                     // '' คือใช้ defaultText
    defaultText: string;
    accountName: string;              // ชื่อบนการ์ด: ชื่อ LINE OA หรือ "Test webchat"
  };
  client: {
    pollIntervalMs: number;           // POLL_INTERVAL_MS
  };
}

interface SystemStatusDto {
  lastWebhookAt: IsoDate | null;
  lastLineError: { code: ErrorCode; at: IsoDate } | null;
  lastAiError: { code: ErrorCode; at: IsoDate } | null;
  todayCostUsd: UsdString;            // 6 ตำแหน่ง
  dailyBudgetUsd: UsdString;          // 2 ตำแหน่ง
  priceTableDate: string;             // "2026-11-03"
  database: "ok";
}

interface GuardrailStatsDto {
  aiEnabled: boolean;                 // kill switch
  guardEnabled: boolean;
  guardBlocked: number;               // ทุกตัวเลขเป็นของวันนี้ตามเวลาไทย
  outputRejected: number;
  handoffs: { notInKnowledge: number; needsHuman: number; failedOrTimeout: number; other: number };
  budgetReached: number;
  nonText: number;
}

interface DocumentDto {
  id: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number | null;
  tokenCount: number | null;
  status: "processing" | "ready" | "failed";
  errorCode: ErrorCode | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

interface DocumentDetailDto extends DocumentDto {
  extractedText: string | null;
}

interface UsageRowDto {
  contactId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  replyCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;                // ผลรวมสี่ค่าด้านบน
  costUsd: UsdString;                 // 6 ตำแหน่ง
}

interface UsageRecordDto {
  id: string;
  createdAt: IsoDate;
  kind: "reply" | "ingest" | "guard";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: UsdString;
  outcome: "ok" | "handoff" | "refused" | "failed" | "cancelled" | "blocked";
}

type UploadTargetDto =
  | { strategy: "http_put"; url: string; headers: Record<string, string>; contentType: string; maxSizeBytes: number }
  | { strategy: "vercel_blob_client"; pathname: string; clientToken: string; contentType: string; maxSizeBytes: number };

interface UploadTicketDto {
  uploadId: string;
  expiresAt: IsoDate;
  original: UploadTargetDto;
  preview: UploadTargetDto;
}
```

- ค่าของ enum ใน DTO ตรงกับ [domain-and-ports](domain-and-ports.md#enum) ทุกตัว: `HandoffReason` = `customer_sent_image`, `customer_sent_video`, `customer_sent_non_text`, `budget_reached`, `ai_not_in_knowledge`, `ai_needs_human_action`, `ai_unsafe_or_offtopic`, `ai_other`, `ai_failed`, `ai_timeout`; `MediaStatus` = `pending`, `ready`, `failed`, `too_large`; `OtherKind` = `audio`, `file`, `location`, `unknown`; `EventCode` = `handoff.{HandoffReason}`, `ai.turned_off_by_admin`, `guard.blocked`, `contact.followed`, `contact.unfollowed`; `UsageRecordDto.kind` = `reply`, `ingest`, `guard`; `UsageRecordDto.outcome` = `ok`, `handoff`, `refused`, `failed`, `cancelled`, `blocked`
- `MessageDto.sticker.imageUrl` สร้างที่ server จาก stickerId ด้วยรูปแบบ URL ของ LINE ที่กำหนดตายตัว (ต้องยืนยันรูปแบบ URL กับเอกสาร LINE) หน้าเว็บไม่สร้าง URL เอง
- `MessageDto.media` เป็น null เมื่อ type ไม่ใช่ image หรือ video ส่วน `url` เป็น null ขณะ `status` ยังไม่ใช่ `ready`
- `MessageDto.delivery` เป็น null สำหรับข้อความขาเข้าและบรรทัดเหตุการณ์
- `MessageDto.delivery.retryExpiresAt` มาจาก `Message.firstPushAt` ที่ไม่เปลี่ยน หน้าเว็บเทียบกับนาฬิกาของ browser เอง เพราะ polling ไม่ส่งแถวที่ไม่เปลี่ยนซ้ำเมื่อหน้าต่างผ่าน

### การอัปโหลดตาม `strategy`

หน้าเว็บมีฟังก์ชันเดียว `uploadToTarget(target, blob, { onProgress, signal })` ใน `src/features/inbox/inbox.api.ts` ([ui-screens](../specs/ui-screens.md#76-ขั้นตอนแนบไฟล์))

| `strategy` | สิ่งที่หน้าเว็บทำ |
| --- | --- |
| `http_put` | `PUT target.url` ด้วย `target.headers` และ body เป็นไฟล์ ใช้ `XMLHttpRequest` เพื่อให้ได้ความคืบหน้า สำเร็จเมื่อได้ 200 `target.url` เป็น path ไม่มี origin (`/api/local-storage/...?exp=...&sig=...`) browser จึง PUT ไปที่ origin ที่เปิดอยู่ ไม่ใช่ `APP_BASE_URL` ซึ่งใช้เฉพาะ URL สาธารณะที่ส่งให้ LINE |
| `vercel_blob_client` | เรียกฟังก์ชันอัปโหลดฝั่ง client ของ `@vercel/blob` ด้วย `target.pathname`, `target.clientToken`, `access: "public"` และ `contentType` (ต้องยืนยันชื่อฟังก์ชัน ตัวเลือกความคืบหน้า และการยกเลิกกับเอกสารของ Vercel Blob) |

ทั้งสองแบบไม่คืน URL ให้หน้าเว็บใช้ต่อ หน้าเว็บส่ง `uploadId` กลับมาตอนส่งข้อความ และ server หา URL สาธารณะเอง เพื่อไม่ส่ง URL ที่มาจาก browser ให้ LINE

## Protocol ของ polling

เหตุผลอยู่ใน [ADR 0005](../adr/0005-polling-instead-of-realtime.md) ส่วน function, query key และ hook ฝั่งหน้าเว็บที่ทำตาม protocol นี้อยู่ใน [ui-screens](../specs/ui-screens.md#7-การดึงข้อมูลและ-state-ฝั่ง-client)

### Cursor

- ฐานข้อมูลมี sequence เดียว (`change_seq`) ใช้ทั้ง `Message.seq`, `Message.updatedSeq` และ `Contact.updatedSeq` ([data-model](data-model.md#migration))
- ข้อความใหม่ได้ `seq = updatedSeq = nextval` ทุกการแก้แถว (สถานะการส่ง, สถานะสื่อ) ได้ `updatedSeq = nextval` ใหม่ ส่วน `seq` ไม่เปลี่ยน
- ทุกการแก้แถวของ Contact (ข้อความล่าสุด, ยังไม่อ่าน, รอแอดมิน, สวิตช์, โปรไฟล์, การติดตาม, aiState) ได้ `updatedSeq` ใหม่
- `seq` ใช้เรียงข้อความบนหน้าจอและแบ่งหน้าย้อนหลัง `updatedSeq` ใช้เป็น cursor ของ polling
- Cursor ของหน้าเว็บคือ `highWater` ที่สูงที่สุดที่เคยได้ ต่อหนึ่งรายการ (รายชื่อ หรือข้อความของลูกค้าหนึ่งคน)

### การเลื่อน cursor และการขอย้อนหลัง

Transaction ที่ได้ค่า sequence ก่อนอาจ commit ทีหลัง แถวที่มีค่าน้อยกว่า cursor จึงอาจปรากฏช้า ทุกรอบหน้าเว็บขอย้อนหลังเล็กน้อย:

```
afterUpdatedSeq = max(0, cursor - POLL_OVERLAP_SEQ)
cursor = max(cursor, response.highWater)
```

- รายการที่ได้ซ้ำถูกรวมด้วย id โดยเก็บตัวที่ `updatedSeq` สูงกว่า
- ถ้า `hasMore` เป็น true หน้าเว็บขอรอบถัดไปทันทีด้วย cursor ใหม่ ไม่รอ `POLL_INTERVAL_MS`
- เมื่อแท็บกลับมาแสดง หรือหลังการเชื่อมต่อมีปัญหาแล้วกลับมาได้ หน้าเว็บโหลดหน้าแรกใหม่ทั้งหมดแทนรอบ polling เพราะอาจพลาดแถวที่เกินระยะย้อนหลัง
- ข้อจำกัดที่รู้: ถ้ามีการแก้มากกว่า `POLL_OVERLAP_SEQ` ครั้งระหว่างที่ transaction หนึ่งยังไม่ commit แถวนั้นจะไม่ขึ้นจนกว่าจะโหลดใหม่ ซึ่งไม่น่าเกิดกับปริมาณของบัญชีเดียว

### การลบ

แอปไม่มี endpoint ที่ลบข้อความหรือลูกค้า การลบตาม [operations](../runbooks/operations.md#ลบข้อมูลของลูกค้าหนึ่งคน) ทำในฐานข้อมูลตรง และหน้าเว็บจะเห็นหลังโหลดหน้าแรกใหม่เท่านั้น

### รายชื่อลูกค้า

1. หน้าแรก: `GET /api/contacts?filter=all` เก็บ `highWater` เป็น cursor
2. ทุก `POLL_INTERVAL_MS`: `GET /api/contacts?afterUpdatedSeq=...` ได้ลูกค้าที่เปลี่ยนโดยไม่กรอง หน้าเว็บรวมเข้า cache แล้วกรองและเรียงเองด้วย `matchesContactFilter` และ `compareContacts` ([ui-screens](../specs/ui-screens.md#82-srcfeaturesinboxinboxlogicts)) ลูกค้าที่ไม่ตรงตัวกรองแล้วหายจากรายการ
3. `counts` ในทุกคำตอบใช้แสดงจำนวนของตัวกรองและจำนวนยังไม่อ่านในเมนู
4. การเลื่อนลงโหลดหน้าถัดไปด้วย `before` ของคำตอบก่อนหน้า
5. เปลี่ยนตัวกรองหรือคำค้น: โหลดหน้าแรกใหม่ cursor ของ polling ไม่เปลี่ยน

### ข้อความในแชท

1. เปิดแชท: `GET /api/contacts/:id/messages` ได้ `MESSAGE_PAGE_LIMIT` ข้อความล่าสุดและ `highWater` แล้ว `POST /api/contacts/:id/read`
2. ทุก `POLL_INTERVAL_MS`: `GET /api/contacts/:id/messages?afterUpdatedSeq=...` ได้ทั้งข้อความใหม่และข้อความเดิมที่สถานะเปลี่ยน
3. ถ้าได้ข้อความขาเข้าใหม่ขณะแชทเปิดอยู่และแท็บแสดงอยู่ หน้าเว็บเรียก `POST /api/contacts/:id/read` อีกครั้ง
4. เลื่อนขึ้น: `GET /api/contacts/:id/messages?beforeSeq=<seq ที่น้อยที่สุดที่มี>` ไม่แตะ cursor
5. ข้อความที่แอดมินเพิ่งส่ง (สร้าง id ที่หน้าเว็บ) ถูกแทนด้วยแถวจาก server เมื่อ id ตรงกัน

---

## Endpoint

แต่ละหัวข้อระบุ use case, การเข้าระบบ, การจำกัดความถี่, request, response สำเร็จ และ error เฉพาะของ endpoint นั้น

### POST /api/line/webhook

| | |
| --- | --- |
| Use case | `ReceiveLineEvents` แล้วงานหลังตอบ `StoreInboundMedia`, `GenerateAiReply`, `HandleRichMenuAction`, `SendWelcome` |
| การเข้าระบบ | เปิด ตรวจ signature |
| การจำกัดความถี่ | ไม่มี |
| `maxDuration` | `WEBHOOK_MAX_DURATION_S` |

Request: header `x-line-signature` และ body JSON ของ LINE อ่านเป็นข้อความดิบก่อน (`await request.text()`) แล้วส่ง `rawBody` ให้ use case ห้าม parse ก่อนตรวจ signature

Field ของ LINE ที่ adapter อ่าน (field อื่นปล่อยผ่าน):

| Field | ใช้ทำอะไร | หมายเหตุ |
| --- | --- | --- |
| `events[]` | รายการ event | |
| `events[].type` | `message`, `follow`, `unfollow`, `postback` นอกนั้นเป็น unsupported | |
| `events[].postback.data` | ปุ่มของ rich menu หรือการ์ดต้อนรับ (`tw1:{action}`) string ไม่เกิน `POSTBACK_DATA_MAX_CHARS` | ไม่มีหรือยาวเกินเป็น unsupported |
| `events[].webhookEventId` | กัน event ซ้ำ | |
| `events[].deliveryContext.isRedelivery` | ไม่เก็บ reply token ของการส่งซ้ำ | |
| `events[].timestamp` | เวลาของ event หน่วยมิลลิวินาที | |
| `events[].source.type`, `events[].source.userId` | รับเฉพาะ `user` | |
| `events[].replyToken` | reply token | |
| `events[].mode` | อ่านแบบผ่อนปรน ระบบยังไม่ใช้ค่านี้ (event แบบ `standby` ถูกประมวลผลเหมือน `active`) | ต้องยืนยันกับเอกสาร LINE |
| `events[].message.id`, `events[].message.type` | id และชนิด: `text`, `image`, `video`, `sticker`, `audio`, `file`, `location` | |
| `events[].message.duration` | ความยาวของเสียงเป็นมิลลิวินาที (เฉพาะ `audio`) อ่านแบบผ่อนปรน ค่าที่ไม่ใช่จำนวนเต็มไม่ติดลบถือว่าไม่รู้ | |
| `events[].message.text` | ข้อความ | |
| `events[].message.packageId`, `events[].message.stickerId` | สติกเกอร์ | |
| `events[].message.contentProvider.type` | `line` คือไฟล์อยู่บน LINE, `external` คือ URL ภายนอก | ต้องยืนยันกับเอกสาร LINE |

ชนิด `audio` เป็นชนิด `audio` ของตัวเองพร้อม `durationMs` และดาวน์โหลดไฟล์เหมือนรูปและวิดีโอ ([line-messaging](../specs/line-messaging.md#ชนิดของ-event)) ชนิด `file`, `location` แปลงเป็น `other` พร้อม `otherKind` และชนิดข้อความอื่นที่ไม่รู้จักเป็น `other` แบบ `unknown` (`otherKind: audio` เหลือเฉพาะข้อความเสียงที่รับก่อน migration ที่เก้า)

Response:

| สถานะ | เมื่อ | Body |
| --- | --- | --- |
| 200 | signature ถูก (รวม body ที่อ่านไม่ได้ ก้อนที่บันทึกได้บางส่วน และ event ที่พังด้วยเหตุของตัวเอง) | `{}` |
| 401 | `line.not_configured`, `line.credentials_unreadable`, `webhook.signature_invalid` | รูปแบบ error |
| 503 | `db.unavailable`: signature ถูก แต่ทุก event ล้มเหลว ไม่มีอะไรถูกบันทึก และฐานข้อมูลไม่ตอบ LINE จึงส่งทั้งก้อนซ้ำเมื่อเปิด "Webhook redelivery" ([line-messaging](../specs/line-messaging.md#รับ-event-webhook) ข้อ 6) | รูปแบบ error (รหัส ข้อความกลาง และ `requestId` เท่านั้น) |
| 413 | `request.too_large` (เกิน `WEBHOOK_MAX_BODY_BYTES`) | รูปแบบ error |

### GET /api/health

| | |
| --- | --- |
| Use case | `CheckHealth` |
| การเข้าระบบ | เปิด |

Response 200 `{ "status": "ok" }` หรือ 503 `db.unavailable`

### POST /api/access/unlock

| | |
| --- | --- |
| Use case | `UnlockAccess` |
| การเข้าระบบ | เปิด ตรวจต้นทาง |
| การจำกัดความถี่ | `unlock` ตาม `RATE_LIMIT_UNLOCK` นับเฉพาะรหัสผิด ต่อ IP จากค่าสุดท้ายของ `x-forwarded-for` ([infrastructure](infrastructure.md#ip-ของผู้เรียก)) คำขอที่ไม่มี IP ใช้ `unlock_no_ip` ร่วมกัน |

| Body field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `code` | string | ใช่ | ยาว 1 ถึง 200 ตัวหลังตัดช่องว่างหัวท้าย (เพดานกันคำขอผิดรูป ไม่ใช่กฎของรหัส) |

Response 204 พร้อม `Set-Cookie: twa_access=...`

Error: 401 `access.code_invalid`, 429 `access.rate_limited`

### POST /api/access/lock

ไม่มี use case ลบ cookie ด้วย `Set-Cookie: twa_access=; Max-Age=0` ตอบ 204 ต้องมี cookie ที่ถูกต้องและต้นทางที่ถูกต้อง

### GET /api/contacts

| | |
| --- | --- |
| Use case | `ListContacts` |

Query (ต้องเป็นแบบใดแบบหนึ่ง):

| Field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `filter` | `all` \| `unread` \| `needs_admin` | ไม่ | ค่าเริ่มต้น `all` ห้ามมีพร้อม `afterUpdatedSeq` |
| `q` | string | ไม่ | 1 ถึง `CONTACT_SEARCH_MAX_CHARS` ตัว ค้นจากชื่อ |
| `before` | string | ไม่ | cursor ทึบจากคำตอบก่อนหน้า |
| `afterUpdatedSeq` | string ตัวเลข | ไม่ | โหมด polling ห้ามมีพร้อม `filter`, `q`, `before` |

Response 200:

```ts
{
  contacts: ContactDto[];
  before: string | null;        // cursor ของหน้าถัดไป มีค่าเฉพาะโหมดหน้า
  hasMore: boolean;
  highWater: SeqString;
  counts: { all: number; unread: number; needsAdmin: number };
  lineConfigured: boolean;
}
```

เรียงตาม `sortAt` = เวลาข้อความขาเข้าล่าสุดของลูกค้า (`Contact.lastMessageAt`) หรือ `createdAt` เมื่อยังไม่มี ใหม่ไปเก่า แล้ว `id` ใหม่ไปเก่า ข้อความของแอดมินหรือ AI, บรรทัดเหตุการณ์, การอ่าน และสวิตช์ไม่เปลี่ยนลำดับ `before` เป็น base64url ของ `{ sortAt, id }` หน้าเว็บไม่แกะค่า

### GET /api/contacts/:id

| | |
| --- | --- |
| Use case | `GetContact` |

Response 200 `ContactDetailDto` Error: 404 `contact.not_found`

### PATCH /api/contacts/:id

| | |
| --- | --- |
| Use case | `SetContactAi` |

| Body field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `aiEnabled` | boolean | ใช่ | |

Response 200 `ContactDto` Error: 404 `contact.not_found`, 409 `ai.disabled_globally`

### POST /api/contacts/:id/read

| | |
| --- | --- |
| Use case | `MarkContactRead` |

Body ว่าง Response 200 `ContactDto` Error: 404 `contact.not_found`

### GET /api/contacts/:id/notes

| | |
| --- | --- |
| Use case | `ListContactNotes` |

Response 200 `{ "notes": ContactNoteDto[] }` ใหม่ไปเก่า ไม่เกิน `CONTACT_NOTE_LIST_LIMIT` โดย `ContactNoteDto = { id: string; contactId: string; text: string; createdAt: IsoDate }` Error: 404 `contact.not_found`

### POST /api/contacts/:id/notes

| | |
| --- | --- |
| Use case | `AddContactNote` |
| การจำกัดความถี่ | `note_create` ตาม `RATE_LIMIT_NOTE_CREATE` ต่อ IP |

Body `{ "text": string }` ตัดช่องว่างหัวท้ายแล้ว 1 ถึง `CONTACT_NOTE_MAX_CHARS` ตัว Response 201 `ContactNoteDto` Error: 400 `request.invalid`, 404 `contact.not_found`, 429 `note.rate_limited`

### DELETE /api/contacts/:id/notes/:noteId

| | |
| --- | --- |
| Use case | `DeleteContactNote` |

`noteId` เป็น UUID Response 200 `{ "deleted": true }` Error: 404 `note.not_found` (ไม่มี หรือเป็นของลูกค้าคนอื่น)

### GET /api/contacts/:id/messages

| | |
| --- | --- |
| Use case | `GetMessages` |

Query (ใช้ได้ไม่เกินหนึ่งในสอง field แรก):

| Field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `beforeSeq` | string ตัวเลข | ไม่ | หน้าก่อนหน้า |
| `afterUpdatedSeq` | string ตัวเลข | ไม่ | โหมด polling |
| `limit` | integer | ไม่ | 1 ถึง `MESSAGE_PAGE_LIMIT` ค่าเริ่มต้น `MESSAGE_PAGE_LIMIT` ไม่มีผลกับโหมด polling (ใช้ `POLL_PAGE_LIMIT`) |

ไม่มีทั้งสอง field คือหน้าล่าสุด

Response 200:

```ts
{
  messages: MessageDto[];       // หน้าล่าสุดและ beforeSeq: เรียง seq น้อยไปมาก, polling: เรียง updatedSeq น้อยไปมาก
  hasOlder: boolean | null;     // null ในโหมด polling
  hasMore: boolean;             // true เฉพาะ polling ที่ยังมีแถวเหลือ
  highWater: SeqString;         // "0" ในโหมด beforeSeq
}
```

Error: 404 `contact.not_found`

### POST /api/contacts/:id/messages

| | |
| --- | --- |
| Use case | `SendAdminMessage` |
| การจำกัดความถี่ | `send_message` ตาม `RATE_LIMIT_SEND_MESSAGE` (การเรียกซ้ำด้วย id เดิมไม่ถูกนับ) |

| Body field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `id` | string | ใช่ | UUID ที่หน้าเว็บสร้าง |
| `kind` | `text` \| `image` \| `video` | ใช่ | |
| `text` | string | เมื่อ `kind = text` | 1 ถึง `ADMIN_TEXT_MAX_CHARS` ตัวหลังตัดช่องว่างหัวท้าย ห้ามมีเมื่อเป็นสื่อ |
| `uploadId` | string | เมื่อเป็นสื่อ | 22 ตัว `[A-Za-z0-9_-]` จาก `UploadTicketDto` |
| `contentType` | string | เมื่อเป็นสื่อ | image: `image/jpeg` หรือ `image/png`, video: `video/mp4` |

Response 200 `MessageDto` ซึ่ง `delivery.status` เป็น `sent` หรือ `failed` (หรือ `pending` เมื่อเป็นการเรียกซ้ำระหว่างคำขอแรกยังส่งอยู่)

Error: 404 `contact.not_found`, 409 `contact.unfollowed`, 409 `line.not_configured`, 409 `line.credentials_unreadable`, 409 `message.id_conflict`, 409 `upload.not_found`, 413 `upload.too_large`, 415 `upload.type_not_allowed`, 422 `upload.content_mismatch`, 429 `message.rate_limited`, 503 `storage.unavailable`

### POST /api/contacts/:id/messages/:messageId/retry

| | |
| --- | --- |
| Use case | `RetryMessage` |
| การจำกัดความถี่ | `send_message` ตาม `RATE_LIMIT_SEND_MESSAGE` |

Body ว่าง Response 200 `MessageDto`

Error: 404 `message.not_found`, 409 `message.not_retryable`, 409 `message.retry_expired` (ผ่าน `LINE_RETRY_KEY_WINDOW_MS` นับจาก push ครั้งแรกแล้ว ไม่เรียก LINE และข้อความยังเป็น failed), 409 `contact.unfollowed`, 409 `line.not_configured`, 409 `line.credentials_unreadable`, 429 `message.rate_limited`

### POST /api/contacts/:id/typing

| | |
| --- | --- |
| Use case | `ShowTypingToCustomer` |
| การจำกัดความถี่ | `typing` ตาม `RATE_LIMIT_TYPING` ต่อลูกค้า (เกินแล้วไม่ error) |

Body ว่าง Response 200 `{ "shown": boolean }` Error: 404 `contact.not_found`

หน้าเว็บเรียกเมื่อช่องพิมพ์เปลี่ยนจากว่างเป็นมีข้อความ และไม่ถี่กว่าหนึ่งครั้งต่อ `TYPING_PING_INTERVAL_MS` ระหว่างพิมพ์ต่อเนื่อง ([ui-screens](../specs/ui-screens.md#58-loading-ฝั่ง-line-ขณะพิมพ์))

### POST /api/uploads

| | |
| --- | --- |
| Use case | `IssueUpload` |
| การจำกัดความถี่ | `upload_ticket` ตาม `RATE_LIMIT_UPLOAD_TICKET` |

| Body field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `kind` | `image` \| `video` | ใช่ | |
| `contentType` | string | ใช่ | 1 ถึง 100 ตัว ตรวจชนิดที่อนุญาตใน use case |
| `sizeBytes` | integer | ใช่ | ≥ 1 |
| `preview.contentType` | `image/jpeg` | ใช่ | |
| `preview.sizeBytes` | integer | ใช่ | ≥ 1 |

Response 200 `UploadTicketDto`

Error: 413 `upload.too_large`, 415 `upload.type_not_allowed`, 429 `upload.rate_limited`, 503 `storage.unavailable`

### DELETE /api/uploads/:uploadId

| | |
| --- | --- |
| Use case | `DiscardUpload` |

Path: `uploadId` 22 ตัว `[A-Za-z0-9_-]` Response 204 Error: 503 `storage.unavailable`

### PUT /api/local-storage/*key

| | |
| --- | --- |
| Use case | `WriteLocalUpload` |
| การเข้าระบบ | ต้องมีทั้ง cookie และลายเซ็นใน query: `proxy.ts` ตรวจ cookie และต้นทางเหมือน endpoint อื่นที่ไม่ใช่ `GET` (ข้อยกเว้นของ cookie มีเฉพาะ `GET`/`HEAD`) ส่วน route ตรวจลายเซ็น ผู้อัปโหลดคือหน้าเว็บที่เข้าระบบแล้วเสมอ |
| มีเมื่อ | `FILE_STORAGE=local` ไม่เช่นนั้นตอบ 404 |

Query: `exp` (เวลาหมดอายุ epoch วินาที), `sig` (`<sizeBytes>.<base64url(contentType)>.<base64url(HMAC)>` ตาม [backend](backend.md#api)) Header: `Content-Type` Body: ไฟล์ดิบ ยาวเท่า `sizeBytes` ที่เซ็นไว้พอดี (ขนาดที่ `POST /api/uploads` ขอ) Next.js เก็บ body ไว้ให้ proxy.ts ได้ไม่เกิน `PROXY_BODY_MAX_BYTES` (`experimental.proxyClientMaxBodySize`) body ที่ยาวกว่าถึง route แบบถูกตัด จึงถูกปฏิเสธด้วย `upload.incomplete` แทนการเก็บไฟล์ที่เสีย

Response 200 `{}`

Error: 403 `upload.signature_invalid`, 403 `upload.expired`, 413 `media.too_large`, 422 `upload.content_mismatch`, 422 `upload.incomplete`, 503 `storage.unavailable`

### GET /api/local-storage/*key

| | |
| --- | --- |
| Use case | `ServeLocalMedia` |
| การเข้าระบบ | เปิด (เป็น URL สาธารณะแบบเดาไม่ได้ เหมือน Blob) |
| มีเมื่อ | `FILE_STORAGE=local` |

Response 200 body เป็นไฟล์ พร้อม `Content-Type`, `Content-Length` และ `X-Content-Type-Options: nosniff` Error: 404 `media.not_found`

### GET /api/settings

| | |
| --- | --- |
| Use case | `GetSettings` |

Response 200 `SettingsDto` ไม่มี field ใดที่มีค่าหรือส่วนหนึ่งของ Channel secret หรือ access token

### PATCH /api/settings

| | |
| --- | --- |
| Use case | `UpdateSettings` |

Body ต้องมีอย่างน้อยหนึ่ง field:

| Body field | ชนิด | ข้อกำหนด |
| --- | --- | --- |
| `aiEnabled` | boolean | |
| `aiModel` | `claude-opus-5-5` \| `claude-sonnet-5-5` \| `claude-haiku-5-5` | |
| `aiDailyBudgetUsd` | string | `^\d{1,4}(\.\d{1,2})?$` และไม่เกิน `AI_DAILY_BUDGET_MAX_USD` |
| `aiPoliteParticle` | `ค่ะ` \| `ครับ` | |
| `aiInstructions` | string | 0 ถึง `AI_INSTRUCTIONS_MAX_CHARS` ตัว |
| `aiName` | string | ตัดช่องว่างหัวท้ายแล้ว 0 ถึง `AI_NAME_MAX_CHARS` ตัว ไม่มีอักขระควบคุม (รวมการขึ้นบรรทัดและ tab) สตริงว่างล้างชื่อ (`UpdateSettings` เก็บเป็น null ด้วย `normalizeAiName`) |
| `aiAnswerMode` | `knowledge_only` \| `general` | |
| `guardEnabled` | boolean | เปิดได้เมื่อมีหัวข้ออย่างน้อยหนึ่งหัวข้อ (ที่ส่งมาพร้อมกันหรือที่บันทึกไว้) |
| `howToText` | string | ตัดช่องว่างหัวท้ายแล้ว 0 ถึง `HOW_TO_TEXT_MAX_CHARS` ตัว สตริงว่างกลับไปใช้ข้อความเริ่มต้น |
| `welcomeEnabled` | boolean | |
| `welcomeText` | string | ตัดช่องว่างหัวท้ายแล้ว 0 ถึง `WELCOME_TEXT_MAX_CHARS` ตัว สตริงว่างกลับไปใช้ข้อความเริ่มต้น |
| `guardTopics` | string[] | 0 ถึง `GUARD_MAX_TOPICS` รายการ แต่ละรายการ 1 ถึง `GUARD_TOPIC_MAX_CHARS` ตัวหลังตัดช่องว่างหัวท้าย ห้ามซ้ำกัน ตรวจด้วย `normalizeGuardTopics` (`issue` ไม่เป็น null หรือมีรายการว่างไม่ผ่าน) |

field อื่น รวม `guardRefusalText` ที่เคยมี ไม่ผ่าน: ข้อความปฏิเสธคงที่ใน `guardRefusalText(particle)` ([topic-guard](../specs/topic-guard.md))

Response 200 `SettingsDto` ที่อ่านใหม่หลังบันทึก: `UpdateSettings` คืน `Settings` ซึ่งไม่มี `webhookUrl`, ค่าใช้จ่ายวันนี้, `guard.blockedToday` และ `client.pollIntervalMs` route จึงเรียก `GetSettings` อีกครั้งแล้วตอบผลนั้น ซึ่งเป็นรูปเดียวกับ `GET /api/settings`

Error: 409 `settings.guard_topics_required` (ผลรวมหลังแก้คือเปิดอยู่และไม่มีหัวข้อ)

### POST /api/settings/guard/test

| | |
| --- | --- |
| Use case | `TestTopicGuard` |
| การจำกัดความถี่ | `guard_test` ตาม `RATE_LIMIT_GUARD_TEST` |
| เวลารอของหน้าเว็บ | `CLIENT_TIMEOUT_GUARD_TEST_MS` (การคัดกรองหนึ่งครั้งพร้อม retry นานกว่า `CLIENT_REQUEST_TIMEOUT_MS`) |

| Body field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `text` | string | ใช่ | 1 ถึง `GUARD_TEST_MAX_CHARS` ตัวหลังตัดช่องว่างหัวท้าย |

ใช้หัวข้อที่บันทึกไว้ ไม่รับหัวข้อจาก body

Response 200:

```ts
{ allowed: boolean; matchedTopic: string | null; costUsd: UsdString }   // 6 ตำแหน่ง
```

Error: 409 `ai.disabled_globally`, 409 `settings.guard_topics_required`, 409 `ai.budget_exhausted`, 429 `settings.guard_rate_limited`, 502 `ai.refused`, 502 `ai.truncated`, 502 `ai.invalid_output`, 502 `ai.bad_request`, 502 `ai.auth_failed`, 503 `ai.unavailable`, 503 `ai.no_response`, 503 `ai.rate_limited`

### PUT /api/settings/line-credentials

| | |
| --- | --- |
| Use case | `SetLineCredentials` |

| Body field | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `channelId` | string | ใช่ | ตัวเลข 1 ถึง `LINE_CHANNEL_ID_MAX_CHARS` หลัก (`LINE_CHANNEL_ID_PATTERN`) |
| `channelSecret` | string | ใช่ | 1 ถึง 200 ตัว ไม่มีช่องว่าง |
| `channelAccessToken` | string | ใช่ | 1 ถึง 1000 ตัว ไม่มีช่องว่าง |

Response 200 `{ "botName": string, "basicId": string, "secretStatus": "verified" | "unchecked" }` (`unchecked`: LINE ตรวจ Channel secret ไม่ได้ตอนนี้ ค่าถูกบันทึกแล้ว) หน้าเว็บโหลด `GET /api/settings` ใหม่หลังสำเร็จ Error: 422 `line.credentials_invalid`, 422 `line.channel_secret_invalid` (Channel ID กับ Channel secret ไม่ใช่คู่กัน ไม่บันทึก), 422 `line.channel_mismatch` (Channel access token เป็นของ channel อื่น ไม่บันทึก), 503 `line.unavailable` (ตรวจ access token ไม่ได้) หน้าเว็บรอคำตอบ `CLIENT_TIMEOUT_LINE_CHECK_MS`

### POST /api/settings/line/test

| | |
| --- | --- |
| Use case | `TestLineConnection` |

Body ว่าง Response 200 `{ "botName": string, "basicId": string, "secretStatus": "verified" | "unchecked" | "no_channel_id" }` ผลการตรวจ Channel secret ของการทดสอบครั้งนี้

Error: 409 `line.not_configured`, 409 `line.credentials_unreadable`, 422 `line.credentials_invalid`, 422 `line.channel_secret_invalid`, 422 `line.channel_mismatch`, 503 `line.unavailable`

### POST /api/settings/rich-menu และ DELETE /api/settings/rich-menu

| | |
| --- | --- |
| Use case | `PublishRichMenu` (POST), `RemoveRichMenu` (DELETE) |
| `maxDuration` | ค่าเริ่มต้น การ publish เรียก LINE ไม่เกินห้าครั้งตามลำดับ หน้าเว็บรอ `CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS` (publish) และ `CLIENT_TIMEOUT_RICH_MENU_REMOVE_MS` (นำออก) |

Body ว่าง Response 200 `SettingsDto` ที่อ่านใหม่ (`richMenu.published`, `publishedAt`, `lastError`) ขั้นตอนอยู่ใน [line-messaging](../specs/line-messaging.md#publish-และนำออก)

Error: 409 `line.not_configured`, 409 `line.credentials_unreadable`, 422 `line.credentials_invalid` (LINE ตอบ 401), 502 `line.rich_menu_failed` (LINE ปฏิเสธคำขอของ rich menu), 409 `line.rich_menu_conflict` (การ publish อีกครั้งที่ทำพร้อมกันบันทึกเมนูของมันก่อน เมนูที่แสดงคือเมนูนั้น), 503 `line.unavailable` (LINE ไม่ตอบ, 5xx หรือ 429) ทุก error ของ LINE ถูกเก็บใน `richMenu.lastError` ด้วยรหัสเดิมของ LINE หน้าเว็บจึงโหลด `GET /api/settings` ใหม่หลังล้ม

### GET /api/knowledge/documents

| | |
| --- | --- |
| Use case | `ListDocuments` |

Response 200 `{ documents: DocumentDto[]; usedTokens: number; capacityTokens: number }`

หน้าตั้งค่า polling endpoint นี้ทุก `POLL_INTERVAL_MS` เฉพาะเมื่อมีแถวที่ `processing`

### POST /api/knowledge/documents

| | |
| --- | --- |
| Use case | `IngestDocument` (ช่วง A ใน request, ช่วง B หลังตอบ) |
| การจำกัดความถี่ | `pdf_ingest` ตาม `RATE_LIMIT_PDF_INGEST` |
| `maxDuration` | `KNOWLEDGE_MAX_DURATION_S` |

Request: `multipart/form-data` มี part เดียวชื่อ `file` ชื่อไฟล์ 1 ถึง 200 ตัว (ตัด path ออก) body ทั้งหมดไม่เกิน `PDF_MAX_BYTES` + `JSON_MAX_BODY_BYTES` ถ้า `Content-Length` เกินตอบ `knowledge.file_too_large` โดยไม่อ่าน body (ต้องยืนยันเพดานขนาด request ของ Vercel ซึ่งอาจต่ำกว่านี้) หน้าเว็บรอคำตอบ `CLIENT_REQUEST_TIMEOUT_MS` บวกเวลาที่ไฟล์ใช้ที่ `CLIENT_UPLOAD_MIN_BYTES_PER_SECOND` (`uploadTimeoutMs`)

Response 202 `DocumentDto` สถานะ `processing`

Error: 409 `knowledge.duplicate`, 409 `ai.budget_exhausted`, 413 `knowledge.file_too_large`, 415 `knowledge.not_pdf`, 429 `knowledge.rate_limited`

### GET /api/knowledge/documents/:id

| | |
| --- | --- |
| Use case | `GetDocument` |

Response 200 `DocumentDetailDto` Error: 404 `knowledge.not_found`

### DELETE /api/knowledge/documents/:id

| | |
| --- | --- |
| Use case | `DeleteDocument` |

Response 204 Error: 404 `knowledge.not_found`

### POST /api/knowledge/documents/:id/retry

| | |
| --- | --- |
| Use case | `IngestDocument` ด้วย `retryOf = :id` |
| การจำกัดความถี่ | `pdf_ingest` ตาม `RATE_LIMIT_PDF_INGEST` |
| `maxDuration` | `KNOWLEDGE_MAX_DURATION_S` |

Request แบบเดียวกับการอัปโหลด Response 202 `DocumentDto`

Error: เหมือนการอัปโหลด และ 404 `knowledge.not_found`, 409 `knowledge.not_retryable`

### GET /api/usage

| | |
| --- | --- |
| Use case | `GetUsageReport` |

| Query | ชนิด | บังคับ | ข้อกำหนด |
| --- | --- | --- | --- |
| `month` | string | ไม่ | `^\d{4}-(0[1-9]\|1[0-2])$` ค่าเริ่มต้นคือเดือนปัจจุบันตามเวลาไทย (route เรียก `bangkokMonthOf`) |

Response 200:

```ts
{
  month: string;
  priceTableDate: string;
  contacts: UsageRowDto[];
  ingest: { count: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; costUsd: UsdString };
  guard: { count: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; costUsd: UsdString };  // การคัดกรองขอบเขตหัวข้อ รวมการทดลอง
  totalCostUsd: UsdString;                // ลูกค้า + ingest + guard
  replyCount: number;
  averageCostPerReplyUsd: UsdString | null;
  /** การเรียกทุกชนิดในเดือนที่ส่งแล้วไม่ได้คำตอบ (ai.no_response) อาจถูกคิดเงินแต่ไม่อยู่ใน totalCostUsd */
  noResponseCount: number;
}
```

### GET /api/usage/contacts/:id

| | |
| --- | --- |
| Use case | `GetContactUsage` |

Query `month` แบบเดียวกับ `GET /api/usage` Response 200 `{ records: UsageRecordDto[] }`

### GET /api/system/status

| | |
| --- | --- |
| Use case | `GetSystemStatus` |

Response 200 `SystemStatusDto`

### GET /api/system/guardrails

| | |
| --- | --- |
| Use case | `GetGuardrailStats` |

Response 200 `GuardrailStatsDto` ตัวเลขของวันนี้ตามเวลาไทย ไม่มีหน้าจอใดแสดง ใช้ตรวจผ่าน API ([ADR 0024](../adr/0024-scope-reductions.md))

## ตารางไล่ endpoint กับ use case

| Endpoint | Use case |
| --- | --- |
| `POST /api/line/webhook` | `ReceiveLineEvents` (+ `StoreInboundMedia`, `GenerateAiReply` หลังตอบ) |
| `GET /api/health` | `CheckHealth` |
| `POST /api/access/unlock` | `UnlockAccess` |
| `POST /api/access/lock` | ไม่มี (ลบ cookie) |
| ทุก endpoint ที่ต้องเข้าระบบ | `VerifyAccess` |
| `GET /api/contacts` | `ListContacts` |
| `GET /api/contacts/:id` | `GetContact` |
| `PATCH /api/contacts/:id` | `SetContactAi` |
| `POST /api/contacts/:id/read` | `MarkContactRead` |
| `GET /api/contacts/:id/messages` | `GetMessages` |
| `POST /api/contacts/:id/messages` | `SendAdminMessage` |
| `POST /api/contacts/:id/messages/:messageId/retry` | `RetryMessage` |
| `POST /api/contacts/:id/typing` | `ShowTypingToCustomer` |
| `POST /api/uploads` | `IssueUpload` |
| `DELETE /api/uploads/:uploadId` | `DiscardUpload` |
| `PUT /api/local-storage/*key` | `WriteLocalUpload` |
| `GET /api/local-storage/*key` | `ServeLocalMedia` |
| `GET /api/contacts/:id/notes` | `ListContactNotes` |
| `POST /api/contacts/:id/notes` | `AddContactNote` |
| `DELETE /api/contacts/:id/notes/:noteId` | `DeleteContactNote` |
| `GET /api/settings` | `GetSettings` |
| `PATCH /api/settings` | `UpdateSettings` |
| `PUT /api/settings/line-credentials` | `SetLineCredentials` |
| `POST /api/settings/line/test` | `TestLineConnection` |
| `POST /api/settings/rich-menu` | `PublishRichMenu` |
| `DELETE /api/settings/rich-menu` | `RemoveRichMenu` |
| `POST /api/settings/guard/test` | `TestTopicGuard` |
| `GET /api/knowledge/documents` | `ListDocuments` |
| `POST /api/knowledge/documents` | `IngestDocument` |
| `GET /api/knowledge/documents/:id` | `GetDocument` |
| `DELETE /api/knowledge/documents/:id` | `DeleteDocument` |
| `POST /api/knowledge/documents/:id/retry` | `IngestDocument` |
| `GET /api/usage` | `GetUsageReport` |
| `GET /api/usage/contacts/:id` | `GetContactUsage` |
| `GET /api/system/status` | `GetSystemStatus` |
| `GET /api/system/guardrails` | `GetGuardrailStats` |
