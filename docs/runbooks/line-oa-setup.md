# ตั้งค่า LINE Official Account

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

ขั้นตอนฝั่ง LINE ทำโดยเจ้าของงาน ชื่อเมนูอาจต่างจากหน้าจอจริงเล็กน้อย เพราะ LINE ปรับหน้าจอเป็นระยะ ให้ยึดจุดประสงค์ของแต่ละขั้น

## 1. สร้าง LINE OA และเปิด Messaging API

1. สร้าง LINE Official Account ใน LINE Official Account Manager
2. ในการตั้งค่าของ OA เปิดใช้ Messaging API ซึ่งจะสร้าง channel ใน LINE Developers Console

## 2. เก็บ credential

ใน LINE Developers Console ของ channel นั้น:

1. คัดลอก **Channel ID** จากแท็บ Basic settings (ตัวเลขประมาณสิบหลัก อยู่บนสุดของแท็บ ใต้ชื่อ channel) ค่านี้ไม่ใช่ความลับ ระบบใช้ตรวจว่า Channel secret เป็นของ channel นี้
2. คัดลอก **Channel secret** จากแท็บเดียวกัน
3. ออก **Channel access token** แบบ long-lived ในแท็บ Messaging API แล้วคัดลอก

ห้ามวาง Channel secret และ Channel access token ใน repo, issue, PR หรือแชท

## 3. ใส่ credential ใน webchat

1. เข้า webchat แล้วเปิดหน้าตั้งค่า แท็บ LINE (ยังไม่ได้เชื่อม หน้าตั้งค่าเปิดแท็บนี้เอง)
2. กรอก Channel ID, Channel secret และ Channel access token แล้วบันทึก (หลังบันทึก ช่องล็อกไว้ จะเปลี่ยนค่าใดให้กดปุ่มดินสอของช่องนั้น ระบบส่งเฉพาะค่าที่แก้และตรวจกับค่าที่เหลือที่บันทึกไว้) ระบบตรวจกับ LINE ก่อนบันทึกสามเรื่อง: access token ใช้ได้ (ถาม LINE ว่า token เป็นของ OA ใด), Channel secret เป็นของ Channel ID นี้ (ขอ token อายุสั้นแบบ client credentials) และ token อายุสั้นนั้นเป็นของบอทเดียวกับ access token (อ่านบอทด้วย token อายุสั้นแล้วเพิกถอนทันที ไม่เก็บ) คู่ที่ผิดหรือเป็นคนละ channel ไม่ถูกบันทึก ([ADR 0028](../adr/0028-review-fixes-concurrency-polling-and-ci.md)) ถ้า LINE ตอบไม่ได้ตอนนั้น ระบบบันทึกให้และส่วน LINE แสดงว่ายังตรวจ Channel secret ไม่ได้ ให้กด "ทดสอบการเชื่อมต่อ" อีกครั้งภายหลัง
3. คัดลอก Webhook URL ที่หน้าจอแสดง

Credential ที่บันทึกไว้ก่อนมีช่อง Channel ID ยังใช้งานได้ ส่วน LINE จะบอกว่ายังไม่ได้ตรวจ Channel secret จนกว่าจะบันทึกใหม่พร้อม Channel ID

## 4. ตั้ง webhook ฝั่ง LINE

