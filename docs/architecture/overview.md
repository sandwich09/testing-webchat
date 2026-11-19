# ภาพรวมสถาปัตยกรรม

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

## ส่วนประกอบ

ระบบเป็น Next.js แอปเดียวบน Vercel มีทั้งหน้าแชท หน้าตั้งค่า และ webhook ต่อกับบริการภายนอก 4 ตัว

```
  ลูกค้า (แอป LINE)                    แอดมิน (เบราว์เซอร์)
        │  ▲                              │            │
        ▼  │                              ▼            ▼
   LINE Platform                        แชท         ตั้งค่า
        │  ▲                              │            │
webhook │  │ reply / push                 ▼            ▼
        ▼  │                    ┌──────────────────────────────┐
┌───────────────────────────────┤   Next.js บน Vercel (แอปเดียว)  │
│  /api/line/webhook    /api/contacts ...    /api/settings ... │
│                                                              │
│   app (route, หน้าจอ) → core/use-cases → core/domain          │
│   adapters → core/ports                                      │
└───────┬───────────────┬───────────────┬──────────────────────┘
        ▼               ▼               ▼
   Neon Postgres    Vercel Blob     Claude API
   (ข้อมูลทั้งหมด)   (รูป วิดีโอ เสียง) (ตอบแชท อ่าน PDF)
```

## หลักการ

- **Hexagonal:** แกนกลาง (`core/`) ไม่รู้จัก Next.js, Prisma, LINE หรือ Claude รู้จักแค่ port ที่ตัวเองประกาศ ดู [backend](backend.md) และ [ADR 0003](../adr/0003-hexagonal-architecture.md)
- **ทางดึงข้อมูลทางเดียว:** หน้าเว็บดึงข้อมูลจาก API ฝั่ง client ทั้งหมด ไม่มี Server Component ที่โหลดข้อมูล ดู [frontend](frontend.md)
- **Polling แทน real-time:** ดู [ADR 0005](../adr/0005-polling-instead-of-realtime.md)
- **ทุกความล้มเหลวมีสถานะในฐานข้อมูล** ที่แอดมินเห็นได้ ไม่พึ่ง log อย่างเดียว

## เส้นทางหลัก

### 1. ลูกค้าส่งข้อความเข้ามา

1. LINE ยิง `POST /api/line/webhook`
2. ตรวจ signature จาก raw body แล้วเช็กว่า event ซ้ำหรือไม่
3. สร้างหรืออัปเดต Contact และบันทึก Message ลูกค้าที่เห็นครั้งแรกถูกดึงโปรไฟล์ในขั้นนี้ก่อนตอบ โดยมี timeout `LINE_PROFILE_TIMEOUT_MS` และไม่ retry ถ้าไม่สำเร็จ Contact ถูกบันทึกโดยไม่มีชื่อแล้วทำต่อ ([use-cases](use-cases.md#receivelineevents))
4. ตอบ 200
5. งานหลังตอบ: ดาวน์โหลดรูป วิดีโอ หรือเสียงเข้า Blob และถ้าเงื่อนไขครบจึงให้ AI ตอบ (ข้อ 3 ด้านล่าง)
6. Event อื่น: follow ส่งการ์ดต้อนรับด้วย reply token (`SendWelcome`) และ postback จากปุ่มของ rich menu หรือการ์ดทำตามปุ่มนั้น (`HandleRichMenuAction`) ([line-messaging](../specs/line-messaging.md#rich-menu))

### 2. แอดมินตอบจาก webchat

1. หน้าเว็บสร้าง id ของข้อความ แสดงข้อความทันทีในสถานะ "กำลังส่ง"
2. `POST /api/contacts/:id/messages` บันทึก Message แล้วเรียก LINE ตามกฎการส่งใน [line-messaging](../specs/line-messaging.md#ส่งข้อความ)
3. อัปเดตสถานะเป็นส่งแล้ว หรือส่งไม่สำเร็จพร้อมเหตุผล
4. AI ตอบแทนของลูกค้าคนนั้นถูกปิด (`aiEnabled` เป็น false) สถานะรอแอดมินถูกล้าง และมีบรรทัดเหตุการณ์ในแชท ไม่มีการหยุดแบบมีเวลา AI กลับมาเมื่อแอดมินเปิดสวิตช์เอง ([ai-reply](../specs/ai-reply.md#เมื่อแอดมินตอบเอง))

### 3. AI ตอบแทน

1. ตรวจเงื่อนไข: kill switch เปิด, AI ตอบแทนของลูกค้าเปิด, ลูกค้ายังติดตามอยู่, ข้อความเป็นข้อความตัวอักษร, งบวันนี้ยังเหลือ
2. รอช่วงรวมข้อความ ถ้ามีข้อความใหม่กว่าเข้ามา รอบนี้ถอนตัว
3. ถ้าขอบเขตหัวข้อเปิด เรียก Claude Haiku 5.5 (`GUARD_MODEL`) แยกหนึ่งครั้งเพื่อคัดกรองว่าข้อความอยู่ในหัวข้อหรือไม่ นอกหัวข้อส่งข้อความปฏิเสธแล้วจบ ([topic-guard](../specs/topic-guard.md))
4. ประกอบ prompt จากแกนของคำสั่งที่เป็นกลาง ชื่อ AI ขอบเขตคำตอบ คำแนะนำสำหรับ AI คลังความรู้ ประวัติล่าสุด (`AI_HISTORY_LIMIT`) และเวลาปัจจุบัน ตาม [ai-prompt](../specs/ai-prompt.md) แล้วเรียกโมเดล
5. ตรวจ kill switch อีกครั้ง แล้วส่งคำตอบทาง LINE
6. บันทึก Message ของ AI และ AiUsage
7. ถ้าขั้นใดล้มเหลวหรือโมเดลบอกว่าตอบไม่ได้ แชทขึ้นสถานะ "รอแอดมิน" พร้อมเหตุผล

### 4. อัปโหลด PDF เข้าคลังความรู้

1. ตรวจขนาด ชนิด และ hash
2. สร้าง KbDocument สถานะ "กำลังอ่านไฟล์"
3. ให้ Claude แปลงเป็นข้อความ นับหน้าจากตัวคั่นในผล นับ token และตรวจเพดานจำนวนหน้ากับเพดานของคลัง
4. บันทึกข้อความและเปลี่ยนสถานะเป็น "พร้อมใช้" หรือ "ไม่สำเร็จ" พร้อมเหตุผล

### 5. หน้าจออัปเดต

หน้าเว็บ polling ทุก `POLL_INTERVAL_MS` ด้วย cursor `updatedSeq` และหยุดเมื่อแท็บถูกซ่อน protocol อยู่ใน [api-contract](api-contract.md#protocol-ของ-polling)

## เอกสารที่เกี่ยวข้อง

- [backend](backend.md): ชั้น port use case และ API
- [domain-and-ports](domain-and-ports.md), [use-cases](use-cases.md), [api-contract](api-contract.md), [error-catalog](error-catalog.md): สัญญาของแกนกลาง ขั้นตอน HTTP และรหัส error
- [project-setup](project-setup.md): dependency, config, Docker, CI และค่าคงที่
- [frontend](frontend.md): โครงหน้า การดึงข้อมูล และ design system
- [data-model](data-model.md): ตาราง
- [infrastructure](infrastructure.md): การ deploy, Docker, CI และ environment variable
