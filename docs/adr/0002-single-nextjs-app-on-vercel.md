# 0002: Next.js แอปเดียวบน Vercel ใช้ Route Handler และดึงข้อมูลฝั่ง client

> สถานะ: อนุมัติ · วันที่: 2026-11-18

## บริบท

โจทย์บังคับ Next.js, TypeScript และ Vercel ระบบมี deploy เดียว และต้องรันใน Docker ได้ด้วย

## การตัดสินใจ

ใช้ Next.js 16 (App Router) แอปเดียว ไม่ทำ monorepo ฝั่ง server ใช้ Route Handler ทั้งหมดบน Node runtime และปิด cache หน้าเว็บเป็นโครงเปล่า ข้อมูลทั้งหมดดึงจาก client ผ่าน API ชุดเดียวกับ polling งานหลังตอบ response ใช้ `after()`

## ทางเลือกที่พิจารณา

- Server Component โหลดข้อมูลครั้งแรก: มีทางดึงข้อมูลสองทาง และเสี่ยง hydration ไม่ตรงกับเวลาแบบสัมพัทธ์ ระบบนี้ไม่ต้องการ SEO
- Server Action: webhook และ polling ต้องเป็น HTTP endpoint อยู่แล้ว การมีสองรูปแบบทำให้ adapter ขาเข้าไม่เป็นแบบเดียว
- Monorepo แยก web กับ api: เกินขนาดของงาน

## ผลที่ตามมา

โค้ดน้อยลงและ test ง่าย แลกกับหน้าแรกที่ต้องรอ API หนึ่งรอบ ซึ่งรับได้สำหรับเครื่องมือภายใน

## จะทบทวนเมื่อ

ต้องการหน้าเว็บสาธารณะที่ต้องทำ SEO หรือมี backend ที่ต้อง deploy แยก
