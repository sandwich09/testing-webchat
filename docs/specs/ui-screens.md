# หน้าจอ: component, state และพฤติกรรม

> สถานะ: สร้างแล้ว · อัปเดตล่าสุด: 2026-11-19

เอกสารนี้แปลง spec ของแต่ละ feature เป็นสิ่งที่ต้องสร้างบนหน้าจอ: component อยู่ไฟล์ไหน ถือ state อะไร เรียก API function ไหน มีสถานะใดบ้าง ขนาดเท่าไร กดคีย์บอร์ดแล้วเกิดอะไร และ `data-testid` ที่ E2E ใช้

- พฤติกรรมทางธุรกิจอยู่ใน spec ของ feature: [access-gate](access-gate.md), [webchat-inbox](webchat-inbox.md), [admin-backoffice](admin-backoffice.md), [knowledge-base](knowledge-base.md), [usage-cost](usage-cost.md), [ai-reply](ai-reply.md), [topic-guard](topic-guard.md), [line-messaging](line-messaging.md)
- Token สี กฎตัวอักษร รูปทรง และช่วงความกว้างจออยู่ใน [frontend](../architecture/frontend.md) เอกสารนี้อ้างชื่อ token เท่านั้น
- ข้อความบนหน้าจอทุกคำอยู่ใน [ui-copy](ui-copy.md) เอกสารนี้อ้างด้วยชื่อ constant เช่น `inbox.list.title`
- ข้อความ error ตามรหัสจาก server อยู่ใน [error-catalog](../architecture/error-catalog.md)
- โครงโฟลเดอร์และการตั้งชื่อไฟล์ตาม [code-style](../guidelines/code-style.md) ข้อ 7 ถึง 9

## 1. ฐานร่วม

### 1.1 ฟอนต์

ใช้ LINE Seed Sans TH สามน้ำหนัก: Thin 100 (`LINESeedSansTH_W_Th.woff2`), Regular 400 (`_Rg`) และ Bold 700 (`_Bd`) ไฟล์อยู่ใน `src/common/fonts/line-seed-sans-th/` โหลดด้วย `next/font/local` และประกาศเป็น CSS variable เดียวคือ `--font-sans` ซึ่ง Tailwind ใช้เป็น `font-sans` เหตุผลอยู่ใน [ADR 0018](../adr/0018-use-line-seed-sans-th.md)

- ทุกที่ในเอกสารนี้ "ตัวหนา" คือ 700 และ "ปกติ" คือ 400
- Thin 100 ใช้ได้เฉพาะข้อความตกแต่งขนาด 16px ขึ้นไปที่ไม่ใช่ข้อความที่ต้องอ่าน ตอนนี้มีที่เดียวคือบรรทัด "application" บนหน้ายินดีต้อนรับ
- ห้ามระบุน้ำหนักอื่น เพราะ browser จะสังเคราะห์ตัวหนาหรือตัวบางปลอมขึ้นมา
- เปลี่ยนฟอนต์ได้ด้วยการแก้ `--font-sans` จุดเดียว

### 1.2 ขนาดตัวอักษรที่ใช้

| ชื่อในเอกสารนี้ | ขนาด / ระยะบรรทัด | ใช้กับ |
| --- | --- | --- |
| `text-body` | 15px / 1.55 | เนื้อข้อความในฟอง, ค่าในแผงข้อมูล, คำอธิบายในตั้งค่า |
| `text-name` | 15px / 1.5 ตัวหนาเมื่อระบุ | ชื่อผู้ใช้ในรายชื่อและส่วนหัว |
| `text-sub` | 14px / 1.5 | ข้อความล่าสุดในรายชื่อ, บรรทัดรองของส่วนหัว, ป้ายสถานะข้อความ |
| `text-meta` | 12px / 1.5 | เวลาในรายชื่อและข้างฟอง, ป้ายวันที่, ตัวเลขยังไม่อ่าน, hint ใต้ช่องพิมพ์ |
| `text-title` | 20px / 1.4 ตัวหนา | หัวคอลัมน์ "แชท", หัวหน้าตั้งค่า |
| `text-section` | 16px / 1.5 ตัวหนา | หัวส่วนในหน้าตั้งค่า, หัว dialog |

- `text-meta` ใช้เฉพาะข้อมูลที่อ่านประกอบ ข้อความที่ต้องอ่านใช้ 14px ขึ้นไป ตาม [frontend](../architecture/frontend.md)
- ช่องกรอกทุกช่องเป็น 16px เมื่อจอแคบกว่า 720px และ 15px เมื่อกว้างกว่า
- ข้อความที่ตัดเหลือบรรทัดเดียวใช้ `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` บนกล่องที่มี `line-height` ไม่ต่ำกว่า 1.5 และ `padding-block` 2px เพื่อไม่ตัดสระบนล่าง

### 1.3 ระยะและขนาดคงที่

