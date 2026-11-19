# 0024: ลดขอบเขต: ข้อความสำเร็จรูป แผง Guardrails และข้อความปฏิเสธที่ตั้งเอง

> สถานะ: อนุมัติ · วันที่: 2026-11-19

## บริบท

เจ้าของงานทบทวนหน้าจอหลังรุ่นแรกและขอให้ตัดสามสิ่งที่ไม่จำเป็นสำหรับเครื่องมือทดสอบ LINE OA นี้ ทั้งสามยังไม่เคย deploy และไม่มีข้อมูลจริง

1. ข้อความสำเร็จรูป (E11 ส่วนแรก): ทั้งส่วนในหน้าตั้งค่าและปุ่มกับรายการในช่องตอบ
2. แผง Guardrails ในหน้าตั้งค่า ซึ่งแสดงตัวเลขของวันนี้แบบอ่านอย่างเดียว
3. ช่อง "ข้อความเมื่อถูกกัน" ของขอบเขตหัวข้อ ที่ [ADR 0020](0020-topic-guardrail-as-separate-check.md) ให้ร้านตั้งเอง

## การตัดสินใจ

1. ลบข้อความสำเร็จรูปทั้งหมด: หน้าจอ, endpoint `/api/canned-replies` ทั้งสาม, use case สามตัว, port `CannedReplyRepository`, adapter, รหัส error `canned_reply.*` และค่าคงที่ `CANNED_*` ตาราง `CannedReply` ถูก drop ใน migration ที่ห้า
2. เอาแผง Guardrails ออกจากหน้าจอ แต่เก็บ `GET /api/system/guardrails`, use case `GetGuardrailStats` และ method ของ repository ไว้ตามเดิม ตัวเลขจึงยังอ่านได้จาก API ที่ต้องมี cookie ([api-contract](../architecture/api-contract.md#get-apisystemguardrails)) ส่วนการป้องกันทุกชั้นไม่เปลี่ยน
3. ข้อความปฏิเสธเป็นประโยคคงที่ในโค้ด `guardRefusalText(particle)` คำลงท้ายตามคำที่เลือกในส่วน AI ตอบแทน แบบเดียวกับ `handoffText` field `guardRefusalText` ออกจาก PATCH `/api/settings` และ `SettingsDto` คอลัมน์ `Settings.guardRefusalText` ถูก drop ใน migration ที่ห้า

## ทางเลือกที่พิจารณา

- ซ่อนหน้าจอแต่เก็บ backend ของข้อความสำเร็จรูปไว้: เหลือโค้ดและตารางที่ไม่มีใครใช้และต้องดูแลต่อ
- ลบ endpoint ของ Guardrails ไปพร้อมแผง: เจ้าของงานต้องการเก็บตัวเลขไว้ให้ตรวจผ่าน API
- เก็บคอลัมน์ `guardRefusalText` ไว้โดยไม่ใช้: เจ้าของงานอนุมัติให้ drop เพราะไม่มีข้อมูลจริง

## ผลที่ตามมา

- จำนวน endpoint ลดจาก 34 เหลือ 30 และ use case ลดจาก 34 เหลือ 31 ([api-contract](../architecture/api-contract.md#endpoint), [backend](../architecture/backend.md#use-case))
- Migration ที่ห้าเป็นแบบทำลาย (มีบรรทัด `-- approved-destructive:`) โค้ดก่อน migration นี้อ่านคอลัมน์และตารางที่ถูก drop จึงย้อนกลับด้วยการ deploy รุ่นเก่าอย่างเดียวไม่ได้ ต้องเพิ่ม migration ที่สร้างคืน
- ข้อความปฏิเสธแก้ได้เฉพาะในโค้ดพร้อม spec

## จะทบทวนเมื่อ

เจ้าของงานต้องการข้อความตอบบ่อยสำหรับแอดมิน หรือต้องการให้แต่ละร้านตั้งข้อความปฏิเสธเอง
