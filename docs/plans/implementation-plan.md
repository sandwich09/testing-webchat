# แผนการสร้าง

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

## วิธีทำงาน

- งานแตกเป็น ticket ใน [work-breakdown](work-breakdown.md) ซึ่งเรียงเป็นรอบ (wave) ให้ agent หลายตัวทำขนานกันได้ รายการด้านล่างบอกเฉพาะว่าแต่ละข้อของแต่ละขั้นอยู่ใน ticket ใด รายละเอียดอยู่ใน work-breakdown ที่เดียว
- ticket ของรอบแรกสร้างโครงและ interface ของทุกขั้นพร้อมกัน (เช่น Prisma schema มีทุกตาราง) ส่วนการเปิดใช้งานและการทดสอบกับบริการจริงยังทำทีละขั้นตามลำดับด้านล่าง
- หนึ่ง PR ต่อหนึ่งขั้น merge แบบ squash เข้า `main` ดู [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md) lead เป็นผู้ commit
- แต่ละขั้น deploy และทดสอบได้ในตัวเอง ถ้าเวลาไม่พอ หยุดหลังขั้นใดก็ได้ตั้งแต่ขั้นที่ 1 แล้วยังส่งงานได้
- ก่อนเปิด PR ผู้ทำรัน lint, typecheck, unit test และ E2E เอง แล้วแนบผล

## ขั้นที่ 0: เอกสาร

- [x] โครง `docs/`, requirement, สถาปัตยกรรม, spec, ADR, guideline, QA, security, runbook
- [x] `AGENTS.md` และ `CLAUDE.md`
- [x] สัญญาสำหรับการสร้าง (project-setup, domain-and-ports, use-cases, api-contract, error-catalog, ui-screens, ui-copy, ai-prompt, stubs-and-fixtures) และ [work-breakdown](work-breakdown.md)

## ขั้นที่ 1: ฐานของระบบและแชทข้อความ (ครบตามโจทย์)

ครอบคลุม R1 ถึง R6, E1, E3 และ E4

- [ ] ยืนยันรายการใน "สิ่งที่ต้องยืนยัน" ด้านล่างที่เกี่ยวกับขั้นนี้ (ยังไม่ครบ: ข้อที่เหลือต้องใช้ LINE, Claude หรือ Vercel จริง)
- [x] โครงโปรเจกต์: Next.js, TypeScript, ESLint พร้อมกฎขอบเขต, Prettier, Vitest, Playwright (T-0.1)
- [x] Docker compose: แอป, Postgres, stub ของ LINE และ seed (T-0.1, T-1.5, T-4.3)
- [x] Prisma schema และ migration ของทุกตาราง (T-0.6)
- [x] แกนกลาง: type, ports, ฟังก์ชันล้วน, `ReceiveLineEvents`, `SendAdminMessage`, `RetryMessage`, `UnlockAccess` และ use case อ่านอย่างเดียว (T-0.2, T-0.3, T-1.2, T-2.1, T-3.1, T-3.2, T-3.4, T-3.6)
- [x] Adapter: LINE, Prisma, AES-GCM, ตัวปลอม และชุดทดสอบของ port (T-1.3, T-1.4, T-2.7, T-2.2, T-2.3, T-2.4)
- [x] API: webhook, access, contacts, messages, settings ของ LINE, health (T-0.4, T-4.1, T-4.2)
- [x] หน้าจอ: หน้ายินดีต้อนรับ, เมนูซ้าย, หน้าแชท, ส่วน LINE Official Account ของหน้าตั้งค่า (T-0.5, T-1.7, T-1.8, T-1.9, T-2.8, T-5.1, T-5.2, T-5.3, T-5.4)
- [ ] CI 4 งาน และ Deploy Hook (T-4.3) (ไฟล์ workflow ล็อก action ครบแล้ว แต่ยังไม่เคยรันบน GitHub และยังไม่มี Deploy Hook จริง)
- [x] E2E เส้นที่ 1, 2, 7 และ 8 (T-1.6, T-6.1)
- [ ] Deploy ครั้งแรก และทดสอบกับ LINE จริงตามสคริปต์ข้อ 1 ถึง 4 (เจ้าของงาน)

## ขั้นที่ 2: รูป วิดีโอ สติกเกอร์ และลูกเล่นของช่องตอบ

ครอบคลุม E2 และ E11

