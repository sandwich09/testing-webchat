# Deploy

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

ภาพรวมอยู่ใน [infrastructure](../architecture/infrastructure.md) ขั้นตอนตั้งค่าครั้งแรกทำโดยเจ้าของงาน เพราะต้องใช้บัญชีของบริการแต่ละเจ้า

## ตั้งค่าครั้งแรก

### 1. ฐานข้อมูล (Neon)

1. สร้างโปรเจกต์ใน region สิงคโปร์
2. คัดลอก connection string สองแบบ: pooled สำหรับ `DATABASE_URL` และแบบตรงสำหรับ `DIRECT_URL`

### 2. Vercel

1. สร้างโปรเจกต์จาก repo นี้ และตั้ง region ของ function เป็นสิงคโปร์
2. สร้าง Blob store แล้วผูกกับโปรเจกต์
3. ตั้ง environment variable เฉพาะสภาพแวดล้อม Production ตามตารางใน [infrastructure](../architecture/infrastructure.md) โดยสร้าง `SESSION_SECRET` และ `CREDENTIALS_ENCRYPTION_KEY` เป็นค่าสุ่ม 32 ไบต์ในรูป base64 คนละค่า (คำสั่งสร้างอยู่ใน `.env.example` ค่าที่ไม่ใช่ 32 ไบต์ทำให้แอปไม่เริ่ม) และไม่ตั้ง `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL` และ `RATE_LIMIT_SCALE` ตั้ง `FILE_STORAGE=blob` (ไม่ใช่ `local`) และไม่ต้องตั้ง `VERCEL_ENV` เพราะ Vercel ตั้งเป็น `production` ให้เอง ถ้ามีค่าที่ใช้เฉพาะการทดสอบหลงอยู่ (`LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL` หรือ `ANTHROPIC_BASE_URL` ถูกตั้งไม่ว่าค่าใด, `FILE_STORAGE=local` หรือ `RATE_LIMIT_SCALE` ไม่ใช่ 1) แอปไม่เริ่ม และ log ของ function มีบรรทัด `Missing or invalid environment variables: <ชื่อ>` ซึ่งบอกชื่อโดยไม่มีค่า ให้ลบหรือแก้ตัวนั้นแล้ว deploy ใหม่ ([project-setup ข้อ 6.10](../architecture/project-setup.md#610-envexample)) Preview และ Docker ไม่ถูกตรวจข้อนี้ และ preview deployment ปิดอยู่ตามขั้นที่ 4
   - `APP_BASE_URL` คือโดเมนถาวรของ production ที่จะให้ LINE เรียก เช่น `https://<project>.vercel.app` หรือโดเมนของตัวเอง ไม่ใส่ path ค่านี้ถูกใช้แสดง Webhook URL ในหน้าตั้งค่า (ซึ่งต้องคัดลอกไปใส่ใน LINE Developers Console) ช่องว่างหน้าหลัง, `/` ท้าย และตัวพิมพ์ใหญ่ของ host ถูกแก้ให้เอง ค่าที่ไม่ใช่ URL `http`/`https` ที่สมบูรณ์หรือมี path ทำให้แอปไม่เริ่มพร้อมชื่อ `APP_BASE_URL` ค่าที่ผิดแต่ถูกรูปแบบ (เช่นโดเมนเก่า) ไม่ทำให้เข้าระบบไม่ได้อีกแล้ว เพราะการตรวจต้นทางรับ origin ที่ browser ใช้อยู่ด้วย ([ADR 0025](../adr/0025-same-origin-or-app-base-url.md)) แต่ Webhook URL ที่แสดงจะผิด จึงต้องตรวจตามข้อ 2 ของ [ตรวจหลัง deploy](#ตรวจหลัง-deploy)
4. ปิดการ deploy อัตโนมัติจาก Git และ preview deployment
5. สร้าง Deploy Hook ของ branch `main` แล้วคัดลอก URL

### 3. GitHub

1. เก็บ URL ของ Deploy Hook เป็น secret ของ repo ชื่อ `VERCEL_DEPLOY_HOOK_URL` ก่อนตั้งค่านี้ CI ยังรันสี่งานตรวจครบ แต่งาน `deploy` จะข้ามและไม่มีการ deploy
2. ตั้ง branch protection ของ `main`: ต้องเข้าผ่าน PR และห้าม force-push
3. เปิด secret scanning, push protection และการแจ้งเตือนของ Dependabot

### 4. LINE

ทำตาม [line-oa-setup](line-oa-setup.md) หลัง deploy ครั้งแรกสำเร็จ

## การ deploy ปกติ

1. เปิด PR เข้า `main` พร้อมผลของ lint, typecheck และ test ที่รันเอง
2. เจ้าของงาน review และ merge แบบ squash
3. CI รัน 4 งาน เมื่อผ่านทั้งหมดจึงเรียก Deploy Hook
4. Build ของ production (`pnpm vercel-build` ใน `vercel.json`) รัน `pnpm migrations:applied` และ `prisma migrate deploy` ก่อน แล้วจึง build แอป ไม่รัน seed: production เริ่มจากฐานข้อมูลว่าง (ไม่มีผู้ใช้ ไม่มีคลังความรู้ ไม่มี credential ของ LINE ค่าใช้จ่ายเป็นศูนย์) seed (`pnpm db:seed`) เป็นข้อมูลตัวอย่างสำหรับ Docker ในเครื่องเท่านั้น ([data-model](../architecture/data-model.md#ข้อมูลตัวอย่าง-seed))
5. ตรวจหลัง deploy ตามหัวข้อถัดไป

## ตรวจหลัง deploy

1. `GET /api/health` ตอบสำเร็จ
2. เข้า webchat ด้วยรหัสเข้าใช้ได้ และ Webhook URL ในหน้าตั้งค่าขึ้นต้นด้วยโดเมนถาวรของ production ไม่ใช่โดเมนอื่น
3. ส่งข้อความจาก LINE แล้วขึ้นใน webchat
4. ส่วนสถานะระบบไม่มีข้อผิดพลาดใหม่

## เมื่อเข้าระบบไม่ได้เพราะ "คำขอนี้ไม่ได้มาจากหน้าเว็บของระบบ"

ข้อความนี้คือ 403 `request.origin_forbidden` ใน log ของ function หา `http.origin.rejected` (มี `requestId` และ `method` และ `route` เมื่อมาจากตัวห่อ route ไม่มีค่าของ header) แล้วตรวจตามลำดับ:

1. หน้าที่เปิดอยู่เป็นโดเมนของ deployment นี้จริง ไม่ใช่หน้าที่เปิดค้างจาก deployment หรือโดเมนอื่น ให้โหลดหน้าใหม่ที่ address เดิมแล้วลองอีกครั้ง
2. Browser ส่ง `Origin` มาหรือไม่: header `Referrer-Policy` ต้องเป็น `same-origin` ([project-setup ข้อ 6.2](../architecture/project-setup.md)) ส่วนเสริมของ browser ที่ตัด `Origin` หรือ `Referrer-Policy: no-referrer` ทำให้ได้ `Origin: null` ซึ่งถูกปฏิเสธ
3. มี proxy หรือ CDN ของตัวเองหน้า Vercel ที่ไม่ส่ง `x-forwarded-host` เป็นโดเมนที่ browser ใช้: ตั้ง `APP_BASE_URL` เป็นโดเมนนั้น หรือแก้ proxy ให้ส่ง header
4. ถ้ายังไม่หาย ดูข้อ [S6](../guidelines/pitfalls-and-prevention.md#s6-เข้าระบบไม่ได้เพราะต้นทางไม่ตรง)

## เมื่อ CI ล้ม

Deploy Hook ไม่ถูกเรียก production จึงยังเป็นรุ่นเดิม ให้แก้ด้วย PR ใหม่ ห้ามเรียก Deploy Hook ด้วยมือเพื่อข้าม CI งาน `deploy` เรียก hook เฉพาะเมื่อ `main` ยังเป็น commit ที่ตรวจแล้ว ถ้ามี commit ใหม่ระหว่างนั้น log ของงานมี notice ว่าข้าม และรอบของ commit ใหม่เป็นผู้ deploy

## ตรวจ migration ที่ apply แล้ว

`prisma migrate deploy` apply เฉพาะ migration ที่ยังไม่ apply และไม่ปฏิเสธ migration ที่ apply แล้วซึ่งถูกแก้หรือถูกลบ (ทดสอบกับฐานข้อมูลชั่วคราวด้วย Prisma 7.10.1 ทั้งสองกรณีจบด้วย exit 0 `prisma migrate status` ก็รายงานว่าตรงกัน) ขั้น `migrations:immutable` ของ CI เทียบแต่ละ commit กับ commit ก่อนหน้า commit ที่รอบของตัวเองล้มหรือถูกข้ามจึงหลุดได้ การตรวจที่เทียบกับฐานข้อมูลจริงคือ:

```bash
DIRECT_URL='<connection string แบบตรงของ Neon>' pnpm migrations:applied
```

คำสั่งอ่าน `_prisma_migrations` (เฉพาะแถวที่ apply สำเร็จและไม่ถูก roll back) แล้วเทียบ checksum (SHA-256 ของ `migration.sql`) กับไฟล์ใน `prisma/migrations/` ล้มพร้อมชื่อ directory และ `missing` หรือ `modified` ไม่พิมพ์ connection string ให้รันก่อน merge PR ที่แตะ `prisma/migrations/` และหลัง CI ของ `main` ล้มหรือถูกข้าม ถ้าล้ม ให้คืนไฟล์จากประวัติของ Git ตาม [D1](../guidelines/pitfalls-and-prevention.md#d1-แก้หรือลบ-migration-ที่-apply-ไปแล้ว) ก่อน deploy Build ของ production รันคำสั่งนี้เองก่อน `prisma migrate deploy` ([ADR 0029](../adr/0029-applied-migrations-check-in-production-build.md)) ถ้าไม่ตรง build ล้มและ production ยังเป็นรุ่นเดิม การรันด้วยมือข้างบนใช้เพื่อรู้ก่อน merge

## ย้อนกลับ

1. ใน Vercel เลือก deployment ก่อนหน้าแล้วเลื่อนขึ้นเป็น production
2. ถ้า deployment ที่มีปัญหามี migration ให้ตรวจก่อนว่าโค้ดรุ่นก่อนทำงานกับโครงตารางใหม่ได้ migration ของระบบนี้จึงต้องเป็นแบบเพิ่มเท่านั้น การลบหรือเปลี่ยนชนิดคอลัมน์ต้องทำเป็นสองขั้นและต้องถามเจ้าของงานก่อน ข้อยกเว้นที่อนุมัติแล้วคือ migration ที่ห้า ([data-model](../architecture/data-model.md#migration-ที่ห้า-ลบตารางและคอลัมน์ที่ไม่ใช้แล้ว)) โค้ดก่อน migration นั้นทำงานกับตารางหลัง migration ไม่ได้
3. เปิด PR ที่ revert การเปลี่ยนแปลง เพื่อให้ `main` ตรงกับ production

## รันในเครื่อง

```bash
docker compose up --build
```

ได้แอป, Postgres, stub ของ LINE และ Claude และข้อมูลตัวอย่าง รหัสเข้าใช้สำหรับเครื่อง dev อยู่ในไฟล์ compose ไม่ต้องมี credential ของบริการจริง