ค่าทั้งหมดอยู่ใน `src/common/layout.constants.ts` ค่าของแต่ละตัวอยู่ในตาราง [ค่าคงที่ของหน้าจอ](../architecture/project-setup.md#105-หน้าจอ) ที่เดียว เอกสารนี้อ้างด้วยชื่อ:

`RAIL_WIDTH_EXPANDED`, `RAIL_WIDTH_COLLAPSED`, `RAIL_STRIP_HEIGHT`, `LIST_WIDTH`, `INFO_WIDTH`, `THREAD_HEADER_HEIGHT`, `AVATAR_LIST`, `AVATAR_HEADER`, `AVATAR_GROUP`, `AVATAR_INFO`, `BUBBLE_RADIUS`, `BUBBLE_TAIL_RADIUS`, `BUBBLE_MAX_WIDTH`, `TAP_MIN`, `BP_WIDE`, `BP_NARROW`

ค่าที่เขียนเป็น px ในหัวข้ออื่นของเอกสารนี้เป็นค่าของสไตล์ในจุดนั้น ไม่ใช่ constant ที่ใช้ร่วม

### 1.4 ช่วงความกว้างจอ

| ชื่อ | เงื่อนไข | โครง |
| --- | --- | --- |
| `wide` | ≥ 1040px | เมนูซ้าย, รายชื่อ 296px, แชท (ที่เหลือ), แผงข้อมูล 256px เมื่อเปิด |
| `medium` | 720 ถึง 1039px | เมนูซ้าย, รายชื่อ 296px, แชท แผงข้อมูลซ่อนโดยค่าเริ่มต้น เปิดแล้วเป็น sheet ทับขอบขวาของแชท |
| `narrow` | < 720px | เมนูเป็นแถบบน สูง 56px แสดงรายชื่อหรือแชททีละอย่างตาม URL แผงข้อมูลเปิดแล้วเต็มจอ |

ทุกช่วง: หน้าไม่มีการเลื่อนแนวนอน ตารางที่กว้างกว่าจอเลื่อนแนวนอนภายในกล่องของตัวเอง

การเลื่อนแนวตั้งของหน้าหลังเข้าระบบ: document ไม่เลื่อนเลย (`scrollHeight` ของ document เท่ากับความสูงของหน้าต่างทุกหน้า) กล่องนอกสุดของ `AppShell` สูงเท่าหน้าต่าง (`100dvh` และ `100vh` สำรองเมื่อ browser ไม่รองรับ `dvh`) เป็น `position: relative` และ `overflow: hidden` จึงเป็น containing block ของทุก element ที่วางแบบ absolute ภายใน (เช่นข้อความ `sr-only` ในรายการที่เลื่อน) และตัดส่วนเกิน เฉพาะกล่องด้านในเลื่อน: รายการผู้ใช้, พื้นที่ข้อความ, แผงข้อมูล และคอลัมน์ของหน้าตั้งค่า แต่ละกล่องเป็น flex item ที่มี `min-h-0` เมนูซ้ายสูงเต็มหน้าต่าง ปุ่มออกจากระบบและพับเมนูอยู่ล่างสุดของหน้าต่างเสมอ popup ที่วางนอกกล่องเหล่านี้ (`Select`, dialog, toast, tooltip) เป็น `position: fixed` E2E ตรวจข้อนี้ใน journey 4 ([stubs-and-fixtures](../qa/stubs-and-fixtures.md))

### 1.5 URL

| URL | แสดง |
| --- | --- |
| `/` | redirect ไป `/chats` |
| `/chats` | หน้าแชท ยังไม่เลือกผู้ใช้ (จอแคบ: รายชื่อ) |
| `/chats/[contactId]` | หน้าแชทของผู้ใช้คนนั้น (จอแคบ: แชทเต็มจอ) |
| `/settings` | หน้าตั้งค่า |

ไม่มี cookie ที่ถูกต้อง: `proxy.ts` rewrite ทุก URL ไปหน้ายินดีต้อนรับโดย URL เดิมไม่เปลี่ยน ([project-setup](../architecture/project-setup.md#proxyts)) เข้าระบบแล้ว `router.refresh()` จึงอยู่หน้าเดิม ([access-gate](access-gate.md) ข้อ 1) Path ของหน้าเว็บกำหนดใน [project-setup](../architecture/project-setup.md#3-โครงโฟลเดอร์)

### 1.6 การเรียก API

- ทุก component เรียกผ่าน `<feature>.api.ts` ([code-style](../guidelines/code-style.md) ข้อ 8)
- `src/common/common.api.ts` มี `apiFetch` ตัวเดียวที่ทุก `*.api.ts` ใช้: ส่ง `credentials: "same-origin"`, `cache: "no-store"`, ตรวจ response ด้วย schema ใน `src/contracts/` และแปลง error body เป็น `ApiError { code, status, requestId }`
- ไม่มี response (เครือข่ายล่มหรือเกินเวลารอ) ได้ `ApiError` รหัส `client.network` เวลารอเริ่มต้นคือ `CLIENT_REQUEST_TIMEOUT_MS` คำขอที่งานฝั่ง server นานกว่านั้นส่ง `timeoutMs` จาก `src/contracts/timeouts.contract.ts` (ทดสอบขอบเขตหัวข้อ, publish และนำ rich menu ออก, บันทึกและทดสอบ credential ของ LINE) และการอัปโหลด PDF แบบ multipart ใช้ `uploadTimeoutMs(file.size)` ค่าเหล่านี้ครอบเวลาแย่ที่สุดฝั่ง server ซึ่ง `timing-budget.spec.ts` ตรวจ ([error-catalog](../architecture/error-catalog.md#รหัสฝั่ง-client)) ข้อความอยู่ใน [ui-copy](ui-copy.md) `common.error.network`
- Status 401 จาก API ใดก็ตาม: `apiFetch` เรียก `onUnauthorized()` ที่ `AppProviders` ลงทะเบียนไว้ ซึ่งล้าง cache ของ TanStack Query แล้วแสดงหน้ายินดีต้อนรับ
- Type ของ request และ response คือ DTO ใน [api-contract](../architecture/api-contract.md#dto-ร่วม) ซึ่ง `src/contracts/` export เป็น zod schema เอกสารนี้ใช้ชื่อ field ของ DTO ตรงตัว

ตาราง function กับ endpoint (หนึ่ง function ต่อหนึ่ง endpoint):

| ไฟล์ | Function | Endpoint ใน api-contract | Response |
| --- | --- | --- | --- |
| `src/features/access/access.api.ts` | `unlock(code: string): Promise<void>` | `POST /api/access/unlock` | 204 |
| | `lock(): Promise<void>` | `POST /api/access/lock` | 204 |
| `src/common/common.api.ts` | `getSettings(): Promise<SettingsDto>` | `GET /api/settings` | `SettingsDto` |
| `src/features/inbox/inbox.api.ts` | `listContacts(params: { filter: ContactFilter; q?: string; before?: string } \| { afterUpdatedSeq: string }): Promise<ContactsPage>` | `GET /api/contacts` | `{ contacts, before, hasMore, highWater, counts, lineConfigured }` |
| | `getContact(id: string): Promise<ContactDetailDto>` | `GET /api/contacts/:id` | `ContactDetailDto` |
| | `setContactAi(id: string, aiEnabled: boolean): Promise<ContactDto>` | `PATCH /api/contacts/:id` | `ContactDto` |
| | `markContactRead(id: string): Promise<ContactDto>` | `POST /api/contacts/:id/read` | `ContactDto` |
| | `getMessages(id: string, params: { beforeSeq?: string; afterUpdatedSeq?: string; limit?: number }): Promise<MessagesPage>` | `GET /api/contacts/:id/messages` | `{ messages, hasOlder, hasMore, highWater }` |
| | `sendMessage(id: string, body: { id: string; kind: "text"; text: string } \| { id: string; kind: "image" \| "video"; uploadId: string; contentType: string }): Promise<MessageDto>` | `POST /api/contacts/:id/messages` | `MessageDto` |
| | `retryMessage(id: string, messageId: string): Promise<MessageDto>` | `POST /api/contacts/:id/messages/:messageId/retry` | `MessageDto` |
| | `notifyTyping(id: string): Promise<{ shown: boolean }>` | `POST /api/contacts/:id/typing` | `{ shown }` |
| | `requestUpload(body: { kind: "image" \| "video"; contentType: string; sizeBytes: number; preview: { contentType: "image/jpeg"; sizeBytes: number } }): Promise<UploadTicketDto>` | `POST /api/uploads` | `UploadTicketDto` |
| | `cancelUpload(uploadId: string): Promise<void>` | `DELETE /api/uploads/:uploadId` | 204 |
| | `uploadToTarget(target: UploadTargetDto, blob: Blob, opts: { onProgress(pct: number \| null): void; signal: AbortSignal }): Promise<void>` | `PUT /api/local-storage/*key` เมื่อ `strategy` เป็น `http_put` (เมื่อเป็น `vercel_blob_client` ส่งตรงเข้า Vercel Blob ซึ่งไม่ใช่ endpoint ของแอป) | 200 |
| `src/features/settings/settings.api.ts` | `updateSettings(patch: SettingsPatch): Promise<SettingsDto>` | `PATCH /api/settings` | `SettingsDto` |
| | `saveLineCredentials(body: { channelId: string; channelSecret: string; channelAccessToken: string }): Promise<LineBotInfo>` | `PUT /api/settings/line-credentials` | `{ botName, basicId, secretStatus }` |
| | `testLineConnection(): Promise<LineBotInfo>` | `POST /api/settings/line/test` | `{ botName, basicId, secretStatus }` |
| `src/features/settings/settings.guard.api.ts` | `testTopicGuard(text: string): Promise<GuardTestResult>` | `POST /api/settings/guard/test` | `{ allowed, matchedTopic, costUsd }` |
| | `listKbDocuments(): Promise<KbDocumentsList>` | `GET /api/knowledge/documents` | `{ documents, usedTokens, capacityTokens }` |
| | `uploadKbDocument(file: File): Promise<DocumentDto>` | `POST /api/knowledge/documents` | `DocumentDto` (202) |
| | `getKbDocument(id: string): Promise<DocumentDetailDto>` | `GET /api/knowledge/documents/:id` | `DocumentDetailDto` |
| | `deleteKbDocument(id: string): Promise<void>` | `DELETE /api/knowledge/documents/:id` | 204 |
| | `retryKbDocument(id: string, file: File): Promise<DocumentDto>` | `POST /api/knowledge/documents/:id/retry` | `DocumentDto` (202) |
| | `getUsage(month: string): Promise<UsageReport>` | `GET /api/usage` (`?month=YYYY-MM`) | `{ month, priceTableDate, contacts, ingest, totalCostUsd, replyCount, averageCostPerReplyUsd }` |
| | `getUsageDetail(contactId: string, month: string): Promise<UsageRecordDto[]>` | `GET /api/usage/contacts/:id` (`?month=YYYY-MM`) | `{ records }` |
| | `getSystemStatus(): Promise<SystemStatusDto>` | `GET /api/system/status` | `SystemStatusDto` |

`SettingsPatch` คือ body ของ `PATCH /api/settings` ส่วน `ContactsPage`, `MessagesPage`, `KbDocumentsList`, `UsageReport` และ `GuardTestResult` คือ response ในคอลัมน์ขวาตามชื่อ field เดียวกัน

### 1.7 ไฟล์ร่วมใน `src/common/`

| ไฟล์ | หน้าที่ |
| --- | --- |
| `AppProviders.tsx` | `QueryClientProvider`, toast, ลงทะเบียน `onUnauthorized` |
| `AppShell.tsx` | โครงหน้าหลังเข้าระบบ: เมนู + เนื้อหา + แถบการเชื่อมต่อ |
| `AppRail.tsx` | เมนูซ้ายและแถบบนเมื่อจอแคบ |
| `ConnectionBanner.tsx` | แถบ "การเชื่อมต่อมีปัญหา" |
| `ContactAvatar.tsx` | รูปหรือตัวอักษรแรกบนสีทึบ |
| `SectionErrorBoundary.tsx` | error boundary ต่อส่วน |
| `ErrorState.tsx`, `EmptyState.tsx` | กล่องข้อความ error พร้อมปุ่มลองอีกครั้ง และกล่องว่างพร้อมคำแนะนำ |
| `ConfirmDialog.tsx` | dialog ยืนยันสองปุ่ม |
| `query-keys.ts` | key ของ TanStack Query ทั้งหมด (ข้อ 7) |
| `polling.ts` | `usePollingInterval()` คืนช่วง polling และการถ่วงเวลา (ข้อ 7.4) |
| `common.hooks.ts` | `useSettings()` ที่เมนู หน้าแชทและหน้าตั้งค่าใช้ร่วมกัน และ `useHydrated()` ที่เป็น `false` ระหว่าง render ฝั่ง server และ hydration แล้วเป็น `true` ใช้กับข้อความที่ขึ้นกับ browser (เช่นนาฬิกา) ที่แสดงก่อนมีข้อมูลจาก API และกับรายชื่อผู้ใช้ (ข้อ 4.3) |
| `toast.ts` | `showToast(tone, text)` ทางเดียวที่แสดง toast (ข้อ 10) |
| `useStoredFlag.ts` | ค่า boolean ใน `localStorage` (`tw.railCollapsed`, `tw.infoPanelOpen`) ที่ render ฝั่ง server และ hydration ใช้ค่าเริ่มต้นเสมอ แล้วอ่านค่าที่เก็บหลัง hydration (`useSyncExternalStore`) |
| `common.api.ts`, `common.logic.ts`, `common.constants.ts`, `layout.constants.ts` | ตามชื่อ |
| `ui/select.tsx`, `ui/select.logic.ts` | `Select` ตัวเลือกแบบรายการในธีมของแอป (ข้อ 1.8) และฟังก์ชันล้วนของมัน |

`ContactAvatar` props: `{ name: string; pictureUrl: string | null; contactId: string; size: 28 | 32 | 44 | 56 }` แสดง `<img loading="lazy" alt="">` ถ้าโหลดรูปไม่ได้ (`onError`) หรือไม่มี URL แสดงวงกลมสี `avatarColor(contactId)` กับตัวอักษร `initialOf(name)` สีขาว ตัวหนา ขนาด 40% ของวงกลม `alt` ว่างเพราะชื่ออยู่ข้างรูปเสมอ

### 1.8 `Select`

ตัวเลือกค่าเดียวจากรายการ (`src/common/ui/select.tsx`) แบบ WAI-ARIA "select-only combobox" ทุก dropdown ของแอปใช้ตัวนี้ แอปไม่ใช้ control ที่ browser หรือระบบปฏิบัติการวาด popup เอง (`<select>`, `<datalist>`, `<input type="date|month|time|color">`) เพราะไม่ตามธีม ([frontend](../architecture/frontend.md#design-system))

Props: `{ options: { value; label }[]; value: V | null; onValueChange(value: V): void; "aria-labelledby"?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; name?: string; disabled?: boolean; pending?: boolean; placeholder?: string; testId?: string; optionTestId?: string; className?: string }`

| ส่วน | ค่า |
| --- | --- |
| ปุ่ม (trigger) | `<button role="combobox" aria-haspopup="listbox">` มี `aria-expanded`, `aria-controls` (เมื่อเปิด), `aria-activedescendant` และชื่อจากป้ายของแถว (`aria-labelledby`) หรือ `aria-label` รูปเดียวกับช่องกรอก: สูง 40px (จอแคบ 44px) มุม 13px ขอบ 1px `line` พื้น `surface` ตัวอักษร 15px (จอแคบ 16px) hover พื้น `rail` focus ขอบ `accent-strong` และวง 3px ข้อความของค่าที่เลือกตัดบรรทัดเดียว ไอคอน `ChevronDown` สี `muted` หมุนเมื่อเปิด `data-value` คือค่าที่เลือก `data-state` เป็น `open` หรือ `closed` |
| กำลังบันทึก (`pending`) | ไอคอน `Loader2` หมุนแทนลูกศร `aria-busy` และเปิดรายการไม่ได้ |
| ปิดใช้ (`disabled`) | `disabled` ความทึบ 0.5 |
| รายการ | `<ul role="listbox">` ชื่อเดียวกับปุ่ม วางผ่าน portal ที่ `<body>` แบบ `position: fixed` จึงไม่ถูกกล่องที่เลื่อนตัด พื้น `surface` ขอบ 1px `line` มุม 14px เงา `shadow-popover` padding 6px กว้างอย่างน้อยเท่าปุ่มและเท่าที่ป้ายยาวที่สุดต้องใช้ ไม่เกินหน้าต่างลบขอบ 8px ทั้งสองข้าง ใต้ปุ่มห่าง 4px ถ้าข้างล่างไม่พอและข้างบนมีที่มากกว่าเปิดขึ้นบน (`data-side`) สูงสุด 320px หรือเท่าที่เหลือในหน้าต่าง แล้วเลื่อนในตัว |
| ตัวเลือก | `<li role="option" aria-selected>` สูงอย่างน้อย 40px (จอแคบ 44px) มุม 10px ตัวเลือกที่ active (เมาส์ชี้หรือคีย์บอร์ด) พื้น `selected` และ `data-active` ค่าที่เลือกเป็นตัวหนาสี `accent-strong` พร้อมไอคอน `Check` ท้ายแถว (ไม่บอกด้วยสีอย่างเดียว) `data-value` คือค่า |
| ฟอร์ม | มี `name` แล้วมี `<input type="hidden">` ที่มีค่าที่เลือก |

คีย์บอร์ด (focus อยู่ที่ปุ่มตลอด):

| ปุ่ม | ปิดอยู่ | เปิดอยู่ |
| --- | --- | --- |
| Enter, Space, ArrowDown, ArrowUp | เปิด active ที่ค่าที่เลือก | Enter/Space เลือกแล้วปิด ArrowDown/ArrowUp เลื่อนทีละหนึ่งไม่วนรอบ |
| Home, End | เปิดที่ตัวแรก / ตัวสุดท้าย | ไปตัวแรก / ตัวสุดท้าย |
| PageUp, PageDown | | เลื่อนทีละ `SELECT_PAGE_STEP` |
| ตัวอักษร | เปิดที่ตัวเลือกที่ขึ้นต้นด้วยตัวอักษรนั้น | ไปตัวเลือกที่ขึ้นต้นด้วยคำที่พิมพ์ภายใน `SELECT_TYPEAHEAD_RESET_MS` พิมพ์ตัวเดิมซ้ำวนไปตัวถัดไปที่ขึ้นต้นด้วยตัวนั้น |
| Escape | | ปิดโดยไม่เปลี่ยนค่า |
| Tab | | ปิดโดยไม่เปลี่ยนค่า แล้ว focus ไปตัวถัดไปตามปกติ |

คลิกนอกปุ่มและรายการปิดรายการ การเลือกด้วยเมาส์ปิดรายการและ focus กลับที่ปุ่ม การเลือกค่าเดิมไม่เรียก `onValueChange` ฟังก์ชันล้วน `nextOptionIndex`, `opensList`, `isTypeaheadKey`, `typeaheadMatch` และ `placePopup` อยู่ใน `select.logic.ts` พร้อม unit test

## 2. หน้ายินดีต้อนรับ

### 2.1 Component

```
src/features/access/
  WelcomePage.tsx        พื้นหลัง วงกลมตกแต่ง และการ์ด
    AccessForm.tsx       ช่องรหัส ปุ่มตา บรรทัด error ปุ่มเข้าระบบ
  access.api.ts          unlock, lock
  access.logic.ts        validateAccessCode
  access.constants.ts
```

`AccessForm` state:

| State | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `code` | string | ไม่ถูกล้างเมื่อรหัสผิด |
| `visible` | boolean | สลับ `type="password"` กับ `type="text"` |
| `status` | `"idle" \| "submitting"` | |
| `errorText` | string \| null | จาก `validateAccessCode` หรือ error catalog |

ใช้ `useMutation(unlock)` สำเร็จแล้ว `router.refresh()`

### 2.2 รูปลักษณ์

| ส่วน | ค่า |
| --- | --- |
| พื้นหลัง | เต็มจอ `linear-gradient(100deg, #FF8A1F 0%, #FF3D45 42%, #F0055A 72%, #C90B5E 100%)` |
| วงกลมตกแต่ง | 4 วง `aria-hidden` สีขาวโปร่ง: 420px ที่มุมซ้ายบนเลื่อนออกนอกจอ (-140px, -120px) ความทึบ 0.12, 260px มุมขวาล่าง (-80px, -60px) 0.10, 140px ขวาบน (top 12%, right 8%) 0.16, 90px ซ้ายล่าง (bottom 14%, left 10%) 0.14 |
| การ์ด | `surface`, มุมโค้ง 26px, เงา `0 24px 60px rgba(25,19,39,.18)`, กว้างสุด 440px, padding 40px (จอแคบ 28px 20px), จัดกลางจอ |
| ป้าย | ทรงแคปซูล พื้น `bubble-out` ผสม `surface` ครึ่งต่อครึ่ง (`color-mix` 50%) เพื่อให้ตัวอักษรได้ contrast 4.5:1 ตัวอักษร `accent-strong` 14px ตัวหนา padding 4px 12px ข้อความ `access.cover.badge` |
| หัวข้อ | `<h1>` 32px ตัวหนา สี `fg` ข้อความ `access.cover.title` |
| บรรทัด "application" | อยู่ใน `<h1>` เดียวกันเป็น `<span>` แสดงเป็นบรรทัดใหม่ 16px น้ำหนัก 100 (Thin, ข้อความตกแต่งตามข้อ 1.1) `letter-spacing: .34em` ตัวอักษรไล่สี `linear-gradient(90deg, #E01E37, #C90B5E)` ด้วย `background-clip: text` ขนาบด้วยเส้นบาง 2 เส้น ยาว 28px สูง 1px ที่จางจากสี `line` เป็นโปร่งใสออกด้านนอก เส้นเป็น `aria-hidden` |
| Sheen | เล่นครั้งเดียวตอนโหลด: แสงขาวโปร่งวิ่งผ่านตัวอักษร "application" 1.6s ease-out หลังรอ 300ms ไม่เล่นเมื่อ `prefers-reduced-motion: reduce` |
| ช่องรหัส | สูง 50px, มุมโค้ง 14px, ขอบ 1px `line`, พื้น `rail`, padding ซ้าย 16px ขวา 52px, placeholder `access.form.placeholder`, `autocomplete="current-password"`, `<label>` ซ่อนด้วย `sr-only` ข้อความ `access.form.label` |
| ปุ่มตา | ไอคอน lucide `Eye` / `EyeOff` 20px สี `muted` ในกล่อง 44×44 ชิดขวาในช่อง `aria-label` สลับ `access.form.showCode` / `access.form.hideCode`, `aria-pressed` ตาม `visible` |
| บรรทัด error | ใต้ช่อง 14px สี `danger` นำด้วยไอคอน `AlertCircle` 16px ที่อยู่กึ่งกลางของบรรทัดแรกของข้อความ, `id` ผูกกับช่องด้วย `aria-describedby` และ `role="alert"` (กล่องนี้อยู่ในหน้าเสมอแม้ไม่มีข้อความ) จองความสูงไว้หนึ่งบรรทัด (`min-height` 22px) เพื่อไม่ให้ปุ่มกระโดดเมื่อข้อความขึ้นบรรทัดเดียว ข้อความที่ยาวกว่าหนึ่งบรรทัดทำให้กล่องสูงขึ้นและดันปุ่มลง ห้ามกำหนดความสูงตายตัวหรือวางแบบ absolute เพราะข้อความที่ตัดบรรทัดจะทับปุ่ม |
| ปุ่มเข้าระบบ | ทรงแคปซูล สูง 50px กว้างเต็มการ์ด `linear-gradient(90deg, #E01E37, #D0084E)` ตัวอักษรขาว 16px ตัวหนา ข้อความ `access.form.submit` |

ระยะ: ป้าย → หัวข้อ 16px, หัวข้อ → ช่อง 32px, ช่อง → บรรทัด error 6px, บรรทัด error → ปุ่ม 12px ทุกอย่างในการ์ดจัดกลาง ยกเว้นช่องและปุ่มที่เต็มความกว้าง

### 2.3 สถานะ

| สถานะ | แสดง |
| --- | --- |
| ปกติ | ตามข้อ 2.2 ช่องรหัสได้ focus อัตโนมัติเมื่อจอ ≥ 720px |
| ช่องว่างแล้วกดเข้าระบบ | ไม่เรียก server, `access.error.empty`, focus กลับช่อง |
| กำลังส่ง | ปุ่มแสดง spinner 18px แทนข้อความ ความกว้างเดิม `aria-busy="true"` กดซ้ำไม่ได้ ช่องยังพิมพ์ได้ |
| รหัสผิด / ลองถี่เกิน / ระบบผิดพลาด | ข้อความจาก [error-catalog](../architecture/error-catalog.md) ตามรหัส ค่าที่พิมพ์ยังอยู่ และถูกเลือกทั้งหมด (`select()`) เพื่อพิมพ์ทับได้ทันที |
| ไม่มีเครือข่าย | `common.error.network` |

ไม่มีสถานะกำลังโหลดหรือว่างเปล่า เพราะหน้านี้ไม่ดึงข้อมูล

### 2.4 คีย์บอร์ด

ลำดับ focus: ช่องรหัส → ปุ่มตา → ปุ่มเข้าระบบ Enter ในช่องส่งฟอร์ม Space หรือ Enter บนปุ่มตาสลับการแสดง และ focus อยู่ที่ปุ่มตา

### 2.5 ขนาดจอ

| ช่วง | การ์ด |
| --- | --- |
| `wide`, `medium` | กลางจอแนวตั้งและแนวนอน |
| `narrow` | ห่างขอบบน 64px, ขอบซ้ายขวา 16px, วงกลม 420px ลดเป็น 260px |

### 2.6 `data-testid`

`welcome-cover`, `access-form`, `access-code-input`, `access-code-toggle`, `access-error`, `access-submit`

## 3. โครงหลังเข้าระบบและเมนูซ้าย

### 3.1 Component

```
app/(app)/layout.tsx               → <AppShell> (คำขอที่ไม่มี cookie ถูก proxy.ts rewrite ไปหน้ายินดีต้อนรับแล้ว)
src/common/AppShell.tsx
  AppRail.tsx
  ConnectionBanner.tsx
  {children}                       InboxPage หรือ SettingsPage
```

`AppShell` ถือ state `railCollapsed: boolean` อ่านจาก `localStorage` key `tw.railCollapsed` (ห่อ try/catch ค่าเริ่มต้น `false`) ส่งต่อให้ `AppRail`

`AppRail` ใช้ข้อมูล:

| ข้อมูล | ที่มา |
| --- | --- |
| จำนวนยังไม่อ่าน | `counts.unread` จาก cache ของรายชื่อ (`qk.contacts()` ข้อ 7) ซึ่ง `AppShell` เป็นผู้ poll เสมอแม้อยู่หน้าตั้งค่า |

ออกจากระบบ: `useMutation(lock)` สำเร็จหรือได้ 401 แล้วหยุด query ทั้งหมด (`cancelQueries`) และโหลดหน้า `/chats` ใหม่ทั้งหน้าด้วย `window.location.replace("/chats")` ซึ่งจะแสดงหน้ายินดีต้อนรับ ไม่ใช้ `client.clear()` + `router.replace` เพราะ query ที่ยัง mount อยู่จะดึงใหม่ทันทีและได้ 401 และการโหลดใหม่ทั้งหน้าล้างข้อความที่พิมพ์ค้างในหน่วยความจำด้วย ไม่มี dialog ยืนยันเพราะย้อนได้ด้วยการเข้าระบบใหม่

### 3.2 รูปลักษณ์

| ส่วน | ค่า |
| --- | --- |
| พื้น | `rail`, เส้นขวา 1px `line`, กว้าง `RAIL_WIDTH_EXPANDED` (212px) หรือ `RAIL_WIDTH_COLLAPSED` (56px) เมื่อพับ, padding 12px 10px |
| โลโก้ | สี่เหลี่ยม 32×32 มุมโค้ง 9px พื้นไล่สีของแบรนด์ ตัวอักษรขาว 16px ตัวหนา คือ `initialOf(common.appName)` ตามด้วยชื่อแอป `common.appName` 15px ตัวหนา บรรทัดเดียวไม่ตัด (ชื่อคงที่ วัดแล้วไม่ถูกตัดที่ความกว้าง 212px เมื่อมีปุ่มพับเมนูอยู่ข้างกัน) เมื่อพับเหลือแค่สี่เหลี่ยม เมนูไม่แสดงชื่อ LINE OA ซึ่งอยู่ในส่วน LINE Official Account ของหน้าตั้งค่า |
| รายการเมนู | สูง 40px (จอแคบ 44px), มุมโค้ง 999px, ไอคอน 20px + ข้อความ 15px ช่องว่าง 10px |
| รายการที่เลือก | พื้น `surface` + เงาวงบาง `0 0 0 1px line` ตัวอักษร `fg` ตัวหนา `aria-current="page"` |
| รายการที่ไม่ได้เลือก | ตัวอักษร `muted` hover พื้น `selected` |
| ตัวเลขยังไม่อ่าน | แคปซูล พื้น `accent-strong` ตัวขาว 12px ตัวหนา สูง 20px อย่างน้อย 20px กว้าง ชิดขวาของ "แชท" เกิน 99 แสดง `99+` เป็น 0 ไม่แสดง เมื่อพับเป็นจุดตัวเลขเกาะมุมขวาบนของไอคอน |
| ลำดับ | แถวหัว (โลโก้, ชื่อแอป, ปุ่มพับเมนู), `แชท` (`MessageCircle`), `ตั้งค่า` (`Settings`), ช่องว่างยืด, `ออกจากระบบ` (`LogOut`) |
| ปุ่มพับเมนู | ปุ่มไอคอนอย่างเดียว (`PanelLeftClose` เมื่อกาง, `PanelLeftOpen` เมื่อพับ) ขนาด 44×44px (`TAP_MIN`) วงกลม สี `muted` hover พื้น `selected` และสี `fg` focus เห็นเส้นขอบ focus ของทั้งแอป อยู่มุมขวาบนของเมนูในแถวหัว ต่อจากชื่อแอป เมื่อพับไม่มีที่ข้างโลโก้ จึงอยู่ใต้สี่เหลี่ยมโลโก้ในแถวหัวเดียวกัน (ยังเป็นส่วนบนสุดของเมนู) แสดงเฉพาะจอกว้างตั้งแต่ 720px |

เมื่อพับ ข้อความของแต่ละรายการซ่อน แต่ยังอยู่ใน `aria-label` และแสดงเป็น tooltip เมื่อ hover หรือ focus

ปุ่มพับเมนูไม่มีข้อความที่มองเห็น ชื่อ (`aria-label`) และ tooltip เมื่อ hover หรือ focus คือ `common.nav.collapse` / `common.nav.expand` (tooltip อยู่ใต้ปุ่มเมื่อกาง และทางขวาเมื่อพับ) `aria-expanded` ตามสถานะ กดด้วย Enter หรือ Space

### 3.3 จอแคบ (< 720px)

เมนูกลายเป็นแถบบนสูง 56px พื้น `rail` เส้นล่าง 1px `line`: โลโก้ (ไม่มีชื่อแอป), ช่องว่างยืด, `แชท` พร้อมตัวเลข, `ตั้งค่า`, `ออกจากระบบ` เป็นปุ่มไอคอน 44×44 มี `aria-label` ไม่มีปุ่มพับเมนู

เมื่อเปิดแชทของผู้ใช้ที่จอแคบ แถบนี้ยังอยู่ และส่วนหัวของแชทอยู่ถัดลงมา

### 3.4 แถบการเชื่อมต่อ

`ConnectionBanner` แสดงเมื่อ query ที่กำลัง poll ล้มเหลวติดกันถึง `POLL_FAILURES_BEFORE_BANNER` รอบ (ข้อ 7.4): แถบสูง 36px เหนือเนื้อหา พื้น `#FFF4E5` ตัวอักษร `warn` 14px ไอคอน `WifiOff` ข้อความ `common.connection.banner` `role="status"` หายเองเมื่อรอบถัดไปสำเร็จ ไม่ล้างข้อความที่พิมพ์ค้าง

### 3.5 Error boundary

`SectionErrorBoundary` ห่อแยก: เมนู, รายชื่อ, แชท, แผงข้อมูล และแต่ละส่วนของหน้าตั้งค่า ส่วนที่พังแสดง `ErrorState` ข้อความ `common.error.section` พร้อมปุ่ม `common.action.retry` ซึ่ง reset boundary และ refetch query ของส่วนนั้น

### 3.6 คีย์บอร์ด

ลำดับ focus ของทั้งหน้า: ลิงก์ข้ามไปเนื้อหา (`common.skipToContent` มองเห็นเมื่อ focus) → เมนูตามลำดับ → เนื้อหา รายการเมนูเป็น `<a>` ยกเว้นออกจากระบบและพับเมนูซึ่งเป็น `<button>`

### 3.7 `data-testid`

`app-rail`, `rail-brand`, `nav-inbox`, `nav-inbox-unread`, `nav-settings`, `nav-logout`, `rail-collapse`, `connection-banner`, `section-error`, `section-error-retry`

## 4. รายชื่อผู้ใช้

### 4.1 Component

```
src/features/inbox/
  InboxPage.tsx                 จัด 3 คอลัมน์ตามขนาดจอ อ่าน contactId จาก URL
    list/ContactList.tsx        หัวข้อ ค้นหา แท็บ รายการ
      list/ContactSearch.tsx
      list/ContactListTabs.tsx
      list/ContactRow.tsx
      list/ContactListSkeleton.tsx
    thread/Thread.tsx           ข้อ 5
    thread/InfoPanel.tsx        ข้อ 6
  inbox.hooks.ts                useContacts, useSendMessage (ใช้มากกว่าหนึ่งส่วน ข้อ 7)
  thread/inbox.thread.hooks.ts  useContactDetail, useSetContactAi, useThread (ข้อ 7)
  composer/inbox.composer.hooks.ts
                                useDraft (ข้อ 5.7), useAttachment (ข้อ 7.6), useTypingPing (ข้อ 5.8),
                                useReleaseSentPreviews (ข้อ 7.6)
```

การย่อหน้าคือลำดับการ render ส่วนโฟลเดอร์ย่อย `list/`, `thread/` และ `composer/` และที่อยู่ของ hook เป็นไปตาม [frontend](../architecture/frontend.md#โฟลเดอร์)

`ContactList` state:

| State | ที่อยู่ | หมายเหตุ |
| --- | --- | --- |
| `filter` | URL query `?filter=all\|unread\|needs_admin` ค่าเริ่มต้น `all` | refresh แล้วอยู่ที่เดิม |
| `searchInput` | state ของ component | |
| `q` | ค่า `searchInput` ที่ trim แล้ว หลังหยุดพิมพ์ `SEARCH_DEBOUNCE_MS` | ใช้กรองรายการ และโหลดหน้าแรกใหม่ |
| รายการ | `useContacts({ filter, q })` | ข้อ 7 |

`ContactRow` props: `{ contact: ContactDto; selected: boolean; now: Date; filter?: ContactFilter; tabbable?: boolean; onFocus?: () => void }` (`tabbable` และ `onFocus` ใช้กับ roving tabindex ของข้อ 4.5)

Field ของ `ContactDto` ที่ใช้: `id`, `displayName`, `pictureUrl`, `followStatus`, `unreadCount`, `needsAdmin`, `lastMessage` (`at`, `by`, `type`, `text`), `createdAt`

### 4.2 รูปลักษณ์

| ส่วน | ค่า |
| --- | --- |
| คอลัมน์ | กว้าง 296px พื้น `surface` เส้นขวา 1px `line` |
| หัว | `<h1>` `inbox.list.title` แบบ `text-title` padding 16px 16px 8px |
| ช่องค้นหา | ทรงแคปซูล สูง 40px (จอแคบ 44px) พื้น `rail` ไม่มีขอบ ไอคอน `Search` 18px สี `muted` ด้านซ้าย placeholder `inbox.list.searchPlaceholder` มีปุ่ม `X` ล้างค่าเมื่อมีข้อความ (`aria-label` `inbox.list.clearSearch`) margin 0 16px 8px |
| แท็บ | แถวแท็บแบบเส้นใต้ `role="tablist"`: `inbox.list.tabAll`, `inbox.list.tabUnread` + ` {counts.unread}`, `inbox.list.tabNeedsAdmin` + ` {counts.needsAdmin}` ตัวอักษร 14px แท็บที่เลือกเป็นตัวหนาสี `fg` มีเส้นใต้ 2px `accent` แท็บอื่นสี `muted` จำนวนเป็น 0 ยังแสดง "0" แถวมีเส้นล่าง 1px `line` |
| แถว | สูงอย่างน้อย 68px padding 12px 16px ช่องว่างรูปกับข้อความ 12px รูป 44px |
| ชื่อ | `text-name` ตัดบรรทัดเดียว ตัวหนาเมื่อ `unreadCount > 0` ชื่อว่างใช้ `inbox.contact.unnamed` |
| เวลา | มุมขวาบน `text-meta` สี `muted` `formatListTime(lastMessage?.at ?? createdAt, now)` ไม่ตัดข้ามบรรทัด `lastMessage.at` คือเวลาข้อความล่าสุดของผู้ใช้ จึงเป็นค่าเดียวกับที่รายการใช้เรียง ส่วนบรรทัดที่สองเป็นข้อความล่าสุดของใครก็ได้ |
| บรรทัดที่สอง | `buildContactPreview(contact)` ตัดบรรทัดเดียว `text-sub` สี `muted` ตัวหนาและสี `fg` เมื่อยังไม่อ่าน คำนำ "รอแอดมิน ·" เป็นสี `warn` ตัวหนา |
| ตัวเลขยังไม่อ่าน | ชิดขวาของบรรทัดที่สอง แคปซูล `accent-strong` ตัวขาว 12px ตัวหนา สูง 20px เกิน 99 แสดง `99+` |
| แถวที่เลือก | พื้น `selected` |
| แถวเลิกติดตาม | รูปความทึบ 0.55 ชื่อสี `muted` (ไม่ลดความทึบของตัวอักษร เพราะ `fg` ที่ 0.55 ได้ contrast ต่ำกว่า 4.5:1) บรรทัดที่สองแสดง `inbox.contact.unfollowed` แทนข้อความล่าสุด |
| hover | พื้น `rail` |

แต่ละแถวเป็น `<a href="/chats/{id}">` ภายใน `<ul>` และต่อ `?filter=` ของแท็บที่เลือกไว้ท้าย URL (`contactHref(id, filter)`; แท็บ `all` ไม่ต่อ) แท็บจึงยังเลือกอยู่หลังเปิดแชท ชื่อที่อ่านโดยโปรแกรมอ่านจอประกอบจาก ชื่อ, คำนำสถานะ, ข้อความล่าสุด, เวลา และ `inbox.list.unreadAria` (`{n} ข้อความยังไม่อ่าน`)

### 4.3 สถานะ

| สถานะ | แสดง | `data-testid` |
| --- | --- | --- |
| กำลังโหลดครั้งแรก | `ContactListSkeleton`: 8 แถว วงกลม 44px + แท่ง 2 เส้น (60% และ 85%) | `contact-list-skeleton` |
| ไม่มีผู้ใช้เลย และยังไม่ได้เชื่อม LINE OA | `EmptyState`: `inbox.list.emptyNoLine.title`, `inbox.list.emptyNoLine.body`, ลิงก์ `inbox.list.goToSettings` ไป `/settings` | `contact-list-empty` |
| ไม่มีผู้ใช้เลย เชื่อม LINE OA แล้ว | `inbox.list.empty.title`, `inbox.list.empty.body` | `contact-list-empty` |
| แท็บยังไม่อ่านว่าง | `inbox.list.emptyUnread` | `contact-list-empty` |
| แท็บรอแอดมินว่าง | `inbox.list.emptyNeedsAdmin` | `contact-list-empty` |
| ค้นหาไม่พบ | `inbox.list.emptySearch` แทน `{q}` | `contact-list-empty` |
| โหลดครั้งแรกไม่สำเร็จ | `ErrorState`: `inbox.list.error` + ปุ่ม `common.action.retry` | `contact-list-error`, `contact-list-retry` |
| Poll รอบถัดไปไม่สำเร็จ | รายการเดิมอยู่ต่อ และแถบการเชื่อมต่อตามข้อ 3.4 | |
| ปกติ | รายการ | `contact-list`, `contact-row` |
| กำลังโหลดหน้าถัดไป | 2 แถว skeleton ท้ายรายการ | `contact-list-more` |

"ยังไม่ได้เชื่อม LINE OA" อ่านจาก `lineConfigured` ของคำตอบ `GET /api/contacts`

รายการอยู่ใต้ `<Suspense>` (เพราะ `useSearchParams`) ซึ่ง React อาจ hydrate หลังส่วนอื่นของหน้า และแชทที่เปิดอยู่ใช้ cache ของรายชื่อชุดเดียวกัน (`useContacts()`) ข้อมูลจึงอาจอยู่ใน cache แล้วก่อนที่รายการจะ hydrate `ContactList` จึงถือว่ายังไม่มีข้อมูลจนกว่า `useHydrated()` เป็น `true` render แรกของ client จึงเป็น skeleton เหมือน HTML ของ server เสมอ (ไม่มี hydration mismatch, React error #418)

### 4.4 การโหลดเพิ่ม

รายการเรียงตามข้อความล่าสุดของผู้ใช้ ใหม่ไปเก่า ([webchat-inbox](webchat-inbox.md)) หน้าแรก `CONTACT_PAGE_LIMIT` แถว (เลื่อนเพื่อโหลดเพิ่ม ไม่มีเลขหน้า) เมื่อ sentinel ท้ายรายการเข้าจอ (IntersectionObserver) และ `hasMore` ขอหน้าถัดไปด้วย `before` ของคำตอบก่อนหน้า ตาม [protocol ของ polling](../architecture/api-contract.md#รายชื่อผู้ใช้) Polling ไม่ดึงหน้าแรกซ้ำ แต่ขอ `afterUpdatedSeq` แล้วรวมเข้ารายการด้วย `mergeById` กรองด้วย `matchesContactFilter` และเรียงด้วย `compareContacts` (ข้อ 8)

### 4.5 คีย์บอร์ด

- ลำดับ: ช่องค้นหา → ปุ่มล้าง → แท็บที่เลือก (ลูกศรซ้ายขวาสลับแท็บ ตาม pattern ของ tablist) → รายการ
- ในรายการ Tab เข้ามาที่แถวที่เลือกหรือแถวแรก ลูกศรขึ้นลงย้าย focus ระหว่างแถว (roving tabindex) Enter เปิดแชท Home/End ไปแถวแรกและแถวสุดท้าย
- Escape ในช่องค้นหาที่มีข้อความ ล้างค่า

### 4.6 ขนาดจอ

| ช่วง | รายชื่อ |
| --- | --- |
| `wide`, `medium` | คอลัมน์ 296px แสดงเสมอ |
| `narrow` | เต็มความกว้างที่ `/chats` ซ่อนเมื่ออยู่ที่ `/chats/[id]` แถวสูงอย่างน้อย 72px |

### 4.7 `data-testid`

`contact-list`, `contact-search`, `contact-search-clear`, `contact-tab-all`, `contact-tab-unread`, `contact-tab-needs-admin`, `contact-row`, `contact-row-name`, `contact-row-preview`, `contact-row-time`, `contact-row-unread`, `contact-list-skeleton`, `contact-list-empty`, `contact-list-error`, `contact-list-retry`, `contact-list-more`, `contact-list-go-settings`

`contact-row` มี attribute: `data-contact-id`, `data-unread` (`true`/`false`), `data-needs-admin`, `data-follow` (`following`/`unfollowed`), `data-selected`

## 5. แชท

### 5.1 Component

```
src/features/inbox/
  thread/Thread.tsx             รับ contactId, ห่อ error boundary แยกของส่วนหัว ข้อความ ช่องตอบ
    thread/ThreadHeader.tsx
      thread/AiSwitch.tsx       ใช้ทั้งในส่วนหัวและแผงข้อมูล
    thread/MessageList.tsx      scroll, โหลดย้อนหลัง, ปุ่มข้อความใหม่
      thread/DayChip.tsx
      thread/MessageGroup.tsx
        thread/MessageBubble.tsx
          thread/MediaContent.tsx    รูป วิดีโอ สติกเกอร์ เสียง ป้ายชนิดอื่น
            thread/AudioPlayer.tsx   ตัวเล่นข้อความเสียง (ข้อ 5.3)
          thread/DeliveryStatus.tsx  กำลังส่ง / ส่งแล้ว / ส่งไม่สำเร็จ + ส่งอีกครั้ง
      thread/SystemLine.tsx
      thread/WelcomeCardBubble.tsx  การ์ดต้อนรับที่ส่งให้ผู้ใช้ (ข้อ 5.3)
      thread/NewMessagesButton.tsx
    composer/Composer.tsx       ข้อ 5.7
      composer/AttachmentTray.tsx
    thread/MediaLightbox.tsx    ข้อ 6.4
  thread/ThreadPlaceholder.tsx  ยังไม่เลือกผู้ใช้
  composer/inbox.media.ts       buildPreviewImage, convertToJpeg, captureVideoFrame, readHeadBytes (ใช้ API ของ browser)
```

`Thread` ใช้:

| Hook | ข้อมูล |
| --- | --- |
| `useContactDetail(contactId)` | `getContact` poll ทุก `POLL_INTERVAL_MS` |
| `useThread(contactId)` | ข้อความ, `fetchOlder`, `hasOlder` (ข้อ 7) |
| `useSettings()` | `ai.enabled` (kill switch) |
| `useContacts()` | `lineConfigured` |
| `useSendMessage(contactId)` | ข้อ 7.5 |

Field ของ `ContactDetailDto` ที่ใช้: ทุก field ของ `ContactDto` ในข้อ 4.1 และ `aiEnabled`, `needsAdminReason`, `aiReplying`, `followedAt`, `stats.messageCount`, `stats.aiMessageCount`

Field ของ `MessageDto` ที่ใช้: `id`, `seq`, `updatedSeq`, `direction`, `author`, `type`, `text`, `otherKind`, `eventCode`, `media` (`status`, `url`, `previewUrl`), `sticker` (`imageUrl`), `delivery` (`status`, `errorCode`), `createdAt`

### 5.2 ส่วนหัว

| ส่วน | ค่า |
| --- | --- |
| แถบ | สูง 54px พื้น `surface` เส้นล่าง 1px `line` padding 0 16px |
| ปุ่มกลับ | เฉพาะจอแคบ ไอคอน `ChevronLeft` ในกล่อง 44×44 `aria-label` `inbox.thread.back` ไป `/chats` |
| รูป | 32px |
| ชื่อ | `text-name` ตัวหนา ตัดบรรทัดเดียว เป็น `<h2>` |
| บรรทัดรอง | `text-meta` 12px สี `muted` ประกอบด้วย `threadSubline(contact, killSwitchOn)`: สถานะการติดตาม (`inbox.thread.following` / `inbox.contact.unfollowed`) ตามด้วย ` · ` และหนึ่งใน `inbox.thread.aiHelping` (AI ตอบแทนเปิดและ kill switch เปิด) หรือ `inbox.thread.needsAdmin` (สี `warn`) หรือไม่มีส่วนที่สอง |
| สวิตช์ AI | ชิดขวา: ป้าย `aiSwitchView().label` 14px สี `muted` + สวิตช์ขนาดเล็ก 32×18 (พื้นที่กด 44×44) ป้ายเป็น `<label>` ของสวิตช์ |
| ปุ่มแผงข้อมูล | ไอคอน `PanelRight` ในกล่อง 36×36 (จอแคบ 44×44) `aria-label` สลับ `inbox.thread.showInfo` / `inbox.thread.hideInfo` `aria-expanded` |

ป้ายของสวิตช์แสดงเฉพาะเมื่อส่วนหัวกว้างอย่างน้อย 448px (container query `@md` บนส่วนหัว) ส่วนหัวที่แคบกว่านั้น ซึ่งคือจอ `narrow` และจอ `medium` ส่วนใหญ่ ป้ายซ่อน (ยังอยู่ใน `aria-label` ของสวิตช์) เพื่อให้ชื่อมีที่

`AiSwitch` props: `{ contact: ContactDetailDto; killSwitchOn: boolean; size: "sm" | "md"; showNote: boolean }` ใช้ `aiSwitchView(contact, killSwitchOn)` (ข้อ 8):

| เงื่อนไข | สวิตช์ | ป้าย | หมายเหตุใต้สวิตช์ (เฉพาะแผงข้อมูล) |
| --- | --- | --- | --- |
| Kill switch ปิด | ปิด และกดไม่ได้ (`disabled`, ความทึบ 0.5) | `inbox.ai.labelKilled` | `inbox.ai.noteKilled` |
| เลิกติดตามแล้ว | ปิด กดไม่ได้ | `inbox.ai.label` | `inbox.ai.noteUnfollowed` |
| `aiEnabled` | เปิด | `inbox.ai.label` | `inbox.ai.noteOn` |
| ปิด | ปิด | `inbox.ai.label` | `inbox.ai.noteOff` |

กดสวิตช์: `useMutation(setContactAi)` แบบ optimistic เปลี่ยนค่าใน cache ของ `qk.contact(id)` ทันที ถ้าล้มเหลว คืนค่าเดิมและแสดง toast ข้อความจาก error catalog สำเร็จแล้วเขียน `ContactDto` ที่ได้ลง cache ของรายชื่อ

ไม่มีการหยุดแบบมีเวลา: เมื่อแอดมินส่งข้อความ server ตั้ง `aiEnabled` เป็น false และบันทึกบรรทัดเหตุการณ์ `ai.turned_off_by_admin` สวิตช์จึงแสดงเป็นปิดเมื่อ poll รอบถัดไป การเปิดอีกครั้งส่ง `aiEnabled: true` ซึ่ง server ล้างสถานะรอแอดมินด้วย ([ai-reply](ai-reply.md#เมื่อแอดมินตอบเอง))

### 5.3 พื้นที่ข้อความ

| ส่วน | ค่า |
| --- | --- |
| พื้น | `chat` padding 16px 20px (จอแคบ 12px) |
| Element | `role="log"` `aria-live="polite"` `aria-label` `inbox.thread.logLabel` และ `tabindex="0"` เพื่อเลื่อนด้วยคีย์บอร์ด |
| ป้ายวันที่ | กลาง แคปซูล พื้น `fg` ความทึบ 0.6 (ตัวขาว 12px ได้ contrast 4.5:1 บนพื้น `chat`) ตัวขาว `text-meta` padding 2px 10px margin 16px 0 `formatDayChip(date, now)` |
| กลุ่มผู้ใช้ | ซ้าย: รูป 28px ติดฟองสุดท้ายของกลุ่ม ชื่อ `text-meta` สี `muted` เหนือฟองแรก (เว้นซ้าย 36px) |
| ฟองผู้ใช้ | พื้น `surface`, ขอบ 1px `line`, มุม 17px มุมล่างซ้ายของฟองสุดท้ายในกลุ่ม 5px |
| ฟองฝั่งแอดมิน | ขวา พื้น `bubble-out` ไม่มีขอบ มุม 17px มุมล่างขวาของฟองสุดท้ายในกลุ่ม 5px ไม่มีรูป |
| ระยะ | ฟองในกลุ่มห่าง 3px กลุ่มห่าง 14px |
| เนื้อข้อความ | `text-body` สี `fg` padding 8px 12px `white-space: pre-wrap`, `overflow-wrap: anywhere` ลิงก์จาก `linkify` เป็น `<a target="_blank" rel="noopener noreferrer">` ขีดเส้นใต้ |
| เวลาและผู้ส่ง | ข้างฟองสุดท้ายของกลุ่ม ชิดล่าง ห่าง 6px: ฝั่งผู้ใช้อยู่ขวาของฟอง `formatMessageTime` ฝั่งแอดมินอยู่ซ้ายของฟอง เรียงเป็น 2 บรรทัด: ป้ายผู้ส่งตัวหนา (`inbox.message.senderYou` หรือ `inbox.message.senderAi`) แล้วเวลา ทั้งหมด `text-meta` สี `muted` |
| สถานะกำลังส่ง | ฟองความทึบ 0.55 และใต้ฟองมี `inbox.message.sending` `text-meta` |
| สถานะส่งแล้ว | ไอคอน `Check` 12px สี `muted` ก่อนเวลา พร้อมข้อความซ่อน `inbox.message.sent` |
| สถานะส่งไม่สำเร็จ | ฟองความทึบเต็ม ขอบ 1px `danger` ใต้ฟอง: ไอคอน `AlertCircle` + `failedLineText(deliveryError)` 14px สี `danger` คือ `inbox.message.failed` + ` · ` + เหตุผลจาก error catalog (แบบ `outbound`) ที่ตัดคำ "ส่งไม่สำเร็จ" ต้นข้อความออกเพื่อไม่ให้ซ้ำ ไม่มีเหตุผลแสดงแค่ `inbox.message.failed` และปุ่มข้อความ `inbox.message.retry` 14px ตัวหนา สูง 32px (จอแคบ 44px) เมื่อ `isRetryExpired(row, now)` เป็นจริง (`delivery.retryExpiresAt` ไม่หลัง `now` ของนาฬิกาที่เดินทุกนาที หรือ server ตอบ `message.retry_expired`) เหตุผลเป็นของ `message.retry_expired` (`{hours}` จาก `LINE_RETRY_KEY_WINDOW_MS`), `message-error` มี `data-code="message.retry_expired"` และไม่มีปุ่ม |
| ข้อความที่ตอบกลับ | กล่อง `message-quote` ในฟองเหนือเนื้อข้อความ margin 8px 8px 0 พื้น `chat` เส้นซ้าย 3px `muted` มุม 6px `text-sub` สี `muted`: บรรทัดแรกป้ายผู้เขียนตัวหนา (`inbox.message.senderYou`, `inbox.message.senderAi` หรือชื่อผู้ใช้) บรรทัดที่สองข้อความหนึ่งบรรทัด (`truncate`) หรือป้ายชนิดสื่อจาก `inbox.media.*` ข้อความต้นทางที่รู้จักเป็น `<button>` ชื่อ `inbox.quote.label` (มีคำว่า "ตอบกลับ") title `inbox.quote.jumpHint` กดแล้ว `MessageList` เลื่อนฟองต้นทางมากลางจอ (ไม่ animate เมื่อ `prefers-reduced-motion`) และใส่ `data-highlight` เป็น true (วง 2px `accent-strong`) นาน `QUOTE_HIGHLIGHT_MS` ฟองต้นทางที่ไม่ได้โหลดอยู่: ไม่ทำอะไร ข้อความต้นทางที่ไม่รู้จัก: `div` role note ข้อความ `inbox.quote.unavailable` ตัวเอียง ชื่อ `inbox.quote.labelUnavailable` ฟังก์ชันล้วน `quoteView` ใน `inbox.thread.logic.ts` |
| บรรทัดเหตุการณ์ | `SystemLine` กลาง 14px สี `muted` ไม่มีพื้น margin 12px 0 ข้อความ `eventCodeText(message.eventCode)` จาก [error-catalog](../architecture/error-catalog.md#บรรทัดเหตุการณ์) |
| การกดปุ่มของผู้ใช้ | แถวขาเข้าที่ `eventCode` เป็น `customer.tapped_*` แสดงเป็น `SystemLine` "ผู้ใช้กดปุ่ม …" ไม่ใช่ฟอง (`showsAsEventLine` ใน `inbox.logic.ts`) ([line-messaging](line-messaging.md#เมื่อผู้ใช้กดปุ่ม)) |
| ข้อความต้อนรับ | `WelcomeCardBubble` ฝั่งแอดมิน ขอบ 1px `line` พื้น `surface` มุมเท่าฟอง หัว `inbox.welcome.label` 12px ตัวหนาสี `accent-strong` พร้อมไอคอน Sparkles คั่นเส้นล่าง แล้วข้อความต้อนรับ 15px และชื่อปุ่มสามปุ่มเป็นป้ายทรงแคปซูล 12px สี `muted` พื้น `chat` ที่กดไม่ได้ (`aria-hidden` และรายการมีชื่อ `inbox.welcome.buttonsLabel`) ข้างกล่องมี `inbox.welcome.sender` และเวลา `article` ชื่อ `inbox.welcome.label` `data-testid` `welcome-bubble` ไม่รวมกลุ่มกับฟองอื่น |

บรรทัด `guard.blocked` ของขอบเขตหัวข้อแสดงด้วย `SystemLine` แบบเดียวกับบรรทัดอื่น และข้อความปฏิเสธที่ส่งให้ผู้ใช้เป็นฟองฝั่งแอดมินผู้ส่ง `ai` ตามปกติ จึงไม่ต้องมี component ใหม่ในแชท ([topic-guard](topic-guard.md))

บรรทัดเหตุการณ์คือ `MessageDto` ที่ `type` เป็น `event` ในรายการข้อความเดียวกัน จึงแสดงตามตำแหน่งของ `seq` ตามลำดับเวลาที่เกิด ไม่ใช่บรรทัดที่สร้างจากสถานะของ Contact และไม่ต่อท้ายแชท `eventCode` ที่หน้าจอไม่รู้จักไม่แสดง การจัดกลุ่ม การวางป้ายวันที่ และบรรทัดเหตุการณ์มาจาก `groupMessagesForDisplay` (ข้อ 8)

`MediaContent` ตาม `type` และ `media.status`:

| ชนิด | สถานะ | แสดง |
| --- | --- | --- |
| `image` | `ready` | `<img src={media.previewUrl ?? media.url} loading="lazy">` กว้างสุด 240px สูงสุด 320px มุมโค้งเท่าฟอง ไม่มี padding กดแล้วเปิด lightbox `alt` = `inbox.media.image` |
| `video` | `ready` | ภาพตัวอย่างแบบเดียวกับรูป ทับด้วยวงกลม 44px พื้น `rgba(25,19,39,.55)` ไอคอน `Play` ขาว กดแล้วเปิด lightbox |
| `image`, `video` | `pending` | กล่อง 240×180 พื้น `line` แบบ skeleton ข้อความ `inbox.media.loading` |
| `image`, `video` | `failed` | กล่องกว้าง 240px สูงอย่างน้อย 72px (ข้อความยาวขึ้นบรรทัดใหม่) ไอคอน `ImageOff` + เหตุผลจาก `media.failure` (`inbox.media.problem.{failure}`) หรือ `inbox.media.imageFailed` / `inbox.media.videoFailed` เมื่อไม่มีเหตุผล (`mediaProblemText`) `data-failure` คือเหตุผล |
| `image`, `video` | `too_large` | ไอคอน `FileWarning` + `inbox.media.problem.too_large` พร้อมเพดานของชนิดนั้น `data-failure="too_large"` |
| `audio` | `ready` | `AudioPlayer` กว้าง 256px padding 6px 8px: ปุ่มกลม 44px พื้น `accent-strong` ไอคอน `Play`/`Pause` สีขาว ชื่อ `inbox.media.audioPlay` / `inbox.media.audioPause` (Enter และ Space สลับ), `<input type="range">` สี `accent-strong` ชื่อ `inbox.media.audioProgress` (`aria-valuetext` เวลา) เลื่อนตำแหน่งได้เมื่อรู้ความยาว และเวลา `formatAudioTime` "0:03 / 0:04" `text-meta` ความยาวเริ่มจาก `media.durationMs` แล้วใช้ของไฟล์เมื่อโหลด metadata `<audio preload="metadata">` ซ่อน ไม่มี autoplay การเล่นหนึ่งตัวหยุดตัวอื่น (`useOnlyOnePlaying` ใน `inbox.audio.hooks.ts`) โหลดไฟล์ไม่ได้: แบบ `failed` |
| `audio` | `pending`, `failed`, `too_large` | กว้าง 256px ไอคอน `Mic` + `inbox.media.audio` และบรรทัด `inbox.media.audioLoading` (กระพริบ) หรือข้อความของ `mediaProblemText` แบบเดียวกับรูป (`inbox.media.audioFailed` เมื่อไม่มีเหตุผล) |
| `sticker` | | `<img>` 120×120 ไม่มีพื้นฟอง จาก `sticker.imageUrl` (สร้างที่ server) โหลดไม่ได้แสดงข้อความ `inbox.media.sticker` ในฟองปกติ |
| `other` | | ฟองปกติ ไอคอน `Paperclip` + ป้ายตาม `otherKind` จาก `inbox.media.other.*` |

ค่า `media.status` ที่หน้าจอรู้จัก: `pending`, `ready`, `failed`, `too_large` ตรงกับ `MediaStatus` ใน [domain-and-ports](../architecture/domain-and-ports.md#enum)

### 5.4 การเลื่อน

| เหตุการณ์ | พฤติกรรม |
| --- | --- |
| เปิดแชท | เลื่อนไปล่างสุดหลังข้อความชุดแรกแสดงแล้ว ไม่มี animation |
| ข้อความใหม่จาก polling | ถ้า `shouldStickToBottom` ก่อนรวมข้อความ เลื่อนลงล่างสุด ถ้าไม่ แสดง `NewMessagesButton` |
| แอดมินส่งข้อความเอง | เลื่อนลงล่างสุดเสมอ |
| เลื่อนขึ้นจนห่างบนสุดไม่เกิน 200px และ `hasOlder` | เรียก `fetchOlder()` แสดงแถบ skeleton 1 แถวที่ด้านบน หลังรวมแล้วรักษาตำแหน่งที่อ่านอยู่ด้วยผลต่างของ `scrollHeight` `isFetchingOlder` เป็น true จนแถวที่เก่ากว่าอยู่ใน `items` ที่ render แล้ว (ไม่ใช่แค่เมื่อคำขอจบ เพราะ cache เปลี่ยนก่อน React render หนึ่งรอบ) การรักษาตำแหน่งจึงทำกับแถวที่มาถึงจริง |
| ไม่มีข้อความเก่ากว่าแล้ว | ไม่แสดงอะไรเพิ่ม |

`NewMessagesButton`: แคปซูลลอยกลางล่างของพื้นที่ข้อความ ห่างช่องตอบ 12px พื้น `surface` เงาบาง ไอคอน `ArrowDown` + `inbox.thread.newMessages` สูง 36px (จอแคบ 44px) กดแล้วเลื่อนลงล่างสุดแบบ smooth (ไม่ smooth เมื่อลดการเคลื่อนไหว) และหายไป

### 5.5 การล้างจำนวนยังไม่อ่าน

เรียก `markContactRead(id)` เมื่อ: เปิดแชท, เมื่อมีข้อความขาเข้าใหม่ขณะที่แท็บมองเห็นและอยู่ล่างสุด และเมื่อผู้อ่านเลื่อนกลับลงล่างสุด (เองหรือด้วย `NewMessagesButton`) หลังมีข้อความขาเข้าที่มาถึงตอนไม่ได้อยู่ล่างสุด ขณะที่แท็บมองเห็น หน่วง `MARK_READ_DELAY_MS` แล้วรวมเป็นครั้งเดียว สำเร็จแล้วเขียน `ContactDto` ที่ได้ลง cache ของรายชื่อ ล้มเหลวไม่แสดงอะไร (รอบถัดไปลองใหม่)

### 5.6 สถานะของแชท

| สถานะ | แสดง | `data-testid` |
| --- | --- | --- |
| ยังไม่เลือกผู้ใช้ (`wide`, `medium`) | `ThreadPlaceholder` กลางพื้น `chat`: ไอคอน `MessagesSquare` 40px สี `muted` + `inbox.thread.placeholder` | `thread-placeholder` |
| กำลังโหลดครั้งแรก | ส่วนหัว skeleton และ 6 ฟอง skeleton สลับซ้ายขวา กว้าง 40% ถึง 65% | `thread-skeleton` |
| ไม่มีข้อความ | กลาง: `inbox.thread.empty` | `thread-empty` |
| โหลดไม่สำเร็จ | `ErrorState` `inbox.thread.error` + ปุ่ม `common.action.retry` | `thread-error`, `thread-retry` |
| ไม่พบผู้ใช้ (404) | `inbox.thread.notFound` + ลิงก์ `inbox.thread.backToList` | `thread-not-found` |
| ปกติ | ตามข้อ 5.2 ถึง 5.4 | `thread` |

### 5.7 ช่องตอบ

```
composer/Composer.tsx
  composer/AttachmentTray.tsx      แสดงเมื่อมีไฟล์แนบ
  <textarea>
  แถบเครื่องมือ: ปุ่มแนบ, hint, ปุ่มส่ง
  <input type="file" hidden>
```

State ของ `Composer`:

| State | ที่อยู่ | หมายเหตุ |
| --- | --- | --- |
| `draft` | `useDraft(contactId)` ใน `composer/inbox.composer.hooks.ts` เก็บใน `Map` ระดับ module แยกตาม contactId | เปลี่ยนแชทแล้วกลับมายังอยู่ หายเมื่อ refresh |
| `attachment` | `useAttachment(contactId)` | state machine ข้อ 7.6 |
| `disabledReason` | `composerDisabledReason(contact, settings)` | ข้อ 8 |

รูปลักษณ์:

| ส่วน | ค่า |
| --- | --- |
| กล่อง | พื้น `surface` เส้นบน 1px `line` padding 10px 16px 12px |
| ช่องพิมพ์ | `<textarea>` ไม่มีขอบ ไม่มีพื้น `text-body` (จอแคบ 16px) สูงเริ่ม 1 บรรทัด ขยายตามเนื้อหาสูงสุด 6 บรรทัดแล้วเลื่อนในตัว placeholder `inbox.composer.placeholder` `aria-label` เดียวกับ placeholder |
| แถบเครื่องมือ | ใต้ช่องพิมพ์ สูง 36px (จอแคบ 44px) |
| ปุ่มแนบ | ไอคอน `ImagePlus` 20px ในกล่อง 36×36 (จอแคบ 44×44) `aria-label` `inbox.composer.attach` |
| Hint | `inbox.composer.hint` `text-meta` สี `muted` ซ่อนเมื่อจอแคบ |
| ปุ่มส่ง | ทรงแคปซูล สูง 36px (จอแคบ 44px) padding 0 18px พื้น `accent-strong` ตัวขาว 15px ตัวหนา `inbox.composer.send` ชิดขวา |
| เหตุผลที่ส่งไม่ได้ | แทนแถบเครื่องมือทั้งแถว ไอคอน `Info` + ข้อความ 14px สี `muted` ช่องพิมพ์และปุ่มทั้งหมด `disabled` |

ปุ่มส่งกดไม่ได้เมื่อ: ช่องพิมพ์ว่าง (หลัง trim) และไม่มีไฟล์แนบที่พร้อมส่ง หรือไฟล์แนบยังไม่ `ready` ในกรณีหลังแสดง `inbox.composer.waitUpload` แทน hint ([ux-writing](../guidelines/ux-writing.md) หัวข้อปุ่ม)

การส่ง:

1. `isSubmitKey(event)` จริง หรือกดปุ่มส่ง
2. ถ้ามีไฟล์แนบที่ `ready`: ส่งข้อความชนิดสื่อก่อนด้วย id ใหม่ แล้วล้าง tray
3. ถ้า `draft.trim()` ไม่ว่าง: ส่งข้อความตัวอักษรด้วย id ใหม่อีกตัว แล้วล้าง draft
4. Focus อยู่ที่ช่องพิมพ์ เลื่อนลงล่างสุด

ข้อความไม่ถูก trim ภายในก่อนส่ง ยกเว้นตัดช่องว่างและบรรทัดว่างหัวท้าย

### 5.8 Loading ฝั่ง LINE ขณะพิมพ์

`useTypingPing(contactId)` ใน `composer/inbox.composer.hooks.ts` ผูกกับ `onChange` ของช่องพิมพ์ ตัวจำกัดความถี่คือ `createTypingPinger` ใน `composer/inbox.typing.controller.ts` ซึ่งรับนาฬิกาและฟังก์ชันส่งจากภายนอก:
- เรียก `notifyTyping` เมื่อค่าใหม่ไม่ว่าง และ `shouldSendTypingPing(lastSentAt, now, TYPING_PING_INTERVAL_MS)` เป็นจริง หน้าเว็บจึงส่งไม่เกินหนึ่ง ping ต่อ `TYPING_PING_INTERVAL_MS` ขณะแอดมินพิมพ์
- Server จำกัดเพิ่มอีกชั้นที่ `RATE_LIMIT_TYPING` ต่อผู้ใช้ และขอให้ LINE แสดง loading เป็นเวลา `LINE_LOADING_SECONDS` ([line-messaging](line-messaging.md#loading-ฝั่ง-line)) ค่าทั้งสามอยู่ใน [project-setup](../architecture/project-setup.md#10-ค่าคงที่ของระบบ)
- `lastSentAt` เริ่มใหม่เมื่อเปลี่ยนแชท ไม่เรียกเมื่อช่องตอบถูกปิด
- ไม่รอผล ไม่ retry ไม่แสดง error และไม่นับเข้าแถบการเชื่อมต่อ

### 5.10 ไฟล์แนบ (`AttachmentTray`)

แสดงเหนือช่องพิมพ์ สูง 76px: ภาพตัวอย่าง 64×64 มุม 10px (วิดีโอมีไอคอน `Play` ทับ) ชื่อไฟล์ 14px ตัดบรรทัดเดียว และบรรทัดสถานะ:

| สถานะ (ข้อ 7.6) | บรรทัดสถานะ | ปุ่ม |
| --- | --- | --- |
| `validating`, `converting` | `inbox.attach.preparing` | ยกเลิก |
| `requesting`, `uploading` | `inbox.attach.uploading` แทน `{percent}` และแถบความคืบหน้าสูง 3px สี `accent` (`role="progressbar"` `aria-valuenow`) | ยกเลิก |
| `ready` | `inbox.attach.ready` | ยกเลิก |
| `rejected`, `failed` | ข้อความ error สี `danger` ทุกข้อความเรื่องชนิดหรือขนาดบอกสิ่งที่รับได้: ชนิดที่ไม่รับบอกชนิดที่รับ (`unsupported_type`), MOV บอกให้แปลงเป็น MP4, ใหญ่เกินบอกเพดานและขนาดของไฟล์ที่เลือก (รวมเมื่อ server ปฏิเสธ) | ปิด |

ก่อนเลือกไฟล์ ปุ่มแนบมี tooltip `inbox.composer.attachHint` (ชนิดที่รับและเพดานของรูปและวิดีโอ จาก constant) เมื่อชี้หรือ focus ที่จอกว้าง และข้อความเดียวกันเป็นคำอธิบายของปุ่ม (`aria-describedby` ไปที่ `<span class="sr-only">` `data-testid="composer-attach-hint"`) ทุกความกว้าง ซึ่ง screen reader อ่านที่จอแคบที่ไม่มี hover

ปุ่มยกเลิกหรือปิดเป็นไอคอน `X` ในกล่อง 32×32 (จอแคบ 44×44) `aria-label` `inbox.attach.cancel` แนบได้ทีละไฟล์ เลือกไฟล์ใหม่ขณะมีไฟล์อยู่ ยกเลิกไฟล์เดิมก่อน

`<input type="file">` มี `accept="image/jpeg,image/png,image/heic,image/heif,image/webp,video/mp4,video/quicktime"` เพื่อให้เลือก MOV ได้แล้วได้ข้อความแนะนำ แทนที่จะซ่อนไฟล์ไว้เฉย ๆ

### 5.11 คีย์บอร์ดของแชท

ลำดับ focus: ปุ่มกลับ (จอแคบ) → สวิตช์ AI → ปุ่มแผงข้อมูล → พื้นที่ข้อความ (ลูกศรและ PageUp/PageDown เลื่อน) → ปุ่มในฟอง (ภาพตัวอย่าง, ส่งอีกครั้ง, ลิงก์) ตามลำดับเวลา → ปุ่มข้อความใหม่ → tray → ช่องพิมพ์ → ปุ่มแนบ → ปุ่มส่ง

- เปิดแชทที่จอ ≥ 720px และช่องตอบใช้ได้: focus ที่ช่องพิมพ์ จอแคบไม่ focus เอง เพื่อไม่ให้แป้นพิมพ์เด้ง
- Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่, ไม่ส่งขณะประกอบคำ ([frontend](../architecture/frontend.md) หัวข้อการส่งข้อความ)
- Escape ในช่องพิมพ์ไม่ทำอะไร (ไม่ล้าง draft)

### 5.12 ขนาดจอ

| ช่วง | แชท |
| --- | --- |
| `wide` | คอลัมน์ยืด กว้างอย่างน้อย 420px |
| `medium` | คอลัมน์ยืด แผงข้อมูลเปิดแล้วเป็น sheet กว้าง 256px ทับขอบขวา มีเงาซ้าย ปิดด้วย Escape หรือคลิกนอก sheet |
| `narrow` | เต็มจอใต้แถบเมนู ฟองกว้างสุด 85% ช่องตอบติดล่างและเลื่อนขึ้นตามแป้นพิมพ์ (`100dvh`) รายชื่อที่ซ่อนอยู่พา `<h1>` ไปด้วย `InboxPage` จึงมี `<h1 class="sr-only">` `inbox.list.title` อีกตัวที่แสดงเฉพาะเมื่อเปิดแชทที่จอ `narrow` (ซ่อนตั้งแต่ `medium`) หน้าจึงมี `<h1>` หนึ่งตัวเสมอ (axe `page-has-heading-one`) |

### 5.13 `data-testid`

แชท: `thread`, `thread-placeholder`, `thread-skeleton`, `thread-empty`, `thread-error`, `thread-retry`, `thread-not-found`, `thread-header`, `thread-back`, `thread-name`, `thread-subline`, `thread-ai-switch`, `thread-ai-label`, `thread-info-toggle`, `message-list`, `message-load-older`, `day-chip`, `message-group`, `message-bubble`, `message-text`, `message-media`, `message-sender`, `message-time`, `message-status`, `message-error`, `message-retry`, `system-line`, `new-messages-button`

`message-audio` (ตัวเล่น มี `data-playing` `true`/`false`) และ `message-audio-toggle` (ปุ่มเล่นหรือหยุด) `message-media` ของเสียงมี `data-media-kind="audio"`

`message-quote` มี `data-available` (`true`/`false`) และ `data-quoted-id` เมื่อกดได้

`message-group` มี `data-author` (`customer`/`admin`/`ai`) และ `message-bubble` มี `data-message-id`, `data-author`, `data-type`, `data-status` (`pending`/`sent`/`failed` หรือ `none` สำหรับขาเข้า), `data-media-status` (`pending`/`ready`/`failed`/`too_large`) ส่วน `system-line` มี `data-message-id` และ `data-event-code` (ค่าของ `eventCode` เช่น `handoff.ai_not_in_knowledge`)

ช่องตอบ: `composer`, `composer-input`, `composer-send`, `composer-attach`, `composer-file-input`, `composer-hint`, `composer-disabled-reason`, `attachment-tray`, `attachment-preview`, `attachment-progress`, `attachment-status`, `attachment-cancel` (`attachment-tray` มี `data-state` ตามข้อ 7.6)


## 6. แผงข้อมูลผู้ใช้และ dialog ของหน้าแชท

### 6.1 Component

```
src/features/inbox/thread/InfoPanel.tsx
  ContactAvatar, AiSwitch (size "md", showNote)
  NotesBlock.tsx      โน้ตของแอดมิน (inbox.notes.logic.ts, inbox.notes.hooks.ts)
```

`NotesBlock` อยู่ท้ายแผงใต้รายการข้อมูล เส้นบน 1px `line` padding 12px 16px: หัว `inbox.notes.title` ตัวหนาพร้อมไอคอน `Lock` (ป้ายบอกว่าเห็นเฉพาะแอดมินเป็นคำ ไม่ใช่สีอย่างเดียว) บรรทัด `inbox.notes.hint` สี `muted`, `<textarea>` 2 บรรทัดขยายได้ (ชื่อ `inbox.notes.inputLabel` placeholder `inbox.notes.placeholder`) Enter เพิ่ม Shift+Enter ขึ้นบรรทัดใหม่ ใต้ช่องคือ `inbox.notes.keys` หรือข้อความผิดพลาด (`inbox.notes.tooLong`, รหัสจาก server หรือ `inbox.notes.addFailed`) และตัวนับ `inbox.notes.counter` (แดงเมื่อเกิน) ปุ่ม `inbox.notes.add` ขนาด sm รายการเป็น `<ul>` คั่นด้วยเส้น `line` แต่ละโน้ตคือข้อความ `pre-wrap` + เวลา `formatDateTime` (`text-meta` `muted`) + ปุ่มไอคอน `Trash2` ชื่อ `inbox.notes.delete` โน้ตที่กำลังบันทึกจาง 0.6 พร้อม `inbox.notes.saving` แทนเวลาและไม่มีปุ่มลบ ลบผ่าน `ConfirmDialog` (`inbox.notes.deleteTitle`, `inbox.notes.deleteDescription`, ปุ่ม `inbox.notes.deleteConfirm` สีแดง) สำเร็จ toast `inbox.notes.deleted` สามสถานะแยกกัน: skeleton สองบรรทัด, `ErrorState` `inbox.notes.error` พร้อมปุ่มลองใหม่ และ `inbox.notes.empty` ทำงานเหมือนกันในคอลัมน์ข้าง (1280) และแผงเต็มจอ (390) query key `qk.contactNotes(id)` ไม่ polling

Props: `{ contactId: string; onClose(): void; mode: "column" | "sheet" | "fullscreen" }` ใช้ `useContactDetail` และ `useSettings` ตัวเดียวกับส่วนหัว จึงไม่ยิงซ้ำ `InboxPage` ใส่ `key={contactId}` ให้แผง (ที่ `SectionErrorBoundary` ที่ห่อ) เปลี่ยนแชทจึงได้แผงใหม่: โน้ตที่พิมพ์ค้าง ข้อความผิดพลาด และ dialog ลบที่เปิดอยู่เป็นของผู้ใช้คนเดียว ไม่ติดไปผู้ใช้คนถัดไป

โน้ต: การเพิ่มโน้ตโหลดรายการใหม่เมื่อจบ (สำเร็จหรือไม่) เพราะการเพิ่มก่อนรายการแรกโหลดเสร็จยกเลิกการโหลดนั้น และโน้ตที่มีอยู่จะไม่ขึ้นจนกว่าแผงจะ mount ใหม่ dialog ลบโน้ตล้างผลของการลองครั้งก่อนเมื่อปิด เปิดใหม่จึงไม่เห็นข้อความผิดพลาดเก่า

สถานะเปิดปิดเก็บใน `localStorage` key `tw.infoPanelOpen` ค่าเริ่มต้นเปิดที่ `wide` และปิดที่ช่วงอื่น (ค่าที่จำไว้ใช้เฉพาะ `wide`)

### 6.2 รูปลักษณ์

| ส่วน | ค่า |
| --- | --- |
| คอลัมน์ | กว้าง 256px พื้น `surface` เส้นซ้าย 1px `line` |
| หัว | สูง 54px `inbox.info.title` แบบ `text-section` ปุ่ม `X` `aria-label` `inbox.info.close` |
| โปรไฟล์ | padding 20px 16px: รูป 56px, ชื่อ 16px ตัวหนา, `inbox.info.followedAt` 14px สี `muted` |
| แถว AI | เส้นบนล่าง 1px `line` padding 14px 16px: ป้าย `inbox.ai.label` 15px ตัวหนาซ้าย สวิตช์ขวา หมายเหตุหนึ่งบรรทัด 14px สี `muted` ใต้ป้าย |
| รายละเอียด | `<dl>` แต่ละแถว padding 12px 16px คั่นด้วยเส้น 1px `line`: ป้าย 14px สี `muted` ซ้าย ค่า 15px ขวา `tabular-nums` ไม่ใช้การ์ด |

แถวรายละเอียด:

| ป้าย | ค่า |
| --- | --- |
| `inbox.info.status` | `inbox.thread.following` หรือ `inbox.contact.unfollowed` ถ้ารอแอดมิน เพิ่มบรรทัดที่สองสี `warn` `inbox.thread.needsAdmin` |
| `inbox.info.messageCount` | `messageCount` คั่นหลักพัน |
| `inbox.info.aiReplyCount` | `inbox.info.timesValue` แทน `{n}` |
| `inbox.info.lastContact` | `formatDateTime(lastMessage.at)` เช่น `18 พ.ย. 14:32` |

ไม่แสดง token หรือค่าใช้จ่าย ([webchat-inbox](webchat-inbox.md))

### 6.3 สถานะ

| สถานะ | แสดง | `data-testid` |
| --- | --- | --- |
| กำลังโหลด | วงกลม 56px + 2 แท่ง + 4 แถว skeleton | `info-skeleton` |
| ผิดพลาด | `inbox.info.error` + `common.action.retry` | `info-error` |
| ปกติ | ตามข้อ 6.2 | `info-panel` |

ไม่มีสถานะว่าง เพราะแผงเปิดได้เฉพาะเมื่อเลือกผู้ใช้แล้ว

### 6.4 Lightbox ของรูปและวิดีโอ

`MediaLightbox.tsx` props: `{ message: ThreadMessage | null; onClose(): void }` ใช้ `Dialog` ของ shadcn/ui

| ส่วน | ค่า |
| --- | --- |
| พื้นหลัง | เต็มจอ `rgba(25,19,39,.92)` |
| เนื้อหา | รูป `media.url` หรือ `<video controls playsinline preload="metadata">` ขนาดพอดีจอ (`object-fit: contain`, เว้นขอบ 56px; จอแคบ 0) |
| ปุ่ม | มุมขวาบน: `ExternalLink` (`aria-label` `inbox.lightbox.openOriginal`, เปิด `media.url` แท็บใหม่) และ `X` (`aria-label` `inbox.lightbox.close`) ทั้งคู่ 44×44 ไอคอนขาว |
| โหลดไม่ได้ | `inbox.media.imageFailed` หรือ `inbox.media.videoFailed` ตัวขาวกลางจอ |

คีย์บอร์ด: เปิดแล้ว focus ที่ปุ่มปิด Escape ปิด focus กลับภาพตัวอย่างที่กด วิดีโอหยุดเมื่อปิด

`data-testid`: `media-lightbox`, `lightbox-open-original`, `lightbox-close`

### 6.5 `data-testid` ของแผงข้อมูล

`info-notes`, `info-notes-skeleton`, `info-notes-error`, `info-notes-empty`, `info-note` (มี `data-note-id` และ `data-pending` ระหว่างบันทึก), `info-note-input`, `info-note-add`, `info-note-counter`, `info-note-error`, `info-note-delete`, `info-note-delete-dialog`, `info-note-delete-confirm`, `info-panel`, `info-close`, `info-skeleton`, `info-error`, `info-name`, `info-followed-at`, `info-ai-switch`, `info-ai-note`, `info-status`, `info-message-count`, `info-ai-reply-count`, `info-last-contact`

## 7. การดึงข้อมูลและ state ฝั่ง client

หัวข้อนี้ทำตาม [protocol ของ polling](../architecture/api-contract.md#protocol-ของ-polling) ตรงตัว: cursor คือ `highWater` ของ `updatedSeq` ที่ server คืน, ทุกรอบขอ `afterUpdatedSeq = pollAfter(cursor)` ซึ่งย้อนหลัง `POLL_OVERLAP_SEQ`, รวมผลด้วย id โดยแถวที่ `updatedSeq` สูงกว่าชนะ และโหลดหน้าแรกใหม่ทั้งหมดเมื่อแท็บกลับมาแสดงหรือเมื่อการเชื่อมต่อกลับมาได้

### 7.1 Query key

ทุก key ประกาศใน `src/common/query-keys.ts`:

```ts
export const qk = {
  settings: () => ["settings"] as const,
  contacts: (p: { filter: ContactFilter; q: string }) => ["contacts", p] as const,
  contact: (id: string) => ["contact", id] as const,
  messages: (id: string) => ["messages", id] as const,
  kbDocuments: () => ["kb-documents"] as const,
  kbDocument: (id: string) => ["kb-document", id] as const,
  usage: (month: string) => ["usage", month] as const,
  usageDetail: (contactId: string, month: string) => ["usage-detail", contactId, month] as const,
  systemStatus: () => ["system-status"] as const,
};
```

| Key | Function | Polling | staleTime | หมายเหตุ |
| --- | --- | --- | --- | --- |
| `settings` | `getSettings` | ไม่ | 30 วินาที | refetch เมื่อกลับมาที่แท็บ ค่า `client.pollIntervalMs` ใช้เป็นช่วง polling |
| `contacts` | `listContacts` | ทุก `POLL_INTERVAL_MS` ด้วย `afterUpdatedSeq` (ข้อ 7.2) | 0 | ค่าใน cache คือ `ContactListState` |
| `contact` | `getContact` | ทุก `POLL_INTERVAL_MS` ขณะเปิดแชท | 0 | |
| `messages` | `getMessages` | ทุก `POLL_INTERVAL_MS` ด้วย `afterUpdatedSeq` ขณะเปิดแชท (ข้อ 7.3) | 0 | ค่าใน cache คือ `ThreadState` |
| `kb-documents` | `listKbDocuments` | ทุก `POLL_INTERVAL_MS` เฉพาะเมื่อมีไฟล์สถานะ `processing` | 0 | |
| `kb-document` | `getKbDocument` | ไม่ | ไม่หมดอายุ | ข้อความที่แปลงแล้วไม่เปลี่ยน |
| `usage`, `usage-detail` | `getUsage`, `getUsageDetail` | ไม่ | 60 วินาที | |
| `system-status` | `getSystemStatus` | ทุก `SYSTEM_STATUS_POLL_MS` ขณะหน้าตั้งค่าเปิด | 0 | |

`retry` ของ query: 0 สำหรับ query ที่ poll (รอบถัดไปคือการลองใหม่) และ 1 สำหรับ query อื่น ไม่ retry เมื่อได้ 4xx

### 7.2 รายชื่อผู้ใช้

`useContacts({ filter, q })` เก็บใน `qk.contacts({ filter, q })`:

```ts
type ContactListState = {
  items: ContactDto[];          // ผ่าน matchesContactFilter และเรียงด้วย compareContacts แล้ว
  counts: { all: number; unread: number; needsAdmin: number };
  lineConfigured: boolean;
  before: string | null;        // cursor ของหน้าถัดไป
  hasMore: boolean;             // ของการแบ่งหน้า
  cursor: string;               // highWater สูงสุดที่เคยได้ (updatedSeq)
};
```

1. หน้าแรก: `listContacts({ filter, q })` แล้ว `cursor = highWater`
2. ทุกรอบ poll: `listContacts({ afterUpdatedSeq: pollAfter(cursor) })` ได้ผู้ใช้ที่เปลี่ยนโดยไม่กรอง แล้ว `items = mergeById(items, page.contacts)` กรองด้วย `matchesContactFilter(c, filter, q)` เรียงด้วย `compareContacts`, `counts` และ `lineConfigured` ใช้ค่าล่าสุด, `cursor = advanceCursor(cursor, page.highWater)` ถ้า `page.hasMore` เป็น true ขอรอบถัดไปทันที
3. เลื่อนลง: `listContacts({ filter, q, before })` ต่อท้าย `items` ด้วย `mergeById` ไม่แตะ `cursor`
4. เปลี่ยน `filter` หรือ `q`: key ใหม่ โหลดหน้าแรกของ key นั้น
5. `AppShell` poll `qk.contacts({ filter: "all", q: "" })` เมื่อหน้าแชทไม่ได้เปิด (เช่น หน้าตั้งค่า) เพื่อให้เมนูมี `counts.unread` เสมอ เมื่อหน้าแชทเปิด เมนูอ่าน `counts` จาก key ที่หน้าแชทใช้

### 7.3 ข้อความ

`useThread(contactId)` เก็บใน `qk.messages(contactId)`:

```ts
type ThreadState = { items: ThreadMessage[]; hasOlder: boolean; cursor: string };
```

1. เปิดแชท: `getMessages(id, {})` ได้ `MESSAGE_PAGE_LIMIT` ข้อความล่าสุด `hasOlder` และ `highWater` แล้ว `cursor = highWater` และเรียก `markContactRead` (ข้อ 5.5)
2. ทุกรอบ poll: `getMessages(id, { afterUpdatedSeq: pollAfter(cursor) })` ได้ทั้งข้อความใหม่และข้อความเดิมที่สถานะเปลี่ยน (สถานะการส่ง, สถานะสื่อ) แล้ว `items = mergeThread(items, page.messages)`, `cursor = advanceCursor(cursor, page.highWater)` ถ้า `page.hasMore` ขอรอบถัดไปทันที
3. `fetchOlder()`: `getMessages(id, { beforeSeq: oldestSeq(items) })` แล้วรวมด้วย `mergeThread` ไม่แตะ `cursor`
4. ข้อความที่แอดมินเพิ่งส่ง (id สร้างที่หน้าเว็บ) ถูกแทนด้วยแถวจาก server เมื่อ id ตรงกัน ทั้งจากคำตอบของ `sendMessage` และจาก polling
5. บรรทัดเหตุการณ์มาจากรายการนี้ด้วย (`type` เป็น `event`) ไม่มี query แยก

### 7.4 รอบ polling ร่วม

`usePollingInterval()` ใน `src/common/polling.ts`:

- ช่วงปกติคือ `getSettings().client.pollIntervalMs` (server อ่านจาก `POLL_INTERVAL_MS`) ไม่ใช้ `NEXT_PUBLIC_` ([frontend](../architecture/frontend.md))
- `refetchIntervalInBackground: false` จึงหยุดเมื่อแท็บถูกซ่อน
- เมื่อแท็บกลับมาแสดง (`visibilitychange`) หรือเมื่อ query ที่เคยล้มกลับมาสำเร็จ: โหลดหน้าแรกใหม่ของ `contacts`, `messages` ที่เปิดอยู่ และ `contact` เพราะอาจพลาดแถวที่เกินระยะย้อนหลัง แล้ว**รวม**หน้าแรกนั้นเข้ากับสิ่งที่โหลดไว้ ไม่แทนที่: แถวของหน้าที่เก่ากว่าที่ผู้อ่านโหลดไว้, `hasOlder` และ cursor ของหน้าถัดไป (`before`) คงอยู่ ตำแหน่งที่อ่านจึงไม่กระโดด (`contactListFromPage`, `threadFromFirstPage`) ถ้าหน้าแรกของแชทไม่ซ้อนกับแถวใหม่สุดที่โหลดไว้ (มีข้อความใหม่เกินหนึ่งหน้าระหว่างซ่อน) แถวเดิมของ server ถูกทิ้งแทนการแสดงช่องว่างตรงกลาง ข้อความที่ยังไม่มี `seq` (กำลังส่ง) ถูกเก็บไว้เสมอ แถวที่เก่ากว่าหน้าแรกคงสถานะเดิมจนกว่าจะเปลี่ยนอีกครั้ง
- TanStack Query ไม่เริ่มรอบใหม่ของ key เดียวกันขณะรอบก่อนยังไม่จบ
- ความล้มเหลวนับต่อ query (`PollController.failuresOf(key)`): query ที่ล้มติดกัน n รอบใช้ช่วงถัดไป `nextPollDelay(n, base)` ของตัวเอง (`intervalFor(queryKey)`) query อื่นที่สำเร็จคงช่วงปกติ สำเร็จหนึ่งรอบแล้ว query นั้นกลับช่วงปกติ
- แถบการเชื่อมต่อแสดงเมื่อ query ใดล้มติดกันถึง `POLL_FAILURES_BEFORE_BANNER` รอบ (snapshot เก็บค่ามากที่สุดของทุก query) จึงมีแถบเดียว
- การโหลดใหม่หลังกลับมาเชื่อมต่อเกิดเมื่อ query ที่เคยล้มสำเร็จเท่านั้น (ความสำเร็จของ query ที่ไม่เคยล้มไม่นับ) ครั้งเดียวต่อการกลับมา และห่างจากการโหลดใหม่ครั้งก่อนไม่น้อยกว่าช่วง polling ปกติ (`setMinReloadGap(base)`) ถ้ายังไม่ถึงเวลา ระบบตั้งการโหลดใหม่ครั้งเดียวไว้เมื่อถึง query ที่ล้มอยู่ตลอดจึงไม่ทำให้เกิดคำขอรัว
- แชทที่เปิดไม่ poll รายชื่อของตัวเอง: อ่าน `lineConfigured` จากรายชื่อใน cache ที่อัปเดตล่าสุด (`useLineConfigured`) รายชื่อที่หน้าจอแสดง (ตามตัวกรองและคำค้น) จึงเป็นคำขอเดียวต่อรอบ

### 7.5 การส่งข้อความแบบ optimistic

`useSendMessage(contactId)` คืน `{ send(input), retry(messageId) }`

สถานะของข้อความขาออกฝั่ง client:

| สถานะ | ความหมาย | ผู้ใช้เห็น |
| --- | --- | --- |
| `sending` | สร้าง id แล้ว ใส่ใน cache แล้ว คำขอกำลังไป | ฟองทึบ 0.55 + "กำลังส่ง" |
| `sent` | server ตอบ `delivery.status: "sent"` | ฟองปกติ + ไอคอนส่งแล้ว |
| `failed` | server ตอบ `delivery.status: "failed"` พร้อม `delivery.errorCode` หรือ API ตอบ error | "ส่งไม่สำเร็จ · เหตุผล" + "ส่งอีกครั้ง" (ไม่มีปุ่มเมื่อหน้าต่างของ retry key ผ่านแล้ว ข้อ 5.3) |
| `unconfirmed` | คำขอไม่ได้คำตอบ (`client.network`) | ยังแสดง "กำลังส่ง" |

การเปลี่ยนสถานะ:

| จาก | เหตุการณ์ | ไป | ทำอะไร |
| --- | --- | --- | --- |
| (ไม่มี) | กดส่ง | `sending` | `id = uuidv7()` ในฝั่ง browser, ใส่ `{ id, seq: null, updatedSeq: null, author: "admin", direction: "outbound", delivery: { status: "pending", errorCode: null, retryExpiresAt: null }, localState: "sending", createdAt: now }` ท้าย `items` แล้ว `sendMessage(contactId, { id, kind, ... })` |
| `sending` | ได้ `MessageDto` ที่ `delivery.status` เป็น `sent` | `sent` | แทนที่ด้วยข้อมูลจาก server (ได้ `seq` และ `updatedSeq`) |
| `sending` | ได้ `MessageDto` ที่ `failed` | `failed` | แทนที่ด้วยข้อมูลจาก server |
| `sending` | API ตอบ error มีรหัส (4xx/5xx) | `failed` | `localState: "failed"`, `localError: code` |
| `sending` | ไม่มีคำตอบ | `unconfirmed` | เริ่มนับ `SEND_UNCONFIRMED_TIMEOUT_MS` |
| `unconfirmed` | polling พบ id เดียวกันจาก server | ตามสถานะของ server | `mergeThread` แทนที่ให้เอง |
| `unconfirmed` | ครบเวลาแล้วยังไม่พบ | `failed` | `localError: "client.network"` |
| `failed` (มี `seq`, server รู้จัก) | กดส่งอีกครั้ง | `sending` | `retryMessage(contactId, id)` ซึ่ง server ส่งด้วย push และ retry key เดิมเสมอ `retryPlan(row, now)` คืน null เมื่อ `isRetryExpired(row, now)` จึงไม่มีปุ่มและไม่เรียก |
| `sending` (retry) | server ตอบ `message.retry_expired` | `failed` | `localError: "message.retry_expired"` ฟองแสดงเหตุผลนั้นและซ่อนปุ่ม |
| `failed` (ไม่มี `seq`, server อาจไม่รู้จัก) | กดส่งอีกครั้ง | `sending` | `sendMessage` ด้วย id เดิมและเนื้อหาเดิม server กันซ้ำด้วย primary key จึงไม่ส่งสองครั้ง |
| ทุกสถานะ | polling คืนแถวของ id นี้ | ตาม server | server ชนะเสมอเมื่อมี `updatedSeq` |

สำเร็จหรือล้มเหลวแล้ว invalidate `qk.contact(id)` เพราะ server ปิด AI ตอบแทนและล้างสถานะรอแอดมินเมื่อแอดมินส่งข้อความ ส่วนรายชื่อเห็นการเปลี่ยนจาก polling รอบถัดไป

ข้อความสื่อใช้ state เดียวกัน โดย body เป็น `{ id, kind: "image" | "video", uploadId, contentType }` ตาม [api-contract](../architecture/api-contract.md#post-apicontactsidmessages) ฟองแสดงภาพตัวอย่างจาก object URL ในเครื่อง (`localPreviewUrl`) จนกว่า server จะคืน `media.previewUrl`

### 7.6 ขั้นตอนแนบไฟล์

`useAttachment(contactId)` เป็น state machine แยกเป็นสามไฟล์ใน `src/features/inbox/composer/`: `inbox.attachment.logic.ts` (`attachmentReducer`, `isAttachmentPending`, `conversionFor`, `trayView`, `attachmentErrorText`, `attachmentErrorCode`, `previewsToRelease` เป็นฟังก์ชันล้วน), `inbox.attachment.controller.ts` (`createAttachmentController` ทำขั้นตอนด้านล่างผ่านฟังก์ชันของ browser และ API ที่ส่งเข้ามา) และ `inbox.composer.hooks.ts` (`useAttachment`, `useReleaseSentPreviews` ผูก controller กับ React และฟังก์ชันจริงของ browser)

```
idle → validating → converting → requesting → uploading → ready → (ส่ง) → idle
           │            │            │            │          │
           └→ rejected  └→ failed    └→ failed    └→ failed  └→ (ยกเลิก) → cancelling → idle
ทุกสถานะก่อน ready: ยกเลิก → cancelling → idle
```

| ขั้น | ทำอะไร | ล้มเหลวแล้ว |
| --- | --- | --- |
| 1. เลือกไฟล์ | จาก `<input type="file">` หรือวางจาก clipboard ในช่องพิมพ์ | |
| 2. `validating` | `readHeadBytes(file, 64)` แล้ว `validateAttachment({ name, type, size }, head)` | `rejected` + ข้อความ client ตามรหัสใน [ui-copy](ui-copy.md) `inbox.attach.error.*` |
| 3. `converting` | WebP: `convertToJpeg(file)` ด้วย canvas; HEIC/HEIF: `convertHeicToJpeg(file)` (ข้อ 8.3) ซึ่งลองถอดรหัสของ browser ก่อน แล้วจึงโหลด `heic-to` แบบ dynamic; รูปทุกชนิด: `buildPreviewImage(blob)`; วิดีโอ: `captureVideoFrame(file)` แล้วตรวจขนาดหลังแปลงอีกครั้งด้วย `validateAttachment` | `failed` + `inbox.attach.error.convertFailed` (บอกให้ใช้ JPEG หรือ PNG) |
| 4. `requesting` | `requestUpload({ kind, contentType, sizeBytes, preview: { contentType: "image/jpeg", sizeBytes } })` ได้ `UploadTicketDto { uploadId, expiresAt, original, preview }` | `failed` + ข้อความจาก error catalog |
| 5. `uploading` | `uploadToTarget(ticket.preview, previewBlob)` แล้ว `uploadToTarget(ticket.original, mainBlob, { onProgress })` ด้วย `AbortController` เดียวกัน ความคืบหน้าที่แสดงคิดจากไฟล์หลัก | `failed` + `inbox.attach.error.uploadFailed` และเรียก `cancelUpload` |
| 6. `ready` | ปุ่มส่งกดได้ | |
| 7. ส่ง | ข้อ 7.5 ด้วย `uploadId` และ `contentType` ของไฟล์หลัก แล้ว `URL.revokeObjectURL` ของภาพตัวอย่างหลัง server คืน `media.previewUrl` | ตามข้อ 7.5 (ส่งอีกครั้งไม่ต้องอัปโหลดใหม่) |
| ยกเลิก | `abort()`, ถ้าได้ ticket แล้ว `cancelUpload(uploadId)` (ไม่รอผล ล้มเหลวไม่แสดงอะไร), revoke object URL ทั้งหมด | |

เปลี่ยนแชทหรือปิดหน้าขณะมีไฟล์แนบที่ยังไม่ส่ง ทำเหมือนกดยกเลิก (ปิดแท็บกลางคันไม่ตามเก็บ ตาม [line-messaging](line-messaging.md#สื่อขาออก))

`UploadTargetDto` มีสองแบบตาม adapter ของ `FileStorage` ซึ่ง server เลือก รูปแบบอยู่ใน [api-contract](../architecture/api-contract.md#การอัปโหลดตาม-strategy):

| `strategy` | `uploadToTarget` ทำอะไร |
| --- | --- |
| `http_put` | `XMLHttpRequest` แบบ `PUT target.url` (ซึ่งชี้ไปที่ `PUT /api/local-storage/*key`) ด้วย `target.headers` เพื่อได้ `upload.onprogress` |
| `vercel_blob_client` | client upload ของ `@vercel/blob/client` ด้วย `target.pathname` และ `target.clientToken` (การรายงานความคืบหน้าต้องยืนยันกับเอกสารของ `@vercel/blob` ถ้าไม่มี `onProgress(null)` และแสดงแถบแบบไม่ระบุเปอร์เซ็นต์) |

### 7.7 Cache หลัง mutation

| Mutation | ทำอะไรกับ cache |
| --- | --- |
| `setContactAi` | `qk.contact(id)` แบบ optimistic แล้วแทนด้วยผล และ `mergeById` ผลเข้า `qk.contacts(*)` |
| `markContactRead` | `mergeById` ผลเข้า `qk.contacts(*)` |
| `sendMessage`, `retryMessage` | `mergeThread` เข้า `qk.messages(id)` และ invalidate `qk.contact(id)` |
| `updateSettings` | แทน `qk.settings()` ด้วยผล และ invalidate `qk.systemStatus()` |
| `testTopicGuard` | invalidate `qk.settings()` (ตัวนับ `guard.blockedToday`), `qk.systemStatus()` และ `usage` ของเดือนนี้ เพราะการทดลองมีค่าใช้จ่าย |
| `saveLineCredentials`, `testLineConnection` | invalidate `qk.settings()` และ `qk.systemStatus()` |
| `uploadKbDocument`, `retryKbDocument`, `deleteKbDocument` | invalidate `qk.kbDocuments()` และ `usage` ทุกเดือน |
| `lock` | หยุดทุก query แล้วโหลดหน้าใหม่ทั้งหน้า ซึ่งทิ้ง cache ทั้งหมด (ข้อ 3.1) |

## 8. ฟังก์ชันล้วนฝั่งหน้าจอ

ทุกฟังก์ชันในหัวข้อนี้ไม่อ่านเวลาเองและไม่มีผลข้างเคียง เวลาส่งเข้ามาเป็นอาร์กิวเมนต์ `now` แปลงเขตเวลาด้วย `Intl` ระบุ `Asia/Bangkok` ทุกครั้ง มี unit test ข้างไฟล์ ([test-strategy](../qa/test-strategy.md) ชั้นที่ 1)

### 8.1 `src/common/common.logic.ts`

```ts
function initialOf(name: string): string
```
- ชื่อว่างหรือมีแต่ช่องว่าง คืน `"?"`
- แยกด้วย `Intl.Segmenter("th", { granularity: "grapheme" })` ข้ามสระหน้า `เ แ โ ใ ไ` และอักขระที่ไม่ใช่ตัวอักษร คืน grapheme แรกที่เหลือ อักษรละตินเป็นตัวใหญ่
- ตัวอย่าง: `"เอ็มมี่"` → `"อ"`, `"somchai"` → `"S"`, `"🍰 Cake"` → `"C"`

```ts
function avatarColor(id: string): string
```
- hash แบบ FNV-1a ของ id แล้วเลือกจาก `AVATAR_COLORS` ([project-setup](../architecture/project-setup.md#105-หน้าจอ))

```ts
function formatMessageTime(iso: string): string        // "14:32"
function formatDateTime(iso: string, now: Date): string // "18 พ.ย. 14:32", ข้ามปีเพิ่มปี พ.ศ.
function formatMonthYear(year: number, month: number): string // "พ.ย. 2569" (ปี ค.ศ. เข้า พ.ศ. ออก)
function formatMonthKey(monthKey: string): string      // "2026-11" → "พ.ย. 2569" รูปอื่นคืนตามเดิม
function formatDateKey(dateKey: string): string        // "2026-11-03" → "3 พ.ย. 2569" มีปีเสมอ รูปอื่นคืนตามเดิม
function formatUsdForScreen(usd: string): string        // UsdString → "$1,234.56" ค่าที่มากกว่า 0 แต่ปัดแล้วเป็น 0.00 แสดง "<$0.01"
function formatInt(value: number): string               // "12,345"
function nextPollDelay(failures: number, baseMs: number): number
// failures = 0 → baseMs, นอกนั้น min(baseMs * 2^(failures - 1), POLL_BACKOFF_MAX_MS)
function pollAfter(cursor: string): string               // max(0, cursor - POLL_OVERLAP_SEQ) คำนวณด้วย bigint
function advanceCursor(cursor: string, highWater: string): string // ค่าที่มากกว่า
function mergeById<T extends { id: string; updatedSeq: string | null }>(current: readonly T[], incoming: readonly T[]): T[]
// รวมด้วย id เก็บตัวที่ updatedSeq สูงกว่า (null คือยังไม่ถึง server ถือว่าต่ำที่สุด) แถวใหม่ต่อท้าย
function nextTabIndex(key: string, current: number, count: number): number | null
// แท็บแนวนอน: ArrowRight, ArrowLeft วนรอบ, Home, End; ปุ่มอื่นคืน null ใช้ทั้งแท็บของรายชื่อและแท็บของหน้าตั้งค่า
```

รูปแบบวันที่และเวลาบนหน้าจอทุกจุดมาจากฟังก์ชันของข้อนี้และ `formatListTime`, `formatDayChip` (ข้อ 8.2) ตามกฎใน [ux-writing](../guidelines/ux-writing.md#วันที่และเวลา) ไม่มีสตริง ISO บนหน้าจอ

`pollAfter`, `advanceCursor` และ `mergeById` คือกฎของ [protocol ของ polling](../architecture/api-contract.md#การเลื่อน-cursor-และการขอย้อนหลัง) ใช้ทั้งรายชื่อและข้อความ

### 8.2 `src/features/inbox/inbox.logic.ts`

ฟังก์ชันของหัวข้อนี้แยกอยู่สี่ไฟล์ตามเรื่อง ชื่อและพฤติกรรมตามที่เขียนไว้ด้านล่าง (path นับจาก `src/features/inbox/`):

| ไฟล์ | ฟังก์ชัน |
| --- | --- |
| `inbox.logic.ts` | การจัดรูปเวลาในรายชื่อ ตัวอย่างข้อความล่าสุด การกรองและเรียงรายชื่อ การจัดกลุ่มข้อความและป้ายวัน `threadSubline`, `aiSwitchView` และ type `AttachmentState` |
| `list/inbox.list.logic.ts` | `parseFilter`, `filterQuery`, `contactHref`, `unreadBadgeText`, `unreadAriaText`, `emptyState`, `nextRowIndex`, `tabbableRowId` |
| `thread/inbox.thread.logic.ts` | `newMessages`, `planTailScroll`, `shouldLoadOlder`, `restoredScrollTop`, `resolveMedia`, `otherLabel`, `deliveryReason`, `failedLineText`, `fillCopy` |
| `inbox.send.logic.ts` | การเปลี่ยนสถานะของการส่งแบบ optimistic ตามข้อ 7.5 และการรวมหน้าของแชท (`threadFromFirstPage`, `applyThreadPoll`, `applyOlderPage`, `loadThread`, `buildSendBody`, `optimisticMessage`, `bodyFromRow`, `applySendEvent`, `failureEvent`, `pendingSendOfUpload`, `retryPlan(row, now)`, `isRetryExpired(row, now)`, `outgoingStatus`) |

```ts
function formatListTime(iso: string, now: Date): string
```
- วันเดียวกัน (เวลาไทย): `"14:32"`
- เมื่อวาน: `common.time.yesterday`
- ภายใน 6 วันก่อนหน้า: ชื่อวันย่อจาก `Intl.DateTimeFormat("th-TH", { weekday: "short" })` เช่น `"พ."`
- เก่ากว่านั้น ปีเดียวกัน: `"18 พ.ย."`; ต่างปี: `"18 พ.ย. 2568"`
- อนาคต (นาฬิกาเพี้ยน): แสดงเวลา

```ts
function formatDayChip(dateKey: string, now: Date): string
```
- `dateKey` คือ `YYYY-MM-DD` ตามเวลาไทย วันนี้ `common.time.today` เมื่อวาน `common.time.yesterday` ปีเดียวกัน `"18 พ.ย."` ต่างปี `"18 พ.ย. 2568"`

```ts
type ThreadMessage = Omit<MessageDto, "seq" | "updatedSeq"> & {
  seq: string | null;                 // null ขณะยังไม่ถึง server
  updatedSeq: string | null;
  localState?: "sending" | "unconfirmed" | "failed";
  localError?: string;
  localPreviewUrl?: string;
};
function mergeThread(current: readonly ThreadMessage[], incoming: readonly MessageDto[]): ThreadMessage[]
```
1. `mergeById(current, incoming)`: แถวจาก `incoming` แทนแถวที่ id ตรงกันเมื่อ `updatedSeq` สูงกว่า และล้าง `localState`, `localError` แต่คง `localPreviewUrl` จนกว่าแถวจาก server มี `media.previewUrl`
2. แถวใน `current` ที่ไม่มีใน `incoming` อยู่ต่อ
3. เรียงด้วย `sortMessages`: `seq` จากน้อยไปมาก แถวที่ยังไม่มี `seq` อยู่ท้ายสุดตามลำดับ `createdAt` บรรทัดเหตุการณ์อยู่ในลำดับนี้ด้วย
4. ถ้าผลลัพธ์เท่าเดิมทุกแถว (เทียบ id, `updatedSeq`, `localState`) คืน `current` ตัวเดิม เพื่อไม่ให้ React render ใหม่และไม่เลื่อนจอ

```ts
function oldestSeq(items: readonly ThreadMessage[]): string | undefined   // seq ต่ำสุดที่ไม่เป็น null ใช้เป็น beforeSeq
```

```ts
type DisplayItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "group"; key: string; author: "customer" | "admin" | "ai"; messages: ThreadMessage[] }
  | { kind: "event"; key: string; message: ThreadMessage };
function groupMessagesForDisplay(items: readonly ThreadMessage[], now: Date): DisplayItem[]
```
- รับ `items` ที่เรียงแล้ว ใส่ `day` ก่อนรายการแรกของแต่ละวันตามเวลาไทย
- ข้อความที่ `type` เป็น `event` กลายเป็น `{ kind: "event" }` ในตำแหน่งเดิมของมัน และตัดกลุ่มเสมอ ข้อความไทยมาจาก `eventCodeText(message.eventCode)` ([error-catalog](../architecture/error-catalog.md#บรรทัดเหตุการณ์)) `eventCode` ที่ไม่รู้จักถูกข้าม
- ข้อความต่อกันอยู่กลุ่มเดียวเมื่อ: `author` เดียวกัน, วันเดียวกัน และห่างจากข้อความก่อนหน้าไม่เกิน `GROUP_GAP_MS` แอดมินกับ AI แยกกลุ่มเพราะป้ายผู้ส่งต่างกัน
- key คงที่ (id ของข้อความแรกในกลุ่ม, `day-YYYY-MM-DD`, id ของบรรทัดเหตุการณ์)

```ts
function matchesContactFilter(c: ContactDto, filter: ContactFilter, q: string): boolean
// unread: unreadCount > 0, needs_admin: needsAdmin, q ว่างตรงทุกคน ไม่ว่าง: displayName มี q แบบไม่สนตัวพิมพ์
function compareContacts(a: ContactDto, b: ContactDto): number
// (lastMessage?.at ?? createdAt) ใหม่ไปเก่า แล้ว id ใหม่ไปเก่า ตรงกับลำดับของ GET /api/contacts
// lastMessage.at คือเวลาข้อความล่าสุดของผู้ใช้ ข้อความของแอดมินหรือ AI จึงไม่ย้ายแถวเมื่อรวมผลของ polling
```

```ts
function shouldStickToBottom(m: { scrollTop: number; scrollHeight: number; clientHeight: number }, thresholdPx = STICK_TO_BOTTOM_PX): boolean
// scrollHeight - scrollTop - clientHeight <= thresholdPx
```

```ts
type Preview = { prefix: string | null; prefixTone: "muted" | "warn"; text: string };
function buildContactPreview(c: ContactDto): Preview
```
- เลิกติดตาม: `{ prefix: null, text: inbox.contact.unfollowed }`
- `needsAdmin`: prefix `inbox.preview.needsAdmin` (`"รอแอดมิน ·"`) tone `warn`
- ไม่ใช่รอแอดมิน และ `lastMessage.by` เป็น `admin` หรือ `ai`: prefix `inbox.preview.you` หรือ `inbox.preview.ai`
- `text`: ถ้า `lastMessage.type` เป็นสื่อใช้คำจาก `inbox.media.*` (รูปภาพ, วิดีโอ, สติกเกอร์, `[ไฟล์]` ฯลฯ) ไม่เช่นนั้นใช้ `lastMessage.text` โดยแทนการขึ้นบรรทัดด้วยช่องว่าง `lastMessage` เป็น null ใช้ `inbox.preview.none`

```ts
type AiSwitchView = { checked: boolean; disabled: boolean; label: string; note: string };
function aiSwitchView(c: ContactDetailDto, killSwitchOn: boolean): AiSwitchView
// ตารางในข้อ 5.2 ค่ามาจาก aiEnabled, followStatus และ kill switch เท่านั้น
function threadSubline(c: ContactDetailDto, killSwitchOn: boolean): { follow: string; ai: string | null; aiTone: "muted" | "warn" }
// needsAdmin → inbox.thread.needsAdmin (warn), aiEnabled และ kill switch เปิด → inbox.thread.aiHelping, นอกนั้น null
```

```ts
type ComposerBlock = "unfollowed" | "line_not_configured" | null;
function composerDisabledReason(c: ContactDetailDto, lineConfigured: boolean): ComposerBlock
// ยังไม่ได้ตั้งค่า LINE มาก่อน เลิกติดตาม
```

```ts
function isSubmitKey(e: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }): boolean
// key === "Enter" && !shiftKey && !isComposing && keyCode !== 229
function canSend(draft: string, attachment: AttachmentState, block: ComposerBlock): boolean
function shouldSendTypingPing(lastSentAt: number | null, nowMs: number, intervalMs: number): boolean
// lastSentAt === null || nowMs - lastSentAt >= intervalMs
type Segment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };
function linkify(text: string): Segment[]
// เฉพาะ http:// และ https:// ตัดเครื่องหมายวรรคตอนท้าย URL ( . , ) ] ) ออกจากลิงก์
```

```ts
type MediaKind = "jpeg" | "png" | "webp" | "heic" | "mp4" | "mov" | "unknown";
function sniffMediaType(head: Uint8Array): MediaKind
```
- JPEG: `FF D8 FF`; PNG: `89 50 4E 47 0D 0A 1A 0A`; WebP: `RIFF....WEBP`
- ISO BMFF (byte 4 ถึง 7 = `ftyp`): brand `heic`, `heix`, `mif1`, `msf1` → `heic`; `qt  ` → `mov`; `isom`, `iso2`, `mp41`, `mp42`, `avc1`, `M4V ` → `mp4`

```ts
type AttachmentCheck =
  | { ok: true; kind: "image" | "video"; needsConversion: boolean; sourceType: MediaKind }
  | { ok: false; code: "unsupported_type" | "mov_not_supported" | "image_too_large" | "video_too_large" | "empty_file"; sizeMb?: string };
function validateAttachment(file: { name: string; type: string; size: number }, head: Uint8Array): AttachmentCheck
```
1. `size === 0` → `empty_file`
2. ชนิดจาก `sniffMediaType(head)` ไม่ใช้นามสกุลหรือ `file.type`
3. `mov` → `mov_not_supported`; `unknown` → `unsupported_type`
4. รูปเกิน `IMAGE_MAX_BYTES` → `image_too_large`; วิดีโอเกิน `VIDEO_MAX_BYTES` → `video_too_large` พร้อม `sizeMb` ทศนิยมหนึ่งตำแหน่ง
5. `heic`, `webp` → `needsConversion: true` (`heic` ครอบทั้ง HEIC และ HEIF)
- ค่าเพดานใช้ constant ร่วมกับ server ใน `src/contracts/` เพราะเป็นค่าเดียวกัน ([code-style](../guidelines/code-style.md) ข้อ 9)

```ts
function computeTargetSize(w: number, h: number, maxEdge: number): { width: number; height: number }
// ย่อให้ด้านยาวไม่เกิน maxEdge คงสัดส่วน ไม่ขยายรูปเล็ก ปัดเป็นจำนวนเต็ม อย่างน้อย 1
```

### 8.3 `src/features/inbox/composer/inbox.media.ts` (ใช้ API ของ browser ไม่ใช่ฟังก์ชันล้วน)

```ts
function readHeadBytes(file: Blob, n: number): Promise<Uint8Array>
function convertToJpeg(file: Blob, quality = 0.9): Promise<Blob>
function convertHeicToJpeg(file: Blob, quality = 0.9): Promise<Blob>
function buildPreviewImage(source: Blob, maxEdge = 480, quality = 0.8): Promise<Blob>
function captureVideoFrame(file: Blob, maxEdge = 480): Promise<Blob>
```
- `convertToJpeg` และ `buildPreviewImage` ถอดรูปด้วย `createImageBitmap` แล้ววาดลง `OffscreenCanvas` (ไม่มีใช้ `<canvas>`) ด้วยขนาดจาก `computeTargetSize` แล้ว `convertToBlob({ type: "image/jpeg" })` พื้นโปร่งใสถมสีขาว `convertToJpeg` ใช้ `maxEdge = 4096`
- `captureVideoFrame` โหลดวิดีโอใน `<video muted playsinline>` จาก object URL, seek ไป 0.1 วินาที รอ `seeked` แล้ววาดเฟรม หมดเวลา 10 วินาทีถือว่าล้มเหลว
- `convertToJpeg` ใช้กับ WebP (และ HEIC ที่ browser ถอดรหัสเองได้)
- `convertHeicToJpeg` ใช้กับ HEIC/HEIF ทำตามลำดับ:
  1. ลอง `convertToJpeg(file)` ก่อน ซึ่งสำเร็จใน browser ที่ถอดรหัส HEIC เองได้ (เช่น Safari)
  2. ถ้า `createImageBitmap` ล้มเหลว โหลด `heic-to` ด้วย `const { heicTo } = await import("heic-to/csp")` ณ ตอนนั้นเท่านั้น `heic-to` ห้ามถูก import แบบ static ที่ใดเลย จึงไม่อยู่ใน bundle แรก (lint บังคับ ดู [project-setup](../architecture/project-setup.md#63-eslintconfigmjs))
  3. `heicTo({ blob: file, type: "image/jpeg", quality })` (ต้องยืนยันชื่อและรูปแบบ export กับรุ่น 1.6.7 ตอนสร้าง) ได้ JPEG แล้วย่อด้วย `computeTargetSize` ถ้าเกิน 4096 จากนั้นเข้าขั้นภาพตัวอย่างและอัปโหลดตามปกติ
  4. ขั้นใด throw (รวม import ไม่สำเร็จ) ให้ throw ต่อ ซึ่ง `useAttachment` แปลงเป็น `failed` + `inbox.attach.error.convertFailed` ที่บอกให้ใช้ JPEG หรือ PNG
- Chrome และ Firefox ถอดรหัส HEIC เองไม่ได้ ทั้งสองจึงใช้ทาง `heic-to` เหตุผลอยู่ใน [ADR 0019](../adr/0019-heic-conversion-with-heic-to.md) และ CSP ที่ต้องใช้อยู่ใน [project-setup](../architecture/project-setup.md#62-nextconfigts)

### 8.4 `src/features/access/access.logic.ts`

```ts
function validateAccessCode(value: string): { ok: true; code: string } | { ok: false; reason: "empty" }
// trim แล้วว่าง → empty ค่าที่ส่งคือค่าเดิมไม่ trim
```

### 8.5 `src/features/settings/settings.logic.ts`

ฟังก์ชันของแท็บอยู่ใน `src/features/settings/settings.tabs.logic.ts`:

```ts
const SETTINGS_TABS = ["ai", "knowledge", "line", "usage", "status"] as const
function parseSettingsTab(param: string | null): SettingsTab | null      // ค่าที่ไม่รู้จักคืน null
function resolveSettingsTab(input: { param: string | null; lineConfigured: boolean | undefined; settingsFailed: boolean }): SettingsTab | null
// แท็บใน URL ก่อน; ไม่มี: lineConfigured false → "line", true → "ai", ยังโหลด → null (skeleton), โหลดไม่สำเร็จ → "ai"
function settingsTabSearch(currentSearch: string, tab: SettingsTab): string   // "?tab=line" คง parameter อื่น
```

ฟังก์ชันของส่วนขอบเขตหัวข้ออยู่ใน `src/features/settings/settings.guard.logic.ts` (`addGuardTopic`, `removeGuardTopic`, `focusAfterTopicRemoved`, `validateGuardTestInput`, `guardErrorText`, `guardTestDisabledReason`, `fillTemplate`) hook ของส่วนนี้อยู่ใน `settings.guard.hooks.ts` และฟังก์ชันเรียก API อยู่ใน `settings.guard.api.ts`

```ts
function kbUsage(list: { usedTokens: number; capacityTokens: number }): { used: number; limit: number; ratio: number; tone: "normal" | "warn" | "full" }
// ใช้ usedTokens และ capacityTokens จาก server; ratio ≥ 0.9 → warn; ≥ 1 → full
function validatePdfFile(file: { size: number }, head: Uint8Array): { ok: true } | { ok: false; code: "not_pdf" | "pdf_too_large" | "empty_file"; sizeMb?: string }
// "%PDF-" ที่ต้นไฟล์; เพดาน PDF_MAX_BYTES จาก contracts
function parseBudgetInput(input: string): { ok: true; value: number } | { ok: false; code: "budget_invalid" | "budget_out_of_range" }
// ตัวเลขทศนิยมไม่เกิน 2 ตำแหน่ง ช่วง 0 ถึง AI_DAILY_BUDGET_MAX_USD
function validateInstructions(text: string): { ok: true } | { ok: false; code: "instructions_too_long" }   // ≤ AI_INSTRUCTIONS_MAX_CHARS ตัวอักษร
function validateAiName(text: string): { ok: true; value: string } | { ok: false; code: "ai_name_too_long" }   // trim แล้ว ≤ AI_NAME_MAX_CHARS ว่างได้
function validateLineCredentials(input: Partial<Record<"channelId" | "channelSecret" | "channelAccessToken", string>>): { ok: true; body: LineCredentialsInput } | { ok: false; field; code: "required" | "invalid" }
// ตรวจเฉพาะช่องที่เปิด (มีใน input) ตามลำดับของฟอร์ม: ว่างหลัง trim → required, Channel ID ไม่ตรง LINE_CHANNEL_ID_PATTERN → invalid; body คือค่าที่ trim แล้ว
function lineFieldLocked(field: { saved: boolean; editing: boolean }): boolean   // saved && !editing
function lineCredentialsToSend(fields: Record<field, { saved; editing; value }>): LineCredentialsInput   // ค่าของช่องที่ไม่ล็อก
function lineCredentialsSendable(input: LineCredentialsInput): boolean   // มีช่องที่เปิดและมีค่าหลัง trim อย่างน้อยหนึ่งช่อง
function monthOptions(now: Date, count = 12): { value: string; label: string }[]
// value "2026-11", label จาก formatMonthYear ("พ.ย. 2569") ใหม่ไปเก่า เดือนแรกคือเดือนของ now ตามเวลาไทย
function addGuardTopic(topics: readonly string[], typed: string): { ok: true; topics: string[] } | { ok: false; code: "topic_required" | "too_many_topics" | "topic_too_long" | "duplicate_topic" }
// trim แล้วว่าง → topic_required, ครบ GUARD_MAX_TOPICS → too_many_topics แล้วตรวจรายการใหม่ด้วย normalizeGuardTopics จาก contracts: too_long → topic_too_long, duplicate → duplicate_topic
function removeGuardTopic(topics: readonly string[], index: number, guardEnabled: boolean): { ok: true; topics: string[] } | { ok: false; code: "topics_required" }
// หัวข้อสุดท้ายลบไม่ได้ขณะขอบเขตหัวข้อเปิด
function focusAfterTopicRemoved(countBefore: number, index: number): number | null
// index ของปุ่มลบของหัวข้อที่ขึ้นมาแทน หรือ null คือช่องเพิ่มหัวข้อ
function validateGuardTestInput(text: string): { ok: true } | { ok: false; code: "test_required" | "test_too_long" }
// หลัง trim 1 ถึง GUARD_TEST_MAX_CHARS ตัวอักษร
function guardTestDisabledReason(settings: SettingsDto): null | "killed" | "needs_topics"
// ai.enabled false → killed, guard.topics ว่าง → needs_topics, นอกนั้น null
function usageTokenTotal(report: Pick<UsageReport, "contacts" | "ingest" | "guard">): number
// ผลรวม totalTokens ของทุกแถวผู้ใช้ ของ ingest และของ guard ใช้ในแถวรวม ส่วนยอดเงิน จำนวนครั้ง และค่าเฉลี่ยใช้ totalCostUsd, replyCount และ averageCostPerReplyUsd จาก server ตาม use-cases.md#getusagereport-และ-getcontactusage
```

## 9. หน้าตั้งค่า

### 9.1 Component

```
src/features/settings/
  SettingsPage.tsx              หัวหน้า + <Suspense> รอบ SettingsTabs กว้างสุด 880px
    SettingsTabs.tsx            tablist ห้าแท็บ และ panel ของแท็บที่เปิด (mount เฉพาะแท็บนั้น)
      SettingsSection.tsx       การ์ด: หัวการ์ด + error boundary ของการ์ด
        SettingsRow.tsx         ป้ายตัวหนา + คำอธิบาย ซ้าย, control ในคอลัมน์ขวาหรือใต้ป้าย
      แท็บ AI
        AiSettingsSection.tsx   การ์ด "การทำงาน" (AiSettingsSection) และ "ตัวตนและน้ำเสียง" (AiPersonaSection)
          AiPersonaRows.tsx     แถวชื่อ AI, คำลงท้าย และขอบเขตคำตอบ (ใช้ในแท็บความรู้และขอบเขต)
          SettingsFormParts.tsx ปุ่มบันทึกของช่อง, บรรทัด error, ข้อความเมื่อบันทึกไม่สำเร็จ, ปุ่มลูกศรของกลุ่มตัวเลือก
      แท็บความรู้และขอบเขต
        KnowledgeSection.tsx    การ์ด "ความรู้ที่ใช้ตอบ": ขอบเขตคำตอบ แล้วคลังความรู้
          KbDocumentTable.tsx
          KbTextDialog.tsx
          KbDeleteDialog.tsx
        GuardSection.tsx        การ์ด "ขอบเขตหัวข้อ" ข้อ 9.13
          GuardTestBox.tsx
      แท็บ LINE
        LineSettingsSection.tsx การ์ด "การเชื่อมต่อ" ข้อ 9.4
        RichMenuSection.tsx     การ์ด "Rich menu" (RichMenuSection) และ "ข้อความต้อนรับ" (WelcomeSection) ข้อ 9.4.1
      แท็บค่าใช้จ่าย
        UsageSection.tsx
          UsageDetailDialog.tsx
      แท็บสถานะระบบ
        SystemStatusSection.tsx
  settings.api.ts  settings.logic.ts  settings.constants.ts  settings.hooks.ts
  settings.tabs.logic.ts        แท็บและ URL
  settings.guard.api.ts  settings.guard.logic.ts  settings.guard.hooks.ts   ของส่วนขอบเขตหัวข้อ
```

### 9.2 โครงร่วม

หน้าตั้งค่าแบ่งเป็นแท็บแทนหน้ายาวหน้าเดียว ([ADR 0031](../adr/0031-settings-tabs-user-wording-and-neutral-prompt.md))

| แท็บ (`?tab=`) | ป้าย | การ์ดตามลำดับ |
| --- | --- | --- |
| `ai` | `settings.tabs.ai` | `settings.ai.title` (สวิตช์ทั้งระบบ, โมเดล, งบต่อวัน), `settings.ai.personaTitle` (ชื่อ AI, คำลงท้าย, คำแนะนำสำหรับ AI) |
| `knowledge` | `settings.tabs.knowledge` | `settings.kb.cardTitle` (ขอบเขตคำตอบ แล้วคลังความรู้: อัปโหลด, แถบการใช้, ตาราง), `settings.guard.title` (ข้อ 9.13) |
| `line` | `settings.tabs.line` | `settings.line.title` (ข้อ 9.4), `settings.richMenu.title` และ `settings.richMenu.welcomeTitle` (ข้อ 9.4.1) |
| `usage` | `settings.tabs.usage` | `settings.usage.title` (ข้อ 9.9) |
| `status` | `settings.tabs.status` | `settings.status.title` (ข้อ 9.11) |

แท็บ:

- `role="tablist"` (`aria-label` `settings.tabs.label`) ของปุ่ม `role="tab"` ที่ `aria-selected`, `aria-controls` ไปที่ panel `role="tabpanel"` ซึ่ง `aria-labelledby` แท็บที่เปิด แท็บที่เปิดอยู่ในลำดับ Tab อันเดียว (roving `tabIndex`) ลูกศรซ้ายขวาเลื่อนและเปิดแท็บถัดไปแบบวนรอบ Home และ End ไปแท็บแรกและแท็บสุดท้าย (`nextTabIndex` ข้อ 8.1) focus มีขอบที่มองเห็น
- แท็บแบบขีดเส้นใต้ แท็บที่เปิดเป็นตัวหนาสี `accent-strong` พร้อมเส้นใต้ 2px แท็บอื่นสี `muted` แถบแท็บเลื่อนแนวนอนในกล่องของตัวเองที่ 390px หน้าไม่เลื่อนแนวนอน
- แท็บที่เปิดอยู่ใน URL (`/settings?tab=ai|knowledge|line|usage|status`) เปลี่ยนแท็บด้วย `window.history.pushState` ซึ่ง Next.js รวมเข้ากับ router (`useSearchParams` เห็นค่าใหม่) โหลดหน้าใหม่ได้แท็บเดิม และปุ่มย้อนกลับกับไปข้างหน้าเปลี่ยนแท็บ ค่าที่ไม่รู้จักถือว่าไม่มี (`parseSettingsTab`)
- ไม่มี `?tab=`: เปิด `ai` แต่ถ้ายังไม่ได้เชื่อม LINE (`line.configured` false) เปิด `line` URL ไม่เปลี่ยน ระหว่างที่ settings ยังโหลด panel แสดง skeleton และโหลด settings ไม่สำเร็จเปิด `ai` (`resolveSettingsTab` ข้อ 8.5)
- Mount เฉพาะ panel ของแท็บที่เปิด query ของแท็บอื่นจึงไม่โหลดและไม่ polling (สถานะระบบ polling เฉพาะเมื่อแท็บสถานะระบบเปิด คลังความรู้ polling เฉพาะเมื่อแท็บความรู้และขอบเขตเปิดและมีไฟล์ที่กำลังอ่าน) กฎ polling ต่อ query ของข้อ 7.4 ไม่เปลี่ยน
- `SettingsTabs` ใช้ `useSearchParams` จึงอยู่ใน `<Suspense>` ตามเอกสารของ Next.js

| ส่วน | ค่า |
| --- | --- |
| หน้า | พื้น `page` กว้างสุด 880px กลางจอ padding 32px 40px (จอแคบ 20px 16px) |
| หัวหน้า | `settings.page.title` แบบ `text-title` แล้วแถบแท็บ |
| การ์ด | พื้น `surface` ขอบ 1px `line` มุม 18px padding 20px 24px (จอแคบ 16px) ระหว่างการ์ด 16px หัวการ์ด `text-section` ตัวหนา |
| แถว | `SettingsRow` สูงอย่างน้อย 64px padding 12px 0 ไม่มีเส้นคั่นระหว่างแถวในการ์ดเดียวกัน (ระยะห่างแยกแถวแทน): ซ้ายคือป้าย 15px ตัวหนา + คำอธิบาย 14px สี `muted` แถวที่เขียนเองในแต่ละการ์ด (สถานะ LINE, ขั้นตอนตั้งค่า, แถวสถานะระบบ, แถว skeleton) ใช้ระยะเดียวกันและไม่มีเส้น ตาราง (คลังความรู้, ค่าใช้จ่าย AI, dialog รายข้อความ) ยังมีเส้นคั่นแถวของตาราง |
| ตำแหน่งของ control | `layout` ของ `SettingsRow`: `inline` (สวิตช์ ปุ่มเล็ก) อยู่ขวาทุกความกว้าง, `column` อยู่ในคอลัมน์ control กว้าง 340px ชิดขวาบนจอกว้าง และเต็มความกว้างใต้ป้ายบนจอแคบ, `stacked` (textarea, รายการ, ตาราง, ตัวเลือกขอบเขตคำตอบ) เต็มความกว้างใต้ป้ายทุกความกว้าง |
| คอลัมน์ control | ทุกแถวแบบ `column` ในการ์ดเดียวกันใช้ความกว้างเดียวกัน (`SETTINGS_CONTROL_COLUMN`) และขอบขวาเดียวกัน control ในคอลัมน์ยืดเต็มคอลัมน์: Select ของโมเดล, ช่องงบ (+ ปุ่มบันทึก), ช่องชื่อ AI + ปุ่มบันทึก, กลุ่มคำลงท้าย, ช่องของ LINE + ปุ่มคัดลอกหรือปุ่มดินสอ, ปุ่มอัปโหลด PDF ช่องและปุ่มที่อยู่ด้วยกันสูงเท่ากัน (44px จอแคบ, 40px จอกว้าง) |

ปุ่มทั้งหน้าเป็นแบบรอง (ขอบ 1px `line` พื้น `surface` ตัว `fg` ตัวหนา ทรงแคปซูล สูง 36px จอแคบ 44px) ยกเว้นปุ่มบันทึกของช่อง (`SaveButton`): อยู่ข้างช่องเสมอ ช่องจึงไม่ขยับเมื่อเริ่มพิมพ์ ค่ายังไม่เปลี่ยนเป็นปุ่มแบบรองที่ `disabled` ค่าเปลี่ยนแล้วเป็นปุ่มหลัก (`data-dirty` บอกสถานะ) กฎนี้ใช้กับทุกปุ่มบันทึกของช่อง: งบต่อวัน, ชื่อ AI, คำแนะนำสำหรับ AI, ข้อความวิธีทดสอบ, ข้อความในการ์ดต้อนรับ และปุ่มบันทึกของการ์ดการเชื่อมต่อ ([ux-writing](../guidelines/ux-writing.md#ปุ่ม))

ทุกการ์ดมีสถานะกำลังโหลด (แถว skeleton เท่าจำนวนแถวจริง) และผิดพลาด (`ErrorState` ของการ์ด + `common.action.retry`) แยกกัน การ์ดที่พังไม่ทำให้การ์ดอื่นพัง

ลำดับ focus ไล่ตามลำดับที่เห็น บนลงล่าง ซ้ายไปขวา

### 9.3 ส่วน AI ตอบแทน

แท็บ AI มีสองการ์ด ข้อมูล: `useSettings()` field `ai.*` แก้ด้วย `useMutation(updateSettings)` การ์ด `settings.ai.title` (`settings-section-ai`) มีสามแถวแรกของตาราง การ์ด `settings.ai.personaTitle` (`settings-section-ai-persona`) มีคำลงท้าย ชื่อ AI และคำแนะนำสำหรับ AI แถวขอบเขตคำตอบอยู่บนสุดของการ์ด `settings.kb.cardTitle` ในแท็บความรู้และขอบเขต (ข้อ 9.5)

| แถว | Control | บันทึกเมื่อ | `data-testid` |
| --- | --- | --- | --- |
| `settings.ai.killSwitch` | สวิตช์ (`inline`) | เปลี่ยนค่า (optimistic, ล้มเหลวคืนค่าเดิม + toast) toast `settings.ai.killSwitchOnToast` / `settings.ai.killSwitchOffToast` | `settings-kill-switch` |
| `settings.ai.model` | `Select` (ข้อ 1.8) 3 ตัวเลือก เต็มคอลัมน์ control ชื่อจากป้ายของแถว (`aria-labelledby`) | เลือกค่าใหม่: แสดงค่าใหม่ทันทีและ `pending` ระหว่างบันทึก สำเร็จ toast `common.toast.saved` ล้มเหลวคืนค่าเดิมและแสดง error ใต้ control | `settings-model` (ปุ่ม มี `data-value`), `settings-model-option` (ตัวเลือก มี `data-value`) |
| `settings.ai.budget` | ช่องตัวเลขที่มี `$` นำหน้าในช่อง + ปุ่ม `common.action.save` เต็มคอลัมน์ control + บรรทัดใต้ `settings.ai.budgetToday` (ยอดวันนี้จาก `ai.todayCostUsd` ของ `SettingsDto`) | กดบันทึก หรือ Enter | `settings-budget`, `settings-budget-save`, `settings-budget-today` |
| `settings.ai.aiName` | ช่องข้อความบรรทัดเดียว + ปุ่ม `common.action.save` เต็มคอลัมน์ control placeholder `settings.ai.aiNamePlaceholder` ปุ่มอยู่เสมอ เป็นปุ่มหลักเมื่อค่าที่ตัดช่องว่างแล้วต่างจากที่บันทึก ยาวเกิน `AI_NAME_MAX_CHARS` หลังตัดช่องว่างได้ `settings.ai.error.ai_name_too_long` ใต้ช่องและไม่ส่ง ช่องว่างล้วนล้างชื่อ | กดบันทึก หรือ Enter | `settings-ai-name`, `settings-ai-name-save` |
| `settings.ai.particle` | segmented control สองตัว (`role="radiogroup"` ชื่อจากป้ายของแถว) `ค่ะ` / `ครับ` กว้างเท่ากันและเต็มคอลัมน์ control สูงเท่าช่องกรอก ตัวที่เลือกพื้น `accent-strong` ตัวขาวพร้อมเครื่องหมายถูก ปุ่มลูกศร Home และ End เลื่อนและเลือก | เปลี่ยนค่า | `settings-particle` ตัวเลือกมี `data-value` |
| `settings.ai.instructions` | `<textarea>` เต็มความกว้างใต้ป้าย (`stacked`) 4 ถึง 12 บรรทัด ตัวนับ `settings.ai.instructionsCounter` `text-meta` + ปุ่มบันทึกที่อยู่เสมอ | กดบันทึก (Enter ขึ้นบรรทัดใหม่) | `settings-instructions`, `settings-instructions-save` |

แถวขอบเขตคำตอบ (การ์ด `settings.kb.cardTitle`):

| แถว | Control | บันทึกเมื่อ | `data-testid` |
| --- | --- | --- | --- |
| `settings.ai.answerMode` | กลุ่มตัวเลือกสองตัว (`role="radiogroup"` ชื่อจากป้ายของแถว) เต็มความกว้างใต้ป้าย (`stacked`) ขอบ `accent-strong` พื้น `selected` และเครื่องหมายถูกเมื่อเลือก แต่ละตัวมีชื่อ (`settings.ai.answerModeOption.*`) และคำอธิบายหนึ่งบรรทัด (`settings.ai.answerModeOptionDesc.*` ผูกด้วย `aria-describedby`) เรียงสองคอลัมน์ จอแคบซ้อนกัน ปุ่มลูกศร Home และ End เลื่อนและเลือก คำว่า "ขอบเขตคำตอบ" มีบนหน้าจอครั้งเดียว (ป้ายแถวนี้) | เปลี่ยนค่า | `settings-answer-mode` (กลุ่ม) ตัวเลือกมี `data-value` |

ค่าที่พิมพ์แต่บันทึกไม่สำเร็จยังอยู่ และข้อความ error อยู่ใต้ช่องนั้น ([ux-writing](../guidelines/ux-writing.md) ข้อ 6, 7)

### 9.4 ส่วน LINE Official Account

การ์ด `settings.line.title` ของแท็บ LINE ข้อมูล: `useSettings()` field `line.configured`, `line.status` (`connected` / `error` / `not_configured`), `line.botName`, `line.basicId`, `line.channelId`, `line.secretStatus` (`verified` / `unchecked` / `no_channel_id`), `line.lastWebhookAt`, `line.webhookUrl`

| แถว | Control | `data-testid` |
| --- | --- | --- |
| สถานะ | ป้ายสถานะ: จุด 8px + ข้อความ (`settings.line.statusConnected` สี `success`, `settings.line.statusError` สี `danger`, `settings.line.statusNotConfigured` สี `muted`) คำอธิบายคือชื่อ OA และ Basic ID, `settings.line.lastWebhook` และเมื่อ `configured` บรรทัดของ Channel secret 14px ตาม `secretStatus`: `settings.line.secretVerified` สี `muted`, `settings.line.secretUnchecked` หรือ `settings.line.secretNoChannelId` สี `warn` (สถานะเตือนของการตรวจที่ทำไม่ได้) | `line-status`, `line-bot-name`, `line-secret-status` (`data-status` เป็นค่าของ `secretStatus`) |
| `settings.line.webhookUrl` | ช่อง `readOnly` (ไม่ใช่ `disabled` จึงยังเลือกข้อความได้) พื้น `rail` ตัวสี `muted` monospace 14px + ปุ่ม `settings.line.copy` ในคอลัมน์ control ใช้ `navigator.clipboard.writeText` toast `settings.line.copiedToast` ค่านี้แก้ไม่ได้เสมอ | `line-webhook-url`, `line-webhook-copy` |
| `settings.line.channelId` | คอลัมน์ control: `<input type="text" inputmode="numeric" autocomplete="off" maxlength={LINE_CHANNEL_ID_MAX_CHARS}>` คำอธิบาย `settings.line.channelIdDesc` placeholder `settings.line.channelIdPlaceholder` เมื่อบันทึกแล้ว ช่องล็อก (`disabled` พื้น `rail`) แสดง `line.channelId` + ปุ่มไอคอนดินสอ | `line-channel-id` (`data-state` เป็น `locked` หรือ `editing`), `line-channel-id-edit` |
| `settings.line.channelSecret` | เหมือนข้างบน คำอธิบาย `settings.line.channelSecretDesc` เมื่อบันทึกแล้ว ช่องล็อกแสดง `settings.line.savedMask` (ข้อความคงที่ ไม่มาจากค่าจริงและไม่บอกความยาว) ขณะแก้เป็น `<input type="password">` placeholder `settings.line.secretPlaceholderSet` ยังไม่เคยบันทึก `settings.line.secretPlaceholderEmpty` | `line-channel-secret`, `line-channel-secret-edit` |
| `settings.line.accessToken` | เหมือน Channel secret คำอธิบาย `settings.line.accessTokenDesc` | `line-access-token`, `line-access-token-edit` |
| ปุ่ม | `settings.line.test` (`testLineConnection` ใช้ค่าที่บันทึกไว้) และ `settings.line.save` (`SaveButton` ข้อ 9.2) เรียงขวา ปุ่มทดสอบกดไม่ได้เมื่อยังไม่ได้ตั้งค่า พร้อมเหตุผล `settings.line.testNeedsCredentials` (จอแคบเต็มบรรทัดเหนือปุ่ม) ปุ่มบันทึก `disabled` จนกว่าช่องที่เปิดอยู่อย่างน้อยหนึ่งช่องมีค่า (`lineCredentialsSendable`) | `line-test`, `line-save` |
| ผลทดสอบ | บรรทัดใต้ปุ่ม `role="status"`: สำเร็จ `settings.line.testOk` + ` · ` + ข้อความของ `secretStatus` ที่การทดสอบตอบ (`data-result="ok"` สี `success` เมื่อ `verified`, `data-result="warning"` สี `warn` เมื่อ `unchecked` หรือ `no_channel_id`) ไม่สำเร็จใช้ error catalog สี `danger` (`data-result="error"`) | `line-result` |

ช่องที่ล็อกและปุ่มดินสอ ([ADR 0031](../adr/0031-settings-tabs-user-wording-and-neutral-prompt.md)):

- ช่องที่มีค่าบันทึกแล้ว (Channel ID: `line.configured` และ `line.channelId` มีค่า, สองช่องลับ: `line.configured`) เริ่มที่ล็อก ปุ่มไอคอนดินสอ (`Pencil`) `aria-label` `settings.line.edit` แทน `{field}` ด้วยป้ายของแถว กดแล้วช่องว่าง เปิดให้พิมพ์ ได้ focus และปุ่มกลายเป็นไอคอน X `aria-label` `settings.line.cancelEdit` ซึ่งกดแล้วช่องกลับไปล็อกพร้อมค่าที่บันทึก (`lineFieldLocked`)
- ยังไม่ได้เชื่อม LINE: ทั้งสามช่องเปิดให้พิมพ์ ไม่มีปุ่มดินสอ
- ส่งเฉพาะช่องที่เปิดอยู่ (`lineCredentialsToSend`) ตรวจด้วย `validateLineCredentials` ตามลำดับของฟอร์ม ช่องที่เปิดแต่ว่างได้ `settings.line.error.*Required` และ Channel ID ที่ไม่ใช่ตัวเลข 1 ถึง `LINE_CHANNEL_ID_MAX_CHARS` หลักได้ `settings.line.error.channelIdInvalid` (`{max}`) focus ไปที่ช่องแรกที่ไม่ผ่าน server เติมค่าที่ไม่ส่งจากที่บันทึกไว้แล้วตรวจกับ LINE ทั้งสามค่าเหมือนเดิม รวม `line.channel_mismatch` ([use-cases SetLineCredentials](../architecture/use-cases.md#setlinecredentials))
- ระบบไม่แสดงค่า secret เดิม หน้าเว็บไม่มีค่าลับจาก server เลย ช่องลับที่ล็อกแสดงเพียงข้อความคงที่ ([admin-backoffice](admin-backoffice.md))
- บันทึกไม่ผ่าน (token ผิด, `line.channel_secret_invalid`, `line.channel_mismatch`) ค่าที่กรอกยังอยู่และช่องยังเปิด ข้อความจาก error catalog
- บันทึกสำเร็จ: ทุกช่องกลับไปล็อก ค่าที่พิมพ์ถูกล้างจากหน้า toast `settings.line.savedToast` เมื่อ `secretStatus` เป็น `verified` และ `common.toast.saved` เมื่อ `unchecked` (สถานะเตือนอยู่ในบรรทัดของ Channel secret ซึ่งโหลดใหม่หลังบันทึก)
- ยังไม่ได้ตั้งค่า: ใต้แถว Webhook URL แสดงหัว `settings.line.setupTitle` และรายการลำดับเลข `settings.line.setupStep1` ถึง `settings.line.setupStep3` และลิงก์ `settings.line.setupGuide` ไป [line-oa-setup](../runbooks/line-oa-setup.md) บน GitHub `data-testid` `line-setup-steps`

### 9.4.1 ส่วน Rich menu และข้อความต้อนรับ

สองการ์ดของแท็บ LINE: `settings.richMenu.title` (`settings-section-rich-menu`: แถวสถานะและข้อความวิธีทดสอบ) และ `settings.richMenu.welcomeTitle` (`settings-section-welcome`: สวิตช์ ข้อความในการ์ด และตัวอย่าง) ปุ่มบันทึกของสองช่องข้อความอยู่เสมอตามข้อ 9.2 ข้อมูล: `useSettings()` field `richMenu` (`published`, `publishedAt`, `lastError`, `howToText`, `howToDefault`), `welcome` (`enabled`, `text`, `defaultText`, `accountName`) และ `line.configured` พฤติกรรมอยู่ใน [admin-backoffice](admin-backoffice.md#ส่วน-rich-menu-และข้อความต้อนรับ)

| แถว | Control | `data-testid` |
| --- | --- | --- |
| `settings.richMenu.status` | ป้ายสถานะจุด 8px + `settings.richMenu.statusPublished` (สี `success`) หรือ `settings.richMenu.statusNotPublished` (สี `muted`) คำอธิบาย `settings.richMenu.publishedAt`, `settings.richMenu.notPublishedDesc` หรือ `settings.richMenu.needsLine` ปุ่มแบบรอง `settings.richMenu.publish` (`settings.richMenu.republish` เมื่อ publish แล้ว) และ `settings.richMenu.remove` เมื่อ publish แล้ว ปุ่มปิดเมื่อยังไม่เชื่อม LINE ระหว่างทำงานปุ่มที่กดหมุน `Loader2` และ `aria-busy` ล้มแล้ว toast และบรรทัด `settings.richMenu.lastError` สี `danger` `role="status"` ใต้ปุ่ม | `rich-menu-status` (`data-status` เป็น `published` หรือ `not_published`), `rich-menu-publish`, `rich-menu-remove`, `rich-menu-error` |
| `settings.richMenu.howTo` | textarea 7 แถว เต็มความกว้าง แสดงข้อความที่บันทึก หรือ `howToDefault` เมื่อว่าง ตัวนับ `settings.richMenu.counter` (สี `danger` เมื่อเกิน `HOW_TO_TEXT_MAX_CHARS`) ปุ่ม `settings.richMenu.reset` เมื่อมีข้อความที่บันทึกเองหรือกำลังแก้ และ `common.action.save` (อยู่เสมอ เป็นปุ่มหลักเมื่อแก้) บันทึกไม่สำเร็จข้อความยังอยู่ | `settings-how-to`, `settings-how-to-save`, `settings-how-to-reset` |
| `settings.richMenu.welcomeSwitch` | สวิตช์ toast `settings.richMenu.welcomeOnToast` หรือ `settings.richMenu.welcomeOffToast` ล้มแล้วกลับค่าเดิมพร้อม toast error | `settings-welcome-switch` |
| `settings.richMenu.welcomeText` | เหมือนข้อความวิธีทดสอบ textarea 3 แถว ไม่เกิน `WELCOME_TEXT_MAX_CHARS` | `settings-welcome-text`, `settings-welcome-text-save`, `settings-welcome-text-reset` |
| `settings.richMenu.preview` | การ์ดอ่านอย่างเดียวกว้างสุด 300px: หัวพื้น `accent-strong` ทึบ (ไล่สีของแบรนด์จำกัดไว้สี่ที่ตาม [frontend](../architecture/frontend.md)) มีป้าย "T" และ `WELCOME_TITLE_LINE` กับ `welcome.accountName` ตัวขาว เนื้อคือข้อความที่บันทึกหรือข้อความเริ่มต้น บรรทัด `WELCOME_NOTE` สี `muted` และชื่อปุ่มสามปุ่ม (แรกพื้น `accent-strong` ตัวขาว, สองขอบ `line`, สามตัวสี `accent-strong`) ที่กดไม่ได้ | `welcome-preview` |

### 9.5 ส่วนคลังความรู้

การ์ด `settings.kb.cardTitle` ของแท็บความรู้และขอบเขต: แถวขอบเขตคำตอบ (ข้อ 9.3) แล้วคลังความรู้ ข้อมูล: `listKbDocuments()` คืน `{ documents: DocumentDto[]; usedTokens: number; capacityTokens: number }`

| ส่วน | ค่า | `data-testid` |
| --- | --- | --- |
| แถวบน | ป้าย `settings.kb.title` คำอธิบาย `settings.kb.description` ปุ่ม `settings.kb.upload` (ไอคอน `Upload`) เต็มคอลัมน์ control พร้อม hint ใต้ปุ่ม เปิด `<input type="file" accept="application/pdf">` | `kb-upload`, `kb-upload-input` |
| แถบการใช้ | ใต้แถวบน: แท่งสูง 4px มุมมน พื้น `line` ส่วนที่ใช้สี `accent` (เมื่อ `warn` ใช้ `warn`, `full` ใช้ `danger`) `role="meter"` + ข้อความ `settings.kb.usage` 14px `tabular-nums` | `kb-usage-meter`, `kb-usage-text` |
| ตาราง | คอลัมน์ `settings.kb.colFile` (ตัดบรรทัดเดียว), `settings.kb.colPages`, `settings.kb.colTokens` (ชิดขวา `tabular-nums`), `settings.kb.colStatus`, ปุ่มท้ายแถว หัวตาราง 14px สี `muted` แถวคั่นด้วยเส้น 1px `line` คอลัมน์ปุ่มไม่มีข้อความหัว จึงเป็น `<td aria-hidden="true">` ว่างในแถวหัวแทน `<th>` (axe `empty-table-header`) ตารางมี `<caption>` แบบ sr-only เป็น `settings.kb.title` | `kb-table`, `kb-row` |
| สถานะในแถว | `processing`: spinner 14px + `settings.kb.statusProcessing`; `ready`: `settings.kb.statusReady` สี `success`; `failed`: `settings.kb.statusFailed` สี `danger` + เหตุผลจาก error catalog บรรทัดที่สอง | `kb-row-status` |
| ปุ่มในแถว | `ready`: `settings.kb.view` (เปิด `KbTextDialog`) และ `settings.kb.delete`; `failed`: `settings.kb.retry` (เปิดเลือกไฟล์ แล้ว `retryKbDocument`) และ `settings.kb.delete`; `processing`: ไม่มีปุ่ม | `kb-row-view`, `kb-row-delete`, `kb-row-retry` |

- ก่อนอัปโหลด: `validatePdfFile` ไม่ผ่านแสดงข้อความ `settings.kb.errors.*` ใต้แถวบน ไม่เรียก server บรรทัดนี้ใช้ร่วมกับ error จาก server ของการอัปโหลด `data-testid` `kb-upload-error` มี `data-code` เป็นรหัส error
- ระหว่างอัปโหลด: ปุ่มแสดง spinner และกดซ้ำไม่ได้ แถวใหม่ขึ้นในสถานะ `processing` เมื่อ server ตอบ แล้ว polling ตามข้อ 7.1
- ไฟล์ซ้ำ เกินเพดานคลัง เกิน 30 หน้า: ข้อความจาก error catalog ใต้แถวบน
- ปุ่มลองใหม่แสดง hint `settings.kb.retryHint` เป็น tooltip และ `aria-describedby`
- ว่าง: `settings.kb.empty` ในตำแหน่งของตาราง `data-testid` `kb-empty`
- ผิดพลาด: `settings.kb.error` + `common.action.retry` `data-testid` `kb-error`
- `kb-row` มี `data-document-id`, `data-status`, `data-file-name`

### 9.6 Dialog ดูข้อความที่แปลงแล้ว

`KbTextDialog.tsx` props `{ documentId: string | null; onClose(): void }` ใช้ `getKbDocument`

| ส่วน | ค่า |
| --- | --- |
| กล่อง | กว้างสุด 720px สูงสุด 80vh มุม 18px |
| หัว | ชื่อไฟล์ `text-section` + บรรทัดรอง `settings.kb.textDialogSubtitle` แทน `{pages}`, `{tokens}` |
| เนื้อหา | `<pre>` ห่อบรรทัด (`white-space: pre-wrap`) ตัวอักษร 15px ระยะบรรทัด 1.6 เลื่อนในตัว แสดงเป็นข้อความล้วน |
| ปุ่ม | `common.action.close` (ปุ่มเดียว จึงเป็นปุ่มหลัก) |
| กำลังโหลด | 8 แท่ง skeleton |
| ผิดพลาด | `settings.kb.textDialogError` + `common.action.retry` |

คีย์บอร์ด: focus ที่เนื้อหา (`tabindex="0"`) เพื่อเลื่อนด้วยลูกศรได้ทันที Escape ปิด focus กลับปุ่มดูข้อความ

`data-testid`: `kb-text-dialog`, `kb-text-content`, `kb-text-close`

### 9.7 Dialog ลบไฟล์

`KbDeleteDialog.tsx` ใช้ `ConfirmDialog` props `{ document: DocumentDto | null; onClose(): void }`

| ส่วน | ค่า |
| --- | --- |
| หัว | `settings.kb.deleteTitle` แทน `{fileName}` |
| เนื้อหา | `settings.kb.deleteBody` |
| ปุ่ม | ซ้าย `settings.kb.deleteCancel` (แบบรอง), ขวา `settings.kb.deleteConfirm` (พื้น `danger` ตัวขาว เป็นปุ่มหลักของ dialog) |
| กำลังลบ | ปุ่มลบแสดง spinner ความกว้างเดิม ทั้งสองปุ่มกดไม่ได้ |
| ลบไม่สำเร็จ | ข้อความจาก error catalog ใน dialog dialog ยังเปิด |
| สำเร็จ | ปิด dialog, toast `settings.kb.deletedToast`, focus ไปที่ปุ่มอัปโหลด |

เปิดแล้ว focus ที่ปุ่มยกเลิก (การกระทำที่ปลอดภัย) Escape เท่ากับยกเลิก

`data-testid`: `kb-delete-dialog`, `kb-delete-cancel`, `kb-delete-confirm`

### 9.9 ส่วนค่าใช้จ่าย AI

ข้อมูล: `getUsage(month)` คืน `{ month, priceTableDate, contacts: UsageRowDto[], ingest, guard, totalCostUsd, replyCount, averageCostPerReplyUsd, noResponseCount }` ตาม [api-contract](../architecture/api-contract.md#get-apiusage) (`usageReportResponseSchema` ใน `src/contracts/usage.contract.ts`) แถวของผู้ใช้ใช้ `contactId`, `displayName`, `pictureUrl`, `replyCount`, `totalTokens`, `costUsd` ส่วน `ingest` และ `guard` มี field เดียวกันคือ `count`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `costUsd` (`guard` รวมการทดลองจากหน้าตั้งค่า และ `totalCostUsd` รวมผู้ใช้ + `ingest` + `guard`)

| ส่วน | ค่า | `data-testid` |
| --- | --- | --- |
| แถวบน | ไม่มีป้าย (หัวส่วนเป็นชื่อเดียวกันแล้ว) ขวาคือ `Select` (ข้อ 1.8) กว้าง 160px (จอแคบตามป้าย) เดือนจาก `monthOptions(now)` ค่าเริ่มต้นเดือนนี้ (`now` คือนาฬิกาของ browser ซึ่งอ่านหลัง hydration ด้วย `useHydrated()` เท่านั้น ระหว่าง render ฝั่ง server และ hydration `Select` ไม่มีตัวเลือกและไม่มีค่า และตารางแสดง skeleton โดยยังไม่เรียก `getUsage` เพราะนาฬิกาของ server อาจอยู่คนละเดือน) `aria-label` `settings.usage.monthLabel` | `usage-month` (ปุ่ม มี `data-value`), `usage-month-option` (ตัวเลือก มี `data-value`) |
| ตาราง | คอลัมน์ `settings.usage.colContact` (รูป 28px + ชื่อ), `settings.usage.colReplies`, `settings.usage.colTokens`, `settings.usage.colCost` ตัวเลขชิดขวา `tabular-nums` แต่ละแถวผู้ใช้เป็นปุ่มทั้งแถว (`role="button"` ใน `<tr>` ไม่ได้ จึงใช้ `<button>` ในเซลล์ชื่อที่ยืดเต็มแถวด้วย `::after`) เปิด `UsageDetailDialog` | `usage-table`, `usage-row` (มี `data-contact-id`) |
| แถวอ่านไฟล์ | `settings.usage.ingestRow` แสดงจำนวนครั้งในคอลัมน์ครั้งที่ตอบเป็น `—` และ token, ราคา กดไม่ได้ | `usage-row-ingest` |
| แถวคัดกรอง | `settings.usage.guardRow` จาก `guard` ของรายงาน: คอลัมน์ครั้งที่ตอบเป็น `—` ป้ายรองแสดงจำนวนครั้ง `settings.usage.guardCount` แทน `{n}` ด้วย `guard.count` และ token (`guard.totalTokens`), ราคา (`guard.costUsd`) กดไม่ได้ ข้อความที่ถูกกันไม่นับเป็นครั้งที่ AI ตอบ | `usage-row-guard` |
| แถวรวม | ตัวหนา เส้นบน 1px `fg`: `settings.usage.total` + `replyCount`, `usageTokenTotal(report)` และ `totalCostUsd` จาก server | `usage-total` |
| บรรทัดใต้ตาราง | `settings.usage.avgPerReply` แล้ว `settings.usage.disclaimer` แทน `{date}` ด้วย `formatDateKey(priceTableDate)` (`3 พ.ย. 2569`) 14px สี `muted` | `usage-avg`, `usage-disclaimer` |
| การเรียกที่ไม่ได้คำตอบ | แสดงเฉพาะเมื่อ `noResponseCount` > 0: `settings.usage.noResponse` แทน `{n}` ด้วย `noResponseCount` 14px สี `muted` ระหว่างบรรทัดค่าเฉลี่ยกับบรรทัดคำเตือนราคา ([usage-cost](usage-cost.md#การเรียกที่ไม่ได้คำตอบ)) | `usage-no-response` |
| ว่าง | `settings.usage.empty` (ยังแสดงบรรทัดคำเตือนราคา) | `usage-empty` |

จอแคบ: ตารางเลื่อนแนวนอนในกล่องของตัวเอง คอลัมน์ผู้ใช้กว้างอย่างน้อย 160px

### 9.10 Dialog รายข้อความ

`UsageDetailDialog.tsx` props `{ month: string; contact: { id, displayName } | null; onClose(): void }` ใช้ `getUsageDetail(contactId, month)` คืน `UsageRecordDto[]` (field `createdAt`, `kind`, `model`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `costUsd`, `outcome`)

| ส่วน | ค่า |
| --- | --- |
| กล่อง | กว้างสุด 880px สูงสุด 80vh |
| หัว | `settings.usage.detailTitle` แทน `{name}`, `{month}` |
| ตาราง | `settings.usage.colTime` (`formatDateTime`), `settings.usage.colModel` (ชื่อแสดงของโมเดลจาก `settings.ai.modelOption.*` ถ้าไม่รู้จักแสดง id), `settings.usage.colInput`, `settings.usage.colOutput`, `settings.usage.colCacheRead`, `settings.usage.colCacheWrite`, `settings.usage.colCost`, `settings.usage.colOutcome` (`settings.usage.outcome.*`) เรียงใหม่ไปเก่า หัวตารางติดบนเมื่อเลื่อน |
| ปุ่ม | `common.action.close` |
| สถานะ | กำลังโหลด 6 แถว skeleton, ว่าง `settings.usage.detailEmpty`, ผิดพลาด `settings.usage.detailError` + `common.action.retry` |

`data-testid`: `usage-detail-dialog`, `usage-detail-row`, `usage-detail-close`

### 9.11 ส่วนสถานะระบบ

ข้อมูล: `getSystemStatus()` คืน `SystemStatusDto` (`lastWebhookAt`, `lastLineError`, `lastAiError`, `todayCostUsd`, `dailyBudgetUsd`, `priceTableDate`, `database: "ok"`) เมื่อฐานข้อมูลล่ม endpoint ตอบ 500 และส่วนนี้แสดงสถานะผิดพลาด (`settings.status.error`)

| แถว | ค่า | `data-testid` |
| --- | --- | --- |
| `settings.status.webhook` | `formatDateTime` หรือ `settings.status.never` | `status-webhook` |
| `settings.status.lineError` | ข้อความจาก error catalog + เวลา หรือ `settings.status.none` | `status-line-error` |
| `settings.status.aiError` | เหมือนข้างบน | `status-ai-error` |
| `settings.status.budget` | `settings.status.budgetValue` + แท่ง 4px แบบเดียวกับคลังความรู้ | `status-budget` |
| `settings.status.database` | จุดสี `success` + `settings.status.dbOk` | `status-db` |

### 9.12 `data-testid` ของหน้าตั้งค่า

`settings-page`, `settings-tabs` (tablist), `settings-tab` (แต่ละแท็บ มี `data-tab`), `settings-tab-panel` (มี `data-tab` ของแท็บที่เปิด), `settings-section-ai`, `settings-section-ai-persona`, `settings-section-kb`, `settings-section-guard`, `settings-section-line`, `settings-section-rich-menu`, `settings-section-welcome`, `settings-section-usage`, `settings-section-status` และทุกค่าที่ระบุในข้อ 9.3 ถึง 9.7 (รวม 9.4.1), 9.9 ถึง 9.11 และ 9.13

ลำดับของแท็บและการ์ดอยู่ในข้อ 9.2

### 9.13 ส่วนขอบเขตหัวข้อ

`GuardSection.tsx` ข้อมูล: `useSettings()` field `guard.*` และ `ai.enabled` แก้ด้วย `useMutation(updateSettings)` พฤติกรรมอยู่ใน [topic-guard](topic-guard.md)

| แถว | Control | บันทึกเมื่อ | `data-testid` |
| --- | --- | --- | --- |
| `settings.guard.switch` คำอธิบาย `settings.guard.switchDesc` | สวิตช์ | เปลี่ยนค่า (optimistic, ล้มเหลวคืนค่าเดิม) toast `settings.guard.enabledToast` / `settings.guard.disabledToast` ถ้าจะเปิดขณะหัวข้อที่บันทึกไว้ว่าง ไม่เรียก server และแสดง `settings.guard.errors.topics_required` ใต้แถว | `guard-switch`, `guard-switch-error` |
| `settings.guard.topics` คำอธิบาย `settings.guard.topicsDesc` | เต็มความกว้างใต้ป้าย: ช่องข้อความบรรทัดเดียว (`aria-label` `settings.guard.topicInput` placeholder `settings.guard.topicsPlaceholder`) กับปุ่ม `settings.guard.topicAdd` (ไอคอน `Plus`) ข้อความ error ใต้ช่อง แล้วรายการหัวข้อเป็น `<ul>` (`aria-labelledby` ป้ายของแถว) แต่ละหัวข้อเป็นแถวพื้น `rail` มุม 13px สูงอย่างน้อย 40px (จอแคบ 44px) ข้อความยาวขึ้นบรรทัดใหม่ ขวาคือปุ่มรอง `settings.guard.topicRemove` (ไอคอน `X` จอแคบเหลือไอคอน) `aria-label` `settings.guard.topicRemoveAria` แทน `{topic}` ไม่มีหัวข้อแสดง `settings.guard.topicsEmpty` ใต้รายการคือตัวนับ `settings.guard.topicsCounter` (`{n}` คือจำนวนหัวข้อที่บันทึกไว้) | เพิ่ม: กดปุ่มหรือ Enter ตรวจด้วย `addGuardTopic` ก่อน ไม่ผ่านแสดง error ใต้ช่องและข้อความที่พิมพ์ยังอยู่ ผ่านส่ง `guardTopics` ทันที รายการแสดงค่าใหม่ทันที (optimistic) บันทึกสำเร็จล้างช่องและ toast `common.toast.saved` ล้มเหลวรายการคืนค่าเดิม ข้อความที่พิมพ์ยังอยู่ และ error ใต้ช่อง ลบ: กดปุ่มลบ ตรวจด้วย `removeGuardTopic` (หัวข้อสุดท้ายขณะเปิดอยู่แสดง `settings.guard.errors.topics_required`) แล้วบันทึกแบบเดียวกัน focus: หลังเพิ่มกลับที่ช่อง หลังลบไปที่ปุ่มลบของหัวข้อที่ขึ้นมาแทน ถ้าไม่มีกลับที่ช่อง (`focusAfterTopicRemoved`) | `guard-topic-input`, `guard-topic-add`, `guard-topics` (รายการ), `guard-topic` (แต่ละหัวข้อ มี `data-topic`), `guard-topic-remove`, `guard-topics-counter`, `guard-topics-error` |
| `settings.guard.test` คำอธิบาย `settings.guard.testDesc` | `GuardTestBox` เต็มความกว้างใต้ป้าย | กด `settings.guard.testSubmit` | ตามด้านล่าง |
| บรรทัดท้ายส่วน | `settings.guard.blockedToday` แทน `{n}` ด้วย `guard.blockedToday` 14px สี `muted` `tabular-nums` | | `guard-blocked-today` |

- control ทุกตัวของส่วนนี้แก้ได้แม้ kill switch ปิด
- ข้อความปฏิเสธที่ผู้ใช้ได้ไม่ใช่ค่าที่ตั้งได้ในหน้านี้ เป็นประโยคคงที่ `guardRefusalText(particle, topics)` ที่คำลงท้ายตาม `settings.ai.particle` ([topic-guard](topic-guard.md))
- หัวข้อที่พิมพ์แต่บันทึกไม่สำเร็จยังอยู่ในช่อง และข้อความ error อยู่ใต้ช่องนั้น ข้อความ error จาก server (`settings.guard_topics_required`, `request.invalid`) ใช้ error catalog ทุก element ที่แสดง error มี `data-code`
- ข้อความ error ที่ตรวจใน browser ใช้ key `settings.guard.errors.<code>` ซึ่งในโค้ดคือ `copy.guard.errors.<code>`

`GuardTestBox.tsx` props `{ settings: SettingsDto }`:

| ส่วน | ค่า | `data-testid` |
| --- | --- | --- |
| ช่องพิมพ์ | ช่องข้อความบรรทัดเดียว สูง 44px placeholder `settings.guard.testPlaceholder` `aria-label` `settings.guard.test` | `guard-test-input` |
| ปุ่ม | `settings.guard.testSubmit` แบบรองตามหน้าตั้งค่า ขณะทดสอบแสดง spinner ความกว้างเดิม `aria-label` `settings.guard.testing` กดซ้ำไม่ได้ ตรวจด้วย `validateGuardTestInput` ก่อนเรียก `testTopicGuard` | `guard-test-submit` |
| ปิดใช้ | `guardTestDisabledReason(settings)` ไม่เป็น null: ช่องพิมพ์และปุ่ม `disabled` พร้อมเหตุผลหนึ่งบรรทัดข้างปุ่ม `settings.guard.testDisabledKilled` หรือ `settings.guard.testNeedsTopics` ไอคอน `Info` 14px สี `muted` | `guard-test-disabled-reason` |
| ผล | บรรทัดใต้ช่อง `role="status"`: ผ่าน ไอคอน `CircleCheck` สี `success` + `settings.guard.testAllowed` แทน `{topic}` ด้วย `matchedTopic` (เมื่อ null ใช้ `settings.guard.testAllowedNoTopic`), ถูกกัน ไอคอน `ShieldX` สี `danger` + `settings.guard.testBlocked`, ผิดพลาด ไอคอน `AlertCircle` สี `danger` + ข้อความจาก error catalog หรือ `settings.guard.errors.test_*` สถานะไม่บอกด้วยสีอย่างเดียว | `guard-test-result` มี `data-result` (`allowed`/`blocked`/`error`) และ `data-code` เมื่อผิดพลาด |
| ค่าใช้จ่าย | ใต้บรรทัดผล `settings.guard.testCost` แทน `{usd}` ด้วย `costUsd` `text-meta` สี `muted` | `guard-test-cost` |

สถานะของ `GuardTestBox`: `idle` → `testing` → `allowed` / `blocked` / `error` แล้วกลับ `testing` เมื่อกดอีกครั้ง ข้อความในช่องยังอยู่หลังทดสอบ ผลหายเมื่อแก้ข้อความในช่อง

## 10. Toast

ใช้ `sonner` ผ่าน component `Toaster` ของ shadcn (`src/common/ui/sonner.tsx`) ที่ root layout มุมล่างขวา จอที่แคบกว่า 600px sonner แสดงเต็มความกว้างที่ล่างจอ ทุกจุดเรียกผ่าน `showToast(tone, text)` ใน `src/common/toast.ts` ตัวเดียว (`tone` คือ `success` หรือ `error`) ไม่เรียก `toast` ของ sonner ตรง toast ปกติอยู่ `TOAST_DURATION_MS` และ toast ที่เป็น error อยู่ `TOAST_ERROR_DURATION_MS` ([project-setup](../architecture/project-setup.md#105-หน้าจอ)) ไม่ใช้ toast แทนข้อความ error ที่ผูกกับช่องกรอก

- Element ของ toast แต่ละอัน (`<li data-sonner-toast>`) มี `data-testid="toast"` (option `testId` ของ sonner) และ `data-type` เป็น `success` หรือ `error` ตาม `tone` ซึ่ง sonner ตั้งเอง sonner 2.0.8 ตั้ง attribute อื่นบน element นี้ไม่ได้ จึงใช้ `data-type` แทน `data-tone` ที่เคยกำหนดไว้
- การอ่านออกเสียงมาจาก region ของ sonner ที่มี `aria-live="polite"` sonner ไม่ตั้ง `role` ให้ toast แต่ละอัน จึงไม่มี `role="status"` หรือ `role="alert"` บน toast

## 11. ระบบชื่อ `data-testid`

1. รูปแบบ `<พื้นที่>-<สิ่ง>[-<ส่วนย่อย>]` เป็น kebab-case ภาษาอังกฤษ ค่าคงที่ ไม่ต่อด้วย id
2. รายการซ้ำใช้ testid เดียวกันทุกแถว และบอกตัวตนด้วย `data-*` เช่น `data-contact-id`, `data-message-id`, `data-document-id`, `data-id`
3. สถานะที่ test ต้องรอใช้ `data-*` เช่น `data-status`, `data-state`, `data-result` ไม่ตรวจจากสีหรือ class และทุก element ที่แสดงข้อความ error (`access-error`, `message-error`, `attachment-status`, `kb-upload-error`, `line-result`, `kb-row-status`, `guard-switch-error`, `guard-topics-error`, `guard-test-result`, `status-line-error`, `status-ai-error`) มี `data-code` เป็นรหัส error จาก server หรือรหัสฝั่ง client เมื่อมี error (ไม่มี error ไม่มี attribute) `ErrorState` มี `data-code` เมื่อผู้เรียกส่ง `code` ซึ่งตอนนี้คือส่วน AI ตอบแทน ส่วน LINE Official Account และส่วนสถานะระบบ (testid `section-error`)
4. ปุ่มที่มีข้อความ test ใช้ testid ไม่ใช้ข้อความภาษาไทย เพื่อให้แก้ถ้อยคำได้โดยไม่แตก test
5. testid ทั้งหมดประกาศใน `src/common/test-ids.ts` เป็น object เดียว ทั้งแอปและ `e2e/` import จากไฟล์นั้น
6. เพิ่มหรือเปลี่ยน testid ต้องแก้เอกสารนี้และ [stubs-and-fixtures](../qa/stubs-and-fixtures.md) ใน commit เดียวกัน

พื้นที่ที่ใช้: `welcome`, `access`, `app`, `rail`, `nav`, `connection`, `section`, `contact`, `thread`, `message`, `day`, `system`, `new`, `composer`, `attachment`, `info`, `media`, `lightbox`, `settings`, `guard`, `line`, `kb`, `usage`, `status`, `toast`
