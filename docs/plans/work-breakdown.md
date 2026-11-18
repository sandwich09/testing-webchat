# Work breakdown

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

ระบบทั้งหมดของ [แผนการสร้าง](implementation-plan.md) ขั้นที่ 1 ถึง 6 แตกเป็น 46 ticket ให้ developer หรือ coding agent หยิบไปหนึ่ง ticket แล้วสร้างได้เลยโดยไม่ต้องคุยเพิ่ม ผู้ทำหลายคนทำงานพร้อมกันใน repo checkout เดียว โดยมี lead ตรวจทุก ticket และเป็นผู้ commit

เอกสารนี้กำหนดเฉพาะการแบ่งงาน ลำดับ และการตรวจรับ พฤติกรรมและค่าทั้งหมดอยู่ในเอกสารที่แต่ละ ticket ลิงก์ไป ถ้าสองที่ขัดกัน เอกสารเจ้าของเรื่องใน [README](../README.md#กฎของเอกสาร) ชนะ

## 1. กติกาการทำงาน

### 1.1 Path ที่แต่ละ ticket เป็นเจ้าของ

1. แต่ละ ticket มีรายการ path (glob) ที่เขียนได้ในช่อง "เขียนได้" ticket สอง ticket ที่รันพร้อมกันได้ไม่มี path ซ้ำกัน
2. ผู้ทำห้ามแก้ไฟล์นอก path ของ ticket ตัวเอง ถ้าต้องแก้ ให้หยุดแล้วรายงาน lead
3. ไฟล์ร่วมมีเจ้าของคนเดียวตามตาราง 1.2 ticket อื่นอ่านได้แต่ห้ามแก้
4. **Stub แล้วส่งต่อ:** ticket ของ wave ก่อนอาจสร้างไฟล์เป็น stub ที่มีชื่อ export และลายเซ็นสุดท้าย (body เป็น `throw new Error("not implemented")` หรือ component ที่คืน `null`) เพื่อให้ ticket อื่น compile ได้ เมื่อ ticket นั้นจบ ความเป็นเจ้าของไฟล์ส่งต่อให้ ticket ที่ระบุ และผู้สร้าง stub ไม่แตะไฟล์นั้นอีก ลายเซ็นของ stub ห้ามเปลี่ยนโดยไม่ถาม lead
5. ไฟล์ test (`*.spec.ts`) อยู่ข้างไฟล์ที่ทดสอบ และเป็นของ ticket เดียวกับไฟล์นั้น

### 1.2 ไฟล์ร่วมและเจ้าของ

| ไฟล์ | เจ้าของ | หมายเหตุ |
| --- | --- | --- |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | T-0.1 | ติดตั้ง dependency ทุกตัวใน [project-setup](../architecture/project-setup.md#2-dependency) รวม `heic-to` และ package ที่ component แบบ shadcn ใน `src/common/ui/` ใช้ ครั้งเดียว หลังจากนั้นไม่มี ticket ใดแก้ |
| `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `next.config.ts`, `prettier.config.mjs`, `postcss.config.mjs`, `prisma.config.ts`, `components.json`, `vercel.json` | T-0.1 | |
| `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`, `.env.example` | T-0.1 แล้วส่งต่อให้ T-4.3 | |
| `.github/workflows/ci.yml` | T-4.3 | การแก้ต้องได้รับอนุญาตจากเจ้าของงานตาม `AGENTS.md` lead เป็นผู้ขอ |
| `prisma/schema.prisma`, `prisma/migrations/**` | T-0.6 | |
| `src/adapters/prisma/index.ts` | T-0.6 | export factory ของ repository ทุกตัวที่ T-0.6 สร้างเป็น stub |
| `src/core/domain/index.ts`, `constants.ts`, `error-codes.ts`, `pricing.constants.ts`, `*.model.ts` | T-0.2 | |
| `src/core/ports/**` | T-0.3 | |
| `src/core/use-cases/index.ts`, `src/core/use-cases/types.ts` | T-0.3 | |
| `src/adapters/fakes/index.ts` | T-0.3 | |
| `src/contracts/**` | T-0.4 | |
| `src/common/test-ids.ts` | T-0.5 | ทั้งแอปและ `e2e/` import จากไฟล์นี้ |
| `src/common/common.constants.ts`, `src/common/layout.constants.ts`, `src/common/error-messages.ts`, `src/features/*/*.constants.ts` | T-0.5 | ถ้อยคำตาม [ui-copy](../specs/ui-copy.md) และค่าตาม [project-setup](../architecture/project-setup.md#105-หน้าจอ) |
| `src/common/query-keys.ts`, `src/common/common.api.ts` | T-2.8 | |
| `src/composition/**`, `app/api/_lib/**`, `proxy.ts`, `instrumentation.ts` | T-4.1 | |

**ไฟล์ร่วมที่ ticket ของขอบเขตหัวข้อแก้:** T-2.9, T-2.10 และ T-5.6 แก้ไฟล์ของ ticket ที่จบแล้ว (เช่น `prisma/schema.prisma`, `src/core/domain/constants.ts`, `src/core/ports/**` บางไฟล์, `src/contracts/**` บางไฟล์, `src/common/test-ids.ts`, `src/common/error-messages.ts`, `src/features/settings/settings.constants.ts`, `stubs/**`, `src/common/query-keys.ts`, `src/common/common.api.ts`) ไฟล์ที่แต่ละตัวแก้ได้คือรายการตรงตัวในช่อง "เขียนได้" ของ ticket นั้นเท่านั้น ไม่ใช่ทั้ง glob ของเจ้าของเดิม และ ticket นั้นรันเพียงตัวเดียวที่แตะไฟล์เหล่านั้นในช่วงเวลาของมัน เมื่อจบ ความเป็นเจ้าของของไฟล์กลับไปที่เจ้าของในตารางข้างบน (`prisma/migrations/<timestamp>_topic_guard/**` เป็นของ T-2.9 และห้ามแก้ migration `init`)

### 1.3 สิ่งที่ห้ามทำ

- ติดตั้งหรืออัปเกรด dependency ที่ไม่อยู่ใน [project-setup](../architecture/project-setup.md#2-dependency) หรือเกินกว่าที่ T-0.1 ติดตั้งไว้
- เรียกบริการภายนอกจริง (LINE, Claude, Vercel Blob, Vercel, Neon) ทุก test ใช้ตัวปลอมหรือ stub
- Commit, push หรือเปิด PR lead เป็นผู้ commit
- ข้าม ปิด หรือลบ test เพื่อให้ผ่าน
- แก้เอกสารใน `docs/` ถ้าพบว่าเอกสารผิดหรือไม่พอ ให้รายงานตามข้อ 1.4
- เดาเมื่อ spec ไม่ได้บอก ให้หยุดแล้วถาม lead พร้อมเสนอทางเลือก

### 1.4 สิ่งที่ผู้ทำต้องรายงานเมื่อจบ ticket

1. ไฟล์ที่สร้างหรือแก้ทั้งหมด (path เต็ม)
2. คำสั่งตรวจที่รันจริงพร้อมผล (exit code และจำนวน test ที่ผ่าน) ตามช่อง "ตรวจ" ของ ticket
3. สิ่งที่ยังไม่ได้ทำ และเหตุผล
4. ความกำกวมหรือความขัดกันของ spec ที่พบ พร้อมตำแหน่งในเอกสาร และสิ่งที่ทำไปชั่วคราว (ถ้ามี)
5. รายการ "ต้องยืนยัน" ที่ยืนยันได้ระหว่างทำ (เช่น ชื่อ option ของเครื่องมือ) และผล
6. สำหรับ ticket หน้าจอ: path ของภาพหน้าจอที่ 390 และ 1280

### 1.5 ชุดคำสั่งตรวจ

ทุก ticket รันชุด **V0** เสมอ แล้วรันชุดอื่นตามที่ ticket ระบุ ทุกคำสั่งมาจาก script ใน [project-setup](../architecture/project-setup.md#5-packagejson)

| ชุด | คำสั่ง | ผลที่ต้องได้ |
| --- | --- | --- |
| V0 | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` | ทุกคำสั่ง exit 0 ไม่มี warning ของ lint |
| VC | `pnpm test:coverage` | ไฟล์ของ ticket มี coverage ไม่ต่ำกว่า 90% ทุกตัวชี้วัดในตารางของ coverage ก่อน wave 3 จบ เกณฑ์รวมอาจล้มเพราะไฟล์ stub ของ ticket อื่น ซึ่งยอมรับได้ และต้องผ่านเกณฑ์รวมใน T-7.1 |
| VA | `docker compose up -d --wait db stub` แล้ว `pnpm test:adapters` | exit 0 |
| VB | `pnpm build` | exit 0 |
| VE | `docker compose up -d --build --wait db stub app`, `docker compose run --rm seed` แล้ว `pnpm test:e2e` | exit 0 ทุก project (`desktop`, `mobile`, `serial-desktop`, `serial-mobile`) |
| VS | `docker compose up -d --build --wait` แล้ว `docker compose run --rm seed` เปิด `http://localhost:3000` ใน browser ที่ 390 และ 1280 | ภาพหน้าจอตามที่ ticket ระบุ |

ระหว่างทำ ticket รันเฉพาะไฟล์ด้วย `pnpm exec vitest run --project unit <path...>` หรือ `pnpm exec vitest run --project adapters <path...>` (`pnpm test -- <path>` และ `pnpm test:adapters -- <path>` ไม่กรองไฟล์และรันทั้งชุด) แต่ผลที่รายงานต้องเป็นของชุดเต็ม เมื่อมีผู้ทำหลายคนรันชุด `adapters` พร้อมกันบนเครื่องเดียว แต่ละคนตั้ง `ADAPTER_TEST_DATABASE_NAME` และ `ADAPTER_TEST_STUB_URL` ของตัวเองตาม [project-setup ข้อ 6.7](../architecture/project-setup.md#67-vitestconfigts) ticket ที่สร้าง migration ใช้คำสั่งที่ไม่ต้องมี TTY และลบคำสั่ง `DROP SEQUENCE "change_seq"` ที่ Prisma สร้างเกินมาตาม [project-setup ข้อ 5](../architecture/project-setup.md#5-packagejson) แถว `db:migrate`

## 2. ลำดับงาน

### 2.1 ตาราง wave

ticket ในแต่ละ wave รันพร้อมกันได้ เว้นแต่ช่อง "หลัง" บอกลำดับภายใน wave wave ถัดไปเริ่มได้เมื่อ ticket ที่มันพึ่งผ่าน review แล้ว ไม่ต้องรอทั้ง wave

| Wave | เป้าหมาย | Ticket ที่รันขนาน | หลัง |
| --- | --- | --- | --- |
| 0 | โครงและ interface ที่ทุก lane compile ด้วย | T-0.1 → (T-0.2 ‖ T-0.6) → (T-0.3 ‖ T-0.4 ‖ T-0.5) | T-0.1 ก่อน, T-0.3 T-0.4 T-0.5 หลัง T-0.2 |
| 1 | ฟังก์ชันล้วน ตัวปลอม stub และฐานของหน้าจอ | T-1.1, T-1.2, T-1.3, T-1.4, T-1.5, T-1.6, T-1.7, T-1.8, T-1.9 | |
| 2 | Adapter, ขั้นตอนร่วมของ use case และชั้นข้อมูลของหน้าเว็บ แล้วฐานของขอบเขตหัวข้อ | T-2.1, T-2.2, T-2.3, T-2.4, T-2.5, T-2.6, T-2.7, T-2.8 → T-2.9 → T-2.10 | T-2.9 หลังทุก ticket ตั้งแต่ T-2.1 ถึง T-2.8, T-2.10 หลัง T-2.9 |
| 3 | Use case ทุกตัว สคริปต์วัดคุณภาพ AI และงานเสริมความทนทาน | T-3.1, T-3.2, T-3.3, T-3.4, T-3.5, T-3.6, T-3.7, T-3.8 → T-3.9 | ทุกตัวหลัง T-2.9, T-3.8 หลัง T-2.10, T-3.9 หลัง T-3.1 ถึง T-3.7 |
| 4 | ประกอบระบบ, route และ seed | T-4.1 → T-4.2, และ T-4.3 ขนานกับทั้งสอง | T-4.1 หลัง T-2.10, T-4.2 หลัง T-4.1 |
| 5 | หน้าจอแต่ละส่วน | T-5.1, T-5.2, T-5.3, T-5.4, T-5.5, T-5.6 | |
| 6 | E2E ทั้ง 9 เส้น | T-6.1 → T-6.2 | T-6.2 หลัง T-6.1 |
| 7 | รวมระบบและเกณฑ์ "พร้อม" | T-7.1 | |

### 2.2 กราฟ

```
Wave 0   T-0.1 ──┬─> T-0.2 ──┬─> T-0.3 (ports, use-case & fake stubs)
                 │           ├─> T-0.4 (contracts)
                 │           └─> T-0.5 (test-ids, copy, error-messages)
                 └─> T-0.6 (prisma schema + migration)
                               │
Wave 1   T-1.1 T-1.2 (domain logic)      T-1.3 T-1.4 (fakes + port suites)
         T-1.5 (stub server)  T-1.6 (fixtures, e2e helpers)
         T-1.7 (UI foundation) T-1.8 (client logic) T-1.9 (welcome page)
                               │
Wave 2   T-2.1 (use-case shared steps)   T-2.2 T-2.3 (prisma repos)
         T-2.4 (LINE)  T-2.5 (Claude)  T-2.6 (file storage)  T-2.7 (system adapters)
         T-2.8 (client data layer: api, hooks, polling, optimistic send)
                               │  (หลังทุก ticket ของ wave 2)
         T-2.9 (guardrail foundations) ──> T-2.10 (TopicGuard adapter + stub)
                               │
Wave 3   T-3.1 .. T-3.7 (use cases)      T-3.8 (AI eval script)
         T-3.9 (hardening, หลัง T-3.1 .. T-3.7)
                               │
Wave 4   T-4.1 (composition, proxy) ──> T-4.2 (all API routes)
         T-4.3 (seed, compose bring-up, CI)
                               │
Wave 5   T-5.1 (contact list) T-5.2 (thread) T-5.3 (composer)
         T-5.4 (settings A)   T-5.5 (settings B)   T-5.6 (topic guard + Guardrails)
                               │
Wave 6   T-6.1 (E2E harness + journeys 1 2 7 8) ──> T-6.2 (journeys 3 4 5 6 9)
                               │
Wave 7   T-7.1 (integration, axe, README, exit criteria)
```

### 2.3 รายการ ticket

| ID | ชื่อ | Wave |
| --- | --- | --- |
| T-0.1 | Scaffold, tooling, lint boundaries, Docker files | 0 |
| T-0.2 | Domain types, error codes, constants, pricing, domain stubs | 0 |
| T-0.3 | Port interfaces, use-case types, use-case and fake stubs | 0 |
| T-0.4 | Contracts: zod schemas and DTOs | 0 |
| T-0.5 | UI constants: test ids, copy, error messages | 0 |
| T-0.6 | Prisma schema, first migration, Prisma client, repository stubs | 0 |
| T-1.1 | Domain logic: AI decisions and prompt | 1 |
| T-1.2 | Domain logic: messaging, media, money, time, rate limit, knowledge | 1 |
| T-1.3 | Fakes and port suites: external and system ports | 1 |
| T-1.4 | Fakes and port suites: repositories | 1 |
| T-1.5 | Stub server | 1 |
| T-1.6 | Test fixtures and E2E helpers | 1 |
| T-1.7 | UI foundation: theme, fonts, primitives, page skeletons | 1 |
| T-1.8 | Client pure logic | 1 |
| T-1.9 | Welcome page and access client | 1 |
| T-2.1 | Use-case shared steps | 2 |
| T-2.2 | Prisma repositories: Contact and Message | 2 |
| T-2.3 | Prisma repositories: other tables and KnowledgeSource | 2 |
| T-2.4 | LINE adapter | 2 |
| T-2.5 | Claude adapters | 2 |
| T-2.6 | FileStorage adapters: local disk and Vercel Blob | 2 |
| T-2.7 | System adapters | 2 |
| T-2.8 | Client data layer: API functions, hooks, polling, optimistic send | 2 |
| T-2.9 | Guardrail foundations | 2 |
| T-2.10 | TopicGuard Claude adapter and stub support | 2 |
| T-3.1 | Use cases: access, settings, LINE credentials, status, canned replies, usage | 3 |
| T-3.2 | Use cases: ReceiveLineEvents, StoreInboundMedia | 3 |
| T-3.3 | Use case: GenerateAiReply | 3 |
| T-3.4 | Use cases: admin send, retry, typing, contact AI switch, mark read | 3 |
| T-3.5 | Use cases: uploads and local storage | 3 |
| T-3.6 | Use cases: ListContacts, GetContact, GetMessages | 3 |
| T-3.7 | Use cases: knowledge base | 3 |
| T-3.8 | Manual AI eval script | 3 |
| T-3.9 | Hardening: inbound media, too_large, document retry, month range, round 2, guard test errors | 3 |
| T-4.1 | Composition, route wrapper, proxy gate, security headers | 4 |
| T-4.2 | API routes | 4 |
| T-4.3 | Seed data, compose bring-up, CI workflow | 4 |
| T-5.1 | Inbox UI: contact list and rail counts | 5 |
| T-5.2 | Inbox UI: thread, info panel, lightbox | 5 |
| T-5.3 | Inbox UI: composer, attachments (HEIC), canned picker, typing | 5 |
| T-5.4 | Settings UI: AI, LINE Official Account, system status | 5 |
| T-5.5 | Settings UI: knowledge base, canned replies, usage | 5 |
| T-5.6 | Settings UI: topic guard section and Guardrails panel | 5 |
| T-6.1 | E2E harness and journeys 1, 2, 7, 8 | 6 |
| T-6.2 | E2E journeys 3, 4, 5, 6, 9 | 6 |
| T-7.1 | Final integration, axe fixes, README, exit criteria | 7 |

## 3. Ticket

### T-0.1 Scaffold, tooling, lint boundaries, Docker files

| | |
| --- | --- |
| Wave | 0 (ตัวแรก) |
| พึ่ง | ไม่มี |
| เขียนได้ | ไฟล์ระดับบนทั้งหมดในหัวข้อ 3 และ 6 ของ project-setup ยกเว้น `proxy.ts`, `instrumentation.ts`; `Dockerfile`, `docker/**`, `docker-compose.yml`, `.env.example`, `public/robots.txt`, `test-support/**`, `src/common/ui/**`, `src/common/common.logic.ts` (stub มี `cn()` ส่งต่อให้ T-1.8), `app/layout.tsx` และ `app/page.tsx` (stub ส่งต่อให้ T-1.7), โฟลเดอร์ว่างของทุกชั้น |
| อ่านก่อน | [project-setup ข้อ 1 ถึง 7](../architecture/project-setup.md#1-runtime), [ข้อ 11](../architecture/project-setup.md#11-สิ่งที่ต้องยืนยันตอน-scaffold), [code-style](../guidelines/code-style.md), [ADR 0019](../adr/0019-heic-conversion-with-heic-to.md) |

ขั้นตอน:

1. สร้าง `package.json` ตาม [ข้อ 5](../architecture/project-setup.md#5-packagejson) และติดตั้ง dependency ทุกตัวในข้อ 2 แบบล็อกรุ่นตรงตัว รวม `heic-to@1.6.7`
2. เขียน component ทั้ง 11 ตัวตาม [ตาราง shadcn/ui](../architecture/project-setup.md#shadcnui) เองตามแบบของ shadcn (ไม่ใช้ CLI ของ shadcn) และ `sonner.tsx` ตามข้อกำหนด
3. สร้างไฟล์ config ทุกตัวในข้อ 6 รวมกฎ `eslint-plugin-boundaries`, `no-restricted-imports` (รวมกฎห้าม import `heic-to` แบบ static) และกฎเฉพาะทั้งหมด
4. สร้าง `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml` ตาม [ข้อ 7](../architecture/project-setup.md#7-docker) (service `stub` ใช้ `pnpm stubs` ซึ่งยังไม่มีไฟล์จนกว่า T-1.5 จบ) และ `.env.example`
5. สร้าง `test-support/server-only.ts` และ `test-support/adapters.global-setup.ts` (สร้างฐาน `webchat_test` แล้วรัน `prisma migrate deploy`)
6. สร้าง `app/layout.tsx` กับ `app/page.tsx` แบบ stub ให้ `pnpm build` ผ่าน
7. ยืนยันรายการใน [ข้อ 11](../architecture/project-setup.md#11-สิ่งที่ต้องยืนยันตอน-scaffold) ที่ทำได้ตอนนี้ (ชื่อ `proxy.ts`, `next typegen`, ESLint 10, boundaries, Vitest projects, Radix, `onlyBuiltDependencies`) แล้วรายงานผล

เกณฑ์รับ:

- [x] `package.json` ตรงกับข้อ 5 ทุก script และทุกรุ่นล็อกตรงตัว
- [x] ไฟล์ทดลองใน `src/core/domain/` ที่ import `zod` หรือ `next` ทำให้ `pnpm lint` ล้ม (ลบไฟล์ทดลองก่อนส่ง)
- [x] ไฟล์ทดลองที่ import `heic-to` แบบ static ทำให้ `pnpm lint` ล้ม (ลบก่อนส่ง)
- [x] `docker compose up -d --wait db` ผ่าน
- [x] ไม่มี `next-themes` ใน dependency

ตรวจ: V0, VB และ `docker compose config` exit 0

### T-0.2 Domain types, error codes, constants, pricing, domain stubs

| | |
| --- | --- |
| Wave | 0 (หลัง T-0.1) |
| พึ่ง | T-0.1 |
| เขียนได้ | `src/core/domain/**` |
| อ่านก่อน | [domain-and-ports: Result, Id, Enum, Entity](../architecture/domain-and-ports.md#result-และ-error), [ค่าคงที่](../architecture/domain-and-ports.md#ค่าคงที่), [project-setup ข้อ 10](../architecture/project-setup.md#10-ค่าคงที่ของระบบ), [error-catalog](../architecture/error-catalog.md), [usage-cost](../specs/usage-cost.md#การคำนวณราคา) |

ขั้นตอน:

1. `result.ts`, `ids.ts`, `error-codes.ts` (`ERROR_CODES` ครบตาม error-catalog ไม่รวม `client.network`)
2. `enums.model.ts` และ entity เป็น `<entity>.model.ts` ทุกตัว รวม `ChatRole`, `ChatTurn`, `ChatOutput` (อยู่ใน domain เพราะ `toHistoryTurns` คืนค่าเหล่านี้ และ port re-export) และ `LineEvent`, `OutboundLinePart`, `SniffedType`, `PriceTable`
3. `constants.ts`: ทุกชื่อในข้อ 10.1 และ 10.2 ของ project-setup ด้วยค่าจากตารางนั้น และ `RATE_LIMIT_RULES`
4. `pricing.constants.ts`: ตารางราคาตาม usage-cost หน่วย nano-USD ต่อ token พร้อม `asOf`
5. Stub ของไฟล์ฟังก์ชันล้วน (ส่งต่อตามตาราง) ที่มีลายเซ็นตาม domain-and-ports: `ai-decision.logic.ts`, `ai-prompt.logic.ts`, `ai-history.logic.ts`, `ai-reply.logic.ts` → T-1.1; `line-send.logic.ts`, `media.logic.ts`, `money.logic.ts`, `time.logic.ts`, `rate-limit.logic.ts`, `knowledge.logic.ts` → T-1.2
6. `index.ts` export ทุกไฟล์

เกณฑ์รับ:

- [x] test ตรวจว่า `ERROR_CODES` มีรหัสเท่ากับตารางใน error-catalog (รายการเขียนใน test)
- [x] test ตรวจว่าทุกราคาใน `pricing.constants.ts` เป็นจำนวนเต็ม `bigint`
- [x] ชุดค่าของ `HandoffReason`, `MediaStatus`, `OtherKind`, `ModelHandoffReason`, `EventCode` ตรงกับ domain-and-ports ทุกตัว

ตรวจ: V0

### T-0.3 Port interfaces, use-case types, use-case and fake stubs

| | |
| --- | --- |
| Wave | 0 (หลัง T-0.2) |
| พึ่ง | T-0.2 |
| เขียนได้ | `src/core/ports/**`, `src/core/use-cases/index.ts`, `src/core/use-cases/types.ts`, stub ของ `src/core/use-cases/**/*.use-case.ts` และ `src/core/use-cases/shared/*.ts`, `src/adapters/fakes/index.ts`, stub ของ `src/adapters/fakes/**` |
| อ่านก่อน | [domain-and-ports: Port](../architecture/domain-and-ports.md#port), [use-cases: การประกอบ](../architecture/use-cases.md#การประกอบ), [backend: Use case](../architecture/backend.md#use-case) |

ขั้นตอน:

1. หนึ่งไฟล์ `<name>.port.ts` ต่อ port ทั้ง 19 ตัว ลายเซ็นตรงตัว และ `index.ts`
2. `use-cases/types.ts`: `RequestContext`, `UseCase`, `UseCaseConfig` และ `AllPorts`
3. Stub ของ factory `makeXxx` ทุก use case ในรายชื่อของ backend (ส่งต่อให้ ticket ของ wave 3 ตามข้อ 3) และ stub ของ `shared/` (ส่งต่อให้ T-2.1)
4. Stub ของ fake ทุกตัว `fake-<port>.ts` และ `suites/<port>.suite.ts` (ส่งต่อให้ T-1.3 และ T-1.4) และ `fakes/index.ts`

เกณฑ์รับ:

- [x] ทุก method และ union ของรหัส error ตรงกับ domain-and-ports
- [x] `use-cases/index.ts` export factory ครบ 32 ตัวตามรายชื่อใน backend

ตรวจ: V0

### T-0.4 Contracts: zod schemas and DTOs

| | |
| --- | --- |
| Wave | 0 (หลัง T-0.2) |
| พึ่ง | T-0.2 |
| เขียนได้ | `src/contracts/**` |
| อ่านก่อน | [api-contract](../architecture/api-contract.md) ทั้งไฟล์, [project-setup ข้อ 6.3 กฎของ contracts](../architecture/project-setup.md#63-eslintconfigmjs) |

ขั้นตอน:

1. `dto.contract.ts`: zod schema และ type ของทุก DTO ใน [DTO ร่วม](../architecture/api-contract.md#dto-ร่วม) ชื่อ field ตรงตัว
2. หนึ่งไฟล์ต่อ resource (`access`, `contacts`, `messages`, `uploads`, `local-storage`, `settings`, `knowledge`, `canned-replies`, `usage`, `system`, `webhook`, `error`) มี schema ของ path, query, body และ response ทุก endpoint แบบ `strict`
3. `limits.contract.ts` re-export constant ที่หน้าเว็บใช้ (เพดานไฟล์, เพดานความยาว, `AI_DAILY_BUDGET_MAX_USD`) จาก domain
4. `index.ts` export ทั้งหมด

เกณฑ์รับ:

- [x] ทุก endpoint ใน [ตารางไล่ endpoint](../architecture/api-contract.md#ตารางไล่-endpoint-กับ-use-case) มี schema ของ request และ response
- [x] unit test ของ schema: ตัวอย่างที่ถูกผ่าน, field เกินไม่ผ่าน, `afterUpdatedSeq` คู่กับ `filter` ไม่ผ่าน, `aiDailyBudgetUsd` เกินเพดานไม่ผ่าน

ตรวจ: V0

### T-0.5 UI constants: test ids, copy, error messages

| | |
| --- | --- |
| Wave | 0 (หลัง T-0.2) |
| พึ่ง | T-0.2 |
| เขียนได้ | `src/common/test-ids.ts`, `src/common/common.constants.ts`, `src/common/layout.constants.ts`, `src/common/error-messages.ts`, `src/features/access/access.constants.ts`, `src/features/inbox/inbox.constants.ts`, `src/features/settings/settings.constants.ts` |
| อ่านก่อน | [ui-copy](../specs/ui-copy.md), [ui-screens ข้อ 11](../specs/ui-screens.md#11-ระบบชื่อ-data-testid) และหัวข้อ `data-testid` ทุกหัวข้อ, [error-catalog](../architecture/error-catalog.md), [project-setup ข้อ 10.5](../architecture/project-setup.md#105-หน้าจอ) |

ขั้นตอน:

1. `test-ids.ts`: object เดียวที่มี testid ทุกตัวในทุกหัวข้อ `data-testid` ของ ui-screens
2. ไฟล์ `*.constants.ts` export `copy` ตาม key ของ ui-copy และ constant ของหน้าจอในข้อ 10.5 ตามไฟล์ที่ระบุ
3. `error-messages.ts`: `errorMessage(code, ctx)` ทุกรหัสใน error-catalog รวม `client.network`, `handoffReasonText(reason)` และ `eventCodeText(code)` ตามสองตารางท้าย error-catalog

เกณฑ์รับ:

- [x] test ตรวจว่าทุกค่าใน `ERROR_CODES` มีข้อความ
- [x] test ตรวจว่าทุกค่าของ `HandoffReason` และ `EventCode` ที่รู้จักมีข้อความ และค่าไม่รู้จักได้ค่าสำรองตาม error-catalog
- [x] ไม่มีข้อความไทยที่ไม่อยู่ใน ui-copy หรือ error-catalog

ตรวจ: V0

### T-0.6 Prisma schema, first migration, Prisma client, repository stubs

| | |
| --- | --- |
| Wave | 0 (ขนานกับ T-0.2) |
| พึ่ง | T-0.1 |
| เขียนได้ | `prisma/schema.prisma`, `prisma/migrations/**`, `src/adapters/prisma/prisma-client.ts`, `src/adapters/prisma/index.ts`, stub ของ `src/adapters/prisma/*.repository.ts` และ `knowledge-source.adapter.ts` |
| อ่านก่อน | [data-model](../architecture/data-model.md) ทั้งไฟล์, [project-setup ข้อ 6.9](../architecture/project-setup.md#69-prismaconfigts) |

ขั้นตอน:

1. คัดลอก schema จาก [Prisma schema](../architecture/data-model.md#prisma-schema) แล้วยืนยันสี่ข้อของ Prisma 7.10.1 ที่ data-model ระบุ
2. `pnpm db:migrate -- --create-only --name init` แล้วเพิ่ม SQL ใน [Migration](../architecture/data-model.md#migration): `CREATE SEQUENCE change_seq` บนสุด, CHECK ของ Settings, function และ trigger ของ `updatedSeq`
3. Apply แล้วตรวจด้วย SQL ว่า INSERT ของ Message ได้ `updatedSeq = seq` และ UPDATE ของ Contact ได้ค่าใหม่จาก `change_seq`
4. `prisma-client.ts` และ stub ของ repository ทุกตัวพร้อม `index.ts` (ส่งต่อให้ T-2.2 และ T-2.3)

เกณฑ์รับ:

- [x] `pnpm db:deploy` บนฐานว่างผ่าน และ `pnpm db:generate` ผ่าน
- [x] Contact ไม่มีคอลัมน์ของการหยุดแบบมีเวลา และเงินทุกคอลัมน์เป็น `Decimal(18, 9)`

ตรวจ: V0 และ `docker compose up -d --wait db` แล้ว `pnpm db:deploy` exit 0

### T-1.1 Domain logic: AI decisions and prompt

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.2 |
| เขียนได้ | `src/core/domain/ai-decision.logic.ts`, `ai-prompt.logic.ts`, `ai-history.logic.ts`, `ai-reply.logic.ts` และ `.spec.ts` ของแต่ละไฟล์ |
| อ่านก่อน | [domain-and-ports: AI](../architecture/domain-and-ports.md#ai), [ai-prompt ข้อ 2 ถึง 6](../specs/ai-prompt.md#2-คำสั่งระบบ), [ai-reply](../specs/ai-reply.md) |

ขั้นตอน: เขียนทุกฟังก์ชันในหัวข้อ AI ของ domain-and-ports (`shouldAiReply`, `handoffReasonForType`, `handoffReasonFromModel`, `handoffText`, `buildSystemInstructions`, `formatKnowledgeBase`, `toHistoryTurns`, `sanitizeAiReply`, `formatPromptNow`, `isAiStateStuck`, `usageOutcomeOf`) พร้อม test ทุกแถวของคอลัมน์กฎ

เกณฑ์รับ:

- [x] `handoffText("ค่ะ")` คืน "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ" และ `handoffText("ครับ")` คืน "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะครับ"
- [x] `buildSystemInstructions` คืนผลเดิมทุกไบต์เมื่อ input เดิม และไม่มีเวลาหรือ id
- [x] `toHistoryTurns` ตัดข้อความขาออกที่ `pending` หรือ `failed` และตัวอย่างในข้อ 4.3 ของ ai-prompt ได้ผลตรงกัน
- [x] `sanitizeAiReply` ทำครบหกขั้นของ ai-prompt ข้อ 6
- [x] `formatPromptNow` ใช้เขต `Asia/Bangkok` และปีพุทธศักราช ทดสอบขณะ `TZ=UTC`

ตรวจ: V0, VC

### T-1.2 Domain logic: messaging, media, money, time, rate limit, knowledge

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.2 |
| เขียนได้ | `src/core/domain/line-send.logic.ts`, `media.logic.ts`, `money.logic.ts`, `time.logic.ts`, `rate-limit.logic.ts`, `knowledge.logic.ts` และ `.spec.ts` |
| อ่านก่อน | [domain-and-ports: การส่งทาง LINE ถึงคลังความรู้](../architecture/domain-and-ports.md#การส่งทาง-line), [usage-cost](../specs/usage-cost.md#การคำนวณราคา) |

ขั้นตอน: เขียนทุกฟังก์ชันในหัวข้อ การส่งทาง LINE, สื่อและไฟล์, เงินและเวลา, การจำกัดความถี่ และคลังความรู้ พร้อม test ทุกแถวของคอลัมน์กฎ

เกณฑ์รับ:

- [x] `splitLineText` ไม่ตัดกลางกลุ่มตัวอักษรไทย และไม่คืนก้อนว่าง
- [x] `computeCost` ของโมเดลที่ไม่อยู่ในตารางใช้ราคาสูงสุดของแต่ละประเภทและคืน `priceKnown: false`
- [x] `bangkokDayRange` ข้ามเที่ยงคืนตามเวลาไทยถูกต้องขณะ `TZ=UTC`
- [x] `effectiveLimit("unlock", 10)` เท่ากับค่าเดิม และ action อื่นคูณ 10
- [x] `isAtLimit` และ `isRateLimited` ทดสอบค่าขอบทั้งสองด้าน

ตรวจ: V0, VC

### T-1.3 Fakes and port suites: external and system ports

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.3 |
| เขียนได้ | `src/adapters/fakes/fake-{messaging-gateway,chat-model,document-extractor,knowledge-source,file-storage,secret-cipher,access-token-signer,content-hasher,clock,id-generator,logger}.ts`, `src/adapters/fakes/suites/` ของ port เดียวกัน และ `.spec.ts` |
| อ่านก่อน | [domain-and-ports: Port](../architecture/domain-and-ports.md#port), [test-strategy: กฎ](../qa/test-strategy.md#กฎ) |

ขั้นตอน:

1. ตัวปลอมแต่ละตัวทำตามทุกแถวของตารางความหมาย มี method สำหรับ test ตั้งผลล่วงหน้าและอ่านคำขอที่ได้รับ (เช่น `FakeChatModel.enqueue()`, `.requests`)
2. ชุดทดสอบของ port เป็นฟังก์ชัน `describe<Port>Suite(makeSubject)` ที่ตรวจทุกแถวของตารางความหมาย
3. รันชุดทดสอบกับตัวปลอมใน `fake-<port>.spec.ts`

เกณฑ์รับ:

- [x] `FakeClock.sleep` เลื่อนเวลาทันทีโดยไม่รอจริง
- [x] `FakeMessagingGateway.push` จำ retry key และคืน `alreadyAccepted: true` เมื่อซ้ำ
- [x] `FakeChatModel` เก็บ `now` ของคำขอ
- [x] ชุดทดสอบทุกชุดผ่านกับตัวปลอม

ตรวจ: V0

### T-1.4 Fakes and port suites: repositories

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.3 |
| เขียนได้ | `src/adapters/fakes/fake-{contact,message,settings,knowledge,usage,canned-reply,webhook-event,rate-limit}-repository.ts`, `src/adapters/fakes/suites/` ของ repository เดียวกัน และ `.spec.ts` |
| อ่านก่อน | [domain-and-ports: Repository](../architecture/domain-and-ports.md#repository), [data-model: กฎของ repository](../architecture/data-model.md#กฎของ-repository) |

ขั้นตอน:

1. ตัวปลอมในหน่วยความจำมี sequence เดียวร่วมกันระหว่าง Contact และ Message (`seq`, `updatedSeq`) เหมือน `change_seq`
2. ชุดทดสอบตรวจทุกแถวของตารางความหมาย รวมการเรียกพร้อมกันด้วย `Promise.all`
3. รันชุดทดสอบกับตัวปลอม

เกณฑ์รับ:

- [x] `ensure`, `insert*IfAbsent`, `tryAcquireAiLock`, `consumeReplyToken`, `markPendingIfFailed` ให้ผู้ชนะคนเดียวเมื่อเรียกพร้อมกัน
- [x] `listChangedAfter` คืนข้อความที่สถานะเปลี่ยนแม้ `seq` ต่ำกว่า cursor
- [x] `recoverStuckAiStates` คืน id ของแถวที่คืนสภาพและตั้งเหตุผล `ai_timeout`
- [x] `RateLimitRepository.peek` ไม่เพิ่ม count

ตรวจ: V0

### T-1.5 Stub server

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.1 |
| เขียนได้ | `stubs/server.ts`, `stubs/lib/**` |
| อ่านก่อน | [stubs-and-fixtures ข้อ 1 ถึง 6](../qa/stubs-and-fixtures.md#1-กฎ) |

ขั้นตอน: เขียน stub ด้วย module ในตัวของ Node 24 เท่านั้น ทุก route ในข้อ 4 ถึง 6 รวม `GET /__control/health`, การบันทึกคำขอ และลำดับการเลือกของ `match`

เกณฑ์รับ:

- [x] `pnpm stubs` แล้ว `curl http://localhost:4010/__control/health` ได้ `{"ok":true}`
- [x] ไม่มี `import` จาก package นอก `node:*`
- [x] คำขอที่ไม่ตรง route ได้ 404 และถูกบันทึกด้วย `endpoint: "unknown"`

ตรวจ: V0 และ `docker compose up -d --build --wait stub` exit 0

### T-1.6 Test fixtures and E2E helpers

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.1, T-0.5 |
| เขียนได้ | `e2e/fixtures/**`, `e2e/helpers/**`, `scripts/generate-fixtures.sh`, `stubs/assets/**` |
| อ่านก่อน | [stubs-and-fixtures ข้อ 2, 7, 8](../qa/stubs-and-fixtures.md#7-fixture-ของ-webhook), [ai-prompt ข้อ 8.2](../specs/ai-prompt.md#82-เนื้อหาของ-pdf-ตัวอย่าง) |

ขั้นตอน:

1. Fixture ของ webhook ทุกไฟล์ในข้อ 7.2 และ `e2e/fixtures/line/credentials.ts`
2. `scripts/generate-fixtures.sh` และไฟล์สื่อกับ PDF ในข้อ 8 รวม `tonhom-cafe.pdf` (ถ้าเครื่องไม่มี `ffmpeg`, ImageMagick หรือ libheif ให้รายงานไฟล์ที่สร้างไม่ได้)
3. Helper ทุกตัวในข้อ 7.4 (`line-webhook.ts`, `stub.ts`, `auth.ts`, `contact.ts`, `wait.ts`, `axe.ts`, `test-ids.ts`)

เกณฑ์รับ:

- [x] `renderFixture` ของทุกไฟล์ได้ JSON ที่ถูกต้อง (unit test)
- [x] `signLineBody` ตรงกับตัวอย่าง HMAC ที่คำนวณด้วย `node:crypto` ใน test

ตรวจ: V0

### T-1.7 UI foundation: theme, fonts, primitives, page skeletons

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.1, T-0.5 |
| เขียนได้ | `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/(app)/**`, `src/common/fonts/**`, `src/common/ui/**`, `src/common/AppRail.tsx`, `ConnectionBanner.tsx`, `ContactAvatar.tsx`, `SectionErrorBoundary.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `ConfirmDialog.tsx`, stub ของ `src/common/AppProviders.tsx` และ `src/common/AppShell.tsx` (ส่งต่อให้ T-2.8), `src/features/inbox/InboxPage.tsx`, `src/features/inbox/index.ts`, `src/features/settings/SettingsPage.tsx`, `SettingsSection.tsx`, `SettingsRow.tsx`, `src/features/settings/index.ts`, stub ของ component ของส่วนต่าง ๆ (ส่งต่อตามข้อ 3 ของ T-5.x) |
| อ่านก่อน | [frontend: Design system](../architecture/frontend.md#design-system), [ui-screens ข้อ 1, 3, 9.1, 9.2](../specs/ui-screens.md#1-ฐานร่วม), [project-setup ข้อ 6.5, 6.6](../architecture/project-setup.md#65-postcss-และ-tailwind-4) |

ขั้นตอน:

1. Token สีใน `app/globals.css` และ map ตัวแปรของ shadcn, ฟอนต์ตามข้อ 6.6
2. Component ร่วมในข้อ 1.7 ของ ui-screens ที่ไม่ต้องใช้ข้อมูลจาก server (รับ props)
3. `InboxPage.tsx` จัดคอลัมน์ตามข้อ 1.4 และอ่าน `contactId` จาก URL โดย import `ContactList`, `Thread`, `InfoPanel` ซึ่งสร้างเป็น stub, `SettingsPage.tsx` เรียงส่วนตามข้อ 9 โดย import ส่วนต่าง ๆ ซึ่งสร้างเป็น stub
4. Page ใน `app/` ทำหน้าที่ import component ของ feature เท่านั้น

เกณฑ์รับ:

- [x] ไล่สีของแบรนด์อยู่เฉพาะสี่ที่ที่ [frontend](../architecture/frontend.md#สี) อนุญาต
- [x] ไม่มีน้ำหนักฟอนต์อื่นนอกจาก 100, 400, 700
- [x] `AppRail` ทั้งแบบกาง พับ และแถบบนเมื่อจอแคบ ตรงกับข้อ 3.2 และ 3.3

ตรวจ: V0, VB และ `pnpm dev` เปิด `/chats` และ `/settings` (โครงว่าง) ถ่ายภาพที่ 390 และ 1280

### T-1.8 Client pure logic

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.4, T-0.5 |
| เขียนได้ | `src/common/common.logic.ts`, `src/features/inbox/inbox.logic.ts`, `src/features/settings/settings.logic.ts` และ `.spec.ts` |
| อ่านก่อน | [ui-screens ข้อ 8.1, 8.2, 8.5](../specs/ui-screens.md#8-ฟังก์ชันล้วนฝั่งหน้าจอ), [api-contract: protocol ของ polling](../architecture/api-contract.md#protocol-ของ-polling), [ux-writing: ตัวเลขและเวลา](../guidelines/ux-writing.md#ตัวเลขและเวลา) |

ขั้นตอน: เขียนทุกฟังก์ชันในข้อ 8.1, 8.2 และ 8.5 ของ ui-screens พร้อม test (คง `cn()` ที่ T-0.1 สร้างไว้)

เกณฑ์รับ:

- [x] `pollAfter("15")` คืน `"0"` และ `pollAfter` ของค่ามากใช้ `bigint` ไม่ผ่าน number
- [x] `mergeById` เก็บตัวที่ `updatedSeq` สูงกว่า และแถว `updatedSeq: null` แพ้แถวจาก server
- [x] `groupMessagesForDisplay` วางบรรทัดเหตุการณ์ตามตำแหน่งของ `seq` และตัดกลุ่ม
- [x] `validateAttachment` ของ HEIC และ WebP ได้ `needsConversion: true`, MOV ได้ `mov_not_supported`
- [x] รูปแบบเวลาทดสอบขณะ `TZ=UTC` ครบทุกกรณีของ `formatListTime`

ตรวจ: V0

### T-1.9 Welcome page and access client

| | |
| --- | --- |
| Wave | 1 |
| พึ่ง | T-0.4, T-0.5 |
| เขียนได้ | `app/welcome/page.tsx`, `src/features/access/**` ยกเว้น `access.constants.ts` |
| อ่านก่อน | [access-gate](../specs/access-gate.md), [ui-screens ข้อ 2](../specs/ui-screens.md#2-หน้ายินดีต้อนรับ), [ui-screens ข้อ 8.4](../specs/ui-screens.md#84-srcfeaturesaccessaccesslogicts) |

ขั้นตอน: `access.api.ts` (`unlock`, `lock` ผ่าน `fetch` ตรงในไฟล์ `*.api.ts` จนกว่า T-2.8 จะมี `apiFetch` แล้ว lead ให้เปลี่ยนใน T-7.1), `access.logic.ts`, `WelcomePage.tsx`, `AccessForm.tsx` ตามข้อ 2

เกณฑ์รับ:

- [x] ช่องว่างแล้วกดเข้าระบบ ไม่มีคำขอไป server และแสดง `access.error.empty`
- [x] Sheen ไม่เล่นเมื่อ `prefers-reduced-motion: reduce`
- [x] testid ครบตามข้อ 2.6

ตรวจ: V0, VB และ `pnpm dev` เปิด `/welcome` ถ่ายภาพที่ 390 และ 1280

### T-2.1 Use-case shared steps

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-0.3, T-1.2, T-1.3, T-1.4 |
| เขียนได้ | `src/core/use-cases/shared/**` |
| อ่านก่อน | [use-cases: ขั้นตอนร่วม](../architecture/use-cases.md#ขั้นตอนร่วม), [line-messaging: ส่งข้อความ](../specs/line-messaging.md#ส่งข้อความ), [ADR 0010](../adr/0010-reply-token-first-and-idempotency.md) |

ขั้นตอน: `loadLineAccess`, `deliverOutbound`, `raiseHandoff`, `hitRateLimit`, `checkRateLimit` พร้อม test ด้วยตัวปลอม

เกณฑ์รับ:

- [x] reply ได้ `line.reply_token_invalid` แล้ว push ด้วย retry key เท่ากับ id ของข้อความ
- [x] reply ได้ `line.unavailable` แล้ว `failed` และไม่มีการเรียก push
- [x] `mode = push_only` ไม่ใช้ reply token แม้ยังใช้ได้
- [x] `raiseHandoff` ซ้ำด้วยเหตุผลเดิมไม่เพิ่มบรรทัดเหตุการณ์
- [x] key ที่ส่งให้ `RateLimitRepository` ไม่มี IP ดิบ และ `RATE_LIMIT_SCALE` ถูกใช้ผ่าน `effectiveLimit`

ตรวจ: V0

### T-2.2 Prisma repositories: Contact and Message

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-0.6, T-1.4 |
| เขียนได้ | `src/adapters/prisma/contact.repository.ts`, `contact.mapper.ts`, `message.repository.ts`, `message.mapper.ts` และ `.spec.ts` |
| อ่านก่อน | [data-model: กฎของ repository](../architecture/data-model.md#กฎของ-repository), [domain-and-ports: ContactRepository](../architecture/domain-and-ports.md#contactrepository), [MessageRepository](../architecture/domain-and-ports.md#messagerepository) |

ขั้นตอน: เขียนทุก method ตามข้อ 1 ถึง 10 ของกฎของ repository แล้วรันชุดทดสอบของ port จาก T-1.4 กับ Postgres จริง

เกณฑ์รับ:

- [x] ชุดทดสอบของ `ContactRepository` และ `MessageRepository` ผ่านกับ Postgres
- [x] สองคำขอพร้อมกันของ `tryAcquireAiLock` และ `consumeReplyToken` ได้ผู้ชนะคนเดียวบน Postgres
- [x] `recoverStuckAiStates` เป็น SQL คำสั่งเดียว
- [x] ไม่มี type ของ Prisma ออกนอก adapter

ตรวจ: V0, VA

### T-2.3 Prisma repositories: other tables and KnowledgeSource

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-0.6, T-1.1, T-1.4 |
| เขียนได้ | `src/adapters/prisma/{settings,knowledge,usage,canned-reply,webhook-event,rate-limit}.repository.ts`, mapper ของแต่ละตัว, `knowledge-source.adapter.ts` และ `.spec.ts` |
| อ่านก่อน | [data-model: กฎของ repository](../architecture/data-model.md#กฎของ-repository) ข้อ 5, 7, 11, 12, [domain-and-ports: Repository](../architecture/domain-and-ports.md#repository), [KnowledgeSource](../architecture/domain-and-ports.md#knowledgesource) |

ขั้นตอน: เขียนทุก method, `hit` และ `peek` ด้วย SQL ในข้อ 11, `KnowledgeSource` ที่ query ตาราง KbDocument ตรงแล้วใช้ `formatKnowledgeBase`

เกณฑ์รับ:

- [x] ชุดทดสอบของทุก repository ผ่านกับ Postgres
- [x] เงินแปลงระหว่าง `Decimal(18, 9)` กับ `NanoUsd` โดยไม่ผ่าน float
- [x] `SettingsRepository.get()` บนฐานว่างได้ค่าเริ่มต้นตาม [project-setup](../architecture/project-setup.md#101-แกนกลาง)
- [x] `reportByContact` คืน `pictureUrl`

ตรวจ: V0, VA

### T-2.4 LINE adapter

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-1.3, T-1.5, T-1.6 |
| เขียนได้ | `src/adapters/line/**` |
| อ่านก่อน | [domain-and-ports: MessagingGateway](../architecture/domain-and-ports.md#messaginggateway), [api-contract: webhook](../architecture/api-contract.md#post-apilinewebhook), [line-messaging](../specs/line-messaging.md), [stubs-and-fixtures ข้อ 4](../qa/stubs-and-fixtures.md#4-route-ของ-line) |

ขั้นตอน: เขียน adapter ด้วย `fetch` ตรง ตาม timeout และ retry ใน [project-setup ข้อ 10.4](../architecture/project-setup.md#104-adapter-และ-route) แล้วรันชุดทดสอบของ port กับ stub

เกณฑ์รับ:

- [x] ทุก push มี `X-Line-Retry-Key` รวมทุก retry และ 409 ของ stub ได้ `alreadyAccepted: true`
- [x] `getProfile` ไม่ retry และใช้ `LINE_PROFILE_TIMEOUT_MS`
- [x] `downloadContent` ของ `bigimg` ได้ `media.too_large` โดยไม่อ่านเกินเพดาน
- [x] `parseEvents` ของ `batch-with-malformed.json` ได้สาม event โดยตัวที่สองเป็น `unsupported`

ตรวจ: V0, VA

### T-2.5 Claude adapters

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-1.1, T-1.3, T-1.5 |
| เขียนได้ | `src/adapters/claude/**` |
| อ่านก่อน | [domain-and-ports: Adapter ของ Claude](../architecture/domain-and-ports.md#adapter-ของ-claude), [ai-prompt ข้อ 3, 5, 7](../specs/ai-prompt.md#3-โครงของ-request), [stubs-and-fixtures ข้อ 5](../qa/stubs-and-fixtures.md#5-route-ของ-claude) |

ขั้นตอน: `claude-chat-model.adapter.ts` และ `claude-document-extractor.adapter.ts` ตามตารางคำขอและการอ่านผล ค่า timeout และ retry จาก `claude.constants.ts` ยืนยันรายการ "ต้องยืนยันกับเอกสาร SDK" กับ SDK ที่ติดตั้งแล้วรายงาน

เกณฑ์รับ:

- [x] คำขอที่ stub ได้รับมี `max_tokens` เท่ากับ `AI_MAX_TOKENS`, `output_config.effort` เป็น `low`, ไม่มี `temperature` และ `messages` ตัวสุดท้ายเป็นข้อความเวลาจาก `formatPromptNow`
- [x] การแปลง PDF ใช้ stream แล้ว `finalMessage()` ด้วย `AI_EXTRACT_MAX_TOKENS`
- [x] content block `thinking` ถูกข้าม และ `refusal`, `max_tokens` แปลงตามตาราง
- [x] ไม่ส่ง `betas` และ `fallbacks` เมื่อโมเดลเป็น Haiku

ตรวจ: V0, VA

### T-2.6 FileStorage adapters: local disk and Vercel Blob

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-1.3 |
| เขียนได้ | `src/adapters/local-storage/**`, `src/adapters/blob/**` |
| อ่านก่อน | [domain-and-ports: FileStorage](../architecture/domain-and-ports.md#filestorage), [api-contract: การอัปโหลดตาม strategy](../architecture/api-contract.md#การอัปโหลดตาม-strategy) |

ขั้นตอน: adapter ดิสก์ในเครื่อง (ลายเซ็น HMAC ด้วย `node:crypto` ภายใน adapter เอง) และ adapter ของ Vercel Blob แล้วรันชุดทดสอบของ port กับ adapter ดิสก์ในเครื่อง

เกณฑ์รับ:

- [x] ชุดทดสอบของ `FileStorage` ผ่านกับ adapter ดิสก์ในเครื่อง
- [x] `acceptSignedPut` ตรวจลายเซ็นแบบ timing-safe และลบไฟล์ที่เกินขนาด
- [x] adapter ของ Blob มี test ที่ mock เฉพาะขอบของ SDK และรายงานว่าไม่ได้ตรวจกับ Blob จริง

ตรวจ: V0

### T-2.7 System adapters

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-1.3 |
| เขียนได้ | `src/adapters/system/**` |
| อ่านก่อน | [domain-and-ports: SecretCipher ถึง Logger](../architecture/domain-and-ports.md#secretcipher), [ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md) |

ขั้นตอน: `system-clock`, `uuid-v7-id-generator`, `json-logger`, `aes-gcm-cipher`, `hmac-access-token-signer`, `sha256-content-hasher` แล้วรันชุดทดสอบของ port จาก T-1.3 ในชุด `unit`

เกณฑ์รับ:

- [x] logger ทิ้ง key ที่ไม่อยู่ใน `LogFields` แม้ถูก cast มา
- [x] `decrypt` ของข้อมูลที่ถูกแก้หนึ่งไบต์ได้ `secret.decrypt_failed`
- [x] `verify` ของ token ที่หมดอายุตามเวลาที่ส่งเข้ามาได้ false
- [x] `randomToken` ยาว 22 ตัว `[A-Za-z0-9_-]`

ตรวจ: V0

### T-2.8 Client data layer: API functions, hooks, polling, optimistic send

| | |
| --- | --- |
| Wave | 2 |
| พึ่ง | T-0.4, T-1.7, T-1.8 |
| เขียนได้ | `src/common/common.api.ts`, `common.hooks.ts`, `query-keys.ts`, `polling.ts`, `AppProviders.tsx`, `AppShell.tsx`, `src/features/inbox/inbox.api.ts`, `inbox.hooks.ts`, `src/features/settings/settings.api.ts`, `settings.hooks.ts`, และ helper ล้วนเพิ่มเติมใน `src/features/inbox/inbox.send.logic.ts` พร้อม `.spec.ts` (ไฟล์นี้ lead อนุญาตเพื่อให้ state ของการส่งทดสอบได้) |
| อ่านก่อน | [ui-screens ข้อ 1.6, 7](../specs/ui-screens.md#16-การเรียก-api), [api-contract: protocol ของ polling](../architecture/api-contract.md#protocol-ของ-polling) |

ขั้นตอน:

1. `apiFetch` และทุก function ในตารางของข้อ 1.6 ให้หนึ่ง function ต่อหนึ่ง endpoint และตรวจคำตอบด้วย schema จาก `src/contracts/`
2. `qk`, `usePollingInterval`, `useSettings`, `useCannedReplies`, `useContacts`, `useContactDetail`, `useThread`, `useSendMessage` ตามข้อ 7.1 ถึง 7.5 และ 7.7
3. `AppProviders` (ลงทะเบียน `onUnauthorized`) และ `AppShell` (poll รายชื่อเมื่อหน้าแชทไม่ได้เปิด, ส่งจำนวนยังไม่อ่านให้ `AppRail`, แสดง `ConnectionBanner`)

เกณฑ์รับ:

- [x] ทุกรอบ poll ส่ง `afterUpdatedSeq = pollAfter(cursor)` และ cursor ไม่ถอยหลัง
- [x] `hasMore` true แล้วขอรอบถัดไปทันที
- [x] เมื่อแท็บกลับมาแสดง โหลดหน้าแรกใหม่และคงข้อความที่ยังไม่มี `seq`
- [x] unit test ของ `inbox.send.logic.ts` ครอบทุกแถวในตารางการเปลี่ยนสถานะของข้อ 7.5
- [x] ไม่มี `fetch` ในไฟล์ที่ไม่ใช่ `*.api.ts`

ตรวจ: V0, VB

### T-2.9 Guardrail foundations

| | |
| --- | --- |
| Wave | 2 (หลังทุก ticket ตั้งแต่ T-2.1 ถึง T-2.8 จบและผ่าน review ก่อน wave 3) |
| พึ่ง | T-2.1, T-2.2, T-2.3, T-2.4, T-2.5, T-2.6, T-2.7, T-2.8 |
| เขียนได้ | Domain: `src/core/domain/enums.model.ts`, `src/core/domain/settings.model.ts`, `src/core/domain/topic-guard.model.ts` (ใหม่), `src/core/domain/constants.ts`, `src/core/domain/error-codes.ts`, `src/core/domain/topic-guard.logic.ts` และ `topic-guard.logic.spec.ts` (ใหม่), `src/core/domain/index.ts`, และ `.spec.ts` ของ T-0.2 ที่ตรวจชุดค่าของ enum และ `ERROR_CODES` (ไฟล์ตรงตัวที่ T-0.2 สร้าง ผู้ทำรายงานชื่อ) · Port: `src/core/ports/topic-guard.port.ts` (ใหม่), `settings.repository.port.ts`, `usage.repository.port.ts`, `message.repository.port.ts`, `logger.port.ts`, `src/core/ports/index.ts` · Use case: `src/core/use-cases/types.ts`, `src/core/use-cases/index.ts`, stub ของ `test-topic-guard.use-case.ts` และ `get-guardrail-stats.use-case.ts` (ใหม่ ส่งต่อให้ T-3.1), ลายเซ็นใน stub ของ `generate-ai-reply.use-case.ts`, `update-settings.use-case.ts`, `get-settings.use-case.ts`, `get-usage-report.use-case.ts` · ตัวปลอม: `src/adapters/fakes/fake-topic-guard.ts`, `fake-topic-guard.spec.ts`, `suites/topic-guard.suite.ts` (ใหม่), `fake-settings-repository.ts`, `fake-usage-repository.ts`, `fake-message-repository.ts` พร้อม `.spec.ts` ของแต่ละตัว, `suites/settings-repository.suite.ts`, `suites/usage-repository.suite.ts`, `suites/message-repository.suite.ts`, `src/adapters/fakes/index.ts` · Contract: `src/contracts/dto.contract.ts`, `settings.contract.ts`, `usage.contract.ts`, `system.contract.ts`, `limits.contract.ts`, `src/contracts/index.ts` และ `.spec.ts` ของแต่ละไฟล์ · หน้าจอ: `src/common/test-ids.ts`, `src/common/error-messages.ts` และ `.spec.ts`, `src/features/settings/settings.constants.ts` · ฐานข้อมูล: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_topic_guard/**` (ใหม่), `src/adapters/prisma/settings.repository.ts`, `settings.mapper.ts`, `usage.repository.ts`, `usage.mapper.ts`, `message.repository.ts` และ `.spec.ts` ของแต่ละไฟล์ |
| อ่านก่อน | [topic-guard](../specs/topic-guard.md), [domain-and-ports: Enum](../architecture/domain-and-ports.md#enum), [ขอบเขตหัวข้อ](../architecture/domain-and-ports.md#ขอบเขตหัวข้อ), [TopicGuard](../architecture/domain-and-ports.md#topicguard), [Repository](../architecture/domain-and-ports.md#repository), [Logger](../architecture/domain-and-ports.md#logger), [use-cases: GenerateAiReply ถึง GetGuardrailStats](../architecture/use-cases.md#generateaireply), [api-contract: DTO ร่วม](../architecture/api-contract.md#dto-ร่วม), [PATCH /api/settings](../architecture/api-contract.md#patch-apisettings), [error-catalog](../architecture/error-catalog.md), [data-model: migration ที่สอง](../architecture/data-model.md#migration-ที่สอง-ขอบเขตหัวข้อ), [project-setup ข้อ 10](../architecture/project-setup.md#10-ค่าคงที่ของระบบ), [ui-copy: ขอบเขตหัวข้อ และ Guardrails](../specs/ui-copy.md#ขอบเขตหัวข้อ), [ui-screens ข้อ 9.13, 9.14, 11](../specs/ui-screens.md#913-ส่วนขอบเขตหัวข้อ), [ai-prompt ข้อ 9](../specs/ai-prompt.md#9-prompt-ของขอบเขตหัวข้อ) |

ขั้นตอน:

1. Domain: ค่าใหม่ของ `UsageKind`, `UsageOutcome`, `RateLimitAction`, `EventCode`, field ใหม่ของ `Settings`, `TopicVerdict` และ `TopicGuardResponse` ใน `topic-guard.model.ts`, constant ทุกตัวของขอบเขตหัวข้อและ `RATE_LIMIT_GUARD_TEST` พร้อมแถว `guard_test` ใน `RATE_LIMIT_RULES` (scaled), รหัส `settings.guard_topics_required` และ `settings.guard_rate_limited` ใน `ERROR_CODES`
2. ฟังก์ชันล้วน `normalizeGuardTopics`, `guardContextTurns`, `buildGuardRulesBlock`, `buildGuardClassifierPrompt`, `guardVerdictOf` พร้อม test ทุกแถวของคอลัมน์กฎ และข้อความของ prompt ตรงกับ ai-prompt ข้อ 9 ทุกไบต์
3. Port `TopicGuard`, method ใหม่ `UsageRepository.guardSummary`, `UsageRepository.countSafetyOutcomes`, `MessageRepository.countEventsByCode`, patch ใหม่ของ `SettingsRepository.update`, `LogEvent` ใหม่ `guard.checked`, `guard.blocked`, `guard.failed` และ `topicGuard` ใน `AllPorts`
4. ตัวปลอม `FakeTopicGuard` (`enqueue()`, `.requests`, ค่าเริ่มต้น `allowed: true`) และชุดทดสอบ `describeTopicGuardSuite` ตามตารางความหมาย ชุดทดสอบของ repository ที่เปลี่ยนเพิ่มแถวของ method ใหม่ แล้วรันกับตัวปลอม
5. Stub ของ use case ใหม่สองตัว และลายเซ็นที่เปลี่ยนของสี่ตัว (`AiReplyRunOutcome` มี `blocked`, input ของ `UpdateSettings`, output ของ `GetSettings` และ `GetUsageReport`)
6. Contract: `SettingsDto.guard`, field ใหม่ของ body `PATCH /api/settings` (ตรวจด้วย `normalizeGuardTopics`), schema ของ `POST /api/settings/guard/test` และ `GET /api/system/guardrails`, `GuardrailStatsDto`, `guard` ของรายงานค่าใช้จ่าย, ค่าใหม่ของ `UsageRecordDto` และ re-export constant `GUARD_*` กับ `normalizeGuardTopics` ใน `limits.contract.ts`
7. Constant ของหน้าจอ: key `settings.guard.*` (ในโค้ด `copy.guard.*` รวม `copy.guard.errors.*`), `settings.guardrails.*`, `settings.usage.guardRow`, `settings.usage.guardCount`, `settings.usage.outcome.blocked`, testid ใหม่ทุกตัวในข้อ 9.12 ถึง 9.14 ของ ui-screens, ข้อความของรหัสใหม่และข้อความที่เปลี่ยนของ `ai.budget_exhausted` และ `eventCodeText("guard.blocked")`
8. Prisma: แก้ `schema.prisma` ตาม data-model แล้ว `pnpm db:migrate -- --create-only --name topic_guard` ตรวจว่า SQL เป็นการเพิ่มอย่างเดียว ห้ามแก้ migration `init` แล้ว apply และเขียน method ใหม่กับการ map field ใหม่ของ repository ทั้งสามตัว แล้วรันชุดทดสอบของ port กับ Postgres

เกณฑ์รับ:

- [x] test ตรวจว่า `ERROR_CODES` มีรหัสเท่ากับตารางใน error-catalog รวมสองรหัสใหม่ และทุกรหัสมีข้อความใน `error-messages.ts`
- [x] ชุดค่าของ `UsageKind`, `UsageOutcome`, `RateLimitAction`, `EventCode` ตรงกับ domain-and-ports, api-contract, data-model และ ui-screens ทุกตัว
- [x] `buildGuardRulesBlock` และ `buildGuardClassifierPrompt` คืนผลเดิมทุกไบต์เมื่อ input เดิม และแทน `<` `>` ในข้อความของลูกค้า
- [x] migration `init` ไม่เปลี่ยน (`git diff` ของโฟลเดอร์นั้นว่าง) และ `pnpm db:deploy` บนฐานที่มี `init` อยู่แล้วผ่าน แถว Settings เดิมได้ค่าเริ่มต้นของสามคอลัมน์ใหม่
- [x] ชุดทดสอบของ `TopicGuard`, `SettingsRepository`, `UsageRepository` และ `MessageRepository` ผ่านกับตัวปลอม และสามตัวหลังผ่านกับ Postgres
- [x] test เดิมของ ticket ที่จบแล้วยังผ่านทั้งหมดโดยไม่ข้ามหรือลบ
- [x] หลัง ticket นี้มี port 20 ตัวและ `use-cases/index.ts` export factory 34 ตัวตามรายชื่อใน backend (ตัวเลข 19 และ 32 ในเกณฑ์ของ T-0.3 เป็นของตอนที่ T-0.3 จบ)

ตรวจ: V0, VA และ `docker compose up -d --wait db` แล้ว `pnpm db:deploy` exit 0

### T-2.10 TopicGuard Claude adapter and stub support

| | |
| --- | --- |
| Wave | 2 (หลัง T-2.9) |
| พึ่ง | T-2.9 |
| เขียนได้ | `src/adapters/claude/claude-topic-guard.adapter.ts` และ `claude-topic-guard.adapter.spec.ts` (ใหม่), `src/adapters/claude/claude.constants.ts`, `src/adapters/claude/index.ts`, `stubs/server.ts`, `stubs/lib/**`, `e2e/helpers/stub.ts` |
| อ่านก่อน | [domain-and-ports: TopicGuard](../architecture/domain-and-ports.md#topicguard), [คำขอของ TopicGuard.classify](../architecture/domain-and-ports.md#คำขอของ-topicguardclassify), [ai-prompt ข้อ 9](../specs/ai-prompt.md#9-prompt-ของขอบเขตหัวข้อ), [stubs-and-fixtures ข้อ 3, 5, 6](../qa/stubs-and-fixtures.md#53-คำตอบของ-messages) |

ขั้นตอน:

1. `claude-topic-guard.adapter.ts` ตามตารางคำขอ ใช้ `buildGuardClassifierPrompt` จาก domain, `CLAUDE_GUARD_MAX_RETRIES` ใน `claude.constants.ts` และ export factory จาก `index.ts`
2. Spec ของ adapter รันชุดทดสอบของ port `TopicGuard` จาก T-2.9 กับ stub ในชุด `adapters`
3. Stub: แยกชนิดคำขอ `guard` ด้วย property `allowed` ใน schema, คำตอบเริ่มต้นของ `guard`, `purpose` ใน `RecordedRequest`, `kind: "guard"` และการอนุมาน `kind` จาก `json` ใน `next-reply`, query `purpose` ของ `GET /__control/claude/requests`
4. `stubClaudeRequests` ใน `e2e/helpers/stub.ts` รับ `purpose`

เกณฑ์รับ:

- [x] คำขอที่ stub ได้รับมี `model` เป็น `GUARD_MODEL`, `max_tokens` เท่ากับ `GUARD_MAX_TOKENS`, `output_config.effort` เป็น `low`, ไม่มี `betas`, `fallbacks`, `tools`, `stream`, `temperature` และ `messages` มี user turn เดียว
- [x] คำขอที่ไม่ตอบภายใน `GUARD_TIMEOUT_MS` (ใช้ `delay-next` ของ stub) ได้ `ai.unavailable` หลัง retry ไม่เกิน `CLAUDE_GUARD_MAX_RETRIES` ครั้ง
- [x] `refusal`, `max_tokens` และ JSON ที่ไม่ตรง schema แปลงตามตารางการอ่านผล และคืน `usage` ทุกกรณี
- [x] รายการ `next-reply` ที่ไม่ระบุ `kind` และไม่มี `allowed` ไม่ถูกใช้กับคำขอ `guard` และ test เดิมของ stub กับ adapter ของ T-2.5 ยังผ่าน
- [x] `RecordedRequest.purpose` ถูกต้องทั้งสี่ชนิด

ตรวจ: V0, VA และ `docker compose up -d --build --wait stub` exit 0

### T-3.1 Use cases: access, settings, LINE credentials, status, canned replies, usage

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.1, T-1.2, T-1.3, T-1.4, T-2.1, T-2.9 |
| เขียนได้ | `src/core/use-cases/{verify-access,unlock-access,check-health,get-settings,update-settings,test-topic-guard,set-line-credentials,test-line-connection,get-system-status,get-guardrail-stats,save-canned-reply,delete-canned-reply,list-canned-replies,get-usage-report,get-contact-usage}.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases](../architecture/use-cases.md) หัวข้อของแต่ละ use case, [access-gate](../specs/access-gate.md), [topic-guard](../specs/topic-guard.md) |

ขั้นตอน: เขียน 15 use case ตามขั้นตอนและรายการ test ใน use-cases รวมการตรวจค่าของขอบเขตหัวข้อใน `UpdateSettings`, `TestTopicGuard`, `guardBlockedToday` ของ `GetSettings`, แถว `guard` ของ `GetUsageReport` และ `GetGuardrailStats`

เกณฑ์รับ:

- [x] รายการ test ของทุกหัวข้อใน use-cases มี test ตรงกันหนึ่งต่อหนึ่ง
- [x] `UnlockAccess` นับเฉพาะรหัสผิดด้วย `checkRateLimit` แล้ว `hitRateLimit`
- [x] `GetSettings` คืน `todayCost`, `guardBlockedToday` และ `pollIntervalMs`
- [x] `UpdateSettings` เปิดขอบเขตหัวข้อโดยไม่มีหัวข้อได้ `settings.guard_topics_required` และไม่มีการเขียน
- [x] `TestTopicGuard` บันทึก AiUsage kind guard ทุกครั้งที่ API ตอบ และใช้หัวข้อที่บันทึกไว้

ตรวจ: V0, VC

### T-3.2 Use cases: ReceiveLineEvents, StoreInboundMedia

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-2.1 |
| เขียนได้ | `src/core/use-cases/receive-line-events.use-case.ts`, `store-inbound-media.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: ReceiveLineEvents](../architecture/use-cases.md#receivelineevents), [StoreInboundMedia](../architecture/use-cases.md#storeinboundmedia), [line-messaging](../specs/line-messaging.md) |

ขั้นตอน: เขียนทั้งสอง use case ตามขั้นตอน รวม `fetchProfile` เฉพาะลูกค้าใหม่ก่อนตอบ

เกณฑ์รับ:

- [x] รายการ test ของทั้งสองหัวข้อมีครบ
- [x] ดึงโปรไฟล์ไม่สำเร็จแล้ว Contact ไม่มีชื่อและข้อความยังถูกบันทึก
- [x] สื่อที่เก็บสำเร็จได้ `mediaStatus` เป็น `ready`

ตรวจ: V0, VC

### T-3.3 Use case: GenerateAiReply

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.1, T-1.2, T-2.1, T-2.9 |
| เขียนได้ | `src/core/use-cases/generate-ai-reply.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: GenerateAiReply](../architecture/use-cases.md#generateaireply), [ai-reply](../specs/ai-reply.md), [topic-guard](../specs/topic-guard.md), [ai-prompt ข้อ 5.4 และ 9](../specs/ai-prompt.md#54-จากผลไปสู่การกระทำ), [usage-cost](../specs/usage-cost.md) |

ขั้นตอน: เขียนตามขั้นตอนหลัก, `replyOnce` (รวมขั้นคัดกรองข้อ 4 และชั้นที่สองข้อ 11) และ `sendGuardRefusal` ด้วย `Clock` ปลอมและ `FakeTopicGuard`

เกณฑ์รับ:

- [x] รายการ test ทุกกลุ่ม (เงื่อนไข, ขอบเขตหัวข้อ, การรวมข้อความและล็อก, ผลของโมเดล, ตรวจซ้ำก่อนส่ง, การส่ง) มีครบ
- [x] ข้อความที่ถูกกันไม่เรียก `KnowledgeSource` และ `ChatModel` ไม่ขึ้นรอแอดมิน และการคัดกรองที่ล้มเหลวไม่ส่งอะไรให้ลูกค้า
- [x] `needsAdmin` true ส่ง `handoffText` ไม่ใช่ `reply` ของโมเดล และเหตุผลเป็น `ai_` + `handoffReason`
- [x] โมเดลที่ไม่อยู่ในตารางราคาถูกคิดราคาสูงสุดและ log `ai.price_unknown_model`

ตรวจ: V0, VC

### T-3.4 Use cases: admin send, retry, typing, contact AI switch, mark read

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.2, T-2.1 |
| เขียนได้ | `src/core/use-cases/{send-admin-message,retry-message,show-typing-to-customer,set-contact-ai,mark-contact-read}.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: SendAdminMessage ถึง MarkContactRead](../architecture/use-cases.md#sendadminmessage), [ai-reply: เมื่อแอดมินตอบเอง](../specs/ai-reply.md#เมื่อแอดมินตอบเอง) |

ขั้นตอน: เขียนทั้งห้า use case ตามขั้นตอน

เกณฑ์รับ:

- [x] แอดมินส่งข้อความแล้ว `aiEnabled` เป็น false, `needsAdmin` ถูกล้าง และมีบรรทัด `ai.turned_off_by_admin` เมื่อ AI เปิดอยู่ก่อน
- [x] `RetryMessage` ใช้ push ด้วย retry key เดิมเสมอ
- [x] `SetContactAi` เปิดแล้วล้าง `needsAdmin`
- [x] `ShowTypingToCustomer` เกิน `RATE_LIMIT_TYPING` แล้วคืน `shown: false` โดยไม่เรียก LINE

ตรวจ: V0, VC

### T-3.5 Use cases: uploads and local storage

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.2, T-1.3, T-2.1 |
| เขียนได้ | `src/core/use-cases/{issue-upload,discard-upload,write-local-upload,serve-local-media}.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: IssueUpload ถึง ServeLocalMedia](../architecture/use-cases.md#issueupload) |

ขั้นตอน: เขียนทั้งสี่ use case ตามขั้นตอน

เกณฑ์รับ:

- [x] รายการ test ของทั้งสี่หัวข้อมีครบ
- [x] `uploadId` มาจาก `randomToken` และ key ของ local ที่มี `..` ได้ `media.not_found`

ตรวจ: V0, VC

### T-3.6 Use cases: ListContacts, GetContact, GetMessages

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.4 |
| เขียนได้ | `src/core/use-cases/{list-contacts,get-contact,get-messages}.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: ListContacts](../architecture/use-cases.md#listcontacts), [GetContact](../architecture/use-cases.md#getcontact), [GetMessages](../architecture/use-cases.md#getmessages), [api-contract: protocol ของ polling](../architecture/api-contract.md#protocol-ของ-polling) |

ขั้นตอน: เขียนทั้งสาม use case รวมการคืนสภาพงาน AI ที่ค้างและบรรทัดเหตุการณ์ `handoff.ai_timeout`

เกณฑ์รับ:

- [x] `highWater` ของหน้าแรกอ่านก่อน list
- [x] งานที่ค้างได้บรรทัดเหตุการณ์หนึ่งบรรทัดต่อแชท

ตรวจ: V0, VC

### T-3.7 Use cases: knowledge base

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.2, T-2.1 |
| เขียนได้ | `src/core/use-cases/{ingest-document,delete-document,list-documents,get-document}.use-case.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: IngestDocument](../architecture/use-cases.md#ingestdocument), [knowledge-base](../specs/knowledge-base.md), [ai-prompt ข้อ 7.3](../specs/ai-prompt.md#73-การจัดการผล) |

ขั้นตอน: เขียนทั้งสี่ use case ตามขั้นตอน

เกณฑ์รับ:

- [x] ไฟล์ที่เกิน `PDF_MAX_PAGES` ถูกปฏิเสธหลังแปลงและมีแถว AiUsage พร้อมต้นทุน
- [x] `EMPTY_DOCUMENT` ได้ `knowledge.extract_empty`
- [x] จำนวน token มาจาก `countTokens` ไม่ใช่ `usage.output_tokens`

ตรวจ: V0, VC

### T-3.8 Manual AI eval script

| | |
| --- | --- |
| Wave | 3 |
| พึ่ง | T-1.1, T-1.6, T-2.5, T-2.9, T-2.10 |
| เขียนได้ | `scripts/ai-eval.ts` |
| อ่านก่อน | [ai-prompt ข้อ 8 และ 9](../specs/ai-prompt.md#8-ชุดคำถามวัดคุณภาพ-ai), [test-strategy](../qa/test-strategy.md#ชุดคำถามวัดคุณภาพ-ai) |

ขั้นตอน: สคริปต์ที่ปฏิเสธเมื่อไม่มี `--confirm` แปลง `tonhom-cafe.pdf` ถามทุกข้อในข้อ 8.3 รวมกลุ่ม G สองรอบตามกฎข้อ 8.1 (รอบที่ 2 เรียก adapter ของ `TopicGuard` ก่อน adapter ของ `ChatModel` และใช้บล็อก `buildGuardRulesBlock`) วัดเวลาและต้นทุนของแต่ละข้อ คำนวณตัวชี้วัดตามข้อ 8.4 แล้วเขียนผลพร้อมตารางตัวชี้วัดเป็นไฟล์ `docs/qa/ai-quality-YYYY-MM-DD-<model>.md` (สคริปต์เขียน ไม่ใช่ผู้ทำ ticket)

เกณฑ์รับ:

- [x] `pnpm ai:eval` โดยไม่มี `--confirm` จบด้วย exit code ไม่ใช่ 0 และไม่เรียกเครือข่าย
- [x] เกณฑ์ผ่านของแต่ละข้อเป็นฟังก์ชันที่มี unit test ด้วยคำตอบตัวอย่าง
- [x] การคำนวณตัวชี้วัดทั้งหกตัวเป็นฟังก์ชันที่มี unit test ด้วยผลตัวอย่าง และ unauthorized-action rate เขียนเป็น 0 พร้อมเหตุผล

ตรวจ: V0 และ `pnpm ai:eval` (ไม่มี `--confirm`) ต้องปฏิเสธ ห้ามรันด้วย `--confirm`

### T-3.9 Hardening: inbound media, too_large, document retry, month range, round 2, guard test errors

| | |
| --- | --- |
| Wave | 3 (หลัง T-3.1 ถึง T-3.7 จบและผ่าน review) |
| พึ่ง | T-3.1, T-3.2, T-3.3, T-3.7 |
| เขียนได้ | Use case: `src/core/use-cases/{receive-line-events,store-inbound-media,ingest-document,generate-ai-reply,test-topic-guard,get-usage-report,get-contact-usage}.use-case.ts` และ `.spec.ts` · ขั้นตอนร่วม: `src/core/use-cases/shared/month-range.ts` (ใหม่) และ `.spec.ts` · Port: `src/core/ports/message.repository.port.ts`, `knowledge.repository.port.ts` · ตัวปลอม: `src/adapters/fakes/fake-message-repository.ts`, `fake-knowledge-repository.ts`, `fake-messaging-gateway.ts`, `suites/message-repository.suite.ts`, `suites/knowledge-repository.suite.ts`, `suites/messaging-gateway.suite.ts` · Prisma: `src/adapters/prisma/message.repository.ts`, `knowledge.repository.ts` และ `.spec.ts` |
| อ่านก่อน | [use-cases: ReceiveLineEvents](../architecture/use-cases.md#receivelineevents), [StoreInboundMedia](../architecture/use-cases.md#storeinboundmedia), [IngestDocument](../architecture/use-cases.md#ingestdocument), [GenerateAiReply](../architecture/use-cases.md#generateaireply), [TestTopicGuard](../architecture/use-cases.md#testtopicguard), [GetUsageReport และ GetContactUsage](../architecture/use-cases.md#getusagereport-และ-getcontactusage), [domain-and-ports: Repository](../architecture/domain-and-ports.md#repository) |

ขั้นตอน:

1. สื่อขาเข้าที่ค้าง: `ReceiveLineEvents` ส่งงาน `store_media` ทุกครั้งที่พบข้อความรูปหรือวิดีโอที่ยังเป็น `pending` รวมเมื่อ LINE ส่งซ้ำ (การส่งครั้งแรกอาจล้มก่อนคืนงาน) `MessageRepository.setMediaReady` และ `setMediaStatus` เป็น compare-and-set บน `mediaStatus = pending` และคืน boolean งานที่แพ้ไม่เขียนทับผลของงานที่จบก่อน และลบไฟล์ที่ตัวเองเก็บไว้
2. ป้าย `too_large` ที่ถูกต้อง: `StoreInboundMedia` ถือว่า error ของการอ่านไฟล์เป็นการเกินขนาดเฉพาะเมื่อ `Content-Length` เกินเพดาน หรือ error มีรหัส `media.too_large` ตามสัญญาของ `MessagingGateway` การขาดกลางทางอื่น (เช่น connection reset) เป็นความล้มเหลวธรรมดา
3. ลองใหม่ของเอกสารแบบ atomic: `KnowledgeRepository.restartProcessing` เป็น compare-and-set บน `status = failed` และคืน `knowledge.not_retryable` เมื่อเอกสารไม่อยู่ในสถานะ `failed` (รวมผู้แพ้ของการลองใหม่สองครั้งพร้อมกัน) จึงเริ่มการแปลงได้ครั้งเดียว การอัปโหลดที่ไม่ได้ขอลองใหม่แต่แพ้ compare-and-set นี้ได้ `knowledge.duplicate` เหมือนกรณีที่ไม่มีการแข่งกัน
4. ตัวช่วยช่วงเดือนร่วม: `GetUsageReport` และ `GetContactUsage` ใช้ `monthRangeOf` ใน `src/core/use-cases/shared/month-range.ts` ตัวเดียว (ห่อ `bangkokMonthRange` ของ domain และ throw เมื่อเดือนผิดรูปแบบ เพราะ route ตรวจรูปแบบแล้ว) แทนตัวช่วยที่เขียนซ้ำในแต่ละไฟล์
5. ตรวจประวัติของรอบที่ 2: ใน `GenerateAiReply` คำตอบของ AI จากรอบก่อนของงานเดียวกันถูกวางในประวัติต่อจากแถวสุดท้ายที่รอบนั้นเห็น ข้อความของลูกค้าที่มาถึงระหว่างการเรียกโมเดลของรอบก่อนจึงอยู่หลังคำตอบนั้นและเป็น turn สุดท้าย แถวอื่นคงลำดับ `seq` และข้อความที่โมเดลเห็นแล้วในประวัติของรอบนั้นไม่นับเป็นข้อความใหม่ที่ทำให้เริ่มรอบถัดไป
6. บันทึก error ของการทดลองขอบเขตหัวข้อ: `TestTopicGuard` บันทึกความล้มเหลวทั้งจาก port และจากผลที่ `guardVerdictOf` ตัดสินว่าล้มเหลว ด้วย `SettingsRepository.recordAiError` และ log `guard.failed` เพื่อให้ส่วนสถานะระบบแสดง

เกณฑ์รับ:

- [x] ข้อความรูปที่ยัง `pending` เมื่อ LINE ส่งซ้ำได้งาน `store_media` อีกครั้ง โดยไม่เพิ่มจำนวนยังไม่อ่านและไม่เริ่มงาน AI ซ้ำ
- [x] งาน `store_media` สองงานของข้อความเดียวกันจบด้วยผลเดียว และไฟล์ของงานที่แพ้ถูกลบ
- [x] stream ที่ขาดกลางทางโดยไม่มี `Content-Length` และไม่มีรหัส `media.too_large` ได้ `failed` ไม่ใช่ `too_large`
- [x] การลองใหม่สองครั้งพร้อมกันของเอกสารเดียวเริ่มการแปลงครั้งเดียว อีกครั้งได้ `knowledge.not_retryable`
- [x] รอบที่ 2 ของ `GenerateAiReply` ได้ประวัติที่ turn สุดท้ายเป็นข้อความของลูกค้าที่มาถึงระหว่างรอบแรก
- [x] ผลการทดลองขอบเขตหัวข้อที่ล้มเหลว (ทั้งจาก port และจาก verdict) อยู่ใน `lastAiError` ของสถานะระบบ
- [x] ชุดทดสอบของ `MessageRepository` และ `KnowledgeRepository` ที่เพิ่มแถวของ compare-and-set ผ่านกับตัวปลอมและกับ Postgres
- [x] test เดิมของ ticket ที่จบแล้วยังผ่านทั้งหมดโดยไม่ข้ามหรือลบ

ตรวจ: V0, VA, VC

### T-4.1 Composition, route wrapper, proxy gate, security headers

| | |
| --- | --- |
| Wave | 4 (ตัวแรก) |
| พึ่ง | T-2.2 ถึง T-2.7, T-2.9, T-2.10, ทุก ticket ของ wave 3 ยกเว้น T-3.8 |
| เขียนได้ | `src/composition/**`, `app/api/_lib/**`, `proxy.ts`, `instrumentation.ts` |
| อ่านก่อน | [api-contract: กติการ่วม](../architecture/api-contract.md#กติการ่วม), [project-setup ข้อ 4, 6.2, 6.10](../architecture/project-setup.md#4-nextjs-16), [threat-model](../security/threat-model.md), [use-cases: การประกอบ](../architecture/use-cases.md#การประกอบ) |

ขั้นตอน:

1. `env.ts` ตามตารางของข้อ 6.10 รวม `RATE_LIMIT_SCALE`, `container.ts` ประกอบ adapter จริงแบบ lazy ตาม `FILE_STORAGE` รวม adapter `TopicGuard` ของ Claude ที่ส่งให้ `GenerateAiReply` และ `TestTopicGuard`, `index.ts` export use case ที่ประกอบแล้ว (รวม `TestTopicGuard` และ `GetGuardrailStats`), `withRoute()`, `runJob()`, `assertEnv()`
2. `app/api/_lib/to-dto.ts`: แปลง entity เป็น DTO ทุกตัว รวม `line.status`, `ai.todayCostUsd`, `guard.*` ของ `SettingsDto`, `GuardrailStatsDto`, `guard` ของรายงานค่าใช้จ่าย, `client.pollIntervalMs`, `sticker.imageUrl`
3. `proxy.ts` ตาม [proxy.ts](../architecture/project-setup.md#proxyts) และ `instrumentation.ts`

เกณฑ์รับ:

- [x] ทุกรหัส error แปลงเป็น HTTP status ตาม error-catalog ด้วยตารางเดียว (unit test ครบทุกรหัส รวม status ใหม่ของรหัส `ai.*` และรหัส `settings.*`)
- [x] คำขอที่ไม่ใช่ GET จากต้นทางอื่นได้ 403 `request.origin_forbidden` และ log `http.origin.rejected`
- [x] `RATE_LIMIT_SCALE` ที่ไม่ใช่จำนวนเต็ม ≥ 1 ทำให้ `assertEnv()` ล้มพร้อมชื่อตัวแปร
- [x] Header ของ [ข้อ 6.2](../architecture/project-setup.md#62-nextconfigts) อยู่ในทุก response

ตรวจ: V0, VB

### T-4.2 API routes

| | |
| --- | --- |
| Wave | 4 (หลัง T-4.1) |
| พึ่ง | T-4.1 |
| เขียนได้ | `app/api/**` ยกเว้น `app/api/_lib/**` |
| อ่านก่อน | [api-contract: Endpoint](../architecture/api-contract.md#endpoint), [project-setup ข้อ 3, 4](../architecture/project-setup.md#3-โครงโฟลเดอร์) |

ขั้นตอน: หนึ่ง `route.ts` ต่อ path ตาม [ตารางไล่ endpoint](../architecture/api-contract.md#ตารางไล่-endpoint-กับ-use-case) พร้อม `runtime`, `dynamic` และ `maxDuration` ของ webhook กับ route PDF

เกณฑ์รับ:

- [x] มี route ครบ 34 endpoint และไม่มี endpoint อื่น รวม `POST /api/settings/guard/test` และ `GET /api/system/guardrails`
- [x] Webhook อ่าน raw body ก่อน parse และงานหลังตอบผ่าน `runJob`
- [x] `PUT` และ `GET /api/local-storage/*key` ตอบ 404 เมื่อ `FILE_STORAGE` ไม่ใช่ `local`
- [x] Route ไม่ import อะไรนอกจาก `src/composition` และ `src/contracts`

ตรวจ: V0, VB, VA และ `docker compose up -d --build --wait` แล้ว `curl -s http://localhost:3000/api/health` ได้ `{"status":"ok"}`

### T-4.3 Seed data, compose bring-up, CI workflow

| | |
| --- | --- |
| Wave | 4 (ขนานกับ T-4.1 และ T-4.2) |
| พึ่ง | T-0.6, T-2.6, T-2.7, T-1.6, T-2.9 |
| เขียนได้ | `prisma/seed.ts`, `prisma/seed-assets/**`, `.github/workflows/ci.yml`, `Dockerfile`, `docker/**`, `docker-compose.yml`, `.env.example` |
| อ่านก่อน | [data-model: ข้อมูลตัวอย่าง](../architecture/data-model.md#ข้อมูลตัวอย่าง-seed), [project-setup ข้อ 7, 8](../architecture/project-setup.md#7-docker), [deploy](../runbooks/deploy.md), [stubs-and-fixtures ข้อ 2](../qa/stubs-and-fixtures.md#2-การต่อกับแอป) |

ขั้นตอน:

1. `seed.ts` ตามทุกตารางในหัวข้อ seed (kill switch เปิด งบเท่าค่าเริ่มต้น ขอบเขตหัวข้อปิดพร้อมหัวข้อตัวอย่างสามหัวข้อ) แบบ idempotent
2. ตรวจว่า compose ตรงกับ stubs-and-fixtures ทุกค่า (`stub`, `STUB_PORT`, `STUB_PUBLIC_URL`, `/__control/health`, `RATE_LIMIT_SCALE` ตามค่าใน project-setup ข้อ 7.3)
3. `ci.yml` ตามข้อ 8 โดยใส่ `<SHA>` เป็นค่าตัวแทนจนกว่า lead จะได้ SHA จริง (ห้ามเดา)

เกณฑ์รับ:

- [x] `docker compose run --rm seed` สองครั้งติดกันไม่ error และไม่เปลี่ยนข้อมูล
- [x] ข้อความ AI ของมะลิคือ "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ" และเหตุผลรอแอดมินคือ `ai_needs_human_action`
- [x] ไม่มีข้อมูลของคนจริง

ตรวจ: V0 และ `docker compose up -d --build --wait` แล้ว `docker compose run --rm seed` exit 0 สองครั้ง

### T-5.1 Inbox UI: contact list and rail counts

| | |
| --- | --- |
| Wave | 5 |
| พึ่ง | T-1.7, T-1.8, T-2.8, T-4.2, T-4.3 |
| เขียนได้ | `src/features/inbox/{ContactList,ContactSearch,ContactListTabs,ContactRow,ContactListSkeleton}.tsx`, `src/features/inbox/inbox.list.logic.ts` และ `inbox.list.logic.spec.ts` (ฟังก์ชันล้วนของรายชื่อ แยกจาก `inbox.logic.ts` ตาม [ui-screens ข้อ 8.2](../specs/ui-screens.md#82-srcfeaturesinboxinboxlogicts)) |
| อ่านก่อน | [ui-screens ข้อ 4](../specs/ui-screens.md#4-รายชื่อลูกค้า), [webchat-inbox: รายชื่อลูกค้า](../specs/webchat-inbox.md#รายชื่อลูกค้า), [ux-writing](../guidelines/ux-writing.md) |

ขั้นตอน: สร้าง component ตามข้อ 4.1 ถึง 4.7 โดยใช้ `useContacts` จาก T-2.8

เกณฑ์รับ:

- [x] ทุกสถานะในตารางข้อ 4.3 แสดงได้และมี testid
- [x] คีย์บอร์ดตามข้อ 4.5
- [x] ชื่อไทยที่มีสระซ้อนไม่ถูกตัดสระบนล่าง

ตรวจ: V0, VB, VS ที่ `/chats` กับ seed (ภาพ 390 และ 1280)

### T-5.2 Inbox UI: thread, info panel, lightbox

| | |
| --- | --- |
| Wave | 5 |
| พึ่ง | T-1.7, T-1.8, T-2.8, T-4.2, T-4.3 |
| เขียนได้ | `src/features/inbox/{Thread,ThreadHeader,AiSwitch,MessageList,DayChip,MessageGroup,MessageBubble,MediaContent,DeliveryStatus,SystemLine,NewMessagesButton,ThreadPlaceholder,InfoPanel,MediaLightbox}.tsx`, `src/features/inbox/inbox.thread.logic.ts` และ `inbox.thread.logic.spec.ts` (ฟังก์ชันล้วนของแชท แยกจาก `inbox.logic.ts`) |
| อ่านก่อน | [ui-screens ข้อ 5.1 ถึง 5.6, 5.11 ถึง 5.13, 6](../specs/ui-screens.md#5-แชท), [error-catalog: บรรทัดเหตุการณ์](../architecture/error-catalog.md#บรรทัดเหตุการณ์) |

ขั้นตอน: สร้าง component ตามข้อที่ระบุ `Thread` import `Composer` ซึ่งเป็น stub ของ T-5.3

เกณฑ์รับ:

- [x] บรรทัดเหตุการณ์มาจากรายการข้อความตามตำแหน่งของเวลา ไม่ต่อท้ายแชท และมี `data-event-code` (`guard.blocked` แสดงด้วย `SystemLine` เดิมผ่าน `eventCodeText` ที่ T-2.9 เพิ่ม ไม่ต้องมีโค้ดเฉพาะ)
- [x] สวิตช์ AI ไม่มีการหยุดแบบมีเวลา และ kill switch ปิดแล้วกดไม่ได้
- [x] เลื่อนตามข้อความใหม่เฉพาะเมื่ออยู่ล่างสุด
- [x] แผงข้อมูลไม่แสดง token หรือค่าใช้จ่าย

ตรวจ: V0, VB, VS ที่แชทของมะลิและป้าแดงใน seed (ภาพ 390 และ 1280)

### T-5.3 Inbox UI: composer, attachments (HEIC), canned picker, typing

| | |
| --- | --- |
| Wave | 5 |
| พึ่ง | T-1.7, T-1.8, T-2.8, T-4.2, T-4.3 |
| เขียนได้ | `src/features/inbox/{Composer,AttachmentTray,CannedReplyPicker}.tsx`, `src/features/inbox/inbox.attachment.ts`, `inbox.typing.ts`, `inbox.media.ts` |
| อ่านก่อน | [ui-screens ข้อ 5.7 ถึง 5.10, 7.5, 7.6, 8.3](../specs/ui-screens.md#57-ช่องตอบ), [line-messaging: สื่อขาออก](../specs/line-messaging.md#สื่อขาออก), [ADR 0019](../adr/0019-heic-conversion-with-heic-to.md), [project-setup: CSP](../architecture/project-setup.md#62-nextconfigts) |

ขั้นตอน:

1. `Composer`, `AttachmentTray`, `CannedReplyPicker` ตามข้อ 5.7 ถึง 5.10
2. `useAttachment` ตามข้อ 7.6, `useTypingPing` ตามข้อ 5.8
3. `inbox.media.ts` ตามข้อ 8.3 รวม `convertHeicToJpeg` ที่โหลด `import("heic-to/csp")` เฉพาะตอนเลือกไฟล์ HEIC
4. ยืนยัน CSP ที่ `heic-to/csp` ต้องใช้ใน Chrome และ Firefox แล้วรายงานให้ lead แก้ project-setup

เกณฑ์รับ:

- [x] **`heic-to` ไม่อยู่ใน JS bundle แรก:** ผลของ `pnpm build` แสดงว่า `heic-to` อยู่ใน chunk แยก และ request ของ chunk นั้นเกิดหลังเลือกไฟล์ HEIC เท่านั้น
- [ ] ไฟล์ HEIC แปลงเป็น JPEG ได้ใน Chromium ของ Playwright และ Firefox ถ้าแปลงไม่สำเร็จแสดง `inbox.attach.error.convertFailed` (ยังไม่ครบ: Chromium ผ่านใน E2E เส้นที่ 5 แต่ยังไม่ได้ตรวจใน Firefox)
- [x] Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่ และไม่ส่งขณะประกอบคำ
- [x] ping การพิมพ์ไม่เกินหนึ่งครั้งต่อ `TYPING_PING_INTERVAL_MS`
- [x] ยกเลิกไฟล์แนบแล้วเรียก `DELETE /api/uploads/:uploadId`

ตรวจ: V0, VB, VS ที่แชทของพีชใน seed พร้อมไฟล์แนบ JPEG, WebP และ HEIC (ภาพ 390 และ 1280)

### T-5.4 Settings UI: AI, LINE Official Account, system status

| | |
| --- | --- |
| Wave | 5 |
| พึ่ง | T-1.7, T-1.8, T-2.8, T-4.2, T-4.3 |
| เขียนได้ | `src/features/settings/{AiSettingsSection,LineSettingsSection,SystemStatusSection}.tsx` |
| อ่านก่อน | [ui-screens ข้อ 9.3, 9.4, 9.11](../specs/ui-screens.md#93-ส่วน-ai-ตอบแทน), [admin-backoffice](../specs/admin-backoffice.md), [ux-writing: ปุ่ม](../guidelines/ux-writing.md#ปุ่ม) |

ขั้นตอน: สร้างสามส่วนตามข้อที่ระบุ ปุ่มในหน้าเป็นแบบรองทั้งหมด ส่วนขอบเขตหัวข้อและส่วน Guardrails อยู่ใน T-5.6

เกณฑ์รับ:

- [x] ไม่มีค่าหรือส่วนหนึ่งของ secret บนหน้าจอ และช่อง secret ว่างหลังบันทึก
- [x] ค่าที่กรอกยังอยู่เมื่อบันทึกไม่สำเร็จ
- [x] `line.status` แสดงสามสถานะตามข้อ 9.4

ตรวจ: V0, VB, VS ที่ `/settings` (ภาพ 390 และ 1280)

### T-5.5 Settings UI: knowledge base, canned replies, usage

| | |
| --- | --- |
| Wave | 5 |
| พึ่ง | T-1.7, T-1.8, T-2.8, T-4.2, T-4.3 |
| เขียนได้ | `src/features/settings/{KnowledgeSection,KbDocumentTable,KbTextDialog,KbDeleteDialog,CannedRepliesSection,CannedReplyForm,UsageSection,UsageDetailDialog}.tsx` |
| อ่านก่อน | [ui-screens ข้อ 9.5 ถึง 9.10](../specs/ui-screens.md#95-ส่วนคลังความรู้), [knowledge-base](../specs/knowledge-base.md), [usage-cost](../specs/usage-cost.md#หน้าจอ) |

ขั้นตอน: สร้างสามส่วนและ dialog ตามข้อที่ระบุ รวมแถว `usage-row-guard` ของการคัดกรองขอบเขตหัวข้อ และ outcome `blocked` ใน dialog รายข้อความ

เกณฑ์รับ:

- [x] แถวคัดกรองแสดงจำนวนครั้ง token และราคาจาก `guard` ของรายงาน และไม่นับในครั้งที่ AI ตอบ
- [x] ตรวจไฟล์ PDF ใน browser ก่อนเรียก server
- [x] dialog ลบ focus ที่ปุ่มยกเลิก และเป็นที่เดียวที่มีปุ่มหลัก
- [x] ยอดรวม จำนวนครั้ง และค่าเฉลี่ยมาจาก server และแสดงวันที่ของตารางราคา

ตรวจ: V0, VB, VS ที่ `/settings` พร้อม dialog ดูข้อความ ลบไฟล์ และรายข้อความ (ภาพ 390 และ 1280)

### T-5.6 Settings UI: topic guard section and Guardrails panel

| | |
| --- | --- |
| Wave | 5 |
| พึ่ง | T-1.7, T-1.8, T-2.8, T-2.9, T-4.2, T-4.3 |
| เขียนได้ | `src/features/settings/GuardSection.tsx`, `GuardTestBox.tsx`, `GuardrailsSection.tsx` (ใหม่), `src/features/settings/SettingsPage.tsx` (เพิ่มสองส่วนถัดจาก `AiSettingsSection`), `src/features/settings/guard.logic.ts` และ `guard.logic.spec.ts` (ฟังก์ชันใหม่ในข้อ 8.5), `src/features/settings/guard.api.ts` (`testTopicGuard`, `getGuardrailStats`), `src/features/settings/guard.hooks.ts` (สามไฟล์นี้แทนการแก้ `settings.logic.ts`, `settings.api.ts` และ `settings.hooks.ts`), `src/common/query-keys.ts` (`qk.guardrails`) |
| อ่านก่อน | [ui-screens ข้อ 8.5, 9.13, 9.14, 7.1, 7.7](../specs/ui-screens.md#913-ส่วนขอบเขตหัวข้อ), [topic-guard](../specs/topic-guard.md), [ai-guardrails](../security/ai-guardrails.md), [ui-copy: ขอบเขตหัวข้อ](../specs/ui-copy.md#ขอบเขตหัวข้อ), [ux-writing](../guidelines/ux-writing.md) |

ขั้นตอน:

1. ฟังก์ชันล้วนใหม่ใน `settings.logic.ts` ตามข้อ 8.5 พร้อม test (คงฟังก์ชันเดิมของ T-1.8)
2. `testTopicGuard` และ `getGuardrailStats` ใน `settings.api.ts`, `qk.guardrails` และ hook ตามข้อ 7.1 และ 7.7
3. `GuardSection` และ `GuardTestBox` ตามข้อ 9.13, `GuardrailsSection` ตามข้อ 9.14 แล้ววางใน `SettingsPage` ตามลำดับในข้อ 9.12

เกณฑ์รับ:

- [x] ส่วนขอบเขตหัวข้ออยู่ถัดจากส่วน AI ตอบแทน และส่วน Guardrails อยู่ถัดจากส่วนขอบเขตหัวข้อ
- [x] เมื่อ kill switch ปิด control ของส่วนนี้ยังแก้ได้ และกล่องทดลองกดไม่ได้พร้อมเหตุผลหนึ่งบรรทัด
- [x] ผลทดลองบอกด้วยข้อความและไอคอน ไม่ใช่สีอย่างเดียว และแสดงค่าใช้จ่ายโดยประมาณ
- [x] เปิดสวิตช์ขณะไม่มีหัวข้อที่บันทึกไม่เรียก server และแสดง `copy.guard.errors.topics_required`
- [x] ส่วน Guardrails ไม่มี control และ poll ทุก `SYSTEM_STATUS_POLL_MS`
- [x] testid ครบตามข้อ 9.13 และ 9.14

ตรวจ: V0, VB, VS ที่ `/settings` ทั้งเมื่อขอบเขตหัวข้อเปิดและปิด และเมื่อ kill switch ปิด (ภาพ 390 และ 1280)

### T-6.1 E2E harness and journeys 1, 2, 7, 8

| | |
| --- | --- |
| Wave | 6 (ตัวแรก) |
| พึ่ง | ทุก ticket ของ wave 5, T-1.6 |
| เขียนได้ | `e2e/global.setup.ts`, `e2e/receive-message.spec.ts`, `e2e/admin-reply.spec.ts`, `e2e/send-failure.spec.ts`, `e2e/access-gate.spec.ts`, `e2e/helpers/*` ที่เส้นของ ticket ต้องเพิ่มหรือแก้ (รายการ helper ปัจจุบันอยู่ใน [stubs-and-fixtures ข้อ 7.4](../qa/stubs-and-fixtures.md#74-helper-สำหรับเซ็นและส่ง)) |
| อ่านก่อน | [stubs-and-fixtures ข้อ 6.1, 9](../qa/stubs-and-fixtures.md#9-ขั้นตอนของ-e2e), [project-setup ข้อ 6.8](../architecture/project-setup.md#68-playwrightconfigts), [test-strategy](../qa/test-strategy.md) |

ขั้นตอน: `global.setup.ts` (reset stub, เข้าระบบ, เก็บ state) และเส้นที่ 1, 2, 7, 8 ตามตารางขั้นตอนทุกขั้น

เกณฑ์รับ:

- [x] ไม่มี `waitForTimeout`
- [x] ข้อความไทยที่ตรวจมาจาก constant ไม่พิมพ์ซ้ำใน test
- [x] รันซ้ำสามครั้งติดกันผ่านทุกครั้งที่ทั้งสองขนาดจอ

ตรวจ: VE (สามครั้ง)

### T-6.2 E2E journeys 3, 4, 5, 6, 9

| | |
| --- | --- |
| Wave | 6 (หลัง T-6.1) |
| พึ่ง | T-6.1 |
| เขียนได้ | `e2e/global-state.serial.spec.ts`, `e2e/send-media.spec.ts`, `e2e/helpers/*` ที่เส้นของ ticket ต้องเพิ่มหรือแก้ |
| อ่านก่อน | [stubs-and-fixtures: เส้นที่ 3 ถึง 6](../qa/stubs-and-fixtures.md#เส้นที่-3-ai-ตอบแทน), [เส้นที่ 9](../qa/stubs-and-fixtures.md#เส้นที่-9-ขอบเขตหัวข้อ) |

ขั้นตอน: เส้นที่ 3, 4, 6, 9 เป็น `test.describe` แบบ serial ในไฟล์เดียว และเส้นที่ 5 ใน `send-media.spec.ts` ตามตารางขั้นตอนทุกขั้น รวมขั้น 5.11 ของ HEIC

เกณฑ์รับ:

- [x] หลังจบทุกเส้น kill switch เปิด ขอบเขตหัวข้อปิดพร้อมหัวข้อเดิม และคลังความรู้กลับเป็นเหมือนก่อนเริ่ม
- [x] เส้นที่ 9 ยืนยันว่าข้อความที่ถูกกันไม่มีคำขอ `purpose: "reply"` ไปที่ stub
- [x] เส้นที่ 3 ตรวจข้อความแจ้งส่งต่อแอดมินและบรรทัด `ai.turned_off_by_admin`
- [x] รันซ้ำสามครั้งติดกันผ่านทุกครั้งที่ทั้งสองขนาดจอ

ตรวจ: VE (สามครั้ง)

### T-7.1 Final integration, axe fixes, README, exit criteria

| | |
| --- | --- |
| Wave | 7 |
| พึ่ง | ทุก ticket |
| เขียนได้ | `README.md` และไฟล์ที่ lead มอบให้แก้เป็นรายไฟล์ตามผลการตรวจ (รวมการเปลี่ยน `access.api.ts` ไปใช้ `apiFetch`) |
| อ่านก่อน | หัวข้อ 5 ของเอกสารนี้, [แผนการสร้าง ขั้นที่ 6](implementation-plan.md#ขั้นที่-6-เก็บงานและส่ง) |

ขั้นตอน:

1. รันทุกชุดตรวจในหัวข้อ 5 และรายงานผล
2. แก้สิ่งที่ axe รายงานตามที่ lead มอบ
3. README: URL ทั้งสาม (ให้เจ้าของงานเติม), วิธีรันด้วย `docker compose up`, รหัสเข้าใช้ของเครื่อง dev, ข้อจำกัดที่รู้ และรายการในหัวข้อ 5.2
4. รายงานรายการเอกสารที่ไม่ตรงกับโค้ด เพื่อให้ lead แก้และเปลี่ยนสถานะ spec เป็น "สร้างแล้ว"

เกณฑ์รับ: ทุกข้อในหัวข้อ 5.1

ตรวจ: V0, VC, VA, VB, VE

## 4. รายการตรวจของ lead ต่อ ticket

- [ ] ไฟล์ที่เปลี่ยนอยู่ใน path "เขียนได้" ทั้งหมด และไม่มีไฟล์ร่วมถูกแก้โดยผู้ที่ไม่ใช่เจ้าของ
- [ ] `pnpm lint` ผ่านโดยไม่มี `eslint-disable` ใหม่ ขอบเขตของ hexagonal ตาม [code-style](../guidelines/code-style.md) ถูกเคารพ
- [ ] test มีครบตามรายการ test ของ use case หรือเกณฑ์รับของ ticket และไม่มี test ที่ถูกข้าม
- [ ] ลายเซ็น ชื่อ field ค่าของ enum และรหัส error ตรงกับเอกสารเจ้าของเรื่องทุกตัว ไม่มีค่าใหม่ที่ไม่ได้ถาม
- [ ] ไม่มีค่าตัวเลขเขียนตายตัวที่ควรเป็น constant และไม่มี constant ใหม่ที่ไม่อยู่ใน project-setup
- [ ] ไม่มี dependency ใหม่ และ `package.json` ไม่เปลี่ยน (ยกเว้น T-0.1)
- [ ] Log ใช้ port `Logger` ชื่อเหตุการณ์อยู่ใน `LogEvent` และไม่มีเนื้อหาข้อความ ชื่อลูกค้า token หรือ secret ([ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md))
- [ ] ไม่มีการเรียกบริการภายนอกจริงใน test หรือระหว่างทำ ticket
- [ ] ticket หน้าจอ: ถ้อยคำมาจาก constant ตาม [ux-writing](../guidelines/ux-writing.md) ไม่มีคำลงท้าย และมีภาพหน้าจอที่ 390 และ 1280 ซึ่ง lead เปิดดูแล้ว
- [ ] ผู้ทำรายงานครบตามข้อ 1.4 และความกำกวมที่พบถูกส่งต่อเป็นการแก้เอกสาร

## 5. เกณฑ์ "พร้อม"

### 5.1 ต้องผ่านทุกข้อ

- [ ] `docker compose up` คำสั่งเดียวบนเครื่องที่สะอาดได้แอปที่ `http://localhost:3000` พร้อมข้อมูลตัวอย่างของ seed และเข้าระบบด้วยรหัสในไฟล์ compose ได้ (ยังไม่ครบ: ตรวจบนเครื่องที่มี image และ volume อยู่แล้วเท่านั้น ไม่ได้ลองบนเครื่องที่สะอาดจริง)
- [x] `pnpm format:check`, `pnpm lint`, `pnpm typecheck` ผ่าน
- [x] `pnpm test:coverage` ผ่าน และ coverage ของ `src/core/**` ไม่ต่ำกว่า 90% ทุกตัวชี้วัด
- [x] `pnpm test:adapters` ผ่านกับ Postgres และ stub จาก compose
- [x] `pnpm test:e2e` ผ่านทั้ง 9 เส้นที่ 1280 และ 390 (project `desktop`, `mobile`, `serial-desktop`, `serial-mobile`)
- [x] `pnpm build` ผ่าน และ `heic-to` ไม่อยู่ใน bundle แรก
- [x] axe ไม่มี violation ในหน้ายินดีต้อนรับ หน้าแชท และหน้าตั้งค่า (ยกเว้น "needs review" ของตัวอักษรตกแต่งที่ stubs-and-fixtures อนุญาต)
- [ ] รายการ "ต้องยืนยัน" ที่ยืนยันได้โดยไม่ต้องมี credential ถูกยืนยันและบันทึกในเอกสารแล้ว (ยังไม่ครบ: subcommand ของ gitleaks ดึง image ในเครื่องพัฒนาไม่ได้, Firefox ไม่มีในเครื่องพัฒนา)

### 5.2 ตรวจไม่ได้หากไม่มี credential จริง (เจ้าของงานทำ)

| เรื่อง | เหตุผล | ทำด้วย |
| --- | --- | --- |
| การรับและส่งข้อความกับ LINE จริง รวม reply token, retry key, loading, โปรไฟล์ สติกเกอร์ และสื่อ | stub เลียนแบบเฉพาะรูปแบบที่สมมติ | [manual-test-script](../qa/manual-test-script.md) ข้อ 2 ถึง 4 |
| คุณภาพคำตอบและต้นทุนจริงของ Claude, prompt caching, การสลับโมเดลสำรอง, การแปลง PDF จริง, คุณภาพและเวลาของการคัดกรองขอบเขตหัวข้อ และตัวชี้วัดของ guardrail | ต้องใช้ `ANTHROPIC_API_KEY` และเสียเงิน | [manual-test-script](../qa/manual-test-script.md) ข้อ 5 ถึง 7 และ 9 และ `pnpm ai:eval -- --confirm` เมื่อเจ้าของงานสั่ง |
| การอัปโหลดผ่าน Vercel Blob และ URL สาธารณะของ Blob | ต้องใช้ Blob store จริง | manual-test-script ข้อ 3.3 ถึง 3.4 |
| Deploy บน Vercel, `maxDuration`, region, Deploy Hook และ CSP บน production | ต้องใช้บัญชี Vercel | [deploy](../runbooks/deploy.md) หัวข้อตรวจหลัง deploy |
| การแปลง HEIC จากรูปของ iPhone จริง | fixture เป็นไฟล์สังเคราะห์ | manual-test-script ข้อ 3.3a |
