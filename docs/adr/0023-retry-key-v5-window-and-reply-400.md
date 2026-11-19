# 0023: Retry key แบบ UUID version 5, หน้าต่าง 24 ชั่วโมง, การแยก 400 ของ reply และการตรวจ Channel secret

> สถานะ: อนุมัติ การตรวจว่า credential เป็น channel เดียวกันระบุเพิ่มใน [0028](0028-review-fixes-concurrency-polling-and-ci.md) · วันที่: 2026-11-19

## บริบท

[ADR 0010](0010-reply-token-first-and-idempotency.md) ให้ push แนบ `X-Line-Retry-Key` ที่เป็นค่าเดิมของข้อความ และเปลี่ยนไป push เมื่อ LINE ปฏิเสธ reply token ข้อเท็จจริงของ LINE ที่ใช้ออกแบบรอบนี้:

- LINE รับ retry key ที่เป็น UUID version 4 และ 5 ส่วน version 7 และ 8 ยังไม่มีหลักฐาน id ของข้อความเป็น UUIDv7 ซึ่งเดิมถูกส่งตรงตัว
- LINE จำ retry key ไว้ 24 ชั่วโมง หลังจากนั้น key เดิมเป็นคำขอใหม่ "ส่งอีกครั้ง" หลังช่วงนี้จึงอาจทำให้ลูกค้าได้ข้อความซ้ำ
- Reply ที่ token หมดอายุหรือถูกใช้แล้วได้ 400 ที่ `message` ตรงกับ `Invalid reply token` ส่วน 400 ของ body ผิดรูปมี `details[].property` ทั้งสองแบบไม่มีอะไรถูกส่ง เดิมระบบถือทุก 400 ของ reply เป็น token ใช้ไม่ได้ แล้ว push payload เดิมซึ่งจะถูกปฏิเสธซ้ำและกินโควตา push (แผนฟรีราว 300 ข้อความต่อเดือน)
- LINE ส่ง webhook ซ้ำเฉพาะเมื่อเปิด "Webhook redelivery" และ webhook ไม่ได้ตอบ 2xx เดิม webhook ตอบ 200 เสมอเมื่อ signature ถูก แม้ฐานข้อมูลล่มจนไม่มีอะไรถูกบันทึก ข้อความจึงหายถาวร
- ตรวจ Channel secret ได้ด้วย client credentials: `POST /v2/oauth/accessToken` ด้วย Channel ID และ secret ได้ token อายุสั้นเมื่อคู่ถูก (เพิกถอนได้ทันทีด้วย `POST /v2/oauth/revoke`) และได้ 4xx เมื่อผิด เดิมเอกสารเขียนว่าตรวจ secret ไม่ได้ ระบบจึงรู้ว่าผิดเมื่อ webhook แรกไม่ผ่าน signature

## การตัดสินใจ

