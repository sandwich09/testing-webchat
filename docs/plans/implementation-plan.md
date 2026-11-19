# แผนการสร้าง

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

## วิธีทำงาน

- งานแตกเป็น ticket ใน [work-breakdown](work-breakdown.md) ซึ่งเรียงเป็นรอบ (wave) ให้ผู้พัฒนาหลายคนทำขนานกันได้ รายการด้านล่างบอกเฉพาะว่าแต่ละข้อของแต่ละขั้นอยู่ใน ticket ใด รายละเอียดอยู่ใน work-breakdown ที่เดียว
- ticket ของรอบแรกสร้างโครงและ interface ของทุกขั้นพร้อมกัน (เช่น Prisma schema มีทุกตาราง) ส่วนการเปิดใช้งานและการทดสอบกับบริการจริงยังทำทีละขั้นตามลำดับด้านล่าง
- หนึ่ง PR ต่อหนึ่งขั้น merge แบบ squash เข้า `main` ดู [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md) ผู้พัฒนาที่ตรวจงานเป็นผู้ commit
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
- [ ] Deploy ครั้งแรก และทดสอบกับ LINE จริงตามสคริปต์ข้อ 1 ถึง 4 (เจ้าของงาน) (ทดสอบครั้งแรกบน production แล้วบางส่วนตามที่ [README](../../README.md#verified-and-not-verified) บันทึก: ข้อความเข้าออก สติกเกอร์ขาเข้า รูปขาออก และคำตอบ AI ยังไม่ได้ทำครบทุกข้อของสคริปต์)

## ขั้นที่ 2: รูป วิดีโอ สติกเกอร์ และลูกเล่นของช่องตอบ

ครอบคลุม E2 และ E11

- [x] Port `FileStorage` กับ adapter ของ Vercel Blob และดิสก์ในเครื่อง (T-0.3, T-1.3, T-2.6)
- [x] `StoreInboundMedia`, `IssueUpload` และการส่งรูปกับวิดีโอ (T-3.2, T-3.5, T-3.4)
- [x] การแปลงรูป (WebP และ HEIC ด้วย `heic-to`) และสร้างภาพตัวอย่างใน browser (T-5.3) (ตรวจใน Chromium ด้วยไฟล์สังเคราะห์ ยังไม่ได้ตรวจกับรูปจาก iPhone จริงและใน Firefox)
- [x] การแสดงสติกเกอร์และป้ายของชนิดอื่น (T-5.2)
- [x] ข้อความสำเร็จรูป และ loading ฝั่ง LINE ขณะแอดมินพิมพ์ (T-3.1, T-3.4, T-5.3, T-5.5) (มี unit test ไม่มีเส้น E2E เฉพาะ) ข้อความสำเร็จรูปถูกตัดออกภายหลัง ([ADR 0024](../adr/0024-scope-reductions.md))
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
- [x] หน้าจอ: ส่วนขอบเขตหัวข้อ ส่วน Guardrails (T-5.6) และแถวคัดกรองในค่าใช้จ่าย AI (T-5.5) ส่วน Guardrails ถูกเอาออกจากหน้าจอภายหลัง endpoint ยังอยู่ ([ADR 0024](../adr/0024-scope-reductions.md))
- [x] E2E เส้นที่ 9 (T-6.2)
- [x] กลุ่ม G และตัวชี้วัดของชุดคำถามวัดคุณภาพ (เขียนไว้ รันเมื่อเจ้าของงานสั่ง) (T-3.8) (สคริปต์และ unit test มีแล้ว ยังไม่เคยรันกับ Claude จริง)
- [ ] ทดสอบกับ LINE และ Claude จริงตามสคริปต์ข้อ 9 (เจ้าของงาน)

## ขั้นที่ 6: เก็บงานและส่ง

- [x] ตรวจ axe และแก้สิ่งที่พบ (T-7.1) (axe ใน E2E ของหน้ายินดีต้อนรับ หน้าแชท และหน้าตั้งค่า ไม่มี violation)
- [x] ชุดคำถามวัดคุณภาพ AI (เขียนไว้ รันเมื่อเจ้าของงานสั่ง) (T-3.8) (ยังไม่เคยรัน)
- [ ] รันสคริปต์ทดสอบด้วยมือทั้งชุดบน production (เจ้าของงาน)
- [x] README ฉบับสมบูรณ์: URL ทั้งสาม, วิธีรัน, ข้อจำกัดที่รู้ (T-7.1) (URL ทั้งสามเป็น `TODO` ให้เจ้าของงานเติม)
- [x] ตรวจว่าเอกสารตรงกับโค้ด และเปลี่ยนสถานะ spec เป็น "สร้างแล้ว" (T-7.1)
- [ ] Tag `v1.0.0` (เจ้าของงาน)

## ปิดช่องว่างของ pitfalls: ส่วนที่ทำงานตอนรัน

ขอบเขตอยู่ในตาราง "ช่องว่างที่ยังเหลือ" ของ [pitfalls-and-prevention](../guidelines/pitfalls-and-prevention.md#ช่องว่างที่ยังเหลือ) และ spec ที่ลิงก์จากแต่ละข้อ

- [x] S1 key ของ cookie ผูกกับ `ACCESS_CODE` ([access-gate](../specs/access-gate.md#พฤติกรรม))
- [x] S2 IP จากค่าสุดท้ายของ `x-forwarded-for` และถังของคำขอที่ไม่มี IP ([ADR 0022](../adr/0022-client-ip-from-last-forwarded-hop.md)) ยังต้องตรวจบน Vercel ตามตารางด้านล่าง
- [x] S3 production ปฏิเสธค่าที่ใช้เฉพาะการทดสอบ ([project-setup ข้อ 6.10](../architecture/project-setup.md#610-envexample))
- [x] S6 การตรวจต้นทางรับ same-origin หรือ `APP_BASE_URL` และ `APP_BASE_URL` ถูกแปลงเป็น origin ([ADR 0025](../adr/0025-same-origin-or-app-base-url.md)) ยังต้องตรวจบน Vercel ตามตารางด้านล่าง
- [x] M3 คืนสภาพไฟล์ที่ค้างอ่าน สื่อขาเข้าที่ค้าง และการส่งที่ค้าง (migration `message_delivery_attempt_at`)
- [x] A2 เวลาแย่ที่สุดของงานหลังตอบอยู่ใต้ `maxDuration` และ test ตรึงอสมการ ([project-setup ข้อ 10.4](../architecture/project-setup.md#104-adapter-และ-route))
- [x] A3 บันทึกการเรียกที่ไม่ได้คำตอบ ([usage-cost](../specs/usage-cost.md#การเรียกที่ไม่ได้คำตอบ))
- [x] A4 ไม่ส่งลิงก์ที่แอดมินไม่ได้เขียน ([ai-prompt ข้อ 6.1](../specs/ai-prompt.md#61-ลิงก์ในคำตอบ))
- [ ] L4 และขีดจำกัดของ LINE: ทดสอบด้วยมือตาม [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) เมื่อมี LINE OA จริง (เจ้าของงาน)

## ปรับตามการทบทวนหน้าจอของเจ้าของงาน

- [x] Dropdown ทุกตัวใช้ `Select` ในธีมของแอป ไม่มี popup ของระบบปฏิบัติการ ([ui-screens ข้อ 1.8](../specs/ui-screens.md#18-select))
- [x] เมนูแสดงชื่อแอป "Test webchat" คงที่ ไม่ใช่ชื่อ LINE OA ([ui-screens ข้อ 3.2](../specs/ui-screens.md#32-รูปลักษณ์))
- [x] ตัดข้อความสำเร็จรูป, เอาแผง Guardrails ออกจากหน้าจอ และข้อความปฏิเสธเป็นประโยคคงที่ ([ADR 0024](../adr/0024-scope-reductions.md)) พร้อม migration ที่ห้า
- [x] วันที่และเวลาบนหน้าจอรูปแบบเดียว ([ux-writing](../guidelines/ux-writing.md#วันที่และเวลา))
- [x] Document ไม่เลื่อนทะลุโครงของแอป ([pitfalls F5](../guidelines/pitfalls-and-prevention.md#f5-ทั้งหน้าเลื่อนทะลุโครงของแอป))
- [x] แถวในส่วนเดียวกันของหน้าตั้งค่าไม่มีเส้นคั่น ([ui-screens ข้อ 9.2](../specs/ui-screens.md#92-โครงร่วม))
- [x] หัวข้อของขอบเขตหัวข้อแก้เป็นรายการทีละหัวข้อ และถ้อยคำของแอปเป็นกลาง ([ui-screens ข้อ 9.13](../specs/ui-screens.md#913-ส่วนขอบเขตหัวข้อ))
- [x] รายชื่อเรียงตามข้อความล่าสุดของลูกค้า และโหลดเพิ่มเมื่อเลื่อน ([webchat-inbox](../specs/webchat-inbox.md#รายชื่อลูกค้า))
- [ ] ข้อมูลตัวอย่างใน seed (ร้านสมมติ) จะคงไว้หรือเปลี่ยน รอเจ้าของงานตัดสิน

## ปรับเป็นเครื่องมือทดสอบที่เป็นกลาง

- [x] แกนของคำสั่งระบบที่เป็นกลาง ชื่อ AI ขอบเขตคำตอบ การทักทายผ่านขอบเขตหัวข้อ และโมเดลเริ่มต้น Sonnet 5.5 ([ADR 0026](../adr/0026-neutral-core-prompt-and-layered-settings.md)) พร้อม migration ที่หก
- [x] ข้อความที่ลูกค้าตอบกลับ (`quotedMessageId`) และ id ของข้อความที่ส่ง ([line-messaging](../specs/line-messaging.md#ข้อความที่ตอบกลับ)) พร้อม migration ที่เจ็ด
- [x] โน้ตของแอดมินในแผงข้อมูลลูกค้า ([webchat-inbox](../specs/webchat-inbox.md#โน้ตของแอดมิน)) พร้อม migration ที่แปด
- [x] ไอคอนของแอปและรูปโปรไฟล์ของ LINE OA ([frontend](../architecture/frontend.md#brand-assets))
- [x] ปุ่มพับเมนูที่มุมขวาบนของเมนูซ้าย ([ui-screens ข้อ 3.2](../specs/ui-screens.md#32-รูปลักษณ์))
- [x] ข้อความเสียงขาเข้าเก็บและเล่นได้ ([line-messaging](../specs/line-messaging.md#สื่อขาเข้า)) พร้อม migration ที่เก้า
- [x] Rich menu สามปุ่มที่ publish จากหน้าตั้งค่า และการ์ดต้อนรับเมื่อเพิ่มเพื่อน ([ADR 0027](../adr/0027-rich-menu-and-welcome-card.md), [line-messaging](../specs/line-messaging.md#rich-menu)) พร้อม migration ที่สิบ
- [ ] ยืนยันกับ LINE จริงตามขั้นที่ 10 ถึง 13 ของ [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) และกับ Claude จริงด้วยชุดคำถามวัดคุณภาพ (เจ้าของงานรัน `--confirm` เอง เพราะมีค่าใช้จ่าย)

## แก้ตามการ review ทั้งระบบ

ขอบเขตและเหตุผลอยู่ใน [ADR 0028](../adr/0028-review-fixes-concurrency-polling-and-ci.md)

- [x] การลองรหัสนับก่อนเทียบรหัสและคืนการนับเมื่อรหัสถูก (`RateLimitRepository.refund` แทน `peek`) ([access-gate](../specs/access-gate.md))
- [x] สถานะการติดตามเปลี่ยนตามเวลาของ event ด้วย compare-and-set (`Contact.followStatusAt`) และการกดปุ่มที่ LINE ส่งซ้ำไม่สร้างแถวที่สอง (`Message.webhookEventId` unique) ([line-messaging](../specs/line-messaging.md))
- [x] Rich menu บันทึกด้วย compare-and-set และ `line.rich_menu_conflict` ([line-messaging](../specs/line-messaging.md#publish-และนำออก))
- [x] Credential ของ LINE ต้องเป็น channel เดียวกัน (`line.channel_mismatch`) ([admin-backoffice](../specs/admin-backoffice.md))
- [x] Polling นับความล้มเหลวต่อ query และการโหลดใหม่รวมหน้าแรกเข้ากับที่โหลดไว้ ([ui-screens ข้อ 7.4](../specs/ui-screens.md#74-รอบ-polling-ร่วม))
- [x] ไฟล์ที่อัปโหลดต้องครบขนาดที่ขอสิทธิ์ (`upload.incomplete`), `experimental.proxyClientMaxBodySize` และเหตุผลที่โหลดสื่อขาเข้าไม่สำเร็จ (`Message.mediaFailure`)
- [x] CI ไม่ยกเลิกรอบที่เริ่มแล้ว ตรวจ migration ที่ทำลายข้อมูลทุกไฟล์ และงาน `deploy` เรียก Deploy Hook เฉพาะเมื่อ `main` ยังเป็น commit ที่ตรวจ
- [x] `pnpm migrations:applied` เทียบ migration ที่ apply แล้วในฐานข้อมูลกับไฟล์ ([deploy](../runbooks/deploy.md#ตรวจ-migration-ที่-apply-แล้ว))
- [x] Migration ที่สิบเอ็ด รวมค่าเริ่มต้น `TimeZone` เป็น UTC ของ database ([data-model](../architecture/data-model.md#migration-ที่สิบเอ็ด-ผลจากการ-review))
- [ ] ใส่ `pnpm migrations:applied` ใน `vercel-build` ก่อน `prisma migrate deploy` (รอเจ้าของงานอนุมัติ เพราะเป็นการแก้ค่า deploy)

## สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง

ข้อเหล่านี้มาจากความเข้าใจตอนออกแบบและยังไม่ได้ตรวจกับเอกสารปัจจุบัน เมื่อยืนยันแล้วให้แก้เอกสารที่เกี่ยวข้องและขีดออก ค่าของ constant ที่กระทบอยู่ใน [project-setup](../architecture/project-setup.md#10-ค่าคงที่ของระบบ)

| เรื่อง | กระทบ |
| --- | --- |
| เพดานขนาด request และเวลาของ function บน Vercel แผนฟรี: route PDF และ webhook ตั้ง `maxDuration` 300 วินาที (`KNOWLEDGE_MAX_DURATION_S`, `WEBHOOK_MAX_DURATION_S`) ซึ่งต้องมี Fluid compute เปิดอยู่ ตรวจใน Settings › Functions ของโปรเจกต์ และดูใน log ของ Vercel ว่า function ที่ทำงานนานไม่ถูกตัดก่อน 300 วินาที ถ้าแผนให้น้อยกว่านี้ ให้ลดค่าทั้งสองและแก้ค่าใน [project-setup ข้อ 10.4](../architecture/project-setup.md#104-adapter-และ-route) จน `timing-budget.spec.ts` ผ่าน | `PDF_MAX_BYTES`, `PDF_MAX_PAGES`, `CLAUDE_EXTRACT_TIMEOUT_MS`, `CLAUDE_REPLY_TIMEOUT_MS`, `AI_MAX_ROUNDS_PER_RUN` ใน [project-setup](../architecture/project-setup.md) และ [knowledge-base](../specs/knowledge-base.md) |
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
| คำตอบของ LINE เมื่อ retry key ถูกรับไปแล้ว (สมมติ 409 พร้อม `x-line-accepted-request-id`) และ "ส่งอีกครั้ง" ไม่ทำให้ลูกค้าได้ข้อความซ้ำ ทดสอบด้วยมือตามข้อ 1 และ 3 ของ [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) | `MessagingGateway.push`, [stubs-and-fixtures](../qa/stubs-and-fixtures.md), การคืนสภาพการส่งที่ค้าง (`line.send_interrupted`) |
| ข้อความ error จริงของ LINE, อายุจริงของ reply token, loading, วิดีโอขาเข้าและขาออก, host ของรูปโปรไฟล์และสติกเกอร์, `mode: standby`, ความยาวข้อความและจำนวนข้อความต่อคำขอ ทดสอบด้วยมือตามข้อ 2 และ 4 ถึง 9 ของ [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) | `REPLY_TOKEN_USABLE_MS`, `LINE_TEXT_MAX_CHARS`, `LINE_MAX_PARTS_PER_REQUEST`, `IMAGE_MAX_BYTES`, `VIDEO_MAX_BYTES`, `PREVIEW_MAX_BYTES` |
| การแยกโควตา push เต็มออกจาก 429 ของ LINE | `line.quota_exceeded` กับ `line.rate_limited` |
| Endpoint ภาพตัวอย่างของวิดีโอขาเข้าของ LINE และวิดีโอจริงที่ได้ 202 ก่อน transcode เสร็จ | `MessagingGateway.downloadContent`, `getContentStatus`, stub |
| ความหมายของ `events[].mode` (`standby`) และ `message.contentProvider.type` ของ webhook | [api-contract](../architecture/api-contract.md#post-apilinewebhook) |
| รูปแบบ URL รูปสติกเกอร์ของ LINE และ host ใน CSP (`profile.line-scdn.net`, `stickershop.line-scdn.net`) | `MessageDto.sticker.imageUrl`, CSP ใน [project-setup](../architecture/project-setup.md#62-nextconfigts), สติกเกอร์ใน seed |
| รูปแบบของ `webhookEventId` และ field ของ fixture (`mode`, `quoteToken`, `stickerResourceType`, `keywords`, `follow.isUnblocked`) | [stubs-and-fixtures](../qa/stubs-and-fixtures.md) |
| Vercel เขียน `x-forwarded-for` เป็น IP ที่ edge เห็น โดยแทนที่หรือต่อท้ายค่าที่ผู้เรียกส่งมา ค่าสุดท้ายจึงเป็นของ Vercel เสมอ ([ADR 0022](../adr/0022-client-ip-from-last-forwarded-hop.md)) ตรวจบน production: (1) ส่งรหัสผิดหกครั้งไปที่ `POST /api/access/unlock` แต่ละครั้งใส่ header `x-forwarded-for: 198.51.100.<n>` คนละค่า ครั้งที่หกต้องได้ 429 (2) ส่งรหัสผิดหนึ่งครั้งจากเครือข่ายอื่น (เช่นมือถือ) ทันทีหลังข้อ 1 ต้องได้ 401 ไม่ใช่ 429 (3) log ไม่มี `access.unlock.client_ip_missing` | `clientIpOf` ใน `src/composition/http-request.ts`, `RequestContext.clientIp` และการจำกัดความถี่ |
| Vercel ส่ง `x-forwarded-host` (หรือ `Host`) เป็นโดเมนที่ browser ใช้ และ `x-forwarded-proto: https` โดยไม่รับค่าที่ผู้เรียกส่งมา ([ADR 0025](../adr/0025-same-origin-or-app-base-url.md)) ตรวจบน production: (1) เข้าระบบได้ทั้งที่โดเมน production และโดเมนอื่นของ deployment เดียวกัน (2) `curl -X POST https://<โดเมน>/api/access/lock -H 'Origin: https://evil.example' -H 'x-forwarded-host: evil.example'` ต้องได้ 403 (3) คำขอเดียวกันโดยไม่มี `Origin` ต้องได้ 403 | `requestOwnOrigin` ใน `src/composition/request-origin.ts` |
| Production ไม่มี environment variable ที่ใช้เฉพาะการทดสอบ: deploy ครั้งแรกต้องผ่านการตรวจของ `assertEnv` เมื่อ `VERCEL_ENV=production` | [deploy](../runbooks/deploy.md#2-vercel) ขั้นที่ 3 |
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
| รูปแบบ JSON ของ rich menu (`size`, `selected`, `areas[].bounds`, postback `displayText`), endpoint อัปโหลดรูปที่ host ของ content และการลบหรือล้างเมนูที่ไม่มี (404) เอกสารของ LINE เปิดจากเครื่องที่สร้างไม่ได้ จึงเขียนตามที่รู้ ทดสอบตามข้อ 12 ของ [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) | `toLineRichMenu`, adapter ของ LINE, stub |
| Flex bubble ของการ์ดต้อนรับ: `background.type: linearGradient`, ขนาดรูป `xxs`, ป้ายปุ่มไม่เกิน 20 ตัว, `altText` ไม่เกิน 400 ตัว และการแสดงบน iOS, Android และ desktop ทดสอบตามข้อ 13 | `toFlexWelcome` |
| รายการเครื่องมือที่เหลือจากตอน scaffold: คำเตือนของ `next start` กับ standalone (ข้ออื่นยืนยันแล้ว) | [project-setup](../architecture/project-setup.md#11-สิ่งที่ต้องยืนยันตอน-scaffold) |

## สิ่งที่ยืนยันแล้ว

| เรื่อง | ผล | วันที่ |
| --- | --- | --- |
| รุ่นของ TypeScript | ใช้ 5.9 เพราะ typescript-eslint 8.73 รองรับต่ำกว่า 6.1 | 2026-11-18 |
| Docker ในสภาพแวดล้อมพัฒนา | เปิด daemon ได้ และดึง `postgres:17-alpine` กับ `node:24-alpine` ได้ | 2026-11-18 |
| สัญญาอนุญาตของ LINE Seed Sans TH | ไฟล์รุ่น 1.003 ที่เจ้าของงานส่งมาระบุ SIL Open Font License 1.1 ใน metadata ของฟอนต์ จึงเก็บใน repo ได้ ดู [ADR 0018](../adr/0018-use-line-seed-sans-th.md) | 2026-11-18 |
| Anthropic มี embedding ของตัวเองหรือไม่ | ไม่มี เอกสารทางการแนะนำผู้ให้บริการอื่น | 2026-11-18 |
| ข้อเท็จจริงของ Messaging API ที่ใช้ออกแบบการส่งและการตั้งค่า | (1) reply ที่ token หมดอายุหรือถูกใช้แล้วได้ 400 ที่ `message` ตรงกับ `Invalid reply token` ส่วน 400 ของ body ผิดรูปมี `details[].property` (2) `X-Line-Retry-Key` ใช้กับ push รับ UUID version 4 และ 5 และ LINE จำ key ไว้ 24 ชั่วโมง (3) ดาวน์โหลดวิดีโอได้ 202 ระหว่าง transcode และมี endpoint `content/transcoding` (4) ตรวจ Channel secret ได้ด้วย `POST /v2/oauth/accessToken` แบบ client credentials และเพิกถอนด้วย `POST /v2/oauth/revoke` (5) "Webhook redelivery" ส่งซ้ำเฉพาะเมื่อไม่ได้ 2xx พร้อม `isRedelivery: true` และ `webhookEventId` เดิม (6) แผนฟรี push ได้ราว 300 ข้อความต่อเดือน reply ไม่นับ ดู [ADR 0023](../adr/0023-retry-key-v5-window-and-reply-400.md) ข้อความ error จริงและ version 7 ของ retry key ยังทดสอบตาม [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) | 2026-11-19 |
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
