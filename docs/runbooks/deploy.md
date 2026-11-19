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
3. ตั้ง environment variable เฉพาะสภาพแวดล้อม Production ตามตารางใน [infrastructure](../architecture/infrastructure.md) โดยสร้าง `SESSION_SECRET` และ `CREDENTIALS_ENCRYPTION_KEY` เป็นค่าสุ่มที่ยาวพอ และไม่ตั้ง `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL` และ `RATE_LIMIT_SCALE` ตั้ง `FILE_STORAGE=blob` (ไม่ใช่ `local`) และไม่ต้องตั้ง `VERCEL_ENV` เพราะ Vercel ตั้งเป็น `production` ให้เอง ถ้ามีค่าที่ใช้เฉพาะการทดสอบหลงอยู่ (`LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL` หรือ `ANTHROPIC_BASE_URL` ถูกตั้งไม่ว่าค่าใด, `FILE_STORAGE=local` หรือ `RATE_LIMIT_SCALE` ไม่ใช่ 1) แอปไม่เริ่ม และ log ของ function มีบรรทัด `Missing or invalid environment variables: <ชื่อ>` ซึ่งบอกชื่อโดยไม่มีค่า ให้ลบหรือแก้ตัวนั้นแล้ว deploy ใหม่ ([project-setup ข้อ 6.10](../architecture/project-setup.md#610-envexample)) Preview และ Docker ไม่ถูกตรวจข้อนี้ และ preview deployment ปิดอยู่ตามขั้นที่ 4
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
4. Build ของ production รัน migration ก่อน แล้วจึง build แอป
5. ตรวจหลัง deploy ตามหัวข้อถัดไป

## ตรวจหลัง deploy

1. `GET /api/health` ตอบสำเร็จ
2. เข้า webchat ด้วยรหัสเข้าใช้ได้
3. ส่งข้อความจาก LINE แล้วขึ้นใน webchat
4. ส่วนสถานะระบบไม่มีข้อผิดพลาดใหม่

## เมื่อ CI ล้ม

Deploy Hook ไม่ถูกเรียก production จึงยังเป็นรุ่นเดิม ให้แก้ด้วย PR ใหม่ ห้ามเรียก Deploy Hook ด้วยมือเพื่อข้าม CI

## ย้อนกลับ

1. ใน Vercel เลือก deployment ก่อนหน้าแล้วเลื่อนขึ้นเป็น production
2. ถ้า deployment ที่มีปัญหามี migration ให้ตรวจก่อนว่าโค้ดรุ่นก่อนทำงานกับโครงตารางใหม่ได้ migration ของระบบนี้จึงต้องเป็นแบบเพิ่มเท่านั้น การลบหรือเปลี่ยนชนิดคอลัมน์ต้องทำเป็นสองขั้นและต้องถามเจ้าของงานก่อน
3. เปิด PR ที่ revert การเปลี่ยนแปลง เพื่อให้ `main` ตรงกับ production

## รันในเครื่อง

```bash
docker compose up
```

ได้แอป, Postgres, stub ของ LINE และ Claude และข้อมูลตัวอย่าง รหัสเข้าใช้สำหรับเครื่อง dev อยู่ในไฟล์ compose ไม่ต้องมี credential ของบริการจริง
