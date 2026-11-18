# กฎโค้ด

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

แต่ละข้อระบุว่าใครเป็นผู้ตรวจ: **lint** คือเครื่องมือบังคับ และ **review** คือคนตรวจตอนเปิด PR

## 1. ทิศทางการพึ่งพา (lint)

```
app/ (route, หน้าจอ)  →  core/use-cases  →  core/domain
adapters/             →  core/ports
composition/          →  ทุกชั้น
```

- `core/` ห้าม import Next.js, Prisma, SDK ใด ๆ, zod และ `process.env`
- Route handler เรียก use case เท่านั้น ห้ามเรียก repository หรือ adapter ตรง
- Adapter ห้ามเรียก adapter ตัวอื่น การประสานงานทำใน use case
- โค้ดฝั่ง server (adapter, composition, การอ่าน environment variable) ห้ามถูก import จากหน้าจอ
- ข้ามชั้นต้อง import ผ่าน `index.ts` ของชั้นปลายทาง ยกเว้น `src/common/` และ `src/features/*/` ซึ่งไม่มี `index.ts` (ห้ามสร้าง barrel) และ import ไฟล์ที่ต้องการตรง
- Lint บังคับข้อนี้ด้วยกฎ `boundaries/dependencies` ของ eslint-plugin-boundaries ตารางที่อนุญาตอยู่ใน [project-setup](../architecture/project-setup.md#63-eslintconfigmjs)

## 2. หน้าที่ของแต่ละชั้น (review)

| ชั้น | ทำ | ไม่ทำ |
| --- | --- | --- |
| Route handler | ตรวจ request ด้วย schema, เรียก use case, แปลงผลเป็น response | ตัดสินใจทางธุรกิจ, query ฐานข้อมูล |
| Use case | ประสานงานหนึ่งเรื่องต่อหนึ่งไฟล์ | รู้จัก HTTP หรือโครงตาราง |
| Domain | กฎล้วน ๆ ไม่มีผลข้างเคียง | อ่านเวลา, สุ่มค่า, เรียก I/O |
| Adapter | แปลงระหว่างโลกภายนอกกับ type ของ domain | ตัดสินใจทางธุรกิจ |

เส้นทางที่อ่านอย่างเดียวใช้ use case บาง ๆ เรียก repository ตรงได้

## 3. เวลา id และค่าสุ่ม (lint)

แกนกลางรับผ่าน port `Clock` และ `IdGenerator` ห้ามเรียก `Date.now()`, `new Date()` แบบไม่มีอาร์กิวเมนต์ หรือสร้าง id เอง

## 4. Type

- `strict` และ `noUncheckedIndexedAccess` (lint)
- ห้าม `any` และห้ามใช้ `!` ข้าม null (lint)
- การ cast ต้องมีเหตุผลในบรรทัดเดียวกัน (review)
- id แต่ละชนิดเป็น type แยกกัน (review)
- `switch` บนชนิดข้อมูลต้องครอบทุกกรณี (lint)

## 5. การตรวจข้อมูล

- ทุกขอบของระบบตรวจด้วย zod: webhook, body ของ API, คำตอบของ API ที่หน้าเว็บรับ, คำตอบของ AI และ environment variable (review)
- Schema ของ API อยู่ใน `src/contracts/` ใช้ร่วมกันทั้งสองฝั่ง และ import package ได้แค่ `zod` (lint) ยกเว้นไฟล์ `*.spec.ts` ของ contract ซึ่ง import `vitest` ได้
- Schema ของ webhook เข้มเฉพาะ field ที่ใช้ และปล่อยผ่าน field อื่น
- ชนิดไฟล์ตรวจจากเนื้อไฟล์

## 6. Error

- ความล้มเหลวที่คาดได้คืนเป็น `{ ok: true, ... } | { ok: false, error }` พร้อมรหัสที่กำหนดไว้ ไม่ throw (review)
- Promise ทุกตัวต้องถูก await หรือจัดการอย่างชัดเจน (lint)
- ห้าม `console.log` ใช้ port `Logger` (lint)
- Logger รับเฉพาะ field ที่อนุญาต ห้ามส่ง object ทั้งก้อน

## 7. การตั้งชื่อไฟล์ (review)

- Use case ตั้งตามการกระทำ: `send-admin-message.use-case.ts`
- ท้ายชื่อบอกบทบาท: `*.model.ts`, `*.logic.ts`, `*.port.ts`, `*.repository.ts`, `*.adapter.ts`, `*.mapper.ts`
- หน้าจอขึ้นต้นด้วยชื่อ feature: `inbox.api.ts`, `inbox.logic.ts`, `InboxPage.tsx`
- Test อยู่ข้างไฟล์ที่ทดสอบ: `*.spec.ts`

## 8. หน้าจอ (review ยกเว้นที่ระบุ)

- ไฟล์ใน `app/` ทำหน้าที่แค่ import component ของ feature
- เฉพาะไฟล์ `*.api.ts` เรียก `fetch` ได้ (`src/features/*/<feature>.api.ts` และ `src/common/common.api.ts` ที่มี `apiFetch`) component และไฟล์อื่นของหน้าจอเรียกผ่านไฟล์เหล่านั้น (lint)
- การคำนวณและการแปลงข้อมูลอยู่ใน `*.logic.ts` เป็นฟังก์ชันล้วน
- ข้อความที่ผู้ใช้เห็นอยู่ใน `*.constants.ts` ของ feature และเป็นไปตาม [ux-writing](ux-writing.md)
- ไม่ใช้ environment variable ที่ขึ้นต้นด้วย `NEXT_PUBLIC_` (lint)
- ไม่แทรก HTML จากข้อมูล (lint)

## 9. ค่าคงที่ และของกลาง (review)

- ค่าที่ใช้มากกว่าหนึ่งที่ต้องมีชื่อและอยู่ที่เดียว เช่น ช่วง polling, เวลารวมข้อความ, จำนวนประวัติที่ส่งให้ AI, เพดานขนาดไฟล์
- ก่อนเขียน helper ใหม่ ดูว่ามีอยู่แล้วหรือไม่ ของที่ใช้ feature เดียวอยู่กับ feature นั้น เมื่อ feature ที่สองต้องใช้จึงย้ายไป `common`

## 10. ความเรียบง่าย (review)

- Port มีเฉพาะสิ่งที่ข้ามขอบระบบจริง ไม่สร้าง abstraction ล่วงหน้า
- Comment อธิบายเหตุผลเฉพาะจุดที่ไม่ชัดจากโค้ด เช่น ข้อจำกัดของ LINE หรือ Vercel
- ไฟล์ที่เกินราว 300 บรรทัด หรือฟังก์ชันที่เกินราว 50 บรรทัด เป็นสัญญาณให้พิจารณาแยก
- Server ไม่ดึง URL ที่มาจากผู้ใช้หรือลูกค้า ดึงเฉพาะจาก host ที่กำหนดตายตัว

## 11. Git

- Branch ทำงานอายุสั้น เข้า `main` ผ่าน PR แบบ squash เท่านั้น
- Commit เป็น Conventional Commits ภาษาอังกฤษ เล็กและทำเรื่องเดียว เช่น `feat(inbox): send admin reply with retry key`
- แม่แบบ PR: เปลี่ยนอะไรและทำไม, ทดสอบอย่างไรพร้อมผล, ภาพหน้าจอเมื่อแตะ UI, เอกสารที่แก้, ความเสี่ยงและวิธีย้อนกลับ

## รายการตรวจก่อนเปิด PR

- [ ] lint, typecheck, unit test ผ่าน และ E2E ผ่านเมื่อแตะเส้นทางของผู้ใช้
- [ ] กฎใหม่มี unit test และ adapter ใหม่ผ่านชุดทดสอบของ port
- [ ] งานหน้าจอถูกเปิดดูจริงที่ 390 และ 1280
- [ ] เอกสารที่เกี่ยวข้องถูกแก้ใน commit เดียวกัน
- [ ] ไม่มี credential หรือข้อมูลลูกค้าจริงในโค้ด, test และ log
