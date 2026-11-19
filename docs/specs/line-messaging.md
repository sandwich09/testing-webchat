# การเชื่อมต่อ LINE

> สถานะ: สร้างแล้ว · อัปเดตล่าสุด: 2026-11-19

## เป้าหมาย

รับทุกอย่างที่ลูกค้าส่งมาทาง LINE OA โดยไม่ตกหล่นและไม่ซ้ำ และส่งข้อความของร้านกลับไปโดยลูกค้าไม่ได้รับซ้ำ

ทุกการเรียก LINE ผ่าน port `MessagingGateway` ด้วย `fetch` ตรงกับ Messaging API ไม่ใช้ SDK

## รับ event (webhook)

1. อ่าน raw body เป็นข้อความ
2. ตรวจ header `x-line-signature` ด้วย HMAC-SHA256 จาก Channel secret และเทียบแบบ timing-safe ถ้าไม่ผ่านตอบ 401 และบันทึกเหตุการณ์ด้านความปลอดภัย
3. ตรวจ body ด้วย schema ที่เข้มเฉพาะ field ที่ใช้ และปล่อยผ่าน field อื่น
4. แต่ละ event ประมวลผลแยกกัน event หนึ่งพังไม่กระทบ event อื่น
5. Event ที่ `webhookEventId` ซ้ำถูกข้าม และข้อความที่ `lineMessageId` ซ้ำไม่ถูกบันทึกอีก โดยใช้การ insert แบบข้ามเมื่อซ้ำ
6. เมื่อ signature ถูกต้อง ตอบ 200 แม้บาง event พลาด ยกเว้นกรณีเดียว: ทุก event ในก้อนล้มเหลว ไม่มีอะไรถูกบันทึกเลย และฐานข้อมูลไม่ตอบ (`settings.ping` ล้ม) จึงตอบ 503 `db.unavailable` (body มีแค่รหัส ข้อความกลาง และ `requestId`) ให้ LINE ส่งทั้งก้อนซ้ำ ซึ่ง LINE ทำเฉพาะเมื่อเปิด "Webhook redelivery" ไว้ ([line-oa-setup ขั้นที่ 4](../runbooks/line-oa-setup.md#4-ตั้ง-webhook-ฝั่ง-line)) ก้อนที่ส่งซ้ำมี `deliveryContext.isRedelivery: true` และ `webhookEventId` เดิม ข้อ 5 จึงบันทึกแต่ละ event ครั้งเดียว ก้อนที่มีอย่างน้อยหนึ่ง event ถูกบันทึก หรือ event ล้มด้วยเหตุของตัวเองขณะฐานข้อมูลยังตอบ ตอบ 200 เพราะการส่งซ้ำไม่ช่วย ([use-cases ReceiveLineEvents](../architecture/use-cases.md#receivelineevents) ข้อ 7)
7. ถ้ายังไม่ได้ตั้ง credential ตอบ 401

## ชนิดของ event

| Event | ระบบทำอะไร |
| --- | --- |
| ข้อความตัวอักษร | บันทึก และเข้าเงื่อนไข AI ตอบแทน |
| รูป, วิดีโอ | บันทึกทันที แล้วดาวน์โหลดเข้าที่เก็บไฟล์หลังตอบ 200 และแชทขึ้นสถานะรอแอดมินถ้า AI ตอบแทนเปิดอยู่ |
| สติกเกอร์ | บันทึก id และแสดงจาก URL ของ LINE |
| เสียง, ไฟล์, ตำแหน่ง และอื่น ๆ | บันทึกเป็นชนิด `other` แสดงป้ายบอกประเภท ไม่ดาวน์โหลด |
| follow | สร้างหรืออัปเดต Contact เป็นติดตามอยู่ |
| unfollow | ตั้งเป็นเลิกติดตามแล้ว และปิดช่องตอบ |
| ชนิดที่ไม่รู้จัก | บันทึก log แล้วข้าม |

ระบบดึงชื่อและรูปจาก profile API เฉพาะลูกค้าที่เห็นครั้งแรก ภายใน request ก่อนตอบ webhook ด้วย timeout `LINE_PROFILE_TIMEOUT_MS` และไม่ retry ถ้าดึงไม่ได้ ระบบบันทึก Contact โดยไม่มีชื่อแล้วทำต่อ และหน้าเว็บแสดงตัวอักษรแทนรูป ([use-cases](../architecture/use-cases.md#receivelineevents))

## สื่อขาเข้า

- LINE เก็บไฟล์ของข้อความไว้ชั่วคราว จึงต้องดาวน์โหลดตอนรับ
- ดาวน์โหลดแบบ stream จาก host ของ LINE ที่กำหนดตายตัวเท่านั้น
- เฉพาะ HTTP 200 คือไฟล์ LINE ตอบ 202 (หรือ 2xx อื่น) เมื่อยังเตรียมไฟล์ไม่เสร็จ เช่น วิดีโอที่กำลัง transcode ระบบไม่อ่านคำตอบนั้นเป็นไฟล์ แต่รอ `MEDIA_NOT_READY_POLL_MS` แล้วถามสถานะที่ `GET /v2/bot/message/{id}/content/transcoding` (`processing`, `succeeded`, `failed`) ซ้ำ จนพร้อมจึงดาวน์โหลดอีกครั้ง ข้อความคง `pending` ระหว่างนี้เฉพาะเมื่องบ `MEDIA_JOB_BUDGET_MS` ยังพอสำหรับเวลาแย่ที่สุดของทุกขั้นที่เหลือ ถ้าไม่พอหรือ LINE บอกว่าล้มเหลว สื่อเป็น `failed` ทันที ([use-cases StoreInboundMedia](../architecture/use-cases.md#storeinboundmedia))
- รูปไม่เกิน `IMAGE_MAX_BYTES` และวิดีโอไม่เกิน `VIDEO_MAX_BYTES` เกินกว่านั้นไม่เก็บ (`mediaStatus` เป็น `too_large`) และแสดงป้ายว่าไฟล์ใหญ่เกิน
- ตรวจชนิดจากเนื้อไฟล์
- ล้มเหลว: `mediaStatus` เป็น `failed` และหน้าเว็บแสดง "โหลดรูปไม่สำเร็จ"
- ค้าง: งานดาวน์โหลดอยู่ใน `after()` ของ webhook ถ้า function ถูกตัด แถวจะค้างที่ `pending` (ภาพ skeleton ตลอด) ทุกครั้งที่โหลดข้อความของแชทนั้น (`GET /api/contacts/:id/messages` ซึ่งหน้าแชท poll อยู่) สื่อที่ `pending` นานกว่า `MEDIA_STUCK_AFTER_MS` นับจาก `createdAt` เป็น `failed` ด้วยคำสั่งเดียว ([data-model กฎของ repository ข้อ 13](../architecture/data-model.md#กฎของ-repository)) และ log `media.store.stuck_recovered` พร้อม `contactId` และจำนวน

## ส่งข้อความ

กฎการส่งเหมือนกันทั้งข้อความของแอดมินและของ AI ขั้นตอนอยู่ใน `deliverOutbound` ของ [use-cases](../architecture/use-cases.md#deliveroutbound)

1. ถ้า Contact มี reply token ที่ยังอยู่ในช่วงใช้ได้ (`REPLY_TOKEN_USABLE_MS` นับจากเวลาของ event) ใช้ reply ก่อน เพราะไม่กินโควตา push
2. ถ้าไม่มี token หรือ LINE ปฏิเสธ token ใช้ push พร้อม retry key "ปฏิเสธ token" คือ 400 ที่ `message` ตรงกับ `Invalid reply token` (ไม่สนตัวพิมพ์) เท่านั้น ซึ่งหมายถึงยังไม่มีอะไรถูกส่ง
3. ถ้า reply ล้มเหลวเพราะเครือข่ายหรือ 5xx ข้อความเป็น `failed` และไม่ push ต่อเอง เพราะไม่รู้ว่า reply ไปถึงลูกค้าหรือไม่ 400 อื่นของ reply (เช่น body ผิดรูป ซึ่ง LINE บอกด้วย `details[].property`) เป็น `line.reply_failed` และไม่ push ต่อเช่นกัน เพราะ payload เดียวกันจะถูกปฏิเสธอีกและกินโควตา push
4. Push ทุกครั้งแนบ `X-Line-Retry-Key` ซึ่งเป็นค่าเดิมของข้อความนั้นเสมอ และถือว่าสำเร็จเมื่อ LINE ตอบว่ารับคำขอนี้ไปแล้ว ค่าของ header คือ UUID ที่มีบิต version 5 และ variant ของ RFC 4122 ซึ่งได้จาก 16 byte แรกของ SHA-256 ของ id ข้อความ (`toLineRetryKey`) เพราะ LINE รับ UUID version 4 และ 5 แน่นอน แต่ยังไม่มีหลักฐานว่ารับ version 7 ซึ่งเป็นรูปแบบของ id ข้อความ ค่าจึงเหมือนเดิมทุกครั้งที่ลองใหม่และหลัง restart ([ADR 0023](../adr/0023-retry-key-v5-window-and-reply-400.md))
5. แอดมินกด "ส่งอีกครั้ง" แล้วระบบใช้ push ด้วย retry key เดิมเสมอ ไม่ใช้ reply token LINE จำ retry key ไว้ 24 ชั่วโมง หลังจากนั้น key เดิมถูกถือเป็นคำขอใหม่ ระบบจึงปฏิเสธ "ส่งอีกครั้ง" ด้วย `message.retry_expired` เมื่อผ่าน `LINE_RETRY_KEY_WINDOW_MS` นับจาก push ครั้งแรกของข้อความนั้น (`Message.firstPushAt`) ฟองแสดงเหตุผลและซ่อนปุ่ม แอดมินต้องพิมพ์ส่งใหม่ ข้อความที่ยังไม่เคย push (reply ล้มเหลว) ไม่มีหน้าต่างนี้
6. Retry อัตโนมัติภายใน adapter เฉพาะเครือข่ายล่ม, 5xx และ 429 ไม่เกิน `LINE_MAX_RETRIES` โดยเคารพเวลาที่ LINE กำหนดใน `Retry-After` เมื่อไม่มี `Retry-After` รอแบบเพิ่มเท่าตัวจาก `LINE_RETRY_BASE_DELAY_MS` และถ้า `Retry-After` ยาวกว่า `LINE_RETRY_AFTER_MAX_MS` adapter ไม่รอ แต่คืน error พร้อม `retryAfterSeconds` ทันที (ค่าอยู่ใน [project-setup](../architecture/project-setup.md#104-adapter-และ-route))
7. ข้อความที่ยาวเกิน `LINE_TEXT_MAX_CHARS` ถูกแบ่งเป็นหลายข้อความ

เหตุผลอยู่ใน [ADR 0010](../adr/0010-reply-token-first-and-idempotency.md)

### งานส่งที่ค้าง

ข้อความขาออกเป็น `pending` ระหว่างส่ง ถ้า function ที่ส่ง (คำขอของแอดมิน หรือ `after()` ของ webhook สำหรับ AI) ถูกตัดก่อนรู้ผล แถวจะค้าง "กำลังส่ง" และกด "ส่งอีกครั้ง" ไม่ได้ ทุกครั้งที่โหลดข้อความของแชทนั้น ข้อความที่ `pending` นานกว่า `SEND_STUCK_AFTER_MS` นับจากเวลาที่การส่งรอบนั้นเริ่ม (`createdAt` หรือเวลาที่กด "ส่งอีกครั้ง" ล่าสุด) เป็น `failed` ด้วยรหัส `line.send_interrupted` ด้วยคำสั่งเดียว และ log `line.send.stuck_recovered` พร้อม `contactId` และจำนวน แอดมินจึงกด "ส่งอีกครั้ง" ได้ ซึ่ง push ด้วย retry key เดิมตามข้อ 5 ถ้าการส่งครั้งที่ถูกตัดถึงลูกค้าแล้ว LINE ควรไม่ส่งซ้ำเพราะ key เดิม (ต้องยืนยันตาม [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง)) `SEND_STUCK_AFTER_MS` มากกว่าเวลาแย่ที่สุดของการส่งและเพดานเวลาของ function จึงไม่ตัดการส่งที่ยังทำอยู่

## สื่อขาออก

| | รูป | วิดีโอ |
| --- | --- | --- |
| ชนิด | JPEG, PNG | MP4 |
| ขนาดสูงสุด | `IMAGE_MAX_BYTES` | `VIDEO_MAX_BYTES` |
| ภาพตัวอย่าง | ย่อรูปใน browser | จับเฟรมแรกใน browser |

- Browser อัปโหลดตรงเข้าที่เก็บไฟล์ด้วยสิทธิ์จาก `POST /api/uploads` ซึ่งกำหนดชนิดและขนาด
- รูป WebP ถูกแปลงเป็น JPEG ใน browser ด้วย canvas
- รูป HEIC และ HEIF ต้องใช้ได้ใน Chrome และ Firefox: browser ลองถอดรหัสเองก่อน ถ้าไม่ได้จึงโหลด `heic-to` ด้วย `import()` แบบ dynamic เฉพาะตอนที่เลือกไฟล์ HEIC (ไม่อยู่ใน bundle แรก) แปลงเป็น JPEG แล้วทำขั้นตอนภาพตัวอย่างและอัปโหลดตามปกติ ถ้าแปลงไม่สำเร็จ แสดงข้อความให้ใช้ไฟล์ JPEG หรือ PNG ([ADR 0019](../adr/0019-heic-conversion-with-heic-to.md), [ui-screens](ui-screens.md#76-ขั้นตอนแนบไฟล์))
- Server รับเฉพาะ JPEG, PNG และ MP4 การแปลงทั้งหมดจึงเกิดใน browser ก่อนขอสิทธิ์อัปโหลด
- วิดีโอ MOV ถูกปฏิเสธ พร้อมข้อความให้ใช้ MP4
- LINE ต้องการ URL แบบ HTTPS ที่เปิดสาธารณะ ชื่อไฟล์จึงเป็นค่าสุ่มที่เดาไม่ได้
- ไฟล์ที่อัปโหลดแล้วแต่กดยกเลิกถูกลบ ส่วนกรณีปิดแท็บกลางคันไม่ตามเก็บ

## Loading ฝั่ง LINE

ระบบเรียก API แสดง loading ในแอป LINE ของลูกค้าเป็นเวลา `LINE_LOADING_SECONDS` (ต้องยืนยันช่วงที่ LINE รับ) ในสองกรณี: ระหว่างที่ AI กำลังตอบ และเมื่อแอดมินพิมพ์ในช่องตอบ ซึ่งหน้าเว็บส่งไม่เกินหนึ่งครั้งต่อ `TYPING_PING_INTERVAL_MS` และ server จำกัดไม่เกิน `RATE_LIMIT_TYPING` ต่อลูกค้า ถ้าเรียกไม่สำเร็จ ไม่ถือเป็นความล้มเหลว

## กรณีผิดพลาด

| เหตุการณ์ | ระบบทำอะไร | แอดมินเห็นอะไร |
| --- | --- | --- |
| Access token ผิดหรือหมดอายุ | ข้อความเป็น `failed` และบันทึก `lastLineError` | "ส่งไม่สำเร็จ" และสถานะระบบแจ้งให้ตรวจ credential |
| ลูกค้าเลิกติดตาม | ไม่เรียก LINE | ช่องตอบถูกปิด |
| โควตา push เต็ม | ข้อความเป็น `failed` แผนฟรีส่ง push ได้ราว 300 ข้อความต่อเดือน reply ไม่นับ แต่ทุก push ที่ใช้แทน reply (token หมดอายุ, ข้อความของ AI ที่ตอบช้า, ข้อความของแอดมินที่ไม่มี token) และทุก "ส่งอีกครั้ง" นับในโควตา ([line-oa-setup](../runbooks/line-oa-setup.md#โควตา-push)) | "ส่งไม่สำเร็จ โควตาข้อความของ LINE เต็ม" |
| LINE ดึง URL ของสื่อไม่ได้ | ข้อความเป็น `failed` | "ส่งไม่สำเร็จ" และกดส่งอีกครั้งได้โดยไม่ต้องอัปโหลดใหม่ |
| Function ถูกตัดระหว่างส่ง | หลัง `SEND_STUCK_AFTER_MS` ข้อความเป็น `failed` ด้วย `line.send_interrupted` | "ส่งไม่สำเร็จ ระบบหยุดทำงานก่อนรู้ผลการส่ง กด "ส่งอีกครั้ง"" |
| Reply ถูกปฏิเสธด้วย 400 ที่ไม่ใช่เรื่อง token | ข้อความเป็น `failed` ด้วย `line.reply_failed` ไม่ push ต่อ | "ส่งไม่สำเร็จ LINE ไม่รับข้อความนี้ กด "ส่งอีกครั้ง"" |
| กด "ส่งอีกครั้ง" หลังผ่าน `LINE_RETRY_KEY_WINDOW_MS` นับจาก push ครั้งแรก | ไม่เรียก LINE ตอบ 409 `message.retry_expired` | ฟองแสดง "ส่งไม่สำเร็จ · ส่งอีกครั้งไม่ได้แล้วเพราะเกิน 24 ชั่วโมงหลังส่งครั้งแรก พิมพ์ข้อความแล้วส่งใหม่" และไม่มีปุ่ม |
| LINE ยังเตรียมสื่อขาเข้าไม่เสร็จจนหมดงบของงาน | สื่อเป็น `failed` ด้วย `line.content_not_ready` | "โหลดรูปไม่สำเร็จ" หรือ "โหลดวิดีโอไม่สำเร็จ" |
| ฐานข้อมูลล่มจนบันทึก event ใดในก้อนไม่ได้ | webhook ตอบ 503 ให้ LINE ส่งซ้ำ | ไม่มี ข้อความขึ้นเมื่อ LINE ส่งซ้ำ |
| Function ถูกตัดระหว่างดาวน์โหลดสื่อขาเข้า | หลัง `MEDIA_STUCK_AFTER_MS` สื่อเป็น `failed` | "โหลดรูปไม่สำเร็จ" หรือ "โหลดวิดีโอไม่สำเร็จ" |

## ข้อจำกัดที่รู้

- LINE ไม่ส่งสถานะการอ่านให้ระบบภายนอก จึงไม่แสดง "อ่านแล้ว"
- รองรับ LINE OA เดียว

## สิ่งที่ต้องยืนยันจากเอกสาร LINE ก่อนสร้าง

อายุของ reply token, ขีดจำกัดขนาดและชนิดของรูปกับวิดีโอ, ขีดจำกัดความยาวข้อความ, ระยะเวลาที่ LINE เก็บไฟล์ และเงื่อนไขของ API แสดง loading ส่วนที่ยืนยันจากเอกสารอย่างเดียวไม่ได้ต้องทดสอบด้วยมือกับ LINE OA จริงตามรายการใน [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง) และติดตามใน [implementation-plan](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง)

## วิธีทดสอบ

- Unit: การตรวจ signature, การกันซ้ำ, การเลือก reply หรือ push, การแบ่งข้อความยาว, การคืนสภาพสื่อและการส่งที่ค้าง (`get-messages.use-case.spec.ts` และชุดทดสอบของ `MessageRepository` ทั้งตัวปลอมและ Postgres), การรอสื่อที่ยังไม่พร้อม, หน้าต่างของ retry key, 503 ของก้อนที่บันทึกไม่ได้และการส่งซ้ำที่บันทึกครั้งเดียว
- Adapter: รูปแบบ request ที่ส่งไป stub (header, retry key แบบ version 5, body), การแยก 400 ของ reply, 202 ของ content และการตรวจ Channel secret
- Fixture: payload ตัวอย่างของทุกชนิด event
- E2E เส้นที่ 1, 2, 5 และ 7 ใน [test-strategy](../qa/test-strategy.md)
