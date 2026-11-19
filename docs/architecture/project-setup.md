# การตั้งโปรเจกต์

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

เอกสารนี้กำหนดทุกไฟล์ config, dependency, โครงโฟลเดอร์, Docker, CI และค่าคงที่ของระบบ ให้สร้างโปรเจกต์ได้โดยไม่ต้องตัดสินใจเพิ่ม สิ่งที่ยังไม่ได้ตรวจกับเอกสารภายนอกเขียนกำกับว่า "ต้องยืนยัน" พร้อมสมมติฐานที่ใช้ และรวมไว้ในหัวข้อสุดท้าย

เอกสารที่เกี่ยวข้อง: [infrastructure](infrastructure.md) (สภาพแวดล้อมและ environment variable), [backend](backend.md) (port, use case, API), [frontend](frontend.md) (หน้าจอ), [data-model](data-model.md) (ตารางและ Prisma schema), [code-style](../guidelines/code-style.md) (กฎที่ lint บังคับ), [test-strategy](../qa/test-strategy.md)

Code block ในเอกสารนี้เป็นข้อกำหนดของไฟล์ ไม่ใช่ไฟล์จริง ผู้สร้างคัดลอกไปเป็นจุดเริ่มต้นได้ และส่วนที่เขียน `<...>` ให้แทนค่าตอน scaffold

## 1. Runtime

| เรื่อง | ค่า | หมายเหตุ |
| --- | --- | --- |
| Node เป้าหมาย | 24 LTS | Dockerfile ใช้ `node:24-alpine`, `.nvmrc` เป็น `24`, CI ใช้ Node 24 |
| `engines.node` | `>=22.12` | สภาพแวดล้อมพัฒนาบนคลาวด์ใช้ Node 22.23.5 ห้ามใช้ API ของ Node ที่มีเฉพาะใน 24 |
| Package manager | `pnpm@10.28.0` ใน `packageManager` | Docker ติดตั้งด้วย `npm install -g pnpm@10.28.0` และ CI ใช้ `pnpm/action-setup` ที่อ่าน `packageManager` |
| Docker image | `node:24-alpine`, `postgres:17-alpine` | ยืนยันแล้วว่าดึงได้ ดู [แผนการสร้าง](../plans/implementation-plan.md) |
| Module system | `"type": "module"` | ไฟล์ config เป็น `.ts` หรือ `.mjs` |

## 2. Dependency

ทุกรุ่นล็อกแบบตรงตัว (ไม่มี `^` หรือ `~`) การเพิ่มหรืออัปเกรดต้องถามเจ้าของงานก่อน ตาม `AGENTS.md` รายการที่เขียนว่า "รุ่นล่าสุดตอน scaffold" ให้ติดตั้งรุ่นล่าสุดที่เสถียร ณ วันที่สร้าง แล้วล็อกรุ่นนั้นตรงตัว

### dependencies

