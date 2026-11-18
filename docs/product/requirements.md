# Requirement

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

## ที่มา

แบบทดสอบ Webchat ของ Robolingo: สร้างเว็บแชทที่ส่งข้อความไปยัง LINE Official Account (LINE OA) ได้

## Requirement จากโจทย์

| รหัส | ข้อกำหนด |
| --- | --- |
| R1 | ใช้ Next.js พร้อม TypeScript |
| R2 | ส่งข้อความผ่าน webchat ไปหา LINE OA ได้ |
| R3 | รับข้อความที่ส่งจาก LINE OA ได้ |
| R4 | เก็บโค้ดทั้งหมดใน GitHub repository แบบ public |
| R5 | Host บน Vercel |
| R6 | เห็นว่า user ที่ส่งมาคือใคร และเลือก user เพื่อตอบกลับได้ |

สิ่งที่ต้องส่ง: URL ของ LINE OA ที่ใช้ทดสอบ, URL เข้าใช้งาน webchat และ URL ของ GitHub repository

## การตีความ

Webchat คือหน้าจอของแอดมินร้าน ลูกค้าเพิ่ม LINE OA เป็นเพื่อนแล้วทักเข้ามา แอดมินเห็นรายชื่อลูกค้า เลือกคนที่จะคุย แล้วตอบกลับผ่านเว็บ ข้อความไปปรากฏในแอป LINE ของลูกค้าคนนั้น

## ขอบเขตที่เพิ่มจากโจทย์

| รหัส | ข้อกำหนด | spec |
| --- | --- | --- |
| E1 | หน้ายินดีต้อนรับที่ต้องใส่รหัสเข้าใช้ก่อนใช้งาน | [access-gate](../specs/access-gate.md) |
| E2 | รับรูป วิดีโอ และสติกเกอร์จากลูกค้า และแอดมินส่งรูปกับวิดีโอกลับได้ | [line-messaging](../specs/line-messaging.md) |
| E3 | สถานะการส่ง (กำลังส่ง ส่งแล้ว ส่งไม่สำเร็จ) และส่งซ้ำได้ | [webchat-inbox](../specs/webchat-inbox.md) |
| E4 | หลังบ้านสำหรับตั้งค่า LINE OA | [admin-backoffice](../specs/admin-backoffice.md) |
| E11 | ข้อความสำเร็จรูป และแสดง loading ฝั่ง LINE ขณะแอดมินพิมพ์ | [webchat-inbox](../specs/webchat-inbox.md) |
| E5 | AI ตอบแทนรายลูกค้า อ่านประวัติแชทเป็นบริบท | [ai-reply](../specs/ai-reply.md) |
| E6 | สวิตช์ปิด AI ทั้งระบบ ซึ่งทำให้สวิตช์รายลูกค้ากดไม่ได้ | [ai-reply](../specs/ai-reply.md) |
| E7 | คลังความรู้จาก PDF ที่ AI ใช้ตอบคำถามทั่วไปของร้าน | [knowledge-base](../specs/knowledge-base.md) |
| E8 | เลือกโมเดล และผู้ให้บริการ AI เปลี่ยนได้โดยไม่แตะแกนกลาง | [ai-reply](../specs/ai-reply.md) |
| E9 | Token และค่าใช้จ่ายโดยประมาณต่อข้อความและต่อลูกค้า แสดงเฉพาะหลังบ้าน | [usage-cost](../specs/usage-cost.md) |
| E10 | รันทั้งระบบในเครื่องได้ด้วย Docker คำสั่งเดียว | [infrastructure](../architecture/infrastructure.md) |
| E12 | ขอบเขตหัวข้อ: เมื่อเปิด AI คุยได้เฉพาะหัวข้อที่เจ้าของร้านกำหนด ตรวจด้วยการเรียกโมเดลแยกก่อนการตอบ และอยู่เหนือคำแนะนำของร้านกับคลังความรู้ พร้อมส่วน Guardrails ในหน้าตั้งค่า | [topic-guard](../specs/topic-guard.md), [ai-guardrails](../security/ai-guardrails.md) |

## สิ่งที่ไม่ทำ

- บัญชีผู้ใช้หลายคน บทบาท และการมอบหมายแชท
- หลาย LINE OA ในระบบเดียว
- การอัปเดตแบบ real-time ด้วย WebSocket (ใช้ polling)
- AI อ่านรูปหรือวิดีโอที่ลูกค้าส่งมา
- การค้นคลังความรู้ด้วย embedding (RAG)
- UI สองภาษา และธีมมืด
- การแปลงไฟล์วิดีโอ (รับเฉพาะ MP4)
- ปุ่มลบข้อมูลลูกค้าในหน้าเว็บ (ทำด้วยขั้นตอนใน runbook)
- ระบบแจ้งเตือนเมื่อระบบขัดข้อง

## ตารางไล่ requirement

| รหัส | spec | วิธีพิสูจน์ |
| --- | --- | --- |
| R1 | [infrastructure](../architecture/infrastructure.md) | โค้ดใน repo, typecheck ผ่านใน CI |
| R2 | [line-messaging](../specs/line-messaging.md), [webchat-inbox](../specs/webchat-inbox.md) | E2E เส้นที่ 2 และสคริปต์ทดสอบด้วยมือข้อ 3 |
| R3 | [line-messaging](../specs/line-messaging.md) | E2E เส้นที่ 1 และสคริปต์ทดสอบด้วยมือข้อ 2 |
| R4 | [runbooks/deploy](../runbooks/deploy.md) | repo เป็น public |
| R5 | [infrastructure](../architecture/infrastructure.md) | URL ของ webchat บน Vercel |
| R6 | [webchat-inbox](../specs/webchat-inbox.md) | E2E เส้นที่ 1 และ 2: ชื่อและรูปของลูกค้าในรายชื่อ เลือกแล้วตอบได้ |
| E12 | [topic-guard](../specs/topic-guard.md) | E2E เส้นที่ 9 และสคริปต์ทดสอบด้วยมือข้อ 9 |

เส้นทาง E2E และสคริปต์ทดสอบด้วยมืออยู่ใน [test-strategy](../qa/test-strategy.md) และ [manual-test-script](../qa/manual-test-script.md)