- [x] Port `FileStorage` กับ adapter ของ Vercel Blob และดิสก์ในเครื่อง (T-0.3, T-1.3, T-2.6)
- [x] `StoreInboundMedia`, `IssueUpload` และการส่งรูปกับวิดีโอ (T-3.2, T-3.5, T-3.4)
- [x] การแปลงรูป (WebP และ HEIC ด้วย `heic-to`) และสร้างภาพตัวอย่างใน browser (T-5.3) (ตรวจใน Chromium ด้วยไฟล์สังเคราะห์ ยังไม่ได้ตรวจกับรูปจาก iPhone จริงและใน Firefox)
- [x] การแสดงสติกเกอร์และป้ายของชนิดอื่น (T-5.2)
- [x] ข้อความสำเร็จรูป และ loading ฝั่ง LINE ขณะแอดมินพิมพ์ (T-3.1, T-3.4, T-5.3, T-5.5) (มี unit test ไม่มีเส้น E2E เฉพาะ)
- [x] E2E เส้นที่ 5 (T-6.2)

## ขั้นที่ 3: AI ตอบแทนและค่าใช้จ่าย

ครอบคลุม E5, E6, E8 และ E9

- [x] Port `ChatModel` กับ adapter ของ Claude และ stub (T-0.3, T-1.3, T-1.5, T-2.5)
- [x] `GenerateAiReply` พร้อมการรวมข้อความ การล็อก และสถานะรอแอดมิน (T-1.1, T-3.3)
- [x] ตาราง AiUsage, ตารางราคา และงบต่อวัน (T-0.2, T-1.2, T-2.3, T-3.1)
- [x] หน้าจอ: สวิตช์ AI ตอบแทน, ส่วน AI ตอบแทน, ค่าใช้จ่าย AI และสถานะระบบ (T-5.2, T-5.4, T-5.5)
- [x] E2E เส้นที่ 3 และ 4 (T-6.2)

## ขั้นที่ 4: คลังความรู้

ครอบคลุม E7

- [x] Port `DocumentExtractor` และ `KnowledgeSource` (T-0.3, T-2.3, T-2.5)
- [x] `IngestDocument`, `DeleteDocument` และตาราง KbDocument (T-0.6, T-3.7)
- [x] หน้าจอส่วนคลังความรู้ (T-5.5)
- [x] E2E เส้นที่ 6 (T-6.2)

## ขั้นที่ 5: ขอบเขตหัวข้อและ Guardrails

ครอบคลุม E12 ([topic-guard](../specs/topic-guard.md), [ai-guardrails](../security/ai-guardrails.md), [ADR 0020](../adr/0020-topic-guardrail-as-separate-check.md))

- [x] Enum, constant, รหัส error, port `TopicGuard` พร้อมตัวปลอมและชุดทดสอบ, การเปลี่ยนของ port ของ Settings, Usage และ Message, contract, constant ของหน้าจอ และ migration ที่สอง (T-2.9)
- [x] Adapter `TopicGuard` ของ Claude และการแยกชนิดคำขอใน stub (T-2.10)
- [x] ขั้นคัดกรองใน `GenerateAiReply`, การตรวจค่าใน `UpdateSettings`, `TestTopicGuard`, `GetGuardrailStats` และ `blockedToday` (T-3.1, T-3.3)
- [x] ประกอบ `TopicGuard` และ route `POST /api/settings/guard/test`, `GET /api/system/guardrails` (T-4.1, T-4.2) และค่าตัวอย่างใน seed (T-4.3)
- [x] หน้าจอ: ส่วนขอบเขตหัวข้อ ส่วน Guardrails (T-5.6) และแถวคัดกรองในค่าใช้จ่าย AI (T-5.5)
- [x] E2E เส้นที่ 9 (T-6.2)
- [x] กลุ่ม G และตัวชี้วัดของชุดคำถามวัดคุณภาพ (เขียนไว้ รันเมื่อเจ้าของงานสั่ง) (T-3.8) (สคริปต์และ unit test มีแล้ว ยังไม่เคยรันกับ Claude จริง)
- [ ] ทดสอบกับ LINE และ Claude จริงตามสคริปต์ข้อ 9 (เจ้าของงาน)

## ขั้นที่ 6: เก็บงานและส่ง

- [x] ตรวจ axe และแก้สิ่งที่พบ (T-7.1) (axe ใน E2E ของหน้ายินดีต้อนรับ หน้าแชท และหน้าตั้งค่า ไม่มี violation)
- [x] ชุดคำถามวัดคุณภาพ AI (เขียนไว้ รันเมื่อเจ้าของงานสั่ง) (T-3.8) (ยังไม่เคยรัน)
- [ ] รันสคริปต์ทดสอบด้วยมือทั้งชุดบน production (เจ้าของงาน)
- [x] README ฉบับสมบูรณ์: URL ทั้งสาม, วิธีรัน, ข้อจำกัดที่รู้ (T-7.1) (URL ทั้งสามเป็น `TODO` ให้เจ้าของงานเติม)
- [x] ตรวจว่าเอกสารตรงกับโค้ด และเปลี่ยนสถานะ spec เป็น "สร้างแล้ว" (T-7.1)
- [ ] Tag `v1.0.0` (lead)

## สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง

ข้อเหล่านี้มาจากความเข้าใจตอนออกแบบและยังไม่ได้ตรวจกับเอกสารปัจจุบัน เมื่อยืนยันแล้วให้แก้เอกสารที่เกี่ยวข้องและขีดออก ค่าของ constant ที่กระทบอยู่ใน [project-setup](../architecture/project-setup.md#10-ค่าคงที่ของระบบ)

| เรื่อง | กระทบ |
| --- | --- |
| เพดานขนาด request และเวลาของ function บน Vercel แผนฟรี (route PDF ต้องการ `KNOWLEDGE_MAX_DURATION_S`, webhook ใช้ `WEBHOOK_MAX_DURATION_S`) | `PDF_MAX_BYTES`, `PDF_MAX_PAGES`, `CLAUDE_EXTRACT_TIMEOUT_MS` ใน [project-setup](../architecture/project-setup.md) และ [knowledge-base](../specs/knowledge-base.md) |
| ระยะเวลาเก็บ log ของ Vercel แผนฟรี | ส่วนสถานะระบบ |
| โควตาของ Vercel Blob แผนฟรี | เพดานวิดีโอ `VIDEO_MAX_BYTES` |
| Node 24 บน Vercel และ PostgreSQL 17 บน Neon | รุ่นที่ล็อก |
| อายุของ reply token ของ LINE | `REPLY_TOKEN_USABLE_MS` และการเลือก reply หรือ push |
| ขีดจำกัดขนาดและชนิดของรูปกับวิดีโอ ขนาดภาพตัวอย่าง และความยาวข้อความของ LINE รวมวิธีนับตัวอักษร | ข้อกำหนดสื่อ, `PREVIEW_MAX_BYTES`, `LINE_TEXT_MAX_CHARS` |
| ระยะเวลาที่ LINE เก็บไฟล์ของข้อความ | การดาวน์โหลดสื่อขาเข้า |
| เงื่อนไขของ API แสดง loading ของ LINE (ช่วงของ `loadingSeconds`) | `LINE_LOADING_SECONDS` ขณะ AI ตอบและขณะแอดมินพิมพ์ |
| ราคาอ่านและเขียน cache ของแต่ละโมเดล | ตารางราคาใน [usage-cost](../specs/usage-cost.md) |
| ชื่อ header และรูปแบบของการสลับโมเดลสำรองฝั่ง server | Adapter ของ Claude |
| ราคา input และ output ของโมเดลสำรอง `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5` | ตารางราคาใน [usage-cost](../specs/usage-cost.md) |
| จำนวนข้อความสูงสุดต่อคำขอ reply หรือ push ของ LINE | `LINE_MAX_PARTS_PER_REQUEST` ใน [domain-and-ports](../architecture/domain-and-ports.md) |
| รูปแบบคำตอบของ LINE เมื่อ reply token ใช้ไม่ได้ | `MessagingGateway.reply` ใน [domain-and-ports](../architecture/domain-and-ports.md), stub |
| คำตอบของ LINE เมื่อ retry key ถูกรับไปแล้ว (สมมติ 409) | `MessagingGateway.push`, [stubs-and-fixtures](../qa/stubs-and-fixtures.md) |
| การแยกโควตา push เต็มออกจาก 429 ของ LINE | `line.quota_exceeded` กับ `line.rate_limited` |
| Endpoint ภาพตัวอย่างและ transcoding ของวิดีโอขาเข้าของ LINE | `MessagingGateway.downloadContent`, stub |
| ความหมายของ `events[].mode` (`standby`) และ `message.contentProvider.type` ของ webhook | [api-contract](../architecture/api-contract.md#post-apilinewebhook) |
| รูปแบบ URL รูปสติกเกอร์ของ LINE และ host ใน CSP (`profile.line-scdn.net`, `stickershop.line-scdn.net`) | `MessageDto.sticker.imageUrl`, CSP ใน [project-setup](../architecture/project-setup.md#62-nextconfigts), สติกเกอร์ใน seed |
| LINE ไม่มี API ตรวจ Channel secret | `SetLineCredentials` ใน [use-cases](../architecture/use-cases.md) |
| รูปแบบของ `webhookEventId` และ field ของ fixture (`mode`, `quoteToken`, `stickerResourceType`, `keywords`, `follow.isUnblocked`) | [stubs-and-fixtures](../qa/stubs-and-fixtures.md) |
| IP ของผู้เรียกบน Vercel มาจาก `x-forwarded-for` ตัวแรก | `RequestContext.clientIp` และการจำกัดความถี่ |
| ขนาด pool ของ connection แบบ pooled ของ Neon (สมมติ 5) | `prisma-client.ts` ใน [data-model](../architecture/data-model.md) |
| SDK ของ Claude: `output_config.format` กับ `client.beta.messages.create` และ `parse` ของ beta | Adapter ของ Claude |
| SDK ของ Claude: ใช้ `fallbacks` ร่วมกับ structured output ได้ | Adapter ของ Claude |
| SDK ของ Claude: ขั้นต่ำของความยาวที่ cache ได้ (การใช้ร่วมกับแบบอัตโนมัติไม่ต้องยืนยันแล้ว เพราะคำขอไม่ใช้ caching อัตโนมัติตาม [ADR 0021](../adr/0021-explicit-cache-marker-and-fallback-per-model.md)) | [ai-prompt](../specs/ai-prompt.md#3-โครงของ-request) |
| SDK ของ Claude: รับ role `system` เป็นข้อความสุดท้ายใน `messages` สำหรับเวลาปัจจุบัน | [ai-prompt](../specs/ai-prompt.md#3-โครงของ-request), `ChatModelRequest.now` |
| SDK ของ Claude: ชื่อ class error ของการเชื่อมต่อและ timeout | การแปลง error ใน adapter |
| ~~SDK ของ Claude: usage และราคาเมื่อมีการสลับโมเดลสำรอง~~ ยืนยันแล้ว ดูหัวข้อถัดไป | `computeCost` |
| SDK ของ Claude: namespace beta มี `stream` | `DocumentExtractor.extract` |
| SDK ของ Claude: structured output บน Haiku 5.5 (~~option `timeout` ต่อคำขอ~~ ยืนยันแล้ว ดูหัวข้อถัดไป) | `TopicGuard.classify` |
| Prisma 7.10.1: `ALTER TYPE ... ADD VALUE` ใน migration ที่สองไม่ถูกห่อใน transaction ที่ Postgres ไม่ยอม | migration `topic_guard` ใน [data-model](../architecture/data-model.md#migration-ที่สอง-ขอบเขตหัวข้อ) |
| Structured output รองรับ `minLength` และ `maxLength` | schema ใน [ai-prompt](../specs/ai-prompt.md#51-schema-ที่ส่งให้-api) |
| Endpoint นับ token ของ Claude ไม่คิดเงิน | `DocumentExtractor.countTokens` |
| Vercel Blob: client token จำกัด pathname ชนิด ขนาด และเวลาได้, ตั้ง `addRandomSuffix: false` ได้, URL รู้ได้เมื่อไร | Adapter ของ `FileStorage` |
| Vercel Blob: ชื่อฟังก์ชันอัปโหลดฝั่ง client การรายงานความคืบหน้า และการยกเลิก | `uploadToTarget` ใน [ui-screens](../specs/ui-screens.md#76-ขั้นตอนแนบไฟล์) |
| CSP ที่ `heic-to/csp` ต้องใช้ใน Firefox (Chromium ยืนยันแล้ว ดูหัวข้อถัดไป) | CSP ใน [project-setup](../architecture/project-setup.md#62-nextconfigts), [ADR 0019](../adr/0019-heic-conversion-with-heic-to.md) |
| `git.deploymentEnabled: false` ใน `vercel.json` ยังให้ Deploy Hook ทำงาน | [project-setup](../architecture/project-setup.md#611-ไฟล์อื่น), [deploy](../runbooks/deploy.md) |
| รายการเครื่องมือที่เหลือจากตอน scaffold: คำเตือนของ `next start` กับ standalone (ข้ออื่นยืนยันแล้ว) | [project-setup](../architecture/project-setup.md#11-สิ่งที่ต้องยืนยันตอน-scaffold) |

## สิ่งที่ยืนยันแล้ว

| เรื่อง | ผล | วันที่ |
| --- | --- | --- |
| รุ่นของ TypeScript | ใช้ 5.9 เพราะ typescript-eslint 8.73 รองรับต่ำกว่า 6.1 | 2026-11-18 |
| Docker ในสภาพแวดล้อมพัฒนา | เปิด daemon ได้ และดึง `postgres:17-alpine` กับ `node:24-alpine` ได้ | 2026-11-18 |
| สัญญาอนุญาตของ LINE Seed Sans TH | ไฟล์รุ่น 1.003 ที่เจ้าของงานส่งมาระบุ SIL Open Font License 1.1 ใน metadata ของฟอนต์ จึงเก็บใน repo ได้ ดู [ADR 0018](../adr/0018-use-line-seed-sans-th.md) | 2026-11-18 |
| Anthropic มี embedding ของตัวเองหรือไม่ | ไม่มี เอกสารทางการแนะนำผู้ให้บริการอื่น | 2026-11-18 |
| แพ็กเกจแปลง HEIC | `heic-to` 1.6.7 (LGPL-3.0) มี export `.`, `./csp`, `./next` ดู [ADR 0019](../adr/0019-heic-conversion-with-heic-to.md) | 2026-11-18 |
| SDK ของ Claude: header ของ API key | `@anthropic-ai/sdk` 1.10.0 ส่ง API key เป็น `Authorization: Bearer <key>` ไม่ใช่ `x-api-key` (ยืนยันจาก type และโค้ดของ client ใน SDK) stub จึงรับทั้งสองแบบ ตาม [stubs-and-fixtures](../qa/stubs-and-fixtures.md#51-การตรวจ) | 2026-11-18 |
| SDK ของ Claude: usage เมื่อมีการสลับโมเดลสำรอง | ใน type ของ SDK 1.10.0 `usage.iterations` มีหนึ่งรายการต่อทุกรอบที่ถูกคิดเงิน (รอบที่โมเดลปฏิเสธเป็นรายการ `message` และรอบที่ตอบจริงเป็น `fallback_message`) ส่วน `usage` ระดับบนสุดนับเฉพาะรอบที่ตอบจริง adapter จึงรายงานผลรวมของ `iterations` และ `model` ของข้อความสุดท้าย ตาม [ai-prompt ข้อ 5.3](../specs/ai-prompt.md#53-การอ่านคำตอบของ-api) และ [usage-cost](../specs/usage-cost.md) | 2026-11-18 |
| SDK ของ Claude: option `timeout` ต่อคำขอ | option `timeout` ของคำขอแต่ละครั้ง (`RequestOptions` ใน SDK 1.10.0) ใช้แทนค่าของ client สำหรับคำขอนั้น adapter ของ `TopicGuard` จึงส่ง `TopicGuardRequest.timeoutMs` ทุกครั้ง | 2026-11-18 |
| CSP ของ `heic-to/csp` ใน Chromium | CSP ของ [project-setup ข้อ 6.2](../architecture/project-setup.md#62-nextconfigts) พอ ไม่ต้องมี `'unsafe-eval'`, `'wasm-unsafe-eval'` หรือ `worker-src`: E2E เส้นที่ 5 แปลง `tiny.heic` เป็น JPEG ใน Chromium ใต้ CSP นี้และไม่มี CSP violation export `heicTo` ของ `heic-to/csp` 1.6.7 ใช้ได้ตามที่ `inbox.media.ts` เรียก ยังไม่ได้ยืนยันใน Firefox | 2026-11-18 |
| เครื่องมือตอน scaffold | ยืนยันจาก build และชุดตรวจครั้งสุดท้าย รายการอยู่ใน [project-setup ข้อ 11](../architecture/project-setup.md#11-สิ่งที่ต้องยืนยันตอน-scaffold) | 2026-11-18 |
| สิ่งที่ยังไม่ได้ยืนยันกับของจริง | LINE จริง (reply token, retry key, loading, โปรไฟล์ สติกเกอร์ และสื่อ), Claude จริง (คุณภาพ ต้นทุน caching การสลับโมเดลสำรอง structured output และการคัดกรองหัวข้อ), Vercel Blob และการ deploy บน Vercel ยังไม่ได้ทดสอบ ทุกข้อใน [work-breakdown ข้อ 5.2](work-breakdown.md#52-ตรวจไม่ได้หากไม่มี-credential-จริง-เจ้าของงานทำ) ยังเปิดอยู่ | 2026-11-18 |

## สิ่งที่เจ้าของงานต้องทำเอง

- สร้าง LINE OA และ Messaging API channel ดู [line-oa-setup](../runbooks/line-oa-setup.md)
- สร้างโปรเจกต์บน Vercel, ฐานข้อมูลบน Neon และ Blob store แล้วตั้ง environment variable ดู [deploy](../runbooks/deploy.md)
- ตั้ง `ANTHROPIC_API_KEY` และ `ACCESS_CODE`
- เปิด secret scanning และ push protection ของ GitHub
- Review และ merge PR ของแต่ละขั้น