1. ใน LINE Developers Console แท็บ Messaging API วาง Webhook URL
2. เปิด "Use webhook"
3. เปิด "Webhook redelivery" เมื่อ webhook ตอบไม่สำเร็จ LINE จะส่ง event เดิมซ้ำ ระบบตอบไม่สำเร็จ (503) เฉพาะเมื่อบันทึก event ใดในก้อนไม่ได้เลยเพราะฐานข้อมูลล่ม ซึ่งถ้าปิดไว้ ข้อความเหล่านั้นจะหายถาวร การเปิดปลอดภัยเพราะ event ที่ส่งซ้ำมี `webhookEventId` เดิมและระบบกันซ้ำด้วยค่านี้กับ id ของข้อความ ([line-messaging](../specs/line-messaging.md#รับ-event-webhook) ข้อ 5 และ 6) ผู้ใช้จึงไม่เห็นข้อความซ้ำและ AI ไม่ตอบซ้ำ
4. ปิด "Allow bot to join group chats" ไว้ ระบบรองรับเฉพาะแชทหนึ่งต่อหนึ่ง event จากกลุ่มหรือห้องถูกข้าม ([line-messaging ชนิดของ event](../specs/line-messaging.md#ชนิดของ-event))
5. กดปุ่มตรวจสอบ webhook ของ LINE ต้องได้ผลสำเร็จ

## 5. ปิดการตอบอัตโนมัติของ LINE

ใน LINE Official Account Manager ปิดข้อความตอบกลับอัตโนมัติและข้อความทักทายอัตโนมัติ (Greeting message) ไม่เช่นนั้นผู้ใช้จะได้ข้อความจากทั้ง LINE และ webchat การ์ดต้อนรับและ rich menu ตั้งจาก webchat ในขั้นที่ 8

## 6. ตรวจ

1. เพิ่ม OA เป็นเพื่อนจากมือถือ แล้วส่งข้อความ
2. ข้อความต้องขึ้นใน webchat และส่วนสถานะระบบต้องแสดงเวลาที่รับ webhook ล่าสุด
3. ทำต่อตาม [manual-test-script](../qa/manual-test-script.md)

## 7. รูปโปรไฟล์ของ LINE OA

ไฟล์อยู่ที่ `public/brand/line-profile-1024.png` (1024×1024) และ `public/brand/line-profile-640.png` (640×640) ใน repo และที่ `APP_BASE_URL/brand/line-profile-1024.png` หลัง deploy ([frontend Brand assets](../architecture/frontend.md#brand-assets))

1. เปิด LINE Official Account Manager เลือกบัญชี แล้วไปที่หน้าตั้งค่าบัญชี (ไอคอนเฟือง) ส่วนข้อมูลบัญชี
2. กดที่รูปโปรไฟล์ แล้วเลือกไฟล์ `line-profile-1024.png` (ถ้าหน้าจอแจ้งว่าไฟล์ใหญ่เกิน ใช้ `line-profile-640.png`)
3. LINE แสดงรูปเป็นวงกลม ตัว "T" ต้องอยู่กลางวงกลมครบ กดบันทึก
4. LINE อาจจำกัดจำนวนครั้งที่เปลี่ยนรูปโปรไฟล์ในช่วงเวลาหนึ่ง ตรวจภาพให้ถูกก่อนบันทึก

ชื่อเมนู ขนาดไฟล์ที่รับ และข้อจำกัดการเปลี่ยนรูปต้องยืนยันกับหน้าจอจริงของ LINE Official Account Manager

## 8. Rich menu และข้อความต้อนรับ

Rich menu (สามปุ่ม คุยกับ AI, คุยกับแอดมิน, วิธีทดสอบ) และการ์ดต้อนรับตั้งจาก webchat เท่านั้น ([line-messaging](../specs/line-messaging.md#rich-menu))

1. ทำขั้นที่ 3 ให้เสร็จก่อน (ปุ่ม "Publish rich menu" ปิดอยู่จนกว่าจะเชื่อม LINE)
2. ใน webchat ไปที่ ตั้งค่า › LINE › Rich menu แล้วกด "Publish rich menu" สถานะต้องเป็น "Publish แล้ว"
3. อย่าตั้ง rich menu ใน LINE Official Account Manager อีกที่หนึ่ง เมนูที่ตั้งผ่าน API กับที่ตั้งใน Manager ทับกัน และ webchat ไม่รู้ว่ามีเมนูจาก Manager ถ้าเคยตั้งไว้ ให้ปิดใน Manager ก่อน
4. ข้อความทักทายอัตโนมัติ (Greeting message) ของ LINE Official Account Manager ต้องปิด (ขั้นที่ 5) ไม่เช่นนั้นผู้ใช้ที่เพิ่มเพื่อนได้ทั้งข้อความของ LINE และการ์ดต้อนรับของ webchat สวิตช์ "ส่งข้อความต้อนรับเมื่อเพิ่มเพื่อน" เปิดอยู่ตั้งแต่ติดตั้ง
5. แก้ "ข้อความวิธีทดสอบ" และ "ข้อความต้อนรับ" ได้ในส่วนเดียวกัน ปุ่ม "ใช้ข้อความเริ่มต้น" กลับไปใช้ข้อความที่ระบบกำหนด (ลงท้ายตามคำลงท้ายที่ตั้ง)
6. ถ้าเปลี่ยนรูปของเมนู (`scripts/brand/richmenu-3x1.html`) ให้รัน `pnpm exec tsx scripts/render-brand-assets.ts` แล้ว deploy และกด "Publish อีกครั้ง" LINE เปลี่ยนรูปของเมนูเดิมไม่ได้ ระบบจึงสร้างเมนูใหม่แล้วลบเมนูเก่า

## โควตา push

แผนฟรีของ LINE OA ส่ง push ได้ราว 300 ข้อความต่อเดือน การตอบด้วย reply ไม่นับ ระบบใช้ reply ก่อนเสมอเมื่อมี token ที่ยังใช้ได้ ([line-messaging ส่งข้อความ](../specs/line-messaging.md#ส่งข้อความ)) สิ่งที่กินโควตา:

- ข้อความของแอดมินที่ส่งหลัง reply token ของผู้ใช้หมดอายุ (`REPLY_TOKEN_USABLE_MS` หลังข้อความล่าสุดของผู้ใช้) หรือถูกใช้ไปแล้ว ข้อความที่สองขึ้นไปที่ตอบผู้ใช้คนเดิมจึงเป็น push เสมอ
- คำตอบของ AI ที่ส่งหลัง token หมดอายุ
- ทุกครั้งที่กด "ส่งอีกครั้ง" ซึ่งใช้ push เสมอ
- push ที่ใช้แทน reply เมื่อ LINE ปฏิเสธ token

เมื่อเต็ม ข้อความเป็น "ส่งไม่สำเร็จ โควตาข้อความของ LINE เต็ม" จนถึงเดือนถัดไป หรือจนกว่าจะเปลี่ยนแผนใน LINE Official Account Manager ดูยอดที่ใช้ไปได้ในหน้าเดียวกัน

## ทดสอบด้วยมือเมื่อมี LINE OA จริง

สิ่งที่ stub ยืนยันแทน LINE ไม่ได้ ทำครั้งเดียวหลังขั้นที่ 6 ผ่าน บน production ด้วยมือถือหนึ่งเครื่องที่เพิ่ม OA เป็นเพื่อนแล้ว ระหว่างทดสอบปิด "เปิดใช้ AI ทั้งระบบ" ยกเว้นข้อ 5 และดู log ของ Vercel ด้วยชื่อ log ที่ระบุ (ไม่มีเนื้อหาข้อความใน log) บันทึกผลในตาราง "สิ่งที่ยืนยันแล้ว" ของ [implementation-plan](../plans/implementation-plan.md#สิ่งที่ยืนยันแล้ว) ถ้าผลต่างจากที่คาด ให้แก้ค่าใน [project-setup ข้อ 10](../architecture/project-setup.md#10-ค่าคงที่ของระบบ) และ comment ในโค้ดใน PR เดียวกัน ข้อนี้ใช้โควตา push ราว 10 ข้อความ

ระบบจัดการเองแล้วโดยไม่ต้องทดสอบด้วยมือ: รูปแบบของ retry key (UUID version 5 จาก id ข้อความ), การแยก 400 ของ reply ด้วยข้อความ `Invalid reply token`, หน้าต่าง 24 ชั่วโมงของ "ส่งอีกครั้ง", คำตอบ 202 ของไฟล์ที่ยังไม่พร้อม, การตรวจ Channel secret และการส่ง webhook ซ้ำหลัง 503 ([ADR 0023](../adr/0023-retry-key-v5-window-and-reply-400.md))

| ข้อ | สิ่งที่ต้องยืนยัน (อยู่ที่) | วิธีทดสอบ | ผ่านเมื่อ |
| --- | --- | --- | --- |
| 1 | push ที่ใช้ `X-Line-Retry-Key` ซ้ำได้ 409 พร้อม header `x-line-accepted-request-id` และไม่ส่งซ้ำ (`isRetryKeyAlreadyAccepted` ใน [`line-messaging-gateway.adapter.ts`](../../src/adapters/line/line-messaging-gateway.adapter.ts)) | จากเครื่องของเจ้าของงาน เรียก `POST https://api.line.me/v2/bot/message/push` สองครั้งด้วย body เดียวกัน (ข้อความ "retry-key test" ถึง userId ของมือถือ) และ header `X-Line-Retry-Key` เป็น UUID version 4 เดียวกัน | ครั้งแรก 200 ครั้งที่สอง 409 มี `x-line-accepted-request-id` และมือถือได้ข้อความเดียว |
| 2 | ข้อความ error จริงของ LINE: 400 ของ reply token ที่ใช้ไม่ได้ (`Invalid reply token`), 429 ของโควตา push เต็ม (`isMonthlyQuotaError` อ่าน `monthly limit`) และ 4xx ของ client credentials ที่คู่ผิด | ตอบผู้ใช้ด้วย reply token เดิมสองครั้ง (curl), บันทึก Channel ID ที่ผิดหนึ่งหลักในหน้าตั้งค่า และอ่านข้อความ 429 ของโควตาจากเอกสารของ LINE หรือเมื่อโควตาเต็มจริง | log มี `line.send.reply_token_rejected` เมื่อใช้ token ซ้ำ, หน้าตั้งค่าแสดงข้อความของ `line.channel_secret_invalid`, ข้อความของโควตาตรงกับ regex ใน [`line-http.ts`](../../src/adapters/line/line-http.ts) |
| 3 | "ส่งอีกครั้ง" ไม่ทำให้ผู้ใช้ได้ข้อความซ้ำ ([line-messaging ส่งข้อความ](../specs/line-messaging.md#ส่งข้อความ) ข้อ 5) | ส่งข้อความจาก webchat แล้วใน Neon ตั้ง `deliveryStatus = 'failed'` ของแถวนั้นด้วยมือ (จำลองการส่งที่ไม่รู้ผล) แล้วกด "ส่งอีกครั้ง" | ฟองเป็น "ส่งแล้ว" มือถือมีข้อความเดียว และ log มี `line.send.succeeded` ที่ `channel` เป็น `push` |
| 4 | อายุจริงของ reply token ใช้ได้อย่างน้อย `REPLY_TOKEN_USABLE_MS` และใช้ได้ครั้งเดียว | ส่งข้อความจากมือถือ แล้วตอบจาก webchat ที่ราว 10, 45 และ 55 วินาทีหลังส่ง (คนละรอบ) | ที่ 10 และ 45 วินาที log มี `line.send.succeeded` ด้วย `channel = reply` ไม่มี `line.send.reply_token_rejected` ที่ 55 วินาทีระบบใช้ push เอง |
| 5 | AI ส่งด้วย reply token ภายในเวลาและ loading `LINE_LOADING_SECONDS` ใช้ได้ | เปิด AI ทั้งระบบและของผู้ใช้คนนั้น แล้วถามคำถามที่ตอบได้จากคลังความรู้ | มือถือแสดง loading ระหว่างรอ ไม่มี `line.loading.failed` และคำตอบมาถึง |
| 6 | วิดีโอขาเข้าและขาออก: ไฟล์ขาเข้าได้ 202 ระหว่าง transcode แล้วเก็บได้, ภาพตัวอย่างที่ `content/preview` และขนาดสื่อขาออก (`IMAGE_MAX_BYTES`, `VIDEO_MAX_BYTES`, `PREVIEW_MAX_BYTES`) | ส่งวิดีโอยาวราวหนึ่งนาทีจากมือถือ แล้วส่งรูป JPEG ใกล้ 10 MB และวิดีโอ MP4 ใกล้ 50 MB จาก webchat | วิดีโอขาเข้าเล่นได้ในแชทพร้อมภาพตัวอย่าง (log อาจมี `media.store.not_ready` ก่อน `media.store.succeeded`) และมือถือเปิดไฟล์ขาออกได้ทั้งสอง |
| 7 | Host ของรูปโปรไฟล์และสติกเกอร์อยู่ใน CSP (`profile.line-scdn.net`, `sprofile.line-scdn.net`, `stickershop.line-scdn.net`) | ส่งสติกเกอร์จากมือถือด้วยบัญชีที่มีรูปโปรไฟล์ | รูปโปรไฟล์และสติกเกอร์ขึ้นในแชท และ console ของ browser ไม่มี CSP violation |
| 8 | `events[].mode` เป็น `standby` เมื่อ channel ไม่ได้เป็น active และระบบไม่ใช้ reply token ของ event นั้น | ถ้าเปิดใช้โหมดแชทของ LINE Official Account Manager คู่กับ webhook ให้ส่งข้อความระหว่างที่แชทอยู่ในโหมดนั้น | ข้อความขึ้นใน webchat และคำตอบจาก webchat ไปทาง push (log `channel = push`) |
| 9 | ความยาวข้อความ `LINE_TEXT_MAX_CHARS` และจำนวน `LINE_MAX_PARTS_PER_REQUEST` ต่อคำขอ | วางข้อความภาษาไทยที่มีวรรณยุกต์ยาว 5000 ตัวอักษรใน webchat แล้วส่ง และเรียก push ด้วยมือด้วย 5 และ 6 ข้อความใน `messages` | ข้อความยาวส่งเป็นข้อความเดียว, 5 ได้ 200 และ 6 ได้ 400 |
| 10 | การตอบกลับ: `message.quotedMessageId` ของข้อความตัวอักษร และ `sentMessages[].id` ของ reply และ push ([line-messaging](../specs/line-messaging.md#ข้อความที่ตอบกลับ)) | ส่งข้อความจากหน้าแชท แล้วในมือถือกดค้างที่ข้อความนั้น เลือก "ตอบกลับ" และพิมพ์ตอบ ทำซ้ำกับข้อความของผู้ใช้เอง รูป และข้อความเก่าก่อน migration ที่เจ็ด | ฟองของผู้ใช้มีกล่องอ้างอิงที่ชี้ข้อความที่ถูกต้อง กดแล้วเลื่อนไปหา ข้อความเก่าแสดง "ข้อความต้นทางไม่พร้อมแสดง" |
| 11 | ข้อความเสียงขาเข้า: ชนิดไฟล์จริงของ LINE (สมมติ M4A), `Content-Type` ที่ LINE ส่ง, `message.duration`, เสียงยาว และเสียงจาก `contentProvider` ภายนอก ([line-messaging](../specs/line-messaging.md#สื่อขาเข้า)) | จากมือถือ กดค้างปุ่มไมค์อัดเสียงสั้น ๆ ส่งหนึ่งครั้ง อัดยาวราวหนึ่งนาทีอีกครั้ง แล้วเปิดแชทใน Chromium และ Safari กดเล่นและเลื่อนตำแหน่ง | ฟองเสียงแสดงตัวเล่น เวลาตรงกับความยาวที่อัด เล่นได้และเลื่อนได้ log `media.store.succeeded` ถ้าได้ `failed` ให้ดูว่าไฟล์ขึ้นต้นด้วย byte แบบใดแล้วเพิ่มการตรวจใน `sniffContentType` เสียงจากบอทหรือแอปภายนอก (ถ้าหาได้) ต้องเป็น "โหลดข้อความเสียงไม่สำเร็จ" |
| 12 | Rich menu: รูป 2500×843, `selected: true`, postback กับ `displayText` และสามเส้นทางของปุ่ม ([line-messaging](../specs/line-messaging.md#เมื่อผู้ใช้กดปุ่ม)) | กด "Publish rich menu" แล้วเปิดแชทของ OA ในมือถือ กด "วิธีทดสอบ", "คุยกับแอดมิน" แล้ว "คุยกับ AI" (เปิด AI ทั้งระบบเฉพาะข้อนี้) จากนั้นปิด kill switch แล้วกด "คุยกับ AI" อีกครั้ง และกด "นำ rich menu ออก" | เมนูขึ้นเปิดอยู่ รูปคมไม่ถูกตัด ชื่อปุ่มขึ้นเป็นข้อความของผู้ใช้ ได้ข้อความวิธีทดสอบ ข้อความรับทราบ คำทักทายของ AI และ "ตอนนี้ AI ปิดให้บริการอยู่ …" ตามลำดับ webchat มีบรรทัด "ผู้ใช้กดปุ่ม …" ทุกครั้ง หลังนำออกเมนูหายจากแชท |
| 13 | การ์ดต้อนรับ: Flex `linearGradient`, รูปโลโก้จาก `APP_BASE_URL` และปุ่มในการ์ด ([line-messaging](../specs/line-messaging.md#ข้อความต้อนรับ)) | บล็อก OA แล้วเลิกบล็อก (หรือเพิ่มเพื่อนด้วยบัญชีที่สอง) บน iOS, Android และ LINE บน desktop เท่าที่มี แล้วกดปุ่มทั้งสามในการ์ด | การ์ดมาครั้งเดียว หัวเป็น gradient (หรือสีชมพูบานเย็นทึบ) มีโลโก้และชื่อ OA ปุ่มทำงานเหมือน rich menu webchat มีกล่อง "ข้อความต้อนรับ" ถ้าไม่ได้การ์ด ดู log `line.welcome.failed` |

ข้อที่ทดสอบด้วยมือไม่ได้ ให้ยืนยันจากเอกสารของ LINE: ระยะเวลาที่ LINE เก็บไฟล์ของข้อความขาเข้า และช่วงของ `loadingSeconds` ที่รับได้

## ปัญหาที่พบบ่อย

| อาการ | ตรวจ |
| --- | --- |
| LINE ตรวจ webhook ไม่ผ่าน | ส่วน LINE ในหน้าตั้งค่าบอกว่า LINE ยืนยัน Channel secret แล้วหรือไม่ (ถ้ายัง ให้บันทึกใหม่พร้อม Channel ID) และ URL เป็นของ production หรือไม่ |
| บันทึกไม่ได้เพราะ Channel ID กับ Channel secret ไม่ตรงกัน | คัดลอกทั้งสองค่าจากแท็บ Basic settings ของ channel เดียวกันอีกครั้ง ถ้าเพิ่งออก secret ใหม่ ให้ใช้ค่าใหม่ |
| บันทึกไม่ได้เพราะ Channel access token เป็นของ channel อื่น (`line.channel_mismatch`) | ออก Channel access token จากแท็บ Messaging API ของ channel เดียวกับ Channel ID และ Channel secret แล้วบันทึกทั้งสามค่าอีกครั้ง |
| ส่งไม่สำเร็จ โควตาข้อความของ LINE เต็ม | ดูยอดใน LINE Official Account Manager ตาม [โควตา push](#โควตา-push) |
| ข้อความไม่ขึ้นใน webchat | "Use webhook" เปิดอยู่หรือไม่ และดูข้อผิดพลาดล่าสุดในส่วนสถานะระบบ |
| ส่งจาก webchat ไม่สำเร็จ | กด "ทดสอบการเชื่อมต่อ" ถ้าไม่ผ่านให้ออก access token ใหม่ |
| ผู้ใช้ได้ข้อความซ้ำจากระบบอื่น | การตอบอัตโนมัติของ LINE ยังเปิดอยู่ |

## URL ของ LINE OA สำหรับส่งงาน

ลิงก์เพิ่มเพื่อนของ OA อยู่ใน LINE Official Account Manager ใส่ลงตารางใน README ของ repo
