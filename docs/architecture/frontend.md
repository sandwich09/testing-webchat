# Frontend

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

## เครื่องมือ

| หัวข้อ | เลือก |
| --- | --- |
| Styling | Tailwind CSS 4 |
| Component | แบบ shadcn/ui เฉพาะตัวที่ใช้: button, input, textarea, switch, dialog, sonner (toast), table, skeleton, tooltip และ select (เขียนเองทั้งหมดไม่มี package เพิ่ม) เขียนเองใน `src/common/ui/` ตามแบบของ shadcn ไม่ได้ใช้ CLI ของ shadcn รายการและ package อยู่ใน [project-setup](project-setup.md#shadcnui) |
| ไอคอน | lucide-react |
| การดึงข้อมูล | TanStack Query |
| State รวม | ไม่มี store กลาง ข้อมูลจาก server อยู่ใน cache ของ TanStack Query |
| ฟอร์ม | ฟอร์มธรรมดา ตรวจด้วย zod |
| วันเวลา | `Intl` ของ browser ระบุเขตเวลา `Asia/Bangkok` ทุกครั้ง |
| รูป | `<img>` ธรรมดา โหลดแบบ lazy |

เหตุผลอยู่ใน [ADR 0014](../adr/0014-ui-stack-and-theme.md)

## โครงหน้า

| หน้า | เนื้อหา |
| --- | --- |
| หน้ายินดีต้อนรับ | แสดงเมื่อยังไม่มี cookie ของรหัสเข้าใช้ ดู [access-gate](../specs/access-gate.md) |
| แชท | รายชื่อลูกค้า, ห้องแชท, แผงข้อมูลลูกค้า ดู [webchat-inbox](../specs/webchat-inbox.md) |
| ตั้งค่า | AI ตอบแทน, ขอบเขตหัวข้อ, LINE Official Account, คลังความรู้, ค่าใช้จ่าย AI, สถานะระบบ ดู [admin-backoffice](../specs/admin-backoffice.md) |

ทุกหน้าหลังเข้าระบบมีแถบเมนูซ้ายที่พับได้: แชท (พร้อมจำนวนยังไม่อ่าน), ตั้งค่า, ออกจากระบบ และปุ่มพับเมนู

การจัดวางตามขนาดจอ:

- กว้างตั้งแต่ 1040px: เมนู, รายชื่อ, ห้องแชท, แผงข้อมูล
- 720 ถึง 1040px: ซ่อนแผงข้อมูล
- แคบกว่า 720px: เมนูเป็นแถบด้านบน และแสดงรายชื่อหรือห้องแชททีละอย่าง

URL บอกว่าเปิดแชทของลูกค้าคนไหน จึง refresh แล้วอยู่ที่เดิม

โครงหน้าสูงเท่าหน้าต่างพอดี document ไม่เลื่อน เฉพาะคอลัมน์ด้านใน (รายชื่อ แชท แผงข้อมูล คอลัมน์ตั้งค่า) เลื่อนเอง ([ui-screens ข้อ 1.4](../specs/ui-screens.md#14-ช่วงความกว้างจอ))

## โฟลเดอร์

```
src/features/
  access/                           ชั้นเดียว
    access.api.ts  access.logic.ts  access.constants.ts  WelcomePage.tsx ...
  inbox/                            แบ่งตามพื้นที่ของหน้าแชท
    InboxPage.tsx                   จัดคอลัมน์ตามขนาดจอ
    inbox.api.ts                    เรียก API และตรวจคำตอบด้วย schema ใน contracts
    inbox.logic.ts                  ฟังก์ชันล้วนที่มากกว่าหนึ่งพื้นที่ใช้
    inbox.send.logic.ts             การส่งแบบ optimistic และการรวมหน้าของแชท (inbox.hooks.ts และ thread ใช้)
    inbox.hooks.ts                  hook ที่มากกว่าหนึ่งพื้นที่ใช้: useContacts, useSendMessage, useNow
    inbox.constants.ts              ข้อความบนหน้าจอและค่าคงที่
    list/                           รายชื่อลูกค้า
      ContactList.tsx  ContactSearch.tsx  ContactListTabs.tsx  ContactRow.tsx  ContactListSkeleton.tsx
      inbox.list.logic.ts
    thread/                         ห้องแชท แผงข้อมูล และ lightbox
      Thread.tsx  ThreadHeader.tsx  AiSwitch.tsx  MessageList.tsx  DayChip.tsx  MessageGroup.tsx
      MessageBubble.tsx  MediaContent.tsx  AudioPlayer.tsx  DeliveryStatus.tsx  SystemLine.tsx
      WelcomeCardBubble.tsx  NewMessagesButton.tsx  ThreadPlaceholder.tsx  InfoPanel.tsx  NotesBlock.tsx
      MediaLightbox.tsx
      inbox.thread.logic.ts  inbox.notes.logic.ts
      inbox.thread.hooks.ts         useContactDetail, useSetContactAi, useThread
      inbox.notes.hooks.ts  inbox.audio.hooks.ts   โน้ตของแอดมิน และตัวเล่นเสียง
    composer/                       ช่องตอบ ไฟล์แนบ และ ping การพิมพ์
      Composer.tsx  AttachmentTray.tsx
      inbox.attachment.logic.ts     state machine ของไฟล์แนบ และสิ่งที่ tray แสดง (ฟังก์ชันล้วน)
      inbox.attachment.controller.ts  ขั้นตอนแนบไฟล์ผ่านฟังก์ชันของ browser และ API ที่ส่งเข้ามา
      inbox.typing.controller.ts    ตัวจำกัดความถี่ของ ping การพิมพ์
      inbox.media.ts                เรียก API ของ browser: canvas, <video>, heic-to แบบ dynamic
      inbox.composer.hooks.ts       useDraft, useAttachment, useReleaseSentPreviews, useTypingPing
  settings/                         ชั้นเดียว ทุกส่วนใช้ SettingsSection และ settings.hooks.ts ร่วมกัน
    settings.api.ts  settings.logic.ts  settings.hooks.ts  settings.constants.ts
    settings.guard.api.ts  settings.guard.logic.ts  settings.guard.hooks.ts   ส่วนขอบเขตหัวข้อ
    SettingsPage.tsx  *Section.tsx ...
src/common/                         ของที่ใช้มากกว่าหนึ่ง feature
  ui/                               component แบบ shadcn/ui ที่เขียนเอง รวม select.tsx (ตัวเลือกค่าในธีม)
```

ไฟล์ใน `app/` ทำหน้าที่แค่ import component ของ feature

Feature แบ่งตามพื้นที่ของหน้าจอ ไม่แบ่งตามชนิด component เมื่อ feature มีหลายพื้นที่ที่แต่ละพื้นที่มีไฟล์ของตัวเองหลายไฟล์ แยกเป็นโฟลเดอร์ย่อยหนึ่งชั้นต่อพื้นที่ ไฟล์ที่มากกว่าหนึ่งพื้นที่ใช้อยู่ที่ระดับบนของ feature ไฟล์ที่ไม่ใช่ component ของพื้นที่เดียวตั้งชื่อ `<feature>.<พื้นที่>.<บทบาท>.ts` ตาม [code-style ข้อ 7](../guidelines/code-style.md#7-การตั้งชื่อไฟล์-review)

ที่อยู่ของ hook: hook ที่ใช้ในพื้นที่เดียวอยู่ใน `*.hooks.ts` ของพื้นที่นั้น hook ที่มากกว่าหนึ่งพื้นที่ใช้อยู่ใน `<feature>.hooks.ts` hook ที่มากกว่าหนึ่ง feature ใช้อยู่ใน `src/common/` ส่วน reducer, state machine และตัวจำกัดความถี่ที่ hook ใช้อยู่ใน `*.logic.ts` หรือ `*.controller.ts` ตาม [code-style ข้อ 8](../guidelines/code-style.md#8-หน้าจอ-review-ยกเว้นที่ระบุ)

`src/features/*/` โฟลเดอร์ย่อยของ feature และ `src/common/` ไม่มี `index.ts` ผู้ใช้ import ไฟล์ตรง เฉพาะไฟล์ `*.api.ts` เรียก `fetch` ได้ ใน `src/common/` คือ `common.api.ts` (`apiFetch`) lint บังคับทั้งสองข้อตาม [project-setup](project-setup.md#63-eslintconfigmjs) และโฟลเดอร์ย่อยเป็นส่วนของ element `feature` เดียวกัน

## การดึงข้อมูล

- หน้าเป็นโครงเปล่าจาก server ข้อมูลทั้งหมดมาจาก API ฝั่ง client ผ่านทางเดียวกับ polling
- Polling ทุก `POLL_INTERVAL_MS` หยุดเมื่อแท็บถูกซ่อน โหลดหน้าแรกใหม่เมื่อแท็บกลับมาแสดงโดยรวมเข้ากับสิ่งที่โหลดไว้ (ไม่ทิ้งหน้าที่เก่ากว่า) และรอบใหม่ไม่เริ่มจนกว่ารอบก่อนจะจบ
- Cursor คือ `updatedSeq` ฝั่ง server ตาม [protocol ของ polling](api-contract.md#protocol-ของ-polling) ซึ่งเห็นทั้งข้อความใหม่และการเปลี่ยนสถานะของข้อความเดิม หน้าเว็บรวมผลด้วย id ตาม [ui-screens](../specs/ui-screens.md#7-การดึงข้อมูลและ-state-ฝั่ง-client)
- ความล้มเหลวนับต่อ query: query ที่ล้มถ่วงเวลาของตัวเอง เมื่อ query ใดล้มติดกันถึงเกณฑ์ แสดงแถบ "การเชื่อมต่อมีปัญหา" และเมื่อ query ที่เคยล้มสำเร็จ โหลดหน้าแรกใหม่ครั้งเดียว ห่างกันไม่น้อยกว่าช่วงปกติ ([ADR 0028](../adr/0028-review-fixes-concurrency-polling-and-ci.md))
- ช่วง polling ตั้งค่าได้เพื่อให้ test ใช้ค่าสั้น
- ไม่ใช้ environment variable ที่ขึ้นต้นด้วย `NEXT_PUBLIC_` ค่าที่หน้าเว็บต้องรู้ขอจาก API

## การส่งข้อความ

- หน้าเว็บสร้าง id ของข้อความตั้งแต่กดส่ง แล้วแสดงข้อความทันที
- สถานะ: กำลังส่ง, ส่งแล้ว, ส่งไม่สำเร็จ พร้อมเหตุผลและปุ่ม "ส่งอีกครั้ง"
- Enter ส่ง และ Shift+Enter ขึ้นบรรทัดใหม่ โดยไม่ส่งขณะแป้นพิมพ์กำลังประกอบคำ

## Design system

ภาพตัวอย่างที่ใช้ตกลงสไตล์ทำไว้นอก repo ค่าด้านล่างคือข้อสรุปจากภาพนั้น

### สี

| Token | ค่า | ใช้กับ |
| --- | --- | --- |
| `page` | `#F3F1F5` | พื้นนอกแอป |
| `surface` | `#FFFFFF` | พื้นของแผง |
| `rail` | `#FAF8FB` | เมนูซ้ายและช่องค้นหา |
| `selected` | `#F7EEF3` | แถวที่เลือก |
| `line` | `#ECE6EB` | เส้นคั่น |
| `fg` | `#191327` | ตัวอักษรหลัก |
| `muted` | `#6A6375` | ตัวอักษรรอง |
| `accent` | `#F0055A` | สวิตช์ที่เปิด และจุดเน้นที่ไม่มีตัวอักษรทับ |
| `accent-strong` | `#D6094F` | ปุ่มหลักและตัวเลขยังไม่อ่าน (ตัวอักษรขาว) |
| `chat` | `#F5F3F7` | พื้นห้องแชท |
| `bubble-out` | `#FFE0EA` | ฟองข้อความฝั่งแอดมิน |
| `warn` | `#B04D05` | รอแอดมิน (เข้มพอให้ตัวอักษร 14px บนพื้น `selected` และแถบการเชื่อมต่อได้ contrast 4.5:1) |
| `danger` | `#C62828` | ส่งไม่สำเร็จ |
| `success` | `#0B7A43` | เชื่อมต่อแล้ว |

ไล่สีของแบรนด์มีสี่จุด: `#FF8A1F` → `#FF3D45` → `#F0055A` → `#C90B5E` ใช้ได้เฉพาะสี่ที่: พื้นหลังของหน้ายินดีต้อนรับ, โลโก้, ปุ่ม "เข้าระบบ" ของหน้ายินดีต้อนรับ (ช่วง `#E01E37` → `#D0084E`) และตัวอักษรตกแต่ง "application" ห้ามใช้ที่อื่น (ตัวอย่างการ์ดต้อนรับในหน้าตั้งค่าจึงใช้หัวสี `accent-strong` ทึบ ไม่ใช่ไล่สีแบบการ์ดจริงใน LINE) และไม่วางตัวอักษรขนาดเล็กบนไล่สี เพราะตัวอักษรขาวบนส้มอ่านยาก ค่าของมุมและตำแหน่งของแต่ละจุดอยู่ใน [ui-screens](../specs/ui-screens.md#22-รูปลักษณ์)

สีอ้างอิงโทนจากภาพหน้าจอที่เจ้าของงานเลือก โดยไม่ใช้โลโก้ ภาพประกอบ หรือข้อความของแบรนด์อื่น

### ตัวอักษร

- ฟอนต์: LINE Seed Sans TH รุ่น 1.003 น้ำหนัก Thin (100), Regular (400) และ Bold (700) ไฟล์ WOFF2 อยู่ใน `src/common/fonts/line-seed-sans-th/` พร้อมไฟล์สัญญา `OFL.txt` และโหลดแบบ local ดู [ADR 0018](../adr/0018-use-line-seed-sans-th.md)
- Thin ใช้เฉพาะตัวอักษรตกแต่งขนาด 16px ขึ้นไป เช่น คำว่า "application" บนหน้ายินดีต้อนรับ ไม่ใช้กับข้อความที่ต้องอ่าน
- ชื่อฟอนต์กำหนดเป็นตัวแปร CSS ตัวเดียว และมีชุดสำรองเป็นฟอนต์ไทยของระบบ
- ข้อความที่ต้องอ่านไม่เล็กกว่า 14px ไม่มีอะไรเล็กกว่า 12px
- ช่องกรอกบนมือถือ 16px เพื่อไม่ให้ iPhone ซูมหน้าจอ
- ระยะบรรทัดไม่ต่ำกว่า 1.5 และข้อความที่ถูกตัดให้เหลือบรรทัดเดียวต้องไม่ตัดสระบนล่าง
- ตัวเลขในคอลัมน์ใช้ `tabular-nums` และชิดขวา

### รูปทรง

- ปุ่มหลักและช่องค้นหาเป็นทรงแคปซูล
- ช่องกรอกมุมโค้ง 12 ถึง 14px
- แผงใช้เส้นคั่นบาง ไม่ใช้การ์ดซ้อนการ์ด
- ฟองข้อความโค้ง 17px มุมที่ชี้ไปหาผู้ส่งโค้งน้อยกว่า และข้อความที่ส่งติดกันจัดเป็นกลุ่ม
- เวลาอยู่ข้างฟองข้อความ พร้อมผู้ส่งฝั่งแอดมิน: "คุณ" หรือ "AI"

### Popup และ dropdown

- แอปไม่ใช้ control ที่ browser หรือระบบปฏิบัติการวาด popup เอง (`<select>`, `<datalist>`, `<input type="date">`, `month`, `time`, `color`) เพราะสี ตัวอักษร และพื้นของ popup นั้นไม่ตามธีม ทุก dropdown ใช้ `Select` ใน `src/common/ui/select.tsx` ([ui-screens ข้อ 1.8](../specs/ui-screens.md#18-select))
- popup ใช้พื้น `surface` ขอบ 1px `line` มุม 14px และเงา token `shadow-popover` (`0 12px 32px` สี `fg` ความทึบ 14% ประกาศใน `app/globals.css`) แถวที่ชี้หรือเลือกด้วยคีย์บอร์ดพื้น `selected` ค่าที่เลือกเป็นสี `accent-strong` พร้อมไอคอนถูก
- `<input type="file">` ยังใช้ได้ เพราะเปิดหน้าต่างเลือกไฟล์ของระบบ ไม่ใช่ popup ในหน้า และ `title` ใช้เฉพาะเป็นคำอธิบายของข้อความที่ถูกตัด ไม่ใช้เป็นเมนู

### Brand assets

ไอคอนหนึ่งแบบใช้ทั้งแท็บของ browser และรูปโปรไฟล์ของ LINE OA มาจากไอคอนโลโก้ของเมนูซ้าย: สี่เหลี่ยมมุมโค้งพื้น brand gradient (`--brand-gradient` 100deg ส้มไปชมพูบานเย็น) กับตัว "T" สีขาวที่วาดเป็น path จึงไม่ขึ้นกับฟอนต์และเหมือนกันทุกเครื่อง แบนราบ ไม่มีเงาหรือเอฟเฟกต์ อ่านได้ที่ 16px

| ไฟล์ | ใช้ที่ | ที่มา |
| --- | --- | --- |
| `public/brand/app-icon.svg` | ต้นฉบับของไอคอน (มุมโค้ง พื้นโปร่งที่มุม) | เขียนเอง |
| `app/icon.svg` | `<link rel="icon" type="image/svg+xml" sizes="any">` ของ Next.js (Chromium, Firefox) | สำเนาที่สคริปต์เขียน |
| `app/favicon.ico` | `<link rel="icon" sizes="any">` สำหรับ browser ที่ไม่ใช้ SVG (Safari) ภาพ PNG ขนาด 16, 32, 48 | สคริปต์ |
| `app/apple-icon.png` | `apple-touch-icon` 180×180 เต็มพื้น (iOS ใส่มุมโค้งเอง) | สคริปต์ จาก `line-profile.svg` |
| `public/brand/line-profile.svg` | ต้นฉบับของรูปโปรไฟล์ LINE เต็มพื้นไม่มีมุม เพราะ LINE ตัดเป็นวงกลม ตัว "T" อยู่ใน 60% กลางภาพ จึงอยู่ในวงกลมเสมอ | เขียนเอง |
| `public/brand/line-profile-640.png`, `line-profile-1024.png` | ไฟล์ที่เจ้าของงานอัปโหลดเป็นรูปโปรไฟล์ของ LINE OA ([line-oa-setup](../runbooks/line-oa-setup.md#7-รูปโปรไฟล์ของ-line-oa)) | สคริปต์ |
| `public/brand/app-icon-512.png` | ไอคอนแบบ PNG ที่ URL สาธารณะ (`APP_BASE_URL/brand/app-icon-512.png`) | สคริปต์ |

ไฟล์ PNG และ ICO สร้างด้วย `pnpm exec tsx scripts/render-brand-assets.ts` ซึ่งใช้ Chromium ของ Playwright ที่มีอยู่แล้ว (ไม่มี dependency ใหม่) แก้ต้นฉบับ SVG แล้วรันใหม่และ commit ไฟล์ทั้งหมด `e2e/render-brand-assets.unit.ts` ตรวจขนาดของทุกไฟล์และว่า `app/icon.svg` ตรงกับต้นฉบับ path ของไฟล์เหล่านี้อยู่นอกด่าน cookie ของ `proxy.ts` (ดู [project-setup](project-setup.md#proxyts)) และมาจาก `'self'` จึงผ่าน `img-src` ของ CSP

### สถานะของทุกหน้า

ทุกหน้าและทุกแผงต้องมีครบ: กำลังโหลด, ว่างเปล่าพร้อมคำแนะนำ, ผิดพลาด และปกติ แต่ละส่วนของหน้าแชทมี error boundary แยกกัน

## การเข้าถึง

- ใช้งานด้วยคีย์บอร์ดได้ทุกจุด และเห็นตำแหน่ง focus
- สถานะไม่บอกด้วยสีอย่างเดียว
- พื้นที่กดบนมือถือไม่เล็กกว่า 44px
- เคารพการตั้งค่าลดการเคลื่อนไหว
- ตรวจด้วย axe ใน E2E
