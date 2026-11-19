# กฎโค้ด

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

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
- หน้าจอขึ้นต้นด้วยชื่อ feature: `inbox.api.ts`, `inbox.logic.ts`, `InboxPage.tsx` ไฟล์ที่เป็นของพื้นที่เดียวใน feature ใส่ชื่อพื้นที่ต่อ: `<feature>.<พื้นที่>.<บทบาท>.ts` เช่น `inbox.thread.logic.ts`, `settings.guard.hooks.ts` component ใช้ชื่อ PascalCase ตามเดิม
- บทบาทของไฟล์หน้าจอ (ที่ไม่ใช่ component):

  | ท้ายชื่อ | มีอะไร |
  | --- | --- |
  | `*.api.ts` | ฟังก์ชันเรียก API และตรวจคำตอบด้วย schema |
  | `*.logic.ts` | ฟังก์ชันล้วนและ type: reducer, การแปลงข้อมูล, ข้อความที่แสดง ไม่มี React ไม่เรียก API ของ browser และไม่อ่านเวลา |
  | `*.controller.ts` | object ธรรมดาที่เก็บ state และทำผลข้างเคียงผ่านฟังก์ชันที่รับเข้ามาเท่านั้น (API, browser, นาฬิกา) จึงทดสอบได้โดยไม่มี React และ browser เช่น `inbox.attachment.controller.ts`, `inbox.typing.controller.ts` |
  | `*.hooks.ts` | React hook ที่ผูก API, cache และ controller เข้ากับฟังก์ชันจริงของ browser และ state ระดับ module ที่ hook เหล่านั้นใช้ร่วม (เช่น `rememberSentPreview`) |
  | `*.constants.ts` | ข้อความบนหน้าจอและค่าคงที่ |
  | `*.media.ts` | ฟังก์ชันที่เรียก API ของ browser ตรง (canvas, `<video>`) ใช้เฉพาะ `inbox.media.ts` |
- Test อยู่ข้างไฟล์ที่ทดสอบ: `*.spec.ts`

## 8. หน้าจอ (review ยกเว้นที่ระบุ)

- ไฟล์ใน `app/` ทำหน้าที่แค่ import component ของ feature
- Feature แบ่งตามพื้นที่ของหน้าจอ ไม่แบ่งตามชนิด component (ไม่ใช้ atomic design) เมื่อ feature มีหลายพื้นที่ที่แต่ละพื้นที่มีไฟล์ของตัวเองหลายไฟล์ ให้แยกเป็นโฟลเดอร์ย่อยหนึ่งชั้นต่อพื้นที่ เช่น `src/features/inbox/{list,thread,composer}/` ไฟล์ที่มากกว่าหนึ่งพื้นที่ใช้ (หน้าหลักของ feature, `*.api.ts`, `*.constants.ts`, `*.logic.ts` และ `*.hooks.ts` ที่ใช้ร่วม) อยู่ที่ระดับบนของ feature Feature ที่ไฟล์ส่วนใหญ่ใช้โครงร่วมกัน (เช่น `settings` ที่ทุกส่วนใช้ `SettingsSection` และ `settings.hooks.ts`) อยู่ชั้นเดียว และแยกพื้นที่ด้วยชื่อไฟล์ตามข้อ 7
- โฟลเดอร์ย่อยไม่มี `index.ts` และ import ไฟล์กันตรง ภายใน feature เดียวกันใช้ path แบบ relative หรือ `@/features/<feature>/...` ก็ได้
- Hook ที่ export อยู่ในไฟล์ `*.hooks.ts` (hook ที่ไม่ export และใช้ใน component เดียว เช่น `useDebounced` ใน `ContactList.tsx` อยู่ในไฟล์ของ component นั้นได้): hook ที่ใช้ในพื้นที่เดียวอยู่ใน `*.hooks.ts` ของพื้นที่นั้น (เช่น `composer/inbox.composer.hooks.ts`, `thread/inbox.thread.hooks.ts`) hook ที่มากกว่าหนึ่งพื้นที่ใช้อยู่ใน `<feature>.hooks.ts` ที่ระดับบนของ feature และ hook ที่มากกว่าหนึ่ง feature ใช้อยู่ใน `src/common/` (`common.hooks.ts` และ hook ของ polling ใน `polling.ts`) ตัวจำกัดความถี่, reducer และ state machine ที่ hook ใช้ไม่อยู่ในไฟล์ hook แต่อยู่ใน `*.logic.ts` หรือ `*.controller.ts` เพื่อให้ทดสอบได้โดยไม่มี React
- เฉพาะไฟล์ `*.api.ts` เรียก `fetch` ได้ (`src/features/**/*.api.ts` เช่น `inbox.api.ts` และ `src/common/common.api.ts` ที่มี `apiFetch`) component และไฟล์อื่นของหน้าจอเรียกผ่านไฟล์เหล่านั้น (lint)
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
- Stage ไฟล์ด้วย path (`git add <path>`) ไม่ใช้ `git add -A` หรือ `git add .` เมื่อมีมากกว่าหนึ่งคนหรือหนึ่ง agent ทำงานใน checkout เดียวกัน ก่อน commit ดู `git diff --cached --name-only` ว่ามีเฉพาะไฟล์ของงานนี้ และหลัง rebase ให้อ่านไฟล์ที่คนอื่นแก้ก่อน ไม่ commit ทับสภาพเก่า
- แม่แบบ PR อยู่ที่ [`.github/pull_request_template.md`](../../.github/pull_request_template.md): เปลี่ยนอะไรและทำไม, ทดสอบอย่างไรพร้อมผลของคำสั่งที่รันจริง, สิ่งที่ไม่ได้ตรวจ, ความเสี่ยงและวิธีย้อนกลับ และรายการติ๊ก (test ใหม่หรือที่แก้เคยแดงก่อนแก้, แก้เอกสารใน commit เดียวกัน, ผ่าน [pitfalls-and-prevention](pitfalls-and-prevention.md#รายการตรวจก่อนเปิด-pr-และก่อน-deploy)) ภาพหน้าจอแนบเมื่อแตะ UI

## รายการตรวจก่อนเปิด PR

- [ ] lint, typecheck, unit test ผ่าน และ E2E ผ่านเมื่อแตะเส้นทางของผู้ใช้
- [ ] กฎใหม่มี unit test และ adapter ใหม่ผ่านชุดทดสอบของ port
- [ ] งานหน้าจอถูกเปิดดูจริงที่ 390 และ 1280
- [ ] test ใหม่หรือที่แก้เคยแดงก่อนแก้
- [ ] เอกสารที่เกี่ยวข้องถูกแก้ใน commit เดียวกัน
- [ ] ไม่มี credential หรือข้อมูลลูกค้าจริงในโค้ด, test และ log
- [ ] ผ่านรายการตรวจใน [pitfalls-and-prevention](pitfalls-and-prevention.md#รายการตรวจก่อนเปิด-pr-และก่อน-deploy)
