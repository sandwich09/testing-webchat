# ปัญหาที่พบบ่อยและการป้องกัน

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

ไฟล์นี้รวมความล้มเหลวที่ระบบแบบนี้ (webhook ของ LINE, งานหลังตอบบน serverless, การเรียก AI, Postgres ผ่าน Prisma, หน้าเว็บที่ polling) เกิดได้จริง แต่ละข้อบอกว่าโปรเจกต์นี้กันไว้ด้วยกลไกใด และถ้าเกิดขึ้นให้ตรวจอะไร ใช้ตอนออกแบบงานใหม่ ตอน review และตอนแก้ปัญหาใน production ไฟล์นี้ไม่ใช่เจ้าของกฎ: กฎและค่าจริงอยู่ในเอกสารที่ลิงก์ไป ถ้าไม่ตรงกันให้ถือเอกสารเจ้าของเรื่องและแก้ไฟล์นี้

สถานะของการป้องกัน: **ป้องกันแล้ว** (มีกลไกในโค้ด, test หรือ lint), **บางส่วน** (มีกลไกแต่ยังมีช่อง หรือพึ่งการ review อย่างเดียว), **ยังไม่มี** ข้อที่ยังไม่ป้องกันครบอยู่ใน[ช่องว่างที่ยังเหลือ](#ช่องว่างที่ยังเหลือ)

ชื่อ log ที่อ้างถึงคือค่าของ `LogEvent` ใน [`logger.port.ts`](../../src/core/ports/logger.port.ts)

## 1. LINE และ webhook

### L1. Event เดิมถูกประมวลผลซ้ำ

- **อาการ:** ข้อความเดียวขึ้นสองครั้งในแชท, `unreadCount` เพิ่มเกินจริง หรือ AI ตอบข้อความเดียวสองรอบ
- **สาเหตุ:** LINE ส่ง event ซ้ำ (เมื่อเปิด "Webhook redelivery") เมื่อ webhook ไม่ได้ตอบ 2xx รวม 503 ที่ระบบตอบเองเมื่อบันทึกทั้งก้อนไม่ได้ ([L6](#l6-webhook-ตอบช้าหรือตอบไม่สำเร็จจนถูกส่งซ้ำ)) ระบบที่กันซ้ำแบบอ่านก่อนแล้วจึงเขียนจะหลุดเมื่อสองคำขอมาพร้อมกัน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ตรวจ `webhookEventId` ใน `WebhookEvent` ก่อนทำงาน, บันทึก Message ขาเข้าด้วย `insertInboundIfAbsent` บน `lineMessageId` แบบ `ON CONFLICT DO NOTHING` ([data-model กฎของ repository ข้อ 1](../architecture/data-model.md#กฎของ-repository)), event ที่ส่งซ้ำไม่เก็บ reply token (`replyTokenExpiry` ใน [`line-send.logic.ts`](../../src/core/domain/line-send.logic.ts)) และข้อความเดิมไม่สร้างงาน `ai_reply` ใหม่ ([`receive-line-events.use-case.ts`](../../src/core/use-cases/receive-line-events.use-case.ts), fixture `e2e/fixtures/line/redelivery-duplicate.json`) test "stores a batch redelivered after the 5xx exactly once" ส่งก้อนเดิมซ้ำหลัง 503 สองครั้งแล้วได้ข้อความแถวเดียว
- **วิธีแก้เมื่อเกิด:** หา `line.webhook.event_duplicate` ใน log ถ้าไม่มีแต่ข้อความซ้ำ ให้ดูว่า `lineMessageId` ของสองแถวต่างกันหรือไม่ ถ้าต่างแปลว่าลูกค้าส่งสองครั้งจริง ถ้าเหมือนกันแปลว่า unique constraint หายจาก migration ให้ตรวจ schema ของฐานข้อมูล production

### L2. ตรวจ signature ไม่ผ่านทั้งที่ secret ถูก

- **อาการ:** LINE Developers Console ตรวจ webhook ไม่ผ่าน และข้อความไม่เข้า
- **สาเหตุ:** คำนวณ HMAC จาก body ที่ถูก parse แล้วแปลงกลับเป็น JSON ซึ่งไม่ตรงกับ byte ที่ LINE เซ็น หรือ channel secret ที่บันทึกเป็นของ channel อื่น
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว route อ่าน raw body เป็นข้อความก่อน parse ([infrastructure](../architecture/infrastructure.md#การรันใน-nextjs)), จำกัดขนาดด้วย `WEBHOOK_MAX_BODY_BYTES` และตรวจ signature ก่อนอ่านหรือเขียนอะไร
- **วิธีแก้เมื่อเกิด:** หา `line.webhook.signature_invalid` และ `line.webhook.not_configured` แล้วทำตาม "ปัญหาที่พบบ่อย" ใน [line-oa-setup](../runbooks/line-oa-setup.md#ปัญหาที่พบบ่อย) ถ้าเพิ่งออก secret ใหม่ ให้บันทึกในหน้าตั้งค่าทันทีตาม [operations](../runbooks/operations.md#หมุน-credential)

### L3. Reply token หมดอายุหรือถูกใช้สองครั้ง

- **อาการ:** ส่งด้วย reply แล้ว LINE ปฏิเสธ หรือแอดมินกับ AI ส่งพร้อมกันแล้วรายหนึ่งล้ม
- **สาเหตุ:** Reply token ใช้ได้ครั้งเดียวและมีอายุสั้น ถ้าเก็บไว้ใช้ภายหลังหรือให้สองผู้ส่งอ่าน token เดียวกันจะชนกัน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว token ใช้ได้ภายใน `REPLY_TOKEN_USABLE_MS`, ถูกใช้ด้วย compare-and-clear `consumeReplyToken` ([data-model กฎของ repository ข้อ 9](../architecture/data-model.md#กฎของ-repository)) และเมื่อ LINE ปฏิเสธ token ระบบ push ต่อ ([`deliver-outbound.ts`](../../src/core/use-cases/shared/deliver-outbound.ts)) "ปฏิเสธ token" คือ 400 ที่ข้อความตรง `Invalid reply token` เท่านั้น (`isReplyTokenRejection` ใน [`line-messaging-gateway.adapter.ts`](../../src/adapters/line/line-messaging-gateway.adapter.ts)) 400 อื่นเป็น `line.reply_failed` และไม่ push payload เดิมซ้ำซึ่งจะถูกปฏิเสธอีกและกินโควตา ([ADR 0023](../adr/0023-retry-key-v5-window-and-reply-400.md)) อายุจริงของ token ยังต้องยืนยันกับ LINE
- **วิธีแก้เมื่อเกิด:** `line.send.reply_token_rejected` บ่อยแปลว่า `REPLY_TOKEN_USABLE_MS` ยาวเกินอายุจริง ให้ลดค่าใน [project-setup](../architecture/project-setup.md#101-แกนกลาง) พร้อมแก้ test ถ้า `line.send.failed` มี `errorCode` เป็น `line.reply_failed` ให้ดูว่าข้อความผิดรูปแบบใน [L5](#l5-line-ปฏิเสธทั้งคำขอเพราะรูปแบบข้อความ) หรือ LINE เปลี่ยนข้อความของ token ที่ใช้ไม่ได้

### L4. ลูกค้าได้ข้อความซ้ำเมื่อระบบลองส่งใหม่

- **อาการ:** ลูกค้าเห็นข้อความเดียวกันสองครั้ง หลัง timeout หรือหลังแอดมินกด "ส่งอีกครั้ง"
- **สาเหตุ:** คำขอที่ timeout หรือได้ 5xx อาจถึงปลายทางแล้ว การส่งใหม่โดยไม่มี idempotency key, การ push ต่อหลัง reply ที่ไม่รู้ผล, key ในรูปแบบที่ LINE ไม่รับ หรือการส่งอีกครั้งหลังจาก LINE ลืม key แล้ว (24 ชั่วโมง) จึงเป็นข้อความที่สอง
- **การป้องกันในโปรเจกต์นี้:** บางส่วน push ทุกครั้งแนบ `X-Line-Retry-Key` ที่เป็น UUID version 5 ซึ่งได้จาก SHA-256 ของ id ของข้อความ (`toLineRetryKey` ใน [`line-messaging-gateway.adapter.ts`](../../src/adapters/line/line-messaging-gateway.adapter.ts)) จึงเป็นค่าเดิมทุกครั้งที่ลองใหม่และเป็นรูปแบบที่ LINE รับแน่นอน stub ปฏิเสธ key ที่ไม่ใช่ version 4 หรือ 5, reply ที่ล้มด้วยเหตุอื่นที่ไม่ใช่ token ถูกปฏิเสธจะไม่ push ต่อ, "ส่งอีกครั้ง" ใช้ push ด้วย key เดิมเสมอ รวมข้อความที่ถูกคืนสภาพจากการส่งที่ค้าง (`line.send_interrupted` ใน [M3](#m3-สถานะกลางทางค้างเมื่อ-function-ถูกตัด)) และถูกปฏิเสธด้วย `message.retry_expired` เมื่อผ่าน `LINE_RETRY_KEY_WINDOW_MS` นับจาก push ครั้งแรก (`Message.firstPushAt`) ฟองซ่อนปุ่มเองจาก `delivery.retryExpiresAt` ([line-messaging ส่งข้อความ](../specs/line-messaging.md#ส่งข้อความ), [ADR 0010](../adr/0010-reply-token-first-and-idempotency.md), [ADR 0023](../adr/0023-retry-key-v5-window-and-reply-400.md)) สิ่งที่ stub ยืนยันแทนไม่ได้: คำตอบ 409 พร้อม `x-line-accepted-request-id` เมื่อ key ซ้ำ (`isRetryKeyAlreadyAccepted`), อายุของ reply token และขีดความยาวกับจำนวนข้อความ แต่ละข้อมีขั้นทดสอบด้วยมือพร้อมผลที่ต้องได้ใน [line-oa-setup ทดสอบด้วยมือ](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) และติดตามใน [implementation-plan](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง) ข้อความที่ push ก่อน migration ที่เพิ่ม `firstPushAt` ไม่มีหน้าต่าง
- **วิธีแก้เมื่อเกิด:** ดู `line.send.failed` และ `line.send.succeeded` ของ `messageId` นั้นว่ามีกี่ครั้งและผ่าน `channel` ใด ถ้ามี push สองครั้งด้วย key เดียวกันภายในหน้าต่างแต่ลูกค้าได้สองข้อความ แปลว่าสมมติฐานเรื่อง retry key ผิด ให้หยุดปุ่มส่งอีกครั้งชั่วคราวและแก้ adapter `line.send.retry_expired` คือแอดมินกดหลังหน้าต่างผ่านแล้ว ซึ่งเป็นพฤติกรรมที่ตั้งใจ

### L5. LINE ปฏิเสธทั้งคำขอเพราะรูปแบบข้อความ

- **อาการ:** ข้อความยาวหรือคำตอบของ AI ส่งไม่ออกทั้งก้อน ด้วย 400
- **สาเหตุ:** LINE ปฏิเสธทั้งคำขอเมื่อข้อความหนึ่งว่าง ยาวเกิน หรือจำนวนข้อความต่อคำขอเกิน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว `splitLineText` แบ่งตาม `LINE_TEXT_MAX_CHARS` ที่ขอบ grapheme, `toOutboundParts` ไม่ส่งเกิน `LINE_MAX_PARTS_PER_REQUEST` ([`line-send.logic.ts`](../../src/core/domain/line-send.logic.ts)) และคำตอบของ AI ที่ว่างหลังทำความสะอาดถือว่าไม่ผ่าน schema ([ai-prompt ข้อ 6](../specs/ai-prompt.md#6-การทำความสะอาดคำตอบ)) ค่าขีดจำกัดยังต้องยืนยันกับ LINE
- **วิธีแก้เมื่อเกิด:** ดู `errorCode` ของ `line.send.failed` และข้อความใน `lastLineError` ของส่วนสถานะระบบ แล้วเทียบกับขีดจำกัดใน [project-setup](../architecture/project-setup.md#101-แกนกลาง)

### L6. Webhook ตอบช้าหรือตอบไม่สำเร็จจนถูกส่งซ้ำ

- **อาการ:** Event เดิมเข้ามาหลายรอบในช่วงที่ฐานข้อมูลหรือ LINE ช้า หรือข้อความของลูกค้าหายไปเงียบ ๆ ช่วงที่ฐานข้อมูลล่ม
- **สาเหตุ:** งานหนักหรือการเรียกภายนอกที่ retry ได้ทำก่อนตอบ 200 หรือ webhook ตอบ 200 ทั้งที่ไม่ได้บันทึกอะไร LINE จึงไม่ส่งซ้ำ
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ก่อนตอบทำแค่บันทึก และดึงโปรไฟล์ของลูกค้าใหม่ด้วย `LINE_PROFILE_TIMEOUT_MS` แบบไม่ retry งานอื่น (สื่อ, AI) อยู่ใน `after()` ([overview เส้นทางหลัก ข้อ 1](../architecture/overview.md#1-ลูกค้าส่งข้อความเข้ามา)) เมื่อทุก event ในก้อนล้มเหลว ไม่มีอะไรถูกบันทึก และ `settings.ping` ล้ม webhook ตอบ 503 `db.unavailable` และ log `line.webhook.batch_unstored` ให้ LINE ส่งซ้ำ ([line-messaging รับ event ข้อ 6](../specs/line-messaging.md#รับ-event-webhook)) ซึ่ง L1 กันผลซ้ำไว้แล้ว ก้อนที่บันทึกได้บางส่วน หรือ event ที่ล้มด้วยเหตุของตัวเอง ยังตอบ 200 การส่งซ้ำทำงานเมื่อเปิด "Webhook redelivery" ตาม [line-oa-setup ขั้นที่ 4](../runbooks/line-oa-setup.md#4-ตั้ง-webhook-ฝั่ง-line) เท่านั้น
- **วิธีแก้เมื่อเกิด:** ดู `durationMs` ของ `http.request.completed` ที่ `route` เป็น `/api/line/webhook` และ `line.profile.fetch_failed` ถ้า Neon เพิ่งตื่นจากการหลับ ครั้งแรกช้าเป็นปกติและ L1 กันผลซ้ำไว้แล้ว ถ้ามี `line.webhook.batch_unstored` ให้ตรวจการต่อฐานข้อมูลตาม [D5](#d5-connection-เต็มบน-serverless) และดูว่า "Webhook redelivery" เปิดอยู่ ไม่เช่นนั้นข้อความช่วงนั้นหาย

## 2. ข้อความและงานที่ทำพร้อมกัน

### M1. AI ตอบข้อความรัวทีละข้อ ตอบข้อความเก่า หรือตอบหลังถูกปิด

- **อาการ:** ลูกค้าพิมพ์สามบรรทัดแล้วได้สามคำตอบ, คำตอบไม่เห็นข้อความล่าสุด หรือ AI ยังส่งหลังแอดมินตอบเองหรือปิด kill switch
- **สาเหตุ:** งานหลายงานของลูกค้าคนเดียวทำพร้อมกันโดยไม่มีล็อก และเงื่อนไขถูกตรวจครั้งเดียวก่อนการเรียกโมเดลที่ใช้เวลานาน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว รอ `AI_DEBOUNCE_MS`, รอบที่มีข้อความใหม่กว่าถอนตัว, ล็อกต่อลูกค้าด้วย `tryAcquireAiLock`, ผู้ถือล็อกตอบต่อได้ไม่เกิน `AI_MAX_ROUNDS_PER_RUN` และตรวจ kill switch กับสวิตช์รายลูกค้าอีกครั้งก่อนส่ง ([use-cases GenerateAiReply](../architecture/use-cases.md#generateaireply), [ai-reply](../specs/ai-reply.md#เมื่อแอดมินตอบเอง))
- **วิธีแก้เมื่อเกิด:** เรียง log `ai.reply.superseded`, `ai.reply.locked`, `ai.reply.cancelled` และ `ai.reply.sent` ของ `contactId` นั้นตามเวลา ถ้าส่งหลังปิดสวิตช์ ให้หยุด AI ตาม [operations](../runbooks/operations.md#หยุด-ai-ทันที) ก่อนแก้

### M2. สองคำขอแก้แถวเดียวกันแล้วผลหนึ่งหาย

- **อาการ:** สถานะย้อนกลับ ค่าที่เพิ่งบันทึกถูกทับ หรือการลองใหม่สองครั้งพร้อมกันทำงานสองรอบ
- **สาเหตุ:** อ่านแถวขึ้นมาตัดสินใจแล้วจึงเขียน โดยไม่มีเงื่อนไขในคำสั่งเขียน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว การเปลี่ยนสถานะเป็น compare-and-set ในคำสั่งเดียว: `tryAcquireAiLock`, `consumeReplyToken`, `markPendingIfFailed`, `restartProcessing`, `setMediaStatus` บน `pending` และ `recordInbound` ที่ไม่ถอยหลังเมื่อ event มาไม่เรียง ([data-model กฎของ repository](../architecture/data-model.md#กฎของ-repository)) ชุดทดสอบของ port รันกับ Postgres จริง
- **วิธีแก้เมื่อเกิด:** หาคำสั่งเขียนที่ `where` มีแค่ id แล้วเปลี่ยนเป็นเงื่อนไขบนสถานะเดิม เพิ่ม test ใน suite ของ port นั้นที่ยิงสองคำขอพร้อมกัน

### M3. สถานะกลางทางค้างเมื่อ function ถูกตัด

- **อาการ:** แชทแสดงว่า AI กำลังตอบไม่จบ, ไฟล์ในคลังความรู้ค้าง "กำลังอ่านไฟล์" โดยไม่มีปุ่ม, รูปขาเข้าเป็น skeleton ตลอด หรือข้อความของแอดมินค้าง "กำลังส่ง" และกดส่งอีกครั้งไม่ได้
- **สาเหตุ:** Serverless function ถูกหยุดเมื่อถึง `maxDuration` หรือเมื่อ deploy ใหม่ บล็อก `finally` และงานใน `after()` ที่ยังไม่จบจึงไม่ได้รัน และ LINE ไม่ส่ง event ซ้ำเพราะ webhook ตอบ 200 ไปแล้ว
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ทุกสถานะกลางทางมีการคืนสภาพด้วย compare-and-set คำสั่งเดียว (`UPDATE ... RETURNING`) ที่เรียกจากเส้นทางอ่านที่หน้าจอ poll อยู่แล้ว แต่ละแถวจึงกลับไปที่ผู้เรียกคนเดียวแม้หลายแท็บเรียกพร้อมกัน ([data-model กฎของ repository ข้อ 13](../architecture/data-model.md#กฎของ-repository)): `aiState = replying` เก่ากว่า `AI_STUCK_AFTER_MS` คืนเป็นรอแอดมินเมื่อโหลดรายชื่อ (`recoverStuckAiStates`, [ai-reply งานที่ค้าง](../specs/ai-reply.md#งานที่ค้าง)), `KbDocument` ที่ `processing` เก่ากว่า `KNOWLEDGE_STUCK_AFTER_MS` เป็น `failed` ด้วย `knowledge.extract_interrupted` เมื่อโหลดรายการไฟล์ (`failStuckProcessing` ใน [`list-documents.use-case.ts`](../../src/core/use-cases/list-documents.use-case.ts)), สื่อขาเข้าที่ `pending` เก่ากว่า `MEDIA_STUCK_AFTER_MS` (ระหว่างที่ LINE ยังเตรียมไฟล์ งานคง `pending` เฉพาะเมื่องบ `MEDIA_JOB_BUDGET_MS` ยังพอสำหรับการลองครั้งถัดไป ไม่เช่นนั้นเป็น `failed` ทันที) และข้อความขาออกที่ `pending` นานกว่า `SEND_STUCK_AFTER_MS` นับจากเวลาเริ่มส่งรอบนั้น (`Message.deliveryAttemptAt`) เป็น `failed` (ข้อความขาออกด้วย `line.send_interrupted`) เมื่อโหลดข้อความของแชท (`failStuckMedia` และ `failStuckDeliveries` ใน [`get-messages.use-case.ts`](../../src/core/use-cases/get-messages.use-case.ts)) ปุ่ม "ลองใหม่" และ "ส่งอีกครั้ง" ที่มีอยู่ใช้ได้ทันที ทุกเวลามากกว่าเวลาแย่ที่สุดของงานและ `maxDuration` ซึ่ง [`timing-budget.spec.ts`](../../src/composition/timing-budget.spec.ts) ตรึงไว้ จึงไม่ตัดงานที่ยังทำอยู่ ชุดทดสอบของ port ([`message-repository.suite.ts`](../../src/adapters/fakes/suites/message-repository.suite.ts), [`knowledge-repository.suite.ts`](../../src/adapters/fakes/suites/knowledge-repository.suite.ts)) รันกับตัวปลอมและ Postgres รวมผู้เรียกพร้อมกัน
- **วิธีแก้เมื่อเกิด:** ดู `ai.reply.stuck_recovered`, `knowledge.ingest.stuck_recovered`, `media.store.stuck_recovered`, `line.send.stuck_recovered` และ `job.run.failed` และดู log ของ Vercel ว่า function ถูกตัดเพราะเวลาหรือไม่ การคืนสภาพเกิดเองเมื่อมีคนเปิดหน้าจอนั้น ถ้าเห็นบ่อย ให้หาสาเหตุของเวลาที่เกิน (ดู [A2](#a2-timeout-ไม่สัมพันธ์กับงานและเพดานเวลาของ-function)) ห้ามลดเวลาของการคืนสภาพให้ต่ำกว่าเวลาแย่ที่สุดของงาน

### M4. ความล้มเหลวที่ไม่มีใครเห็น

- **อาการ:** ลูกค้าไม่ได้คำตอบ และไม่มีอะไรบนหน้าจอบอกแอดมิน
- **สาเหตุ:** ข้อผิดพลาดถูกบันทึกแค่ใน log ที่เก็บไว้ไม่นานและไม่มีใครเปิด
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ทุกความล้มเหลวที่แอดมินต้องรู้มีสถานะในฐานข้อมูล: แชทขึ้นรอแอดมินพร้อมเหตุผลและบรรทัดเหตุการณ์, ข้อความเป็น `failed` พร้อมรหัส และ `lastLineError` กับ `lastAiError` ในส่วนสถานะระบบ ([ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md)) งานหลังตอบถูกห่อด้วย `runJob` ซึ่ง log `job.run.failed`
- **วิธีแก้เมื่อเกิด:** เริ่มที่ส่วนสถานะระบบในหน้าตั้งค่า แล้วทำตาม [operations](../runbooks/operations.md#ai-ไม่ตอบ) งานใหม่ที่ล้มได้ต้องมีสถานะหรือเหตุผลที่หน้าจอเห็น ไม่ใช่แค่ log

## 3. AI

### A1. คำตอบที่ถูกตัดหรือผิดรูปถึงมือลูกค้า

- **อาการ:** ลูกค้าได้ JSON ครึ่งก้อน, markdown ดิบ หรือประโยคขาด
- **สาเหตุ:** คำตอบที่หยุดเพราะ `max_tokens` หรือไม่ตรง schema ถูกนำไปส่งต่อแบบ "พยายามกู้"
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว อ่าน `stop_reason` ก่อนเนื้อหา (`max_tokens` เป็น `truncated`) ใน [`claude.mapper.ts`](../../src/adapters/claude/claude.mapper.ts), ตรวจผลด้วย zod, ทำความสะอาดด้วย `sanitizeAiReply` ซึ่งคืน null เมื่อว่างหรือยาวเกิน `AI_REPLY_MAX_CHARS` และเมื่อไม่ผ่านจะส่งต่อแอดมิน ไม่ส่งข้อความของโมเดล ([ai-prompt ข้อ 5.4 และ 6](../specs/ai-prompt.md#6-การทำความสะอาดคำตอบ))
- **วิธีแก้เมื่อเกิด:** ดู `ai.reply.handoff` และรหัส `ai.truncated` หรือ `ai.invalid_output` ใน `lastAiError` ห้ามแก้ด้วยการตัดข้อความหรือ parse แบบหลวมขึ้น ให้แก้ prompt หรือ `AI_MAX_TOKENS`

### A2. Timeout ไม่สัมพันธ์กับงานและเพดานเวลาของ function

- **อาการ:** งานอ่านเอกสารหรือคำถามแรกหลัง cache เย็นล้มด้วย timeout ทั้งที่โมเดลใกล้ตอบเสร็จ, ลูกค้าได้ "ระบบช้า" ทั้งที่ระบบไม่ได้ช้า หรือ function ถูกตัดกลางงาน
- **สาเหตุ:** ใช้ timeout ของงานแชทกับงานเอกสาร, ผู้เรียกรอสั้นกว่าผลรวมของ timeout × จำนวนครั้งที่ลองของผู้ถูกเรียก หรือผลรวมนั้นยาวกว่า `maxDuration` ของ function
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว timeout แยกตามงาน และทุกการเรียกภายนอกมีเพดานรวมของตัวเอง: LINE ผ่าน `LINE_RETRY_AFTER_MAX_MS` และ Claude ผ่าน `callDeadlineMs` ซึ่งส่ง `signal` ที่ตัดทั้งการเรียก รวม stream ของการแปลง PDF ที่ timeout ของ SDK ไม่ครอบ และการรอ `Retry-After` ([domain-and-ports](../architecture/domain-and-ports.md#เวลาสูงสุดของการเรียกหนึ่งครั้ง)) งานที่รอผู้ให้บริการ (สื่อขาเข้าที่ LINE ยังเตรียมไม่เสร็จ) วัดเวลาที่ใช้ไปแล้วเทียบกับงบของงาน (`MEDIA_JOB_BUDGET_MS`) ก่อนเริ่มทุกขั้น และค่าสำรองของแกนกลาง (`MEDIA_CONTENT_CALL_WORST_MS`, `MEDIA_STATUS_CALL_WORST_MS`) ถูกตรึงว่าไม่ต่ำกว่าเวลาแย่ที่สุดของ adapter เวลาแย่ที่สุดของงานหลังตอบทุกงานคำนวณจากค่าคงที่จริงใน [`timing-budget.ts`](../../src/composition/timing-budget.ts) และ [`timing-budget.spec.ts`](../../src/composition/timing-budget.spec.ts) ตรึงทุกอสมการ (งานต่ำกว่า 0.9 × `maxDuration` ที่อ่านจากไฟล์ route, เวลาคืนสภาพทุกตัวมากกว่างานและ `maxDuration`) ค่าที่เปลี่ยนเพื่อให้พอดีและเหตุผลอยู่ใน [project-setup ข้อ 10.4 "เวลาแย่ที่สุด"](../architecture/project-setup.md#104-adapter-และ-route): `WEBHOOK_MAX_DURATION_S` 120 → 300, `CLAUDE_REPLY_TIMEOUT_MS` 45000 → 25000 และ `CLAUDE_EXTRACT_TIMEOUT_MS` 240000 → 120000 เพดาน 300 วินาทีของ Vercel ยังต้องยืนยัน
- **วิธีแก้เมื่อเกิด:** ดู `durationMs` ของ `ai.model.called`, `guard.checked` และรหัส `ai.no_response`, `ai.unavailable` หรือ `ai.rate_limited` ถ้างานยาวกว่าที่คาด ให้แก้ค่าที่ตารางใน project-setup แล้วรัน `timing-budget.spec.ts` ซึ่งจะบอกอสมการที่ไม่ผ่าน (ผู้เรียกต้องรอนานกว่าผู้ถูกเรียกทุกครั้งที่ลอง และทั้งหมดต้องอยู่ใต้ `maxDuration` พร้อมส่วนเผื่อ)

### A3. ค่าใช้จ่าย AI ที่ไม่ถูกบันทึก

- **อาการ:** ยอดในหน้าค่าใช้จ่ายต่ำกว่าบิลของผู้ให้บริการ และงบต่อวันตัดช้ากว่าที่ควร
- **สาเหตุ:** บันทึกค่าใช้จ่ายเฉพาะเมื่อได้คำตอบ ขณะที่คำขอที่ timeout หรือถูกลองใหม่อาจถูกคิดเงินแล้ว
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ทุกคำตอบของ API ถูกบันทึกเป็น `AiUsage` รวมการคัดกรองและการแปลง PDF ที่ถูกปฏิเสธหลังแปลง และโมเดลที่ไม่อยู่ในตารางคิดด้วยราคาสูงสุด (`ai.price_unknown_model`) การเรียกที่ส่งไปแล้วไม่ได้คำตอบ (timeout, ถูกตัดที่ `callDeadlineMs`, การเชื่อมต่อหลุด, stream ขาด) ได้รหัส `ai.no_response` จาก [`claude.mapper.ts`](../../src/adapters/claude/claude.mapper.ts) และมีแถว `outcome = failed` ยอดเป็นศูนย์ (`noResponseUsage` ใน [`usage.logic.ts`](../../src/core/domain/usage.logic.ts)) ทั้งการตอบแชท การคัดกรอง กล่องทดลอง และการแปลง PDF หน้าค่าใช้จ่ายแสดงจำนวนของเดือน (`noResponseCount`) ([usage-cost การเรียกที่ไม่ได้คำตอบ](../specs/usage-cost.md#การเรียกที่ไม่ได้คำตอบ)) ข้อจำกัดที่ยอมรับ: retry ภายใน SDK อยู่ในการเรียกเดียว จึงนับเป็นหนึ่งแถว และ attempt ที่ timeout ก่อน attempt ที่ได้คำตอบไม่ถูกนับ
- **วิธีแก้เมื่อเกิด:** ทำตาม [operations ค่าใช้จ่าย AI ไม่ตรงกับบิล](../runbooks/operations.md#ค่าใช้จ่าย-ai-ไม่ตรงกับบิล): เทียบยอดเดือนกับ console ของผู้ให้บริการ และดูจำนวนการเรียกที่ไม่ได้คำตอบใต้ตารางค่าใช้จ่าย ระหว่างแก้ให้ลดงบต่อวัน

### A4. ข้อความของลูกค้าหรือ PDF สั่งให้ AI ทำนอกเรื่อง

- **อาการ:** AI ตอบนอกหัวข้อ ยกราคาหรือเงื่อนไขที่ไม่มีในคลังความรู้ หรือส่งลิงก์ที่มาจากข้อความของลูกค้าหรือจากในไฟล์
- **สาเหตุ:** ข้อความที่ไว้ใจไม่ได้อยู่ใน context เดียวกับคำสั่ง และการกรองที่ทำแค่ใน prompt ถูกหลบได้
- **การป้องกันในโปรเจกต์นี้:** บางส่วน AI ไม่มีเครื่องมือ, คำสั่งระบบไม่มีความลับ, เนื้อหา PDF ถูกแยกจากคำสั่ง, ขอบเขตหัวข้อตรวจแยกและปิดแบบปลอดภัยเมื่อไม่แน่ใจ ([threat-model](../security/threat-model.md#ภัยและการรับมือ), [ADR 0020](../adr/0020-topic-guardrail-as-separate-check.md)) ลิงก์ป้องกันแล้ว: หลังทำความสะอาด คำตอบที่มี URL (`http`/`https`, `www.` หรือ domain ที่มี path) ซึ่งไม่อยู่ในคลังความรู้หรือคำแนะนำของร้านไม่ถูกส่ง แชทขึ้นรอแอดมินด้วย `ai.link_not_allowed` (`disallowedLinks` ใน [`reply-links.logic.ts`](../../src/core/domain/reply-links.logic.ts), [ai-prompt ข้อ 6.1](../specs/ai-prompt.md#61-ลิงก์ในคำตอบ)) และชุดคำถามวัดคุณภาพมีข้อ C6, C7 กับการตรวจลิงก์ทุกข้อ ที่ยังเหลือ: ราคาและเงื่อนไขที่ไม่มีในคลังกันด้วย prompt อย่างเดียว และลิงก์ที่แฝงใน PDF ถือว่าร้านเขียน
- **วิธีแก้เมื่อเกิด:** ปิด AI ตอบแทนของลูกค้าคนนั้นหรือปิด kill switch, อ่านข้อความที่แปลงจาก PDF ในหน้าตั้งค่าว่ามีคำสั่งแฝงหรือไม่ ([operations คลังความรู้](../runbooks/operations.md#คลังความรู้)) แล้วเพิ่มกรณีนั้นในชุดคำถามวัดคุณภาพ ([ai-prompt ข้อ 8](../specs/ai-prompt.md#8-ชุดคำถามวัดคุณภาพ-ai)) ซึ่งรันเมื่อเจ้าของงานสั่งเท่านั้น

### A5. ข้อมูลภายในหลุดถึงผู้ใช้

- **อาการ:** ลูกค้าหรือแอดมินเห็นรหัส error ดิบ, id หรือ path ของระบบ
- **สาเหตุ:** ส่งข้อความของ error หรือข้อความที่โมเดลแต่งเองออกไปตรง ๆ
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว เมื่อส่งต่อแอดมิน ลูกค้าได้ข้อความตายตัว ไม่ใช่ข้อความของโมเดล ([ai-prompt ข้อ 5.4](../specs/ai-prompt.md#54-จากผลไปสู่การกระทำ)) และหน้าเว็บแปลงรหัสเป็นภาษาไทยจากตาราง `Record` ที่ขาด key ไม่ได้ ([`error-messages.ts`](../../src/common/error-messages.ts), [error-catalog](../architecture/error-catalog.md))
- **วิธีแก้เมื่อเกิด:** เพิ่มรหัสที่หลุดเข้า error-catalog และ `ERROR_CODES` แล้วให้ typecheck ชี้จุดที่ต้องเติม

### A6. โมเดลที่ตั้งไว้ไม่ได้ตอบ

- **อาการ:** ทุกแชทขึ้นรอแอดมินพร้อมกัน, ขอบเขตหัวข้อปฏิเสธทุกข้อความ หรือราคาต่อข้อความกระโดด
- **สาเหตุ:** โมเดลใช้ไม่ได้กับบัญชี ถูกเลิก หรือ server สลับไปโมเดลอื่นที่ราคาต่างกัน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ต้นทุนคิดจากโมเดลที่ API รายงานว่าตอบจริง และโมเดลที่ไม่รู้ราคาคิดราคาสูงสุด ([usage-cost](../specs/usage-cost.md), [ADR 0021](../adr/0021-explicit-cache-marker-and-fallback-per-model.md)) การคัดกรองที่ล้มเหลวปิดแบบปลอดภัย และกล่องทดลองในหน้าตั้งค่าเรียกโมเดลของการคัดกรองจริง
- **วิธีแก้เมื่อเกิด:** ดู `lastAiError` และ `guard.failed` แล้วใช้กล่องทดลองของขอบเขตหัวข้อตรวจ (มีค่าใช้จ่าย) ถ้าโมเดลใช้ไม่ได้ ให้เปลี่ยนโมเดลในหน้าตั้งค่าหรือปิดขอบเขตหัวข้อชั่วคราว

## 4. ฐานข้อมูลและ migration

### D1. แก้หรือลบ migration ที่ apply ไปแล้ว

- **อาการ:** `prisma migrate deploy` ใน build ของ production ล้มด้วย checksum ไม่ตรงหรือหาไฟล์ไม่เจอ และ deploy ไม่ผ่าน
- **สาเหตุ:** ไฟล์ใน `prisma/migrations/` ถูกแก้ จัดรูปแบบใหม่ หรือลบหลังจาก apply ไปแล้ว ทำให้ประวัติใน repo ไม่ตรงกับตาราง `_prisma_migrations`
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ขั้น `pnpm migrations:immutable` ในงาน `check` ของ CI ([`ci.yml`](../../.github/workflows/ci.yml)) เทียบกับ base (first parent เมื่ออยู่บน `main`, merge base กับ `origin/main` เมื่ออยู่ branch อื่น) และล้มเมื่อไฟล์ใน `prisma/migrations/<name>/` ที่มีอยู่แล้วถูกแก้ ลบ เปลี่ยนชื่อ หรือมีไฟล์เพิ่ม การเพิ่ม directory ใหม่ทำได้ กฎอยู่ใน [`migrations.logic.ts`](../../scripts/migrations.logic.ts) ([test](../../e2e/migrations.unit.ts)) และสั่งรันเองได้ด้วยคำสั่งเดียวกัน (ดู [project-setup ข้อ 5](../architecture/project-setup.md#5-packagejson))
- **วิธีแก้เมื่อเกิด:** คืนไฟล์ให้ตรงกับ commit ที่ apply ทุก byte จากประวัติของ Git แล้วเขียนการเปลี่ยนเป็น migration ใหม่ ห้ามแก้ตาราง `_prisma_migrations` ใน production โดยไม่ถามเจ้าของงาน

### D2. Migration ที่ทำให้ย้อนกลับไม่ได้

- **อาการ:** Deploy ใหม่ล้มหลัง migration ผ่านแล้ว หรือเลื่อน deployment ก่อนหน้าขึ้นแล้วโค้ดรุ่นก่อนพังกับโครงตารางใหม่
- **สาเหตุ:** Build ของ production รัน migration ก่อน build แอป ฐานข้อมูลจึงเปลี่ยนแม้ build ล้ม และ migration ที่ลบหรือเปลี่ยนชนิดคอลัมน์ทำให้โค้ดรุ่นก่อนใช้ไม่ได้
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว กฎให้ migration เป็นแบบเพิ่มเท่านั้น และการลบหรือเปลี่ยนชนิดทำสองขั้นหลังถามเจ้าของงาน ([deploy ย้อนกลับ](../runbooks/deploy.md#ย้อนกลับ), [AGENTS.md](../../AGENTS.md)) ขั้น `pnpm migrations:destructive` ในงาน `check` สแกนเฉพาะไฟล์ migration ที่การเปลี่ยนนั้นเพิ่มใหม่ และล้มเมื่อมี `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`, `RENAME`, `TRUNCATE` หรือ `DELETE FROM` ที่ไม่มี `WHERE` (ไม่นับใน comment และ string literal) เว้นแต่ไฟล์มีบรรทัด `-- approved-destructive: <เหตุผล>` (ต้นบรรทัด เหตุผลไม่ว่าง) ซึ่งใส่ได้หลังเจ้าของงานอนุมัติเท่านั้น บรรทัดนี้ทำให้การตัดสินใจอยู่ใน diff ให้ reviewer เห็น แต่ไม่พิสูจน์ว่าเจ้าของงานอนุมัติจริง ส่วนนั้นยังเป็นกฎของ AGENTS.md คำสั่งอื่นที่เปลี่ยนข้อมูลโดยไม่อยู่ในรายการ (เช่น `UPDATE` ไม่มี `WHERE`, `SET NOT NULL`, `DROP INDEX`) ตรวจด้วย review กฎอยู่ใน [`migrations.logic.ts`](../../scripts/migrations.logic.ts) ([test](../../e2e/migrations.unit.ts))
- **วิธีแก้เมื่อเกิด:** ทำตาม [deploy ย้อนกลับ](../runbooks/deploy.md#ย้อนกลับ) ถ้าโค้ดรุ่นก่อนใช้กับตารางใหม่ไม่ได้ ให้แก้ไปข้างหน้าด้วย PR ใหม่แทนการย้อน

### D3. โค้ดกับฐานข้อมูลรับค่าไม่ตรงกัน

- **อาการ:** Insert ล้มใน production ด้วยค่า enum หรือ constraint ทั้งที่ test ผ่าน
- **สาเหตุ:** เพิ่มค่าใหม่ใน type หรือ schema ของ API แต่ไม่เพิ่มใน enum หรือ check constraint ของฐานข้อมูล
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว enum ของ Prisma ถูกแปลงด้วย mapper ที่ใช้ type ที่ generate ค่าที่ไม่ตรงจึงล้มตอน typecheck ([data-model กฎของ repository ข้อ 5](../architecture/data-model.md#กฎของ-repository)) และ adapter test สร้างฐานข้อมูลจาก migration จริงทุกครั้ง SQL ที่เขียนเองด้วย `$queryRaw` ไม่ถูกตรวจด้วย type จึงต้องมี adapter test
- **วิธีแก้เมื่อเกิด:** อ่าน constraint ที่ล้มจาก error ของ Postgres แล้วเพิ่ม migration ที่เพิ่มค่า พร้อม adapter test ที่เขียนค่าทุกค่าของ enum นั้น

### D4. ตัวปลอมทำงานไม่เหมือนฐานข้อมูลจริง

- **อาการ:** Unit test ผ่าน แต่ของจริงค้นหาผิด (เช่น `_` หรือ `%` ในคำค้นเป็น wildcard), เรียงลำดับต่าง หรือไม่รู้ว่าเป็นค่าซ้ำ
- **สาเหตุ:** ตัวปลอมจำลองตัวดำเนินการของฐานข้อมูลแบบง่ายเกิน หรือโค้ดอ่าน error ของ driver ผิดรูปแบบ
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว แต่ละ port มีชุดทดสอบเดียวที่รันกับทั้งตัวปลอมและตัวจริง ([test-strategy](../qa/test-strategy.md#กฎ), [ADR 0012](../adr/0012-testing-with-fakes-and-stubs.md)), คำค้น escape `\`, `%`, `_` (`containsPattern` ใน [`contact.repository.ts`](../../src/adapters/prisma/contact.repository.ts)) และค่าซ้ำดูจาก `code` ของ error เท่านั้น ([`prisma-error.ts`](../../src/adapters/prisma/prisma-error.ts))
- **วิธีแก้เมื่อเกิด:** เขียนกรณีที่ต่างลงใน suite ของ port ให้ตัวจริงแดงก่อน แล้วแก้ตัวปลอมหรือ adapter จนทั้งคู่ผ่าน

### D5. Connection เต็มบน serverless

- **อาการ:** Error ว่าเชื่อมต่อฐานข้อมูลไม่ได้หรือเกินจำนวน เมื่อมีคำขอพร้อมกันหลายตัว
- **สาเหตุ:** แต่ละ instance ของ function เปิด pool ของตัวเอง ใช้ connection แบบตรงแทนแบบ pooled หรือสร้าง client ใหม่ทุก hot reload
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว แอปใช้ `DATABASE_URL` แบบ pooled และ migration ใช้ `DIRECT_URL` ([deploy](../runbooks/deploy.md#1-ฐานข้อมูล-neon)), pool ของแต่ละ process ไม่เกิน `POOL_MAX` และ client เดียวต่อ process ([`prisma-client.ts`](../../src/adapters/prisma/prisma-client.ts))
- **วิธีแก้เมื่อเกิด:** ตรวจใน Vercel ว่า `DATABASE_URL` เป็นแบบ pooled ดูจำนวน connection ใน Neon แล้วหา route ที่สร้าง client เอง

### D6. ผลรวมหรือรายการที่ได้เฉพาะหน้าแรก

- **อาการ:** ยอดรวมหยุดที่ค่าหนึ่ง แถวซ้ำหรือหายเมื่อเลื่อนหน้า
- **สาเหตุ:** รวมยอดจากหน้าแรกของรายการ หรือแบ่งหน้าด้วยคอลัมน์ที่ค่าไม่ unique
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ยอดรวมคำนวณด้วย aggregate ใน SQL (`sumCost` ใน [`usage.repository.ts`](../../src/adapters/prisma/usage.repository.ts)), cursor ของรายชื่อใช้ `{ sortAt, id }` และ polling บอก `hasMore` ([api-contract](../architecture/api-contract.md#protocol-ของ-polling))
- **วิธีแก้เมื่อเกิด:** เพิ่ม test ที่มีแถวมากกว่าหนึ่งหน้าและค่าการเรียงซ้ำกัน แล้วเพิ่ม id เป็นตัวตัดสินในการเรียง

## 5. เวลาและเงิน

### T1. วันตามเวลาไทยกับวันของ UTC

- **อาการ:** งบต่อวันเริ่มนับใหม่ตอน 07:00, ช่วงเดือนขาดวันสุดท้าย หรือวันที่บนหน้าจอเลื่อนไปหนึ่งวันระหว่าง 00:00 ถึง 07:00
- **สาเหตุ:** Server และ CI รันเป็น UTC แต่ธุรกิจนับวันตามเวลาไทย และช่วงที่ปลายเป็น "ถึงเที่ยงคืน" แบบรวมปลายตัดวันสุดท้าย
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว `bangkokDayRange` และ `bangkokMonthRange` คืนช่วง `[from, to)` ([`time.logic.ts`](../../src/core/domain/time.logic.ts)), หน้าเว็บจัดรูปแบบด้วย `timeZone` ของกรุงเทพฯ ([`common.logic.ts`](../../src/common/common.logic.ts)), แกนกลางอ่านเวลาผ่าน `Clock` เท่านั้น (lint), unit test และ CI รันเป็น UTC และ Playwright รันเป็น `Asia/Bangkok` ([test-strategy](../qa/test-strategy.md#กฎ))
- **วิธีแก้เมื่อเกิด:** เขียน test ด้วย `FakeClock` ที่เวลา 23:59 และ 00:01 ตามเวลาไทย (16:59 และ 17:01 UTC) ให้แดงก่อนแก้ ห้ามแก้ด้วยการตั้ง `TZ` ของ server

### T2. เงินคลาดเพราะ float

- **อาการ:** ยอดรวมต่างจากผลบวกของรายการเล็กน้อย หรือเลขท้ายเปลี่ยนเมื่อแสดงผล
- **สาเหตุ:** คำนวณหรือแปลงเงินผ่าน `number`
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว เงินเป็น `NanoUsd` (`bigint`), คอลัมน์เป็น `Decimal(18, 9)` ที่แปลงผ่าน string ([data-model กฎของ repository ข้อ 5](../architecture/data-model.md#กฎของ-repository)) และ `formatUsd` ปัดครึ่งขึ้นด้วยจำนวนเต็ม ([`money.logic.ts`](../../src/core/domain/money.logic.ts))
- **วิธีแก้เมื่อเกิด:** หาจุดที่เรียก `Number(...)` หรือ `parseFloat` กับเงิน แล้วเพิ่ม test ที่ขอบการปัด

## 6. การเข้าถึงและความปลอดภัย

### S1. เปลี่ยนรหัสเข้าใช้แล้วคนเดิมยังเข้าได้

- **อาการ:** หลังแก้ `ACCESS_CODE` และ deploy ใหม่ เบราว์เซอร์ที่เคยเข้าระบบยังใช้งานได้จนกว่า cookie หมดอายุ
- **สาเหตุ:** Cookie ถูกเซ็นด้วย key ที่ไม่ขึ้นกับรหัส การเปลี่ยนรหัสจึงไม่ทำให้ cookie เดิมใช้ไม่ได้
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว key ของ cookie สร้างด้วย HKDF จาก `SESSION_SECRET` โดย info มี SHA-256 ของ `ACCESS_CODE` ([`hmac-access-token-signer.adapter.ts`](../../src/adapters/system/hmac-access-token-signer.adapter.ts)) การเปลี่ยนรหัสหรือ secret จึงทำให้ cookie เดิมใช้ไม่ได้ทันทีหลัง deploy ระบบไม่เก็บรหัส และการเทียบรหัสยังเป็นเวลาคงที่ ([access-gate ข้อ 6](../specs/access-gate.md#พฤติกรรม)) ชุดทดสอบของ port ตรวจว่า token จากรหัสอื่นที่ secret เดียวกันถูกปฏิเสธ ([`access-token-signer.suite.ts`](../../src/adapters/fakes/suites/access-token-signer.suite.ts))
- **วิธีแก้เมื่อเกิด:** เมื่อต้องตัดคนเดิมออก (รวมขั้น "ปิดระบบหลังส่งงาน") ให้เปลี่ยน `ACCESS_CODE` แล้ว deploy ใหม่ตาม [operations](../runbooks/operations.md#หมุน-credential) ถ้ายังมีคนเข้าได้ ให้ตรวจว่า deployment ใหม่ขึ้นเป็น production แล้วจริง

### S2. การจำกัดความถี่นับผิดคน

- **อาการ:** ผู้ใช้จริงถูกจำกัดทั้งที่ยังไม่ได้ลอง หรือสคริปต์เดารหัสได้ไม่จำกัด
- **สาเหตุ:** อ่าน IP จาก header ที่ผู้เรียกปลอมได้ หรือ proxy เติม IP ของตัวเอง ทุกคนจึงตกอยู่ใน key เดียวกันหรือได้ key ใหม่ทุกคำขอ
- **การป้องกันในโปรเจกต์นี้:** บางส่วน (ป้องกันแล้วในโค้ด ยังต้องยืนยันบน Vercel) `clientIpOf` อ่านเฉพาะค่าสุดท้ายของ `x-forwarded-for` ซึ่ง proxy ที่ใกล้ที่สุดเขียนและผู้เรียกเลือกไม่ได้ ไม่ว่า Vercel จะแทนที่หรือต่อท้าย header ไม่อ่าน `x-real-ip` และ IPv6 นับต่อ /64 ([`http-request.ts`](../../src/composition/http-request.ts), [infrastructure IP ของผู้เรียก](../architecture/infrastructure.md#ip-ของผู้เรียก), [ADR 0022](../adr/0022-client-ip-from-last-forwarded-hop.md)) คำขอที่ไม่มี IP ของการลองรหัสนับในถังแยก `RATE_LIMIT_UNLOCK_NO_IP` ที่เข้มกว่า ผู้ที่มี IP จึงไม่ถูกล็อกตาม และทุกคำขอแบบนั้น log `access.unlock.client_ip_missing` ([`unlock-access.use-case.ts`](../../src/core/use-cases/unlock-access.use-case.ts)) พฤติกรรมของ header บน Vercel จริงยังต้องยืนยันตามขั้นใน [implementation-plan](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง)
- **วิธีแก้เมื่อเกิด:** ดู `access.unlock.rate_limited` และ `access.unlock.client_ip_missing` ถ้ามีคนถูกจำกัดพร้อมกันหลายคน แปลว่า IP เป็นค่าเดียวกันหรือ proxy ไม่ส่ง IP ให้รอหน้าต่างหมดแล้วตรวจ header ที่ Vercel ส่งจริงตามขั้นใน implementation-plan ห้ามแก้ด้วยการตั้ง `RATE_LIMIT_SCALE` ใน production

### S3. ค่า environment ของ production ไม่ตรงกับที่โค้ดคาด

- **อาการ:** Production ทำงานเหมือนเครื่อง dev (ส่งไป stub, จำกัดความถี่หลวม, ไฟล์หายหลัง deploy) หรือพฤติกรรมไม่ตรงกับโค้ดที่ deploy
- **สาเหตุ:** ค่าที่ใช้เฉพาะการทดสอบถูกตั้งใน production หรือค่าที่ถูกรูปแบบแต่ผิดความหมาย การตรวจตอนเริ่มระบบจับได้แค่ค่าที่ขาดหรือผิดรูปแบบ
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว environment ทุกตัวถูกตรวจด้วย schema ตอนเริ่มระบบและล้มพร้อมบอกชื่อ ([`env.ts`](../../src/composition/env.ts), [infrastructure](../architecture/infrastructure.md#environment-variable)) เมื่อ `VERCEL_ENV` เป็น `production` (Vercel ตั้งให้เอง) schema ปฏิเสธเพิ่ม: `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL` หรือ `ANTHROPIC_BASE_URL` ที่ถูกตั้งไม่ว่าค่าใด, `FILE_STORAGE=local` และ `RATE_LIMIT_SCALE` ที่ไม่ใช่ 1 โดยบอกชื่อ ไม่บอกค่า ([project-setup ข้อ 6.10](../architecture/project-setup.md#610-envexample), `env.spec.ts`) Docker, CI และเครื่อง dev ไม่มี `VERCEL_ENV` จึงทำงานเหมือนเดิม ค่าที่ถูกรูปแบบแต่ผิดความหมายแบบอื่น (เช่น `APP_BASE_URL` ของเครื่องอื่น) ยังจับไม่ได้
- **วิธีแก้เมื่อเกิด:** ถ้า deploy แล้วแอปไม่เริ่ม ให้ดู log ของ function หา `Missing or invalid environment variables:` ซึ่งบอกชื่อตัวที่ผิด ลบหรือแก้ตามขั้นที่ 3 ของ [deploy ตั้งค่าครั้งแรก](../runbooks/deploy.md#2-vercel) แล้ว deploy ใหม่ เมื่อพฤติกรรมไม่ตรงกับโค้ด ให้ตรวจ environment ก่อนสงสัยโค้ด

### S4. ความลับหรือข้อมูลลูกค้าใน log และ URL

- **อาการ:** Log มีข้อความแชท, token หรือ path ที่มีค่าลับ
- **สาเหตุ:** ส่ง object ทั้งก้อนให้ logger, log URL จริงแทน template หรือใส่ค่าลับใน path
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Logger รับเฉพาะ field ใน `LogFields` และทิ้ง key อื่นแม้ถูก cast ([`json-logger.adapter.ts`](../../src/adapters/system/json-logger.adapter.ts)), `route` เป็น template ไม่ใช่ path จริง และกฎใน [code-style ข้อ 6](code-style.md#6-error) กับ [ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md)
- **วิธีแก้เมื่อเกิด:** ถ้าพบค่าที่ไม่ควรอยู่ ให้หมุน credential นั้นตาม [operations](../runbooks/operations.md#หมุน-credential) แล้วหาว่า field ใดใน `LogFields` รับค่านั้นได้

### S5. CSP บล็อก script ของหน้าที่ถูก prerender

- **อาการ:** หน้าใหม่ค้างที่ skeleton หรือไม่ตอบสนองใน production แต่ใช้ได้ใน `next dev`
- **สาเหตุ:** CSP ใช้ nonce ต่อคำขอกับ `'strict-dynamic'` หน้าที่ถูกสร้างไว้ตอน build จึงได้ script ที่ไม่มี nonce และถูกบล็อก
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว root layout ตั้ง `dynamic = 'force-dynamic'` ([`app/layout.tsx`](../../app/layout.tsx)), CSP สร้างใน proxy ([`csp.ts`](../../src/composition/csp.ts)) และ E2E ล้มเมื่อมี CSP violation หรือ console error ([`e2e/helpers/test.ts`](../../e2e/helpers/test.ts))
- **วิธีแก้เมื่อเกิด:** เปิด console ของเบราว์เซอร์หา `[csp-violation]` อย่าแก้ด้วยการเพิ่ม `'unsafe-inline'` ใน `script-src` ให้ตรวจว่าหน้าหรือ layout ใหม่ไม่ได้เปลี่ยนเป็น static

## 7. หน้าเว็บ

### F1. คำตอบของ polling ที่มาช้าทับข้อมูลใหม่ หรือแถวหายหลังเน็ตหลุด

- **อาการ:** สถานะข้อความย้อนกลับ, รายชื่อแสดงของแท็บก่อน หรือข้อความที่เข้ามาระหว่างออฟไลน์ไม่ขึ้น
- **สาเหตุ:** คำขอหลายตัวของข้อมูลเดียวกันค้างพร้อมกันแล้วตัวที่ช้ากว่าเขียนทีหลัง หรือ cursor เดินข้ามแถวที่ commit ช้า
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Polling ใช้ cursor `updatedSeq` ที่ย้อนหลัง `POLL_OVERLAP_SEQ`, รวมด้วย id ให้แถวที่ `updatedSeq` สูงกว่าชนะ และโหลดหน้าแรกใหม่หลังเชื่อมต่อกลับหรือเมื่อแท็บกลับมา ([`polling.ts`](../../src/common/polling.ts), [api-contract](../architecture/api-contract.md#protocol-ของ-polling), [ADR 0005](../adr/0005-polling-instead-of-realtime.md))
- **วิธีแก้เมื่อเกิด:** ดู network ของเบราว์เซอร์ว่า `afterUpdatedSeq` เดินหน้าตามที่ควรหรือไม่ แล้วเขียน test ใน `polling.spec.ts` หรือ `inbox.send.logic` ที่ส่งคำตอบสลับลำดับ

### F2. Hydration ไม่ตรงกัน

- **อาการ:** Console มี hydration error, ลิงก์หรือข้อความบนหน้าจอกระพริบหรือหาย
- **สาเหตุ:** สิ่งที่ render ขึ้นกับเวลา locale หรือสภาพของเบราว์เซอร์ ทำให้ HTML ของ server กับรอบแรกของ client ต่างกัน หรือมีตัวกลางแก้ HTML ก่อน React hydrate
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ข้อความที่ขึ้นกับนาฬิกาของเบราว์เซอร์ render หลัง `useHydrated()` เป็น true ([`common.hooks.ts`](../../src/common/common.hooks.ts)) และ E2E ล้มเมื่อมี console error
- **วิธีแก้เมื่อเกิด:** หาค่าที่อ่าน `new Date()`, `window` หรือ locale ระหว่าง render แล้วย้ายไปหลัง `useHydrated()`

### F3. หน้าจอบอกว่า "ว่าง" ทั้งที่โหลดไม่สำเร็จ

- **อาการ:** รายการว่างแสดงพร้อมกับ error หรือแอดมินคิดว่าไม่มีข้อความใหม่ทั้งที่เชื่อมต่อไม่ได้
- **สาเหตุ:** ตารางแสดงเสมอโดยไม่แยกสถานะ error ออกจากสถานะว่าง
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว รายชื่อแสดง `ErrorState` เมื่อโหลดไม่สำเร็จและยังไม่มีข้อมูล ([`ContactList.tsx`](../../src/features/inbox/list/ContactList.tsx)) และแถบสถานะการเชื่อมต่อ ([`ConnectionBanner.tsx`](../../src/common/ConnectionBanner.tsx)) ขึ้นเมื่อ polling ล้มติดกันถึง `POLL_FAILURES_BEFORE_BANNER` รอบ ([`polling.ts`](../../src/common/polling.ts))
- **วิธีแก้เมื่อเกิด:** หน้าจอใหม่ที่มีรายการต้องมีสามสถานะแยกกัน (กำลังโหลด, error, ว่าง) ตาม [ui-screens](../specs/ui-screens.md)

### F4. CSS เพี้ยนหรือ build ล้มเพราะ Tailwind อ่านไฟล์ที่ไม่ใช่โค้ด

- **อาการ:** Build ล้มที่ CSS parser ด้วยอักขระแปลก หรือ CSS ใหญ่ขึ้นผิดปกติ หลังมีโฟลเดอร์ output ใหม่ในเครื่อง
- **สาเหตุ:** Tailwind 4 หา class จากทุกไฟล์ที่ `.gitignore` ไม่ได้ยกเว้น ไฟล์ cache หรือ binary ในโฟลเดอร์ที่ไม่ถูก ignore จึงกลายเป็น class
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว [`app/globals.css`](../../app/globals.css) ใช้ `@import 'tailwindcss' source(none)` ร่วมกับ `@source '.'` และ `@source '../src'` (path สัมพันธ์กับไฟล์ CSS) Tailwind จึงอ่านเฉพาะ `app/` และ `src/` ไม่ว่ามีโฟลเดอร์ใดอยู่ที่ราก และ `.gitignore` ยังยกเว้น `.next/`, `.data/`, `coverage/`, `test-results/` และ `playwright-report/` โค้ดที่มี class ของ Tailwind ต้องอยู่ใน `app/` หรือ `src/` เท่านั้น ถ้าเพิ่มที่อื่นต้องเพิ่ม `@source` ของที่นั้น
- **วิธีแก้เมื่อเกิด:** หาโฟลเดอร์ที่ไม่ถูก ignore ด้วย `git status --ignored` เพิ่มเข้า `.gitignore` ลบทิ้ง แล้ว build ใหม่

## 8. การอัปโหลดและที่เก็บไฟล์

### U1. ไฟล์ปลอมชนิดหรือใหญ่เกิน

- **อาการ:** ไฟล์ที่ไม่ใช่รูปถูกส่งให้ลูกค้า หรือที่เก็บไฟล์เต็มเร็วผิดปกติ
- **สาเหตุ:** เชื่อนามสกุลหรือ `Content-Type` ที่ผู้ส่งบอก และสิทธิ์อัปโหลดไม่ผูกชนิดกับขนาด
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ชนิดตรวจจาก byte แรกของไฟล์ (`sniffContentType` ใน [`media.logic.ts`](../../src/core/domain/media.logic.ts)), สิทธิ์อัปโหลดกำหนดชนิด ขนาด และอายุ `UPLOAD_TICKET_TTL_MS` และที่เก็บแบบ local ตรวจลายเซ็น ชนิด และขนาดก่อนเขียน ([backend](../architecture/backend.md#api))
- **วิธีแก้เมื่อเกิด:** ดู `upload.ticket.rejected`, `upload.local_put.rejected` และ `media.store.failed` แล้วเทียบกับเพดานใน [project-setup](../architecture/project-setup.md#101-แกนกลาง)

### U2. ดาวน์โหลดซ้ำหรือไฟล์ค้าง

- **อาการ:** สื่อขาเข้าหนึ่งชิ้นมีสองไฟล์ในที่เก็บ หรือไฟล์ที่ยกเลิกแล้วยังอยู่
- **สาเหตุ:** งานสองงานของข้อความเดียวกันเขียนผลทั้งคู่ หรือการยกเลิกไม่ลบไฟล์ที่อัปโหลดแล้ว
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว `StoreInboundMedia` ปิดสถานะด้วย compare-and-set บน `pending` และงานที่แพ้ลบไฟล์ของตัวเอง, การยกเลิกเรียก `DiscardUpload` ([use-cases StoreInboundMedia](../architecture/use-cases.md#storeinboundmedia)) ไฟล์ที่ค้างเพราะปิดแท็บกลางคันเป็นข้อที่ยอมรับใน [line-messaging](../specs/line-messaging.md#สื่อขาออก)
- **วิธีแก้เมื่อเกิด:** ไฟล์ค้างไม่กระทบการทำงาน ลบจาก Blob store ได้เมื่อไม่มี Message ใดอ้าง URL นั้น

## 9. Deploy และ CI

### C1. Production เป็นโค้ดที่ไม่ผ่านการตรวจ

- **อาการ:** Production มีโค้ดที่ CI ไม่เคยผ่าน
- **สาเหตุ:** Deploy ด้วยมือหรือ deploy จาก branch ที่ไม่ผ่าน CI
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Vercel ไม่ deploy จาก Git เอง, CI เรียก Deploy Hook หลังสี่งานผ่าน และห้ามเรียก Hook ด้วยมือ ([deploy](../runbooks/deploy.md#เมื่อ-ci-ล้ม), [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md)) CI รันเฉพาะบน `main` ผลที่แนบใน PR จึงมาจากการรันเองตาม [AGENTS.md](../../AGENTS.md)
- **วิธีแก้เมื่อเกิด:** เลื่อน deployment ที่ผ่าน CI ล่าสุดขึ้นตาม [deploy ย้อนกลับ](../runbooks/deploy.md#ย้อนกลับ) แล้วเปิด PR ให้ `main` ตรงกับ production

### C2. ไฟล์ที่เครื่องมือสร้างเองทำให้ working tree สกปรก

- **อาการ:** Diff มีไฟล์ที่ไม่ได้แก้ หรือ build ที่ต้องการ tree สะอาดล้ม
- **สาเหตุ:** คำสั่ง dev หรือ build เขียนไฟล์ที่ commit ไว้ใหม่ในรูปแบบอื่น
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว `next-env.d.ts`, `*.tsbuildinfo` และ Prisma client ที่ generate อยู่ใน `.gitignore` และ [AGENTS.md](../../AGENTS.md) บอกวิธีจัดการบล็อกที่ `next dev` เขียนเพิ่ม
- **วิธีแก้เมื่อเกิด:** ถ้าไฟล์ที่ generate ถูก commit ไปแล้ว ให้ลบออกจาก index และเพิ่มใน `.gitignore` ใน PR แยก

### C3. งานหลายเรื่องปนกันจนย้อนหรือแก้ด่วนไม่ได้

- **อาการ:** ต้องการแก้ด่วนหนึ่งเรื่อง แต่ `main` มีงานอื่นที่ยังไม่พร้อมปนอยู่ จนต้อง revert หลายอย่าง
- **สาเหตุ:** Branch อายุยาว หรือ PR เดียวรวมหลายเรื่อง
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Branch อายุสั้น เข้า `main` แบบ squash และ commit หนึ่งเรื่อง ([code-style ข้อ 11](code-style.md#11-git)), การย้อนทำด้วย PR ที่ revert
- **วิธีแก้เมื่อเกิด:** Revert เฉพาะ commit ที่เป็นปัญหาด้วย PR แล้วนำงานที่ถูกถอยกลับมาด้วย PR ใหม่

## 10. การทดสอบ

### Q1. Test ที่ไม่มีงานใดรันจนเก่า

- **อาการ:** ไฟล์ test ล้มเมื่อมีคนรันเอง เพราะไม่มีใครรันมานาน
- **สาเหตุ:** CI รันจากรายการไฟล์ที่ดูแลด้วยมือ หรือบางชุดไม่อยู่ใน workflow ใด
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Vitest เก็บไฟล์ด้วย glob ([`vitest.config.ts`](../../vitest.config.ts)), Playwright รันทุกไฟล์ใน `e2e/` และ CI รันทั้ง unit, adapter และ E2E ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml))
- **วิธีแก้เมื่อเกิด:** ไฟล์ test ใหม่ต้องตรงกับ glob ของชุดใดชุดหนึ่ง ตรวจด้วยการรันชุดนั้นแล้วดูชื่อไฟล์ในผล

### Q2. E2E ผ่านบ้างล้มบ้าง

- **อาการ:** Test เดิมผลต่างกันในแต่ละรอบ
- **สาเหตุ:** หน่วงเวลาตายตัว, locator ที่ตรงหลาย element, test ใช้ข้อมูลชุดเดียวกัน หรือ retry ซ่อนปัญหา
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ใช้การรอแบบมีเงื่อนไข, test id กลาง (`e2e/helpers/test-ids.ts`), ลูกค้าคนละคนต่อ test, test ที่แตะค่ารวมของระบบอยู่ในไฟล์ serial ([test-strategy](../qa/test-strategy.md#กฎ)) และ Playwright ตั้ง `retries: 0` กับ `forbidOnly` ([`playwright.config.ts`](../../playwright.config.ts))
- **วิธีแก้เมื่อเกิด:** รันไฟล์นั้นซ้ำหลายรอบบน stack ที่สร้างใหม่ แยกว่าเป็น test เก่า, test แข่งกับหน้า หรือ bug ของแอป ห้ามเพิ่ม retry หรือข้าม test

### Q3. State รั่วระหว่าง test

- **อาการ:** Test ผ่านเมื่อรันเดี่ยว แต่ล้มเมื่อรันทั้งไฟล์หรือทั้งชุด
- **สาเหตุ:** Fixture ระดับ module ถูกโค้ดที่ทดสอบแก้ค่า หรือหลายคนใช้ฐานข้อมูลทดสอบเดียวกัน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Vitest ตั้ง `restoreMocks`, adapter test แยกฐานข้อมูลและ stub ต่อคนด้วย `ADAPTER_TEST_DATABASE_NAME` และ `ADAPTER_TEST_STUB_URL` ([project-setup ข้อ 6.7](../architecture/project-setup.md#67-vitestconfigts)) และ fixture ร่วมที่เป็น object หรือ array ห่อด้วย [`deepFreeze`](../../test-support/deep-freeze.ts) ([test](../../e2e/deep-freeze.unit.ts)) การแก้ค่าจึงล้มทันทีด้วย `TypeError` กฎอยู่ใน [test-strategy](../qa/test-strategy.md#กฎ) ตอนนี้ fixture ที่ export จาก `e2e/fixtures/**` และ `test-support/**` เป็นสตริงทั้งหมด จึงมีที่ใช้ `deepFreeze` ในค่าร่วมของ unit test (`e2e/*.unit.ts`) ไม่มี lint ที่บังคับให้ห่อ ตรวจด้วย review
- **วิธีแก้เมื่อเกิด:** รัน test ที่ล้มเดี่ยวแล้วรันทั้งไฟล์ หา object ที่ใช้ร่วมกันแล้วห่อด้วย `deepFreeze` และให้ test ที่ต้องการค่าต่างไปสร้างสำเนาก่อน ห้ามเอา freeze ออกเพื่อให้ test ผ่าน

### Q4. Test ผ่านด้วยเหตุผลผิด

- **อาการ:** Test เขียวทั้งที่ฟีเจอร์พัง เช่น ผ่านเพราะได้ 401 แทนผลที่ตั้งใจตรวจ หรือตัวปลอมเก็บค่าก่อนขั้นที่ test ตั้งใจตรวจ
- **สาเหตุ:** Assertion ไม่ได้ผูกกับผลของกฎที่ทดสอบ
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว ชุดทดสอบของ port ลดความต่างของตัวปลอม และ coverage ของ `core/` บังคับ 90% แม่แบบ PR ([`.github/pull_request_template.md`](../../.github/pull_request_template.md)) มีช่องติ๊ก "Each new or changed test failed before the fix" ร่วมกับช่องผลที่รันจริงและสิ่งที่ไม่ได้ตรวจ ตามกฎใน [code-style ข้อ 11](code-style.md#11-git) เครื่องยืนยันไม่ได้ว่าเคยแดงจริง ผู้เปิด PR ต้องรันเองและ reviewer ตรวจ
- **วิธีแก้เมื่อเกิด:** ทำให้ bug กลับมา (หรือแก้ค่าคงที่ที่ test ตรึง) แล้วดูว่า test ที่ชื่อเกี่ยวข้องแดงจริง ถ้าไม่แดงให้เขียน assertion ใหม่

### Q5. Test ที่เสื่อมตามวันที่จริง

- **อาการ:** Test ที่เคยผ่านล้มเองเมื่อเวลาผ่านไป หรือล้มเฉพาะบางช่วงของวัน
- **สาเหตุ:** Test หรือโค้ดอ่านเวลาจริง
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว แกนกลางห้าม `Date.now()`, `new Date()` แบบไม่มีอาร์กิวเมนต์ และ `Math.random()` (lint ใน [`eslint.config.mjs`](../../eslint.config.mjs)) และไฟล์ `*.logic.ts` ของหน้าจอไม่อ่านเวลา ([code-style ข้อ 3 และ 7](code-style.md#3-เวลา-id-และค่าสุ่ม-lint))
- **วิธีแก้เมื่อเกิด:** ส่งเวลาเข้ามาผ่าน `Clock` หรือพารามิเตอร์ แล้วตรึงเวลาใน test

## 11. วิธีทำงาน

### P1. เอกสารหรือ comment ไม่ตรงกับโค้ด

- **อาการ:** ค่าในเอกสารต่างจากโค้ด, comment อธิบายเวลาหรือขั้นตอนที่ไม่เป็นจริงแล้ว หรือลิงก์ในเอกสารเสีย
- **สาเหตุ:** แก้โค้ดโดยไม่แก้เอกสาร หรือเขียนค่าเดียวกันไว้หลายที่
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว กฎให้แก้เอกสารใน commit เดียวกันและข้อเท็จจริงหนึ่งเรื่องอยู่ที่เดียว ([docs README กฎของเอกสาร](../README.md#กฎของเอกสาร), [AGENTS.md](../../AGENTS.md)) และขั้น `pnpm docs:check` ในงาน `check` ของ CI ล้มเมื่อ (1) ลิงก์ relative หรือ `#anchor` ใน `docs/**`, `README.md` และ `AGENTS.md` ชี้ไปไม่ถึง โดย anchor ใช้กฎ slug ของ GitHub รวมอักษรไทย (2) ค่าในตารางของ [project-setup ข้อ 10](../architecture/project-setup.md#10-ค่าคงที่ของระบบ) ไม่ตรงกับค่าคงที่ในโค้ด (แปลงหน่วย ms/วินาที, KB/MB, ครั้งต่อวินาที และสตริง USD ตามชื่อ) หรือ (3) บล็อก YAML ใน [project-setup ข้อ 8](../architecture/project-setup.md#8-ci) ไม่เหมือน [`ci.yml`](../../.github/workflows/ci.yml) รายงานเป็น `ไฟล์:บรรทัด` กฎอยู่ใน [`docs-check.logic.ts`](../../scripts/docs-check.logic.ts) ([test](../../e2e/docs-check.unit.ts)) ค่าในเอกสารส่วนอื่นนอกตารางนั้นและ comment ในโค้ดยังตรวจด้วย review
- **วิธีแก้เมื่อเกิด:** ถือว่าเป็น bug ของฝั่งใดฝั่งหนึ่ง ตัดสินจาก spec แล้วแก้ทั้งสองฝั่งใน PR เดียว

### P2. หลายคนหรือหลาย agent แก้ working tree เดียวกัน

- **อาการ:** Commit หนึ่งลบงานที่อีกคนเพิ่ง commit, มีไฟล์ของงานอื่นติดไปด้วย หรือ test ถูกแก้ให้อ่อนลงโดยไม่มีใครตั้งใจ
- **สาเหตุ:** Commit จาก working tree ที่ยังเป็นสภาพก่อนงานของอีกคน หรือใช้ `git add -A` ใน tree ที่มีไฟล์ของคนอื่น
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว Branch อายุสั้นผ่าน PR ([code-style ข้อ 11](code-style.md#11-git)), task memory ใน `docs/agent-memory/`, ฐานข้อมูลทดสอบแยกต่อคน และกฎให้ stage ไฟล์ด้วย path ไม่ใช้ `git add -A` หรือ `git add .` เมื่อมีมากกว่าหนึ่งคนหรือหนึ่ง agent ใน checkout เดียวกัน ตรวจ `git diff --cached --name-only` ก่อน commit และอ่านไฟล์ที่คนอื่นแก้หลัง rebase (กฎใน code-style ข้อ 11 และ [AGENTS.md](../../AGENTS.md)) เป็นกฎของคนทำงาน ไม่มีเครื่องมือบังคับ
- **วิธีแก้เมื่อเกิด:** เทียบ diff ของ commit กับขอบเขตใน task memory คืนส่วนที่หายจากประวัติของ Git และแจ้งเจ้าของงานก่อน push

### P3. บอกว่าตรวจแล้วทั้งที่ไม่ได้รัน

- **อาการ:** PR หรือรายงานบอกว่าผ่าน แต่ CI บน `main` ล้มทันที
- **สาเหตุ:** อ้างผลจากความจำ จากการรันก่อนแก้รอบสุดท้าย หรือจากชุดที่ไม่ครอบคลุมสิ่งที่แก้
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว "Verify before saying done" ใน [AGENTS.md](../../AGENTS.md) ให้รันจริงและบอกสิ่งที่ไม่ได้ตรวจ และแม่แบบ PR ต้องมีผลการทดสอบ ([code-style ข้อ 11](code-style.md#11-git))
- **วิธีแก้เมื่อเกิด:** รันใหม่หลังการแก้ครั้งสุดท้าย แนบคำสั่งและผล และเขียนสิ่งที่ไม่ได้รันพร้อมเหตุผล

### P4. เขียน helper ซ้ำกับที่มีอยู่

- **อาการ:** มีฟังก์ชันสองตัวทำเรื่องเดียวกันแต่ให้ผลต่างกันที่ขอบ เช่น วันตามเวลาไทย
- **สาเหตุ:** ไม่ได้ค้นก่อนเขียน
- **การป้องกันในโปรเจกต์นี้:** ป้องกันแล้ว กฎใน [code-style ข้อ 9](code-style.md#9-ค่าคงที่-และของกลาง-review) ให้ค้นก่อนเขียน และค่าที่ใช้หลายที่มีชื่อและอยู่ที่เดียว
- **วิธีแก้เมื่อเกิด:** ย้ายผู้เรียกทั้งหมดไปที่ helper เดิม แล้วลบตัวใหม่พร้อม test ของมัน

## รายการตรวจก่อนเปิด PR และก่อน deploy

ก่อนเปิด PR:

- [ ] การเปลี่ยนสถานะใหม่เป็น compare-and-set ในคำสั่งเดียว ไม่อ่านก่อนแล้วจึงเขียน ([M2](#m2-สองคำขอแก้แถวเดียวกันแล้วผลหนึ่งหาย))
- [ ] งานใหม่ที่ล้มได้มีสถานะหรือเหตุผลที่หน้าจอเห็น และสถานะกลางทางมีทางคืนสภาพเมื่อ function ถูกตัด ([M3](#m3-สถานะกลางทางค้างเมื่อ-function-ถูกตัด), [M4](#m4-ความล้มเหลวที่ไม่มีใครเห็น))
- [ ] การเรียกภายนอกใหม่มี timeout ที่เหมาะกับงาน และเพิ่มเข้า `timing-budget.ts` จน `timing-budget.spec.ts` ยืนยันว่าเวลาแย่ที่สุดอยู่ใต้ `maxDuration` ([A2](#a2-timeout-ไม่สัมพันธ์กับงานและเพดานเวลาของ-function))
- [ ] การส่งออกที่ลองใหม่ได้มี key เดิมทุกครั้ง ไม่ลองใหม่หลังผู้ให้บริการลืม key แล้ว และไม่ push ซ้ำเมื่อ LINE ปฏิเสธ payload เพราะทุก push กินโควตา ([L3](#l3-reply-token-หมดอายุหรือถูกใช้สองครั้ง), [L4](#l4-ลูกค้าได้ข้อความซ้ำเมื่อระบบลองส่งใหม่))
- [ ] Webhook ตอบไม่สำเร็จเฉพาะเมื่อไม่มีอะไรถูกบันทึก และการส่งซ้ำของ LINE ถูกกันซ้ำ ([L1](#l1-event-เดิมถูกประมวลผลซ้ำ), [L6](#l6-webhook-ตอบช้าหรือตอบไม่สำเร็จจนถูกส่งซ้ำ))
- [ ] ช่วงวันและเดือนใช้ `bangkokDayRange` หรือ `bangkokMonthRange` และมี test ที่ขอบเที่ยงคืนตามเวลาไทย ([T1](#t1-วันตามเวลาไทยกับวันของ-utc))
- [ ] ไม่มี migration เดิมถูกแก้หรือลบ และ migration ใหม่เป็นแบบเพิ่มเท่านั้น `pnpm migrations:immutable` และ `pnpm migrations:destructive` ผ่าน ([D1](#d1-แก้หรือลบ-migration-ที่-apply-ไปแล้ว), [D2](#d2-migration-ที่ทำให้ย้อนกลับไม่ได้))
- [ ] ค่าใหม่ของ enum หรือ schema ของ API มีใน migration ด้วย ([D3](#d3-โค้ดกับฐานข้อมูลรับค่าไม่ตรงกัน))
- [ ] กฎใหม่ของ repository มี test ใน suite ของ port ซึ่งรันกับตัวจริงด้วย ([D4](#d4-ตัวปลอมทำงานไม่เหมือนฐานข้อมูลจริง))
- [ ] Test ใหม่เคยแดงเมื่อ bug ยังอยู่ และ fixture ร่วมที่เพิ่มถูกห่อด้วย `deepFreeze` ([Q3](#q3-state-รั่วระหว่าง-test), [Q4](#q4-test-ผ่านด้วยเหตุผลผิด))
- [ ] หน้าใหม่ไม่ถูก prerender และไม่มี console error หรือ CSP violation ที่ 390 และ 1280 ([S5](#s5-csp-บล็อก-script-ของหน้าที่ถูก-prerender), [F2](#f2-hydration-ไม่ตรงกัน))
- [ ] Log ใหม่ใช้ field ที่มีใน `LogFields` เท่านั้น ([S4](#s4-ความลับหรือข้อมูลลูกค้าใน-log-และ-url))
- [ ] Diff มีเฉพาะไฟล์ของงานนี้ (stage ด้วย path) เอกสารกับ comment ที่เกี่ยวข้องถูกแก้ด้วย และ `pnpm docs:check` ผ่าน ([P1](#p1-เอกสารหรือ-comment-ไม่ตรงกับโค้ด), [P2](#p2-หลายคนหรือหลาย-agent-แก้-working-tree-เดียวกัน))

ก่อนและหลัง deploy:

- [ ] Environment ใน Vercel ไม่มีค่าที่ใช้เฉพาะการทดสอบ ([S3](#s3-ค่า-environment-ของ-production-ไม่ตรงกับที่โค้ดคาด))
- [ ] โค้ดรุ่นก่อนยังทำงานกับโครงตารางหลัง migration ได้ ([D2](#d2-migration-ที่ทำให้ย้อนกลับไม่ได้))
- [ ] ทำครบตาม [ตรวจหลัง deploy](../runbooks/deploy.md#ตรวจหลัง-deploy) และส่วนสถานะระบบไม่มีข้อผิดพลาดใหม่ของ LINE หรือ AI ([M4](#m4-ความล้มเหลวที่ไม่มีใครเห็น))

## ช่องว่างที่ยังเหลือ

รายการนี้เป็นข้อเสนอ ยังไม่ได้ทำ แต่ละข้อต้องผ่านขั้นตอนใน [AGENTS.md](../../AGENTS.md): ข้อที่เปลี่ยนพฤติกรรมต้องแก้ spec ก่อน และข้อที่แตะ CI ต้องถามเจ้าของงานก่อน ขนาด: S ไม่เกินครึ่งวัน, M หนึ่งถึงสองวัน

| ข้อ | สถานะ | สิ่งที่เสนอ | ขนาด |
| --- | --- | --- | --- |
| [L4](#l4-ลูกค้าได้ข้อความซ้ำเมื่อระบบลองส่งใหม่) (และค่าที่ต้องยืนยันใน [L3](#l3-reply-token-หมดอายุหรือถูกใช้สองครั้ง), [L5](#l5-line-ปฏิเสธทั้งคำขอเพราะรูปแบบข้อความ)) | บางส่วน | รูปแบบของ retry key, หน้าต่าง 24 ชั่วโมง, การแยก 400 ของ reply, 202 ของสื่อ และการตรวจ Channel secret ทำแล้ว ([ADR 0023](../adr/0023-retry-key-v5-window-and-reply-400.md)) ที่เหลือ: เมื่อมี LINE OA จริง เจ้าของงานทำขั้นทดสอบด้วยมือ 9 ข้อใน [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) แล้วแก้ค่าใน project-setup และ comment ที่เป็นสมมติฐานตามผล (ติดตามใน [implementation-plan](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง)) | S |
| [A4](#a4-ข้อความของลูกค้าหรือ-pdf-สั่งให้-ai-ทำนอกเรื่อง) | บางส่วน | ลิงก์ทำแล้ว ที่เหลือคือราคาและเงื่อนไขที่ไม่มีในคลัง ซึ่งยังกันด้วย prompt อย่างเดียว ต้องออกแบบใน spec ก่อนว่าจะตรวจตัวเลขในคำตอบกับคลังความรู้อย่างไรโดยไม่กันคำตอบที่ถูก | M |
| [S2](#s2-การจำกัดความถี่นับผิดคน) | บางส่วน | โค้ดทำแล้ว ([ADR 0022](../adr/0022-client-ip-from-last-forwarded-hop.md)) เหลือการยืนยันบน Vercel ตามขั้นใน [implementation-plan](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง) ถ้าค่าสุดท้ายของ `x-forwarded-for` ไม่ใช่ IP ของผู้เรียก ให้แก้ `clientIpOf` และเขียน ADR ใหม่ | S |
