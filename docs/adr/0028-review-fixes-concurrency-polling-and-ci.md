# 0028: การนับก่อนตรวจ, ลำดับของ event, polling ต่อ query และการตรวจ migration ทุกไฟล์

> สถานะ: อนุมัติ · วันที่: 2026-11-19

## บริบท

การ review ทั้งโปรเจกต์พบข้อบกพร่องหลายข้อที่มีรากเดียวกัน: การตัดสินใจจากค่าที่อ่านก่อนแล้วจึงเขียน (การจำกัดการลองรหัส, การ publish rich menu, การกดปุ่มที่ LINE ส่งซ้ำ), การเชื่อลำดับที่ event ถูกประมวลผลแทนเวลาของ event (follow, unfollow, การกดปุ่มระหว่างรวมข้อความ), สถานะร่วมที่ใหญ่เกินไปในหน้าเว็บ (ตัวนับความล้มเหลวเดียวของ polling) และการตรวจใน CI ที่เทียบเฉพาะ commit กับ commit ก่อนหน้า บางข้อเปลี่ยนการตัดสินใจเดิมใน [ADR 0005](0005-polling-instead-of-realtime.md), [ADR 0006](0006-shared-access-code.md), [ADR 0013](0013-ci-on-main-then-deploy-hook.md), [ADR 0023](0023-retry-key-v5-window-and-reply-400.md) และ [ADR 0027](0027-rich-menu-and-welcome-card.md) โดยไม่แก้ ADR เหล่านั้น

## การตัดสินใจ

1. **การลองรหัสเข้าใช้นับก่อนเทียบรหัส** ทุกคำขอ `hit` แบบ atomic ก่อน คำขอที่ได้ count เกินค่าจำกัดถูกปฏิเสธโดยไม่เทียบรหัส รหัสถูก `refund` การนับของตัวเอง ใช้ทั้งถังต่อ IP และถังของคำขอที่ไม่มี IP (`RateLimitRepository.peek` ถูกแทนด้วย `refund`) แทนการอ่านก่อนเทียบของ ADR 0006 `ACCESS_CODE` ถูกตัดช่องว่างหน้าหลังตอนอ่าน environment และไม่มีความยาวขั้นต่ำ
2. **สถานะการติดตามเปลี่ยนตามเวลาของ event** `Contact.followStatusAt` เก็บเวลาของ event ที่ตั้งสถานะปัจจุบัน `setFollowStatus` เป็น compare-and-set ที่ไม่ยอมให้ event เก่ากว่าเปลี่ยนสถานะ ข้อความหรือการกดจากลูกค้าที่บันทึกว่าเลิกติดตามตั้งกลับเป็นติดตามอยู่พร้อมบรรทัด `contact.followed`
3. **การกดที่ตอบด้วยข้อความคงที่ไม่แทนข้อความของลูกค้า** การกด "คุยกับแอดมิน" และ "วิธีทดสอบ" ไม่ใช่ข้อความที่ AI ตอบ (`latestInbound` ข้าม) และในประวัติถูกวางก่อนข้อความที่ AI กำลังตอบ การกด "คุยกับ AI" เปิดสวิตช์ก่อนอ่านข้อความล่าสุด และ webhook อ่านสวิตช์หลังบันทึกข้อความ ข้อความที่มากับการกดจึงถูกตอบครั้งเดียว แถวของการกดมี key ของตัวเอง (`Message.webhookEventId`) การส่งซ้ำที่แข่งกับครั้งแรกจึงไม่สร้างแถวหรือคำตอบที่สอง
4. **Rich menu บันทึกด้วย compare-and-set บน id เดิม** การ publish ที่แพ้ตั้งเมนูของผู้ชนะเป็นค่าเริ่มต้นอีกครั้ง ลบเมนูของตัวเอง และตอบ `line.rich_menu_conflict` การตั้งค่าเริ่มต้นที่ไม่ได้คำตอบ (`line.unavailable`) ไม่ลบเมนูใหม่ แต่บันทึกไว้ให้การ publish หรือนำออกครั้งถัดไปลบ (เสริมข้อ 1 ของ ADR 0027)
5. **Credential ของ LINE ต้องเป็น channel เดียวกัน** การตรวจ Channel ID กับ Channel secret อ่านบอทของ channel ด้วย token ชั่วคราวก่อนเพิกถอน แล้วเทียบกับบอทของ Channel access token บอทต่างกันตอบ `line.channel_mismatch` และไม่บันทึก (เสริม ADR 0023)
6. **Polling นับความล้มเหลวต่อ query** query ที่ล้มถ่วงเวลาของตัวเอง query อื่นคงช่วงปกติ แถบการเชื่อมต่อแสดงเมื่อ query ใดล้มติดกันถึงเกณฑ์ การโหลดใหม่หลังกลับมาเชื่อมต่อได้เกิดเมื่อ query ที่เคยล้มสำเร็จเท่านั้น ครั้งเดียวต่อการกลับมา และห่างกันไม่น้อยกว่าช่วง polling ปกติ การโหลดใหม่ (แท็บกลับมาแสดงหรือกลับมาเชื่อมต่อได้) รวมหน้าแรกเข้ากับสิ่งที่โหลดไว้ ไม่ทิ้งหน้าที่เก่ากว่า (แทนบางข้อของ ADR 0005)
7. **CI ตรวจ migration ที่ทำลายข้อมูลทุกไฟล์ทุกรอบ** รอบที่เริ่มแล้วไม่ถูกยกเลิก (`cancel-in-progress: false`) งาน `deploy` เรียก Deploy Hook เฉพาะเมื่อ `main` ยังเป็น commit ที่ตรวจ และมีคำสั่ง `pnpm migrations:applied` ที่เทียบ checksum ของ migration ที่ apply แล้วในฐานข้อมูลจริงกับไฟล์ เพราะ `prisma migrate deploy` ไม่ปฏิเสธ migration ที่ถูกแก้หรือลบ (แทนบางข้อของ ADR 0013)
8. **ฐานข้อมูลทำงานเป็น UTC เสมอ** migration ตั้งค่าเริ่มต้นของ database (`ALTER DATABASE ... SET "TimeZone" TO 'UTC'`) แทนพารามิเตอร์ตอนเชื่อมต่อ เพราะ pooler แบบ transaction ไม่ส่งต่อพารามิเตอร์นั้นแน่นอน
9. **ไฟล์ที่อัปโหลดต้องครบขนาดที่ขอสิทธิ์** สิทธิ์อัปโหลดเซ็นขนาดที่แน่นอนของไฟล์ ที่เก็บแบบ local ปฏิเสธ body ที่สั้นกว่า (`upload.incomplete`) Vercel Blob จำกัดได้แค่ขนาดสูงสุด และ `experimental.proxyClientMaxBodySize` รับวิดีโอขนาดสูงสุดได้ เป้าหมายของ PUT เป็น path ไม่มี origin

