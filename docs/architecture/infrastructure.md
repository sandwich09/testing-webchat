# Infrastructure

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

## รุ่นของเครื่องมือ

| เครื่องมือ | รุ่น | หมายเหตุ |
| --- | --- | --- |
| Next.js | 16.4 (App Router, Turbopack) | |
| React | 19 | |
| TypeScript | 5.9 แบบ `strict` | ไม่ใช้ 7 เพราะ typescript-eslint 8.73 รองรับ TypeScript ต่ำกว่า 6.1 |
| Node | 24 LTS | เป้าหมายของ Docker, CI และ Vercel ส่วน `engines` รับตั้งแต่ 22.12 เพราะสภาพแวดล้อมพัฒนาบนคลาวด์ใช้ Node 22 |
| pnpm | ล็อกใน `packageManager` | |
| Prisma | 7.10 กับ `@prisma/adapter-pg` | ระบุรุ่นเอง เพราะแท็ก `latest` บน npm ชี้ไปที่รุ่นทดสอบของ 8 |
| PostgreSQL | 17 | |
| Playwright | 1.63 | |

## สภาพแวดล้อม

| | Production | เครื่อง dev และ CI |
| --- | --- | --- |
| แอป | Vercel, function อยู่ region สิงคโปร์ | Docker (Next.js แบบ standalone) |
| ฐานข้อมูล | Neon region สิงคโปร์ ใช้ connection แบบ pooled และแบบตรงสำหรับ migration | Postgres ใน Docker |
| ไฟล์สื่อ | Vercel Blob | ดิสก์ในเครื่อง |
| LINE และ Claude | ของจริง | stub server ผ่านการตั้ง base URL |

`docker compose up` คำสั่งเดียวได้แอป, Postgres, stub และข้อมูลตัวอย่าง พร้อมรหัสเข้าใช้สำหรับทดสอบ ผู้ตรวจจึงเปิดดูหน้าจอได้โดยไม่ต้องมี credential

## การรันใน Next.js

- ทุก route ใช้ Node runtime และปิด cache
- Webhook อ่าน raw body เป็นข้อความก่อน parse
- งานหลังตอบ response ใช้ `after()` ซึ่งทำงานทั้งบน Vercel และใน Docker
- โมดูลที่อ่าน environment variable และ adapter ทั้งหมดใช้ได้เฉพาะฝั่ง server

## Environment variable

| ชื่อ | ใช้ทำอะไร |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | ฐานข้อมูลแบบ pooled และแบบตรง |
| `ACCESS_CODE` | รหัสเข้าใช้ |
| `SESSION_SECRET` | เซ็น cookie |
| `CREDENTIALS_ENCRYPTION_KEY` | เข้ารหัส credential ของ LINE |
| `ANTHROPIC_API_KEY` | เรียก Claude |
| `FILE_STORAGE` | `blob` หรือ `local` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (Vercel ใส่ให้เมื่อสร้าง store) |
| `APP_BASE_URL` | ใช้แสดง Webhook URL และตรวจต้นทางของคำขอ |
| `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL` | ชี้ไป stub ในการทดสอบ ไม่ตั้งใน production |
| `POLL_INTERVAL_MS`, `AI_DEBOUNCE_MS` | ตั้งให้สั้นในการทดสอบ |
| `RATE_LIMIT_SCALE` | ตัวเลข ≥ 1 ค่าเริ่มต้น 1 คูณทุกค่าจำกัดความถี่ยกเว้นการลองรหัสเข้าใช้ compose ตั้ง 10 เพื่อให้ E2E ที่รันขนานไม่ถูกจำกัด ห้ามตั้งใน production |

ตรวจด้วย schema ตอนเริ่มระบบ ขาดตัวไหนระบบล้มทันทีพร้อมบอกชื่อ ส่วน credential ของ LINE กรอกในหน้าตั้งค่าและเก็บในฐานข้อมูล `.env.example` ใน repo มีแต่ค่าตัวอย่างปลอม

## CI และ deploy

รายละเอียดการตั้งค่าอยู่ใน [runbooks/deploy](../runbooks/deploy.md) และเหตุผลอยู่ใน [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md)

- CI รันเมื่อมี push เข้า `main` เท่านั้น มี 4 งานขนานกัน: ตรวจโค้ด (lint, typecheck, unit test, build), adapter test กับ Postgres, E2E กับ Docker compose และความปลอดภัย (ช่องโหว่ของ dependency, สแกนความลับ)
- เมื่อทั้ง 4 งานผ่าน CI เรียก Deploy Hook ของ Vercel
- ปิดการ deploy อัตโนมัติจาก Git และ preview deployment ของ Vercel
- Action ทุกตัวล็อกด้วย commit hash และ workflow มีสิทธิ์แค่อ่านโค้ด
- CI ไม่มี secret อื่นนอกจาก URL ของ Deploy Hook

## ข้อจำกัดของ serverless ที่ออกแบบรองรับไว้

| ข้อจำกัด | วิธีรองรับ |
| --- | --- |
| ไม่มีหน่วยความจำร่วมระหว่าง function | ตัวนับความถี่และการรวมข้อความรัวใช้ฐานข้อมูล |
| Function มีเพดานเวลา | `maxDuration` ของ webhook และ route PDF ตาม [project-setup](project-setup.md#104-adapter-และ-route), PDF จำกัดขนาดและจำนวนหน้า และแชทมีสถานะ `aiState` ไว้ตรวจงานที่ค้าง |
| ขนาด request มีเพดาน | PDF ไม่เกิน `PDF_MAX_BYTES` ส่วนรูปและวิดีโออัปโหลดจาก browser ตรงเข้าที่เก็บไฟล์ |
| Cold start และ Neon หลับเมื่อไม่มีการใช้ | Webhook ทำงานน้อยที่สุดก่อนตอบ 200 และกัน event ซ้ำเมื่อ LINE ส่งซ้ำ |
| Log เก็บไว้ไม่นาน | ความล้มเหลวสำคัญบันทึกลงฐานข้อมูลและแสดงในสถานะระบบ |

## สิ่งที่ต้องยืนยันตอนตั้งโปรเจกต์

รายการนี้มาจากความเข้าใจตอนออกแบบและยังไม่ได้ตรวจกับเอกสารปัจจุบัน ติดตามใน [แผนการสร้าง](../plans/implementation-plan.md)

- เพดานขนาด request, เพดานเวลาของ function (route PDF ต้องการ `KNOWLEDGE_MAX_DURATION_S`) และระยะเวลาเก็บ log ของ Vercel แผนฟรี
- โควตาของ Vercel Blob แผนฟรี
- Node 24 บน Vercel และ PostgreSQL 17 บน Neon

รายละเอียดของการตั้งโปรเจกต์ รุ่นของ dependency และค่าคงที่ของระบบอยู่ใน [project-setup](project-setup.md)
