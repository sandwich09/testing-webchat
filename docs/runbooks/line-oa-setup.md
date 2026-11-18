# ตั้งค่า LINE Official Account

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

ขั้นตอนฝั่ง LINE ทำโดยเจ้าของงาน ชื่อเมนูอาจต่างจากหน้าจอจริงเล็กน้อย เพราะ LINE ปรับหน้าจอเป็นระยะ ให้ยึดจุดประสงค์ของแต่ละขั้น

## 1. สร้าง LINE OA และเปิด Messaging API

1. สร้าง LINE Official Account ใน LINE Official Account Manager
2. ในการตั้งค่าของ OA เปิดใช้ Messaging API ซึ่งจะสร้าง channel ใน LINE Developers Console

## 2. เก็บ credential

ใน LINE Developers Console ของ channel นั้น:

1. คัดลอก **Channel secret**
2. ออก **Channel access token** แบบ long-lived แล้วคัดลอก

ห้ามวางค่าทั้งสองใน repo, issue, PR หรือแชท

## 3. ใส่ credential ใน webchat

1. เข้า webchat แล้วเปิดหน้าตั้งค่า ส่วน LINE Official Account
2. กรอก Channel secret และ Channel access token แล้วบันทึก ระบบจะตรวจกับ LINE ก่อนบันทึก
3. คัดลอก Webhook URL ที่หน้าจอแสดง

## 4. ตั้ง webhook ฝั่ง LINE

1. ใน LINE Developers Console วาง Webhook URL
2. เปิด "Use webhook"
3. กดปุ่มตรวจสอบ webhook ของ LINE ต้องได้ผลสำเร็จ

## 5. ปิดการตอบอัตโนมัติของ LINE

ใน LINE Official Account Manager ปิดข้อความตอบกลับอัตโนมัติและข้อความทักทายอัตโนมัติ ไม่เช่นนั้นลูกค้าจะได้ข้อความจากทั้ง LINE และ webchat

## 6. ตรวจ

1. เพิ่ม OA เป็นเพื่อนจากมือถือ แล้วส่งข้อความ
2. ข้อความต้องขึ้นใน webchat และส่วนสถานะระบบต้องแสดงเวลาที่รับ webhook ล่าสุด
3. ทำต่อตาม [manual-test-script](../qa/manual-test-script.md)

## ปัญหาที่พบบ่อย

| อาการ | ตรวจ |
| --- | --- |
| LINE ตรวจ webhook ไม่ผ่าน | Channel secret ที่บันทึกตรงกับ channel นี้หรือไม่ และ URL เป็นของ production หรือไม่ |
| ข้อความไม่ขึ้นใน webchat | "Use webhook" เปิดอยู่หรือไม่ และดูข้อผิดพลาดล่าสุดในส่วนสถานะระบบ |
| ส่งจาก webchat ไม่สำเร็จ | กด "ทดสอบการเชื่อมต่อ" ถ้าไม่ผ่านให้ออก access token ใหม่ |
| ลูกค้าได้ข้อความซ้ำจากระบบอื่น | การตอบอัตโนมัติของ LINE ยังเปิดอยู่ |

## URL ของ LINE OA สำหรับส่งงาน

ลิงก์เพิ่มเพื่อนของ OA อยู่ใน LINE Official Account Manager ใส่ลงตารางใน README ของ repo