## ทางเลือกที่พิจารณา

- ล็อกแยกต่อคำขอปลดล็อกหรือ publish: เพิ่มสถานะกลางทางที่ต้องมีการคืนสภาพ ขณะที่ compare-and-set ในคำสั่งเดียวไม่ค้าง
- ตั้ง `TimeZone` ด้วยพารามิเตอร์ `options` ใน connection string: pooler แบบ transaction ของ Neon ไม่รับประกันว่าส่งต่อ
- ให้ webhook สร้างงาน `ai_reply` ทุกข้อความแม้ AI ปิด: ปิดทุกช่องของการแข่งกันได้ แต่ทุกข้อความทำให้ function ค้างตลอดช่วงรวมข้อความ และเปลี่ยนพฤติกรรมเมื่อแอดมินเปิด AI ภายหลัง
- ใส่ `pnpm migrations:applied` ใน `vercel-build` ทันที: เป็นการแก้ค่า deploy ซึ่งต้องถามเจ้าของงานก่อน จึงเป็นคำสั่งที่ runbook ให้รันก่อน merge และหลัง CI ล้ม

## ผลที่ตามมา

- Migration ที่สิบเอ็ดเพิ่ม `Contact.followStatusAt`, `Message.webhookEventId` (unique), `Message.mediaFailure` กับ enum `MediaFailure`, index ของลำดับรายชื่อ, partial index ของ `aiState = 'replying'` และค่าเริ่มต้น `TimeZone` ของ database ทั้งหมดเป็นการเพิ่ม ([data-model](../architecture/data-model.md#migration-ที่สิบเอ็ด-ผลจากการ-review))
- รหัส error ใหม่: `line.channel_mismatch`, `line.rich_menu_conflict`, `upload.incomplete` ([error-catalog](../architecture/error-catalog.md))
- Port เปลี่ยน: `RateLimitRepository.refund` แทน `peek`, `ContactRepository.setFollowStatus` คืน boolean, `SettingsRepository.replaceRichMenu`, `MessagingGateway.verifyChannelSecret` คืนบอทของ channel, `FileStorage.issueUpload` รับขนาดที่แน่นอน
- การรวมหน้าแรกตอนโหลดใหม่เก็บแถวที่เก่ากว่าไว้ แถวเหล่านั้นอาจมีสถานะเก่าจนกว่าจะเปลี่ยนอีกครั้ง
- Rich menu ที่การตั้งค่าเริ่มต้นไม่ได้คำตอบอาจเหลือเมนูเดิมที่ไม่ได้เป็นค่าเริ่มต้นค้างที่ LINE (ไม่มีผลกับลูกค้า)

## จะทบทวนเมื่อ

- เจ้าของงานอนุมัติให้ใส่ `pnpm migrations:applied` ใน build ของ production
- LINE เปลี่ยนรูปแบบของ `GET /v2/bot/info` หรือ token แบบ client credentials
- มีมากกว่าหนึ่งแท็บที่ poll พร้อมกันจนการนับต่อ query ในแต่ละแท็บไม่พอ
