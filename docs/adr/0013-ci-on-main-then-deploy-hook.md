# 0013: CI รันบน main แล้วจึงเรียก Deploy Hook

> สถานะ: อนุมัติ ข้อการตรวจ migration และเงื่อนไขของงาน deploy ถูกแทนที่บางส่วนโดย [0028](0028-review-fixes-concurrency-polling-and-ci.md) ขั้นติดตั้ง browser ของงาน E2E ถูกแทนที่โดย [0030](0030-e2e-in-playwright-container.md) · วันที่: 2026-11-18

## บริบท

เจ้าของงานต้องการให้ CI รันเฉพาะเมื่อมี push เข้า `main` แต่ถ้า Vercel deploy อัตโนมัติจาก Git พร้อมกัน โค้ดที่ test ไม่ผ่านจะขึ้น production ได้

## การตัดสินใจ

ปิดการ deploy อัตโนมัติจาก Git และ preview deployment ของ Vercel แล้วให้ CI เรียก Deploy Hook ของ Vercel เมื่องานทั้งสี่ผ่าน การเข้า `main` ทำผ่าน PR แบบ squash หนึ่ง PR ต่อหนึ่งขั้นของแผน ข้อความ commit เป็น Conventional Commits และติด tag `v1.0.0` ณ จุดส่งงาน

## ทางเลือกที่พิจารณา

- ให้ Vercel deploy เองจาก Git: ไม่รอ CI
- รัน CI บน PR ด้วย: เป็นด่านก่อน merge ที่ดีกว่า แต่เจ้าของงานเลือกไม่ใช้
- Preview deployment: ต้องมีฐานข้อมูลแยก ไม่เช่นนั้นจะแตะข้อมูลจริง

## ผลที่ตามมา

Production ได้เฉพาะโค้ดที่ผ่าน CI แต่ไม่มีด่านอัตโนมัติก่อน merge ผู้เปิด PR จึงต้องรัน lint, typecheck และ test เองแล้วแนบผล ถ้า CI ล้ม `main` จะแดงจนกว่าจะแก้

## จะทบทวนเมื่อ

`main` แดงบ่อยจนกระทบการทำงาน ควรเพิ่ม CI บน PR
