# Stub server และ fixture

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

Stub server ที่ใช้แทน LINE และ Claude ใน Docker, adapter test และ E2E, ไฟล์ fixture และขั้นตอนของ E2E ทั้ง 9 เส้น เหตุผลของการใช้ stub อยู่ใน [ADR 0012](../adr/0012-testing-with-fakes-and-stubs.md) และชั้นของการทดสอบอยู่ใน [test-strategy](test-strategy.md)

## 1. กฎ

1. Stub เป็น Node HTTP server ไฟล์เดียว `stubs/server.ts` ใช้แค่ module ในตัวของ Node (`node:http`, `node:fs/promises`, `node:path`, `node:stream`) ไม่มี dependency และรันด้วย `node stubs/server.ts` ได้ทั้งบน Node 24 (image ของ Docker) และ Node 22 (สภาพแวดล้อมพัฒนา ซึ่งใช้รันชุด `adapters` กับ stub ที่รันเอง) เพราะทั้งสองรุ่นตัด type ของ TypeScript ได้เองโดยไม่ต้องใส่ flag ไฟล์ไม่แยกเป็นหลาย module เพราะ Node ต้องการนามสกุล `.ts` ใน import แบบ relative ซึ่ง `tsconfig.json` ไม่อนุญาต
2. ฟังที่ port `4010` (`STUB_PORT`) เป็น service `stub` ใน Docker compose มี prefix `/line`, `/line-data`, `/anthropic` และ route ควบคุม `/__control/...` โดย `GET /__control/health` ใช้เป็น healthcheck ของ compose ([project-setup](../architecture/project-setup.md#73-docker-composeyml) ต้องตรงกับไฟล์นี้)
3. **Route ควบคุม (`/__control/...`) มีเฉพาะใน stub** แอปไม่มี endpoint สำหรับ test ไม่มี endpoint ล้างข้อมูล และไม่มีโค้ดที่เปลี่ยนพฤติกรรมเพราะกำลังถูกทดสอบ ([test-strategy](test-strategy.md))
4. Stub ไม่ถูก build เข้า image ของแอป และไม่ถูก deploy production ไม่ตั้ง `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL` และ `ANTHROPIC_BASE_URL` ([infrastructure](../architecture/infrastructure.md))
5. ข้อมูลใน stub เป็นของปลอมทั้งหมด token, secret และ id เป็นค่าที่เห็นชัดว่าปลอม เช่น `stub-access-token`
6. Stub เก็บ state ในหน่วยความจำ restart แล้วหาย
7. Stub เลียนแบบเฉพาะสิ่งที่แอปใช้ รูปแบบที่ยังไม่ได้ยืนยันกับเอกสารของ LINE ระบุว่า "ต้องยืนยันกับเอกสาร LINE" เมื่อยืนยันแล้วให้แก้ทั้ง stub, adapter และเอกสารนี้พร้อมกัน
8. เมื่อ stub ต่างจากของจริงจนเกิด bug ที่ test ไม่จับ ให้แก้ stub ก่อน แล้วเพิ่ม test ([ADR 0012](../adr/0012-testing-with-fakes-and-stubs.md) หัวข้อจะทบทวนเมื่อ)

## 2. การต่อกับแอป

| ตัวแปรของแอปใน compose | ค่า | หมายเหตุ |
| --- | --- | --- |
| `LINE_API_BASE_URL` | `http://stub:4010/line` | แทน `https://api.line.me` |
| `LINE_DATA_API_BASE_URL` | `http://stub:4010/line-data` | แทน `https://api-data.line.me` |
| `ANTHROPIC_BASE_URL` | `http://stub:4010/anthropic` | SDK ต่อ `/v1/messages` ท้าย base URL |
| `ANTHROPIC_API_KEY` | `stub-anthropic-key` | ค่าปลอม |
| `POLL_INTERVAL_MS` | `500` | |
| `AI_DEBOUNCE_MS` | `300` | |
| `RATE_LIMIT_SCALE` | `10` | ให้ E2E ที่รันขนานจาก IP เดียวไม่ถูกจำกัด ไม่คูณค่าจำกัดของรหัสเข้าใช้ |

| ตัวแปรของ stub | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `STUB_PORT` | `4010` | |
| `STUB_PUBLIC_URL` | `http://localhost:4010` | URL ที่ browser เปิดได้ ใช้สร้าง `pictureUrl` ของ `info` (รูปของ OA) โปรไฟล์ลูกค้าไม่ใช้ค่านี้ ข้อ 4.4 |

Seed ของ Docker ใส่ credential ของ LINE ปลอมไว้ใน Settings: Channel ID `1000000000`, Channel secret `stub-channel-secret` และ access token `stub-access-token` (สองค่าหลังเข้ารหัสด้วย key ของ dev ใน compose) ค่าทั้งสามประกาศใน `e2e/fixtures/line/credentials.ts` เป็น `STUB_CHANNEL_ID`, `STUB_CHANNEL_SECRET` และ `STUB_CHANNEL_ACCESS_TOKEN` ซึ่ง seed และ E2E ใช้ร่วมกัน stub เขียน Channel ID กับ secret ซ้ำไว้ในตัว (import ไฟล์นี้ไม่ได้ ข้อ 1) เป็นคู่เดียวที่ route `oauth-token` ยอมรับ Seed ตั้ง kill switch เปิด และชื่อ OA จากการทดสอบการเชื่อมต่อเป็นค่าที่ stub คืน

| ตัวแปรของ Playwright | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `E2E_ACCESS_CODE` | `test-webchat` (เท่ากับ `ACCESS_CODE` ใน compose) | `global.setup.ts`, `loginByApi` และเส้นที่ 8 |
| `E2E_LINE_CHANNEL_SECRET` | `STUB_CHANNEL_SECRET` | เซ็น webhook |
| `E2E_STUB_URL` | `http://localhost:4010` | helper ที่เรียก route ควบคุม |

## 3. สิ่งที่ stub ทำกับทุกคำขอ

- บันทึกทุกคำขอที่เข้า route ของ LINE และ Claude ลงรายการในหน่วยความจำ (เก็บล่าสุด 2,000 รายการ) ในรูปด้านล่าง body ที่ไม่ใช่ JSON (form ของ `oauth-token` และ `oauth-revoke`) ถูกเก็บเป็น null รายการจึงไม่มี Channel secret หรือ token ที่ออก

```ts
type RecordedRequest = {
  seq: number;              // เพิ่มทีละหนึ่ง ใช้กับ ?since=
  at: string;               // ISO
  service: "line" | "line-data" | "claude";
  endpoint: string;         // ชื่อในตารางข้อ 4 และ 5 เช่น "push"
  purpose?: "guard" | "reply" | "extract" | "count_tokens"; // มีเฉพาะ service claude ตามการแยกชนิดในข้อ 5.3
  method: string;
  path: string;
  headers: {                // เฉพาะ header ที่ test ต้องใช้
    authorization: "bearer" | "missing" | "other";
    contentType?: string;
    xLineRetryKey?: string;
    xApiKey?: "present" | "missing";
    anthropicVersion?: string;
    anthropicBeta?: string;
  };
  body: unknown;            // JSON ที่ parse แล้ว หรือ null
  status: number;           // status ที่ stub ตอบ
};
```

- ไม่พิมพ์ body ลง stdout พิมพ์แค่ method, path และ status
- คำขอของ route ควบคุม (`/__control/...`) และ `GET /assets/:name` ไม่ถูกบันทึก (browser โหลด asset เองและจะดันรายการจริงออก)
- คำขอที่ไม่ตรง route ใด ตอบ 404 `{ "message": "stub: no route" }` และบันทึกด้วย `endpoint: "unknown"` เพื่อให้ test เห็นว่าแอปเรียกผิดที่

## 4. Route ของ LINE

### 4.1 การตรวจร่วมของ `/line/*` และ `/line-data/*`

| ตรวจ | ไม่ผ่านแล้วตอบ |
| --- | --- |
| มี `Authorization: Bearer <ค่าไม่ว่าง>` | 401 `{ "message": "Authentication failed. Confirm that the access token in the authorization header is valid." }` |
| token เท่ากับ `stub-invalid-token` | 401 แบบเดียวกัน (ใช้ทดสอบ token ผิด) |
| คำขอแบบ POST มี `Content-Type: application/json` และ body เป็น JSON | 400 `{ "message": "The request body has 1 error(s)" }` |

Route `oauth-token` และ `oauth-revoke` ไม่ใช้สามข้อนี้: ไม่ต้องมี Authorization และ body เป็น form (`Content-Type: application/x-www-form-urlencoded` ไม่ใช่ตอบ 400 `{ "error": "invalid_request" }`)

ข้อความ error ของ LINE ในตารางนี้เป็นรูปแบบที่สมมติ ต้องยืนยันกับเอกสาร LINE แอปใช้แค่ status ยกเว้น 400 ของ `reply` ซึ่งแอปแยกด้วย `message` ที่ตรงกับ `Invalid reply token` (ข้อ 4.4) และ 429 ของโควตา (`monthly limit`)

### 4.2 ตาราง route

| endpoint | Method และ path | ตรวจ body | คำตอบปกติ |
| --- | --- | --- | --- |
| `reply` | `POST /line/v2/bot/message/reply` | `replyToken` เป็น string ไม่ว่าง, `messages` 1 ถึง 5 รายการ แต่ละรายการตรง schema ข้อ 4.3 | 200 `{ "sentMessages": [{ "id": "<เลข>", "quoteToken": "stub-qt-<เลข>" }] }` |
| `push` | `POST /line/v2/bot/message/push` | `to` ขึ้นต้นด้วย `U`, `messages` 1 ถึง 5 รายการ, header `X-Line-Retry-Key` เป็น UUID version 4 หรือ 5 ที่มี variant ของ RFC 4122 (แบบที่ LINE รับแน่นอน version อื่นได้ 400 แอปจึงส่ง version 7 ไม่ได้โดยไม่มี test แดง) | 200 รูปแบบเดียวกับ reply |
| `profile` | `GET /line/v2/bot/profile/:userId` | | 200 `{ "userId", "displayName", "language": "th" }` และ `pictureUrl` เฉพาะเมื่อ test ลงทะเบียนไว้ (ข้อ 4.4) |
| `loading` | `POST /line/v2/bot/chat/loading/start` | `chatId` ขึ้นต้นด้วย `U`, `loadingSeconds` เป็นพหุคูณของ 5 ระหว่าง 5 ถึง 60 | 202 `{}` |
| `info` | `GET /line/v2/bot/info` | | 200 `{ "userId": "Ustub00000000000000000000000000000", "basicId": "@000stub", "displayName": "ต้นหอม คาเฟ่ (ทดสอบ)", "pictureUrl": "<STUB_PUBLIC_URL>/assets/oa.png", "chatMode": "bot", "markAsReadMode": "auto" }` |
| `content` | `GET /line-data/v2/bot/message/:messageId/content` | | ไฟล์ตาม prefix ของ `messageId` (ข้อ 4.4) |
| `content-preview` | `GET /line-data/v2/bot/message/:messageId/content/preview` | | JPEG `tiny.jpg` ยกเว้น `messageId` ที่ใส่ไว้ด้วย `POST /__control/line/content` (ข้อ 4.4) |
| `content-transcoding` | `GET /line-data/v2/bot/message/:messageId/content/transcoding` | | 200 `{ "status": "succeeded" }` ยกเว้น `messageId` ที่ใส่ไว้ด้วย `POST /__control/line/transcoding`: `processing` ระหว่างที่ยังเหลือคำตอบ "ยังไม่พร้อม" และ `failed` เมื่อใส่ `failed: true` |
| `oauth-token` | `POST /line/v2/oauth/accessToken` | form: `grant_type=client_credentials`, `client_id`, `client_secret` | 200 `{ "access_token": "stub-issued-<เลข>", "expires_in": 2592000, "token_type": "Bearer" }` เฉพาะ `client_id` = `STUB_CHANNEL_ID` กับ `client_secret` = `STUB_CHANNEL_SECRET` นอกนั้น 400 `{ "error": "invalid_client" }` (`grant_type` อื่น 400 `unsupported_grant_type`) |
| `oauth-revoke` | `POST /line/v2/oauth/revoke` | form: `access_token` | 200 `{}` เฉพาะ token ที่ `oauth-token` ออกและยังไม่ถูกเพิกถอน นอกนั้น 400 test จึงเห็นการเพิกถอนที่ผิด |
| `asset` | `GET /assets/:name` | | ไฟล์รูปปลอมของโปรไฟล์และ OA (ไม่ต้องมี Authorization) |

รายการที่ต้องยืนยันกับเอกสาร LINE: รูปแบบคำตอบของ `reply`, `push` และ `info`, status 202 และเงื่อนไขของ `loadingSeconds`, การมีอยู่และรูปแบบของ `content/preview` และ `content/transcoding`, ขีดจำกัด 5 ข้อความต่อคำขอ

### 4.3 Schema ของข้อความขาออกที่ stub ยอมรับ

| `type` | Field ที่ต้องมี | ตรวจเพิ่ม |
| --- | --- | --- |
| `text` | `text` | ยาว 1 ถึง 5,000 ตัวอักษร (ต้องยืนยันกับเอกสาร LINE) |
| `image` | `originalContentUrl`, `previewImageUrl` | ทั้งคู่เป็น URL แบบ `http` หรือ `https` (LINE จริงรับเฉพาะ `https` stub ผ่อนให้เพราะ Docker ใช้ `http` ข้อนี้ทดสอบด้วยมือ) |
| `video` | `originalContentUrl`, `previewImageUrl` | เหมือนรูป |

ชนิดอื่นตอบ 400 เพราะแอปไม่ส่งชนิดอื่น

### 4.4 พฤติกรรมที่ขึ้นกับค่าในคำขอ

| เงื่อนไข | Stub ตอบ | ใช้ทดสอบ |
| --- | --- | --- |
| `replyToken` ขึ้นต้นด้วย `expired-` | 400 `{ "message": "Invalid reply token" }` | reply token หมดอายุแล้วแอปต้องไป push |
| `replyToken` ที่ถูกใช้สำเร็จไปแล้วครั้งหนึ่ง | 400 `{ "message": "Invalid reply token" }` | token ใช้ได้ครั้งเดียว |
| `X-Line-Retry-Key` ซ้ำกับคำขอ push ที่สำเร็จแล้ว | 409 `{ "message": "The retry key is already accepted" }` header `x-line-accepted-request-id: stub-req-<เลข>` และไม่นับเป็นข้อความใหม่ | แอปต้องถือว่าสำเร็จ (รูปแบบนี้ต้องยืนยันกับเอกสาร LINE) |
| `X-Line-Retry-Key` ขาด หรือไม่ใช่ UUID version 4 หรือ 5 | 400 พร้อม `details` | กฎของแอปที่ส่ง retry key แบบ version 5 ทุกครั้ง ([line-messaging](../specs/line-messaging.md#ส่งข้อความ) ข้อ 4) LINE จริงไม่บังคับให้มี key |
| body ผิด schema ข้อ 4.3 (reply และ push) | 400 `{ "message": "The request body has 1 error(s)", "details": [{ "message": "...", "property": "/messages/<ลำดับ>" }] }` | แอปแยก 400 นี้ออกจาก token ที่ใช้ไม่ได้ และไม่ push ต่อ |
| content ของ `messageId` ที่ใส่ไว้ด้วย `POST /__control/line/transcoding` (ใช้ก่อนกฎอื่นทุกข้อ) | 202 `{}` ไม่มีไฟล์ จนคำตอบ "ยังไม่พร้อม" หมด แล้วตามกฎข้อต่อไป | ไฟล์ที่ LINE ยังเตรียมไม่เสร็จ |
| profile ของ `userId` ที่ขึ้นต้นด้วย `noprofile-` หรือไม่ได้ลงทะเบียนและขึ้นต้นด้วย `Unoprofile` | 404 `{ "message": "Not found" }` | ชื่อว่าง แสดงตัวอักษรแทนรูป |
| profile ของ `userId` อื่นที่ไม่ได้ลงทะเบียน | `displayName` = `ลูกค้าทดสอบ ` + 4 ตัวท้ายของ userId ไม่มี `pictureUrl` | ค่าเริ่มต้นไม่มีรูป เพราะรูปบน origin ของ stub ถูก CSP ของแอป (`img-src`) กันและทำให้ browser ขึ้น console error |
| content ของ `messageId` ขึ้นต้นด้วย `img` | `tiny.jpg` `Content-Type: image/jpeg` | |
| ขึ้นต้นด้วย `vid` | `tiny.mp4` `Content-Type: video/mp4` | |
| ขึ้นต้นด้วย `bigimg` | stream ขนาด 11 MiB ขึ้นต้นด้วย byte ของ JPEG ตามด้วยศูนย์ ไม่ส่ง `Content-Length` | รูปเกิน 10 MB ไม่ถูกเก็บ |
| ขึ้นต้นด้วย `bigvid` | stream 51 MiB ขึ้นต้นด้วย header ของ MP4 | วิดีโอเกิน 50 MB |
| ขึ้นต้นด้วย `fakeimg` | ข้อความ `not an image` แต่ `Content-Type: image/jpeg` | ตรวจชนิดจากเนื้อไฟล์ |
| ขึ้นต้นด้วย `gone` หรืออื่น ๆ | 404 | `mediaStatus = failed` |
| `messageId` ที่ใส่ไว้ด้วย `POST /__control/line/content` (ใช้ก่อนกฎ prefix ทุกข้อ) | `content` ตอบ byte และ `Content-Type` ที่ใส่ไว้ `content/preview` ตอบภาพตัวอย่างที่ใส่ไว้ หรือ 404 เมื่อไม่ได้ใส่ `preview` ทั้งสองไม่ส่ง `Content-Length` เมื่อ `sendContentLength: false` | ไฟล์จริงชนิดอื่น ภาพตัวอย่างที่หายไป และ stream ที่ไม่บอกขนาด |

## 5. Route ของ Claude

### 5.1 การตรวจ

| ตรวจ | ไม่ผ่านแล้วตอบ |
| --- | --- |
| มี API key เป็น header `x-api-key` (ไม่ว่าง) หรือ `Authorization: Bearer <ค่าไม่ว่าง>` (SDK 1.10.0 ส่ง key แบบ `Authorization: Bearer` ส่วน curl และ SDK รุ่นเก่าส่ง `x-api-key` ถ้ามีทั้งคู่ใช้ `x-api-key`) | 401 `{ "type": "error", "error": { "type": "authentication_error", "message": "stub: missing or invalid API key" } }` |
| API key เท่ากับ `stub-invalid-key` | 401 แบบเดียวกัน |
| มี header `anthropic-version` | 400 `invalid_request_error` |
| body เป็น JSON object มี `model` (string), `messages` (array ไม่ว่าง) และสำหรับ `messages` เท่านั้น `max_tokens` (จำนวนเต็มบวก) เพราะ `count_tokens` ของจริงไม่รับ `max_tokens` | 400 `invalid_request_error` |
| `messages[0].role` เป็น `user` | 400 `invalid_request_error` |
| ไม่มี `temperature`, `top_p`, `top_k` | 400 `invalid_request_error` (โมเดลรุ่นปัจจุบันปฏิเสธ) |

### 5.2 ตาราง route

| endpoint | Method และ path | คำตอบปกติ |
| --- | --- | --- |
| `messages` | `POST /anthropic/v1/messages` | ข้อ 5.3 |
| `count-tokens` | `POST /anthropic/v1/messages/count_tokens` | `{ "input_tokens": N }` โดย N = ปัดขึ้นของ (จำนวนตัวอักษรของ text ทั้งหมดใน `system` และ `messages` หาร 4) |

### 5.3 คำตอบของ `messages`

Stub แยกชนิดคำขอตามลำดับนี้ และบันทึกเป็น `purpose` ของ `RecordedRequest`:

1. `output_config.format.schema.properties` มี `allowed`: `guard` (schema ของการคัดกรองใน [ai-prompt ข้อ 9.3](../specs/ai-prompt.md#93-schema-ของผลการคัดกรอง))
2. มี content block ชนิด `document` ใน `messages` ใด: `extract`
3. นอกนั้น: `reply`

คำขอของ `count-tokens` ถูกบันทึกด้วย `purpose: "count_tokens"`

คำขอที่ไม่มี `stream: true` ได้คำตอบเป็น JSON ด้านล่าง คำขอที่มี `stream: true` (การแปลง PDF) ได้ข้อความเดียวกันเป็น SSE (`Content-Type: text/event-stream`) ตามลำดับเหตุการณ์ของ Messages API แบบ stream: `message_start` (content ว่าง, `stop_reason: null`, `output_tokens: 0`), `content_block_start` / `content_block_delta` / `content_block_stop` ของแต่ละ block (text แบ่งเป็น `text_delta` ไม่เกิน 3 ชิ้นตาม code point เพื่อให้ SDK ต้องต่อเอง, thinking ส่ง `signature_delta`), `message_delta` ที่มี `stop_reason` และ usage สุดท้าย แล้ว `message_stop`

```json
{
  "id": "msg_stub_000123",
  "type": "message",
  "role": "assistant",
  "model": "<model ของคำขอ>",
  "content": [{ "type": "text", "text": "<ข้อความ>" }],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "stop_details": null,
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 80,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

| ชนิด | `<ข้อความ>` เริ่มต้น | usage เริ่มต้น |
| --- | --- | --- |
| `reply` | `{"reply":"สวัสดีค่ะ นี่คือคำตอบทดสอบจาก AI","needsAdmin":false,"handoffReason":null}` | input 1200, output 80, cache 0 และ 0 |
| `extract` | `ต้นหอม คาเฟ่ (ไฟล์ทดสอบ)\n\nเวลาเปิดปิด\nวันอังคาร ถึง วันอาทิตย์ 08:00 - 18:00` | input 3000, output 400, cache 0 และ 0 |
| `guard` | `{"allowed":true,"matchedTopic":null}` | input 400, output 20, cache 0 และ 0 |

ราคาที่ระบบควรคำนวณได้จากคำตอบ `reply` เริ่มต้น ตามตารางใน [usage-cost](../specs/usage-cost.md): Opus 5.5 $0.0064, Sonnet 5.5 $0.0032, Haiku 5.5 $0.00016 และจากคำตอบ `guard` เริ่มต้นบน Haiku 5.5 $0.00005 ค่าเหล่านี้ใช้ใน adapter test และ E2E

ค่าที่ test สั่งได้ต่อครั้ง (ข้อ 6): ข้อความ, `stop_reason`, `model` ที่รายงาน (จำลองการสลับโมเดลสำรอง), usage, การเพิ่ม content block `{ "type": "thinking", "thinking": "", "signature": "stub" }` ก่อน text (ตรวจว่า adapter ข้าม block ที่ไม่ใช่ text)

## 6. Route ควบคุม

ทุก route รับและตอบ JSON ไม่ต้องมี Authorization และไม่ถูกบันทึกในรายการคำขอ

| Method และ path | Body | ผล |
| --- | --- | --- |
| `GET /__control/health` | | `{ "ok": true }` ใช้รอ stub พร้อมใน compose |
| `POST /__control/reset` | | ล้างคิวทั้งหมด รายการคำขอ reply token ที่ใช้แล้ว retry key ที่รับแล้ว โปรไฟล์ที่ลงทะเบียน ไฟล์ที่ใส่ไว้ด้วย `line/content` สถานะของ `line/transcoding` และ token ที่ `oauth-token` ออก (เลข `seq` ของรายการคำขอและเลข id ไม่เริ่มใหม่) |
| `POST /__control/line/profiles` | `{ userId, displayName, pictureUrl?: string \| null }` | ลงทะเบียนโปรไฟล์ ไม่ใส่ `pictureUrl` หรือใส่ `null` ตอบโดยไม่มี field นี้ ใส่ URL เมื่อ test ต้องการรูป ซึ่งต้องอยู่บน origin ที่ CSP ของแอปอนุญาต เช่น `https://profile.line-scdn.net/...` แล้วให้ test ตอบ URL นั้นด้วยไฟล์ใน `e2e/fixtures/media/` ผ่าน `page.route` |
| `POST /__control/line/fail-next` | `{ endpoint, match?, status, body?, headers?, times?: 1 }` หรือ `{ endpoint, match?, preset, headers?, times?: 1 }` | คำขอถัดไปที่ตรงเงื่อนไขได้คำตอบนี้แทน `preset` เติม status และ body ให้: `invalid_reply_token` คือ 400 `{ "message": "Invalid reply token" }` และ `validation` คือ 400 `{ "message": "The request body has 1 error(s)", "details": [{ "message": "Length must be between 1 and 5000", "property": "/messages/0/text" }] }` (400 ของ body ผิดรูปที่ไม่ใช่เรื่อง token) |
| `POST /__control/line/transcoding` | `{ messageId, notReadyTimes?: 1, failed?: false }` | LINE ยังเตรียมไฟล์ของ `messageId` นั้นอยู่: แต่ละคำขอ `content` ที่ตอบ 202 และแต่ละคำขอ `content-transcoding` ที่ตอบ `processing` ใช้คำตอบ "ยังไม่พร้อม" หนึ่งครั้ง เมื่อหมด `content` ตอบไฟล์ตามปกติและสถานะเป็น `succeeded` `failed: true` ให้ `content` ตอบ 202 ตลอดและสถานะเป็น `failed` ใส่ซ้ำแทนค่าเดิม |
| `POST /__control/line/delay-next` | `{ endpoint, match?, ms, times?: 1 }` | หน่วงคำตอบ ใช้ทำให้เห็นสถานะ "กำลังส่ง" ได้แน่นอน |
| `POST /__control/line/content` | `{ messageId, data, contentType, preview?, previewContentType?: "image/jpeg", sendContentLength?: true }` (`data` และ `preview` เป็น base64) | ใส่ byte ที่ `content` และ `content/preview` ของ `messageId` นั้นตอบแทนกฎ prefix ในข้อ 4.4 ใส่ซ้ำแทนค่าเดิม |
| `GET /__control/line/requests` | query `endpoint?`, `to?`, `since?` | `{ "items": RecordedRequest[] }` ของ `line` และ `line-data` |
| `POST /__control/claude/next-reply` | `{ match?, kind?: "reply" \| "extract" \| "guard", json?, text?, stopReason?, model?, usage?, withThinkingBlock?, times?: 1 }` | คำตอบถัดไปที่ตรงเงื่อนไข `json` ถูกแปลงเป็นข้อความด้วย `JSON.stringify` ถ้าไม่ระบุ `kind` และ `json` มี property `allowed` ถือเป็น `guard` คำขอชนิด `guard` ใช้เฉพาะรายการชนิด `guard` และรายการชนิดอื่นไม่ถูกใช้กับคำขอ `guard` |
| `POST /__control/claude/fail-next` | `{ match?, endpoint?: "messages" \| "count_tokens", status, errorType, times?: 1 }` | คำขอถัดไปของ `endpoint` นั้น (ค่าเริ่มต้น `messages`) ที่ตรงเงื่อนไขได้ error ในรูป `{ type: "error", error: { type: errorType, message } }` |
| `POST /__control/claude/delay-next` | `{ match?, endpoint?: "messages" \| "count_tokens", ms, times?: 1 }` | หน่วงคำตอบของ `endpoint` นั้น (ค่าเริ่มต้น `messages`) ใช้ทดสอบ timeout ของการตอบแชท การแปลง และการคัดกรอง |
| `POST /__control/claude/count-tokens` | `{ value, times?: 1 }` | ค่าของ count_tokens ครั้งถัดไป (ทดสอบเกินเพดานคลัง) |
| `GET /__control/claude/requests` | query `match?`, `purpose?`, `since?` | `{ "items": RecordedRequest[] }` ของ `claude` `purpose` กรองตามชนิดในข้อ 5.3 (`guard`, `reply`, `extract`, `count_tokens` ค่าอื่นตอบ 400) |

`endpoint` คือชื่อในคอลัมน์แรกของตารางข้อ 4.2 และ 5.2 route ควบคุมของ Claude รับ `count_tokens` และ `count-tokens` เป็นชื่อเดียวกัน body ที่ไม่ใช่ JSON object หรือค่าที่ผิดรูปแบบตอบ 400 `{ "message": "stub control: ..." }`

`match`:

| บริการ | รูปแบบ | ตรงเมื่อ |
| --- | --- | --- |
| LINE | `{ to?: string; userId?: string; messageId?: string; replyToken?: string; channelId?: string }` | ทุก field ที่ให้มาตรงกับค่าในคำขอ (`to` ของ push, `chatId` ของ loading, `userId` ใน path ของ profile, `client_id` ของ `oauth-token`) |
| Claude | string | ข้อความนั้นอยู่ใน text ของ `user` turn สุดท้าย หรือในชื่อไฟล์หรือข้อความของ document (คำขอของการคัดกรองมีข้อความของลูกค้าใน `<message>` ของ user turn จึงตรงด้วยข้อความเดียวกัน) |

ลำดับการเลือก: รายการที่มี `match` และตรง ใช้ก่อนตามลำดับที่ใส่ (FIFO) รายการที่ไม่มี `match` ใช้เมื่อไม่มีรายการที่ตรง แต่ละรายการลด `times` ทีละหนึ่งและหายเมื่อเป็นศูนย์

### 6.1 การรันขนาน

- แต่ละ test สร้าง `userId`, ข้อความ และชื่อไฟล์ไม่ซ้ำกัน และใส่ `match` ทุกครั้งที่สั่ง stub จึงไม่ชนกับ test อื่น
- `POST /__control/reset` เรียกครั้งเดียวใน global setup ของ Playwright ห้ามเรียกระหว่าง test
- Test ที่แตะค่ารวมของระบบ (kill switch, คลังความรู้, งบต่อวัน, ขอบเขตหัวข้อ) อยู่ในไฟล์เดียว `e2e/global-state.serial.spec.ts` แบบ `mode: 'serial'` ซึ่งรันใน project `serial-desktop` แล้ว `serial-mobile` หลัง project อื่นจบ และคืนค่าเดิมเมื่อจบ ([project-setup](../architecture/project-setup.md#68-playwrightconfigts), [test-strategy](test-strategy.md))
- ไม่ทดสอบการจำกัดความถี่ของรหัสเข้าใช้ใน E2E เพราะทุก test มาจาก IP เดียวกัน กฎนี้ทดสอบใน unit ด้วยเวลาปลอม

## 7. Fixture ของ webhook

### 7.1 ที่อยู่และตัวแทนค่า

ไฟล์อยู่ใน `e2e/fixtures/line/` เป็นแม่แบบที่ยังไม่ใช่ JSON ที่ถูกต้องจนกว่าจะแทนค่า (เช่น `{{timestamp}}` ไม่มีเครื่องหมายคำพูด) ใช้ร่วมกันทั้ง unit test ของ schema, adapter test และ E2E ([test-strategy](test-strategy.md)) ค่าที่ต้องไม่ซ้ำระหว่าง test เขียนเป็นตัวแทน `{{ชื่อ}}` ซึ่ง helper แทนค่าก่อนเซ็น:

| ตัวแทน | ค่าที่ helper สร้าง |
| --- | --- |
| `{{destination}}` | `Ustub00000000000000000000000000000` |
| `{{userId}}` | `U` + hex 32 ตัวจาก UUID ใหม่ |
| `{{messageId}}`, `{{messageId2}}` | ตัวเลข 18 หลักไม่ซ้ำ นำหน้าด้วย prefix ตามชนิดสื่อเมื่อ fixture ระบุ เช่น `img{{messageId}}` |
| `{{webhookEventId}}`, `{{webhookEventId2}}`, `{{webhookEventId3}}` | ULID ใหม่ (ต้องยืนยันรูปแบบกับเอกสาร LINE แอปถือเป็น string ทึบ) |
| `{{replyToken}}` | hex 32 ตัว |
| `{{timestamp}}` | `Date.now()` เป็นมิลลิวินาที |
| `{{text}}` | ข้อความที่ test ส่งมา escape เป็น JSON string แล้ว |

### 7.2 รายการไฟล์

| ไฟล์ | เนื้อหา |
| --- | --- |
| `message-text.json` | หนึ่ง event ข้อความตัวอักษร |
| `message-image.json` | หนึ่ง event รูป `message.id` = `img{{messageId}}` |
| `message-video.json` | หนึ่ง event วิดีโอ `message.id` = `vid{{messageId}}` |
| `message-image-too-large.json` | รูป `message.id` = `bigimg{{messageId}}` |
| `message-image-gone.json` | รูป `message.id` = `gone{{messageId}}` |
| `message-sticker.json` | หนึ่ง event สติกเกอร์ |
| `message-audio.json` | หนึ่ง event เสียง |
| `message-file.json` | หนึ่ง event ไฟล์ |
| `message-location.json` | หนึ่ง event ตำแหน่ง |
| `follow.json` | ลูกค้าเพิ่มเพื่อน |
| `unfollow.json` | ลูกค้าเลิกติดตาม |
| `redelivery-duplicate.json` | event ข้อความเดียวกับ `message-text.json` ทุก field (`webhookEventId` และ `message.id` เดิม) แต่ `deliveryContext.isRedelivery: true` ใช้ส่งหลัง `message-text.json` ด้วยตัวแปรชุดเดียวกัน |
| `unknown-type.json` | หนึ่ง event `type: "futureEventType"` |
| `batch-with-malformed.json` | สาม event: ข้อความตัวอักษรที่ถูกต้อง, ข้อความที่ไม่มี `message.id`, สติกเกอร์ที่ถูกต้อง |
| `burst-three-texts.json` | สาม event ข้อความตัวอักษรของลูกค้าคนเดียว `timestamp` ห่างกัน 300ms ใช้ทดสอบการรวมข้อความ |

### 7.3 รูปแบบ JSON

Field ที่ระบบใช้และถูกตรวจเข้ม ([line-messaging](../specs/line-messaging.md) ข้อ 3): `events[].type`, `webhookEventId`, `timestamp`, `source.type`, `source.userId`, `replyToken`, `deliveryContext.isRedelivery`, `message.id`, `message.type`, `message.text`, `message.packageId`, `message.stickerId` field อื่นปล่อยผ่าน

โครงร่วม:

```json
{
  "destination": "{{destination}}",
  "events": [ /* event */ ]
}
```

Event ข้อความตัวอักษร (`message-text.json`):

```json
{
  "type": "message",
  "mode": "active",
  "timestamp": {{timestamp}},
  "source": { "type": "user", "userId": "{{userId}}" },
  "webhookEventId": "{{webhookEventId}}",
  "deliveryContext": { "isRedelivery": false },
  "replyToken": "{{replyToken}}",
  "message": {
    "id": "{{messageId}}",
    "type": "text",
    "quoteToken": "stub-quote-token",
    "text": {{text}}
  }
}
```

`message` ของชนิดอื่น (event ส่วนที่เหลือเหมือนข้างบน):

| ไฟล์ | `message` |
| --- | --- |
| `message-image.json` | `{ "id": "img{{messageId}}", "type": "image", "quoteToken": "stub-quote-token", "contentProvider": { "type": "line" } }` |
| `message-video.json` | `{ "id": "vid{{messageId}}", "type": "video", "quoteToken": "stub-quote-token", "duration": 3000, "contentProvider": { "type": "line" } }` |
| `message-sticker.json` | `{ "id": "{{messageId}}", "type": "sticker", "quoteToken": "stub-quote-token", "packageId": "446", "stickerId": "1988", "stickerResourceType": "STATIC", "keywords": ["happy"] }` |
| `message-audio.json` | `{ "id": "{{messageId}}", "type": "audio", "duration": 4000, "contentProvider": { "type": "line" } }` |
| `message-file.json` | `{ "id": "{{messageId}}", "type": "file", "fileName": "menu.xlsx", "fileSize": 2048 }` |
| `message-location.json` | `{ "id": "{{messageId}}", "type": "location", "title": "ร้านทดสอบ", "address": "ที่อยู่ปลอม", "latitude": 13.7, "longitude": 100.6 }` |

`follow.json`:

```json
{
  "type": "follow",
  "mode": "active",
  "timestamp": {{timestamp}},
  "source": { "type": "user", "userId": "{{userId}}" },
  "webhookEventId": "{{webhookEventId}}",
  "deliveryContext": { "isRedelivery": false },
  "replyToken": "{{replyToken}}",
  "follow": { "isUnblocked": false }
}
```

`unfollow.json`: เหมือน `follow.json` แต่ `"type": "unfollow"` และไม่มี `replyToken` กับ `follow`

`unknown-type.json`: โครงร่วมของ event โดย `"type": "futureEventType"` และ `"futureEventType": { "value": 1 }`

`batch-with-malformed.json`: event ที่หนึ่งเหมือน `message-text.json` (`{{webhookEventId}}`, `{{messageId}}`), event ที่สองเหมือน `message-text.json` แต่ `message` ไม่มี `id` (`{{webhookEventId2}}`), event ที่สามเหมือน `message-sticker.json` (`{{webhookEventId3}}`, `{{messageId2}}`) ผลที่ต้องได้: ตอบ 200 บันทึกสองข้อความ และ event ที่สองถูกข้ามพร้อม log

Field ที่ต้องยืนยันกับเอกสาร LINE: `mode`, `quoteToken`, `contentProvider`, `stickerResourceType`, `keywords`, `follow.isUnblocked`, field ของข้อความไฟล์และตำแหน่ง และรูปแบบของ `webhookEventId` แอปต้องไม่พึ่ง field เหล่านี้ยกเว้นที่อยู่ในรายการ field ที่ใช้ข้างบน

### 7.4 Helper สำหรับเซ็นและส่ง

ไฟล์ `e2e/helpers/line-webhook.ts` (ใช้ได้ทั้ง E2E และ adapter test):

```ts
type FixtureVars = {
  userId: string; messageId: string; messageId2: string;
  webhookEventId: string; webhookEventId2: string; webhookEventId3: string;
  replyToken: string; timestamp: number; text?: string;
};

function newFixtureVars(overrides?: Partial<FixtureVars>): FixtureVars;
function renderFixture(name: string, vars: FixtureVars): string;   // คืน raw body ที่จะส่ง
function signLineBody(rawBody: string, channelSecret: string): string;
// base64(HMAC-SHA256(channelSecret, rawBody)) ตาม header x-line-signature
function postLineWebhook(
  request: APIRequestContext,
  name: string,
  vars: FixtureVars,
  opts?: { signature?: string; channelSecret?: string },
): Promise<APIResponse>;
// POST /api/line/webhook, Content-Type: application/json, x-line-signature จาก signLineBody
// ค่า channelSecret เริ่มต้นจาก E2E_LINE_CHANNEL_SECRET
```

- `renderFixture` แทนตัวแทนแบบข้อความ แล้ว `JSON.parse` เพื่อยืนยันว่าเป็น JSON ถูกต้อง แต่ส่งข้อความเดิมที่แทนแล้ว เพราะ signature คิดจาก byte ที่ส่งจริง
- `opts.signature` ใช้ทดสอบ signature ผิด (คาดว่าได้ 401)

ไฟล์ของ E2E ทั้งหมด:

| ไฟล์ | เนื้อหา | Project |
| --- | --- | --- |
| `e2e/global.setup.ts` | reset stub แล้วเข้าระบบครั้งเดียว เก็บ storage state | `setup` |
| `e2e/receive-message.spec.ts` | เส้นที่ 1 | `desktop`, `mobile` |
| `e2e/admin-reply.spec.ts` | เส้นที่ 2 | `desktop`, `mobile` |
| `e2e/send-media.spec.ts` | เส้นที่ 5 | `desktop`, `mobile` |
| `e2e/send-failure.spec.ts` | เส้นที่ 7 | `desktop`, `mobile` |
| `e2e/access-gate.spec.ts` | เส้นที่ 8 | `desktop`, `mobile` |
| `e2e/global-state.serial.spec.ts` | เส้นที่ 3, 4, 6 และ 9 | `serial-desktop`, `serial-mobile` |
| `e2e/helpers/line-webhook.unit.ts`, `e2e/ai-eval.unit.ts` | unit test ของ helper ของ webhook และของ `scripts/ai-eval.logic.ts` รันในชุด `unit` ของ Vitest ไม่ใช่ Playwright | |

Helper อื่นใน `e2e/helpers/`:

| ไฟล์ | Function |
| --- | --- |
| `stub.ts` | `stubBaseUrl()` (ค่าของ `E2E_STUB_URL`), `stubReset()`, `stubLineProfile(p)`, `stubLineFailNext(o)`, `stubLineDelayNext(o)`, `stubLineContent(c)` (`data` และ `preview` เป็น `Uint8Array` helper แปลงเป็น base64), `stubLineRequests(q)`, `stubClaudeNextReply(o)`, `stubClaudeFailNext(o)` และ `stubClaudeDelayNext(o)` (`o.endpoint` เป็น `messages` หรือ `count_tokens`), `stubClaudeCountTokens(o)`, `stubClaudeRequests(q)` (`q` รับ `purpose` ด้วย) เรียก route ข้อ 6 ที่ `E2E_STUB_URL` (ค่าเริ่มต้น `http://localhost:4010`) |
| `auth.ts` | `AUTH_STATE_PATH` (`e2e/.auth/state.json` ที่ `global.setup.ts` เขียน), `e2eAccessCode()` (`E2E_ACCESS_CODE` หรือค่าของ compose) และ `loginByApi(context)`: `POST /api/access/unlock` ด้วย `E2E_ACCESS_CODE` และ header `Origin` เท่ากับ `baseURL` ของ Playwright (ซึ่งเท่ากับ `APP_BASE_URL` ใน compose) แล้วเก็บ cookie ใน context |
| `contact.ts` | `createContactWithMessage(request, { displayName, text, overrides? })`: ลงทะเบียนโปรไฟล์ (ไม่มีรูป), ส่ง `follow.json` แล้ว `message-text.json` คืน `FixtureVars` ของ event ข้อความ (`replyToken`, `messageId`, `webhookEventId` ของข้อความนั้น ซึ่ง `redelivery-duplicate.json` ใช้ซ้ำได้) `overrides` เช่น `{ replyToken: "expired-…" }` และ `nextEventVars(v, overrides?)`: id และ reply token ใหม่ของ event ถัดไปจากลูกค้าคนเดิม |
| `wait.ts` | `waitAiIdle(request, contactId)`: poll `GET /api/contacts/:id` จน `aiReplying` เป็น false และนานกว่า `AI_DEBOUNCE_MS` ของ compose ใช้ก่อนยืนยันว่า "AI ไม่ได้ถูกเรียก" |
| `axe.ts` | `expectNoA11yViolations(page)` ด้วย `@axe-core/playwright` |
| `test-ids.ts` | re-export จาก `src/common/test-ids.ts` ([ui-screens](../specs/ui-screens.md) ข้อ 11) |
| `test.ts` | `test` และ `expect` ที่ทุกเส้นใช้: fixture อัตโนมัติที่ทำให้ test ตกเมื่อหน้าเว็บมี console error, page error หรือ CSP violation ยกเว้นบรรทัดที่ test อนุญาตด้วย `consoleErrors.allow(failedResourceLine(status))` สำหรับ status ที่เส้นนั้นตั้งใจทำให้เกิด (เช่น 401 ของรหัสผิด 409 ของไฟล์ซ้ำ) และตอบ URL ของ CDN สติกเกอร์ของ LINE (`stickershop.line-scdn.net`) ด้วย `e2e/fixtures/media/tiny.png` เพราะ E2E ไม่เรียกบริการภายนอกจริง |
| `copy.ts` | `uiCopy(key, vars?)`: ถ้อยคำตาม key ของ [ui-copy](../specs/ui-copy.md) อ่านจากตารางในเอกสารนั้น เพราะกฎ boundary ของ lint ไม่ให้ `e2e/` import `src/features/*/*.constants.ts` และ `src/common/*.constants.ts` ข้อความที่มาจาก domain (`handoffText`, `DEFAULT_GUARD_REFUSAL_TEXT`) import จาก `src/core/domain` |
| `inbox.ts` | `row`, `bubbles`, `bubbleBlock` (ฟองพร้อมผู้ส่ง เวลา และบรรทัดสถานะการส่ง), `systemLine`, `openChat`, `backToList`, `showInfoPanel`, `hideInfoPanel`, `sendText`, `toastWith(page, text, tone?)` (toast ที่มี `data-testid="toast"` และข้อความนั้น `tone` กรองด้วย `data-type` ตาม [ui-screens](../specs/ui-screens.md#10-toast)), `uniqueSuffix` |
| `settings.ts` | `getSettings`, `patchSettings`, `listKbDocuments`, `deleteKbDocument` ผ่าน API ใช้เฉพาะอ่านค่าเดิมและคืนค่ารวมของระบบใน `afterEach` และ `finally` ของไฟล์ serial |

## 8. ไฟล์สื่อและ PDF สำหรับทดสอบ

ไฟล์เล็กที่สร้างขึ้นเอง ไม่มีเนื้อหาจริง เก็บใน repo สร้างครั้งเดียวด้วย `scripts/generate-fixtures.sh` ซึ่งต้องใช้ `ffmpeg` และ ImageMagick ในเครื่องของคนสร้างเท่านั้น CI ใช้ไฟล์ที่ commit แล้ว

| ไฟล์ | ลักษณะ | สร้างด้วย |
| --- | --- | --- |
| `e2e/fixtures/media/tiny.jpg` | 64×64 สีพื้น `#F0055A` ราว 1 KB | `magick -size 64x64 xc:#F0055A tiny.jpg` |
| `e2e/fixtures/media/tiny.png` | 64×64 สีพื้น `#191327` | `magick` |
| `e2e/fixtures/media/tiny.webp` | 64×64 | `magick` |
| `e2e/fixtures/media/tiny.heic` | 64×64 (สร้างได้เมื่อ ImageMagick มี libheif ถ้าไม่มี ข้ามไฟล์นี้และ test ที่ใช้) | `magick` |
| `e2e/fixtures/media/tiny.mp4` | 1 วินาที 160×120 ภาพทดสอบ H.264 ไม่มีเสียง ราว 10 KB | `ffmpeg -f lavfi -i testsrc=size=160x120:rate=10 -t 1 -c:v libx264 -pix_fmt yuv420p -movflags +faststart tiny.mp4` |
| `e2e/fixtures/media/tiny.mov` | เหมือน mp4 แต่ container เป็น QuickTime | `ffmpeg ... -f mov tiny.mov` |
| `e2e/fixtures/media/fake.jpg` | ข้อความ `not an image` ที่ตั้งชื่อเป็น .jpg | `echo` |
| `e2e/fixtures/kb/tiny.pdf` | 1 หน้า ข้อความภาษาอังกฤษ `Tonhom Cafe test file` | Playwright `page.pdf()` จาก HTML หนึ่งบรรทัด |
| `e2e/fixtures/kb/tiny-copy.pdf` | ไม่มีไฟล์แยก test อัปโหลด `tiny.pdf` ซ้ำเพื่อทดสอบไฟล์ซ้ำ | |
| `e2e/fixtures/kb/not-a-pdf.pdf` | ข้อความ `not a pdf` | `echo` |
| `e2e/fixtures/kb/tonhom-cafe.pdf` | เนื้อหาจาก [ai-prompt](../specs/ai-prompt.md) ข้อ 8.2 ใช้กับชุดคำถามวัดคุณภาพเท่านั้น | Playwright `page.pdf()` จาก HTML ที่ใช้ฟอนต์ LINE Seed Sans TH |

ไฟล์ขนาดใหญ่ไม่ commit: test สร้าง buffer ในหน่วยความจำ เช่น 11 MB ที่ขึ้นต้นด้วย byte ของ JPEG หรือ 5 MB ที่ขึ้นต้นด้วย `%PDF-` แล้วส่งด้วย `setInputFiles({ name, mimeType, buffer })`

ไฟล์ที่ stub ส่งคืนถูกคัดลอกเข้า `stubs/assets/` โดย `scripts/generate-fixtures.sh` และ commit ไว้ (`tiny.jpg`, `tiny.mp4`, `avatar.png` = `tiny.png`, `oa.png` = `tiny.png`)

## 9. ขั้นตอนของ E2E

ทุกเส้นรันที่ความกว้าง 1280 และ 390 ([test-strategy](test-strategy.md)) ทุกขั้นที่ต้องรอใช้ `expect(...).toBeVisible()` หรือ `expect.poll` ห้ามใช้ `waitForTimeout` testid อ้างตาม [ui-screens](../specs/ui-screens.md) ข้อ 11 ข้อความภาษาไทยที่ใช้ตรวจมาจาก [ui-copy](../specs/ui-copy.md) ผ่าน constant ไม่พิมพ์ซ้ำใน test

ที่ความกว้าง 390 การเปิดแชทคือกด `contact-row` แล้วรอ `thread` และกลับด้วย `thread-back` ขั้นที่ใช้ `info-*` ต้องกด `thread-info-toggle` ก่อน

`row(name)` ในขั้นตอนด้านล่างหมายถึง `getByTestId("contact-row").filter({ hasText: name })`

### เส้นที่ 1: รับข้อความ

ไฟล์ `e2e/receive-message.spec.ts` project `desktop` และ `mobile`

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 1.1 | `loginByApi`, `v = newFixtureVars()`, `stubLineProfile({ userId: v.userId, displayName: "ลูกค้าทดสอบ " + suffix })` | |
| 1.2 | `postLineWebhook("follow.json", v)` | status 200 |
| 1.3 | `postLineWebhook("message-text.json", { ...v, text: "สวัสดี " + suffix })` | status 200 |
| 1.4 | เปิด `/chats` | `row(name)` มองเห็น, `contact-row-preview` มีข้อความที่ส่ง, `contact-row-unread` เป็น `1`, `data-unread="true"`, `nav-inbox-unread` มองเห็น |
| 1.5 | กด `row(name)` | URL เป็น `/chats/<id>`, `thread-name` เป็นชื่อลูกค้า, `message-bubble[data-author="customer"]` มีข้อความที่ส่ง |
| 1.6 | | `row(name)` มี `data-unread="false"` |
| 1.7 | `postLineWebhook("redelivery-duplicate.json", sameVars)` | status 200 และหลัง `postLineWebhook("message-text.json", newText)` ข้อความใหม่ปรากฏ แล้ว `message-bubble` ที่มีข้อความเดิมยังมีหนึ่งอัน |
| 1.8 | `postLineWebhook("batch-with-malformed.json", v2)` | status 200, ข้อความตัวอักษรและ `message-bubble[data-type="sticker"]` ปรากฏ |
| 1.9 | `postLineWebhook("unknown-type.json", v3)` | status 200 และรายชื่อไม่เปลี่ยน |
| 1.10 | `postLineWebhook("message-text.json", v4, { signature: "invalid" })` | status 401 |
| 1.11 | ส่ง `message-image.json` | `message-bubble[data-type="image"]` ได้ `data-media-status="ready"` และมี `<img>` |
| 1.12 | ส่ง `message-image-gone.json` | `data-media-status="failed"` และมีข้อความ `inbox.media.imageFailed` |
| 1.13 | `expectNoA11yViolations(page)` | ไม่มี violation |

### เส้นที่ 2: แอดมินตอบ

ไฟล์ `e2e/admin-reply.spec.ts` project `desktop` และ `mobile`

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 2.1 | `createContactWithMessage` เปิดแชท | `composer-input` ใช้ได้ |
| 2.2 | `stubLineDelayNext({ endpoint: "reply", match: { replyToken: v.replyToken }, ms: 1500 })` | |
| 2.3 | พิมพ์ `ตอบจากแอดมิน <suffix>` ใน `composer-input` | `stubLineRequests({ endpoint: "loading" })` มีคำขอที่ `chatId` เท่ากับ `v.userId` |
| 2.4 | กด Enter | `message-bubble[data-author="admin"]` ปรากฏทันทีด้วย `data-status="pending"` และ `composer-input` ว่าง |
| 2.5 | | `data-status="sent"`, `message-sender` เป็น `inbox.message.senderYou` |
| 2.6 | `stubLineRequests({ endpoint: "reply" })` | มีหนึ่งคำขอที่ `replyToken` เท่ากับ `v.replyToken` และ `messages[0]` เป็น `{ type: "text", text: <ข้อความ> }` |
| 2.7 | ส่งข้อความที่สอง | `stubLineRequests({ endpoint: "push", to: v.userId })` มีหนึ่งคำขอ, `xLineRetryKey` เป็น UUID version 5 |
| 2.8 | กลับไปรายชื่อ | `contact-row-preview` ขึ้นต้นด้วย `inbox.preview.you` |
| 2.9 | พิมพ์ข้อความแล้วกด Shift+Enter | ช่องพิมพ์มีสองบรรทัด ยังไม่ส่ง |
| 2.10 | `postLineWebhook("unfollow.json", v)` | `composer-disabled-reason` มองเห็น, `composer-input` disabled, `row(name)` มี `data-follow="unfollowed"` |

### เส้นที่ 3: AI ตอบแทน

`test.describe("เส้นที่ 3")` ในไฟล์ `e2e/global-state.serial.spec.ts` project `serial-desktop` และ `serial-mobile` (ต้องการ kill switch เปิด)

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 3.1 | `createContactWithMessage` เปิดแชท | `thread-ai-switch` มี `aria-checked="false"` (ลูกค้าใหม่เริ่มปิด) |
| 3.2 | กด `thread-ai-switch` | `aria-checked="true"`, `thread-subline` มี `inbox.thread.aiHelping` |
| 3.3 | `stubClaudeNextReply({ match: q, json: { reply: "ร้านเปิด 08:00 ถึง 18:00 ค่ะ", needsAdmin: false, handoffReason: null } })` โดย `q = "ร้านเปิดกี่โมง " + suffix` | |
| 3.4 | `postLineWebhook("message-text.json", { ...v2, text: q })` (ลูกค้าเดิม event ใหม่) | `message-bubble[data-author="ai"]` มีข้อความที่สั่งไว้, `message-sender` เป็น `inbox.message.senderAi` |
| 3.5 | `stubClaudeRequests({ match: q })` | หนึ่งคำขอ, `body.output_config.effort` เป็น `"low"`, `system[1].text` ขึ้นต้นด้วย `<knowledge>`, `messages` turn สุดท้ายก่อนข้อความระบบเป็น `user` ที่มี `q` |
| 3.6 | `stubLineRequests` ของ `reply` หรือ `push` ถึง `v.userId` | มีข้อความของ AI |
| 3.7 | `stubClaudeNextReply({ match: q2, json: { reply: "เรื่องนี้ขอให้แอดมินมาตอบนะคะ", needsAdmin: true, handoffReason: "not_in_knowledge" } })` แล้วส่ง `q2` | `message-bubble[data-author="ai"]` ใหม่มีข้อความ "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ" (ไม่ใช่ `reply` ที่สั่งไว้), `system-line[data-event-code="handoff.ai_not_in_knowledge"]` มองเห็นใต้ฟองนั้น, `contact-tab-needs-admin` มีจำนวนอย่างน้อย 1, `row(name)` มี `data-needs-admin="true"` |
| 3.8 | `postLineWebhook("burst-three-texts.json", v3)` พร้อม `stubClaudeNextReply({ match: lastText })` | เมื่อ `waitAiIdle` แล้ว `stubClaudeRequests` ที่มีข้อความชุดนี้มีหนึ่งคำขอ และ turn สุดท้ายมีทั้งสามข้อความรวมกัน |
| 3.9 | แอดมินส่งข้อความเอง | `thread-ai-switch` เป็น `aria-checked="false"`, `info-ai-note` เป็น `inbox.ai.noteOff`, `system-line[data-event-code="ai.turned_off_by_admin"]` มองเห็น และ `row(name)` มี `data-needs-admin="false"` |
| 3.10 | ลูกค้าส่ง `q3` แล้ว `waitAiIdle` | `stubClaudeRequests({ match: q3 })` ว่าง |
| 3.11 | ส่ง `message-image.json` หลังเปิดสวิตช์อีกครั้ง | `system-line[data-event-code="handoff.customer_sent_image"]` มองเห็น |
| 3.12 | หน้าตั้งค่า ส่วนค่าใช้จ่าย AI | `usage-row` ของลูกค้ามีราคาเท่ากับผลรวมของคำตอบที่ stub ตอบ ($0.0064 ต่อครั้งของ Opus 5.5) |

### เส้นที่ 4: Kill switch และ Channel ID

`test.describe("เส้นที่ 4")` ในไฟล์ `e2e/global-state.serial.spec.ts` project `serial-desktop` และ `serial-mobile`

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 4.1 | สร้างลูกค้า เปิดสวิตช์ AI ของลูกค้า | `thread-ai-switch` `aria-checked="true"` |
| 4.2 | เปิด `/settings` กด `settings-kill-switch` | `aria-checked="false"` และ toast `settings.ai.killSwitchOffToast` |
| 4.3 | เปิดแชทของลูกค้า | `thread-ai-switch` disabled และ `aria-checked="false"`, `thread-ai-label` เป็น `inbox.ai.labelKilled`, `info-ai-switch` disabled, `info-ai-note` เป็น `inbox.ai.noteKilled` |
| 4.4 | ลูกค้าส่ง `q` แล้ว `waitAiIdle` | `stubClaudeRequests({ match: q })` ว่าง |
| 4.5 | กลับหน้าตั้งค่า เปิด `settings-kill-switch` | |
| 4.6 | เปิดแชทเดิม | `thread-ai-switch` enabled และ `aria-checked="true"` (ค่าเดิมกลับมา) |
| 4.7 | เปิด `/settings` ส่วน LINE ใส่ `12ab` ใน `line-channel-id` แล้วกด `line-save` จากนั้นใส่ `STUB_CHANNEL_ID`, `STUB_CHANNEL_SECRET` และ `STUB_CHANNEL_ACCESS_TOKEN` แล้วกด `line-save` และโหลดหน้าใหม่ | ก่อนแก้ `line-channel-id` เป็น `STUB_CHANNEL_ID` ของ seed และ `line-secret-status` `data-status="verified"`, ค่าผิดได้ `settings.line.error.channelIdInvalid` (`{max}` = `LINE_CHANNEL_ID_MAX_CHARS`) โดยไม่มีคำขอ, บันทึกได้ toast `settings.line.savedToast` และ stub มีคำขอ `oauth-token` หนึ่งครั้งที่ตอบ 200, หลังโหลดใหม่ `line-channel-id` ยังเป็นค่าเดิม ช่อง secret และ token ว่าง และ `line-secret-status` เป็น `verified` |
| 4.8 | finally | kill switch เปิดอยู่ |

### เส้นที่ 5: ส่งรูป

ไฟล์ `e2e/send-media.spec.ts` project `desktop` และ `mobile`

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 5.1 | สร้างลูกค้า เปิดแชท | |
| 5.2 | `setInputFiles` ของ `composer-file-input` ด้วย `tiny.jpg` | `attachment-tray` ผ่าน `data-state` เป็น `ready`, `attachment-preview` มีรูป |
| 5.3 | กด `composer-send` | `message-bubble[data-type="image"]` ได้ `data-status="sent"`, `attachment-tray` หาย |
| 5.4 | `stubLineRequests` ของ `reply` หรือ `push` ถึง `v.userId` | `messages[0].type` เป็น `image`, มี `originalContentUrl` และ `previewImageUrl` ที่ต่างกัน และ `GET` ทั้งสอง URL ได้ 200 กับ `image/jpeg` |
| 5.5 | แนบ `tiny.mov` | `attachment-tray` มี `data-state="rejected"`, `attachment-status` มี `data-code="mov_not_supported"`, ไม่มีคำขอ `POST /api/uploads` |
| 5.6 | แนบ buffer 11 MB ที่ขึ้นต้นด้วย JPEG | `data-code="image_too_large"` |
| 5.7 | แนบ `fake.jpg` | `data-code="unsupported_type"` |
| 5.8 | แนบ `tiny.webp` | `data-state="ready"` และ request ขออัปโหลดมี `contentType: "image/jpeg"` |
| 5.9 | แนบ `tiny.jpg` รอ `ready` กด `attachment-cancel` | tray หาย และ `page.waitForRequest` เห็น `DELETE /api/uploads/:uploadId` (uploadId จริงของ ticket) |
| 5.10 | แนบ `tiny.mp4` แล้วส่ง | `message-bubble[data-type="video"]` ได้ `data-status="sent"` และ stub ได้ `type: "video"` |
| 5.11 | แนบ `tiny.heic` (ข้ามขั้นนี้เมื่อไม่มีไฟล์ ตามข้อ 8) | `data-state="ready"`, request ขออัปโหลดมี `contentType: "image/jpeg"` และ `page.on("request")` เห็นการโหลด chunk ของ `heic-to` หลังเลือกไฟล์เท่านั้น ไม่ใช่ตอนเปิดหน้า |

### เส้นที่ 6: คลังความรู้

`test.describe("เส้นที่ 6")` ในไฟล์ `e2e/global-state.serial.spec.ts` project `serial-desktop` และ `serial-mobile`

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 6.1 | `marker = "KB-MARKER-" + suffix`, `stubClaudeNextReply({ kind: "extract", text: "Tonhom Cafe\n" + marker })` และ `stubClaudeDelayNext({ ms: 1500 })` (ไม่ใส่ `match` เพราะคำขอแปลง PDF มีแต่ byte ของ PDF ไม่มีชื่อไฟล์ตาม [ai-prompt ข้อ 7](../specs/ai-prompt.md#7-prompt-ของการแปลง-pdf) และไฟล์ serial รันทีละเส้น การแปลงครั้งถัดไปจึงเป็นของขั้นนี้) | |
| 6.2 | เปิด `/settings` `setInputFiles` ของ `kb-upload-input` ด้วย `tiny.pdf` | `kb-row[data-file-name="tiny.pdf"]` ปรากฏ `data-status="processing"` แล้วเป็น `ready` |
| 6.3 | | `kb-usage-text` เปลี่ยนจากก่อนอัปโหลด |
| 6.4 | กด `kb-row-view` | `kb-text-dialog` มองเห็น, `kb-text-content` มี `marker` กด `kb-text-close` แล้ว focus กลับที่ `kb-row-view` |
| 6.5 | อัปโหลด `tiny.pdf` ซ้ำ | `kb-upload-error` มีรหัสไฟล์ซ้ำจาก [error-catalog](../architecture/error-catalog.md) และตารางยังมีแถวเดียว |
| 6.6 | อัปโหลด `not-a-pdf.pdf` | `kb-upload-error[data-code="not_pdf"]` และไม่มีคำขอ `POST /api/knowledge/documents` |
| 6.7 | สร้างลูกค้า เปิด AI ของลูกค้า ส่งคำถาม `q` | `stubClaudeRequests({ match: q })` มีคำขอที่ `system[1].text` มี `<document name="tiny.pdf">` และ `marker` |
| 6.8 | กด `kb-row-delete` | `kb-delete-dialog` มองเห็น focus อยู่ที่ `kb-delete-cancel` |
| 6.9 | กด `kb-delete-confirm` | แถวหาย, toast `settings.kb.deletedToast` และ `kb-delete-dialog` ออกจาก DOM (หลัง animation ปิด Radix จึงเอา `aria-hidden` ออกจากส่วนอื่นของหน้า ข้อ 6.11 จึงไม่เจอ `aria-hidden-focus`) |
| 6.10 | `stubClaudeCountTokens({ value: 60000 })` แล้วอัปโหลด `tiny.pdf` | แถวไม่ถูกเพิ่มเป็น `ready` และมีข้อความเกินเพดานจาก error catalog |
| 6.11 | `expectNoA11yViolations(page)` บนหน้าตั้งค่า | ไม่มี violation |

### เส้นที่ 7: ส่งไม่สำเร็จ

ไฟล์ `e2e/send-failure.spec.ts` project `desktop` และ `mobile`

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 7.1 | สร้างลูกค้าด้วย `replyToken = "expired-" + hex` | |
| 7.2 | `stubLineFailNext({ endpoint: "push", match: { to: v.userId }, status: 400, body: { message: "stub failure" } })` | |
| 7.3 | ส่งข้อความ `m` | `message-bubble` ของ `m` ได้ `data-status="failed"`, `message-error` มองเห็นและมี `data-code`, `message-retry` มองเห็น |
| 7.4 | `stubLineRequests({ endpoint: "push", to: v.userId })` | หนึ่งคำขอ เก็บ `xLineRetryKey` เป็น `k` ซึ่งเท่ากับ `lineRetryKeyOf(data-message-id)` (UUID version 5 จาก SHA-256 ของ id ใน `e2e/helpers/stub.ts` เขียนแยกจาก adapter) และไม่เท่ากับ id |
| 7.5 | กด `message-retry` | `data-status` เป็น `pending` แล้ว `sent` |
| 7.6 | `stubLineRequests({ endpoint: "push", to: v.userId })` | สองคำขอ และทั้งคู่มี `xLineRetryKey` เท่ากับ `k` |
| 7.7 | `stubLineFailNext({ endpoint: "push", match: { to: v.userId }, status: 409, headers: { "x-line-accepted-request-id": "stub-req-1" } })` แล้วส่งข้อความ | `data-status="sent"` (409 จาก retry key ซ้ำถือว่าสำเร็จ) |
| 7.8 | `stubLineFailNext({ endpoint: "push", match: { to: v.userId }, status: 429, times: 5 })` แล้วส่งข้อความ | `data-status="failed"` หลังแอป retry ครบ และ `message-error` มีรหัสโควตาหรือจำกัดความถี่ตาม error catalog |
| 7.9 | Refresh หน้า | ข้อความที่ส่งไม่สำเร็จยังแสดงเป็น `failed` พร้อมปุ่มส่งอีกครั้ง |

### เส้นที่ 8: รหัสเข้าใช้

ไฟล์ `e2e/access-gate.spec.ts` project `desktop` และ `mobile` ใช้ context ใหม่ที่ไม่มี cookie

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 8.1 | เปิด `/chats` | `welcome-cover` มองเห็น, `app-rail` ไม่มี |
| 8.2 | กด `access-submit` โดยช่องว่าง | `access-error` เป็น `access.error.empty` และไม่มีคำขอ `POST /api/access/unlock` |
| 8.3 | กรอก `wrong-code` กด Enter | `access-error` มี `data-code` ของรหัสผิดตาม error catalog และ `access-code-input` ยังมีค่า `wrong-code` |
| 8.4 | กด `access-code-toggle` | `access-code-input` เป็น `type="text"` และ `aria-pressed="true"` |
| 8.5 | กรอก `E2E_ACCESS_CODE` กด `access-submit` | `app-rail` มองเห็น URL ยังเป็น `/chats` |
| 8.6 | `request.get("/api/contacts")` จาก context ใหม่ไม่มี cookie | status 401 |
| 8.7 | `request.post("/api/contacts/x/messages")` มี cookie แต่ `Origin` เป็นเว็บอื่น | status 403 |
| 8.8 | กด `nav-logout` | `welcome-cover` มองเห็น |
| 8.9 | เปิด `/settings` | `welcome-cover` มองเห็น |
| 8.10 | `expectNoA11yViolations(page)` บนหน้ายินดีต้อนรับ | ไม่มี violation (สีตัวอักษรไล่สีของบรรทัด "application" เป็นข้อความตกแต่ง ถ้า axe รายงานเป็น "needs review" ให้บันทึก ไม่ถือว่าตก) |

รหัส status 403 ของขั้น 8.7 ต้องตรงกับ [error-catalog](../architecture/error-catalog.md)

### เส้นที่ 9: ขอบเขตหัวข้อ

`test.describe("เส้นที่ 9")` ในไฟล์ `e2e/global-state.serial.spec.ts` project `serial-desktop` และ `serial-mobile` (แตะค่ารวมของระบบ ต้องการ kill switch เปิด) ข้อความปฏิเสธใช้ค่าที่บันทึกไว้ (seed ใช้ค่าเริ่มต้น `DEFAULT_GUARD_REFUSAL_TEXT`)

| ขั้น | ทำ | ตรวจ |
| --- | --- | --- |
| 9.1 | เปิด `/settings` อ่านค่าเดิมของ `guard-topics` และ `guard-blocked-today` เก็บเป็น `before` (ค่าอาจไม่เป็น 0 เพราะ project อื่นรันก่อน) | `settings-section-guard` อยู่ถัดจาก `settings-section-ai` |
| 9.2 | กรอก `guard-topics` เป็นสองบรรทัด `มุกตลกไทย` และ `มุกจากภาพยนตร์` กด `guard-topics-save` แล้วกด `guard-switch` | `guard-topics-counter` แสดง 2 และ `guard-switch` มี `aria-checked="true"` |
| 9.3 | `createContactWithMessage` เปิดสวิตช์ AI ของลูกค้า แล้ว `stubClaudeNextReply({ match: qa, kind: "guard", json: { allowed: true, matchedTopic: "มุกตลกไทย" } })` และ `stubClaudeNextReply({ match: qa, kind: "reply", json: { reply: "มุกทดสอบ " + suffix, needsAdmin: false, handoffReason: null } })` โดย `qa = "เล่ามุกหน่อย " + suffix` | |
| 9.4 | ส่ง `qa` | `message-bubble[data-author="ai"]` มี `"มุกทดสอบ " + suffix`, `stubClaudeRequests({ match: qa, purpose: "guard" })` มีหนึ่งคำขอที่ `body.model` เป็น `GUARD_MODEL` และ `stubClaudeRequests({ match: qa, purpose: "reply" })` มีหนึ่งคำขอที่ `system[0].text` มี `<topic_guard>` |
| 9.5 | `stubClaudeNextReply({ match: qb, json: { allowed: false, matchedTopic: null } })` โดย `qb = "ร้านเปิดกี่โมง " + suffix` แล้วส่ง `qb` | `stubLineRequests` ของ `reply` หรือ `push` ถึง `v.userId` มีข้อความเท่ากับข้อความปฏิเสธที่บันทึกไว้, `message-bubble[data-author="ai"]` ใหม่มีข้อความนั้นและ `message-sender` เป็น `inbox.message.senderAi`, `system-line[data-event-code="guard.blocked"]` มองเห็นใต้ฟองนั้น |
| 9.6 | `waitAiIdle` | `stubClaudeRequests({ match: qb, purpose: "reply" })` ว่าง, `row(name)` มี `data-needs-admin="false"` และ `thread-ai-switch` ยังเป็น `aria-checked="true"` |
| 9.7 | เปิด `/settings` | `guard-blocked-today` แสดงค่า `before` + 1 |
| 9.8 | finally: ปิด `guard-switch` และคืน `guard-topics` เป็นค่าเดิมแล้วบันทึก | `guard-switch` `aria-checked="false"` ขอบเขตหัวข้อปิดก่อนเส้นอื่นของไฟล์นี้ |

ข้อ 9.7 ตรวจ "เพิ่มขึ้นหนึ่ง" แทน "เป็น 1" เพราะตัวนับเป็นยอดของทั้งวันและเส้นนี้รันทั้งใน `serial-desktop` และ `serial-mobile`
