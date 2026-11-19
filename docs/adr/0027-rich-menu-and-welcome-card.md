# 0027: Rich menu และการ์ดต้อนรับจัดการจาก webchat ด้วย postback ชุดเดียว

> สถานะ: อนุมัติ การบันทึกเมนูแบบ compare-and-set ระบุเพิ่มใน [0028](0028-review-fixes-concurrency-polling-and-ci.md) · วันที่: 2026-11-19

## บริบท

ผู้ทดสอบที่เพิ่ม LINE OA เป็นเพื่อนไม่รู้ว่าลองอะไรได้บ้าง และไม่มีทางบอกระบบเองว่าอยากคุยกับ AI หรือกับคน ก่อนหน้านี้ AI ของลูกค้าแต่ละคนเปิดได้จากหน้าแชทของแอดมินเท่านั้น ส่วน rich menu และข้อความทักทายตั้งได้ใน LINE Official Account Manager ซึ่งอยู่นอก webchat ไม่รู้สถานะของ AI งบ หรือ kill switch และไม่บันทึกการกดลงในแชท

## การตัดสินใจ

1. Rich menu แบบ compact 2500×843 สามช่อง ("คุยกับ AI", "คุยกับแอดมิน", "วิธีทดสอบ") เผยแพร่และนำออกจากหน้าตั้งค่าของ webchat ผ่าน `MessagingGateway` (สร้าง → อัปโหลดรูปที่ host ของ content → ตั้งเป็นเมนูเริ่มต้น → ลบเมนูเก่า) ขั้นที่ล้มลบเมนูที่เพิ่งสร้าง และเก็บรหัสของความล้มเหลวล่าสุดไว้แสดง
2. ทุกปุ่มเป็น postback ที่มี `displayText` และ data แบบมีรุ่น `tw1:{action}` data อื่นถูกเพิกเฉย ปุ่มชุดเดียวกันใช้ทั้ง rich menu และการ์ดต้อนรับ และตัวจัดการเดียว (`HandleRichMenuAction`)
3. การกดเก็บเป็นข้อความขาเข้าชนิด `text` ที่ข้อความคือชื่อปุ่ม (สิ่งที่ LINE แสดงในแชทของลูกค้า) พร้อม `eventCode` ของปุ่ม หน้าเว็บแสดงเป็นบรรทัดเหตุการณ์ โมเดลเห็นเป็นบรรทัดกำกับ ไม่ใช่ชื่อปุ่ม การกดจึงได้ reply token ลำดับรายชื่อ และการกันซ้ำด้วย `webhookEventId` เหมือนข้อความ โดยไม่ต้องมีชนิดข้อความใหม่
4. "คุยกับ AI" เปิด AI ของลูกค้าคนนั้นแล้วส่งต่อให้ `GenerateAiReply` ซึ่งตรวจ kill switch, งบ, lock, ขอบเขตหัวข้อ และบันทึกค่าใช้จ่ายตามปกติ ยกเว้นสองกรณีที่ตอบด้วยข้อความคงที่โดยไม่เรียกโมเดล: kill switch ปิด (`ai_unavailable`) และงบเต็ม (`budget_reached`) ตัวคัดกรองของขอบเขตหัวข้อให้บรรทัดเริ่มคุยผ่านเหมือนคำทักทาย
5. "คุยกับแอดมิน" ปิด AI ของลูกค้าคนนั้นและตั้งสถานะรอแอดมินด้วยเหตุผลใหม่ `customer_asked_admin` "วิธีทดสอบ" ส่งข้อความที่แอดมินแก้ได้ ข้อความคงที่ทุกข้อส่งตามกฎการส่งเดิม (reply ก่อน push) เป็นข้อความผู้ส่ง `ai`
6. Follow event ที่มี reply token ได้การ์ดต้อนรับเป็น Flex bubble หนึ่งครั้ง ด้วย reply เท่านั้น ไม่ push ไม่เรียกโมเดล ล้มแล้วมีแค่ log การ์ดที่ส่งแล้วเก็บเป็นข้อความขาออกที่ `eventCode` เป็น `welcome.sent` ซึ่งไม่เปลี่ยนรายชื่อ ปิดได้ด้วยสวิตช์ที่ค่าเริ่มต้นเปิด
7. รูปของเมนูเป็น HTML ใน repo ที่เรนเดอร์เป็น PNG ด้วยสคริปต์เดียวกับไอคอน และพกเป็น base64 ในโค้ดของ adapter เพราะไฟล์ใน `public/` ไม่อยู่ใน serverless function

## ทางเลือกที่พิจารณา

- ให้แอดมินตั้ง rich menu และข้อความทักทายใน LINE Official Account Manager: ไม่ต้องเขียนโค้ด แต่ปุ่มทำได้แค่ส่งข้อความหรือเปิดลิงก์ ซึ่ง webchat แยกจากข้อความที่ลูกค้าพิมพ์เองไม่ได้ และไม่รู้ kill switch หรืองบ
- ปุ่มแบบ message action (ส่งข้อความ "คุยกับ AI"): ลูกค้าพิมพ์ข้อความเดียวกันเองได้ ระบบจึงแยกการกดไม่ได้ และข้อความไปถึงโมเดลตรง ๆ
- ชนิดข้อความใหม่หรือแถว event สำหรับการกด: แถว event ไม่มี reply token และไม่ทำให้แชทขึ้นบนรายชื่อ ชนิดใหม่ต้องแก้ทุกที่ที่แยกชนิดข้อความ
- เก็บรูปของเมนูเป็นไฟล์แล้วอ่านจาก `public/` หรือดาวน์โหลดจาก `APP_BASE_URL` ตอนเผยแพร่: แบบแรกไม่มีไฟล์ใน function ของ Vercel แบบที่สองพึ่งการ deploy และ cookie gate
- ส่งการ์ดต้อนรับด้วย push เมื่อ reply ล้ม: กินโควตา push ที่แผนฟรีมีน้อย และการ์ดที่มาช้ากว่าที่ลูกค้าเริ่มคุยแล้วไม่มีประโยชน์

## ผลที่ตามมา

- Migration ที่สิบเพิ่มค่า `customer_asked_admin` และ `ai_unavailable` ใน enum `HandoffReason` และคอลัมน์ของ Settings: `howToText`, `welcomeEnabled` (ค่าเริ่มต้น true), `welcomeText`, `richMenuId`, `richMenuPublishedAt`, `richMenuError`, `richMenuErrorAt` ทั้งหมดเป็นการเพิ่ม ([data-model](../architecture/data-model.md#migration-ที่สิบ-rich-menu-และข้อความต้อนรับ))
- `MessagingGateway` มีห้าเมธอดของ rich menu และ `OutboundLinePart` มีชนิด `card` ที่ adapter แปลงเป็น Flex ([domain-and-ports](../architecture/domain-and-ports.md#messaginggateway))
- รูปแบบ JSON ของ rich menu และ Flex เขียนตามเอกสารของ LINE ที่รู้ตอนเขียน เอกสารของ LINE เปิดจากเครื่องที่สร้างไม่ได้ สิ่งที่ต้องยืนยันอยู่ใน [line-messaging](../specs/line-messaging.md#ต้องยืนยันกับ-line-จริง) และขั้นที่ 12 และ 13 ของ [line-oa-setup](../runbooks/line-oa-setup.md#ทดสอบด้วยมือเมื่อมี-line-oa-จริง)
- แอดมินต้องปิด rich menu และ Greeting message ใน LINE Official Account Manager ([line-oa-setup ขั้นที่ 8](../runbooks/line-oa-setup.md#8-rich-menu-และข้อความต้อนรับ))