- ค่าของ `X-Line-Retry-Key` คือ 16 byte แรกของ SHA-256 ของ retry key ของข้อความ (id) ตั้งบิต version 5 และ variant ของ RFC 4122 (`toLineRetryKey`) ใช้กับทุก key รวม UUIDv7 ค่าเดิมทุกครั้งที่ลองใหม่และหลัง restart
- `Message.firstPushAt` (คอลัมน์ใหม่ ว่างได้) เก็บเวลาที่ push ครั้งแรกของข้อความเริ่ม ด้วย compare-and-set บน null ก่อนเรียก LINE "ส่งอีกครั้ง" ถูกปฏิเสธด้วย `message.retry_expired` ตั้งแต่ `firstPushAt + LINE_RETRY_KEY_WINDOW_MS` (ปลายหน้าต่างนับว่าผ่าน) ไม่ใช้ `deliveryAttemptAt` เพราะเลื่อนทุกครั้งที่ส่งอีกครั้ง และไม่ใช้ `createdAt` เพราะข้อความที่ reply ล้มเหลวยังไม่เคยใช้ key กับ LINE หน้าเว็บได้ปลายหน้าต่างจาก `delivery.retryExpiresAt` และซ่อนปุ่มเอง
- Reply ที่ได้ 400 เป็น `line.reply_token_invalid` (push ต่อได้) เฉพาะเมื่อข้อความตรง `/invalid reply token/i` 400 อื่นเป็น `line.reply_failed` ซึ่ง `deliverOutbound` ไม่ push ต่อ
- Webhook ที่ signature ถูกตอบ 503 `db.unavailable` เฉพาะเมื่อทุก event ในก้อนล้มเหลว ไม่มีอะไรถูกบันทึก และ `settings.ping` ล้ม นอกนั้นยังตอบ 200 การกันซ้ำด้วย `webhookEventId` และ `lineMessageId` ทำให้ก้อนที่ LINE ส่งซ้ำถูกบันทึกครั้งเดียว
- บันทึก credential ต้องมี Channel ID (ตัวเลขไม่เกิน `LINE_CHANNEL_ID_MAX_CHARS` ไม่ใช่ความลับ แสดงบนหน้าจอได้) และตรวจคู่กับ secret ผ่าน `MessagingGateway.verifyChannelSecret`: คู่ผิดไม่บันทึก (`line.channel_secret_invalid`), ตรวจไม่ได้ (429, 5xx, timeout, เครือข่าย) บันทึกได้และสถานะเป็น `unchecked`, ถูกบันทึกพร้อม `lineSecretVerifiedAt` token ที่ได้ถูกเพิกถอนทันที ไม่ถูกเก็บหรือ log `TestLineConnection` ตรวจคู่นี้ด้วย แถวเดิมที่ไม่มี Channel ID ใช้งานได้ตามเดิมและแสดงว่า secret ยังไม่ได้ตรวจ

## ทางเลือกที่พิจารณา

- ส่ง UUIDv7 ตรงตัวต่อไป: ง่ายที่สุด แต่ถ้า LINE ไม่รับ version 7 ทุก push จะได้ 400
- ใช้ `crypto.randomUUID()` (v4) เก็บไว้ในแถว: ต้องเพิ่มคอลัมน์และย้ายข้อมูล การ derive จาก id ให้ค่าเดิมเสมอโดยไม่เก็บอะไร
- UUIDv5 ตามมาตรฐาน (SHA-1 กับ namespace): ได้ผลแบบเดียวกัน แต่ต้องเลือก namespace โดยไม่มีประโยชน์เพิ่ม บิตของ version และ variant คือสิ่งที่ LINE ตรวจ
- วัดหน้าต่างจาก `createdAt`: ปลอดภัยเกินไปกับข้อความที่ reply ล้มเหลวแล้วไม่เคย push
- ตอบ 5xx ทุกครั้งที่ event ใดล้มเหลว: event ที่ล้มเพราะข้อมูลของตัวเองจะถูกส่งซ้ำซ้ำ ๆ โดยไม่มีวันผ่าน
- ขวางการบันทึกเมื่อตรวจ secret ไม่ได้: LINE ที่ล่มชั่วคราวทำให้ตั้งค่าไม่ได้เลย

## ผลที่ตามมา

ทุก push ใช้ key แบบที่ LINE รับแน่นอน และ "ส่งอีกครั้ง" ไม่ทำให้ลูกค้าได้ซ้ำหลัง 24 ชั่วโมง แลกกับการที่แอดมินต้องพิมพ์ข้อความเก่าใหม่ ข้อความที่ push ก่อน migration ไม่มี `firstPushAt` จึงไม่มีหน้าต่าง Reply ที่ body ผิดรูปไม่กินโควตา push ข้อความไม่หายเมื่อฐานข้อมูลล่มระหว่างรับ webhook ถ้าเปิด "Webhook redelivery" Channel secret ที่ผิดถูกจับตอนบันทึกแทนตอนรอ webhook แรก แลกกับคำขอไป LINE เพิ่มสองครั้งต่อการบันทึกหรือทดสอบ

## จะทบทวนเมื่อ

LINE ยืนยันว่ารับ UUID version 7 เป็น retry key, เปลี่ยนอายุของ retry key หรือรูปแบบคำตอบของ reply token ที่ใช้ไม่ได้ หรือเปลี่ยน endpoint ของ client credentials
