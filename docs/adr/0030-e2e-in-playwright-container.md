# 0030: E2E ใน CI รันใน container ของ Playwright

> สถานะ: อนุมัติ · วันที่: 2026-11-19

## บริบท

งาน `e2e` ของ CI ([ADR 0013](0013-ci-on-main-then-deploy-hook.md)) ติดตั้ง Chromium และแพ็กเกจของระบบด้วย `playwright install --with-deps chromium` ทุกรอบ ขั้นนี้ดาวน์โหลดแพ็กเกจจาก mirror ของ Ubuntu ที่ runner ใช้ เมื่อ mirror ต่อไม่ได้ งานล้มก่อน test เริ่มรัน และงาน `deploy` ถูกข้าม ทั้งที่โค้ดไม่มีปัญหา เกิดสองรอบติดกันบน `main` (รอบที่ 3 และ 4)

## การตัดสินใจ

งาน `e2e` ยังรันบน runner และยังเปิด `db`, `stub`, `app` ด้วย Docker Compose เหมือนเดิม แต่คำสั่ง `playwright test` รันใน image `mcr.microsoft.com/playwright:v1.63.0-noble` ซึ่งมี Chromium และแพ็กเกจของระบบอยู่แล้ว container ใช้ network ของ host จึงเข้าถึง `localhost:3000` และ stub ได้เหมือนเดิม และ mount โฟลเดอร์งานของ runner เพื่อใช้ `node_modules` ที่ติดตั้งแล้วและเขียน `playwright-report` กลับมา image ตรึงด้วย digest เช่นเดียวกับ action ที่ตรึงด้วย SHA

## ทางเลือกที่พิจารณา

- ตัด `--with-deps` แล้วพึ่งแพ็กเกจที่ติดมากับ runner: แก้น้อยกว่า แต่ไม่มีอะไรยืนยันว่า runner มีครบทุกรุ่น และยังดาวน์โหลด browser ทุกรอบ
- รันซ้ำเมื่อล้ม: ไม่แก้สาเหตุ และ production ไม่ได้ deploy จนกว่า mirror จะกลับมา
- ให้ทั้งงานรันใน container (`container:` ของงาน): Docker Compose ต้องเข้าถึง daemon ของ runner จากใน container ซึ่งซับซ้อนกว่า

## ผลที่ตามมา

- CI ไม่พึ่ง mirror ของ Ubuntu ในงาน `e2e` แต่พึ่งการดึง image จาก `mcr.microsoft.com` แทน
- tag ของ image ต้องตรงกับรุ่นของ `@playwright/test` ใน `package.json` เมื่ออัปเกรด Playwright ต้องแก้ tag และ digest ใน [`ci.yml`](../../.github/workflows/ci.yml) พร้อมกัน ถ้าไม่ตรง Playwright แจ้งว่าไม่พบ browser และงานล้ม
- Node ใน image เป็นรุ่น 24 ตรงกับ `.nvmrc`
- ไฟล์ที่ container เขียน (`playwright-report`, `test-results`) เป็นของ root บน runner ซึ่งขั้น upload artifact อ่านได้
- การรันในเครื่องไม่เปลี่ยน: `pnpm test:e2e`

## จะทบทวนเมื่อ

- อัปเกรด `@playwright/test`
- การดึง image จาก `mcr.microsoft.com` ล้มบ่อย
