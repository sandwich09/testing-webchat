# Use case

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-18

ขั้นตอนของทุก use case ที่ route และงานหลังตอบเรียก type และ port ที่อ้างถึงอยู่ใน [domain-and-ports](domain-and-ports.md) endpoint ที่เรียกแต่ละ use case อยู่ใน [api-contract](api-contract.md) และรหัส error อยู่ใน [error-catalog](error-catalog.md)

ไฟล์นี้เป็นที่เดียวที่กำหนดขั้นตอนและรายการ test ของทุก use case รายชื่ออยู่ใน [backend](backend.md#use-case) ค่าของ constant ที่อ้างถึงอยู่ใน [project-setup](project-setup.md#10-ค่าคงที่ของระบบ)

## การประกอบ

```ts
// src/core/use-cases/types.ts
export interface RequestContext {
  requestId: string;
  /** IP ของผู้เรียกจาก route (x-forwarded-for ตัวแรกบน Vercel ต้องยืนยัน) null เมื่อไม่รู้ */
  clientIp: string | null;
}

export type UseCase<I, O, C extends ErrorCode = never> =
  (input: I, ctx: RequestContext) => Promise<Result<O, C>>;

export interface UseCaseConfig {
  appBaseUrl: string;          // APP_BASE_URL
  aiDebounceMs: number;        // AI_DEBOUNCE_MS
  aiStuckAfterMs: number;      // AI_STUCK_AFTER_MS
  pollIntervalMs: number;      // POLL_INTERVAL_MS ส่งต่อให้หน้าเว็บผ่าน GetSettings
  rateLimitScale: number;      // RATE_LIMIT_SCALE
  priceTable: PriceTable;      // จาก pricing.constants.ts ตาม usage-cost.md
}
```

- แต่ละ use case เป็น factory `makeXxx(deps: Pick<AllPorts, ...>, config: UseCaseConfig): UseCase<...>` อยู่ในไฟล์ `xxx.use-case.ts` และรับเฉพาะ port ที่ระบุในหัวข้อ "Port ที่ใช้"
- `composition/` เป็นที่เดียวที่สร้าง adapter และส่งค่าจาก environment variable เข้า `UseCaseConfig`
- งานหลังตอบ (`after()`) ถูกห่อด้วย `runJob(fn, fields)` ใน `composition/` (`fields` คือ field ของ log: `requestId`, `route`, `contactId`, `messageId`, `documentId`) ซึ่งดัก exception แล้ว log `job.run.failed` ส่วนการตั้งสถานะในฐานข้อมูลเมื่อพัง ทำใน use case เองด้วย `try/finally` ตามที่ระบุในแต่ละหัวข้อ
- Repository throw เมื่อฐานข้อมูลล่ม ซึ่งถูกดักที่ route เป็น `internal.unexpected` (500) ยกเว้น `CheckHealth`
- ไม่มี transaction ข้าม repository การกันซ้ำและการแข่งกันทำด้วยคำสั่ง atomic ของ repository เท่านั้น (insert-if-absent, compare-and-set) ทุกขั้นจึงต้องทำซ้ำได้โดยไม่เสียหาย

## ขั้นตอนร่วม

ฟังก์ชันภายในของ use case อยู่ที่ `src/core/use-cases/shared/` ไม่ export ให้ route

### `loadLineAccess`

```ts
loadLineAccess(): Promise<Result<LineCredentials, "line.not_configured" | "line.credentials_unreadable">>
```

1. `settings.getEncryptedLineCredentials()` ได้ null คืน `line.not_configured`
2. `cipher.decrypt` ทั้งสองค่า ตัวใดได้ `secret.decrypt_failed` ให้ log `line.credentials.unreadable` แล้วคืน `line.credentials_unreadable`

### `deliverOutbound`

```ts
deliverOutbound(message: Message, contact: Contact, access: LineCredentials, mode: "auto" | "push_only"): Promise<Message>
```

คืนแถวของข้อความหลังอัปเดตสถานะเสมอ ผลการส่งอยู่ใน `deliveryStatus` และ `deliveryError` ไม่คืน error

1. `parts = toOutboundParts(message)`
2. ถ้า `mode = auto`: `choice = chooseSendChannel(contact, clock.now())`
   1. ถ้า `choice.channel = reply` และ `contacts.consumeReplyToken(contact.id, choice.replyToken)` ได้ true ให้เรียก `gateway.reply(access.channelAccessToken, choice.replyToken, parts)`
   2. สำเร็จ: `messages.markSent(id, now)`, log `line.send.succeeded` (channel reply) แล้วคืน
   3. ได้ `line.reply_token_invalid`: log `line.send.reply_token_rejected` แล้วไปข้อ 3
   4. ได้ error อื่น: `messages.markFailed(id, code)`, `settings.recordLineError({ code, at: now })`, log `line.send.failed` แล้วคืน ห้าม push ต่อ เพราะ `line.unavailable` หมายถึงไม่รู้ว่า reply ไปถึงหรือไม่
3. `gateway.push(access.channelAccessToken, contact.lineUserId, parts, message.retryKey)`
   1. สำเร็จ (รวม `alreadyAccepted`): `markSent`, log `line.send.succeeded` (channel push)
   2. ล้มเหลว: `markFailed(id, code)`, `settings.recordLineError({ code, at: now })`, log `line.send.failed`

### `raiseHandoff`

```ts
raiseHandoff(contact: Contact, reason: HandoffReason): Promise<void>
```

1. ถ้า `contact.needsAdmin` เป็น true และ `needsAdminReason` เท่ากับ `reason` อยู่แล้ว ไม่ทำอะไร (กันบรรทัดเหตุการณ์ซ้ำ เช่น งบเต็มทุกข้อความ)
2. `contacts.setNeedsAdmin(contact.id, reason)`
3. `messages.insertEvent` ชนิด event, author system, direction internal, `eventCode = handoff.{reason}`
4. log `ai.reply.handoff` พร้อม reason

### `hitRateLimit`

```ts
hitRateLimit(action: RateLimitAction, subject: string, now: Date):
  Promise<{ limited: false } | { limited: true; retryAfterSeconds: number }>
```

`rule = RATE_LIMIT_RULES[action]`, `limit = effectiveLimit(action, config.rateLimitScale)`, `windowStart = rateWindowStart(now, rule.windowMs)`, `rateLimits.hit(`${action}:${hasher.keyedHash(subject)}`, windowStart)` แล้วใช้ `isRateLimited` และ `retryAfterSeconds` ค่าจำกัดและ subject ของแต่ละ action อยู่ใน [project-setup](project-setup.md#102-การจำกัดความถี่) ถ้า IP เป็น null ใช้ `"unknown"` เป็น subject

### `checkRateLimit`

```ts
checkRateLimit(action: RateLimitAction, subject: string, now: Date):
  Promise<{ limited: false } | { limited: true; retryAfterSeconds: number }>
```

เหมือน `hitRateLimit` แต่เรียก `rateLimits.peek` แทน `hit` และใช้ `isAtLimit` ใช้เมื่อต้องนับเฉพาะบางผล (รหัสเข้าใช้ที่ผิด)

---

## VerifyAccess

**หน้าที่:** ตรวจ cookie ของรหัสเข้าใช้ ทุก route ที่ต้องเข้าระบบเรียกก่อนทำอย่างอื่น

| | |
| --- | --- |
| Input | `{ token: string \| null }` |
| Output | `void` |
| Port | `AccessTokenSigner`, `Clock` |
| Error | `access.unauthorized` |

1. token เป็น null หรือ `signer.verify(token, now)` เป็น false คืน `access.unauthorized`
2. คืน ok

Test:

- ไม่มี token → `access.unauthorized`
- token ถูกต้องและยังไม่หมดอายุ → ok
- เวลาปลอมเลื่อนไปหลัง `ACCESS_COOKIE_TTL_MS` → `access.unauthorized`
- token ถูกแก้หนึ่งตัวอักษร → `access.unauthorized`

## UnlockAccess

**หน้าที่:** ตรวจรหัสเข้าใช้ จำกัดการลอง และออก token ตาม [access-gate](../specs/access-gate.md)

| | |
| --- | --- |
| Input | `{ code: string }` (route ตรวจแล้วว่าไม่ว่าง) |
| Output | `{ token: string; expiresAt: Date }` |
| Port | `RateLimitRepository`, `ContentHasher`, `AccessTokenSigner`, `Clock`, `Logger` |
| Error | `access.rate_limited`, `access.code_invalid` |

1. `checkRateLimit("unlock", ctx.clientIp, now)` ถ้าครบ `RATE_LIMIT_UNLOCK` แล้ว log `access.unlock.rate_limited` คืน `access.rate_limited` พร้อม `retryAfterSeconds` (รหัสถูกก็ถูกปฏิเสธจนจบหน้าต่าง)
2. `signer.checkCode(code)` เป็น false: `hitRateLimit("unlock", ctx.clientIp, now)` (นับเฉพาะรหัสผิด ตาม [access-gate](../specs/access-gate.md)), log `access.unlock.failed` คืน `access.code_invalid`
3. `signer.issue(now)`, log `access.unlock.succeeded`, คืน token รหัสถูกไม่ถูกนับ

ไม่มีการเขียนอื่น route เป็นผู้ตั้ง cookie

Test:

- รหัสถูก ครั้งแรก → ได้ token ที่หมดอายุใน `ACCESS_COOKIE_TTL_MS`
- รหัสผิด → `access.code_invalid`
- ลองผิดครบ `RATE_LIMIT_UNLOCK` ครั้งในหน้าต่างเดียวจาก IP เดียว แล้วลองอีกครั้งด้วยรหัสถูก → `access.rate_limited` และ retryAfterSeconds ≥ 1
- ลองรหัสถูกหลายครั้งเกิน `RATE_LIMIT_UNLOCK` → ได้ token ทุกครั้ง (รหัสถูกไม่ถูกนับ)
- ลองผิดครบ แล้วเลื่อนเวลาปลอมข้ามหน้าต่าง → ครั้งถัดไปผ่านการจำกัด
- `RATE_LIMIT_SCALE` เป็น 10 → ค่าจำกัดของ unlock ไม่เปลี่ยน
- IP ต่างกันสองค่า → นับแยกกัน
- IP เป็น null → นับรวมใน subject `unknown`
- key ที่ส่งให้ repository ไม่มี IP ดิบ

## CheckHealth

**หน้าที่:** ตรวจการต่อฐานข้อมูลสำหรับ `GET /api/health`

| | |
| --- | --- |
| Input | `{}` |
| Output | `{ database: "ok" }` |
| Port | `SettingsRepository` |
| Error | `db.unavailable` |

1. `settings.ping()` ถ้า throw คืน `db.unavailable` (use case เดียวที่ดัก exception ของ repository)

Test: ping สำเร็จ → ok, ping throw → `db.unavailable`

## ReceiveLineEvents

**หน้าที่:** รับ webhook ของ LINE กันซ้ำ สร้างหรืออัปเดต Contact บันทึกข้อความ และคืนรายการงานที่ต้องทำหลังตอบ 200 ตาม [line-messaging](../specs/line-messaging.md#รับ-event-webhook)

| | |
| --- | --- |
| Input | `{ rawBody: string; signature: string \| null }` |
| Output | `{ followUps: FollowUpJob[] }` |
| Port | `SettingsRepository`, `SecretCipher`, `MessagingGateway`, `WebhookEventRepository`, `ContactRepository`, `MessageRepository`, `IdGenerator`, `Clock`, `Logger` |
| Error | `line.not_configured`, `line.credentials_unreadable`, `webhook.signature_invalid` |

```ts
export type FollowUpJob =
  | { kind: "store_media"; messageId: MessageId }
  | { kind: "ai_reply"; contactId: ContactId; triggerMessageId: MessageId };
```

ขั้นก่อนตอบ (ทั้งหมดอยู่ใน request):

1. `loadLineAccess()` ล้มเหลว: log `line.webhook.not_configured` แล้วคืน error นั้น
2. signature เป็น null หรือ `gateway.verifySignature(rawBody, signature, channelSecret)` เป็น false: log `line.webhook.signature_invalid` (warn) คืน `webhook.signature_invalid` ห้ามทำขั้นถัดไป
3. `settings.recordWebhookReceived(now)`
4. `gateway.parseEvents(rawBody)` ล้มเหลว: log `line.webhook.payload_invalid` คืน `ok({ followUps: [] })`
5. log `line.webhook.received` พร้อม eventCount
6. ประมวลผลทีละ event ตามลำดับใน payload แต่ละ event อยู่ใน `try/catch` ของตัวเอง ถ้า throw ให้ log `line.webhook.event_failed` แล้วไป event ถัดไป
7. คืน `ok({ followUps })`

การประมวลผลหนึ่ง event:

1. `webhookEvents.has(webhookEventId)` เป็น true: log `line.webhook.event_duplicate` ข้าม
2. ตาม `kind`:
   - `unsupported`: log `line.webhook.event_unsupported` พร้อม `lineEventType`
   - `follow`:
     1. `contacts.ensure({ id: ids.contactId(), lineUserId, now })`
     2. ถ้า `created` เรียก `fetchProfile` (ด้านล่าง)
     3. ถ้าสร้างใหม่ หรือ `followStatus` เดิมเป็น `unfollowed`: `contacts.setFollowStatus(id, "following", timestamp)` ซึ่งตั้ง `followedAt` ด้วย แล้ว `messages.insertEvent(contact.followed)`
   - `unfollow`:
     1. `contacts.ensure(...)` (กรณีไม่เคยเห็นลูกค้าคนนี้มาก่อน)
     2. ถ้าสถานะเดิมเป็น `following`: `setFollowStatus(id, "unfollowed", timestamp)` ซึ่งล้าง reply token ด้วย แล้ว `insertEvent(contact.unfollowed)`
   - `message`:
     1. `contacts.ensure(...)` และถ้า `created` เรียก `fetchProfile`
     2. สร้าง `NewMessage`: id ใหม่, direction inbound, author customer, `createdAt = timestamp`, ฟิลด์ตามชนิด, `mediaStatus` เป็น `pending` เมื่อเป็นรูปหรือวิดีโอที่ `hostedByLine` และเป็น `failed` เมื่อไม่ใช่ (สื่อจาก URL ภายนอก)
     3. `{ inserted, message } = messages.insertInboundIfAbsent(newMessage)`
     4. ถ้า `message` (แถวที่เพิ่งบันทึก หรือแถวเดิมเมื่อ `inserted` เป็น false) เป็นรูปหรือวิดีโอที่ `mediaStatus = pending`: เพิ่ม `{ kind: "store_media", messageId }` ทุกครั้งที่พบแถวนี้ รวมการส่งซ้ำของ LINE เพราะครั้งก่อนอาจพังหลังบันทึกข้อความแต่ก่อนคืนงาน งานซ้ำไม่เป็นอันตรายเพราะ `StoreInboundMedia` ปิดสถานะสื่อได้ครั้งเดียว (compare-and-set บน pending) งานถูกเพิ่มก่อนข้อ 6 เพื่อให้ข้อ 6 ที่พังไม่ทำให้งานหาย
     5. ถ้า `inserted` เป็น false ข้ามข้อ 6 และ 7 ไม่มี unread หรืองาน ai_reply ซ้ำ
     6. `contacts.recordInbound(contactId, { at: timestamp, preview: previewOf(message), replyToken: expiry ? replyToken : null, replyTokenExpiresAt: expiry })` โดย `expiry = replyTokenExpiry(timestamp, isRedelivery)`
     7. ถ้า `contact.aiEnabled` เป็น true: เพิ่ม `{ kind: "ai_reply", contactId, triggerMessageId: message.id }` ไม่ตรวจ kill switch ที่นี่ เพราะ `GenerateAiReply` ตรวจเองหลังรวมข้อความ
3. `webhookEvents.insertIfAbsent({ webhookEventId, type: kind, receivedAt: now })` เป็นขั้นสุดท้าย ถ้าระบบพังก่อนถึงขั้นนี้ LINE ส่งซ้ำแล้วทุกขั้นข้างบนทำซ้ำได้โดยไม่เกิดข้อความซ้ำ

`fetchProfile(contactId, lineUserId)`: เรียกเฉพาะลูกค้าที่เห็นครั้งแรก (`created` เป็น true) ภายใน request ก่อนตอบ 200 `gateway.getProfile` มี timeout `LINE_PROFILE_TIMEOUT_MS` และไม่ retry สำเร็จแล้ว `contacts.updateProfile` ล้มเหลวให้ log `line.profile.fetch_failed` บันทึก Contact โดยไม่มีชื่อ แล้วทำต่อ ตาม [line-messaging](../specs/line-messaging.md#ชนิดของ-event)

หลังตอบ: route ส่งแต่ละ `FollowUpJob` เข้า `runJob`: `store_media` → `StoreInboundMedia`, `ai_reply` → `GenerateAiReply`

Test:

- ยังไม่ตั้ง credential → `line.not_configured` และไม่เรียก parseEvents
- ถอดรหัส credential ไม่ได้ → `line.credentials_unreadable`
- signature ผิด → `webhook.signature_invalid` และไม่มีการเขียนใด ๆ รวม lastWebhookAt
- ไม่มี header signature → `webhook.signature_invalid`
- body ไม่ใช่ JSON แต่ signature ถูก → ok, followUps ว่าง, lastWebhookAt ถูกบันทึก
- `events` ว่าง (ปุ่ม Verify) → ok, ไม่มีการเขียนนอกจาก lastWebhookAt
- ข้อความตัวอักษรจากลูกค้าใหม่ → สร้าง Contact ที่ aiEnabled false, ดึงโปรไฟล์, บันทึก Message, unreadCount เป็น 1, ไม่มีงาน ai_reply
- ดึงโปรไฟล์ไม่สำเร็จ → Contact ชื่อว่าง และข้อความยังถูกบันทึก
- ลูกค้าเดิมที่เปิด AI ตอบแทน ส่งข้อความ → มีงาน ai_reply ที่อ้างข้อความนี้
- `webhookEventId` ซ้ำ → ข้าม ไม่มี Message ใหม่ ไม่มี followUp
- `webhookEventId` ใหม่แต่ `lineMessageId` ซ้ำ → ไม่มี Message ใหม่ unreadCount ไม่เพิ่ม ไม่มี followUp
- พังหลังบันทึก Message ก่อนบันทึก WebhookEvent แล้วส่งซ้ำ → มี Message เดียว
- event ที่ `isRedelivery` → reply token ไม่ถูกเก็บ
- reply token ใหม่ที่หมดอายุช้ากว่า → แทนค่าเดิม, เก่ากว่า → ไม่แทน
- รูปที่อยู่บน LINE → mediaStatus pending และมีงาน store_media
- รูปจาก URL ภายนอก → mediaStatus failed และไม่มีงาน store_media
- ส่งซ้ำแล้วพบรูปที่ยัง pending → มีงาน store_media อีกครั้ง แต่ไม่มี Message ใหม่ unreadCount ไม่เพิ่ม และไม่มีงาน ai_reply
- พังหลังบันทึกรูปหรือวิดีโอ (เช่น `recordInbound` throw) → ยังได้งาน store_media และการส่งซ้ำได้งานนั้นอีก
- `lineMessageId` ซ้ำของสื่อที่ไม่ pending แล้ว → ไม่มีงาน
- สติกเกอร์ → บันทึก packageId และ stickerId
- เสียง, ไฟล์, ตำแหน่ง → type other พร้อม otherKind ที่ถูกต้อง
- follow ครั้งแรก → Contact ติดตามอยู่ followedAt เท่ากับเวลา event และมีบรรทัด contact.followed
- follow ซ้ำขณะติดตามอยู่ → ไม่มีบรรทัดเหตุการณ์ใหม่
- unfollow → เลิกติดตามแล้ว reply token ถูกล้าง มีบรรทัด contact.unfollowed
- event ชนิดที่ไม่รู้จัก → log แล้วข้าม และ event อื่นในก้อนเดียวกันยังถูกประมวลผล
- event แรก throw → event ที่สองยังถูกบันทึก และผลรวมเป็น ok
- สอง event ของลูกค้าคนเดียวกันในก้อนเดียว → Message สองแถวตามลำดับ seq เดียวกับใน payload

## StoreInboundMedia

**หน้าที่:** ดาวน์โหลดรูปหรือวิดีโอจาก LINE เข้า FileStorage หลังตอบ 200 ตาม [line-messaging](../specs/line-messaging.md#สื่อขาเข้า)

| | |
| --- | --- |
| Input | `{ messageId: MessageId }` |
| Output | `{ status: MediaStatus }` |
| Port | `MessageRepository`, `ContactRepository`, `SettingsRepository`, `SecretCipher`, `MessagingGateway`, `FileStorage`, `IdGenerator`, `Clock`, `Logger` |
| Error | ไม่มี ความล้มเหลวทุกแบบถูกบันทึกเป็น `mediaStatus` |

1. `messages.findById` ถ้าไม่มี หรือไม่ใช่รูปหรือวิดีโอ หรือ `mediaStatus` ไม่ใช่ `pending` คืน ok ทันที (ทำซ้ำได้)

`setMediaStatus` และ `setMediaReady` ทุกจุดของ use case นี้เป็น compare-and-set บน `pending` ([MessageRepository](domain-and-ports.md#messagerepository)) งานสองงานของข้อความเดียวกัน (เช่น งานที่ได้ซ้ำจากการส่งซ้ำของ LINE) อาจดาวน์โหลดพร้อมกันได้ แต่ผลแรกที่บันทึกเป็นผลสุดท้าย งานที่แพ้ไม่ทับผลนั้น (ไม่เปลี่ยน ready เป็น failed) ไม่ log `media.store.failed` คืนสถานะที่อ่านได้จากแถว และถ้างานที่แพ้เก็บไฟล์ไว้แล้ว (`setMediaReady` ได้ false) จะลบไฟล์ original และ preview ของตัวเองแบบ best effort
2. `loadLineAccess()` ล้มเหลว: `setMediaStatus(failed)` log `media.store.failed` คืน
3. `max = inboundMediaMaxBytes(type)`, `keys = inboundStorageKeys(ids.randomToken(), type === "image" ? "jpg" : "mp4")` นามสกุลเดาจากชนิดของข้อความ ถ้าเนื้อจริงเป็น PNG ในชื่อ `.jpg` ยอมรับได้ เพราะ browser อ่านชนิดจากเนื้อและ header
4. `gateway.downloadContent(access, lineMessageId, "original", max)`
   - `media.too_large`: `setMediaStatus(too_large)` คืน
   - error อื่น: `setMediaStatus(failed)` log `media.store.failed` คืน
5. `storage.put(keys.original, stream, { contentType: contentType ?? "application/octet-stream", maxSizeBytes: max })` โดย `contentType` มาจากคำตอบของ LINE
   - `media.too_large`: `setMediaStatus(too_large)` คืน
   - `storage.unavailable`: `setMediaStatus(failed)` คืน
   - stream ของ LINE error ระหว่างอ่าน (adapter ของที่เก็บไฟล์อาจ throw หรือคืน `storage.unavailable`): ลบไฟล์ที่เขียนไปแล้ว แล้ว `setMediaStatus(too_large)` เฉพาะเมื่อรู้ว่าขนาดเกินเพดาน คือ `sizeBytes` (Content-Length) มากกว่า `max` หรือ error ของ stream มี `code: "media.too_large"` ตามสัญญาของ [MessagingGateway](domain-and-ports.md#messaginggateway) นอกนั้น (เช่น การเชื่อมต่อขาดใน body ที่ไม่มี Content-Length) `setMediaStatus(failed)` พร้อม log รหัส `line.unavailable`
6. `storage.inspect(keys.original)` แล้ว `sniffed = sniffContentType(leadingBytes)` ถ้า `isAllowedInboundType(type, sniffed)` เป็น false: `storage.delete(keys.original)`, `setMediaStatus(failed)` คืน
7. `mediaUrl` คือ `publicUrl` จากข้อ 5
8. ภาพตัวอย่าง:
   - รูป: `previewUrl = mediaUrl`
   - วิดีโอ: `downloadContent(..., "preview", PREVIEW_MAX_BYTES)` แล้ว `put(keys.preview, ...)` ถ้าไม่สำเร็จ ใช้ `previewUrl = mediaUrl` และหน้าเว็บแสดงไอคอนวิดีโอแทนภาพ
9. `messages.setMediaReady(id, mediaUrl, previewUrl)` log `media.store.succeeded` คืน `ready`

ทั้ง use case อยู่ใน `try/catch` ถ้า throw ให้พยายาม `setMediaStatus(failed)` แล้ว throw ต่อให้ `runJob` log

Test:

- รูป JPEG ขนาดปกติ → ready, previewUrl เท่ากับ mediaUrl, key ขึ้นต้นด้วย `inbound/` และมีส่วนสุ่ม
- วิดีโอ MP4 → ready พร้อมภาพตัวอย่างแยก
- วิดีโอที่ดึงภาพตัวอย่างไม่ได้ → ready และ previewUrl เท่ากับ mediaUrl
- LINE แจ้งขนาดเกิน `IMAGE_MAX_BYTES` สำหรับรูป → too_large และไม่เรียก put
- ไม่มี Content-Length และ stream เกินเพดาน → too_large และไม่มีไฟล์ค้าง
- ไม่มี Content-Length และ stream ขาดด้วย error ที่ไม่มีรหัส `media.too_large` → failed ไม่ใช่ too_large
- Content-Length เกินเพดานแล้ว stream ขาด → too_large
- สองงานของข้อความเดียวกันพร้อมกัน → ready และเหลือไฟล์ชุดเดียว
- งานที่มาช้าซึ่งอ่านแถวตอนยัง pending แล้วล้มเหลวหรือ throw → แถว ready เดิมไม่เปลี่ยน
- งานที่มาช้าซึ่งเก็บวิดีโอสำเร็จด้วย → URL เดิมไม่เปลี่ยน และไฟล์ของงานที่ช้าถูกลบ
- LINE ตอบ 404 (ไฟล์หมดอายุ) → failed
- เนื้อไฟล์ไม่ใช่รูปแม้ header บอกว่าเป็นรูป → failed และไฟล์ถูกลบ
- ที่เก็บไฟล์ล่ม → failed
- ข้อความ ready อยู่แล้ว เรียกซ้ำ → ไม่ดาวน์โหลดอีก
- credential หาย → failed

## GenerateAiReply

**หน้าที่:** ตรวจเงื่อนไข รวมข้อความรัว คัดกรองขอบเขตหัวข้อ (เมื่อเปิด) เรียกโมเดล ส่งคำตอบ บันทึกต้นทุน หรือขึ้นสถานะรอแอดมิน ตาม [ai-reply](../specs/ai-reply.md), [topic-guard](../specs/topic-guard.md) และ [usage-cost](../specs/usage-cost.md) ทำงานหลังตอบ 200 ของ webhook

| | |
| --- | --- |
| Input | `{ contactId: ContactId; triggerMessageId: MessageId }` |
| Output | `AiReplyRunOutcome` |
| Port | `Clock`, `MessageRepository`, `ContactRepository`, `SettingsRepository`, `UsageRepository`, `SecretCipher`, `MessagingGateway`, `TopicGuard`, `KnowledgeSource`, `ChatModel`, `IdGenerator`, `Logger` |
| Error | ไม่มี ผลทุกแบบอยู่ใน outcome และในฐานข้อมูล |

```ts
export type AiReplyRunOutcome =
  | { kind: "superseded" }
  | { kind: "locked" }
  | { kind: "skipped"; reason: "kill_switch_off" | "contact_ai_off" | "unfollowed" | "contact_missing" | "no_history" }
  | { kind: "handoff"; reason: HandoffReason }
  | { kind: "replied"; messageId: MessageId }
  | { kind: "blocked"; messageId: MessageId }   // นอกขอบเขตหัวข้อ ส่งข้อความปฏิเสธแล้ว
  | { kind: "cancelled" };
```

### ขั้นตอนหลัก

ลำดับการตรวจของทั้ง use case: kill switch → สวิตช์รายลูกค้า → การติดตาม → ชนิดข้อความ → งบต่อวัน (ข้อ 4) → รวมข้อความและล็อก (ข้อ 1, 5) → ขอบเขตหัวข้อเมื่อ `guardEnabled` (`replyOnce` ข้อ 4) → คลังความรู้และโมเดลตอบแชท (`replyOnce` ข้อ 5 เป็นต้นไป) งบถูกตรวจก่อนการคัดกรอง และต้นทุนของการคัดกรองนับรวมในงบผ่าน `usage.sumCost`

วนได้ไม่เกิน `AI_MAX_ROUNDS_PER_RUN` รอบ เริ่ม `round = 1`

1. `clock.sleep(config.aiDebounceMs)` (ทุกรอบ รอบที่ 2 ขึ้นไปรอขณะถือล็อก)
2. `latest = messages.latestInbound(contactId)`
   - รอบที่ 1 และ `latest.id !== triggerMessageId`: log `ai.reply.superseded` คืน `superseded` เพราะงานของข้อความที่ใหม่กว่าจะตอบเอง
   - รอบที่ 2 ขึ้นไป: ใช้ `latest` เป็นข้อความที่จะตอบ
3. อ่าน `s = settings.get()`, `c = contacts.findById(contactId)` (null คืน `skipped: contact_missing`) และ `todayCost = usage.sumCost(bangkokDayRange(now))`
4. `d = shouldAiReply({ killSwitchOn: s.aiEnabled, contact: c, latestInbound: latest, todayCost, dailyBudget: s.aiDailyBudget })` ข้อ 2 ถึง 4 ทำซ้ำทุกรอบ kill switch และสวิตช์รายลูกค้าที่ถูกปิดระหว่างรอบจึงหยุดรอบถัดไป
   - `d.handoff` ไม่เป็น null: `raiseHandoff(c, d.handoff)` คืน `handoff`
   - `d.reply` เป็น false นอกนั้น: log `ai.reply.skipped` คืน `skipped`
5. เฉพาะรอบที่ 1: `contacts.tryAcquireAiLock(contactId, now)` เป็น false: log `ai.reply.locked` คืน `locked` ผู้ถือล็อกจะเห็นข้อความนี้ในข้อ 8 ถ้าได้ล็อก ถือต่อจนจบงาน และ `contacts.releaseAiLock(contactId)` อยู่ใน `finally` ครั้งเดียว ไม่ว่าจบด้วยผลใดหรือ throw
6. `trace = { seenSeq: latest.seq, replyIds: [] }` แล้วเรียก `replyOnce(c, s, latest)` ระหว่างรอบ `replyOnce` ข้อ 3 ปรับ `trace.seenSeq` เป็น seq สูงสุดของแถวในประวัติที่อ่าน และทุกข้อความ AI ที่บันทึก (คำตอบ ข้อความแจ้งส่งต่อแอดมิน หรือข้อความปฏิเสธของขอบเขตหัวข้อ) ถูกเพิ่มใน `trace.replyIds`
7. ถ้าผลของ `replyOnce` เป็น `cancelled` คืนผลนั้นทันที
8. `newer = messages.latestInbound(contactId)` ถ้า `newer.seq > trace.seenSeq` ไม่จริง คืนผลของ `replyOnce` ข้อความที่โมเดลเห็นแล้วในประวัติของรอบนี้ (มาหลังข้อ 2 แต่ก่อนอ่านประวัติ) จึงไม่ทำให้เกิดรอบที่ตอบซ้ำ ถ้าจริงและ `round < AI_MAX_ROUNDS_PER_RUN`: `round += 1` กลับไปข้อ 1 โดยยังถือล็อก
9. ถ้า `newer.seq > trace.seenSeq` และ `round = AI_MAX_ROUNDS_PER_RUN`: ทำข้อ 2 ถึง 4 อีกครั้งโดยไม่รอ ถ้าผ่าน `raiseHandoff(c, "ai_timeout")` คืน `handoff` ไม่เรียกโมเดล งานของข้อความนั้นได้ `locked` ไปแล้ว หรือถ้าตื่นหลังปล่อยล็อกจะเห็นประวัติที่จบด้วยคำตอบของรอบนี้ จึงต้องให้แอดมินตอบแทนการเงียบ

ล็อกถูกถือตั้งแต่ข้อ 5 ของรอบที่ 1 จนจบงาน การรอช่วงรวมข้อความของรอบที่ 1 ไม่ถือล็อก การรอก่อนรอบที่ 2 ขึ้นไปถือล็อก งานของข้อความที่มาระหว่างงานนี้จึงได้แค่ `superseded` หรือ `locked` และไม่มีทางอ่านประวัติตาม seq ที่จบด้วยคำตอบของงานนี้ ข้อความนั้นถูกตอบโดยรอบถัดไปของผู้ถือล็อก (ข้อ 8) หรือขึ้นรอแอดมิน (ข้อ 9) ข้อความที่มาหลังข้อ 8 ของรอบสุดท้ายมี seq สูงกว่าทุกคำตอบของงานนี้ งานของมันตื่นหลังช่วงรวมข้อความ ได้ล็อกหลังงานนี้ปล่อย และเห็นประวัติที่จบด้วยลูกค้า

เวลาที่ถือล็อก: `aiStateAt` ตั้งครั้งเดียวในข้อ 5 เวลาแย่ที่สุดคือ `AI_MAX_ROUNDS_PER_RUN` × (การคัดกรองรวม retry + การตอบแชทรวม retry + LINE) + `AI_DEBOUNCE_MS` ซึ่ง `AI_STUCK_AFTER_MS` ตั้งไว้ให้มากกว่าค่านี้ ([project-setup](project-setup.md#10-ค่าคงที่ของระบบ)) เงื่อนไขนี้จึงจริงทั้งบน Vercel ที่งานใน `after()` ถูกตัดที่ `WEBHOOK_MAX_DURATION_S` และใน Docker ที่ไม่มีเพดานเวลา ถ้า function ถูกตัดขณะถือล็อก แถวค้างเป็น `replying` และกลไกงานที่ค้างเปลี่ยนเป็นรอแอดมิน `ai_timeout`

ข้อจำกัดที่รู้: ข้อความที่มาหลังข้อ 8 ของรอบสุดท้ายแต่ก่อนปล่อยล็อก (ช่วงเขียนฐานข้อมูลครั้งเดียว) จะถูกตอบโดยงานของมันเฉพาะเมื่องานนั้นตื่นหลังปล่อยล็อก ซึ่งเป็นจริงเมื่อ `AI_DEBOUNCE_MS` ยาวกว่าช่วงนั้น ข้อความที่มาหลังคำตอบของรอบสุดท้ายแต่ก่อนข้อ 8 ทำให้ขึ้นรอแอดมิน `ai_timeout` และถ้างานของมันตื่นหลังปล่อยล็อก AI ก็ตอบด้วย

### `replyOnce(c, s, latest)`

1. `access = loadLineAccess()` ล้มเหลว: `raiseHandoff(c, "ai_failed")` คืน `handoff` (ไม่เรียกโมเดลเมื่อส่งไม่ได้อยู่แล้ว)
2. `gateway.showLoading(access, c.lineUserId, LINE_LOADING_SECONDS)` ไม่รอผลเป็นเงื่อนไข ล้มเหลวให้ log `line.loading.failed`
3. `rows = messages.recentForAi(contactId, AI_HISTORY_LIMIT)`, `history = toHistoryTurns(rows)` ถ้าว่าง คืน `skipped: no_history`
   - รอบที่ 2 ขึ้นไป: ข้อความของลูกค้าที่มาระหว่างการเรียกโมเดลของรอบก่อนมี seq ต่ำกว่าข้อความ AI ของรอบนั้น ทั้งที่รอบนั้นไม่เห็น ถ้าเรียงตาม seq ประวัติจะจบด้วยร้านและข้อความนั้นไม่ถูกตอบ จึงย้ายเฉพาะข้อความใน `replyIds` ของรอบก่อนไปไว้หลังแถวสุดท้ายที่รอบนั้นเห็น (`seenSeq` ของรอบนั้น) แถวอื่นคงลำดับ seq แล้วจึง `toHistoryTurns` ไม่มีแถวใดหายหรือซ้ำ
   - คำตอบของรอบก่อนที่ส่งไม่สำเร็จถูกตัดโดย `toHistoryTurns` ข้อความของลูกค้าก่อนและหลังจึงรวมเป็นตาเดียวและถูกตอบทั้งหมด ข้อความแจ้งส่งต่อแอดมินและข้อความปฏิเสธที่ส่งแล้วอยู่ในตำแหน่งที่รอบนั้นตอบ ข้อความหลายข้อความที่มาระหว่างนั้นอยู่หลังคำตอบตามลำดับ seq และรวมเป็นตาเดียว
4. ขอบเขตหัวข้อ ทำเฉพาะเมื่อ `s.guardEnabled` เป็น true ก่อนโหลดคลังความรู้และก่อนเรียกโมเดลตอบแชท ([topic-guard](../specs/topic-guard.md)):
   1. `{ message, context } = guardContextTurns(history)` แล้ว `g = topicGuard.classify({ topics: s.guardTopics, message, context, model: GUARD_MODEL, maxTokens: GUARD_MAX_TOKENS, timeoutMs: GUARD_TIMEOUT_MS })`
   2. `g` เป็น error (ไม่มีคำตอบจาก API จึงไม่มีต้นทุน): `settings.recordAiError({ code, at: now })`, log `guard.failed`, `raiseHandoff(c, "ai_failed")` คืน `handoff` ไม่ส่งอะไรให้ลูกค้า
   3. `gr = g.value`, `{ cost, priceKnown } = computeCost(gr.usage, gr.servedModel, config.priceTable)` (`priceKnown` false log `ai.price_unknown_model`) และ `gd` คือแถว AiUsage ฉบับร่าง `{ id: ids.usageId(), kind: "guard", contactId, provider: "claude", model: gr.servedModel, usage: gr.usage, cost, createdAt: now }` แล้ว `v = guardVerdictOf(gr, s.guardTopics)`
   4. `v.verdict = failed` (ปฏิเสธ ถูกตัด ไม่ตรง schema): `usage.insert({ ...gd, messageId: null, outcome: "failed", error: v.error })`, `settings.recordAiError({ code: v.error, at: now })`, log `guard.failed`, `raiseHandoff(c, "ai_failed")` คืน `handoff` (ปิดแบบปลอดภัย ไม่ส่งอะไรให้ลูกค้า)
   5. `v.verdict = blocked`: log `guard.checked` (outcome blocked) แล้วคืนผลของ `sendGuardRefusal(c, access, gd, "classifier")` ไม่โหลดคลังความรู้และไม่เรียกโมเดลตอบแชท
   6. `v.verdict = allowed`: `usage.insert({ ...gd, messageId: null, outcome: "ok", error: null })`, log `guard.checked` (outcome ok) แล้วทำข้อ 5 ต่อ
5. `knowledge = knowledgeSource.getKnowledge()`
6. `systemInstructions = buildSystemInstructions(s)` และถ้า `s.guardEnabled` ต่อท้ายด้วย `"\n\n" + buildGuardRulesBlock(s.guardTopics)` ([ai-prompt ข้อ 9.5](../specs/ai-prompt.md#95-บล็อกที่ต่อท้ายคำสั่งระบบของการตอบแชท))
7. `res = chatModel.generateReply({ model: s.aiModel, systemInstructions, knowledgeText: knowledge.text, history, now: clock.now(), maxTokens: AI_MAX_TOKENS })`
8. `res` เป็น error (ไม่มีคำตอบจาก API จึงไม่มีต้นทุน): `settings.recordAiError({ code, at: now })`, log `ai.reply.failed`, `raiseHandoff(c, "ai_failed")` คืน `handoff`
9. `r = res.value`, `{ cost, priceKnown } = computeCost(r.usage, r.servedModel, config.priceTable)` ทุกแถว AiUsage ที่บันทึกในขั้นถัดไปใช้ `id: ids.usageId()`, `kind: "reply"`, `provider: "claude"`, `model: r.servedModel`, `usage: r.usage`, `cost`, `createdAt: now` ถ้า `priceKnown` เป็น false log `ai.price_unknown_model` ตาม [usage-cost](../specs/usage-cost.md#การคำนวณราคา), log `ai.model.called`
10. `o = usageOutcomeOf(r)` ถ้า `o.outcome = ok`: `text = sanitizeAiReply(r.output.reply)` ถ้าได้ null ให้ `o = { outcome: "failed", error: "ai.invalid_output", handoff: "ai_failed" }`
11. ชั้นที่สองของขอบเขตหัวข้อ: ถ้า `s.guardEnabled` และ `o.handoff = ai_unsafe_or_offtopic` คืนผลของ `sendGuardRefusal(c, access, <แถว reply ฉบับร่างจากข้อ 9>, "chat_model")` ทำเหมือนการกันของข้อ 4.5 ทุกอย่าง ไม่ขึ้นรอแอดมิน
12. ตรวจซ้ำก่อนส่ง: `s2 = settings.get()`, `c2 = contacts.findById(contactId)` ถ้า `s2.aiEnabled` เป็น false หรือ `c2.aiEnabled` เป็น false หรือ `c2.followStatus = unfollowed`:
    - `usage.insert({ kind: "reply", contactId, messageId: null, outcome: "cancelled", error: null, ... })`
    - log `ai.reply.cancelled` คืน `cancelled` ไม่ส่ง ไม่ขึ้นรอแอดมิน
13. `o.outcome` เป็น `refused` หรือ `failed`:
    - `usage.insert({ ..., messageId: null, outcome: o.outcome, error: o.error })`
    - `settings.recordAiError({ code: o.error, at: now })`
    - `raiseHandoff(c2, o.handoff)` คืน `handoff` ไม่ส่งอะไรให้ลูกค้า
14. ข้อความที่จะส่ง: `ok` ใช้ `text` จากข้อ 10, `handoff` ใช้ `handoffText(s2.aiPoliteParticle)` เสมอ ไม่ส่ง `reply` ของโมเดล ([ai-prompt ข้อ 5.4](../specs/ai-prompt.md#54-จากผลไปสู่การกระทำ))
15. `id = ids.messageId()`, `messages.insertOutboundIfAbsent({ id, author: "ai", type: "text", text, deliveryStatus: "pending", retryKey: id, createdAt: now, ... })`, `contacts.recordOutbound(contactId, { at: now, preview, by: "ai" })`
16. `usage.insert({ ..., messageId: id, outcome: o.outcome, error: null })`
17. `sent = deliverOutbound(message, c2, access, "auto")`
18. ถ้า `sent.deliveryStatus = failed`: `raiseHandoff(c2, "ai_failed")` คืน `handoff`
19. ถ้า `o.outcome = handoff`: `raiseHandoff(c2, o.handoff)` (`ai_` + เหตุผลที่โมเดลเลือก) คืน `handoff`
20. log `ai.reply.sent` คืน `replied`

### `sendGuardRefusal(c, access, draft, by)`

`draft` คือแถว AiUsage ฉบับร่างของการเรียกที่ตัดสินว่ากัน (`kind: "guard"` จากข้อ 4.3 หรือ `kind: "reply"` จากข้อ 9) และ `by` เป็น `"classifier"` หรือ `"chat_model"` ใช้เป็น `reason` ของ log

1. ตรวจซ้ำก่อนส่งเหมือนข้อ 12: `s2 = settings.get()`, `c2 = contacts.findById(contactId)` ถ้า kill switch ปิด, AI ตอบแทนของลูกค้าปิด หรือเลิกติดตาม: `usage.insert({ ...draft, messageId: null, outcome: "cancelled", error: null })`, log `ai.reply.cancelled` คืน `cancelled`
2. `id = ids.messageId()`, `messages.insertOutboundIfAbsent({ id, author: "ai", type: "text", text: s2.guardRefusalText, deliveryStatus: "pending", retryKey: id, createdAt: now, ... })`, `contacts.recordOutbound(contactId, { at: now, preview, by: "ai" })`
3. `messages.insertEvent` ชนิด event, author system, direction internal, `eventCode = guard.blocked`
4. `usage.insert({ ...draft, messageId: id, outcome: "blocked", error: null })`
5. log `guard.blocked` พร้อม `reason: by`
6. `sent = deliverOutbound(message, c2, access, "auto")` (reply token ก่อน แล้ว push) ถ้า `sent.deliveryStatus = failed`: `raiseHandoff(c2, "ai_failed")` คืน `handoff` เพราะลูกค้าไม่ได้รับอะไร
7. คืน `blocked` พร้อม `messageId: id` ไม่เรียก `raiseHandoff` และไม่แตะ `aiEnabled` แชทจึงไม่ขึ้นรอแอดมินและ AI ตอบแทนยังเปิด

ข้อความแจ้งส่งต่อแอดมินคือ `ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะ{particle}` ตามคำลงท้ายที่ตั้งไว้ รูปที่ใช้จริงหลัง "นะ" กำหนดใน `handoffText` ของ [domain-and-ports](domain-and-ports.md#ai)

### งานที่ค้าง

ไม่อยู่ใน use case นี้ `ListContacts` เรียก `contacts.recoverStuckAiStates(now - aiStuckAfterMs)` ทุกรอบ แถวที่ค้างกลายเป็นรอแอดมินด้วยเหตุผล `ai_timeout` พร้อมบรรทัดเหตุการณ์ ตาม [ai-reply](../specs/ai-reply.md#งานที่ค้าง)

Test (ทุกข้อใช้ Clock ปลอม และ adapter ปลอม):

เงื่อนไข

- kill switch ปิด → `skipped: kill_switch_off` ไม่เรียกโมเดล ไม่ขึ้นรอแอดมิน
- AI ตอบแทนของลูกค้าปิด → `skipped: contact_ai_off`
- ลูกค้าเลิกติดตาม → `skipped: unfollowed`
- ข้อความล่าสุดเป็นรูป → `handoff: customer_sent_image` มีบรรทัด `handoff.customer_sent_image` ไม่เรียกโมเดล
- ข้อความล่าสุดเป็นวิดีโอ → `customer_sent_video`, สติกเกอร์หรือชนิดอื่น → `customer_sent_non_text`
- งบวันนี้เท่ากับเพดาน → `handoff: budget_reached` ไม่เรียกโมเดล
- งบเหลือ 1 nano-USD → เรียกโมเดล
- ต้นทุนของเมื่อวานตามเวลาไทยไม่ถูกนับ (เวลาปลอม 23:59 กับ 00:01 ของวันไทยถัดไป ขณะ CI เป็น UTC)
- เงื่อนไขครบทุกข้อ → เรียกโมเดลหนึ่งครั้ง
- งบเต็มสองข้อความติดกัน → บรรทัดเหตุการณ์ขึ้นครั้งเดียว
- ขอบเขตหัวข้อปิด → ไม่เรียก `TopicGuard` และคำสั่งระบบไม่มีบล็อก `<topic_guard>`

ขอบเขตหัวข้อ (เปิดอยู่และมีสองหัวข้อ)

- งบเต็ม → `handoff: budget_reached` ไม่เรียก `TopicGuard` และไม่เรียกโมเดลตอบแชท
- kill switch ปิด → `skipped: kill_switch_off` ไม่เรียก `TopicGuard`
- ผ่าน (`allowed: true`) → เรียก `TopicGuard` หนึ่งครั้งก่อน `KnowledgeSource` และ `ChatModel`, AiUsage kind guard outcome ok แล้ว AiUsage kind reply ตามปกติ, คำสั่งระบบที่โมเดลได้รับลงท้ายด้วยผลของ `buildGuardRulesBlock(topics)`
- คำขอที่ `TopicGuard` ได้รับ: `model` เป็น `GUARD_MODEL` แม้ตั้งโมเดลตอบแชทเป็น Opus, `maxTokens` เป็น `GUARD_MAX_TOKENS`, `timeoutMs` เป็น `GUARD_TIMEOUT_MS`, `topics` ตามที่บันทึก, `message` เป็น turn สุดท้ายของลูกค้า (ข้อความรัวสามข้อความรวมเป็นหนึ่ง) และ `context` ไม่เกิน `GUARD_CONTEXT_TURNS` turn ก่อนหน้า
- ถูกกัน (`allowed: false`) → `blocked`, ไม่เรียก `KnowledgeSource` และ `ChatModel`, ลูกค้าได้ `guardRefusalText` ผ่าน reply token, ข้อความผู้ส่ง ai, บรรทัด `guard.blocked`, AiUsage kind guard outcome blocked พร้อม messageId ของข้อความปฏิเสธ, `needsAdmin` ไม่เปลี่ยน และ `aiEnabled` ยังเป็น true
- ถูกกันขณะ reply token หมดอายุ → ส่งข้อความปฏิเสธด้วย push พร้อม retryKey เท่ากับ id ของข้อความ
- ถูกกันแล้วส่งไม่สำเร็จ (`line.unavailable`) → ข้อความ failed และขึ้นรอแอดมิน `ai_failed`
- kill switch ถูกปิดระหว่างการคัดกรองที่ได้ผลกัน → `cancelled` ไม่ส่งข้อความปฏิเสธ, AiUsage kind guard outcome cancelled, ไม่มีบรรทัดเหตุการณ์
- `TopicGuard` คืน `ai.unavailable` (รวม timeout) → ไม่ส่งอะไร, ไม่มี AiUsage, ขึ้นรอแอดมิน `ai_failed`, lastAiError ถูกบันทึก, ไม่เรียก `ChatModel`
- `TopicGuard` คืน `ai.rate_limited`, `ai.auth_failed`, `ai.bad_request` → เหมือนข้อบน
- `stop = refused` → ไม่ส่งอะไร, AiUsage kind guard outcome failed error `ai.refused`, ขึ้นรอแอดมิน `ai_failed`, ไม่เรียก `ChatModel`
- `stop = truncated` → AiUsage outcome failed error `ai.truncated`, `ai_failed`
- `verdict = null` (ไม่ตรง schema) → AiUsage outcome failed error `ai.invalid_output`, `ai_failed`
- `allowed: true` แต่ `matchedTopic` ไม่อยู่ในรายการหัวข้อ → ยังผ่าน และถือ `matchedTopic` เป็น null
- ผ่านการคัดกรอง แต่โมเดลตอบแชทคืน `needsAdmin` true เหตุผล `unsafe_or_offtopic` → ส่ง `guardRefusalText` ไม่ใช่ `handoffText`, บรรทัด `guard.blocked`, AiUsage kind reply outcome blocked, ไม่ขึ้นรอแอดมิน
- ขอบเขตหัวข้อปิด และโมเดลคืน `unsafe_or_offtopic` → ขึ้นรอแอดมิน `ai_unsafe_or_offtopic` ตามเดิม
- ต้นทุนของการคัดกรองเมื่อเช้านับรวมใน `todayCost` ของข้อความถัดไป (งบเต็มเพราะการคัดกรองแล้ว → `budget_reached`)
- log ของการคัดกรองไม่มีข้อความของลูกค้า หัวข้อ หรือข้อความปฏิเสธ

การรวมข้อความและล็อก

- มีข้อความใหม่เข้ามาระหว่างรอ → งานของข้อความเก่าคืน `superseded` และงานของข้อความใหม่ตอบครั้งเดียว
- สามข้อความรัวภายในช่วงรอ → เรียกโมเดลครั้งเดียว และประวัติที่ส่งมีครบสามข้อความ
- อีกงานถือล็อกอยู่ → `locked` ไม่เรียกโมเดล
- ข้อความใหม่เข้ามาระหว่างเรียกโมเดล และงานของมันได้ `locked` → ผู้ถือล็อกตอบรอบที่ 2 ให้ข้อความนั้น
- งานของข้อความที่มาระหว่างเรียกโมเดลตื่นระหว่างการรอก่อนรอบที่ 2 → `locked` และผู้ถือล็อกตอบข้อความนั้นในรอบที่ 2 (เดิมงานนั้นได้ `skipped: no_history` และรอบที่ 2 ได้ `locked`)
- ล็อกถูกขอครั้งเดียว ยังเป็น `replying` ระหว่างการรอก่อนรอบที่ 2 และ `aiStateAt` ไม่เปลี่ยน
- kill switch หรือสวิตช์รายลูกค้าถูกปิดระหว่างรอบ → รอบที่ 2 คืน `skipped` ไม่เรียกโมเดล ล็อกถูกปล่อย
- ข้อความใหม่ระหว่างรอบที่ `AI_MAX_ROUNDS_PER_RUN` → ไม่มีรอบเพิ่ม `handoff: ai_timeout` พร้อมบรรทัดเหตุการณ์ งานของข้อความนั้นที่ตื่นภายหลังได้ `skipped: no_history`
- ข้อความที่เหลือหลังรอบสุดท้ายเป็นรูป → `handoff: customer_sent_image` ไม่ใช่ `ai_timeout`, kill switch ปิดแล้ว → `skipped` ไม่ขึ้นรอแอดมิน
- ข้อความมาหลังข้อ 8 ของรอบสุดท้าย → งานของมันได้ล็อกหลังปล่อย ประวัติจบด้วยลูกค้า และตอบ
- โมเดลล้มเหลว → ล็อกถูกปล่อย
- `replyOnce` throw → ล็อกถูกปล่อย และ exception ถูกส่งต่อ

ผลของโมเดล

- คำตอบปกติ → ส่งข้อความผู้ส่ง AI บันทึก AiUsage outcome ok พร้อม messageId และ costUsd ตามตารางราคาของ `servedModel`
- `servedModel` ต่างจากที่ตั้งไว้ (สลับโมเดลสำรอง) → ต้นทุนคิดจาก `servedModel`
- `servedModel` ไม่อยู่ในตารางราคา → ใช้ราคาสูงสุดในตาราง และ log `ai.price_unknown_model`
- `needsAdmin` true `handoffReason` `not_in_knowledge` คำลงท้าย "ค่ะ" → ส่ง "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ" (ไม่ใช่ `reply` ของโมเดล) ขึ้นรอแอดมินเหตุผล `ai_not_in_knowledge` และบรรทัด `handoff.ai_not_in_knowledge` AiUsage outcome handoff
- `needsAdmin` true คำลงท้าย "ครับ" → ส่ง "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะครับ"
- `handoffReason` แต่ละค่า (`needs_human_action`, `unsafe_or_offtopic`, `other`) → เหตุผล `ai_` + ค่านั้น
- `stop = refused` → ไม่ส่ง, outcome refused, เหตุผล `ai_failed`, lastAiError เป็น `ai.refused`
- `stop = truncated` → ไม่ส่ง, outcome failed error `ai.truncated`, เหตุผล `ai_failed`
- `output = null` (ไม่ตรง schema) → ไม่ส่ง, error `ai.invalid_output`, เหตุผล `ai_failed`
- reply ว่างหรือยาวเกิน `AI_REPLY_MAX_CHARS` หลังทำความสะอาด → เหมือนไม่ตรง schema
- port คืน `ai.unavailable` → ไม่มี AiUsage, เหตุผล `ai_failed`, lastAiError ถูกบันทึก
- port คืน `ai.auth_failed`, `ai.rate_limited`, `ai.bad_request` → เหมือนข้อบน
- ความรู้ว่าง → `knowledgeText` เป็นบล็อกของคลังว่าง และยังเรียกโมเดล
- คำขอที่โมเดลได้รับ: โมเดลตามที่ตั้ง, คำแนะนำของร้านอยู่ใน systemInstructions, ประวัติไม่เกิน `AI_HISTORY_LIMIT` ข้อความ, ไม่มีบรรทัดเหตุการณ์และข้อความขาออกที่ส่งไม่สำเร็จ, จบด้วยข้อความของลูกค้า, `now` เท่ากับเวลาของ Clock ปลอม

ตรวจซ้ำก่อนส่ง

- kill switch ถูกปิดระหว่างเรียกโมเดล → `cancelled` ไม่ส่ง, AiUsage outcome cancelled พร้อมต้นทุน, ไม่ขึ้นรอแอดมิน
- แอดมินตอบเอง (AI ตอบแทนถูกปิด) ระหว่างเรียกโมเดล → `cancelled`
- ลูกค้าเลิกติดตามระหว่างเรียกโมเดล → `cancelled`

การส่ง

- reply token ยังใช้ได้ → ส่งด้วย reply และ token ถูกใช้แล้ว
- reply token หมดอายุตามเวลาปลอม → ส่งด้วย push พร้อม retryKey เท่ากับ id ของข้อความ
- LINE ปฏิเสธ reply token → push ต่อ และข้อความเป็น sent
- reply ได้ `line.unavailable` → ไม่ push, ข้อความ failed, ขึ้นรอแอดมินเหตุผล `ai_failed`
- push ได้ `line.quota_exceeded` → ข้อความ failed error นั้น, lastLineError ถูกบันทึก, ขึ้นรอแอดมิน `ai_failed`
- credential ของ LINE หายก่อนเรียกโมเดล → ไม่เรียกโมเดล ขึ้นรอแอดมิน `ai_failed`
- loading ล้มเหลว → ยังตอบตามปกติ

## SendAdminMessage

**หน้าที่:** บันทึกและส่งข้อความ รูป หรือวิดีโอของแอดมิน ปิด AI ตอบแทนของลูกค้าคนนั้น ตาม [webchat-inbox](../specs/webchat-inbox.md#ช่องตอบ) และ [line-messaging](../specs/line-messaging.md#ส่งข้อความ)

| | |
| --- | --- |
| Input | `{ contactId: ContactId; messageId: MessageId; content: { kind: "text"; text: string } \| { kind: "image" \| "video"; uploadId: UploadId; contentType: string } }` |
| Output | `Message` (สถานะ sent หรือ failed หรือ pending เมื่อเป็นการเรียกซ้ำระหว่างอีกคำขอยังส่งอยู่) |
| Port | `MessageRepository`, `ContactRepository`, `SettingsRepository`, `SecretCipher`, `MessagingGateway`, `FileStorage`, `RateLimitRepository`, `ContentHasher`, `IdGenerator` (id ของบรรทัดเหตุการณ์ในข้อ 8), `Clock`, `Logger` |
| Error | `message.id_conflict`, `message.rate_limited`, `contact.not_found`, `contact.unfollowed`, `line.not_configured`, `line.credentials_unreadable`, `upload.type_not_allowed`, `upload.not_found`, `upload.too_large`, `upload.content_mismatch`, `storage.unavailable` |

การส่งไม่สำเร็จไม่ใช่ error ของ use case: ข้อความถูกบันทึกเป็น failed พร้อมรหัส และคืน ok เพื่อให้หน้าเว็บแสดง "ส่งไม่สำเร็จ" กับปุ่ม "ส่งอีกครั้ง"

1. `existing = messages.findById(messageId)` ถ้ามี: `contactId` ต่างกัน ไม่ใช่ขาออกของแอดมิน หรือเนื้อหาต่างจากคำขอ (ข้อความตัวอักษรเทียบ `text` ตรงตัว รูปหรือวิดีโอเทียบชนิด) คืน `message.id_conflict` ไม่เช่นนั้นคืน `ok(existing)` โดยไม่ส่งซ้ำ (การกดซ้ำและการ retry ของเครือข่ายไม่ถูกนับในการจำกัดความถี่)
2. `hitRateLimit("send_message", ctx.clientIp ?? "unknown", now)` เกินคืน `message.rate_limited`
3. `c = contacts.findById` null คืน `contact.not_found`, `followStatus = unfollowed` คืน `contact.unfollowed`
4. `access = loadLineAccess()` ล้มเหลวคืน error นั้น ข้อความยังไม่ถูกบันทึก
5. ถ้าเป็นรูปหรือวิดีโอ:
   1. `rule = outboundMediaRule(kind)` ถ้า `contentType` ไม่อยู่ใน `rule.contentTypes` คืน `upload.type_not_allowed`
   2. `keys = outboundStorageKeys(uploadId, contentType)`
   3. `orig = storage.inspect(keys.original)` ได้ `upload.not_found` คืนต่อ, `sizeBytes > rule.maxBytes` คืน `upload.too_large`, `sniffContentType(orig.leadingBytes) !== contentType` คืน `upload.content_mismatch`
   4. `prev = storage.inspect(keys.preview)` ไม่พบคืน `upload.not_found`, ไม่ใช่ JPEG คืน `upload.content_mismatch`, เกิน `PREVIEW_MAX_BYTES` คืน `upload.too_large`
6. `{ inserted, message } = messages.insertOutboundIfAbsent({ id: messageId, contactId, direction: "outbound", author: "admin", type, text, mediaUrl: orig.publicUrl, previewUrl: prev.publicUrl, mediaStatus: media ? "ready" : null, deliveryStatus: "pending", retryKey: messageId, createdAt: now, ... })` ถ้า `inserted` เป็น false (คำขอซ้ำที่มาพร้อมกัน) ทำตามข้อ 1 กับแถวที่ได้
7. `contacts.recordOutbound(contactId, { at: now, preview: previewOf(message), by: "admin" })`
8. ถ้า `c.aiEnabled` เป็น true: `contacts.setAiEnabled(contactId, false)` และ `messages.insertEvent` ด้วย `eventCode = ai.turned_off_by_admin` ตาม [ai-reply](../specs/ai-reply.md#เมื่อแอดมินตอบเอง) ไม่มีการหยุดแบบมีเวลา AI กลับมาเมื่อแอดมินเปิดสวิตช์เองเท่านั้น
9. ถ้า `c.needsAdmin` เป็น true: `contacts.clearNeedsAdmin(contactId)` เพราะแอดมินตอบแล้ว
10. `final = deliverOutbound(message, c, access, "auto")` คืน `ok(final)`

HTTP response ถูกส่งหลังข้อ 10 จบ ไม่มีงานหลังตอบ

Test:

- ข้อความตัวอักษร มี reply token ที่ยังใช้ได้ → sent ผ่าน reply, token ถูกใช้
- ไม่มี reply token → sent ผ่าน push พร้อม retryKey เท่ากับ messageId
- เรียกซ้ำด้วย messageId เดิมหลังส่งสำเร็จ → คืนแถวเดิม gateway ไม่ถูกเรียกอีก
- สองคำขอพร้อมกันด้วย messageId เดิม → gateway ถูกเรียกครั้งเดียว
- messageId เดิมแต่ contactId ต่าง → `message.id_conflict`
- messageId เดิม contactId เดิม แต่ข้อความตัวอักษรต่าง หรือชนิดสื่อต่าง → `message.id_conflict`
- ลูกค้าไม่มีอยู่ → `contact.not_found`
- ลูกค้าเลิกติดตาม → `contact.unfollowed` ไม่มีข้อความถูกบันทึก ไม่เรียก LINE
- ยังไม่ตั้ง credential → `line.not_configured` ไม่มีข้อความถูกบันทึก
- ส่งเกินค่าจำกัดความถี่ → `message.rate_limited` พร้อม retryAfterSeconds
- push ได้ `line.unauthorized` → คืน ok ข้อความ failed error นั้น lastLineError ถูกบันทึก
- push ได้ `line.quota_exceeded` → ข้อความ failed error `line.quota_exceeded`
- LINE ตอบว่ารับ retry key นี้แล้ว → sent
- AI ตอบแทนเปิดอยู่ → aiEnabled เป็น false และมีบรรทัด `ai.turned_off_by_admin`
- AI ตอบแทนปิดอยู่แล้ว → ไม่มีบรรทัดเหตุการณ์
- แชทรอแอดมิน → needsAdmin ถูกล้าง
- รูป JPEG ที่อัปโหลดครบทั้งสองไฟล์ → ส่ง image ที่ originalUrl และ previewUrl เป็น URL สาธารณะของ key ที่ได้จาก uploadId
- ยังไม่มีไฟล์ที่ key → `upload.not_found`
- ไฟล์เป็น PNG แต่ประกาศเป็น JPEG → `upload.content_mismatch`
- วิดีโอเกิน `VIDEO_MAX_BYTES` → `upload.too_large`
- contentType `video/quicktime` → `upload.type_not_allowed`
- ไม่มีภาพตัวอย่าง → `upload.not_found`
- ข้อความล่าสุดในรายชื่อเป็นข้อความนี้ผู้ส่ง admin และ unreadCount ไม่เปลี่ยน

## RetryMessage

**หน้าที่:** ส่งข้อความขาออกที่ไม่สำเร็จอีกครั้งด้วย retry key เดิม ตาม [ADR 0010](../adr/0010-reply-token-first-and-idempotency.md)

| | |
| --- | --- |
| Input | `{ contactId: ContactId; messageId: MessageId }` |
| Output | `Message` |
| Port | `MessageRepository`, `ContactRepository`, `SettingsRepository`, `SecretCipher`, `MessagingGateway`, `RateLimitRepository`, `ContentHasher`, `Clock`, `Logger` |
| Error | `message.rate_limited`, `message.not_found`, `message.not_retryable`, `contact.unfollowed`, `line.not_configured`, `line.credentials_unreadable` |

1. `hitRateLimit("send_message", ctx.clientIp ?? "unknown", now)` เกินคืน `message.rate_limited`
2. `m = messages.findById(messageId)` null หรือ `m.contactId !== contactId` คืน `message.not_found`
3. `m.direction !== "outbound"` หรือ `m.deliveryStatus !== "failed"` คืน `message.not_retryable`
4. `c = contacts.findById` null คืน `message.not_found` (ข้อความอ้าง Contact ด้วย foreign key ลูกค้าที่หายไปจึงหมายถึงข้อความหายด้วย) เลิกติดตามคืน `contact.unfollowed` (ข้อความยังเป็น failed)
5. `access = loadLineAccess()` ล้มเหลวคืน error นั้น
6. `messages.markPendingIfFailed(messageId)` เป็น false คืน `message.not_retryable` (มีอีกคำขอ retry อยู่แล้ว)
7. `final = deliverOutbound(m, c, access, "push_only")` ใช้ push เสมอ เพราะ reply ไม่มี retry key และครั้งก่อนอาจไปถึงแล้ว
8. คืน `ok(final)`

ไฟล์สื่อยังอยู่ที่เดิม จึงส่งอีกครั้งได้โดยไม่อัปโหลดใหม่

Test:

- ข้อความ failed → push ด้วย retryKey เดิม สถานะ sent
- LINE ตอบว่ารับ retry key นี้แล้ว → sent และ stub ได้รับข้อความครั้งเดียว
- ข้อความ sent → `message.not_retryable`
- ข้อความ pending → `message.not_retryable`
- ข้อความขาเข้า → `message.not_retryable`
- contactId ไม่ตรงกับข้อความ → `message.not_found`
- สอง retry พร้อมกัน → ครั้งเดียวเรียก LINE อีกครั้งได้ `message.not_retryable`
- push ล้มเหลวอีก → ok สถานะ failed พร้อมรหัสใหม่
- ข้อความของ AI ที่ failed → retry ได้เหมือนกัน
- มี reply token ที่ยังใช้ได้ → ยังใช้ push

## IssueUpload

**หน้าที่:** ออกสิทธิ์อัปโหลดรูปหรือวิดีโอจาก browser ตรงเข้าที่เก็บไฟล์ พร้อมภาพตัวอย่าง ตาม [line-messaging](../specs/line-messaging.md#สื่อขาออก)

| | |
| --- | --- |
| Input | `{ kind: "image" \| "video"; contentType: string; sizeBytes: number; preview: { contentType: "image/jpeg"; sizeBytes: number } }` |
| Output | `{ uploadId: UploadId; expiresAt: Date; original: UploadTarget; preview: UploadTarget }` |
| Port | `FileStorage`, `RateLimitRepository`, `ContentHasher`, `IdGenerator`, `Clock`, `Logger` |
| Error | `upload.rate_limited`, `upload.type_not_allowed`, `upload.too_large`, `storage.unavailable` |

1. `hitRateLimit("upload_ticket", ctx.clientIp ?? "unknown", now)` เกินคืน `upload.rate_limited` (IP ที่ไม่รู้ใช้ subject `"unknown"` ร่วมกัน)
2. `rule = outboundMediaRule(kind)` ถ้า `contentType` ไม่อยู่ใน rule คืน `upload.type_not_allowed` และ log `upload.ticket.rejected`
3. `sizeBytes` ไม่เป็นจำนวนเต็มใน `1..rule.maxBytes` หรือ `preview.sizeBytes` ไม่เป็นจำนวนเต็มใน `1..PREVIEW_MAX_BYTES` คืน `upload.too_large` (รวมค่าที่ไม่ใช่จำนวนเต็ม เช่น `1.5`)
4. `uploadId = ids.randomToken()`, `keys = outboundStorageKeys(uploadId, contentType)`, `expiresAt = now + UPLOAD_TICKET_TTL_MS`
5. `storage.issueUpload` สำหรับ original (`contentType`, `rule.maxBytes`) และ preview (`image/jpeg`, `PREVIEW_MAX_BYTES`) ตัวใดล้มเหลวคืน `storage.unavailable`
6. log `upload.ticket.issued` คืน ticket

Test:

- รูป JPEG 2 MB → ได้ target สองตัวที่ key ใช้ uploadId เดียวกัน, original ลงท้าย `.jpg`, preview ลงท้าย `.jpg`
- วิดีโอ MP4 → original ลงท้าย `.mp4`
- `video/quicktime` → `upload.type_not_allowed`
- `image/heic` → `upload.type_not_allowed` (browser แปลงเป็น JPEG ก่อนขอสิทธิ์ ตาม [line-messaging](../specs/line-messaging.md#สื่อขาออก))
- รูปใหญ่กว่า `IMAGE_MAX_BYTES` หนึ่งไบต์ → `upload.too_large`
- ภาพตัวอย่างใหญ่กว่า `PREVIEW_MAX_BYTES` → `upload.too_large`
- ขนาด 0 → `upload.too_large`
- เกินค่าจำกัดความถี่ → `upload.rate_limited`
- uploadId สองครั้งไม่ซ้ำกัน และมาจาก `randomToken` ไม่ใช่ UUID
- `expiresAt` เท่ากับเวลาปลอมบวก `UPLOAD_TICKET_TTL_MS`

## DiscardUpload

**หน้าที่:** ลบไฟล์ที่อัปโหลดแล้วเมื่อแอดมินกดยกเลิกก่อนส่ง

| | |
| --- | --- |
| Input | `{ uploadId: UploadId }` |
| Output | `void` |
| Port | `FileStorage`, `Logger` |
| Error | `storage.unavailable` |

1. ลบทุก key ที่เป็นไปได้ของ uploadId: `original.jpg`, `original.png`, `original.mp4`, `preview.jpg` (`delete` เป็น idempotent)
2. ตัวใดได้ `storage.unavailable` คืน error นั้น
3. log `upload.file.discarded`

หน้าเว็บเรียกเฉพาะก่อนส่ง ถ้าเรียกหลังส่ง ไฟล์ของข้อความที่ส่งแล้วจะหาย ซึ่งยอมรับได้เพราะต้องมี cookie และ uploadId ที่เดาไม่ได้

Test: ลบไฟล์ที่มี → ไม่มีไฟล์เหลือ, ลบ uploadId ที่ไม่มีไฟล์ → ok, ที่เก็บไฟล์ล่ม → `storage.unavailable`

## WriteLocalUpload

**หน้าที่:** รับไฟล์ที่ browser PUT เข้ามาเมื่อใช้ adapter ดิสก์ในเครื่อง (Docker และ CI) composition ลงทะเบียนเฉพาะเมื่อ `FILE_STORAGE=local`

| | |
| --- | --- |
| Input | `{ key: string; exp: string; sig: string; contentType: string; body: ReadableStream<Uint8Array> }` |
| Output | `{ sizeBytes: number }` |
| Port | `FileStorage`, `Clock`, `Logger` |
| Error | `upload.signature_invalid`, `upload.expired`, `upload.content_mismatch`, `media.too_large`, `storage.unavailable` |

1. `key` ไม่ตรง `^outbound/[A-Za-z0-9_-]{22}/(original\.(jpg|png|mp4)|preview\.jpg)$` คืน `upload.signature_invalid`
2. `storage.acceptSignedPut(key, { exp, sig }, contentType, body, now)` คืนผลตามนั้น ล้มเหลวให้ log `upload.local_put.rejected`

Test: ลายเซ็นถูก → เขียนไฟล์, ลายเซ็นผิด → `upload.signature_invalid`, หมดเวลา → `upload.expired`, Content-Type ต่างจากที่เซ็น → `upload.content_mismatch`, เกินขนาด → `media.too_large` และไม่มีไฟล์ค้าง, key นอกรูปแบบ → `upload.signature_invalid`

## ServeLocalMedia

**หน้าที่:** ให้ไฟล์จากดิสก์ในเครื่องเป็น URL สาธารณะสำหรับหน้าเว็บและ stub ของ LINE ลงทะเบียนเฉพาะเมื่อ `FILE_STORAGE=local`

| | |
| --- | --- |
| Input | `{ key: string }` |
| Output | `{ stream; contentType; sizeBytes }` |
| Port | `FileStorage` |
| Error | `media.not_found` |

1. `key` ไม่ตรง `^(inbound|outbound)/[A-Za-z0-9_-]{22}/(original\.(jpg|png|mp4)|preview\.jpg)$` คืน `media.not_found`
2. `storage.read(key)` คืนผลตามนั้น (`storage.unavailable` ถูกแปลงเป็น `media.not_found`)

Test: ไฟล์มีอยู่ → stream พร้อมชนิด, key มี `..` → `media.not_found`, ไม่มีไฟล์ → `media.not_found`

## ShowTypingToCustomer

**หน้าที่:** ขอให้ LINE แสดง loading ในแอปของลูกค้าเมื่อแอดมินเริ่มพิมพ์ ตาม [webchat-inbox](../specs/webchat-inbox.md#ช่องตอบ) ข้อ 9

| | |
| --- | --- |
| Input | `{ contactId: ContactId }` |
| Output | `{ shown: boolean }` |
| Port | `ContactRepository`, `SettingsRepository`, `SecretCipher`, `MessagingGateway`, `RateLimitRepository`, `ContentHasher`, `Clock`, `Logger` |
| Error | `contact.not_found` |

1. `c = contacts.findById` null คืน `contact.not_found`
2. เลิกติดตาม คืน `ok({ shown: false })`
3. `hitRateLimit("typing", contactId, now)` เกิน คืน `ok({ shown: false })` (หนึ่งครั้งต่อหน้าต่างต่อลูกค้า ไม่ใช่ต่อ IP)
4. `loadLineAccess()` ล้มเหลว คืน `ok({ shown: false })`
5. `gateway.showLoading(access, c.lineUserId, LINE_LOADING_SECONDS)` ล้มเหลว log `line.loading.failed` คืน `ok({ shown: false })`
6. คืน `ok({ shown: true })`

ทุกความล้มเหลวหลังข้อ 1 ไม่เป็น error ตาม spec

Test:

- ลูกค้าติดตามอยู่ → showLoading ถูกเรียก, shown true
- เรียกสองครั้งภายในหน้าต่างเดียวของ `RATE_LIMIT_TYPING` → ครั้งที่สอง shown false ไม่เรียก LINE
- เลื่อนเวลาปลอมข้ามหน้าต่าง → เรียกได้อีก
- ลูกค้าเลิกติดตาม → shown false ไม่เรียก LINE
- LINE ล้มเหลว → shown false ไม่เป็น error
- ไม่มีลูกค้า → `contact.not_found`

## SetContactAi

**หน้าที่:** เปิดหรือปิด AI ตอบแทนของลูกค้าหนึ่งคน

| | |
| --- | --- |
| Input | `{ contactId: ContactId; aiEnabled: boolean }` |
| Output | `Contact` |
| Port | `ContactRepository`, `SettingsRepository` |
| Error | `contact.not_found`, `ai.disabled_globally` |

1. `c = contacts.findById` null คืน `contact.not_found`
2. `aiEnabled` เป็น true และ `settings.get().aiEnabled` เป็น false คืน `ai.disabled_globally` (การปิดทำได้เสมอ)
3. `contacts.setAiEnabled(contactId, aiEnabled)`
4. ถ้าเปิด และแชทรอแอดมินอยู่: `contacts.clearNeedsAdmin` เพราะแอดมินส่งแชทคืนให้ AI
5. คืนแถวหลังแก้

การเปิดไม่ทำให้ AI ตอบข้อความที่ค้างอยู่ AI ตอบเมื่อมีข้อความใหม่เข้ามา

Test: เปิดเมื่อ kill switch เปิด → aiEnabled true, เปิดเมื่อ kill switch ปิด → `ai.disabled_globally` ค่าไม่เปลี่ยน, ปิดเมื่อ kill switch ปิด → สำเร็จ, เปิดขณะรอแอดมิน → needsAdmin ถูกล้าง, ไม่มีลูกค้า → `contact.not_found`

## MarkContactRead

| | |
| --- | --- |
| Input | `{ contactId: ContactId }` |
| Output | `Contact` |
| Port | `ContactRepository` |
| Error | `contact.not_found` |

1. ไม่พบคืน `contact.not_found`
2. `contacts.markRead(contactId)` คืนแถวหลังแก้

Test: unreadCount 3 → 0 และ updatedSeq เพิ่ม, ไม่มีลูกค้า → `contact.not_found`

## ListContacts

**หน้าที่:** รายชื่อลูกค้าสำหรับหน้าแชท ทั้งหน้าแรก หน้าถัดไป และรอบ polling ตาม [api-contract](api-contract.md#protocol-ของ-polling) และคืนสภาพงาน AI ที่ค้าง

| | |
| --- | --- |
| Input | `{ mode: "page"; filter: ContactFilter; search: string \| null; before: ContactListCursor \| null } \| { mode: "changes"; afterUpdatedSeq: Seq }` |
| Output | `{ contacts: Contact[]; next: ContactListCursor \| null; hasMore: boolean; highWater: Seq; counts: { all; unread; needsAdmin }; lineConfigured: boolean }` |
| Port | `ContactRepository`, `MessageRepository`, `SettingsRepository`, `IdGenerator`, `Clock`, `Logger` |
| Error | ไม่มี |

1. `ids = contacts.recoverStuckAiStates(now - aiStuckAfterMs)` ทุก id ใน `ids`: `messages.insertEvent` ด้วย `eventCode = handoff.ai_timeout` ถ้ามีอย่างน้อยหนึ่ง log `ai.reply.stuck_recovered` พร้อม count นี่คือการเขียนแบบมีเงื่อนไขครั้งเดียวของ use case นี้
2. `mode = page`: อ่าน `highWater = contacts.maxUpdatedSeq()` **ก่อน** `contacts.list({ filter, search, before, limit: CONTACT_PAGE_LIMIT })` เพื่อให้แถวที่แก้ระหว่างนั้นมาในรอบ polling ถัดไป `hasMore = next !== null`
3. `mode = changes`: `contacts.listChangedAfter(afterUpdatedSeq, POLL_PAGE_LIMIT)` และ `highWater` คือ updatedSeq สูงสุดในผล หรือ `afterUpdatedSeq` เมื่อว่าง
4. `counts = contacts.countByFilter()`, `lineConfigured = settings.get().lineConfigured`

Use case นี้แก้ข้อมูลในข้อ 1 เพราะ [ai-reply](../specs/ai-reply.md#งานที่ค้าง) กำหนดให้รอบ polling ของรายชื่อเป็นผู้คืนสภาพ

Test: งานที่ค้างเกินเวลา → แชทรอแอดมินเหตุผล `ai_timeout`, aiState idle และมีบรรทัด `handoff.ai_timeout` หนึ่งบรรทัด, งานที่ยังไม่เกินเวลา → ไม่ถูกแตะ, ตัวกรอง unread และ needs_admin, ค้นหาไม่สนตัวพิมพ์, การแบ่งหน้าด้วย cursor ไม่ข้ามหรือซ้ำแถวที่ sortAt เท่ากัน, โหมด changes คืนเฉพาะแถวที่ updatedSeq มากกว่า cursor, highWater ของหน้าแรกอ่านก่อน list

## GetContact

| | |
| --- | --- |
| Input | `{ contactId: ContactId }` |
| Output | `{ contact: Contact; stats: { messageCount: number; aiMessageCount: number } }` |
| Port | `ContactRepository`, `MessageRepository` |
| Error | `contact.not_found` |

1. `contacts.findById` null คืน `contact.not_found`
2. `{ total, byAi } = messages.countForContact(contactId)` คืน `{ contact, stats: { messageCount: total, aiMessageCount: byAi } }`

Test: มีลูกค้า → stats ไม่นับบรรทัดเหตุการณ์, ไม่มี → `contact.not_found`

## GetMessages

| | |
| --- | --- |
| Input | `{ contactId: ContactId; mode: { kind: "latest" } \| { kind: "before"; beforeSeq: Seq } \| { kind: "changes"; afterUpdatedSeq: Seq } }` |
| Output | `{ messages: Message[]; hasOlder: boolean \| null; hasMore: boolean; highWater: Seq }` |
| Port | `ContactRepository`, `MessageRepository` |
| Error | `contact.not_found` |

1. ไม่พบลูกค้าคืน `contact.not_found`
2. `latest`: อ่าน `highWater = messages.maxUpdatedSeq(contactId)` ก่อน แล้ว `listLatest(contactId, MESSAGE_PAGE_LIMIT)` `hasMore` เป็น false
3. `before`: `listBefore(contactId, beforeSeq, MESSAGE_PAGE_LIMIT)` และ `highWater` เป็น `0n` (หน้าเว็บไม่ใช้ค่านี้เลื่อน cursor)
4. `changes`: `listChangedAfter(contactId, afterUpdatedSeq, POLL_PAGE_LIMIT)` `hasOlder` เป็น null และ `highWater` เหมือน `ListContacts`

Test: latest คืน 50 แถวล่าสุดเรียงเก่าไปใหม่และ hasOlder ถูก, before ไม่รวม beforeSeq, changes คืนข้อความที่สถานะเปลี่ยนแม้ seq ต่ำกว่า cursor, ลูกค้าคนอื่นไม่ปน

## GetSettings

| | |
| --- | --- |
| Input | `{}` |
| Output | `{ settings: Settings; webhookUrl: string; todayCost: NanoUsd; guardBlockedToday: number; pollIntervalMs: number }` |
| Port | `SettingsRepository`, `UsageRepository`, `Clock` |
| Error | ไม่มี |

1. `webhookUrl = config.appBaseUrl` ตัด `/` ท้าย แล้วต่อ `/api/line/webhook`
2. `range = bangkokDayRange(now)`, `todayCost = usage.sumCost(range)`, `guardBlockedToday = usage.countSafetyOutcomes(range).guardBlocked` (แถว AiUsage kind guard outcome blocked ของวันนี้ตามเวลาไทย ซึ่ง DTO ส่งเป็น `guard.blockedToday`), `pollIntervalMs = config.pollIntervalMs`

`line.status` ของ DTO คำนวณใน route จาก `lineConfigured` และ `lastLineError` ตาม [api-contract](api-contract.md#dto-ร่วม)

Test: ไม่มีแถว → ได้ค่าเริ่มต้นตาม [project-setup](project-setup.md#101-แกนกลาง) (kill switch ปิด, ขอบเขตหัวข้อปิด, หัวข้อว่าง, ข้อความปฏิเสธเป็น `DEFAULT_GUARD_REFUSAL_TEXT`), webhookUrl ไม่มี `//`, todayCost ไม่รวมเมื่อวานตามเวลาไทย, guardBlockedToday นับเฉพาะ kind guard outcome blocked ของวันนี้ตามเวลาไทย (แถว ok, failed และ kind reply outcome blocked ไม่นับ), pollIntervalMs เท่ากับ config

## UpdateSettings

| | |
| --- | --- |
| Input | `Partial<{ aiEnabled: boolean; aiModel: AiModelId; aiDailyBudget: NanoUsd; aiPoliteParticle: PoliteParticle; aiInstructions: string; guardEnabled: boolean; guardTopics: string[]; guardRefusalText: string }>` (route ตรวจรูปแบบแล้วตาม [api-contract](api-contract.md#patch-apisettings) และต้องมีอย่างน้อยหนึ่ง field) |
| Output | `Settings` |
| Port | `SettingsRepository`, `Logger` |
| Error | `settings.guard_topics_required` |

1. ถ้า patch มี `guardTopics`: `n = normalizeGuardTopics(patch.guardTopics)` ใช้ `n.topics` แทนค่าที่ส่งมา (`issue` ไม่เป็น null ไม่เกิดเพราะ route ตรวจแล้ว ถ้าเกิดเป็น bug ให้ throw)
2. ถ้า patch มี `guardEnabled` หรือ `guardTopics`: `current = settings.get()`, `enabled = patch.guardEnabled ?? current.guardEnabled`, `topics = n.topics ?? current.guardTopics` ถ้า `enabled` เป็น true และ `topics` ว่าง คืน `settings.guard_topics_required` ไม่บันทึก field ใดเลย
3. `guardRefusalText` ตัดช่องว่างหัวท้ายแล้ว (route ตรวจความยาว)
4. `settings.update(patch)` 5. log `settings.values.updated` 6. คืนค่าใหม่

การปิด kill switch มีผลกับงานที่กำลังประมวลผลผ่านการตรวจซ้ำใน `GenerateAiReply` ข้อ 9 จึงไม่ต้องทำอะไรเพิ่มที่นี่

Test: แก้ field เดียวไม่กระทบ field อื่น, ปิด kill switch แล้วงานที่รอโมเดลอยู่คืน cancelled (test ร่วมกับ GenerateAiReply), เปิดขอบเขตหัวข้อขณะรายการว่าง → `settings.guard_topics_required` และไม่มีการเขียน, เปิดพร้อมส่งสองหัวข้อใน patch เดียว → สำเร็จ, เปิดอยู่แล้วส่ง `guardTopics: []` → `settings.guard_topics_required`, ปิดแล้วส่ง `guardTopics: []` → สำเร็จ, หัวข้อมีช่องว่างหัวท้าย → บันทึกแบบตัดแล้ว, แก้ `guardRefusalText` อย่างเดียวไม่กระทบหัวข้อ

## TestTopicGuard

**หน้าที่:** ทดลองการคัดกรองขอบเขตหัวข้อกับข้อความที่แอดมินพิมพ์ในหน้าตั้งค่า ด้วยหัวข้อที่บันทึกไว้ ตาม [topic-guard](../specs/topic-guard.md#การทดลองในหน้าตั้งค่า)

| | |
| --- | --- |
| Input | `{ text: string }` (route ตรวจแล้วว่ายาว 1 ถึง `GUARD_TEST_MAX_CHARS` ตัวหลังตัดช่องว่าง) |
| Output | `{ allowed: boolean; matchedTopic: string \| null; cost: NanoUsd }` |
| Port | `RateLimitRepository`, `ContentHasher`, `SettingsRepository`, `UsageRepository`, `TopicGuard`, `IdGenerator`, `Clock`, `Logger` |
| Error | `settings.guard_rate_limited`, `ai.disabled_globally`, `settings.guard_topics_required`, `ai.budget_exhausted`, `ai.unavailable`, `ai.rate_limited`, `ai.auth_failed`, `ai.bad_request`, `ai.refused`, `ai.truncated`, `ai.invalid_output` |

1. `hitRateLimit("guard_test", ctx.clientIp ?? "unknown", now)` เกินคืน `settings.guard_rate_limited` พร้อม `retryAfterSeconds`
2. `s = settings.get()` ถ้า `s.aiEnabled` เป็น false คืน `ai.disabled_globally`
3. `s.guardTopics` ว่าง คืน `settings.guard_topics_required` (ใช้หัวข้อที่บันทึกไว้ ไม่ใช่ค่าที่ยังไม่บันทึกในหน้าจอ ทดลองได้แม้ `guardEnabled` เป็น false)
4. `usage.sumCost(bangkokDayRange(now)) >= s.aiDailyBudget` คืน `ai.budget_exhausted`
5. `g = topicGuard.classify({ topics: s.guardTopics, message: text, context: [], model: GUARD_MODEL, maxTokens: GUARD_MAX_TOKENS, timeoutMs: GUARD_TIMEOUT_MS })` error: `settings.recordAiError`, log `guard.failed` คืน error นั้น
6. `cost = computeCost(...)`, `v = guardVerdictOf(g.value, s.guardTopics)` แล้ว `usage.insert({ id: ids.usageId(), kind: "guard", contactId: null, messageId: null, documentId: null, ..., outcome: v.verdict === "failed" ? "failed" : v.verdict === "blocked" ? "blocked" : "ok", error: v.error })` เสมอ เพื่อให้ต้นทุนของการทดลองเห็นในค่าใช้จ่าย AI
7. `v.verdict = failed`: `settings.recordAiError({ code: v.error, at: now })` เหมือน error ของ port ในข้อ 5 เพื่อให้หน้าสถานะระบบแสดง แล้ว log `guard.failed` คืน `v.error` (`ai.refused`, `ai.truncated` หรือ `ai.invalid_output`)
8. log `guard.checked` คืน `{ allowed: v.verdict === "allowed", matchedTopic: v.matchedTopic, cost }`

ไม่ส่งอะไรถึงลูกค้าและไม่มีบรรทัดเหตุการณ์ แถว AiUsage ของการทดลองที่ถูกกันเป็น kind guard outcome blocked จึงถูกนับใน `guardBlockedToday` ด้วย ตาม [topic-guard](../specs/topic-guard.md#การทดลองในหน้าตั้งค่า)

Test: kill switch ปิด → `ai.disabled_globally` ไม่เรียก `TopicGuard`, ไม่มีหัวข้อที่บันทึก → `settings.guard_topics_required`, งบเต็ม → `ai.budget_exhausted` ไม่เรียก `TopicGuard`, ขอบเขตหัวข้อปิดแต่มีหัวข้อ → ทดลองได้, ผ่าน → `allowed: true` พร้อม `matchedTopic` และ AiUsage kind guard outcome ok ที่ contactId null, ถูกกัน → `allowed: false` และ AiUsage outcome blocked, `matchedTopic` ไม่อยู่ในรายการ → null, คำขอใช้ `GUARD_MODEL` และ `context` ว่าง, port คืน `ai.unavailable` → error นั้นและไม่มี AiUsage, `stop = refused`, ถูกตัด หรือไม่ตรง schema → `ai.refused`, `ai.truncated` หรือ `ai.invalid_output` พร้อม AiUsage outcome failed และ lastAiError ถูกบันทึก, ถูกกัน → lastAiError ไม่ถูกบันทึก, เกิน `RATE_LIMIT_GUARD_TEST` ครั้งต่อหน้าต่างจาก IP เดียว → `settings.guard_rate_limited`, `RATE_LIMIT_SCALE` เป็น 10 → ค่าจำกัดคูณ 10, cost ที่คืนเท่ากับ cost ของแถว AiUsage

## GetGuardrailStats

**หน้าที่:** ตัวเลขของวันนี้ (เวลาไทย) สำหรับส่วน Guardrails ในหน้าตั้งค่า อ่านอย่างเดียว ทุกค่ามาจากข้อมูลที่ระบบเก็บอยู่แล้ว ([ai-guardrails](../security/ai-guardrails.md))

| | |
| --- | --- |
| Input | `{}` |
| Output | `GuardrailStats` |
| Port | `SettingsRepository`, `UsageRepository`, `MessageRepository`, `Clock` |
| Error | ไม่มี |

```ts
export interface GuardrailStats {
  aiEnabled: boolean;             // kill switch
  guardEnabled: boolean;
  guardBlocked: number;           // AiUsage kind guard outcome blocked
  outputRejected: number;         // AiUsage ทุก kind ที่ error เป็น ai.invalid_output หรือ ai.refused
  handoffs: { notInKnowledge: number; needsHuman: number; failedOrTimeout: number; other: number };
  budgetReached: number;          // บรรทัด handoff.budget_reached
  nonText: number;                // บรรทัด handoff.customer_sent_image + _video + _non_text
}
```

1. `range = bangkokDayRange(now)`, `s = settings.get()`
2. `{ guardBlocked, outputRejected } = usage.countSafetyOutcomes(range)`
3. `e = messages.countEventsByCode(range)` (ค่าที่ไม่มีเป็น 0): `notInKnowledge = e["handoff.ai_not_in_knowledge"]`, `needsHuman = e["handoff.ai_needs_human_action"]`, `failedOrTimeout = e["handoff.ai_failed"] + e["handoff.ai_timeout"]`, `other = e["handoff.ai_unsafe_or_offtopic"] + e["handoff.ai_other"]`, `budgetReached = e["handoff.budget_reached"]`, `nonText = e["handoff.customer_sent_image"] + e["handoff.customer_sent_video"] + e["handoff.customer_sent_non_text"]`
4. คืนพร้อม `aiEnabled = s.aiEnabled`, `guardEnabled = s.guardEnabled`

ตัวเลขจากบรรทัดเหตุการณ์นับครั้งที่แชทขึ้นรอแอดมิน ไม่ใช่จำนวนข้อความ เพราะ `raiseHandoff` ไม่เพิ่มบรรทัดเมื่อเหตุผลเดิมซ้ำ หน้าจอจึงใช้คำว่า "ครั้ง" ไม่ใช่ "ข้อความ" ยกเว้น `guardBlocked` ซึ่งมีหนึ่งแถวต่อข้อความ

Test: ไม่มีข้อมูล → ทุกตัวเลขเป็น 0, แถวของเมื่อวานตามเวลาไทยไม่นับ (เวลาปลอม 00:01 ขณะ CI เป็น UTC), `handoff.ai_failed` หนึ่งและ `handoff.ai_timeout` หนึ่ง → failedOrTimeout 2, AiUsage error `ai.refused` ของ kind reply และ `ai.invalid_output` ของ kind guard → outputRejected 2, AiUsage outcome blocked ของ kind reply ไม่นับใน guardBlocked, aiEnabled และ guardEnabled ตรงกับ Settings

## SetLineCredentials

**หน้าที่:** ตรวจ token กับ LINE แล้วบันทึก credential แบบเข้ารหัส ตาม [admin-backoffice](../specs/admin-backoffice.md#ส่วน-line-official-account)

| | |
| --- | --- |
| Input | `{ channelSecret: string; channelAccessToken: LineAccessToken }` |
| Output | `{ botName: string; basicId: string }` |
| Port | `MessagingGateway`, `SecretCipher`, `SettingsRepository`, `Clock`, `Logger` |
| Error | `line.credentials_invalid`, `line.unavailable` |

1. `bot = gateway.getBotInfo(channelAccessToken)` ล้มเหลว: log `line.credentials.rejected` คืน error นั้น ไม่บันทึก
2. `settings.saveLineCredentials({ channelSecretEnc: cipher.encrypt(secret), channelAccessTokenEnc: cipher.encrypt(token) }, bot)`
3. `settings.recordLineError(null)`, log `line.credentials.saved`
4. คืน `bot`

ตรวจ Channel secret กับ LINE ไม่ได้ ระบบจึงรู้ว่าผิดเมื่อ webhook แรกไม่ผ่าน signature ซึ่งแสดงในสถานะระบบผ่าน `lastWebhookAt` (ต้องยืนยันว่า LINE ไม่มี API ตรวจ secret)

Test: token ถูก → บันทึกแบบเข้ารหัส ค่าที่เก็บไม่เท่ากับค่าจริง, token ผิด → `line.credentials_invalid` ไม่มีการเขียน, LINE ล่ม → `line.unavailable`, บันทึกแล้ว lastLineError ถูกล้าง, log ไม่มีค่า token

## TestLineConnection

| | |
| --- | --- |
| Input | `{}` |
| Output | `{ botName: string; basicId: string }` |
| Port | `SettingsRepository`, `SecretCipher`, `MessagingGateway`, `Clock`, `Logger` |
| Error | `line.not_configured`, `line.credentials_unreadable`, `line.credentials_invalid`, `line.unavailable` |

1. `access = loadLineAccess()` ล้มเหลวคืน error นั้น
2. `bot = gateway.getBotInfo(access.channelAccessToken)` ล้มเหลว: `settings.recordLineError({ code, at: now })`, log `line.connection.tested` (outcome failed) คืน error
3. `settings.updateLineBotInfo(bot)`, `settings.recordLineError(null)`, log (outcome ok) คืน `bot`

Test: ผ่าน → ชื่อบอทถูกอัปเดต lastLineError ถูกล้าง, token ถูกเพิกถอน → `line.credentials_invalid` และ lastLineError ถูกบันทึก, ยังไม่ตั้งค่า → `line.not_configured`

## IngestDocument

**หน้าที่:** รับ PDF ตรวจ สร้างรายการ แล้วแปลงเป็นข้อความหลังตอบ ตาม [knowledge-base](../specs/knowledge-base.md#อัปโหลด) ใช้ทั้งการอัปโหลดใหม่และปุ่ม "ลองใหม่"

| | |
| --- | --- |
| Input | `{ fileName: string; bytes: Uint8Array; retryOf: DocumentId \| null }` |
| Output | `{ document: KbDocument; followUp: { documentId: DocumentId; bytes: Uint8Array; model: AiModelId } }` |
| Port | ช่วง A: `RateLimitRepository`, `ContentHasher`, `KnowledgeRepository`, `SettingsRepository`, `UsageRepository`, `IdGenerator`, `Clock`, `Logger` ช่วง B: `DocumentExtractor`, `KnowledgeRepository`, `UsageRepository`, `SettingsRepository`, `IdGenerator`, `Clock`, `Logger` |
| Error | `knowledge.rate_limited`, `knowledge.file_too_large`, `knowledge.not_pdf`, `knowledge.duplicate`, `knowledge.not_found`, `knowledge.not_retryable`, `ai.budget_exhausted` |

### ช่วง A: ใน request

1. `hitRateLimit("pdf_ingest", ctx.clientIp ?? "unknown", now)` เกินคืน `knowledge.rate_limited` (IP ที่ไม่รู้ใช้ subject `"unknown"` ร่วมกัน)
2. `bytes.length > PDF_MAX_BYTES` คืน `knowledge.file_too_large`
3. `sniffContentType(bytes.subarray(0, 16)) !== "application/pdf"` คืน `knowledge.not_pdf`
4. `sha = hasher.sha256(bytes)`, `existing = knowledge.findBySha256(sha)`
5. ถ้า `retryOf` ไม่เป็น null: `target = knowledge.findById(retryOf)` null คืน `knowledge.not_found`, `target.status !== "failed"` คืน `knowledge.not_retryable`, `existing` มีและ `existing.id !== retryOf` คืน `knowledge.duplicate`
6. ถ้า `retryOf` เป็น null และ `existing` มี: `existing.status = failed` ให้ถือเป็นการลองใหม่ของแถวนั้น (`retryOf = existing.id`) ไม่เช่นนั้นคืน `knowledge.duplicate`
7. `s = settings.get()`, `usage.sumCost(bangkokDayRange(now)) >= s.aiDailyBudget` คืน `ai.budget_exhausted` (งบนับรวมการอ่านไฟล์ตาม [usage-cost](../specs/usage-cost.md#งบต่อวัน)) ไม่ตรวจ kill switch เพราะ kill switch หยุดการตอบลูกค้า ไม่ใช่การจัดการคลัง
8. `doc = retryOf ? knowledge.restartProcessing(retryOf, ...) : knowledge.create({ id: ids.documentId(), ... })` ส่ง `knowledge.duplicate` ต่อถ้าชนจากคำขอพร้อมกัน `restartProcessing` เป็น compare-and-set บน `status = failed` การลองใหม่สองครั้งพร้อมกันจึงได้การแปลงครั้งเดียว ครั้งที่แพ้ได้ `knowledge.not_retryable` ถ้าคำขอไม่ได้ส่ง `retryOf` มาเอง (ข้อ 6) ครั้งที่แพ้ได้ `knowledge.duplicate` เพราะพบแถวที่ processing แล้ว เหมือนกรณีที่ไม่ได้มาพร้อมกัน
9. log `knowledge.ingest.started` คืน `{ document: doc, followUp: { documentId: doc.id, bytes, model: s.aiModel } }`

Route ตอบ 202 แล้วส่ง `followUp` เข้า `runJob` → ช่วง B ไฟล์อยู่ในหน่วยความจำของ function เดียวกันจนช่วง B จบ ไม่ถูกเก็บลงที่ใด

### ช่วง B: `extractDocument(followUp)` หลังตอบ

ช่วง B คือ export `makeExtractDocument(deps, config)` ซึ่งคืนฟังก์ชัน `(followUp) => Promise<void>` แยกจาก `makeIngestDocument` และใช้ port ของช่วง B ตามตารางข้างบน

ทั้งช่วงอยู่ใน `try/catch` ถ้า throw: `knowledge.markFailed(id, { code: "internal.unexpected", ... })` แล้ว throw ต่อ

1. `res = extractor.extract({ model, pdf: bytes, maxTokens: AI_EXTRACT_MAX_TOKENS })`
2. error: `knowledge.markFailed(id, { code: "knowledge.extract_failed" })`, `settings.recordAiError({ code, at: now })`, log `knowledge.ingest.failed` จบ
3. `r = res.value` บันทึก `usage.insert({ id: ids.usageId(), kind: "ingest", documentId: id, model: r.servedModel, cost: computeCost(...), outcome, error })` เสมอ (รวมกรณีที่ไฟล์ถูกปฏิเสธในข้อถัดไป) โดย refused → (`refused`, `ai.refused`), truncated → (`failed`, `ai.truncated`), นอกนั้น (`ok`, null) ถ้า `priceKnown` เป็น false log `ai.price_unknown_model`
4. refused: `markFailed(knowledge.extract_refused)` จบ
5. truncated: `markFailed(knowledge.extract_failed)` จบ
6. text null (ว่างหรือ `EMPTY_DOCUMENT`): `markFailed(knowledge.extract_empty)` จบ
7. `r.pageCount` ไม่เป็น null และมากกว่า `PDF_MAX_PAGES`: `markFailed(knowledge.too_many_pages, pageCount)` จบ (นับหน้าได้หลังแปลงเท่านั้น ดูหมายเหตุ)
8. `tokens = extractor.countTokens(model, text)` (endpoint นับ token ของ API) error: `markFailed(knowledge.extract_failed)` จบ
9. `overflow = knowledgeOverflow(knowledge.sumReadyTokens(), tokens)` มากกว่า 0: `markFailed(knowledge.capacity_exceeded, { tokenCount: tokens })` จบ หน้าเว็บคำนวณจำนวนที่เกินจาก tokenCount กับยอดที่ใช้
10. `knowledge.markReady(id, { text, pageCount, tokenCount: tokens })` ได้ false (ถูกลบระหว่างแปลง) log แล้วจบ ไม่เช่นนั้น log `knowledge.ingest.succeeded`

หมายเหตุ: จำนวนหน้ามาจากตัวคั่น `=== หน้า N ===` ในผลของการแปลง เพราะระบบไม่มีไลบรารีอ่าน PDF ไฟล์ที่เกิน `PDF_MAX_PAGES` จึงถูกปฏิเสธหลังแปลง และค่าแปลงครั้งนั้นยังถูกบันทึกใน AiUsage ตาม [knowledge-base](../specs/knowledge-base.md#อัปโหลด) สองไฟล์ที่แปลงพร้อมกันอาจรวมกันเกินเพดานของคลังเล็กน้อย

Test:

- PDF 1 MB ใหม่ → แถว processing, followUp มี bytes และโมเดลที่ตั้งไว้
- ไฟล์ขนาด `PDF_MAX_BYTES` + 1 ไบต์ → `knowledge.file_too_large`
- ไฟล์ PNG ที่ตั้งชื่อ `.pdf` → `knowledge.not_pdf`
- ไฟล์เดิมที่ ready → `knowledge.duplicate`
- ไฟล์เดิมที่ failed อัปโหลดใหม่ → ใช้แถวเดิม สถานะ processing
- retryOf ของแถวที่ ready → `knowledge.not_retryable`
- retryOf ด้วยไฟล์ที่ hash ชนกับแถวอื่น → `knowledge.duplicate`
- retryOf ที่ไม่มี → `knowledge.not_found`
- retryOf สองครั้งพร้อมกันของแถว failed เดียวกัน → ครั้งเดียวสำเร็จ อีกครั้ง `knowledge.not_retryable` และแปลงครั้งเดียว
- อัปโหลดไฟล์เดิมที่ failed สองครั้งพร้อมกันโดยไม่มี retryOf → ครั้งเดียวสำเร็จ อีกครั้ง `knowledge.duplicate`
- งบวันนี้เต็ม → `ai.budget_exhausted` ไม่มีแถวใหม่
- kill switch ปิด → ยังอัปโหลดได้
- เกินค่าจำกัดความถี่ → `knowledge.rate_limited`
- ช่วง B: แปลงสำเร็จ 3 หน้า 1,200 token → ready, AiUsage kind ingest outcome ok
- ช่วง B: ตัวคั่นหน้า `PDF_MAX_PAGES` + 1 ตัว → failed `knowledge.too_many_pages` และ AiUsage ถูกบันทึกพร้อมต้นทุน
- ช่วง B: ผลเป็น `EMPTY_DOCUMENT` → failed `knowledge.extract_empty` และ AiUsage ถูกบันทึก
- ช่วง B: คลังมี `KNOWLEDGE_CAPACITY_TOKENS` − 500 token เพิ่ม 600 → failed `knowledge.capacity_exceeded` tokenCount 600
- ช่วง B: พอดี `KNOWLEDGE_CAPACITY_TOKENS` → ready
- ช่วง B: โมเดลปฏิเสธ → failed `knowledge.extract_refused` AiUsage outcome refused
- ช่วง B: ถูกตัด → failed `knowledge.extract_failed` AiUsage error `ai.truncated`
- ช่วง B: API ล่ม → failed `knowledge.extract_failed` ไม่มี AiUsage lastAiError ถูกบันทึก
- ช่วง B: แถวถูกลบระหว่างแปลง → ไม่ error
- ช่วง B: extractor throw → แถว failed `internal.unexpected`

## DeleteDocument

| | |
| --- | --- |
| Input | `{ documentId: DocumentId }` |
| Output | `void` |
| Port | `KnowledgeRepository`, `Logger` |
| Error | `knowledge.not_found` |

1. `knowledge.delete(id)` false คืน `knowledge.not_found` 2. log `knowledge.document.deleted`

แถว AiUsage ของการแปลงยังอยู่ เพื่อให้ค่าใช้จ่ายรวมถูกต้อง

Test: ลบแถว ready → หายจากรายการและยอด token, ลบแถว processing → สำเร็จและช่วง B ไม่ error, ไม่มี → `knowledge.not_found`

## ListDocuments และ GetDocument

| Use case | Input | Output | Error |
| --- | --- | --- | --- |
| `ListDocuments` | `{}` | `{ documents: KbDocument[]; usedTokens: number; capacityTokens: number }` (`usedTokens = sumReadyTokens()`) | ไม่มี |
| `GetDocument` | `{ documentId }` | `KbDocumentWithText` จาก `knowledge.getWithText(id)` | `knowledge.not_found` เมื่อได้ null |

Port: `KnowledgeRepository` Test: usedTokens นับเฉพาะ ready, GetDocument ของแถวที่ไม่มี → `knowledge.not_found`

## SaveCannedReply, DeleteCannedReply และ ListCannedReplies

| Use case | Input | Output | Error |
| --- | --- | --- | --- |
| `SaveCannedReply` | `{ id: null; title; text } \| { id: CannedReplyId; title?; text?; sortOrder? }` | `CannedReply` | `canned_reply.not_found`, `canned_reply.limit_reached` |
| `DeleteCannedReply` | `{ id }` | `void` | `canned_reply.not_found` |
| `ListCannedReplies` | `{}` | `CannedReply[]` | ไม่มี |

Port: `CannedReplyRepository`, `IdGenerator`, `Clock`, `Logger`

`SaveCannedReply`:

1. สร้างใหม่ (`id` เป็น null): `count() >= CANNED_REPLY_MAX_COUNT` คืน `canned_reply.limit_reached` ไม่เช่นนั้น `create({ id: ids.cannedReplyId(), sortOrder: maxSortOrder() + 1, createdAt: now, updatedAt: now })`
2. แก้: `update(id, patch)` ได้ null คืน `canned_reply.not_found`
3. log `canned_reply.item.saved`

`DeleteCannedReply`: `delete(id)` ได้ false คืน `canned_reply.not_found` ไม่เช่นนั้น log `canned_reply.item.deleted`

Test: สร้างรายการแรก sortOrder 1, รายการที่สอง sortOrder 2, สร้างเมื่อครบ `CANNED_REPLY_MAX_COUNT` → `canned_reply.limit_reached`, แก้เฉพาะ title ไม่กระทบ text, แก้ id ที่ไม่มี → `canned_reply.not_found`, ลบแล้วรายการหาย, ลบ id ที่ไม่มี → `canned_reply.not_found`

## GetUsageReport และ GetContactUsage

**หน้าที่:** ตารางค่าใช้จ่าย AI รายเดือนตาม [usage-cost](../specs/usage-cost.md#หน้าจอ)

| Use case | Input | Output | Error |
| --- | --- | --- | --- |
| `GetUsageReport` | `{ month: string }` (route ตรวจรูปแบบ `YYYY-MM` แล้ว) | ดูด้านล่าง (แถวของลูกค้ามี `pictureUrl` จาก `UsageByContactRow`) | ไม่มี |
| `GetContactUsage` | `{ contactId: ContactId; month: string }` | `AiUsageRecord[]` | ไม่มี |

Port: `UsageRepository` และ `config.priceTable`

`GetUsageReport`:

1. `range = bangkokMonthRange(month)`
2. `rows = usage.reportByContact(range)`, `ingest = usage.ingestSummary(range)`, `guard = usage.guardSummary(range)`
3. `replyCost = Σ rows.cost`, `okCount = Σ rows.okCount`
4. คืน `{ month, priceTableDate: priceTable.asOf, contacts: rows, ingest, guard, totalCost: replyCost + ingest.cost + guard.cost, replyCount: Σ rows.replyCount, averageCostPerReply: okCount > 0 ? replyCost / okCount : null }`

"จำนวนครั้งที่ AI ตอบ" ในตารางคือจำนวนครั้งที่เรียกโมเดลเพื่อตอบ (แถว kind reply ทุก outcome) และ "ราคาเฉลี่ยต่อข้อความที่ AI ตอบ" หารต้นทุนการตอบทั้งหมดด้วยจำนวนครั้งที่ outcome เป็น ok ข้อความที่ถูกกันด้วยขอบเขตหัวข้อไม่นับเป็น "AI ตอบ" การคัดกรองอยู่ในแถว `guard` แยก

`GetContactUsage`: `usage.listForContact(contactId, bangkokMonthRange(month))` ลูกค้าที่ไม่มีอยู่ได้รายการว่าง ไม่เป็น error

Test: เดือนที่ไม่มีข้อมูล → ทุกยอดเป็น 0 และค่าเฉลี่ยเป็น null, แถวที่สร้าง 2026-11-30T17:30Z นับเป็นเดือน 2026-12 ตามเวลาไทย, ค่าเฉลี่ยหารด้วยจำนวน ok ไม่ใช่ทุก outcome, ingest แยกจากลูกค้า, แถว kind guard อยู่ใน `guard` ไม่อยู่ในแถวของลูกค้าและรวมใน totalCost, แถว kind reply outcome blocked นับใน replyCount แต่ไม่นับใน okCount, Contact ที่ถูกลบตาม runbook ขึ้นเป็นแถวที่ contactId null

## GetSystemStatus

| | |
| --- | --- |
| Input | `{}` |
| Output | `{ lastWebhookAt; lastLineError; lastAiError; todayCost: NanoUsd; dailyBudget: NanoUsd; priceTableDate: string; database: "ok" }` |
| Port | `SettingsRepository`, `UsageRepository`, `Clock` |
| Error | ไม่มี (ถ้าฐานข้อมูลล่ม route ตอบ 500 และหน้าเว็บแสดงสถานะผิดพลาด) |

1. `s = settings.get()`, `todayCost = usage.sumCost(bangkokDayRange(now))` คืนตามนั้น

Test: ยอดวันนี้ไม่รวมเมื่อวานตามเวลาไทย, ไม่เคยรับ webhook → lastWebhookAt null

## Endpoint ที่ไม่มี use case

`POST /api/access/lock` ลบ cookie อย่างเดียว ไม่มีข้อมูลหรือกฎในแกนกลาง จึงอยู่ใน route ล้วน เป็นข้อยกเว้นเดียวของกฎ "ทุก endpoint เรียก use case"
