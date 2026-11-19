# Backend

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

ภาพรวมของฝั่ง server: โครงโฟลเดอร์ หลักการ และรายชื่อ port, use case และ endpoint รายละเอียดอยู่ในเอกสารเจ้าของแต่ละเรื่อง ไฟล์นี้ไม่เขียนซ้ำ

| เรื่อง | เอกสารเจ้าของ |
| --- | --- |
| Type ของ domain, ลายเซ็นและความหมายของ port | [domain-and-ports](domain-and-ports.md) |
| ขั้นตอนและรายการ test ของ use case | [use-cases](use-cases.md) |
| Endpoint, DTO, รูปแบบ error, protocol ของ polling | [api-contract](api-contract.md) |
| รหัส error และข้อความไทย | [error-catalog](error-catalog.md) |
| ตาราง, Prisma schema, migration, seed | [data-model](data-model.md) |
| Dependency, config, Docker, CI และค่าคงที่ทุกตัว รวมค่าจำกัดความถี่ | [project-setup](project-setup.md) |

## โครงโฟลเดอร์

```
src/
  core/
    domain/        entity และกฎล้วน ๆ
    ports/         interface ทั้งหมด
    use-cases/     หนึ่งไฟล์ต่อหนึ่งการกระทำ
  adapters/
    line/  claude/  prisma/  blob/  local-storage/  system/  fakes/
  contracts/       schema ของ API ที่ route และหน้าเว็บใช้ร่วมกัน
  composition/     ประกอบ use case กับ adapter จริง (ที่เดียว)
  features/        หน้าจอ ดู frontend.md
app/
  api/             route handler บาง ๆ
  (หน้าเว็บ)
```

