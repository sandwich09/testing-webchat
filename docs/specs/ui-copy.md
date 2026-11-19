# ถ้อยคำบนหน้าจอ

> สถานะ: สร้างแล้ว · อัปเดตล่าสุด: 2026-11-19

รายการข้อความไทยทุกคำที่แอดมินเห็น จัดตามไฟล์ constant ของแต่ละ feature ชื่อ constant เป็น key คงที่ที่โค้ดและ [ui-screens](ui-screens.md) ใช้อ้าง

## กฎของเอกสารนี้

- ถ้อยคำทั้งหมดเป็นไปตาม [ux-writing](../guidelines/ux-writing.md): ใช้คำตามอภิธานศัพท์และตาราง[คำทับศัพท์](../guidelines/ux-writing.md#คำทับศัพท์) ไม่มีคำลงท้าย ปุ่มเป็นคำกริยา หนึ่งความหมายหนึ่งประโยค
- ข้อความ error ที่มาจาก server ตามรหัส error อยู่ใน [error-catalog](../architecture/error-catalog.md) ไม่ซ้ำที่นี่ เอกสารนี้มีเฉพาะข้อความที่ตรวจในฝั่ง browser และไม่เรียก server
- `{ชื่อ}` คือค่าที่แทนตอนแสดง ตัวเลขจัดรูปแบบด้วยฟังก์ชันใน [ui-screens](ui-screens.md#8-ฟังก์ชันล้วนฝั่งหน้าจอ) ก่อนแทน `{max}` และ `{maxMb}` มาจาก constant ใน `src/contracts/` ซึ่งค่าอยู่ใน [project-setup](../architecture/project-setup.md#10-ค่าคงที่ของระบบ)
- ชื่อ key: `<feature>.<พื้นที่>.<ชื่อ>` เป็น camelCase key ใดที่เป็นกลุ่มย่อยใช้จุดคั่นต่อ เช่น `inbox.media.other.audio`
- กลุ่มข้อความ error ที่ตรวจใน browser ใช้ชื่อตามโค้ด: `error` ใน `access.error.*`, `inbox.attach.error.*`, `settings.ai.error.*`, `settings.line.error.*` และ `errors` (พหูพจน์) ใน `settings.guard.errors.*`, `settings.kb.errors.*` (ใน `kb` key `error` เป็นข้อความเดี่ยวของการโหลดไม่สำเร็จอยู่แล้ว) ข้อความตามรหัส error ของ server และของรหัส client `client.network` ไม่อยู่ในกลุ่มเหล่านี้ หน้าเว็บได้จาก `errorMessage` ใน `src/common/error-messages.ts` ซึ่งใช้ `common.error.network` เป็นข้อความของ `client.network`
- ในโค้ด แต่ละไฟล์ export object เดียวชื่อ `copy` เช่น `inbox.constants.ts` export `copy.list.title` ซึ่งตรงกับ key `inbox.list.title`
- ข้อความใหม่ต้องอยู่ในตารางนี้ก่อนใช้ในโค้ด ถ้าต้องการคำใหม่ที่ไม่อยู่ในอภิธานศัพท์ ให้เพิ่มใน [ux-writing](../guidelines/ux-writing.md#อภิธานศัพท์) ด้วย

## `src/common/common.constants.ts`

### ทั่วไปและเมนู

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `common.appName` | Test webchat | `<title>` ของทุกหน้า ชื่อข้างโลโก้ในเมนู และตัวอักษรบนโลโก้ (`initialOf`) |
| `common.skipToContent` | ข้ามไปที่เนื้อหา | ลิงก์ข้ามที่เห็นเมื่อ focus |
| `common.nav.label` | เมนูหลัก | `aria-label` ของ `<nav>` |
| `common.nav.inbox` | แชท | เมนู |
| `common.nav.settings` | ตั้งค่า | เมนู |
| `common.nav.logout` | ออกจากระบบ | เมนู |
| `common.nav.collapse` | พับเมนู | `aria-label` และ tooltip ของปุ่มไอคอนพับเมนู (ไม่แสดงเป็นข้อความบนเมนู) |
| `common.nav.expand` | กางเมนู | `aria-label` และ tooltip ของปุ่มเดียวกันเมื่อพับอยู่ |
| `common.nav.unreadAria` | {n} แชทยังไม่อ่าน | `aria-label` ของตัวเลขในเมนู |

### ปุ่มร่วม

| Key | ข้อความ |
| --- | --- |
| `common.action.retry` | ลองอีกครั้ง |
| `common.action.cancel` | ยกเลิก |
| `common.action.close` | ปิด |
| `common.action.save` | บันทึก |

### สถานะและ error ร่วม

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `common.connection.banner` | การเชื่อมต่อมีปัญหา กำลังลองใหม่ | แถบด้านบนเมื่อ polling ล้มเหลวติดกัน |
| `common.error.section` | ส่วนนี้แสดงไม่ได้ | error boundary ของแต่ละส่วน |
| `common.error.network` | เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง | รหัส client `client.network` เมื่อคำขอไม่ได้คำตอบ |
| `common.toast.saved` | บันทึกแล้ว | toast หลังบันทึกค่าที่ไม่มี toast เฉพาะ |
| `common.loading` | กำลังโหลด | ข้อความซ่อนของ skeleton สำหรับโปรแกรมอ่านจอ |

### เวลา

ชื่อวันย่อ ชื่อเดือนย่อ และปีพุทธศักราชมาจาก `Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok" })` ไม่เก็บใน constant

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `common.time.today` | วันนี้ | ป้ายวันที่ในแชท |
| `common.time.yesterday` | เมื่อวาน | รายชื่อและป้ายวันที่ |

## `src/features/access/access.constants.ts`

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `access.cover.badge` | ยินดีต้อนรับสู่ | ป้ายบนการ์ด |
| `access.cover.title` | Test webchat | หัวข้อ |
| `access.cover.subtitle` | application | บรรทัดเล็กใต้หัวข้อ |
| `access.form.label` | รหัสเข้าใช้ | `<label>` ที่ซ่อนไว้ |
| `access.form.placeholder` | รหัสเข้าใช้ | placeholder |
| `access.form.showCode` | แสดงรหัสเข้าใช้ | `aria-label` ของปุ่มตาเมื่อซ่อนอยู่ |
| `access.form.hideCode` | ซ่อนรหัสเข้าใช้ | `aria-label` ของปุ่มตาเมื่อแสดงอยู่ |
| `access.form.submit` | เข้าระบบ | ปุ่ม |
| `access.form.submitting` | กำลังเข้าระบบ | `aria-label` ของปุ่มขณะส่ง (ข้อความบนปุ่มเป็น spinner) |
| `access.error.empty` | กรุณาใส่รหัสเข้าใช้ | ช่องว่าง (ไม่เรียก server) ถ้อยคำตาม [access-gate](access-gate.md) |

รหัสผิดและลองถี่เกินมาจาก server: ดูรหัสที่เกี่ยวข้องใน [error-catalog](../architecture/error-catalog.md)

## `src/features/inbox/inbox.constants.ts`

### รายชื่อผู้ใช้

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.list.title` | แชท | หัวคอลัมน์ |
| `inbox.list.searchPlaceholder` | ค้นหาชื่อผู้ใช้ | placeholder และ `aria-label` |
| `inbox.list.clearSearch` | ล้างคำค้นหา | ปุ่ม X |
| `inbox.list.tabsLabel` | ตัวกรองแชท | `aria-label` ของ tablist |
| `inbox.list.tabAll` | ทั้งหมด | แท็บ |
| `inbox.list.tabUnread` | ยังไม่อ่าน | แท็บ ตามด้วยจำนวน |
| `inbox.list.tabNeedsAdmin` | รอแอดมิน | แท็บ ตามด้วยจำนวน |
| `inbox.list.unreadAria` | {n} ข้อความยังไม่อ่าน | ตัวเลขในแถว สำหรับโปรแกรมอ่านจอ |
| `inbox.list.emptyNoLine.title` | ยังไม่มีผู้ใช้ทักมา | ไม่มีผู้ใช้เลย และยังไม่ได้เชื่อม LINE OA |
| `inbox.list.emptyNoLine.body` | เชื่อม LINE Official Account ที่หน้าตั้งค่า แล้วเพิ่มเพื่อนจากแอป LINE เพื่อเริ่มแชท | |
| `inbox.list.goToSettings` | ไปที่ตั้งค่า | ลิงก์ในสถานะว่าง |
| `inbox.list.empty.title` | ยังไม่มีผู้ใช้ทักมา | ไม่มีผู้ใช้เลย เชื่อม LINE OA แล้ว |
| `inbox.list.empty.body` | เมื่อผู้ใช้เพิ่ม LINE Official Account เป็นเพื่อนแล้วทักมา แชทจะขึ้นที่นี่ | |
| `inbox.list.emptyUnread` | ไม่มีแชทที่ยังไม่อ่าน | แท็บยังไม่อ่านว่าง |
| `inbox.list.emptyNeedsAdmin` | ไม่มีแชทที่รอแอดมิน | แท็บรอแอดมินว่าง |
| `inbox.list.emptySearch` | ไม่พบผู้ใช้ชื่อ “{q}” | ค้นหาไม่พบ |
| `inbox.list.error` | โหลดรายชื่อผู้ใช้ไม่สำเร็จ | โหลดครั้งแรกไม่ได้ ตามด้วยปุ่ม `common.action.retry` |

### แถวของผู้ใช้และข้อความล่าสุด

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.contact.unnamed` | ผู้ใช้ไม่มีชื่อ | ชื่อว่างเพราะดึงโปรไฟล์ไม่ได้ |
| `inbox.contact.unfollowed` | เลิกติดตามแล้ว | แถวที่เลิกติดตาม, บรรทัดรองของส่วนหัว, แผงข้อมูล |
| `inbox.preview.you` | คุณ: | คำนำเมื่อข้อความล่าสุดเป็นของแอดมิน |
| `inbox.preview.ai` | AI: | คำนำเมื่อข้อความล่าสุดเป็นของ AI |
| `inbox.preview.needsAdmin` | รอแอดมิน · | คำนำสีส้มเมื่อแชทรอแอดมิน |
| `inbox.preview.none` | ยังไม่มีข้อความ | ผู้ใช้เพิ่มเพื่อนแต่ยังไม่ทัก |

### คำแทนสื่อและข้อความชนิดอื่น

ใช้ทั้งในบรรทัดข้อความล่าสุดของรายชื่อ และในฟองของแชท

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.media.image` | รูปภาพ | ข้อความล่าสุด, `alt` ของรูปในฟอง |
| `inbox.media.video` | วิดีโอ | ข้อความล่าสุด, `aria-label` ของภาพตัวอย่างวิดีโอ |
| `inbox.media.audio` | ข้อความเสียง | ข้อความล่าสุดในรายชื่อ และป้ายของฟองเสียงที่ยังเล่นไม่ได้ |
| `inbox.media.audioPlay` | เล่นข้อความเสียง | ชื่อของปุ่มเล่น |
| `inbox.media.audioPause` | หยุดข้อความเสียงชั่วคราว | ชื่อของปุ่มเมื่อกำลังเล่น |
| `inbox.media.audioProgress` | ตำแหน่งที่เล่นของข้อความเสียง | ชื่อของแถบตำแหน่ง |
| `inbox.media.audioLoading` | กำลังโหลดข้อความเสียง | ระหว่างดาวน์โหลด |
| `inbox.media.audioFailed` | โหลดข้อความเสียงไม่สำเร็จ | ดาวน์โหลดหรือเล่นไม่ได้ |
| `inbox.media.sticker` | สติกเกอร์ | ข้อความล่าสุด, `alt` ของสติกเกอร์, ข้อความแทนเมื่อโหลดสติกเกอร์ไม่ได้ |
| `inbox.media.other.audio` | [เสียง] | `otherKind = audio` |
| `inbox.media.other.file` | [ไฟล์] | `otherKind = file` |
| `inbox.media.other.location` | [ตำแหน่ง] | `otherKind = location` |
| `inbox.media.other.unknown` | [ข้อความชนิดอื่น] | ชนิดที่ไม่รู้จัก |
| `inbox.media.otherHint` | ดูได้ในแอป LINE เท่านั้น | บรรทัดที่สองในฟองของข้อความชนิดอื่น |
| `inbox.media.loading` | กำลังโหลดรูป | สื่อขาเข้าที่ยังดาวน์โหลดไม่เสร็จ |
| `inbox.media.imageFailed` | โหลดรูปไม่สำเร็จ | `mediaStatus = failed` ของรูปที่ไม่มีเหตุผล (`media.failure` เป็น null: แถวที่บันทึกก่อนมีเหตุผล) และรูปที่ browser โหลดไม่ได้ ถ้อยคำตาม [line-messaging](line-messaging.md) |
| `inbox.media.videoFailed` | โหลดวิดีโอไม่สำเร็จ | เหมือนบรรทัดบน สำหรับวิดีโอ |
| `inbox.media.problem.too_large` | ไฟล์ใหญ่เกิน {maxMb} MB ที่ระบบเก็บได้ ดูได้ในแอป LINE | `mediaStatus = too_large` ของรูป วิดีโอ และเสียง `{maxMb}` มาจาก `IMAGE_MAX_BYTES`, `VIDEO_MAX_BYTES` หรือ `AUDIO_MAX_BYTES` ตามชนิด |
| `inbox.media.problem.unsupported_type` | ชนิดไฟล์นี้แสดงในหน้านี้ไม่ได้ ดูได้ในแอป LINE | `media.failure = unsupported_type` (เนื้อไฟล์ไม่ใช่ชนิดที่รับ) |
| `inbox.media.problem.external_source` | ไฟล์มาจากลิงก์นอก LINE ระบบไม่ดึงไฟล์นี้ ดูได้ในแอป LINE | `media.failure = external_source` |
| `inbox.media.problem.download_failed` | ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จ ดูได้ในแอป LINE | `media.failure = download_failed` |
| `inbox.media.problem.interrupted` | ระบบหยุดก่อนเก็บไฟล์เสร็จ ดูได้ในแอป LINE | `media.failure = interrupted` (งานถูกตัดแล้วคืนสภาพ) |
| `inbox.media.play` | เล่นวิดีโอ | `aria-label` ของภาพตัวอย่างวิดีโอ |
| `inbox.media.openImage` | เปิดรูปขนาดเต็ม | `aria-label` ของภาพตัวอย่างรูป |

### ส่วนหัวของแชท

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.thread.back` | กลับไปที่รายชื่อ | ปุ่มกลับ (จอแคบ) |
| `inbox.thread.following` | ติดตามอยู่ | บรรทัดรอง และแผงข้อมูล |
| `inbox.thread.aiHelping` | AI กำลังช่วยตอบ | บรรทัดรองเมื่อ AI ตอบแทนเปิด |
| `inbox.thread.needsAdmin` | รอแอดมิน | บรรทัดรองและแผงข้อมูลเมื่อแชทรอแอดมิน |
| `inbox.thread.showInfo` | แสดงข้อมูลผู้ใช้ | ปุ่มแผงข้อมูล |
| `inbox.thread.hideInfo` | ซ่อนข้อมูลผู้ใช้ | ปุ่มแผงข้อมูลเมื่อเปิดอยู่ |

### สวิตช์ AI ตอบแทน

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.ai.label` | AI ตอบแทน | ป้ายสวิตช์ในส่วนหัวและแผงข้อมูล |
| `inbox.ai.labelKilled` | AI ปิดจากหน้าตั้งค่า | ป้ายในส่วนหัวเมื่อ kill switch ปิด |
| `inbox.ai.noteOff` | เปิดเพื่อให้ AI ตอบผู้ใช้คนนี้จากคลังความรู้ | หมายเหตุในแผงข้อมูล |
| `inbox.ai.noteOn` | AI ตอบผู้ใช้คนนี้ และปิดเองเมื่อคุณส่งข้อความ | |
| `inbox.ai.noteKilled` | AI ถูกปิดทั้งระบบ เปิดได้ที่ ตั้งค่า › AI | ถ้อยคำตาม [webchat-inbox](webchat-inbox.md) |
| `inbox.ai.noteUnfollowed` | ผู้ใช้เลิกติดตามแล้ว AI จึงตอบไม่ได้ | |

### พื้นที่ข้อความ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.thread.logLabel` | ข้อความในแชท | `aria-label` ของพื้นที่ข้อความ |
| `inbox.thread.placeholder` | เลือกแชทจากรายชื่อเพื่อเริ่มตอบ | ยังไม่เลือกผู้ใช้ |
| `inbox.thread.empty` | ยังไม่มีข้อความในแชทนี้ | แชทว่าง |
| `inbox.thread.error` | โหลดข้อความไม่สำเร็จ | ตามด้วยปุ่ม `common.action.retry` |
| `inbox.thread.notFound` | ไม่พบแชทนี้ | id ใน URL ไม่มีอยู่ |
| `inbox.thread.backToList` | กลับไปที่รายชื่อ | ลิงก์ในสถานะไม่พบ |
| `inbox.thread.loadingOlder` | กำลังโหลดข้อความก่อนหน้า | ข้อความซ่อนของ skeleton ด้านบน |
| `inbox.thread.newMessages` | ข้อความใหม่ | ปุ่มลอยเมื่อมีข้อความใหม่ขณะเลื่อนขึ้นไป |
| `inbox.notes.title` | โน้ต (เห็นเฉพาะแอดมิน) | หัวของส่วนโน้ตในแผงข้อมูลผู้ใช้ |
| `inbox.notes.hint` | ผู้ใช้และ AI ไม่เห็นโน้ตนี้ | ใต้หัว |
| `inbox.notes.inputLabel` | โน้ตใหม่ | ชื่อของช่อง |
| `inbox.notes.placeholder` | พิมพ์โน้ตเกี่ยวกับผู้ใช้ | placeholder |
| `inbox.notes.keys` | Enter เพิ่ม · Shift+Enter ขึ้นบรรทัดใหม่ | ใต้ช่อง |
| `inbox.notes.add` | เพิ่มโน้ต | ปุ่ม |
| `inbox.notes.counter` | {n}/{max} | ตัวนับ `{max}` จาก `CONTACT_NOTE_MAX_CHARS` |
| `inbox.notes.empty` | ยังไม่มีโน้ต | สถานะว่าง |
| `inbox.notes.error` | โหลดโน้ตไม่สำเร็จ | สถานะผิดพลาด |
| `inbox.notes.saving` | กำลังบันทึก | แทนเวลาของโน้ตที่กำลังบันทึก |
| `inbox.notes.tooLong` | โน้ตยาวเกิน {max} ตัวอักษร | ใต้ช่อง |
| `inbox.notes.addFailed` | เพิ่มโน้ตไม่สำเร็จ ข้อความที่พิมพ์ยังอยู่ ลองอีกครั้ง | ใต้ช่อง เมื่อไม่มีข้อความของรหัส |
| `inbox.notes.delete` | ลบโน้ตที่เขียนเมื่อ {date} | ชื่อของปุ่มลบ |
| `inbox.notes.deleteTitle` | ลบโน้ตนี้ไหม | หัว dialog |
| `inbox.notes.deleteDescription` | ลบแล้วกู้คืนไม่ได้ | คำอธิบายใน dialog |
| `inbox.notes.deleteConfirm` | ลบโน้ต | ปุ่มยืนยัน |
| `inbox.notes.deleted` | ลบโน้ตแล้ว | toast |
| `inbox.quote.label` | ตอบกลับ {name}: {text} | ชื่อของกล่องอ้างอิงที่กดได้ |
| `inbox.quote.labelUnavailable` | ตอบกลับข้อความที่ไม่พร้อมแสดง | ชื่อของกล่องอ้างอิงที่ไม่รู้จัก |
| `inbox.quote.unavailable` | ข้อความต้นทางไม่พร้อมแสดง | ข้อความในกล่องอ้างอิงที่ไม่รู้จัก |
| `inbox.quote.jumpHint` | ไปที่ข้อความต้นทาง | title ของกล่องอ้างอิงที่กดได้ |
| `inbox.welcome.label` | ข้อความต้อนรับ | หัวของกล่องข้อความต้อนรับในแชท และชื่อที่เครื่องอ่านหน้าจออ่าน |
| `inbox.welcome.sender` | ส่งอัตโนมัติ | ป้ายผู้ส่งข้างเวลาของกล่องข้อความต้อนรับ |
| `inbox.welcome.buttonsLabel` | ปุ่มในการ์ด: {buttons} | ชื่อของรายการปุ่ม (ไม่ใช่ปุ่มที่กดได้) `{buttons}` คือชื่อปุ่มสามปุ่มคั่นด้วยจุลภาค |
| `inbox.message.senderYou` | คุณ | ป้ายผู้ส่งข้างเวลา |
| `inbox.message.senderAi` | AI | ป้ายผู้ส่งข้างเวลา |
| `inbox.message.sending` | กำลังส่ง | ใต้ฟองที่กำลังส่ง |
| `inbox.message.sent` | ส่งแล้ว | ข้อความซ่อนคู่กับไอคอน และ `title` ของไอคอน |
| `inbox.message.failed` | ส่งไม่สำเร็จ | ใต้ฟอง ตามด้วย ` · ` และเหตุผลจาก error catalog |
| `inbox.message.retry` | ส่งอีกครั้ง | ปุ่มใต้ฟองที่ส่งไม่สำเร็จ |

### บรรทัดเหตุการณ์และเหตุผลของสถานะรอแอดมิน

ข้อความไทยของทุก `eventCode` และทุก `needsAdminReason` อยู่ใน [error-catalog](../architecture/error-catalog.md#เหตุผลของสถานะรอแอดมิน) ที่เดียว ([บรรทัดเหตุการณ์](../architecture/error-catalog.md#บรรทัดเหตุการณ์)) ไฟล์นี้ไม่มี key ของข้อความเหล่านั้น หน้าเว็บเรียก `handoffReasonText` และ `eventCodeText` จาก `src/common/error-messages.ts`

### ช่องตอบ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.composer.placeholder` | พิมพ์ข้อความ | placeholder และ `aria-label` |
| `inbox.composer.hint` | Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่ | ใต้ช่องพิมพ์ (จอกว้าง) |
| `inbox.composer.send` | ส่ง | ปุ่มหลัก |
| `inbox.composer.attach` | แนบรูปหรือวิดีโอ | ปุ่มไอคอน |
| `inbox.composer.attachHint` | รูป JPEG, PNG, WebP, HEIC ไม่เกิน {imageMaxMb} MB · วิดีโอ MP4 ไม่เกิน {videoMaxMb} MB | tooltip ของปุ่มแนบเมื่อชี้หรือ focus และคำอธิบาย (`aria-describedby`) ของปุ่มทุกความกว้าง ก่อนเลือกไฟล์ `{imageMaxMb}` และ `{videoMaxMb}` มาจาก `IMAGE_MAX_BYTES` และ `VIDEO_MAX_BYTES` |
| `inbox.composer.waitUpload` | ส่งได้เมื่ออัปโหลดเสร็จ | แทน hint เมื่อไฟล์แนบยังไม่พร้อม |
| `inbox.composer.disabled.unfollowed` | ส่งข้อความหาผู้ใช้ที่เลิกติดตามแล้วไม่ได้ | แทนแถบเครื่องมือ |
| `inbox.composer.disabled.lineNotConfigured` | เชื่อม LINE Official Account ที่หน้าตั้งค่าก่อนจึงจะส่งข้อความได้ | แทนแถบเครื่องมือ |

### ไฟล์แนบ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.attach.preparing` | กำลังเตรียมไฟล์ | ตรวจและแปลงไฟล์ |
| `inbox.attach.uploading` | กำลังอัปโหลด {percent}% | ขออัปโหลดและอัปโหลด |
| `inbox.attach.uploadingNoPercent` | กำลังอัปโหลด | เมื่อวัดความคืบหน้าไม่ได้ |
| `inbox.attach.ready` | พร้อมส่ง | |
| `inbox.attach.cancel` | ยกเลิกไฟล์แนบ | ปุ่ม X |
| `inbox.attach.remove` | นำไฟล์แนบออก | ปุ่ม X เมื่อไฟล์ถูกปฏิเสธ |

ข้อความ error ที่ตรวจใน browser (รหัสจาก `validateAttachment` และขั้นตอนแนบไฟล์) `{maxMb}` มาจาก `IMAGE_MAX_BYTES` หรือ `VIDEO_MAX_BYTES` ใน `src/contracts/` และ `convertFailed` ใช้ทั้งเมื่อแปลง WebP หรือ HEIC/HEIF ไม่สำเร็จ (รวมเมื่อ `heic-to` throw) ตาม [line-messaging](line-messaging.md#สื่อขาออก):

| Key | ข้อความ |
| --- | --- |
| `inbox.attach.error.unsupported_type` | รองรับเฉพาะรูป JPEG, PNG, WebP, HEIC และวิดีโอ MP4 |
| `inbox.attach.error.mov_not_supported` | วิดีโอ MOV ส่งไม่ได้ แปลงเป็น MP4 แล้วแนบใหม่ |
| `inbox.attach.error.image_too_large` | รูปต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB |
| `inbox.attach.error.video_too_large` | วิดีโอต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB |
| `inbox.attach.error.empty_file` | ไฟล์นี้ว่างเปล่า เลือกไฟล์อื่น |
| `inbox.attach.error.convertFailed` | แปลงรูปนี้ไม่ได้ ใช้ไฟล์ JPEG หรือ PNG แทน |
| `inbox.attach.error.uploadFailed` | อัปโหลดไม่สำเร็จ แนบไฟล์อีกครั้ง |

การขอสิทธิ์อัปโหลดหรือ PUT ที่ server ปฏิเสธ (ชนิด ขนาด จำกัดความถี่ ไฟล์ไม่ครบ) ใช้ข้อความจาก [error-catalog](../architecture/error-catalog.md) โดยแทน `{imageMaxMb}`, `{videoMaxMb}` จาก constant และ `{size}` ด้วยขนาดของไฟล์ที่เลือก `media.too_large` ของ PUT ใช้ข้อความของ `upload.too_large` เพื่อบอกขนาดของไฟล์ด้วย ทุกข้อความเรื่องชนิดหรือขนาดบอกสิ่งที่รับได้ ไม่มีตัวเลขเขียนตายตัวในข้อความ

### แผงข้อมูลผู้ใช้

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `inbox.info.title` | ข้อมูลผู้ใช้ | หัวแผง |
| `inbox.info.close` | ปิดข้อมูลผู้ใช้ | ปุ่ม X |
| `inbox.info.followedAt` | เพิ่มเพื่อนเมื่อ {date} | ใต้ชื่อ |
| `inbox.info.status` | สถานะ | ป้ายรายละเอียด |
| `inbox.info.messageCount` | ข้อความทั้งหมด | ป้ายรายละเอียด |
| `inbox.info.aiReplyCount` | AI ตอบไปแล้ว | ป้ายรายละเอียด |
| `inbox.info.timesValue` | {n} ครั้ง | ค่าของ AI ตอบไปแล้ว |
| `inbox.info.lastContact` | ทักล่าสุด | ป้ายรายละเอียด |
| `inbox.info.error` | โหลดข้อมูลผู้ใช้ไม่สำเร็จ | ตามด้วยปุ่ม `common.action.retry` |

### Lightbox

| Key | ข้อความ |
| --- | --- |
| `inbox.lightbox.label` | ดูสื่อขนาดเต็ม |
| `inbox.lightbox.openOriginal` | เปิดไฟล์ในแท็บใหม่ |
| `inbox.lightbox.close` | ปิด |

## `src/features/settings/settings.constants.ts`

### หน้า

| Key | ข้อความ |
| --- | --- |
| `settings.page.title` | ตั้งค่า |

### แท็บ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.tabs.label` | ส่วนของหน้าตั้งค่า | `aria-label` ของ tablist |
| `settings.tabs.ai` | AI | แท็บที่ 1 (การ์ดการทำงาน และตัวตนและน้ำเสียง) |
| `settings.tabs.knowledge` | ความรู้และขอบเขต | แท็บที่ 2 (การ์ดความรู้ที่ใช้ตอบ และขอบเขตหัวข้อ) |
| `settings.tabs.line` | LINE | แท็บที่ 3 (การ์ดการเชื่อมต่อ, Rich menu และข้อความต้อนรับ) |
| `settings.tabs.usage` | ค่าใช้จ่าย | แท็บที่ 4 |
| `settings.tabs.status` | สถานะระบบ | แท็บที่ 5 |

### AI

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.ai.title` | การทำงาน | หัวการ์ดแรกของแท็บ AI (สวิตช์ทั้งระบบ, โมเดล, งบต่อวัน) |
| `settings.ai.personaTitle` | ตัวตนและน้ำเสียง | หัวการ์ดที่สองของแท็บ AI (ชื่อ AI, คำลงท้าย, คำแนะนำสำหรับ AI) |
| `settings.ai.killSwitch` | เปิดใช้ AI ทั้งระบบ | ป้ายแถว |
| `settings.ai.killSwitchDesc` | ปิดแล้ว AI หยุดตอบผู้ใช้ทุกคนทันที | คำอธิบาย |
| `settings.ai.killSwitchOnToast` | เปิดใช้ AI ทั้งระบบแล้ว | toast |
| `settings.ai.killSwitchOffToast` | ปิด AI ทั้งระบบแล้ว | toast |
| `settings.ai.model` | โมเดล | ป้ายแถว |
| `settings.ai.modelDesc` | มีผลกับข้อความถัดไป | คำอธิบาย |
| `settings.ai.modelOption.claude-opus-5-5` | Claude Opus 5.5 | ตัวเลือก |
| `settings.ai.modelOption.claude-sonnet-5-5` | Claude Sonnet 5.5 | ตัวเลือก (ค่าเริ่มต้น) |
| `settings.ai.modelOption.claude-haiku-5-5` | Claude Haiku 5.5 | ตัวเลือก |
| `settings.ai.budget` | งบต่อวัน | ป้ายแถว |
| `settings.ai.budgetDesc` | ถึงเพดานแล้ว AI หยุดจนถึงเที่ยงคืนตามเวลาไทย | คำอธิบาย |
| `settings.ai.budgetToday` | วันนี้ใช้ไป {used} | ใต้ช่องงบ |
| `settings.ai.particle` | คำลงท้าย | ป้ายแถว |
| `settings.ai.particleDesc` | คำที่ AI ใช้ลงท้ายประโยคกับผู้ใช้ | คำอธิบาย |
| `settings.ai.particleOption.ka` | ค่ะ | ตัวเลือก |
| `settings.ai.particleOption.krub` | ครับ | ตัวเลือก |
| `settings.ai.aiName` | ชื่อ AI | ป้ายแถว และชื่อของช่อง |
| `settings.ai.aiNameDesc` | ชื่อที่ AI ใช้เรียกตัวเองและบอกตอนทักทาย เว้นว่างได้ | คำอธิบาย |
| `settings.ai.aiNamePlaceholder` | เช่น มินนี่ | placeholder |
| `settings.ai.answerMode` | ขอบเขตคำตอบ | ป้ายแถวบนสุดของการ์ด `settings.kb.cardTitle` และชื่อของกลุ่มตัวเลือก มีบนหน้าจอที่เดียว |
| `settings.ai.answerModeDesc` | สิ่งที่ AI ใช้ตอบผู้ใช้ | คำอธิบาย |
| `settings.ai.answerModeOption.general` | คุยทั่วไปได้ | ตัวเลือก (ค่าเริ่มต้น) |
| `settings.ai.answerModeOption.knowledge_only` | ตอบจากคลังความรู้เท่านั้น | ตัวเลือก |
| `settings.ai.answerModeOptionDesc.general` | ยึดคลังความรู้ก่อน เรื่องอื่นตอบจากความรู้ทั่วไป | คำอธิบายใต้ตัวเลือก |
| `settings.ai.answerModeOptionDesc.knowledge_only` | เรื่องที่ไม่มีในคลังความรู้ให้แอดมินตอบ | คำอธิบายใต้ตัวเลือก |
| `settings.ai.instructions` | คำแนะนำสำหรับ AI | ป้ายแถว |
| `settings.ai.instructionsDesc` | บทบาท น้ำเสียง เรื่องที่คุยได้ คำทักทาย และข้อห้ามเพิ่มเติม เว้นว่างได้ | คำอธิบาย |
| `settings.ai.instructionsPlaceholder` | เช่น เป็นผู้ช่วยแนะนำหนังสือ พูดเป็นกันเอง ทักทายด้วยคำว่าสวัสดี และไม่คุยเรื่องการเมือง | placeholder |
| `settings.ai.instructionsCounter` | {n}/{max} | ตัวนับ `{max}` จาก `AI_INSTRUCTIONS_MAX_CHARS` |

ข้อความ error ที่ตรวจใน browser:

| Key | ข้อความ |
| --- | --- |
| `settings.ai.error.budget_invalid` | ใส่งบเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง |
| `settings.ai.error.budget_out_of_range` | งบต่อวันต้องอยู่ระหว่าง 0 ถึง {max} ดอลลาร์ |
| `settings.ai.error.instructions_too_long` | คำแนะนำยาวเกิน {max} ตัวอักษร |
| `settings.ai.error.ai_name_too_long` | ชื่อ AI ยาวเกิน {max} ตัวอักษร |

### ขอบเขตหัวข้อ

พฤติกรรมอยู่ใน [topic-guard](topic-guard.md) ในโค้ด key `settings.guard.*` คือ `copy.guard.*` ของ `settings.constants.ts`

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.guard.title` | ขอบเขตหัวข้อ | หัวการ์ดที่สองของแท็บความรู้และขอบเขต |
| `settings.guard.switch` | จำกัดหัวข้อที่ AI คุยได้ | ป้ายแถว |
| `settings.guard.switchDesc` | เปิดแล้ว AI ตอบเฉพาะหัวข้อในรายการ เรื่องอื่นไม่ตอบ | คำอธิบาย |
| `settings.guard.enabledToast` | เปิดขอบเขตหัวข้อแล้ว | toast |
| `settings.guard.disabledToast` | ปิดขอบเขตหัวข้อแล้ว | toast |
| `settings.guard.topics` | หัวข้อที่คุยได้ | ป้ายแถว |
| `settings.guard.topicsDesc` | ใช้คำกว้าง ๆ ได้ เช่น การศึกษา ผู้ใช้จะเห็นชื่อหัวข้อเหล่านี้เมื่อถามนอกเรื่อง | คำอธิบาย (ข้อความปฏิเสธบอกชื่อหัวข้อตาม [topic-guard](topic-guard.md)) |
| `settings.guard.topicInput` | หัวข้อใหม่ | `aria-label` ของช่องเพิ่มหัวข้อ |
| `settings.guard.topicsPlaceholder` | พิมพ์หัวข้อ | placeholder |
| `settings.guard.topicAdd` | เพิ่ม | ปุ่ม |
| `settings.guard.topicRemove` | ลบ | ปุ่มของแต่ละหัวข้อ (จอแคบเหลือไอคอน) |
| `settings.guard.topicRemoveAria` | ลบหัวข้อ {topic} | `aria-label` ของปุ่มลบ |
| `settings.guard.topicsEmpty` | ยังไม่มีหัวข้อ | แทนรายการเมื่อไม่มีหัวข้อ |
| `settings.guard.topicsCounter` | {n}/{max} หัวข้อ | ตัวนับ `{max}` จาก `GUARD_MAX_TOPICS` |
| `settings.guard.test` | ทดลอง | ป้ายแถว และ `aria-label` ของช่องทดลอง |
| `settings.guard.testDesc` | ทดลองกับหัวข้อที่บันทึกไว้ มีค่าใช้จ่ายทุกครั้ง | คำอธิบาย |
| `settings.guard.testPlaceholder` | พิมพ์ข้อความแบบที่ผู้ใช้จะพิมพ์ | placeholder |
| `settings.guard.testSubmit` | ทดสอบ | ปุ่ม |
| `settings.guard.testing` | กำลังทดสอบ | `aria-label` ของปุ่มขณะทดสอบ |
| `settings.guard.testAllowed` | ผ่าน: อยู่ในหัวข้อ {topic} | ผลทดลองที่ผ่าน |
| `settings.guard.testAllowedNoTopic` | ผ่าน: อยู่ในหัวข้อที่กำหนด | ผลทดลองที่ผ่านแต่ไม่ได้ชื่อหัวข้อ |
| `settings.guard.testBlocked` | ถูกกัน: นอกขอบเขตหัวข้อ | ผลทดลองที่ถูกกัน |
| `settings.guard.testCost` | ค่าใช้จ่ายโดยประมาณ ${usd} | ใต้ผลทดลอง |
| `settings.guard.testDisabledKilled` | ทดลองไม่ได้เพราะ AI ถูกปิดทั้งระบบ | เหตุผลข้างปุ่มที่กดไม่ได้ |
| `settings.guard.testNeedsTopics` | บันทึกหัวข้ออย่างน้อยหนึ่งหัวข้อก่อนจึงจะทดลองได้ | เหตุผลข้างปุ่มที่กดไม่ได้ |
| `settings.guard.blockedToday` | วันนี้กันไป {n} ข้อความ | บรรทัดท้ายส่วน |

ข้อความ error ที่ตรวจใน browser (รหัสจาก `addGuardTopic`, `removeGuardTopic` และ `validateGuardTestInput`):

| Key | ข้อความ |
| --- | --- |
| `settings.guard.errors.topics_required` | ใส่หัวข้ออย่างน้อยหนึ่งหัวข้อก่อนเปิดขอบเขตหัวข้อ |
| `settings.guard.errors.topic_required` | พิมพ์หัวข้อก่อนกดเพิ่ม |
| `settings.guard.errors.too_many_topics` | ใส่ได้ไม่เกิน {max} หัวข้อ |
| `settings.guard.errors.topic_too_long` | หัวข้อยาวเกิน {max} ตัวอักษร |
| `settings.guard.errors.duplicate_topic` | มีหัวข้อนี้ในรายการแล้ว |
| `settings.guard.errors.test_required` | พิมพ์ข้อความที่จะทดลอง |
| `settings.guard.errors.test_too_long` | ข้อความยาวเกิน {max} ตัวอักษร |

การเปิดโดยไม่มีหัวข้อที่ server ปฏิเสธ การทดลองถี่เกิน และความผิดพลาดของ AI ระหว่างทดลอง ใช้ข้อความจาก [error-catalog](../architecture/error-catalog.md)

### LINE: การเชื่อมต่อ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.line.title` | การเชื่อมต่อ | หัวการ์ดแรกของแท็บ LINE |
| `settings.line.status` | สถานะ | ป้ายแถวสถานะ |
| `settings.line.statusConnected` | เชื่อมต่อแล้ว | ป้ายสถานะ |
| `settings.line.statusError` | เชื่อมต่อมีปัญหา | ป้ายสถานะ |
| `settings.line.statusNotConfigured` | ยังไม่ได้เชื่อมต่อ | ป้ายสถานะ |
| `settings.line.basicId` | Basic ID {basicId} | คำอธิบายใต้ชื่อ OA |
| `settings.line.lastWebhook` | รับข้อความล่าสุด {dateTime} | คำอธิบาย |
| `settings.line.lastWebhookNever` | ยังไม่เคยรับข้อความ | คำอธิบาย |
| `settings.line.webhookUrl` | Webhook URL | ป้ายแถว |
| `settings.line.webhookUrlDesc` | นำไปใส่ในหน้าตั้งค่า Messaging API ของ channel | คำอธิบาย |
| `settings.line.copy` | คัดลอก | ปุ่ม |
| `settings.line.copiedToast` | คัดลอก Webhook URL แล้ว | toast |
| `settings.line.copyFailed` | คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเอง | เมื่อ clipboard ใช้ไม่ได้ |
| `settings.line.channelId` | Channel ID | ป้ายแถว |
| `settings.line.channelIdDesc` | ตัวเลขในแท็บ Basic settings ของ channel | คำอธิบายของแถว Channel ID |
| `settings.line.channelIdPlaceholder` | ตัวเลขจาก LINE Developers Console | placeholder ของ Channel ID |
| `settings.line.secretVerified` | LINE ยืนยันแล้วว่า Channel secret ตรงกับ Channel ID | บรรทัดของ Channel secret ในแถวสถานะ และต่อท้ายผลทดสอบ |
| `settings.line.secretUnchecked` | ยังตรวจ Channel secret กับ LINE ไม่ได้ กด "ทดสอบการเชื่อมต่อ" อีกครั้งภายหลัง | สถานะเตือนเมื่อ LINE ตรวจ secret ไม่ได้ตอนบันทึกหรือทดสอบ |
| `settings.line.secretNoChannelId` | ยังไม่ได้ตรวจ Channel secret ใส่ Channel ID พร้อม Channel secret และ Channel access token แล้วบันทึกอีกครั้ง | สถานะเตือนของ credential ที่บันทึกไว้ก่อนมีช่อง Channel ID |
| `settings.line.channelSecret` | Channel secret | ป้ายแถว |
| `settings.line.accessToken` | Channel access token | ป้ายแถว |
| `settings.line.channelSecretDesc` | อยู่ในแท็บ Basic settings ของ channel | คำอธิบายของแถว Channel secret ตาม [line-oa-setup](../runbooks/line-oa-setup.md) |
| `settings.line.accessTokenDesc` | อยู่ในแท็บ Messaging API ของ channel | คำอธิบายของแถว Channel access token ตาม [line-oa-setup](../runbooks/line-oa-setup.md) |
| `settings.line.savedMask` | •••••••••••• | ค่าคงที่ที่ช่อง Channel secret และ Channel access token ที่ล็อกแสดงเมื่อบันทึกแล้ว ไม่มาจากค่าจริงและไม่บอกความยาว |
| `settings.line.edit` | แก้ไข {field} | `aria-label` ของปุ่มไอคอนดินสอ `{field}` คือป้ายของแถว |
| `settings.line.cancelEdit` | ยกเลิกการแก้ไข {field} | `aria-label` ของปุ่มไอคอน X ที่แทนปุ่มดินสอขณะแก้ |
| `settings.line.secretPlaceholderSet` | ใส่ค่าใหม่เพื่อแทนค่าเดิม | placeholder ของช่องลับที่เปิดแก้หลังบันทึกแล้ว |
| `settings.line.secretPlaceholderEmpty` | วางค่าจาก LINE Developers Console | placeholder เมื่อยังไม่เคยบันทึก |
| `settings.line.save` | บันทึก | ปุ่ม |
| `settings.line.test` | ทดสอบการเชื่อมต่อ | ปุ่ม |
| `settings.line.testNeedsCredentials` | บันทึก Channel ID, Channel secret และ Channel access token ก่อนจึงจะทดสอบได้ | เหตุผลข้างปุ่มที่กดไม่ได้ |
| `settings.line.testOk` | เชื่อมต่อได้ OA ชื่อ {name} | ผลทดสอบสำเร็จ |
| `settings.line.savedToast` | บันทึกและตรวจกับ LINE แล้ว | toast หลังบันทึกสำเร็จที่ LINE ยืนยัน Channel secret ได้ ถ้าตรวจไม่ได้ใช้ `common.toast.saved` |
| `settings.line.setupTitle` | ยังไม่ได้เชื่อม LINE Official Account | หัวของขั้นตอนเริ่มต้น |
| `settings.line.setupStep1` | สร้าง Messaging API channel ใน LINE Developers Console | ขั้นที่ 1 |
| `settings.line.setupStep2` | คัดลอก Channel ID, Channel secret และ Channel access token มาใส่ด้านล่างแล้วบันทึก | ขั้นที่ 2 |
| `settings.line.setupStep3` | นำ Webhook URL ไปใส่ใน channel แล้วเปิดใช้ webhook | ขั้นที่ 3 |
| `settings.line.setupGuide` | อ่านขั้นตอนแบบละเอียด | ลิงก์ไป runbook |

ข้อความ error ที่ตรวจใน browser:

| Key | ข้อความ |
| --- | --- |
| `settings.line.error.channelIdRequired` | ใส่ Channel ID |
| `settings.line.error.channelIdInvalid` | Channel ID เป็นตัวเลขเท่านั้น ไม่เกิน {max} หลัก |
| `settings.line.error.channelSecretRequired` | ใส่ Channel secret |
| `settings.line.error.accessTokenRequired` | ใส่ Channel access token |

`{max}` คือ `LINE_CHANNEL_ID_MAX_CHARS` Token ไม่ถูกต้อง Channel ID กับ Channel secret ไม่ตรงกัน และบันทึกไม่สำเร็จเพราะระบบ ใช้ข้อความจาก [error-catalog](../architecture/error-catalog.md) ซึ่งต้องตรงกับถ้อยคำใน [admin-backoffice](admin-backoffice.md)

### LINE: Rich menu และข้อความต้อนรับ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.richMenu.title` | Rich menu | หัวการ์ดที่สองของแท็บ LINE |
| `settings.richMenu.welcomeTitle` | ข้อความต้อนรับ | หัวการ์ดที่สามของแท็บ LINE |
| `settings.richMenu.status` | สถานะ | ป้ายแถวสถานะของ rich menu |
| `settings.richMenu.statusPublished` | Publish แล้ว | ป้ายสถานะ จุดสีเขียว |
| `settings.richMenu.statusNotPublished` | ยังไม่ได้ publish | ป้ายสถานะ จุดสีเทา |
| `settings.richMenu.publishedAt` | Publish เมื่อ {dateTime} | คำอธิบายแถวเมื่อ publish แล้ว |
| `settings.richMenu.notPublishedDesc` | เมนูสามปุ่ม คุยกับ AI คุยกับแอดมิน และวิธีทดสอบ ใต้ช่องพิมพ์ของผู้ใช้ | คำอธิบายแถวเมื่อยังไม่ได้ publish |
| `settings.richMenu.needsLine` | เชื่อม LINE Official Account ก่อนจึงจะ publish ได้ | คำอธิบายแถวเมื่อยังไม่เชื่อม LINE ปุ่ม publish ปิดอยู่ |
| `settings.richMenu.lastError` | ครั้งล่าสุดไม่สำเร็จ: {error} | ใต้ปุ่ม `{error}` คือข้อความของรหัสจาก error catalog |
| `settings.richMenu.publish` | Publish rich menu | ปุ่มเมื่อยังไม่ได้ publish |
| `settings.richMenu.republish` | Publish อีกครั้ง | ปุ่มเมื่อ publish แล้ว |
| `settings.richMenu.remove` | นำ rich menu ออก | ปุ่มเมื่อ publish แล้ว |
| `settings.richMenu.publishedToast` | Publish rich menu แล้ว | toast |
| `settings.richMenu.removedToast` | นำ rich menu ออกแล้ว | toast |
| `settings.richMenu.howTo` | ข้อความวิธีทดสอบ | ป้ายแถว และชื่อของช่อง |
| `settings.richMenu.howToDesc` | ส่งเมื่อผู้ใช้กดปุ่ม "วิธีทดสอบ" | คำอธิบายแถว |
| `settings.richMenu.welcomeSwitch` | ส่งข้อความต้อนรับเมื่อเพิ่มเพื่อน | ป้ายแถว และชื่อของสวิตช์ |
| `settings.richMenu.welcomeSwitchDesc` | ส่งการ์ดต้อนรับพร้อมปุ่มเดียวกับ rich menu ครั้งเดียวต่อการเพิ่มเพื่อน | คำอธิบายแถว |
| `settings.richMenu.welcomeOnToast` | เปิดข้อความต้อนรับแล้ว | toast |
| `settings.richMenu.welcomeOffToast` | ปิดข้อความต้อนรับแล้ว | toast |
| `settings.richMenu.welcomeText` | ข้อความในการ์ด | ป้ายแถว และชื่อของช่อง |
| `settings.richMenu.welcomeTextDesc` | ชื่อบัญชีและปุ่มระบบใส่ให้เอง | คำอธิบายแถว |
| `settings.richMenu.counter` | {n}/{max} | ตัวนับใต้ช่อง |
| `settings.richMenu.reset` | ใช้ข้อความเริ่มต้น | ปุ่มข้างปุ่มบันทึก แสดงเมื่อมีข้อความที่บันทึกเองหรือกำลังแก้ |
| `settings.richMenu.resetToast` | กลับไปใช้ข้อความเริ่มต้นแล้ว | toast |
| `settings.richMenu.tooLong` | ข้อความยาวเกิน {max} ตัวอักษร | ใต้ช่อง |
| `settings.richMenu.preview` | ตัวอย่างการ์ดต้อนรับ | ป้ายแถว และชื่อของตัวอย่าง |
| `settings.richMenu.previewDesc` | ผู้ใช้เห็นการ์ดนี้ใน LINE หน้าตาจริงขึ้นกับแอป LINE ของผู้ใช้ | คำอธิบายแถว |

`{max}` คือ `HOW_TO_TEXT_MAX_CHARS` หรือ `WELCOME_TEXT_MAX_CHARS` ข้อความเริ่มต้นของสองช่อง ชื่อปุ่ม และข้อความคงที่ของการ์ด ("ยินดีต้อนรับสู่" และบรรทัดหมายเหตุ) เป็นข้อความที่ผู้ใช้เห็น จึงอยู่ที่ `src/core/domain/rich-menu.logic.ts` ที่เดียว ([line-messaging](line-messaging.md#rich-menu)) หน้าตั้งค่าได้ข้อความเริ่มต้นจาก `SettingsDto` และชื่อปุ่มกับข้อความคงที่จาก `src/contracts`

### คลังความรู้

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.kb.cardTitle` | ความรู้ที่ใช้ตอบ | หัวการ์ดแรกของแท็บความรู้และขอบเขต |
| `settings.kb.title` | คลังความรู้ | ป้ายแถวของปุ่มอัปโหลด และ `<caption>` ของตาราง |
| `settings.kb.description` | AI ใช้เนื้อหาจาก PDF เหล่านี้ตอบผู้ใช้ | คำอธิบาย |
| `settings.kb.upload` | อัปโหลด PDF | ปุ่ม |
| `settings.kb.uploadHint` | ไฟล์ PDF ไม่เกิน {maxMb} MB และไม่เกิน {maxPages} หน้า | ข้อความใต้ปุ่มที่เห็นตลอด และคำอธิบาย (`aria-describedby`) ของปุ่ม `{maxMb}` และ `{maxPages}` มาจาก `PDF_MAX_BYTES` และ `PDF_MAX_PAGES` |
| `settings.kb.uploading` | กำลังอัปโหลด | `aria-label` ของปุ่มขณะอัปโหลด |
| `settings.kb.usage` | ใช้ไป {used} จาก {limit} token | ใต้แถบการใช้ |
| `settings.kb.usageLabel` | Token ของคลังความรู้ | `aria-label` ของ meter |
| `settings.kb.colFile` | ชื่อไฟล์ | หัวตาราง |
| `settings.kb.colPages` | หน้า | หัวตาราง |
| `settings.kb.colTokens` | Token | หัวตาราง |
| `settings.kb.colStatus` | สถานะ | หัวตาราง |
| `settings.kb.statusProcessing` | กำลังอ่านไฟล์ | สถานะ |
| `settings.kb.statusReady` | พร้อมใช้ | สถานะ |
| `settings.kb.statusFailed` | ไม่สำเร็จ | สถานะ ตามด้วยเหตุผลจาก error catalog |
| `settings.kb.view` | ดูข้อความ | ปุ่มในแถว |
| `settings.kb.delete` | ลบ | ปุ่มในแถว |
| `settings.kb.retry` | ลองใหม่ | ปุ่มในแถวที่ไม่สำเร็จ ถ้อยคำตาม [knowledge-base](knowledge-base.md) |
| `settings.kb.retryHint` | เลือกไฟล์เดิมอีกครั้ง เพราะระบบไม่เก็บไฟล์ต้นฉบับ | tooltip ของปุ่มลองใหม่ |
| `settings.kb.empty` | ยังไม่มีไฟล์ในคลังความรู้ อัปโหลด PDF ที่มีข้อมูลที่อยากให้ AI ใช้ตอบผู้ใช้ | สถานะว่าง |
| `settings.kb.error` | โหลดคลังความรู้ไม่สำเร็จ | ตามด้วยปุ่ม `common.action.retry` |
| `settings.kb.textDialogSubtitle` | {pages} หน้า · {tokens} token · ข้อความที่ AI ใช้ตอบ แก้ไขไม่ได้ | บรรทัดรองของ dialog |
| `settings.kb.textDialogError` | โหลดข้อความของไฟล์นี้ไม่สำเร็จ | dialog ดูข้อความ |
| `settings.kb.deleteTitle` | ลบ “{fileName}” ออกจากคลังความรู้ | หัว dialog |
| `settings.kb.deleteBody` | AI จะไม่ใช้เนื้อหาของไฟล์นี้อีก ถ้าต้องการกลับมาต้องอัปโหลดใหม่ | เนื้อหา dialog |
| `settings.kb.deleteCancel` | เก็บไว้ | ปุ่มถอย |
| `settings.kb.deleteConfirm` | ลบไฟล์ | ปุ่มลงมือ |
| `settings.kb.deletedToast` | ลบไฟล์แล้ว | toast |

ข้อความ error ที่ตรวจใน browser (รหัสจาก `validatePdfFile`):

| Key | ข้อความ |
| --- | --- |
| `settings.kb.errors.not_pdf` | รองรับเฉพาะไฟล์ PDF |
| `settings.kb.errors.pdf_too_large` | ไฟล์ต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB |
| `settings.kb.errors.empty_file` | ไฟล์นี้ว่างเปล่า เลือกไฟล์อื่น |

ไฟล์ซ้ำ เกินจำนวนหน้า เกินเพดานของคลัง ไม่มีข้อความ และแปลงไม่สำเร็จ ใช้ข้อความจาก [error-catalog](../architecture/error-catalog.md)

### ค่าใช้จ่าย AI

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.usage.title` | ค่าใช้จ่าย AI | หัวการ์ดของแท็บค่าใช้จ่าย (แถวบนไม่แสดงซ้ำ) |
| `settings.usage.monthLabel` | เลือกเดือน | `aria-label` ของตัวเลือกเดือน |
| `settings.usage.colContact` | ผู้ใช้ | หัวตาราง |
| `settings.usage.colReplies` | ครั้งที่ AI ตอบ | หัวตาราง |
| `settings.usage.colTokens` | Token | หัวตาราง |
| `settings.usage.colCost` | ราคาโดยประมาณ | หัวตาราง |
| `settings.usage.openDetail` | ดูรายข้อความของ {name} | `aria-label` ของปุ่มในแถว |
| `settings.usage.ingestRow` | อ่านไฟล์คลังความรู้ | แถวแยก |
| `settings.usage.guardRow` | คัดกรองขอบเขตหัวข้อ | แถวแยก |
| `settings.usage.guardCount` | {n} ครั้ง | ป้ายรองของแถวคัดกรอง |
| `settings.usage.total` | รวมทั้งเดือน | แถวรวม |
| `settings.usage.avgPerReply` | เฉลี่ยต่อข้อความที่ AI ตอบ {usd} | ใต้ตาราง |
| `settings.usage.noResponse` | ส่งคำขอถึง AI แล้วไม่ได้คำตอบ {n} ครั้ง ผู้ให้บริการอาจคิดเงินครั้งเหล่านี้ ยอดรวมจึงอาจต่ำกว่าบิลจริง | ใต้ค่าเฉลี่ย เฉพาะเมื่อมีอย่างน้อยหนึ่งครั้ง |
| `settings.usage.disclaimer` | ราคาโดยประมาณเป็นดอลลาร์สหรัฐ จากตารางราคา ณ {date} | ใต้ตาราง |
| `settings.usage.empty` | เดือนนี้ AI ยังไม่ได้ตอบผู้ใช้ | สถานะว่าง |
| `settings.usage.error` | โหลดค่าใช้จ่าย AI ไม่สำเร็จ | ตามด้วยปุ่ม `common.action.retry` |
| `settings.usage.detailTitle` | {name} · {month} | หัว dialog รายข้อความ |
| `settings.usage.colTime` | เวลา | หัวตาราง dialog |
| `settings.usage.colModel` | โมเดล | หัวตาราง dialog |
| `settings.usage.colInput` | Input token | หัวตาราง dialog |
| `settings.usage.colOutput` | Output token | หัวตาราง dialog |
| `settings.usage.colCacheRead` | Cache read token | หัวตาราง dialog |
| `settings.usage.colCacheWrite` | Cache write token | หัวตาราง dialog |
| `settings.usage.colCost` | ราคาโดยประมาณ | ใช้ key เดียวกับตารางหลัก |
| `settings.usage.colOutcome` | ผล | หัวตาราง dialog |
| `settings.usage.outcome.ok` | ตอบแล้ว | `outcome = ok` |
| `settings.usage.outcome.handoff` | รอแอดมิน | `outcome = handoff` |
| `settings.usage.outcome.refused` | โมเดลปฏิเสธ | `outcome = refused` |
| `settings.usage.outcome.failed` | ไม่สำเร็จ | `outcome = failed` |
| `settings.usage.outcome.cancelled` | ไม่ได้ส่งเพราะ AI ถูกปิด | `outcome = cancelled` |
| `settings.usage.outcome.blocked` | ถูกกันเพราะนอกขอบเขตหัวข้อ | `outcome = blocked` |
| `settings.usage.detailEmpty` | ไม่มีรายการในเดือนนี้ | dialog ว่าง |
| `settings.usage.detailError` | โหลดรายข้อความไม่สำเร็จ | ตามด้วยปุ่ม `common.action.retry` |

### สถานะระบบ

| Key | ข้อความ | ใช้ที่ |
| --- | --- | --- |
| `settings.status.title` | สถานะระบบ | หัวการ์ดของแท็บสถานะระบบ |
| `settings.status.webhook` | รับ webhook ล่าสุด | ป้ายแถว |
| `settings.status.never` | ยังไม่เคยรับ | ค่า |
| `settings.status.lineError` | ข้อผิดพลาดล่าสุดของ LINE | ป้ายแถว |
| `settings.status.aiError` | ข้อผิดพลาดล่าสุดของ AI | ป้ายแถว |
| `settings.status.errorAt` | {message} · {dateTime} | ค่าของสองแถวบน |
| `settings.status.none` | ไม่มี | ค่า |
| `settings.status.budget` | งบ AI วันนี้ | ป้ายแถว |
| `settings.status.budgetValue` | {used} จาก {budget} | ค่า |
| `settings.status.database` | ฐานข้อมูล | ป้ายแถว |
| `settings.status.dbOk` | เชื่อมต่อได้ | ค่า (เมื่อเรียกสถานะระบบไม่ได้ ส่วนนี้แสดง `settings.status.error` แทน) |
| `settings.status.error` | โหลดสถานะระบบไม่สำเร็จ | ตามด้วยปุ่ม `common.action.retry` |
