# 0029: Build ของ production ตรวจ migration ที่ apply แล้วก่อน migrate

> สถานะ: อนุมัติ · วันที่: 2026-11-19

## บริบท

[ADR 0028](0028-review-fixes-concurrency-polling-and-ci.md) เพิ่มคำสั่ง `pnpm migrations:applied` ซึ่งเทียบ checksum ในตาราง `_prisma_migrations` กับไฟล์ใน `prisma/migrations/` เพราะ `prisma migrate deploy` ไม่ปฏิเสธ migration ที่ apply แล้วซึ่งถูกแก้หรือถูกลบ แต่ให้รันด้วยมือ เพราะการแก้ `vercel-build` เป็นการแก้ค่า deploy ที่ต้องให้เจ้าของงานอนุมัติก่อน การตรวจด้วยมือถูกลืมได้ เจ้าของงานอนุมัติให้ใส่ใน build แล้ว

## การตัดสินใจ

`vercel-build` รัน `pnpm migrations:applied` ก่อน `prisma migrate deploy` เมื่อ `VERCEL_ENV` เป็น `production` ทั้งสองคำสั่งใช้ `DIRECT_URL` ถ้า migration ที่ apply แล้วหายจากไฟล์หรือ checksum ไม่ตรง build ล้มก่อนมีการแก้ฐานข้อมูล และ production ยังเป็นรุ่นเดิม ฐานข้อมูลที่ยังไม่มีตาราง `_prisma_migrations` ผ่านการตรวจ (ไม่มี migration ที่ apply แล้วให้เทียบ)

## ทางเลือกที่พิจารณา

- รันด้วยมือตาม runbook ต่อไป: ไม่เพิ่มเวลา build แต่ขึ้นกับความจำของผู้ deploy
- รันใน CI: CI ไม่มี connection string ของ production และไม่ควรมี

## ผลที่ตามมา

- Build ของ production เปิด connection ไปฐานข้อมูลเพิ่มหนึ่งครั้งก่อน migrate
- Build ต้องมี `tsx` และ `pg` ซึ่งติดตั้งอยู่แล้ว ไม่มี dependency หรือ environment variable ใหม่
- การแก้ migration ที่ apply แล้วโดยตั้งใจ (ไม่ควรเกิด) ต้องคืนไฟล์จากประวัติของ Git ก่อน จึง deploy ได้ ([deploy](../runbooks/deploy.md#ตรวจ-migration-ที่-apply-แล้ว))
- คำสั่งด้วยมือใน runbook ยังใช้ได้ เพื่อรู้ผลก่อน merge

## จะทบทวนเมื่อ

- Prisma ตรวจ checksum ของ migration ที่ apply แล้วเองใน `migrate deploy`