กฎการ import และหน้าที่ของแต่ละชั้นอยู่ใน [code-style](../guidelines/code-style.md) และกฎ lint ที่บังคับอยู่ใน [project-setup](project-setup.md#63-eslintconfigmjs)

## หลักการ

- แกนกลาง (`core/`) รู้จักแค่ port ที่ตัวเองประกาศ ไม่รู้จัก Next.js, Prisma, LINE หรือ Claude ([ADR 0003](../adr/0003-hexagonal-architecture.md))
- Route handler ตรวจ request ด้วย schema ใน `src/contracts/` เรียก use case หนึ่งตัว แล้วแปลงผลเป็น response
- ความล้มเหลวที่คาดได้คืนเป็น `Result` ไม่ throw ส่วนที่ไม่คาดคิดถูกดักที่ขอบของ route แล้วตอบ 500
- Webhook ตอบ 200 เมื่อ signature ถูกต้อง ยกเว้นเมื่อบันทึก event ใดในก้อนไม่ได้เลยเพราะฐานข้อมูลล่ม ซึ่งตอบ 503 ให้ LINE ส่งซ้ำ ([line-messaging](../specs/line-messaging.md#รับ-event-webhook) ข้อ 6) ประมวลผลแต่ละ event แยกกัน และงานหลังตอบ (`after()`) ถูกห่อด้วยตัวดัก error กลางที่บันทึก log และใส่สถานะในฐานข้อมูล
- ทุกการเรียกภายนอกมี timeout และ retry เฉพาะเครือข่ายล่ม, 5xx และ 429 ตามค่าใน [project-setup](project-setup.md#104-adapter-และ-route)
- ทุกความล้มเหลวที่แอดมินต้องรู้มีสถานะในฐานข้อมูล ไม่พึ่ง log อย่างเดียว ([ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md))
- Log เป็น JSON ทาง stdout รับเฉพาะ field ที่อนุญาตตาม port `Logger` ใน [domain-and-ports](domain-and-ports.md#logger)
- การจำกัดความถี่ใช้ตาราง `RateLimitBucket` ใน Postgres ค่าจำกัดอยู่ใน [project-setup](project-setup.md#102-การจำกัดความถี่) ที่เดียว ส่วน endpoint ที่ใช้แต่ละค่าอยู่ใน [api-contract](api-contract.md#การจำกัดความถี่)
- การเปลี่ยนผู้ให้บริการ AI ทำโดยเขียน adapter ของ `ChatModel`, `DocumentExtractor` และ `TopicGuard` เพิ่ม ([ADR 0007](../adr/0007-ai-provider-port-and-default-model.md))

## Port

รายชื่อทั้งหมด ลายเซ็นและความหมายอยู่ใน [domain-and-ports](domain-and-ports.md#port)

`MessagingGateway`, `ChatModel`, `DocumentExtractor`, `TopicGuard`, `KnowledgeSource`, `FileStorage`, `ContactRepository`, `MessageRepository`, `SettingsRepository`, `KnowledgeRepository`, `UsageRepository`, `WebhookEventRepository`, `RateLimitRepository`, `SecretCipher`, `AccessTokenSigner`, `ContentHasher`, `Clock`, `IdGenerator`, `Logger`

Adapter ของ `KnowledgeSource` อยู่ใน `src/adapters/prisma/` และ query ตาราง `KbDocument` ตรง ไม่เรียก `KnowledgeRepository` เพราะ adapter ห้ามเรียก adapter อื่น ทุก port มีตัวปลอมใน `src/adapters/fakes/` และชุดทดสอบของ port ที่รันกับทั้งตัวปลอมและตัวจริง

## Use case

ขั้นตอนและ test อยู่ใน [use-cases](use-cases.md)

`VerifyAccess`, `UnlockAccess`, `CheckHealth`, `ReceiveLineEvents`, `StoreInboundMedia`, `GenerateAiReply`, `SendAdminMessage`, `RetryMessage`, `IssueUpload`, `DiscardUpload`, `WriteLocalUpload`, `ServeLocalMedia`, `ShowTypingToCustomer`, `SetContactAi`, `MarkContactRead`, `ListContacts`, `GetContact`, `GetMessages`, `GetSettings`, `UpdateSettings`, `TestTopicGuard`, `SetLineCredentials`, `TestLineConnection`, `IngestDocument`, `DeleteDocument`, `ListDocuments`, `GetDocument`, `GetUsageReport`, `GetContactUsage`, `GetSystemStatus`, `GetGuardrailStats`

Use case ที่อ่านอย่างเดียวเรียก repository ตรงได้ ยกเว้น `ListContacts` ซึ่งเขียนแบบมีเงื่อนไขหนึ่งครั้งทุกรอบ: คืนสภาพงาน AI ที่ค้างเป็นรอแอดมินพร้อมบรรทัดเหตุการณ์ ตาม [ai-reply](../specs/ai-reply.md#งานที่ค้าง)

## API

ทุก endpoint ใช้ Node runtime ปิด cache และต้องมี cookie ของรหัสเข้าใช้ ยกเว้น webhook, health, unlock และ `GET`/`HEAD /api/local-storage/*key` (`PUT /api/local-storage/*key` ต้องมีทั้ง cookie และลายเซ็น)

ตัวช่วยของ route (`withRoute`, `json`, `bodyStream`, `runJob`, ตัวแปลง DTO และตัวแปลง input) อยู่ใน `src/composition/` และ export จาก `src/composition/index.ts` route import จาก `@/composition` เท่านั้น ไฟล์ใน `app/api/_lib/` (`with-route.ts`, `to-dto.ts`) เป็นเพียง re-export และคำอธิบายวิธีเขียน route เพราะ unit test ของ Vitest เก็บเฉพาะ `src/**` `runJob(fn, fields)` รับงานและ field ของ log (`requestId`, `route`, `contactId`, `messageId`, `documentId`) ส่งงานเข้า `after()` และ log `job.run.failed` เมื่องาน throw สัญญาของแต่ละตัวอยู่ใน [api-contract](api-contract.md#endpoint)

`POST /api/line/webhook`, `GET /api/health`, `POST /api/access/unlock`, `POST /api/access/lock`, `GET /api/contacts`, `GET /api/contacts/:id`, `PATCH /api/contacts/:id`, `POST /api/contacts/:id/read`, `GET /api/contacts/:id/messages`, `POST /api/contacts/:id/messages`, `POST /api/contacts/:id/messages/:messageId/retry`, `POST /api/contacts/:id/typing`, `POST /api/uploads`, `DELETE /api/uploads/:uploadId`, `PUT /api/local-storage/*key`, `GET /api/local-storage/*key`, `GET /api/settings`, `PATCH /api/settings`, `PUT /api/settings/line-credentials`, `POST /api/settings/line/test`, `POST /api/settings/guard/test`, `GET /api/knowledge/documents`, `POST /api/knowledge/documents`, `GET /api/knowledge/documents/:id`, `DELETE /api/knowledge/documents/:id`, `POST /api/knowledge/documents/:id/retry`, `GET /api/usage`, `GET /api/usage/contacts/:id`, `GET /api/system/status`, `GET /api/system/guardrails`

`PUT` และ `GET /api/local-storage/*key` มีเฉพาะเมื่อ `FILE_STORAGE=local`

ที่เก็บไฟล์แบบ local (`src/adapters/local-storage/local-file-storage.adapter.ts`) ทำงานดังนี้:

- URL ของไฟล์คือ `<APP_BASE_URL>/api/local-storage/<key>` โดยแต่ละส่วนของ key ที่คั่นด้วย `/` ผ่าน `encodeURIComponent` key รับเฉพาะส่วนที่เป็นตัวอักษร ตัวเลข `.`, `_`, `-` ส่วนใดขึ้นต้นด้วย `.` ไม่ได้ (จึงไม่มี `.` และ `..`) และยาวไม่เกิน 512 ตัวอักษร key ที่ไม่ผ่านไม่ถูกแปลงเป็น path
- สิทธิ์อัปโหลดจาก `issueUpload` เป็น URL ของไฟล์ต่อด้วย `?exp=<exp>&sig=<sig>` และ header `Content-Type` ที่ต้องส่ง
  - `exp`: เวลาหมดอายุเป็นวินาทีแบบ epoch (`floor(expiresAt / 1000)`)
  - `sig`: สามส่วนคั่นด้วย `.` คือ `<maxSizeBytes>.<base64url(contentType)>.<base64url(hmac)>` โดย `hmac` = HMAC-SHA256 ด้วย secret ที่ composition ส่งให้ adapter (สร้างจาก `SESSION_SECRET` ด้วย HKDF-SHA256 salt `twa.local-storage` info `signed-put.v1` ยาว 32 byte จึงไม่ต้องมี environment variable เพิ่มและไม่ใช่ key เดียวกับของ cookie) ของข้อความ `<key>\n<contentType>\n<maxSizeBytes>\n<exp>` ขนาดและชนิดที่เซ็นไว้อยู่ใน `sig` เพราะ port ส่งให้ `acceptSignedPut` เฉพาะ `exp` และ `sig`
- `acceptSignedPut` ตรวจตามลำดับ: key ถูกรูปแบบ, `sig` แยกได้สามส่วนและ HMAC ตรงแบบ timing-safe (`upload.signature_invalid`), เวลาปัจจุบัน (ค่าที่มากกว่าระหว่างเวลาที่ส่งมากับ `Clock`) ยังน้อยกว่า `exp` (`upload.expired`), media type ของ `Content-Type` ที่ส่งมาตรงกับที่เซ็นไว้โดยไม่สนตัวพิมพ์และ parameter (`upload.content_mismatch`) แล้วจึงเขียนไฟล์ด้วยชนิดที่เซ็นไว้ และตัดเมื่อเกิน `maxSizeBytes` (`media.too_large`)
- บนดิสก์ ไฟล์อยู่ที่ `objects/<key>`, ชนิดของไฟล์อยู่ที่ `meta/<key>.json` และการเขียนผ่านไฟล์ชั่วคราวใน `tmp/` แล้วจึง rename ทั้งหมดอยู่ใต้ root ของที่เก็บ (`<cwd>/.data/uploads` ตาม [project-setup](project-setup.md#610-envexample)) ไฟล์ที่เกินขนาดไม่ทิ้งไฟล์ค้างและไม่ทับไฟล์เดิม
