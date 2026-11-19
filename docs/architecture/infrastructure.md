# Infrastructure

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

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
| `ACCESS_CODE` | รหัสเข้าใช้ (ตัดช่องว่างหน้าหลังตอนอ่าน ไม่มีความยาวขั้นต่ำ) |
| `SESSION_SECRET` | เซ็น cookie ร่วมกับ `ACCESS_CODE` (เปลี่ยนตัวใดตัวหนึ่ง cookie เดิมใช้ไม่ได้) ต้องเป็น 32 ไบต์ในรูป base64 |
| `CREDENTIALS_ENCRYPTION_KEY` | เข้ารหัส credential ของ LINE (AES-256-GCM) ต้องเป็น 32 ไบต์ในรูป base64 |
| `ANTHROPIC_API_KEY` | เรียก Claude |
| `FILE_STORAGE` | `blob` หรือ `local` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (Vercel ใส่ให้เมื่อสร้าง store) |
| `APP_BASE_URL` | โดเมนถาวรของ production: ใช้แสดง Webhook URL, สร้าง URL ของไฟล์ในที่เก็บแบบ local และเป็น origin ที่การตรวจต้นทางรับเพิ่มจาก same-origin ([ADR 0025](../adr/0025-same-origin-or-app-base-url.md)) |
| `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL` | ชี้ไป stub ในการทดสอบ ไม่ตั้งใน production (ระบบไม่เริ่มถ้าตั้งเมื่อ `VERCEL_ENV=production`) |
| `POLL_INTERVAL_MS`, `AI_DEBOUNCE_MS` | ไม่บังคับ ค่าเริ่มต้นตาม [project-setup ข้อ 10](project-setup.md#10-ค่าคงที่ของระบบ) (`AI_DEBOUNCE_MS` ไม่เกิน `AI_DEBOUNCE_MAX_MS`) ตั้งให้สั้นในการทดสอบ |
| `RATE_LIMIT_SCALE` | ตัวเลข ≥ 1 ค่าเริ่มต้น 1 คูณทุกค่าจำกัดความถี่ยกเว้นการลองรหัสเข้าใช้ compose ตั้ง 10 เพื่อให้ E2E ที่รันขนานไม่ถูกจำกัด ห้ามตั้งใน production (ระบบไม่เริ่มถ้าไม่ใช่ 1 เมื่อ `VERCEL_ENV=production`) |
| `VERCEL_ENV` | Vercel ตั้งให้เอง (`production`, `preview`, `development`) ไม่ต้องตั้งเองและไม่มีใน Docker, CI หรือเครื่อง dev เมื่อเป็น `production` ระบบปฏิเสธค่าที่ใช้เฉพาะการทดสอบตาม [project-setup ข้อ 6.10](project-setup.md#610-envexample) |

ตรวจด้วย schema ตอนเริ่มระบบ ขาดตัวไหนระบบล้มทันทีพร้อมบอกชื่อ ส่วน credential ของ LINE กรอกในหน้าตั้งค่าและเก็บในฐานข้อมูล `.env.example` ใน repo มีแต่ค่าตัวอย่างปลอม

## IP ของผู้เรียก

ใช้เป็น key ของการจำกัดความถี่เท่านั้น (เก็บเป็น keyed hash ไม่มี IP ดิบในฐานข้อมูล) `clientIpOf` ใน [`http-request.ts`](../../src/composition/http-request.ts) อ่านเฉพาะ **ค่าสุดท้าย** ของ `x-forwarded-for` และไม่อ่าน `x-real-ip` เหตุผลอยู่ใน [ADR 0022](../adr/0022-client-ip-from-last-forwarded-hop.md)

| ที่รัน | ใครเขียน `x-forwarded-for` | ค่าสุดท้ายคือ |
| --- | --- | --- |
| Vercel | edge ของ Vercel เขียนเป็น IP ที่มันเห็น ถ้าแทนที่ค่าที่ผู้เรียกส่งมา ค่าเดียวคือ IP จริง ถ้าต่อท้าย ค่าสุดท้ายยังเป็นของ Vercel (พฤติกรรมจริงต้องยืนยัน ตาม [implementation-plan](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง)) | IP ของผู้เรียกที่ปลอมไม่ได้ |
| Docker, `pnpm dev`, CI (ไม่มี proxy ข้างหน้า) | Next.js เติมจาก address ของ socket เฉพาะเมื่อคำขอไม่มี header นี้ | address ของ socket หรือค่าที่ผู้เรียกส่งมาเอง ซึ่งยอมรับได้เพราะไม่เปิดสู่สาธารณะ |

- ค่าที่ไม่ใช่ IP หรือยาวเกิน 45 ตัวอักษรถือว่าไม่มี IP
- IPv4 ใช้ตามเดิม (รวมรูป `::ffff:a.b.c.d`) IPv6 ใช้ network /64 เพราะผู้ใช้หนึ่งรายมักได้ทั้ง /64 และเปลี่ยน address ได้ทุกครั้ง
- คำขอที่ไม่มี IP: การลองรหัสเข้าใช้นับรวมในถังเดียว `RATE_LIMIT_UNLOCK_NO_IP` ที่เข้มกว่า และ log `access.unlock.client_ip_missing` ทุกครั้ง ผู้เรียกที่มี IP ไม่ถูกจำกัดตามถังนี้ action อื่นซึ่งต้องมี cookie อยู่แล้วใช้ subject `"unknown"` ร่วมกันตามเดิม

## CI และ deploy

รายละเอียดการตั้งค่าอยู่ใน [runbooks/deploy](../runbooks/deploy.md) และเหตุผลอยู่ใน [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md)

- CI รันเมื่อมี push เข้า `main` เท่านั้น มี 4 งานตรวจขนานกัน: ตรวจโค้ด (`migrations:immutable`, `migrations:destructive`, `docs:check`, format, lint, typecheck, unit test พร้อม coverage, build), adapter test กับ Postgres, E2E กับ Docker compose และความปลอดภัย (ช่องโหว่ของ dependency, สแกนความลับ) รอบที่เริ่มแล้วไม่ถูกยกเลิก
- เมื่อทั้ง 4 งานผ่าน งานที่ห้า `deploy` เรียก Deploy Hook ของ Vercel เฉพาะเมื่อ `main` ยังเป็น commit ที่ตรวจ ([ADR 0028](../adr/0028-review-fixes-concurrency-polling-and-ci.md))
- ปิดการ deploy อัตโนมัติจาก Git และ preview deployment ของ Vercel
- Action ทุกตัวล็อกด้วย commit hash และ workflow มีสิทธิ์แค่อ่านโค้ด
- CI ไม่มี secret อื่นนอกจาก URL ของ Deploy Hook

## ข้อจำกัดของ serverless ที่ออกแบบรองรับไว้

| ข้อจำกัด | วิธีรองรับ |
| --- | --- |
| ไม่มีหน่วยความจำร่วมระหว่าง function | ตัวนับความถี่และการรวมข้อความรัวใช้ฐานข้อมูล |
| Function มีเพดานเวลา | `maxDuration` ของ webhook และ route PDF ตาม [project-setup](project-setup.md#104-adapter-และ-route) ซึ่งมากกว่าเวลาแย่ที่สุดของงานหลังตอบที่ test ตรึงไว้, PDF จำกัดขนาดและจำนวนหน้า และสถานะกลางทางทุกตัว (`aiState`, ไฟล์ที่กำลังอ่าน, สื่อขาเข้า, ข้อความที่กำลังส่ง) มีการคืนสภาพเมื่อค้าง ([data-model กฎของ repository ข้อ 13](data-model.md#กฎของ-repository)) |
| งานหลังตอบไม่มีใครเห็นเมื่อค้าง | งานเก็บสื่อขาเข้ามีเพดานเวลาทุกขั้น (body ของ LINE, การเรียก Vercel Blob) และเพดานของทั้งงาน `MEDIA_JOB_BUDGET_MS` ที่ตั้งข้อความเป็น `failed` ก่อน function ถูกตัด พร้อม log ขั้นที่ค้าง ([ADR 0033](../adr/0033-buffer-inbound-media-and-stage-deadlines.md)) |
| ขนาด request มีเพดาน | PDF ไม่เกิน `PDF_MAX_BYTES` ส่วนรูปและวิดีโออัปโหลดจาก browser ตรงเข้าที่เก็บไฟล์ |
| หน่วยความจำของ function มีเพดาน | สื่อขาเข้าถูกอ่านทั้งไฟล์ก่อนอัปโหลดเข้า Blob (ไม่เกินรูป 10 MB เสียง 20 MB วิดีโอ 50 MB ต่องาน ใช้ราวสองเท่าชั่วครู่) เทียบกับค่าเริ่มต้นของ Vercel 2 GB (ยังไม่ได้ตรวจในหน้าตั้งค่าของ project) ข้อจำกัดคือจำนวนงานสื่อที่รันพร้อมกันใน instance เดียว ([ADR 0033](../adr/0033-buffer-inbound-media-and-stage-deadlines.md)) |
| Cold start และ Neon หลับเมื่อไม่มีการใช้ | Webhook ทำงานน้อยที่สุดก่อนตอบ 200 และกัน event ซ้ำเมื่อ LINE ส่งซ้ำ |
| Log เก็บไว้ไม่นาน | ความล้มเหลวสำคัญบันทึกลงฐานข้อมูลและแสดงในสถานะระบบ |

## สิ่งที่ต้องยืนยันตอนตั้งโปรเจกต์

รายการนี้มาจากความเข้าใจตอนออกแบบและยังไม่ได้ตรวจกับเอกสารปัจจุบัน ติดตามใน [แผนการสร้าง](../plans/implementation-plan.md)

- เพดานขนาด request, เพดานเวลาของ function (route PDF ต้องการ `KNOWLEDGE_MAX_DURATION_S`) และระยะเวลาเก็บ log ของ Vercel แผนฟรี
- โควตาของ Vercel Blob แผนฟรี
- Node 24 บน Vercel และ PostgreSQL 17 บน Neon

รายละเอียดของการตั้งโปรเจกต์ รุ่นของ dependency และค่าคงที่ของระบบอยู่ใน [project-setup](project-setup.md)