| Package | รุ่น | ใช้ทำอะไร |
| --- | --- | --- |
| `next` | 16.4.6 | framework |
| `react`, `react-dom` | 19.3.1 | UI |
| `@prisma/client` | 7.10.1 | runtime ของ client ที่ Prisma generate |
| `@prisma/adapter-pg` | 7.10.1 | driver adapter ของ Prisma ที่ต่อผ่าน `pg` |
| `pg` | 8.23.1 | driver ของ Postgres |
| `zod` | 4.6.7 | ตรวจข้อมูลทุกขอบของระบบ |
| `@tanstack/react-query` | 5.108.0 | ดึงข้อมูลและ polling ฝั่ง client |
| `lucide-react` | 1.75.0 | ไอคอน |
| `@anthropic-ai/sdk` | 1.10.0 | adapter ของ `ChatModel` และ `DocumentExtractor` |
| `@vercel/blob` | 2.9.0 | adapter ของ `FileStorage` ฝั่ง server และการอัปโหลดตรงจาก browser (`@vercel/blob/client`) |
| `uuid` | 14.x (รุ่นล่าสุดของ 14 ตอน scaffold) | UUIDv7 ใน adapter ของ `IdGenerator` และใน browser สำหรับ id ของข้อความขาออก |
| `server-only` | รุ่นล่าสุดตอน scaffold | ทำให้ build ล้มถ้าโค้ดฝั่ง server ถูก import จากฝั่ง client |
| `heic-to` | 1.6.7 | แปลง HEIC/HEIF เป็น JPEG ใน browser (LGPL-3.0) ใช้ build `heic-to/csp` และโหลดด้วย `import()` แบบ dynamic เฉพาะตอนแอดมินเลือกไฟล์ HEIC เท่านั้น ห้ามอยู่ใน bundle แรก ดู [ADR 0019](../adr/0019-heic-conversion-with-heic-to.md) และ [ui-screens](../specs/ui-screens.md#83-srcfeaturesinboxcomposerinboxmediats-ใช้-api-ของ-browser-ไม่ใช่ฟังก์ชันล้วน) |
| `sonner` | รุ่นล่าสุดตอน scaffold | toast (ใช้ผ่าน component `sonner` ของ shadcn) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | รุ่นล่าสุดตอน scaffold | ตัวช่วยของ shadcn/ui (`cn()`, variant) |
| Package ของ Radix ตามตารางถัดไป | รุ่นล่าสุดตอน scaffold | ส่วนประกอบของ shadcn/ui |

ฟอนต์ไม่ใช้แพ็กเกจ ไฟล์อยู่ใน repo ดูหัวข้อ 6.6 และ [ADR 0018](../adr/0018-use-line-seed-sans-th.md)

### devDependencies

| Package | รุ่น | ใช้ทำอะไร |
| --- | --- | --- |
| `typescript` | 5.9.x (รุ่นล่าสุดของ 5.9) | ไม่ใช้ 7 เพราะ `typescript-eslint` 8.73.0 รองรับ TypeScript ต่ำกว่า 6.1.0 |
| `@types/node` | รุ่นล่าสุดของ major 24 | type ของ Node |
| `@types/react`, `@types/react-dom` | รุ่นล่าสุดของ major 19 | type ของ React |
| `@types/pg` | รุ่นล่าสุดตอน scaffold | type ของ `pg` |
| `prisma` | 7.10.1 | CLI: generate, migrate |
| `eslint` | 10.15.0 | lint |
| `@eslint/js` | รุ่นที่ตรงกับ `eslint` | กฎพื้นฐาน `recommended` |
| `typescript-eslint` | 8.73.0 | parser และกฎที่ใช้ type |
| `eslint-config-next` | 16.4.6 | กฎของ Next.js, React, React Hooks, jsx-a11y |
| `eslint-plugin-boundaries` | 7.4.4 | บังคับทิศทางการ import ตาม code-style ข้อ 1 |
| `prettier` | 3.10.1 | จัดรูปแบบโค้ด |
| `prettier-plugin-tailwindcss` | รุ่นล่าสุดตอน scaffold | เรียง class ของ Tailwind |
| `tailwindcss` | 4.3.5 | CSS |
| `@tailwindcss/postcss` | 4.3.5 | plugin ของ PostCSS สำหรับ Tailwind 4 |
| `postcss` | รุ่นล่าสุดตอน scaffold | peer ของ `@tailwindcss/postcss` |
| `tw-animate-css` | รุ่นล่าสุดตอน scaffold | animation ที่ component ของ shadcn/ui ใช้กับ Tailwind 4 |
| `vitest` | 5.1.1 | unit test และ adapter test |
| `@vitest/coverage-v8` | 5.1.1 | coverage |
| `@playwright/test` | 1.63.0 (ตรงตัว) | E2E สภาพแวดล้อมพัฒนามี browser ของรุ่นนี้ติดตั้งไว้แล้ว ห้ามเลื่อนรุ่นโดยไม่ตรวจ |
| `@axe-core/playwright` | 4.14.0 | ตรวจการเข้าถึงใน E2E |
| `tsx` | รุ่นล่าสุดตอน scaffold | รัน `prisma/seed.ts` และ `scripts/*.ts` (stub รันด้วย `node` ตรง ตาม [stubs-and-fixtures](../qa/stubs-and-fixtures.md#1-กฎ)) |

### shadcn/ui

Component เขียนเองใน repo ตามแบบของ shadcn/ui (โครงเดียวกับ component ของ shadcn บน Radix, `cva` และ `cn()`) ไม่ได้ใช้ CLI ของ shadcn และไม่ได้ติดตั้งเป็น dependency ไฟล์อยู่ที่ `src/common/ui/` `components.json` ในหัวข้อ 6.11 มีไว้บอก path และ alias ตามแบบของ shadcn เท่านั้น

| Component | ไฟล์ | Package ที่ต้องใช้ |
| --- | --- | --- |
| button | `button.tsx` | `@radix-ui/react-slot` |
| input | `input.tsx` | ไม่มี |
| textarea | `textarea.tsx` | ไม่มี |
| switch | `switch.tsx` | `@radix-ui/react-switch` |
| dialog | `dialog.tsx` | `@radix-ui/react-dialog` |
| sonner (toast) | `sonner.tsx` | `sonner` |
| table | `table.tsx` | ไม่มี |
| skeleton | `skeleton.tsx` | ไม่มี |
| tooltip | `tooltip.tsx` | `@radix-ui/react-tooltip` |

- avatar และ dropdown-menu ไม่มีหน้าจอใดใช้ (`ContactAvatar` เป็น `<img>` เอง และไม่มีเมนูแบบ dropdown) จึงไม่มีไฟล์ใน `src/common/ui/` และไม่มี package ของสองตัวนี้ใน `package.json`
- ทุก package ของ Radix ใช้รุ่นล่าสุดตอน scaffold และเป็น `@radix-ui/react-*` แยกตัว ไม่ใช้ package รวม `radix-ui`
- `sonner.tsx` ไม่ import `next-themes` และตั้ง `theme="light"` ตายตัว เพราะระบบมีธีมสว่างอย่างเดียว ([ADR 0014](../adr/0014-ui-stack-and-theme.md)) และไม่ติดตั้ง `next-themes`
- ชื่อไฟล์ใน `src/common/ui/` เป็นตัวพิมพ์เล็กตามแบบของ shadcn ถือเป็นข้อยกเว้นของ code-style ข้อ 7

### Build script ของ dependency

pnpm 10 ไม่รัน install script ของ dependency โดยค่าเริ่มต้น ตอน scaffold ให้ดูรายการที่ pnpm แจ้งว่าถูกข้าม แล้วอนุญาตเฉพาะตัวที่จำเป็นใน `onlyBuiltDependencies` ของ `pnpm-workspace.yaml` (ต้องยืนยันรายการตอน scaffold) ไฟล์นั้นมีแค่การตั้งค่านี้ ไม่ใช่ monorepo

## 3. โครงโฟลเดอร์

ชื่อไฟล์เป็นไปตาม [code-style ข้อ 7](../guidelines/code-style.md) แต่ละชั้นของ `src/core/`, adapter แต่ละตัว, `src/adapters/fakes/`, `src/contracts/` และ `src/composition/` มี `index.ts` เป็นทางเข้าเดียว ชั้นอื่น import ผ่าน `index.ts` เท่านั้น (lint บังคับ ดูหัวข้อ 6.3) ภายในชั้นเดียวกัน import ไฟล์กันตรงได้ ส่วน `src/common/` และ `src/features/*/` ไม่มี `index.ts` (ไม่มี barrel) ผู้ใช้ import ไฟล์ที่ต้องการตรง เพราะ barrel ร่วมจะถูกแก้โดยทุก ticket ของหน้าจอและปน module ฝั่ง client กับฝั่ง server โฟลเดอร์ย่อยภายใน feature (เช่น `src/features/inbox/thread/`) เป็นส่วนของ element `feature` เดียวกัน จึง import กันตรงได้ และไม่มี `index.ts` เช่นกัน กฎการแบ่งโฟลเดอร์ย่อยอยู่ใน [code-style ข้อ 8](../guidelines/code-style.md#8-หน้าจอ-review-ยกเว้นที่ระบุ)

```
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── app/                                  ไฟล์ของ Next.js ทำหน้าที่แค่ import
│   ├── layout.tsx                        <html lang="th">, ฟอนต์, QueryProvider, Toaster
│   ├── globals.css                       Tailwind 4 และ token สี
│   ├── page.tsx                          redirect ไป /chats
│   ├── welcome/page.tsx                  หน้ายินดีต้อนรับ
│   ├── (app)/
│   │   ├── layout.tsx                    เมนูซ้าย
│   │   ├── chats/page.tsx
│   │   ├── chats/[contactId]/page.tsx
│   │   └── settings/page.tsx
│   └── api/                              หนึ่ง route.ts ต่อหนึ่ง path ใน api-contract.md
│       ├── line/webhook/route.ts                         POST
│       ├── health/route.ts                               GET
│       ├── access/unlock/route.ts                        POST
│       ├── access/lock/route.ts                          POST
│       ├── contacts/route.ts                             GET
│       ├── contacts/[id]/route.ts                        GET, PATCH
│       ├── contacts/[id]/read/route.ts                   POST
│       ├── contacts/[id]/typing/route.ts                 POST
│       ├── contacts/[id]/messages/route.ts               GET, POST
│       ├── contacts/[id]/messages/[messageId]/retry/route.ts   POST
│       ├── uploads/route.ts                              POST
│       ├── uploads/[uploadId]/route.ts                   DELETE
│       ├── local-storage/[...key]/route.ts               PUT, GET (ตอบ 404 เมื่อ FILE_STORAGE ไม่ใช่ local)
│       ├── settings/route.ts                             GET, PATCH
│       ├── settings/line-credentials/route.ts            PUT
│       ├── settings/line/test/route.ts                   POST
│       ├── settings/guard/test/route.ts                  POST
│       ├── knowledge/documents/route.ts                  GET, POST
│       ├── knowledge/documents/[id]/route.ts             GET, DELETE
│       ├── knowledge/documents/[id]/retry/route.ts       POST
│       ├── canned-replies/route.ts                       GET, POST
│       ├── canned-replies/[id]/route.ts                  PATCH, DELETE
│       ├── usage/route.ts                                GET
│       ├── usage/contacts/[id]/route.ts                  GET
│       ├── system/status/route.ts                        GET
│       └── system/guardrails/route.ts                    GET
├── src/
│   ├── core/                             รายชื่อไฟล์และ type อยู่ใน domain-and-ports.md
│   │   ├── domain/
│   │   │   ├── index.ts
│   │   │   ├── ids.ts  result.ts  error-codes.ts  constants.ts  <entity>.model.ts
│   │   │   ├── pricing.constants.ts      ตารางราคาพร้อมวันที่อ้างอิง (usage-cost.md)
│   │   │   ├── topic-guard.model.ts      TopicVerdict, TopicGuardResponse (domain-and-ports.md#topicguard)
│   │   │   └── *.logic.ts + *.spec.ts    ฟังก์ชันล้วน
│   │   ├── ports/
│   │   │   ├── index.ts
│   │   │   └── <name>.port.ts            หนึ่งไฟล์ต่อ port ใน domain-and-ports.md
│   │   └── use-cases/
│   │       ├── index.ts
│   │       └── <action>.use-case.ts + .spec.ts   หนึ่งไฟล์ต่อ use case ใน use-cases.md
│   │                                             เช่น receive-line-events.use-case.ts, send-admin-message.use-case.ts
│   ├── adapters/
│   │   ├── line/            index.ts, line-messaging.adapter.ts, line.mapper.ts, line.constants.ts
│   │   ├── claude/          index.ts, claude-chat-model.adapter.ts, claude-document-extractor.adapter.ts,
│   │   │                    claude-topic-guard.adapter.ts, claude.constants.ts
│   │   ├── prisma/          index.ts, prisma-client.ts, <entity>.repository.ts, <entity>.mapper.ts,
│   │   │                    generated/ (ผลของ prisma generate ไม่อยู่ใน Git)
│   │   ├── blob/            index.ts, vercel-blob-storage.adapter.ts
│   │   ├── local-storage/   index.ts, local-file-storage.adapter.ts
│   │   ├── system/          index.ts, system-clock.adapter.ts, uuid-v7-id-generator.adapter.ts,
│   │   │                    json-logger.adapter.ts, aes-gcm-cipher.adapter.ts, hmac-access-token-signer.adapter.ts,
│   │   │                    sha256-content-hasher.adapter.ts
│   │   └── fakes/           index.ts, fake-<port>.ts หนึ่งไฟล์ต่อ port,
│   │                        suites/<port>.suite.ts ชุดทดสอบของ port ที่รันกับทั้งตัวปลอมและตัวจริง
│   ├── contracts/
│   │   ├── index.ts
│   │   └── <resource>.contract.ts        schema ของ request และ response เช่น messages.contract.ts
│   ├── composition/
│   │   ├── index.ts                      `import 'server-only'`; ส่งออก use case ที่ประกอบแล้ว, withRoute(), assertEnv()
│   │   ├── env.ts                        ที่เดียวที่อ่าน process.env ตรวจด้วย zod
│   │   ├── container.ts                  ประกอบ adapter จริงกับ use case แบบ lazy
│   │   └── route.ts                      ตัวห่อ route: request id, ตรวจ origin, ดัก error, แปลงเป็น response
│   ├── features/
│   │   ├── access/    access.api.ts, access.logic.ts, access.constants.ts, WelcomePage.tsx (ไม่มี index.ts)
│   │   ├── inbox/     inbox.api.ts, inbox.logic.ts, inbox.constants.ts, inbox.hooks.ts, InboxPage.tsx, ...
│   │   │   ├── list/      รายชื่อลูกค้า: ContactList.tsx, inbox.list.logic.ts, ...
│   │   │   ├── thread/    ห้องแชทและแผงข้อมูล: Thread.tsx, inbox.thread.logic.ts, inbox.thread.hooks.ts, ...
│   │   │   └── composer/  ช่องตอบและไฟล์แนบ: Composer.tsx, inbox.attachment.logic.ts, inbox.composer.hooks.ts, ...
│   │   └── settings/  settings.api.ts, settings.logic.ts, settings.constants.ts, SettingsPage.tsx,
│   │                  settings.guard.{api,logic,hooks}.ts, ... (ชั้นเดียว)
│   └── common/                           ไม่มี index.ts ไฟล์อื่นของหน้าจอดู ui-screens.md
│       ├── common.api.ts                 apiFetch() ที่เดียวใน common ที่เรียก fetch
│       ├── common.logic.ts               มี cn() ของ shadcn/ui
│       ├── ui/                           component แบบ shadcn/ui ที่เขียนเอง (หัวข้อ 2)
│       ├── fonts/
│       │   ├── fonts.ts                  เรียก next/font/local (หัวข้อ 6.6)
│       │   └── line-seed-sans-th/
│       │       ├── LINESeedSansTH_W_Th.woff2   Thin 100
│       │       ├── LINESeedSansTH_W_Rg.woff2   Regular 400
│       │       ├── LINESeedSansTH_W_Bd.woff2   Bold 700
│       │       └── OFL.txt
│       └── providers/QueryProvider.tsx
├── prisma/
│   ├── schema.prisma                     ดู data-model.md
│   ├── migrations/                       ผลของ prisma migrate อยู่ใน Git
│   ├── seed.ts                           ข้อมูลตัวอย่างปลอม ดู data-model.md
│   └── seed-assets/                      รูปตัวอย่างที่ seed คัดลอกเข้าที่เก็บไฟล์
├── stubs/
│   ├── server.ts                         stub ของ LINE และ Claude (พฤติกรรมอยู่ใน stubs-and-fixtures.md)
│   └── assets/                           ไฟล์ที่ stub ส่งคืน คัดลอกจาก e2e/fixtures/media
├── e2e/
│   ├── global.setup.ts                   reset stub และเข้าระบบครั้งเดียวแล้วเก็บ storage state
│   ├── fixtures/                         line/ (payload ของทุกชนิด event, credentials.ts), media/, kb/ ใช้ร่วมกันทุกชั้นทดสอบ
│   ├── helpers/                          เซ็น webhook, สั่งและอ่าน stub
│   ├── <journey>.spec.ts                 เส้นที่ใช้ลูกค้าของตัวเอง รันขนานได้
│   └── global-state.serial.spec.ts       เส้นที่แตะค่ารวมของระบบ (3, 4, 6, 9) รันทีละเส้น
├── test-support/
│   ├── server-only.ts                    module ว่าง ใช้แทน server-only ใน Vitest
│   └── adapters.global-setup.ts          สร้างฐานข้อมูลทดสอบและรัน migration
├── scripts/
│   ├── ai-eval.ts                        ชุดคำถามวัดคุณภาพ AI (รันด้วยมือเท่านั้น)
│   └── generate-fixtures.sh              สร้างไฟล์สื่อและ PDF ทดสอบครั้งเดียว (stubs-and-fixtures.md ข้อ 8)
├── docker/
│   └── entrypoint.sh
├── public/
│   └── robots.txt                        Disallow ทั้งหมด
├── .dockerignore  .env.example  .gitignore  .nvmrc  .prettierignore
├── components.json  docker-compose.yml  Dockerfile
├── eslint.config.mjs  instrumentation.ts  next.config.ts  package.json  pnpm-lock.yaml  pnpm-workspace.yaml
├── playwright.config.ts  postcss.config.mjs  prettier.config.mjs  prisma.config.ts  proxy.ts
├── tsconfig.json  vercel.json  vitest.config.ts
└── AGENTS.md  CLAUDE.md  LICENSE  README.md  docs/
```

Path ของหน้าเว็บ (`/welcome`, `/chats`, `/chats/[contactId]`, `/settings`) เป็นการตัดสินใจของเอกสารนี้ เพราะ [frontend](frontend.md) กำหนดแค่ว่า URL บอกว่าเปิดแชทของใคร

## 4. Next.js 16

| เรื่อง | ข้อกำหนด |
| --- | --- |
| ด่านตรวจ cookie | อยู่ใน `proxy.ts` ที่ระดับบนของ repo ซึ่งเป็นชื่อใหม่ของ middleware ใน Next.js 16 (ต้องยืนยันชื่อไฟล์และชื่อฟังก์ชันที่ export ตอน scaffold) |
| Route segment config | ทุก `route.ts` export `runtime = 'nodejs'` และ `dynamic = 'force-dynamic'` ทุก `page.tsx` export `dynamic = 'force-dynamic'` |
| `cacheComponents` | ไม่เปิด เพราะเมื่อเปิด Next.js 16 ไม่รับ `export const dynamic` (ต้องยืนยัน) |
| งานหลังตอบ | `after()` จาก `next/server` ห่อด้วยตัวดัก error กลางใน `src/composition/route.ts` |
| `maxDuration` | `app/api/line/webhook/route.ts` export ค่าของ `WEBHOOK_MAX_DURATION_S` และ `app/api/knowledge/documents/route.ts` กับ `app/api/knowledge/documents/[id]/retry/route.ts` export ค่าของ `KNOWLEDGE_MAX_DURATION_S` (หัวข้อ 10) เขียนเป็น literal ในไฟล์ route เพราะ Next.js อ่านค่านี้แบบ static พร้อม comment ชื่อ constant ค่าของ PDF ต้องยืนยันกับเพดานของ Vercel ([แผนการสร้าง](../plans/implementation-plan.md)) ถ้าเพดานต่ำกว่า ให้ลด `PDF_MAX_PAGES` และ `CLAUDE_EXTRACT_TIMEOUT_MS` ให้รวมกันไม่เกิน |
| ตรวจ environment variable | `instrumentation.ts` export `register()` ที่เรียก `assertEnv()` จาก composition เมื่อ `process.env.NEXT_RUNTIME === 'nodejs'` และไม่อยู่ในช่วง build (`process.env.NEXT_PHASE !== 'phase-production-build'`) ขาดตัวไหน process ล้มพร้อมบอกชื่อ ตาม [infrastructure](infrastructure.md) |
| Lint | Next.js 16 ไม่มี `next lint` และ `next build` ไม่รัน lint จึงรัน `eslint` ตรง |
| รูป | ใช้ `<img>` ธรรมดา ไม่ใช้ `next/image` จึงไม่มี config ของ image optimization |

### proxy.ts

ทำงานตามลำดับ:

1. Path ที่ยกเว้นการตรวจ cookie ตาม [access-gate](../specs/access-gate.md) ข้อ 6 (`POST /api/line/webhook`, `GET /api/health`, `POST /api/access/unlock`, `GET`/`HEAD /api/local-storage/*key`) และ `/welcome` ผ่านไปเลย
2. คำขอ `/api/*` ที่ไม่ใช่ GET หรือ HEAD และไม่ใช่ webhook ต้องมี header `Origin` ตรงกับ `APP_BASE_URL` ไม่เช่นนั้นตอบ 403 ตามรูปแบบ error ใน [backend](backend.md)
3. ตรวจ cookie ผ่าน `AccessTokenSigner` ที่ได้จาก `src/composition` ไม่ผ่าน: `/api/*` ตอบ 401, หน้าเว็บ rewrite ไป `/welcome` โดย URL เดิมไม่เปลี่ยน
4. หน้าเว็บ: สร้าง nonce ต่อคำขอ ใส่ header `Content-Security-Policy` ตามหัวข้อ 6.2 และส่ง nonce ผ่าน request header `x-nonce`

`config.matcher` ครอบทุก path ยกเว้น `/_next/static`, `/_next/image`, `/favicon.ico`, `/robots.txt`

## 5. package.json

```json
{
  "name": "testing-webchat",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.28.0",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run --project unit",
    "test:adapters": "vitest run --project adapters",
    "test:coverage": "vitest run --project unit --coverage",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx --conditions=react-server prisma/seed.ts",
    "stubs": "node stubs/server.ts",
    "ai:eval": "tsx scripts/ai-eval.ts",
    "vercel-build": "if [ \"$VERCEL_ENV\" = \"production\" ]; then prisma migrate deploy; fi && prisma generate && next build",
    "postinstall": "prisma generate"
  }
}
```

| Script | หมายเหตุ |
| --- | --- |
| `dev` | Turbopack เป็นค่าเริ่มต้นของ Next.js 16 ต้องมี Postgres และ stub ที่รันจาก compose (`docker compose up -d db stub`) กับ `.env` ที่คัดลอกจาก `.env.example` |
| `start` | ใช้ตรวจ build ในเครื่องเท่านั้น Docker รัน `node server.js` ของ standalone เอง Next.js อาจเตือนว่า `next start` ไม่เหมาะกับ standalone (ต้องยืนยัน) |
| `typecheck` | `next typegen` สร้าง type ของ route ใน `.next/types` ก่อน (ต้องยืนยันว่ามีใน 16.4) |
| `test`, `test:coverage` | ไม่ต้องใช้ Docker |
| `test:adapters` | ต้องมี `db` และ `stub` จาก compose ตัวกรองที่ส่งผ่าน `pnpm test:adapters -- <path>` ไม่กรองไฟล์ (รันทั้งชุด) รันเฉพาะบางไฟล์ด้วย `pnpm exec vitest run --project adapters <path...>` ชุด `unit` ก็เช่นกัน: `pnpm exec vitest run --project unit <path...>` ฐานข้อมูลและ stub ส่วนตัวเมื่อหลายคนรันพร้อมกันบนเครื่องเดียว ดูหัวข้อ 6.7 |
| `test:e2e` | ต้องมีทั้ง compose และ seed ดูหัวข้อ 7 รันด้วย `pnpm test:e2e` (ส่ง option ของ Playwright ต่อท้ายได้ เช่น `--trace on`) |
| `db:seed` | `--conditions=react-server` ให้ `import 'server-only'` ใน `index.ts` ของ adapter (หัวข้อ 6.3) เป็น module ว่างเหมือนตอนรันใน server ของ Next.js ใต้ Node ธรรมดา package นี้ throw ทันที service `seed` ของ compose ตั้ง `NODE_OPTIONS` เป็นค่าเดียวกันด้วย (หัวข้อ 7.3) |
| `db:migrate` | ใช้สร้าง migration ใหม่ในเครื่อง dev เท่านั้น migration ที่ลบหรือเปลี่ยนชนิดคอลัมน์ต้องถามก่อน ตาม `AGENTS.md` เมื่อไม่มี TTY (เช่น agent หรือ CI) สร้างไฟล์โดยไม่ apply ด้วย `pnpm exec prisma migrate dev --create-only --name <name> </dev/null` **คำเตือน:** ทุก migration ที่ Prisma สร้างมีคำสั่ง `DROP SEQUENCE "change_seq"` (พร้อม `SET`/`DROP DEFAULT` ของ `"Message"."seq"`) ที่ไม่ควรมี เพราะ Prisma อ่านค่าเริ่มต้น `nextval` แบบ `dbgenerated` ของ migration `init` ไม่ได้ ต้องลบคำสั่งเหล่านั้นด้วยมือก่อน apply ไม่เช่นนั้น polling ใช้ไม่ได้ (ดู comment บนสุดของ `prisma/migrations/*_topic_guard/migration.sql` และ [data-model](data-model.md#migration-ที่สอง-ขอบเขตหัวข้อ)) |
| `ai:eval` | เรียก Claude จริงและเสียเงิน สคริปต์ปฏิเสธการทำงานถ้าไม่ได้ส่ง `--confirm` (`pnpm ai:eval -- --confirm`) ไม่อยู่ใน CI และ agent ไม่รันเอง ดู [test-strategy](../qa/test-strategy.md) |
| `vercel-build` | หัวข้อ 9 |
| `postinstall` | สร้าง client ของ Prisma หลังติดตั้ง Docker ข้ามด้วย `--ignore-scripts` แล้วสั่ง `db:generate` เอง |

## 6. ไฟล์ config

### 6.1 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowJs": false,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules", ".next/standalone"]
}
```

`next dev` อาจแก้ไฟล์นี้เองครั้งแรก ให้คงค่าข้างบนไว้ และยอมรับเฉพาะการเพิ่ม `include` ของ Next.js

### 6.2 next.config.ts

| ค่า | ตั้งเป็น |
| --- | --- |
| `output` | `'standalone'` |
| `reactStrictMode` | `true` |
| `poweredByHeader` | `false` |
| `headers()` | ทุก path (`/:path*`) ได้ header ในตารางถัดไป |
| `images` | ไม่ตั้ง |

Header คงที่ที่มาจาก [threat-model](../security/threat-model.md):

| Header | ค่า | ภัยที่รับมือ |
| --- | --- | --- |
| `X-Frame-Options` | `DENY` | หน้าเว็บถูกฝังใน iframe |
| `X-Robots-Tag` | `noindex, nofollow` | search engine เก็บหน้า |
| `X-Content-Type-Options` | `nosniff` | ไฟล์ปลอมชนิด |
| `Referrer-Policy` | `same-origin` | ห้ามใช้ `no-referrer` เพราะ browser จะส่ง `Origin: null` กับ POST ทำให้การตรวจต้นทางล้ม |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ปิดสิทธิ์ที่ไม่ใช้ |

`Content-Security-Policy` ตั้งใน `proxy.ts` เพราะต้องใช้ nonce ต่อคำขอ ค่าคือ:

```
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://profile.line-scdn.net https://stickershop.line-scdn.net https://*.public.blob.vercel-storage.com;
media-src 'self' blob: https://*.public.blob.vercel-storage.com;
font-src 'self';
connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

- ตอน `next dev` เพิ่ม `'unsafe-eval'` ใน `script-src` เพราะ React โหมด dev ใช้ eval
- Host ของรูปโปรไฟล์และสติกเกอร์ของ LINE และ host ที่ `@vercel/blob/client` ใช้อัปโหลดเป็นสมมติฐาน (ต้องยืนยันตอน scaffold จาก request จริงใน DevTools)
- `style-src 'unsafe-inline'` จำเป็นเพราะ Next.js และ sonner ใส่ style แบบ inline
- `heic-to` ใช้ build `heic-to/csp` ซึ่งไม่มี WebAssembly และไม่ใช้ eval จึงไม่ต้องมี `'unsafe-eval'` หรือ `'wasm-unsafe-eval'` ตัวแปลงรันใน Worker ที่สร้างจาก URL `blob:` ซึ่ง Chromium อนุญาตผ่าน `script-src` ที่มี `'strict-dynamic'` โดยไม่ต้องมี `worker-src` (ยืนยันแล้วใน Chromium: E2E เส้นที่ 5 แปลง `tiny.heic` ใต้ CSP นี้ และ test ตกเมื่อมี CSP violation) ยังไม่ได้ยืนยันใน Firefox ถ้า Firefox บล็อก Worker ให้เพิ่ม `worker-src 'self' blob:`

### 6.3 eslint.config.mjs

Flat config ประกอบตามลำดับ:

1. `ignores`: `.next/`, `coverage/`, `playwright-report/`, `test-results/`, `src/adapters/prisma/generated/`, `prisma/migrations/`, `next-env.d.ts`
2. `@eslint/js` แบบ `recommended`
3. `typescript-eslint` แบบ `strictTypeChecked` พร้อม `parserOptions.projectService: true`
4. `eslint-config-next` แบบ core-web-vitals และ typescript (ต้องยืนยันชื่อ export ของ flat config และความเข้ากันได้กับ ESLint 10 ตอน scaffold ถ้า plugin ใดไม่รองรับ ESLint 10 ให้หยุดและถามเจ้าของงาน ห้ามถอยรุ่นเอง)
5. `eslint-plugin-boundaries` ตามหัวข้อย่อยถัดไป
6. กฎเฉพาะของโปรเจกต์ ตามตารางท้ายหัวข้อ

#### ชนิดของ element

| Type | Pattern | Capture |
| --- | --- | --- |
| `domain` | `src/core/domain/**` | |
| `ports` | `src/core/ports/**` | |
| `use-cases` | `src/core/use-cases/**` | |
| `adapter` | `src/adapters/{line,claude,prisma,blob,local-storage,system}/**` | `adapterName` |
| `fakes` | `src/adapters/fakes/**` | |
| `contracts` | `src/contracts/**` | |
| `composition` | `src/composition/**` | |
| `feature` | `src/features/*/**` | `featureName` |
| `common` | `src/common/**` | |
| `app-api` | `app/api/**` | |
| `app-page` | `app/**` ที่ไม่ใช่ `app/api/**` | |
| `edge` | `proxy.ts`, `instrumentation.ts` | |
| `fixtures` | `e2e/fixtures/**`, `e2e/helpers/line-webhook.ts` | |
| `tooling` | `prisma/**`, `stubs/**`, `scripts/**`, `e2e/**` ที่ไม่ใช่ `fixtures`, `test-support/**` | |
| `config` | ไฟล์ `*.config.*` ที่ระดับบน | |

ใน `eslint.config.mjs` element แต่ละชนิดประกาศเป็นโฟลเดอร์ที่ยึดจากระดับบนของ repo (`partialMatch: false`) การ import ภายใน element เดียวกัน (ชั้นเดียว, adapter ตัวเดียว, feature เดียว) จึงไม่ถูกตรวจ `test-support` เป็น element ชนิดของตัวเองที่ได้สิทธิ์เดียวกับ `tooling` ส่วน `edge`, `fixtures` และไฟล์ `*.spec.ts` เป็นหมวดของไฟล์ (`boundaries/files`) ไม่ใช่ element เพราะ eslint-plugin-boundaries 7.x ประกาศไฟล์เดี่ยวเป็น element ไม่ได้

#### ตารางการ import ที่อนุญาต

ค่าเริ่มต้นคือห้าม (`default: 'disallow'`) ข้ามชั้นต้อง import ผ่าน `index.ts` ของชั้นปลายทาง ยกเว้น `test-support`, `fixtures`, `common` และ `feature` ซึ่งไม่มี `index.ts` และ import ไฟล์ตรง

| จาก | import ได้ |
| --- | --- |
| `domain` | `domain` |
| `ports` | `domain`, `ports` |
| `use-cases` | `domain`, `ports` |
| `adapter` | `domain`, `ports`, `adapter` ที่ `adapterName` เดียวกัน |
| `fakes` | `domain`, `ports`, `fakes` |
| `contracts` | `contracts`, `domain` |
| `composition` | `composition`, `domain`, `ports`, `use-cases`, `adapter`, `contracts` |
| `feature` | `feature` ที่ `featureName` เดียวกัน, `contracts`, `common` |
| `common` | `common`, `contracts` |
| `app-api` | `composition`, `contracts` |
| `app-page` | `feature`, `common` |
| `edge` | `composition` |
| `tooling` | `domain`, `ports`, `adapter`, `fakes`, `contracts`, `composition`, `fixtures`, `common` (เฉพาะ `src/common/test-ids.ts`), `tooling` |
| `config` | ไม่จำกัด |
| ไฟล์ `*.spec.ts` | สิทธิ์ของชั้นตัวเอง บวก `fakes`, `test-support`, `fixtures` |
| `fixtures` | `domain`, `fixtures` |

เหตุผลของสองช่องที่ไม่ตรงไปตรงมา:

- `contracts → domain`: ค่าคงที่และ literal ของ domain (เช่น ชนิดข้อความ, เพดานขนาดไฟล์) ใช้ร่วมกับหน้าเว็บได้โดยมีที่อยู่ที่เดียว domain ไม่มี dependency จึงปลอดภัยใน bundle ของ browser
- `app-api → composition`: route handler ได้ use case ที่ประกอบแล้วจาก `src/composition/index.ts` ซึ่ง export เฉพาะ use case และตัวห่อ route ไม่ export repository หรือ adapter จึงเป็นไปตามกฎ "route handler เรียก use case เท่านั้น"

ใน eslint-plugin-boundaries 7.4.4 กฎ `element-types` และ `entry-point` เลิกใช้แล้ว ตารางข้างบนและกฎ "ผ่าน `index.ts` เท่านั้น" จึงเขียนเป็น policy ของกฎเดียวคือ `boundaries/dependencies` โครงของการตั้งค่า (ไฟล์จริงคือ `eslint.config.mjs`):

```js
settings: {
  'boundaries/include': ['app/**', 'src/**', 'prisma/**', 'stubs/**', 'scripts/**', 'e2e/**', 'test-support/**', 'proxy.ts', 'instrumentation.ts'],
  'boundaries/elements': [
    { type: 'domain', pattern: 'src/core/domain', partialMatch: false },
    { type: 'adapter', pattern: 'src/adapters/{line,claude,prisma,blob,local-storage,system}', partialMatch: false, capture: ['adapterName'] },
    { type: 'feature', pattern: 'src/features/*', partialMatch: false, capture: ['featureName'] },
    // ... ชนิดอื่นตามตาราง
  ],
  'boundaries/files': [
    { pattern: '**/*.spec.ts', category: 'spec' },
    { pattern: '{proxy,instrumentation}.ts', category: 'edge' },
    { pattern: 'e2e/fixtures/**', category: 'fixtures' },
    { pattern: 'e2e/helpers/line-webhook.ts', category: 'fixtures' },
  ],
  'boundaries/legacy-templates': false,
},
rules: {
  'boundaries/no-unknown-files': 'error',
  'boundaries/dependencies': ['error', {
    default: 'disallow',
    policies: [
      // ปลายทางที่ต้องผ่าน index.ts: { to: { element: { type, fileInternalPath: 'index.ts' } } }
      { from: { element: { type: 'ports' } }, allow: [{ to: { element: { type: 'domain', fileInternalPath: 'index.ts' } } }] },
      // common และ feature ไม่มี index.ts: ปลายทางเป็นไฟล์ใดก็ได้ของ element นั้น
      { from: { element: { type: 'feature' } }, allow: [/* contracts ผ่าน index.ts */ { to: { element: { type: 'common' } } }] },
      // ... ตามตาราง
    ],
  }],
}
```

#### Package ภายนอกที่ห้ามต่อชั้น

ใช้ `no-restricted-imports` แยกตาม `files`

| ไฟล์ | ห้าม import |
| --- | --- |
| `src/core/**` | `next`, `next/*`, `react`, `react-dom`, `@prisma/*`, `prisma`, `pg`, `zod`, `@anthropic-ai/*`, `@vercel/*`, `uuid`, `server-only`, `node:*` และชื่อ builtin ของ Node แบบไม่มี `node:` |
| `src/contracts/**` ยกเว้น `src/contracts/**/*.spec.ts` | ทุก package ยกเว้น `zod` (ไฟล์ spec ได้รับยกเว้นเพราะต้อง import `vitest`) |
| `src/features/**`, `src/common/**`, `app/**` ที่ไม่ใช่ `app/api/**` | `@prisma/*`, `pg`, `@anthropic-ai/*`, `@vercel/blob` (ยกเว้น `@vercel/blob/client` ในไฟล์ `*.api.ts` ของ `src/features/**` และ `src/common/**`), `server-only`, `node:*` |
| ทุกไฟล์ | `node:process` ที่ดึง `env` |
| ทุกไฟล์ | import แบบ static ของ `heic-to` และ `heic-to/*` (ใช้ได้เฉพาะ `import('heic-to/csp')` แบบ dynamic ใน `src/features/inbox/composer/inbox.media.ts` ซึ่งกฎนี้ไม่ตรวจ) |

ไฟล์ที่เป็นทางเข้าของฝั่ง server (`src/composition/index.ts`, `src/composition/env.ts` และ `index.ts` ของ adapter ทุกตัวยกเว้น `fakes`) บรรทัดแรกเป็น `import 'server-only'` (review)

#### กฎเฉพาะ

| กฎ | ค่า | ขอบเขต | ที่มาใน code-style |
| --- | --- | --- | --- |
| `@typescript-eslint/no-floating-promises` | error | ทั้งหมด | ข้อ 6 |
| `@typescript-eslint/no-misused-promises` | error | ทั้งหมด | ข้อ 6 |
| `@typescript-eslint/switch-exhaustiveness-check` | error, `{ considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true }` (ต้องยืนยันชื่อ option กับ 8.73.0) | ทั้งหมด | ข้อ 4 |
| `@typescript-eslint/no-explicit-any` | error | ทั้งหมด | ข้อ 4 |
| `@typescript-eslint/no-non-null-assertion` | error | ทั้งหมด | ข้อ 4 |
| `@typescript-eslint/consistent-type-imports` | error | ทั้งหมด | |
| `no-console` | error | ทั้งหมด ยกเว้น `tooling` และ `config` | ข้อ 6 (adapter ของ `Logger` เขียน `process.stdout` ตรง) |
| `no-restricted-syntax`: `CallExpression[callee.object.name='Date'][callee.property.name='now']` | error | `src/core/**` | ข้อ 3 |
| `no-restricted-syntax`: `NewExpression[callee.name='Date'][arguments.length=0]` | error | `src/core/**` | ข้อ 3 |
| `no-restricted-syntax`: `CallExpression[callee.object.name='Math'][callee.property.name='random']` | error | `src/core/**` | ข้อ 3 |
| `no-restricted-syntax`: `MemberExpression[property.name='randomUUID']` | error | `src/core/**` | ข้อ 3 |
| `no-restricted-properties`: `{ object: 'process', property: 'env' }` | error | ทั้งหมด ยกเว้น `src/composition/env.ts`, `tooling`, `config`, `instrumentation.ts` | ข้อ 1 |
| `no-restricted-syntax`: `Identifier[name=/^NEXT_PUBLIC_/]` และ `Literal[value=/^NEXT_PUBLIC_/]` | error | ทั้งหมด | ข้อ 8 |
| `no-restricted-globals`: `fetch` และ `no-restricted-properties`: `{ object: 'window', property: 'fetch' }` | error | `src/features/**`, `src/common/**`, `app/**` ที่ไม่ใช่ `app/api/**` ยกเว้นไฟล์ `src/features/**/*.api.ts` และ `src/common/**/*.api.ts` (เฉพาะไฟล์ `*.api.ts` เรียก `fetch` ได้ ใน `src/common/` คือ `common.api.ts` ที่มี `apiFetch`) | ข้อ 8 |
| `react/no-danger` | error | ทั้งหมด | ข้อ 8 |
| `no-restricted-properties`: `{ property: 'innerHTML' }`, `{ property: 'outerHTML' }` | error | ทั้งหมด | ข้อ 8 |

### 6.4 prettier.config.mjs

```js
export default {
  printWidth: 100,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './app/globals.css',
  tailwindFunctions: ['cn', 'cva'],
};
```

`.prettierignore`: `pnpm-lock.yaml`, `.next/`, `coverage/`, `playwright-report/`, `test-results/`, `src/adapters/prisma/generated/`, `prisma/migrations/`, `**/*.md` (เอกสารภาษาไทยไม่ผ่าน Prettier เพื่อไม่ให้ตารางถูกจัดใหม่ทั้งไฟล์)

### 6.5 PostCSS และ Tailwind 4

- `postcss.config.mjs`: `export default { plugins: { '@tailwindcss/postcss': {} } }`
- Tailwind 4 ไม่มี `tailwind.config.*` ค่าทั้งหมดอยู่ใน `app/globals.css`:
  1. `@import 'tailwindcss';`
  2. `@import 'tw-animate-css';`
  3. `@theme` ประกาศ token สีทั้งหมดในตาราง "สี" ของ [frontend](frontend.md) เป็น `--color-<token>` เช่น `--color-accent-strong` ค่าสีอยู่ที่ frontend.md ที่เดียว ไฟล์ CSS เป็นที่เดียวในโค้ด
  4. ไม่ประกาศ `--font-sans` ใน `@theme` ดูหัวข้อ 6.6
- shadcn/ui ใช้ตัวแปรสีของตัวเอง (`--primary`, `--background` ฯลฯ) ให้ map ไปที่ token ของ frontend.md แทนการใช้ชุดสีของ shadcn

### 6.6 ฟอนต์

`src/common/fonts/fonts.ts` เรียก `next/font/local` ครั้งเดียวและ export ผลลัพธ์ `app/layout.tsx` ใส่ `className={lineSeedSansTh.variable}` ที่ `<html>`

```ts
import localFont from 'next/font/local';

export const lineSeedSansTh = localFont({
  src: [
    { path: './line-seed-sans-th/LINESeedSansTH_W_Th.woff2', weight: '100', style: 'normal' },
    { path: './line-seed-sans-th/LINESeedSansTH_W_Rg.woff2', weight: '400', style: 'normal' },
    { path: './line-seed-sans-th/LINESeedSansTH_W_Bd.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['Sukhumvit Set', 'Thonburi', 'Leelawadee UI', 'Noto Sans Thai', 'Tahoma', 'sans-serif'],
});
```

- ตัวแปร CSS มีตัวเดียวคือ `--font-sans` utility `font-sans` และ font เริ่มต้นของ Tailwind อ่านจากตัวแปรนี้
- ไม่ประกาศ `--font-sans` ซ้ำใน `@theme` เพราะค่าเริ่มต้นของ Tailwind อยู่ใน `@layer theme` และ rule ของ `next/font` ซึ่งอยู่นอก layer จะชนะ (ต้องยืนยันตอน scaffold ด้วย computed style ของ `<body>`)
- Thin (100) ใช้เฉพาะตัวอักษรตกแต่งขนาด 16px ขึ้นไป ตาม [frontend](frontend.md)
- `OFL.txt` อยู่ข้างไฟล์ฟอนต์เสมอ ตาม [ADR 0018](../adr/0018-use-line-seed-sans-th.md)

### 6.7 vitest.config.ts

ไฟล์เดียว ใช้ `test.projects` แยกสองชุด

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const realAdapters = 'src/adapters/{line,claude,prisma,blob,local-storage}/**/*.spec.ts';

export default defineConfig({
  resolve: {
    alias: { '@': r('./src'), 'server-only': r('./test-support/server-only.ts') },
  },
  test: {
    env: { TZ: 'UTC' },
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts', 'e2e/**/*.unit.ts'],
          exclude: [realAdapters],
        },
      },
      {
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: [realAdapters],
          globalSetup: ['test-support/adapters.global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
```

- Coverage บังคับ 90% เฉพาะ `src/core/**` และวัดจากชุด `unit` ตาม [test-strategy](../qa/test-strategy.md)
- ชุด `adapters` ต่อ Postgres ที่ `postgresql://webchat:webchat@localhost:15432/webchat_test` และ stub ที่ `http://localhost:4010` ค่าเหล่านี้เป็นค่าคงที่ใน `test-support/adapters.constants.ts` ไม่ใช่ environment variable ของแอป
- ฐานข้อมูลและ stub ส่วนตัว: หลายคน (หรือหลาย agent) รันชุด `adapters` พร้อมกันบนเครื่องเดียวได้โดยไม่ล้างตารางหรือ reset stub ของกันและกัน ด้วยตัวแปรของ test สองตัวที่ `test-support/adapters.constants.ts` อ่าน: `ADAPTER_TEST_DATABASE_NAME` (ชื่อฐานข้อมูลบน Postgres ตัวเดิม ต้องตรง `^[a-z0-9_]+$` ไม่เช่นนั้นใช้ `webchat_test`) และ `ADAPTER_TEST_STUB_URL` (URL ของ stub อีกตัวที่รันเองด้วย port อื่น เช่น `STUB_PORT=4011 node stubs/server.ts` ค่าว่างหรือไม่ตั้งใช้ `http://localhost:4010`) ตัวอย่าง: `ADAPTER_TEST_DATABASE_NAME=webchat_test_alice ADAPTER_TEST_STUB_URL=http://localhost:4011 pnpm exec vitest run --project adapters <path...>` ทั้งสองตัวไม่ใช่ environment variable ของแอปและไม่อยู่ใน `.env.example`
- `adapters.global-setup.ts` สร้างฐานข้อมูลตาม `ADAPTER_TEST_DATABASE_NAME` (ค่าเริ่มต้น `webchat_test`) ถ้ายังไม่มี แล้วรัน `prisma migrate deploy` กับฐานนั้น แต่ละไฟล์ test ล้างตารางที่ตัวเองใช้ด้วย `TRUNCATE ... CASCADE` ใน `beforeEach` ชุดนี้จึงรันทีละไฟล์
- ชุด `unit` รวม `e2e/**/*.unit.ts` (unit test ของ helper ใน `e2e/helpers/` เช่น `line-webhook.unit.ts`) ซึ่ง Playwright ไม่เก็บเพราะไม่ลงท้ายด้วย `.spec.ts`
- Adapter ของ `system` และตัวปลอมทดสอบในชุด `unit` เพราะไม่ต้องใช้ Docker
- ชื่อ option `projects` และ `extends` เป็นของ Vitest 3.2 ขึ้นไป (ต้องยืนยันกับ 5.1.1)

### 6.8 playwright.config.ts

```ts
import { defineConfig } from '@playwright/test';

const AUTH = 'e2e/.auth/state.json';
const desktop = { viewport: { width: 1280, height: 800 } };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    { name: 'desktop', use: { ...desktop, storageState: AUTH }, dependencies: ['setup'], testIgnore: /(global\.setup|\.serial\.spec)\.ts/ },
    { name: 'mobile', use: { ...mobile, storageState: AUTH }, dependencies: ['setup'], testIgnore: /(global\.setup|\.serial\.spec)\.ts/ },
    { name: 'serial-desktop', use: { ...desktop, storageState: AUTH }, dependencies: ['desktop', 'mobile'], testMatch: /\.serial\.spec\.ts/ },
    { name: 'serial-mobile', use: { ...mobile, storageState: AUTH }, dependencies: ['serial-desktop'], testMatch: /\.serial\.spec\.ts/ },
  ],
});
```

| เรื่อง | ข้อกำหนด |
| --- | --- |
| `webServer` | ไม่ใช้ เพราะแอปมาจาก Docker compose |
| Browser | Chromium อย่างเดียว ในสภาพแวดล้อมพัฒนามีของรุ่น 1.63.0 อยู่แล้ว ใน CI ติดตั้งด้วย `playwright install --with-deps chromium` |
| Trace | ปิดเป็นค่าเริ่มต้น เปิดเองเมื่อ debug ด้วย `pnpm test:e2e --trace on` |
| ขนาดจอ | 1280x800 และ 390x844 ตาม [test-strategy](../qa/test-strategy.md) |
| ขนาน | เส้นที่ใช้ลูกค้าของตัวเองรันขนานใน `desktop` และ `mobile` |
| ทีละตัว | เส้นที่แตะค่ารวมของระบบ (3 AI ตอบแทน, 4 kill switch, 6 คลังความรู้, 9 ขอบเขตหัวข้อ) อยู่ในไฟล์ `e2e/global-state.serial.spec.ts` ไฟล์เดียว ใช้ `test.describe.configure({ mode: 'serial' })` รันใน `serial-desktop` แล้ว `serial-mobile` หลัง `desktop` กับ `mobile` จบ ไฟล์เดียวจึงไม่มีสอง worker แตะค่ารวมพร้อมกัน |
| การเข้าระบบ | `global.setup.ts` เรียก `POST /__control/reset` ของ stub แล้วเข้าระบบด้วย `E2E_ACCESS_CODE` ครั้งเดียวและเก็บ storage state เส้นที่ 8 ใช้ context ว่างของตัวเอง |
| Environment ของ Playwright | `E2E_ACCESS_CODE` (ค่าเริ่มต้นเท่ากับ `ACCESS_CODE` ใน compose), `E2E_LINE_CHANNEL_SECRET` (ค่าเริ่มต้นจาก `e2e/fixtures/line/credentials.ts`), `E2E_STUB_URL` (ค่าเริ่มต้น `http://localhost:4010`) ตาม [stubs-and-fixtures](../qa/stubs-and-fixtures.md#2-การต่อกับแอป) |
| Rate limit | ทุก test มาจาก IP เดียว compose จึงตั้ง `RATE_LIMIT_SCALE` เป็น 10 ซึ่งคูณทุกค่าจำกัดยกเว้น `RATE_LIMIT_UNLOCK` จำนวนรหัสผิดรวมทั้งชุดต้องน้อยกว่า `RATE_LIMIT_UNLOCK` ต่อหน้าต่าง (หัวข้อ 10) |
| Cookie `Secure` บน `http://localhost` | Chromium รับ cookie `Secure` จาก localhost (ยืนยันแล้ว) จึงรัน Playwright บนเครื่อง host ไม่รันใน container ที่เรียก `http://app:3000` |
| ช่วงเวลาสั้น | compose ตั้ง `POLL_INTERVAL_MS` และ `AI_DEBOUNCE_MS` ให้สั้น (หัวข้อ 7.3) |

### 6.9 prisma.config.ts

```ts
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://unset:unset@localhost:5432/unset',
  },
});
```

- Prisma 7 ไม่โหลด `.env` เอง จึงใช้ `process.loadEnvFile` ของ Node ไม่เพิ่ม dependency `dotenv`
- Migration ใช้ `DIRECT_URL` (การต่อแบบตรงของ Neon) ส่วนแอปใช้ `DATABASE_URL` (pooled) ผ่าน driver adapter
- ค่าสำรองทำให้ `prisma generate` ทำงานได้ตอนไม่มีฐานข้อมูล เช่น `postinstall` ใน CI
- รูปแบบของ `defineConfig` และ field `datasource` ต้องยืนยันกับ Prisma 7.10.1 ตอน scaffold รายละเอียดของ schema อยู่ใน [data-model](data-model.md)

### 6.10 .env.example

ทุกตัวแปรจากตารางใน [infrastructure](infrastructure.md) ค่าทั้งหมดเป็นของปลอม และชี้ไปที่ Postgres กับ stub จาก compose เพื่อให้ `pnpm dev` ทำงานได้

```dotenv
# Database (compose db exposed on host port 15432)
DATABASE_URL=postgresql://webchat:webchat@localhost:15432/webchat
DIRECT_URL=postgresql://webchat:webchat@localhost:15432/webchat

# Access gate
ACCESS_CODE=change-me-local
# 32 random bytes, base64. Generate: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
SESSION_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
CREDENTIALS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

# AI (the stub accepts any value)
ANTHROPIC_API_KEY=fake-anthropic-key

# File storage: local | blob
FILE_STORAGE=local
# Required only when FILE_STORAGE=blob
BLOB_READ_WRITE_TOKEN=

APP_BASE_URL=http://localhost:3000

# Stubs only. Leave unset in production.
LINE_API_BASE_URL=http://localhost:4010/line
LINE_DATA_API_BASE_URL=http://localhost:4010/line-data
ANTHROPIC_BASE_URL=http://localhost:4010/anthropic

POLL_INTERVAL_MS=2000
AI_DEBOUNCE_MS=2500
# Multiplies every rate limit except unlock. Never set in production.
RATE_LIMIT_SCALE=1
```

ข้อกำหนดของ `src/composition/env.ts`:

| ตัวแปร | บังคับ | ตรวจ |
| --- | --- | --- |
| `DATABASE_URL`, `ACCESS_CODE`, `SESSION_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `FILE_STORAGE`, `APP_BASE_URL` | บังคับ | `SESSION_SECRET` และ `CREDENTIALS_ENCRYPTION_KEY` ถอด base64 แล้วยาว 32 byte, `FILE_STORAGE` เป็น `local` หรือ `blob`, `APP_BASE_URL` เป็น URL ไม่มี `/` ท้าย |
| `BLOB_READ_WRITE_TOKEN` | บังคับเมื่อ `FILE_STORAGE=blob` | ไม่ว่าง |
| `DIRECT_URL` | ไม่บังคับในแอป (ใช้โดย `prisma.config.ts`) | |
| `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL` | ไม่บังคับ | ค่าเริ่มต้น `https://api.line.me`, `https://api-data.line.me` และค่าเริ่มต้นของ SDK ตามลำดับ |
| `POLL_INTERVAL_MS`, `AI_DEBOUNCE_MS` | ไม่บังคับ | จำนวนเต็มบวก ค่าเริ่มต้นตามหัวข้อ 10 |
| `RATE_LIMIT_SCALE` | ไม่บังคับ | จำนวนเต็ม ≥ 1 ค่าเริ่มต้น 1 คูณทุกค่าจำกัดความถี่ยกเว้น `RATE_LIMIT_UNLOCK` compose ตั้ง 10 ห้ามตั้งใน production |

Adapter ต่อ path ของ API ท้าย base URL เช่น `${LINE_API_BASE_URL}/v2/bot/message/push` stub จึงต้องรับ path ของ API จริงใต้ prefix `/line`, `/line-data` และ `/anthropic` ตาม [stubs-and-fixtures](../qa/stubs-and-fixtures.md#2-การต่อกับแอป)

`FILE_STORAGE=local` เก็บไฟล์ที่ `<cwd>/.data/uploads` ซึ่งใน Docker คือ `/app/.data/uploads` ไม่มี environment variable สำหรับ path นี้

Browser อัปโหลดเข้าและเปิดไฟล์จากที่เก็บแบบ local ผ่าน `PUT /api/local-storage/*key` และ `GET /api/local-storage/*key` ตาม [api-contract](api-contract.md#put-apilocal-storagekey)

### 6.11 ไฟล์อื่น

| ไฟล์ | เนื้อหา |
| --- | --- |
| `.nvmrc` | `24` |
| `.gitignore` | `node_modules/`, `.next/`, `out/`, `coverage/`, `playwright-report/`, `test-results/`, `e2e/.auth/`, `.env`, `.env.*`, `!.env.example`, `.data/`, `src/adapters/prisma/generated/`, `next-env.d.ts`, `*.tsbuildinfo`, `.vercel/`, `.DS_Store` |
| `.dockerignore` | `.git/`, `.github/`, `node_modules/`, `.next/`, `coverage/`, `playwright-report/`, `test-results/`, `e2e/.auth/`, `.env`, `.env.*`, `.data/`, `src/adapters/prisma/generated/`, `docs/`, `*.tsbuildinfo` |
| `pnpm-workspace.yaml` | เฉพาะ `onlyBuiltDependencies` (หัวข้อ 2) |
| `docker/no-extra-ca.pem` | ไฟล์ว่าง ค่าเริ่มต้นของ secret `extra_ca` (หัวข้อ 7.1) |
| `src/contracts/zod-config.ts` | `config({ jitless: true })` ของ zod import เป็นบรรทัดแรกของ `src/contracts/index.ts` เหตุผล: ตอนสร้าง object schema zod ลองเรียก `new Function` หนึ่งครั้งเพื่อเปิดทางเร็วแบบ JIT ใต้ CSP ของแอปซึ่งไม่มี `'unsafe-eval'` (หัวข้อ 6.2) browser บล็อกการลองนี้และรายงาน `securitypolicyviolation` แม้ zod จะกลืน error ไว้ `jitless` ข้ามการลองนี้ จึงต้องรันก่อนสร้าง schema ตัวแรก มี unit test ใน `zod-config.spec.ts` |
| `components.json` | style `new-york`, `rsc: true`, `tsx: true`, `tailwind.css: "app/globals.css"`, `tailwind.baseColor: "neutral"`, `tailwind.cssVariables: true`, aliases: `components: "@/common"`, `ui: "@/common/ui"`, `utils: "@/common/common.logic"`, `lib: "@/common"`, `hooks: "@/common"`, `iconLibrary: "lucide"` |
| `vercel.json` | `{ "buildCommand": "pnpm vercel-build", "regions": ["sin1"], "git": { "deploymentEnabled": false } }` (`git.deploymentEnabled` ปิดการ deploy อัตโนมัติจาก Git ตาม [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md) ต้องยืนยันว่า Deploy Hook ยังทำงานเมื่อปิด ถ้าไม่ ให้ปิดใน dashboard ตาม [deploy](../runbooks/deploy.md) แทน) |
| `public/robots.txt` | `User-agent: *` และ `Disallow: /` |

## 7. Docker

### 7.1 Dockerfile

Multi-stage หกขั้น (`base`, `deps`, `build`, `tools`, `migrate-deps`, `runner`) ขั้นที่ไม่ต่อจากขั้นอื่นเริ่มจาก `node:24-alpine`

```dockerfile
# Optional build-time trust for networks that re-sign HTTPS with their own CA (proxied CI or
# sandboxes). Pass a PEM file as the BuildKit secret `extra_ca` (compose: EXTRA_CA_FILE). The secret
# is mounted only for the RUN steps below: it is never copied into a layer or the runtime stage,
# and TLS verification stays on. Without the secret every step behaves exactly as before.
FROM node:24-alpine AS base
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install -g pnpm@10.28.0
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm db:generate && pnpm build

# Seed and stub server: full source and dev dependencies
FROM build AS tools

# Prisma CLI for `migrate deploy` at container start
FROM node:24-alpine AS migrate-deps
WORKDIR /migrate
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm init -y >/dev/null && npm install --no-audit --no-fund prisma@7.10.1

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=migrate-deps /migrate/node_modules ./migrate/node_modules
COPY prisma/schema.prisma ./migrate/prisma/schema.prisma
COPY prisma/migrations ./migrate/prisma/migrations
COPY prisma.config.ts ./migrate/prisma.config.ts
COPY --chmod=755 docker/entrypoint.sh ./entrypoint.sh
RUN mkdir -p /app/.data/uploads && chown -R nextjs:nodejs /app/.data
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
```

- **CA เพิ่มตอน build (ไม่บังคับ):** เครือข่ายที่ดัก HTTPS ด้วย CA ของตัวเอง (proxy ของ CI หรือ sandbox) ทำให้ `npm`/`pnpm install` ตรวจ certificate ไม่ผ่าน ทุกขั้น `RUN` ที่ดึงจากเครือข่ายจึง mount BuildKit secret `extra_ca` (`required=false`) และตั้ง `NODE_EXTRA_CA_CERTS` เฉพาะเมื่อไฟล์ไม่ว่าง secret ไม่ถูก copy ลง layer หรือขั้น `runner` และไม่ปิดการตรวจ TLS ใน compose secret นี้มาจาก `EXTRA_CA_FILE` (ค่าเริ่มต้น `docker/no-extra-ca.pem` ซึ่งเป็นไฟล์ว่าง) เช่น `EXTRA_CA_FILE=/path/to/ca.pem docker compose up -d --build --wait` เครือข่ายปกติไม่ต้องตั้งอะไร
- Build ไม่ต้องมี environment variable เพราะทุก route เป็น `force-dynamic` และ `env.ts` ตรวจตอน server เริ่ม ไม่ใช่ตอน import
- `migrate-deps` ติดตั้ง Prisma CLI แยก เพราะ standalone ไม่มี CLI รุ่นของ `prisma` ล็อกตรงตัว ส่วน dependency ย่อยของ CLI ไม่ได้ล็อกด้วย lockfile ซึ่งยอมรับได้เพราะใช้เฉพาะ `migrate deploy`
- Prisma 7 ใช้ query compiler กับ driver adapter ไม่มี query engine binary ให้ copy (ต้องยืนยันว่า standalone มีไฟล์ของ client ครบ ถ้าขาดให้เพิ่ม `outputFileTracingIncludes` ใน `next.config.ts`)
- ถ้า dependency ใดต้องการ glibc บน Alpine ให้เพิ่ม `apk add --no-cache libc6-compat` ที่ขั้น `base` (ต้องยืนยันตอน build ครั้งแรก)

`docker/entrypoint.sh`:

```sh
#!/bin/sh
set -eu
cd /app/migrate
./node_modules/.bin/prisma migrate deploy
cd /app
exec node server.js
```

`migrate deploy` อ่าน `DIRECT_URL` ผ่าน `prisma.config.ts`

### 7.2 Port

| Service | ใน network ของ compose | บนเครื่อง host |
| --- | --- | --- |
| `app` | 3000 | 3000 |
| `db` | 5432 | 15432 |
| `stub` | 4010 | 4010 |

### 7.3 docker-compose.yml

```yaml
name: testing-webchat

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: webchat
      POSTGRES_PASSWORD: webchat
      POSTGRES_DB: webchat
    ports: ['15432:5432']
    volumes: ['db-data:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U webchat -d webchat']
      interval: 2s
      timeout: 3s
      retries: 30

  stub:
    build: { context: ., target: tools, secrets: [extra_ca] }
    command: ['pnpm', 'stubs']
    ports: ['4010:4010']
    environment:
      STUB_PORT: '4010'
      STUB_PUBLIC_URL: http://localhost:4010
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:4010/__control/health >/dev/null || exit 1']
      interval: 2s
      timeout: 3s
      retries: 30

  app:
    build: { context: ., target: runner, secrets: [extra_ca] }
    depends_on:
      db: { condition: service_healthy }
      stub: { condition: service_healthy }
    ports: ['3000:3000']
    environment:
      DATABASE_URL: postgresql://webchat:webchat@db:5432/webchat
      DIRECT_URL: postgresql://webchat:webchat@db:5432/webchat
      ACCESS_CODE: test-webchat # local only
      SESSION_SECRET: bG9jYWwtb25seS1zZXNzaW9uLXNlY3JldC0zMmJ5dGU=
      CREDENTIALS_ENCRYPTION_KEY: bG9jYWwtb25seS1jcmVkZW50aWFsLWtleS0zMmJ5dGU=
      ANTHROPIC_API_KEY: stub-anthropic-key
      FILE_STORAGE: local
      APP_BASE_URL: http://localhost:3000
      LINE_API_BASE_URL: http://stub:4010/line
      LINE_DATA_API_BASE_URL: http://stub:4010/line-data
      ANTHROPIC_BASE_URL: http://stub:4010/anthropic
      POLL_INTERVAL_MS: '500'
      AI_DEBOUNCE_MS: '300'
      RATE_LIMIT_SCALE: '10'
    volumes: ['uploads:/app/.data']

  seed:
    build: { context: ., target: tools, secrets: [extra_ca] }
    command: ['pnpm', 'db:seed']
    depends_on:
      app: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://webchat:webchat@db:5432/webchat
      CREDENTIALS_ENCRYPTION_KEY: bG9jYWwtb25seS1jcmVkZW50aWFsLWtleS0zMmJ5dGU=
      APP_BASE_URL: http://localhost:3000
      # The system adapters import `server-only`, which throws under plain Node.
      NODE_OPTIONS: --conditions=react-server
    # Same uid as the app (Dockerfile), so files the seed writes to the volume stay writable by it.
    user: '1001:1001'
    volumes: ['uploads:/app/.data']
    restart: 'no'

# Optional extra CA for image builds behind a TLS-intercepting proxy. Empty by default, so a plain
# `docker compose up -d --build --wait` needs nothing. Used only while building; never in an image.
#   EXTRA_CA_FILE=/path/to/ca-bundle.pem docker compose build
secrets:
  extra_ca:
    file: ${EXTRA_CA_FILE:-./docker/no-extra-ca.pem}

volumes:
  db-data: {}
  uploads: {}
```

- ค่าความลับในไฟล์นี้ใช้ได้เฉพาะในเครื่อง เป็นค่าที่เปิดเผยตั้งใจ ค่า base64 สองตัวถอดได้ 32 byte พอดี
- `seed` รันด้วย `user: '1001:1001'` ซึ่งเป็น uid/gid ของ `nextjs` ใน `runner` ไฟล์สื่อตัวอย่างที่ seed เขียนลง volume `uploads` จึงเป็นของผู้ใช้เดียวกับแอปและแอปเขียนทับหรือลบได้ และตั้ง `NODE_OPTIONS: --conditions=react-server` ด้วยเหตุผลเดียวกับ script `db:seed` (หัวข้อ 5)
- `secrets.extra_ca` ของ build ทุกตัวอธิบายในหัวข้อ 7.1
- `seed` รอให้ `app` healthy ซึ่งแปลว่า migration ของ entrypoint จบแล้ว seed ไม่อ่าน `env.ts` แต่สร้าง Prisma client และ adapter ที่ต้องใช้เองจาก `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY` และ `APP_BASE_URL` ดู [data-model](data-model.md)
- `stub` ตอบ `GET /__control/health` ด้วย 200 ส่วนพฤติกรรมอื่น ชื่อ service, prefix และตัวแปรของ stub อยู่ใน [stubs-and-fixtures](../qa/stubs-and-fixtures.md) ไฟล์นี้ต้องตรงกับเอกสารนั้น
- `RATE_LIMIT_SCALE: "10"` ให้ E2E ที่รันขนานจาก IP เดียวไม่ถูกจำกัด ค่านี้ใช้เฉพาะ compose
- `docker compose up` คำสั่งเดียวได้ทุกอย่างตาม [infrastructure](infrastructure.md) และรันซ้ำได้เพราะ seed เป็นแบบ idempotent ([data-model](data-model.md))

## 8. CI

`.github/workflows/ci.yml` ตาม [infrastructure](infrastructure.md) และ [ADR 0013](../adr/0013-ci-on-main-then-deploy-hook.md) การแก้ไฟล์นี้ต้องถามเจ้าของงานก่อน ตาม `AGENTS.md`

```yaml
# Every action is pinned to the full commit SHA of a release, and the gitleaks image to its digest;
# the trailing comment names that version. Update both together.
name: ci

on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-main
  cancel-in-progress: true

env:
  TZ: UTC

jobs:
  check:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:coverage
      - run: pnpm build

  adapters:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: docker compose up -d --build --wait db stub
      - run: pnpm test:adapters
      - if: failure()
        run: docker compose logs db stub

  e2e:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: docker compose build
      - run: docker compose up -d --wait db stub app
      - run: docker compose run --rm seed
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - if: failure()
        run: docker compose logs app stub
      - if: failure()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with: { name: playwright-report, path: playwright-report, retention-days: 7 }

  security:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version-file: .nvmrc }
      - run: pnpm audit --audit-level high
      - run: docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git /repo --redact --no-banner # v8.30.1

  deploy:
    needs: [check, adapters, e2e, security]
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: Trigger Vercel Deploy Hook
        env:
          DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}
        run: curl --fail --silent --show-error -X POST "$DEPLOY_HOOK_URL" > /dev/null
```

| เรื่อง | ข้อกำหนด |
| --- | --- |
| การล็อก action | ทุก action ล็อกด้วย commit SHA เต็มของรุ่นที่ระบุใน comment ท้ายบรรทัด: `actions/checkout` v7.0.1, `pnpm/action-setup` v6.1.1, `actions/setup-node` v7.1.0, `actions/upload-artifact` v7.0.2 และ image gitleaks ล็อกด้วย digest ของ v8.30.1 การอัปเดตเปลี่ยน SHA และ comment พร้อมกัน |
| Secret | มีตัวเดียวคือ `VERCEL_DEPLOY_HOOK_URL` ตาม [deploy](../runbooks/deploy.md) |
| E2E | seed รันแยกด้วย `docker compose run` เพราะ `up --wait` ไม่เหมาะกับ service ที่จบเอง |
| สแกนความลับ | ใช้ image ของ gitleaks ตรง ไม่ใช้ action ของ gitleaks เพื่อไม่ต้องมี license key (ต้องยืนยันชื่อ subcommand `git` ของรุ่นที่ใช้ รุ่นเก่าใช้ `detect`) |
| ช่องโหว่ | `pnpm audit` ล้มเมื่อพบระดับ high ขึ้นไป |
| `cancel-in-progress` | push ใหม่ยกเลิกรอบเก่า Deploy Hook สร้างจาก HEAD ของ `main` อยู่แล้ว |

## 9. Build บน Vercel

`vercel.json` ตั้ง `buildCommand` เป็น `pnpm vercel-build` ซึ่งทำตามลำดับ:

1. ถ้า `VERCEL_ENV` เป็น `production` รัน `prisma migrate deploy` (ใช้ `DIRECT_URL`)
2. `prisma generate`
3. `next build`

Environment variable ตั้งเฉพาะ Production ตาม [deploy](../runbooks/deploy.md) และ migration ต้องเป็นแบบเพิ่มเท่านั้นตามหัวข้อ "ย้อนกลับ" ในเอกสารเดียวกัน

## 10. ค่าคงที่ของระบบ

ตารางในหัวข้อนี้เป็นที่เดียวที่เขียนค่าของ constant เอกสารอื่นอ้างด้วยชื่อแล้วลิงก์มาที่นี่ ตาม [code-style ข้อ 9](../guidelines/code-style.md) การเปลี่ยนค่าแก้ที่นี่ที่เดียว ค่าที่มี "(ต้องยืนยัน)" ติดตามใน [แผนการสร้าง](../plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง)

ค่าของแกนกลางอยู่ใน `src/core/domain/constants.ts` ค่าที่หน้าเว็บต้องใช้ export ซ้ำผ่าน `src/contracts/` (ซึ่ง import จาก domain ได้) ค่าของ adapter อยู่ในไฟล์ `*.constants.ts` ของ adapter นั้น และค่าของหน้าจออยู่ในไฟล์ที่ระบุ

### 10.1 แกนกลาง

| ชื่อ | ค่า | อยู่ที่ | ใช้ที่ |
| --- | --- | --- | --- |
| `POLL_OVERLAP_SEQ` | 20 | `constants.ts` | ช่วงย้อนหลังของ polling นับเป็นเลข sequence ตาม [api-contract](api-contract.md#protocol-ของ-polling) |
| `POLL_PAGE_LIMIT` | 200 | `constants.ts` | จำนวนแถวสูงสุดต่อรอบ polling |
| `AI_HISTORY_LIMIT` | 20 ข้อความ | `constants.ts` | ประวัติที่ส่งให้โมเดล |
| `AI_REPLY_MAX_CHARS` | 1000 ตัวอักษร | `constants.ts` | คำตอบของ AI หลังทำความสะอาดยาวกว่านี้ถือว่าไม่ผ่าน schema ([ai-prompt](../specs/ai-prompt.md#6-การทำความสะอาดคำตอบ)) |
| `AI_MAX_ROUNDS_PER_RUN` | 2 | `constants.ts` | จำนวนรอบที่งานหนึ่งของ `GenerateAiReply` ตอบต่อได้เมื่อมีข้อความใหม่ระหว่างถือล็อก |
| `AI_STUCK_AFTER_MS` | 300000 ms | `constants.ts` | `aiState = replying` ที่เก่ากว่านี้ถือว่าค้าง ต้องมากกว่าเวลาแย่ที่สุดที่งานหนึ่งถือล็อกตลอดทุกรอบ คือ `AI_MAX_ROUNDS_PER_RUN` × (`GUARD_TIMEOUT_MS` × (1 + `CLAUDE_GUARD_MAX_RETRIES`) เมื่อขอบเขตหัวข้อเปิด + `CLAUDE_REPLY_TIMEOUT_MS` × (1 + `CLAUDE_REPLY_MAX_RETRIES`) + LINE) + `AI_DEBOUNCE_MS` เพื่อให้เงื่อนไขนี้จริงทั้งบน Vercel และใน Docker ที่ไม่มีเพดานเวลาของ function |
| `AI_MAX_TOKENS` | 16000 | `constants.ts` | `max_tokens` ของการตอบแชท (คำขอแบบไม่ stream) |
| `AI_EXTRACT_MAX_TOKENS` | 64000 | `constants.ts` | `max_tokens` ของการแปลง PDF (คำขอแบบ stream) |
| `LINE_LOADING_SECONDS` | 20 วินาที (ต้องยืนยันช่วงที่ LINE รับ) | `constants.ts` | loading ฝั่ง LINE ทั้งขณะ AI ตอบและขณะแอดมินพิมพ์ |
| `KNOWLEDGE_CAPACITY_TOKENS` | 50000 token | `constants.ts` | เพดานของคลังความรู้ |
| `PDF_MAX_BYTES` | 4 MB (4 × 1024 × 1024) | `constants.ts` | `IngestDocument`, หน้าตั้งค่า |
| `PDF_MAX_PAGES` | 30 หน้า | `constants.ts` | `IngestDocument` ตรวจหลังแปลง และอยู่ในคำสั่งของการแปลง |
| `IMAGE_MAX_BYTES` | 10 MB (10 × 1024 × 1024) | `constants.ts` | `IssueUpload`, `StoreInboundMedia`, หน้าแชท |
| `VIDEO_MAX_BYTES` | 50 MB (50 × 1024 × 1024) | `constants.ts` | `IssueUpload`, `StoreInboundMedia`, หน้าแชท |
| `PREVIEW_MAX_BYTES` | 1 MB (ต้องยืนยันขีดของภาพตัวอย่างใน LINE) | `constants.ts` | ภาพตัวอย่างที่ browser สร้าง |
| `UPLOAD_TICKET_TTL_MS` | 900000 ms (15 นาที) | `constants.ts` | อายุของสิทธิ์อัปโหลด |
| `LINE_TEXT_MAX_CHARS` | 5000 ตัวอักษร (ต้องยืนยันวิธีนับ) | `constants.ts` | การแบ่งข้อความยาวใน domain |
| `LINE_MAX_PARTS_PER_REQUEST` | 5 (ต้องยืนยัน) | `constants.ts` | จำนวนข้อความต่อคำขอ reply หรือ push |
| `REPLY_TOKEN_USABLE_MS` | 50000 ms (ต้องยืนยันอายุของ reply token) | `constants.ts` | `replyTokenExpiresAt` = เวลาของ event + ค่านี้ |
| `ADMIN_TEXT_MAX_CHARS` | 5000 ตัวอักษร | `constants.ts` | ข้อความที่แอดมินพิมพ์ |
| `PREVIEW_TEXT_MAX_CHARS` | 100 ตัวอักษร | `constants.ts` | ข้อความล่าสุดในรายชื่อ |
| `MESSAGE_PAGE_LIMIT` | 50 | `constants.ts` | `GetMessages` และหน้าแชท |
| `CONTACT_PAGE_LIMIT` | 50 | `constants.ts` | `ListContacts` หน้าละกี่คน |
| `CONTACT_SEARCH_MAX_CHARS` | 50 ตัวอักษร | `constants.ts` | query `q` ของ `GET /api/contacts` |
| `CANNED_REPLY_MAX_COUNT` | 100 รายการ | `constants.ts` | `SaveCannedReply` |
| `CANNED_TITLE_MAX_CHARS` | 50 ตัวอักษร | `constants.ts` | ชื่อของข้อความสำเร็จรูป ทั้ง API และฟอร์ม |
| `CANNED_TEXT_MAX_CHARS` | 2000 ตัวอักษร | `constants.ts` | เนื้อหาของข้อความสำเร็จรูป ทั้ง API และฟอร์ม |
| `AI_INSTRUCTIONS_MAX_CHARS` | 2000 ตัวอักษร | `constants.ts` | คำแนะนำสำหรับ AI ทั้ง API และฟอร์ม |
| `AI_DAILY_BUDGET_MAX_USD` | "10.00" | `constants.ts` | งบต่อวันสูงสุดที่กรอกได้ ทั้ง API และฟอร์ม |
| `ACCESS_COOKIE_TTL_MS` | 604800000 ms (7 วัน) | `constants.ts` | `UnlockAccess`, `AccessTokenSigner`, `Max-Age` ของ cookie |
| `WEBHOOK_MAX_BODY_BYTES` | 1 MB | `constants.ts` | route webhook ปฏิเสธ body ที่ใหญ่กว่านี้ก่อนตรวจ signature |
| `JSON_MAX_BODY_BYTES` | 64 KB | `constants.ts` | body แบบ JSON ของทุก endpoint อื่น |
| `DEFAULT_AI_MODEL` | `claude-opus-5-5` | `constants.ts` และค่าเริ่มต้นใน `prisma/schema.prisma` | ค่าเริ่มต้นของ `Settings.aiModel` |
| `DEFAULT_AI_DAILY_BUDGET_USD` | "2.00" | `constants.ts` และ `prisma/schema.prisma` | ค่าเริ่มต้นของงบต่อวัน |
| `DEFAULT_POLITE_PARTICLE` | "ค่ะ" | `constants.ts` และ `prisma/schema.prisma` (`kha`) | ค่าเริ่มต้นของคำลงท้าย |
| `GUARD_MAX_TOPICS` | 20 หัวข้อ | `constants.ts` | จำนวนหัวข้อสูงสุดของขอบเขตหัวข้อ ทั้ง API และฟอร์ม ([topic-guard](../specs/topic-guard.md)) |
| `GUARD_TOPIC_MAX_CHARS` | 80 ตัวอักษร | `constants.ts` | ความยาวของหนึ่งหัวข้อหลังตัดช่องว่าง |
| `GUARD_REFUSAL_MAX_CHARS` | 300 ตัวอักษร | `constants.ts` | ข้อความปฏิเสธ |
| `GUARD_TEST_MAX_CHARS` | 1000 ตัวอักษร | `constants.ts` | ข้อความในกล่องทดลองของ `POST /api/settings/guard/test` |
| `GUARD_MODEL` | `claude-haiku-5-5` | `constants.ts` | โมเดลของการคัดกรอง ใช้เสมอไม่ขึ้นกับ `Settings.aiModel` |
| `GUARD_MAX_TOKENS` | 2000 | `constants.ts` | `max_tokens` ของการคัดกรอง |
| `GUARD_TIMEOUT_MS` | 10000 ms | `constants.ts` | timeout ของการคัดกรองหนึ่งครั้ง ส่งใน `TopicGuardRequest.timeoutMs` |
| `GUARD_CONTEXT_TURNS` | 4 turn | `constants.ts` | บริบทก่อนข้อความล่าสุดที่ส่งให้การคัดกรอง |
| `DEFAULT_GUARD_REFUSAL_TEXT` | "คุยได้เฉพาะหัวข้อที่กำหนดไว้นะคะ" | `constants.ts` และ `prisma/schema.prisma` | ค่าเริ่มต้นของ `Settings.guardRefusalText` |

ค่าเริ่มต้นของระบบที่ติดตั้งใหม่: kill switch ปิด, ขอบเขตหัวข้อปิดและไม่มีหัวข้อ, งบต่อวันตาม `DEFAULT_AI_DAILY_BUDGET_USD`, โมเดลตาม `DEFAULT_AI_MODEL`, คำลงท้ายตาม `DEFAULT_POLITE_PARTICLE`, ลูกค้าใหม่มี AI ตอบแทนปิด ส่วน seed เปิด kill switch และคงงบไว้ที่ค่าเริ่มต้น ([data-model](data-model.md#ข้อมูลตัวอย่าง-seed))

### 10.2 การจำกัดความถี่

Rate limit ทั้งหมดเป็นแบบหน้าต่างคงที่ (fixed window) นับใน `RateLimitBucket` วิธีนับอยู่ใน [data-model](data-model.md#กฎของ-repository) endpoint และรหัส error ของแต่ละ action อยู่ใน [api-contract](api-contract.md#การจำกัดความถี่) ค่าจำกัดจริงคือค่าในตาราง × `RATE_LIMIT_SCALE` ยกเว้น `RATE_LIMIT_UNLOCK` ซึ่งไม่คูณ

| ชื่อ | Action | ค่า | Subject | หมายเหตุ |
| --- | --- | --- | --- | --- |
| `RATE_LIMIT_UNLOCK` | `unlock` | 5 ครั้งต่อ 60 วินาที | IP | นับเฉพาะรหัสผิด ตาม [access-gate](../specs/access-gate.md) |
| `RATE_LIMIT_SEND_MESSAGE` | `send_message` | 30 ครั้งต่อ 60 วินาที | IP | `SendAdminMessage`, `RetryMessage` |
| `RATE_LIMIT_UPLOAD_TICKET` | `upload_ticket` | 20 ครั้งต่อ 60 วินาที | IP | `IssueUpload` |
| `RATE_LIMIT_PDF_INGEST` | `pdf_ingest` | 5 ครั้งต่อ 3600 วินาที | IP | `IngestDocument` รวมการลองใหม่ |
| `RATE_LIMIT_TYPING` | `typing` | 1 ครั้งต่อ 10 วินาที | id ของลูกค้า | `ShowTypingToCustomer` เกินแล้วข้ามเงียบ ๆ ไม่ใช่ error |
| `RATE_LIMIT_GUARD_TEST` | `guard_test` | 10 ครั้งต่อ 60 วินาที | IP | `TestTopicGuard` ทุกครั้งเรียกโมเดลและมีค่าใช้จ่าย |

`RATE_LIMIT_SCALE` มาจาก environment variable ชื่อเดียวกัน ค่าเริ่มต้น 1 ส่งเข้าแกนกลางผ่าน `UseCaseConfig`

### 10.3 Environment variable ที่มีค่าเริ่มต้น

| ชื่อ | ค่าเริ่มต้น | อยู่ที่ | ใช้ที่ |
| --- | --- | --- | --- |
| `POLL_INTERVAL_MS` | 2000 ms | `src/composition/env.ts` | ช่วง polling ของหน้าเว็บ หน้าเว็บได้ค่าจาก `GET /api/settings` (`client.pollIntervalMs`) |
| `AI_DEBOUNCE_MS` | 2500 ms | `src/composition/env.ts` | ช่วงรวมข้อความรัวใน `GenerateAiReply` |
| `RATE_LIMIT_SCALE` | 1 | `src/composition/env.ts` | หัวข้อ 10.2 |

### 10.4 Adapter และ route

| ชื่อ | ค่า | อยู่ที่ | ใช้ที่ |
| --- | --- | --- | --- |
| `LINE_REQUEST_TIMEOUT_MS` | 5000 ms | `src/adapters/line/line.constants.ts` | ทุกการเรียก LINE ยกเว้นโปรไฟล์และไฟล์ |
| `LINE_PROFILE_TIMEOUT_MS` | 3000 ms | `line.constants.ts` | `getProfile` ไม่ retry เพราะเรียกก่อนตอบ webhook |
| `LINE_CONTENT_TIMEOUT_MS` | 30000 ms | `line.constants.ts` | ดาวน์โหลดสื่อขาเข้า |
| `LINE_MAX_RETRIES` | 2 | `line.constants.ts` | retry เฉพาะเครือข่ายล่ม, 5xx และ 429 |
| `LINE_RETRY_BASE_DELAY_MS` | 250 ms | `line.constants.ts` | เวลารอก่อน retry ครั้งที่ n (เริ่มที่ 1) เมื่อ LINE ไม่ส่ง `Retry-After`: ค่านี้ × 2^(n-1) |
| `LINE_RETRY_AFTER_MAX_MS` | 5000 ms | `line.constants.ts` | `Retry-After` ที่ยาวกว่านี้ไม่รอ คำขอจบด้วย error ที่มี `retryAfterSeconds` |
| `CLAUDE_REPLY_TIMEOUT_MS` | 45000 ms | `src/adapters/claude/claude.constants.ts` | option `timeout` ของ SDK สำหรับการตอบแชท |
| `CLAUDE_REPLY_MAX_RETRIES` | 1 | `claude.constants.ts` | option `maxRetries` ของ SDK สำหรับการตอบแชท |
| `CLAUDE_EXTRACT_TIMEOUT_MS` | 240000 ms | `claude.constants.ts` | การแปลง PDF (ต้องยืนยันกับเพดานเวลาของ function) |
| `CLAUDE_EXTRACT_MAX_RETRIES` | 1 | `claude.constants.ts` | การแปลง PDF |
| `CLAUDE_GUARD_MAX_RETRIES` | 1 | `claude.constants.ts` | option `maxRetries` ของ SDK สำหรับการคัดกรองขอบเขตหัวข้อ (timeout มาจาก `GUARD_TIMEOUT_MS` ในคำขอ) |
| `WEBHOOK_MAX_DURATION_S` | 120 | `app/api/line/webhook/route.ts` (`maxDuration`) | หัวข้อ 4 เมื่อขอบเขตหัวข้อเปิด เวลาแย่ที่สุดของหนึ่งรอบคือ 20 วินาทีของการคัดกรองบวก 90 วินาทีของการตอบแชท รวม 110 วินาที จึงต่ำกว่าค่านี้ |
| `KNOWLEDGE_MAX_DURATION_S` | 300 (ต้องยืนยันกับ Vercel) | `app/api/knowledge/documents/**/route.ts` (`maxDuration`) | หัวข้อ 4 |

### 10.5 หน้าจอ

| ชื่อ | ค่า | อยู่ที่ | ใช้ที่ |
| --- | --- | --- | --- |
| `TYPING_PING_INTERVAL_MS` | 15000 ms | `src/features/inbox/inbox.constants.ts` | ช่องตอบส่ง ping การพิมพ์ไม่เกินหนึ่งครั้งต่อช่วงนี้ ([ui-screens](../specs/ui-screens.md#58-loading-ฝั่ง-line-ขณะพิมพ์)) |
| `SEND_UNCONFIRMED_TIMEOUT_MS` | 15000 ms | `inbox.constants.ts` | ข้อความที่ไม่ได้คำตอบถูกถือว่าไม่สำเร็จหลังช่วงนี้ |
| `GROUP_GAP_MS` | 300000 ms (5 นาที) | `inbox.constants.ts` | ข้อความห่างกันไม่เกินนี้อยู่กลุ่มเดียว |
| `SEARCH_DEBOUNCE_MS` | 300 ms | `inbox.constants.ts` | ช่องค้นหาลูกค้า |
| `MARK_READ_DELAY_MS` | 1000 ms | `inbox.constants.ts` | หน่วงการล้างจำนวนยังไม่อ่าน |
| `STICK_TO_BOTTOM_PX` | 80 px | `inbox.constants.ts` | ถือว่าอยู่ล่างสุดของแชท |
| `LOAD_OLDER_THRESHOLD_PX` | 200 px | `inbox.constants.ts` | ระยะจากบนสุดที่เริ่มโหลดข้อความเก่า |
| `TOAST_DURATION_MS` | 4000 ms | `src/common/common.constants.ts` | toast ปกติ ([ui-screens](../specs/ui-screens.md#10-toast)) |
| `TOAST_ERROR_DURATION_MS` | 6000 ms | `common.constants.ts` | toast ที่เป็น error |
| `CLIENT_REQUEST_TIMEOUT_MS` | 15000 ms | `src/common/common.constants.ts` | `apiFetch` ไม่ได้คำตอบภายในเวลานี้ได้ `client.network` |
| `POLL_BACKOFF_MAX_MS` | 30000 ms | `common.constants.ts` | ช่วง polling สูงสุดเมื่อล้มเหลวติดกัน |
| `POLL_FAILURES_BEFORE_BANNER` | 2 | `common.constants.ts` | แถบการเชื่อมต่อแสดงเมื่อล้มเหลวติดกันถึงค่านี้ |
| `SYSTEM_STATUS_POLL_MS` | 30000 ms | `src/features/settings/settings.constants.ts` | ส่วนสถานะระบบ และส่วน Guardrails |
| `RAIL_WIDTH_EXPANDED` | 184px | `src/common/layout.constants.ts` | เมนูซ้าย |
| `RAIL_WIDTH_COLLAPSED` | 56px | `layout.constants.ts` | เมนูซ้ายเมื่อพับ |
| `RAIL_STRIP_HEIGHT` | 56px | `layout.constants.ts` | แถบเมนูบนเมื่อจอแคบ |
| `LIST_WIDTH` | 296px | `layout.constants.ts` | รายชื่อลูกค้า |
| `INFO_WIDTH` | 256px | `layout.constants.ts` | แผงข้อมูลลูกค้า |
| `THREAD_HEADER_HEIGHT` | 54px | `layout.constants.ts` | ส่วนหัวของแชท |
| `AVATAR_LIST` | 44px | `layout.constants.ts` | รูปในรายชื่อ |
| `AVATAR_HEADER` | 32px | `layout.constants.ts` | รูปในส่วนหัว |
| `AVATAR_GROUP` | 28px | `layout.constants.ts` | รูปข้างกลุ่มข้อความ |
| `AVATAR_INFO` | 56px | `layout.constants.ts` | รูปในแผงข้อมูล |
| `BUBBLE_RADIUS` | 17px | `layout.constants.ts` | มุมของฟองข้อความ |
| `BUBBLE_TAIL_RADIUS` | 5px | `layout.constants.ts` | มุมที่ชี้หาผู้ส่ง |
| `BUBBLE_MAX_WIDTH` | 72% ของพื้นที่ข้อความ (จอแคบ 85%) | `layout.constants.ts` | ความกว้างฟอง |
| `TAP_MIN` | 44px | `layout.constants.ts` | พื้นที่กดขั้นต่ำเมื่อจอแคบ |
| `BP_WIDE` | 1040px | `layout.constants.ts` | ช่วงจอ `wide` |
| `BP_NARROW` | 720px | `layout.constants.ts` | ช่วงจอ `narrow` |
| `AVATAR_COLORS` | `#C2185B`, `#6A1B9A`, `#1565C0`, `#00695C`, `#AD4A00`, `#4E342E` | `src/common/common.constants.ts` | สีพื้นของรูปแทนเมื่อไม่มีรูปโปรไฟล์ ทุกสีผ่าน contrast 4.5:1 กับตัวขาว |

## 11. สิ่งที่ต้องยืนยันตอน scaffold

รายการที่เป็นเรื่องของเครื่องมือ ยืนยันได้ตอนสร้างโดยไม่ต้องถามใคร ถ้าผลต่างจากสมมติฐาน ให้แก้เอกสารนี้ใน commit เดียวกัน รายการที่เป็นเรื่องของบริการภายนอกอยู่ใน [แผนการสร้าง](../plans/implementation-plan.md)

| เรื่อง | สมมติฐานที่ใช้ |
| --- | --- |
| ชื่อไฟล์ `proxy.ts` และชื่อฟังก์ชันที่ export | ชื่อใหม่ของ middleware ใน Next.js 16 ทำงานบน Node runtime |
| `next typegen` | มีใน Next.js 16.4 |
| `cacheComponents` กับ `export const dynamic` | ใช้ร่วมกันไม่ได้ จึงไม่เปิด `cacheComponents` |
| `eslint-config-next` 16.4.6 กับ ESLint 10 | รองรับ flat config และ ESLint 10 |
| ชื่อกฎและรูปแบบ config ของ eslint-plugin-boundaries 7.4.4 | ใช้ `boundaries/dependencies` (กฎ `element-types` และ `entry-point` เลิกใช้แล้วในรุ่นนี้) ตามหัวข้อ 6.3 |
| ชื่อ option ของ `switch-exhaustiveness-check` | ตามหัวข้อ 6.3 |
| `test.projects` ของ Vitest 5.1.1 | รูปแบบเดียวกับ Vitest 3.2 |
| Generator `prisma-client`, `prisma.config.ts` และการไม่มี `url` ใน schema ของ Prisma 7.10.1 | ดู [data-model](data-model.md) |
| ไฟล์ของ Prisma client ใน standalone output | ครบโดยไม่ต้องตั้ง `outputFileTracingIncludes` |
| Package ของ Radix ที่ component ใน `src/common/ui/` ใช้ | `@radix-ui/react-*` แยกตัว (component เขียนเองตามแบบของ shadcn ไม่ได้ใช้ CLI) |
| `--font-sans` ของ `next/font` ชนะค่าเริ่มต้นของ Tailwind | rule นอก layer ชนะ `@layer theme` |
| Host ใน CSP | `profile.line-scdn.net`, `stickershop.line-scdn.net`, `*.public.blob.vercel-storage.com`, `vercel.com` |
| Chromium รับ cookie `Secure` จาก `http://localhost` | รับ |
| `git.deploymentEnabled` ใน `vercel.json` กับ Deploy Hook | Deploy Hook ยังทำงาน |
| Subcommand ของ gitleaks | `git` |
| `libc6-compat` บน Alpine | ไม่ต้องใช้ |
| รายการ `onlyBuiltDependencies` ของ pnpm | เท่าที่ pnpm แจ้งว่าจำเป็น |
| CSP ที่ `heic-to/csp` ต้องใช้ใน Chrome และ Firefox | Chromium: ยืนยันแล้วว่า CSP ของหัวข้อ 6.2 พอ ไม่ต้องมี `'unsafe-eval'`, `'wasm-unsafe-eval'` หรือ `worker-src` Firefox: ยังไม่ได้ยืนยัน |
| `heic-to` ไม่อยู่ใน bundle แรก | chunk ของ `heic-to` แยกออกจาก bundle แรกในผลของ `next build` และถูกโหลดเมื่อเลือกไฟล์ HEIC เท่านั้น |

ผลของการตรวจครั้งสุดท้าย (2026-11-18) จากการ build และรันชุดตรวจทั้งหมดในเครื่อง:

- ยืนยันแล้ว: `proxy.ts` ทำงานเป็นด่านตรวจ (E2E เส้นที่ 8), `next typegen` มีและใช้ใน `pnpm typecheck`, `eslint-config-next` 16.4.6 กับ ESLint 10 และ eslint-plugin-boundaries 7.4.4 (`pnpm lint` ผ่าน), `test.projects` ของ Vitest 5.1.1, Prisma 7.10.1 กับ `prisma.config.ts`, standalone ของ Docker มีไฟล์ของ Prisma client ครบ (แอปใน compose ทำงาน), Package ของ Radix แยกตัว, Chromium รับ cookie `Secure` จาก `http://localhost` (E2E ทุกเส้นที่เข้าระบบ), `libc6-compat` ไม่ต้องใช้ (image Alpine ทำงานโดยไม่มี), `onlyBuiltDependencies: []`, CSP ของ `heic-to/csp` ใน Chromium และ `heic-to` ไม่อยู่ใน bundle แรก (E2E ข้อ 5.11)
- ยังไม่ได้ยืนยัน: Subcommand `git` ของ gitleaks (ดึง image ที่ล็อก digest ในเครื่องพัฒนาไม่ได้), CSP ของ `heic-to/csp` ใน Firefox, host ใน CSP ของ LINE และ Vercel Blob จริง, `git.deploymentEnabled` กับ Deploy Hook และคำเตือนของ `next start` กับ standalone (ไม่ได้รัน)
