# เอกสารของ Test webchat application

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

โฟลเดอร์นี้คือ source of truth ของระบบ โค้ดต้องตรงกับเอกสาร ถ้าไม่ตรง ให้ถือว่าเป็น bug ของฝั่งใดฝั่งหนึ่งและต้องแก้

## ลำดับการอ่าน

1. [Requirement](product/requirements.md): โจทย์ ขอบเขต และสิ่งที่ไม่ทำ
2. [ภาพรวมสถาปัตยกรรม](architecture/overview.md): ส่วนประกอบและเส้นทางหลัก
3. [ADR](adr/): เหตุผลของการตัดสินใจแต่ละเรื่อง
4. [Specs](specs/): พฤติกรรมของแต่ละส่วน ([ui-screens](specs/ui-screens.md), [ui-copy](specs/ui-copy.md) และ [ai-prompt](specs/ai-prompt.md) ลงรายละเอียดของหน้าจอ ถ้อยคำ และ prompt)
5. สัญญาสำหรับการสร้าง: [domain-and-ports](architecture/domain-and-ports.md), [use-cases](architecture/use-cases.md), [api-contract](architecture/api-contract.md), [error-catalog](architecture/error-catalog.md), [data-model](architecture/data-model.md) และ [project-setup](architecture/project-setup.md)
6. การทดสอบ: [test-strategy](qa/test-strategy.md) และ [stubs-and-fixtures](qa/stubs-and-fixtures.md)
7. [แผนการสร้าง](plans/implementation-plan.md): ลำดับงานและสถานะ แล้ว [work-breakdown](plans/work-breakdown.md): ticket ที่หยิบไปทำได้ทันที

## แผนที่เอกสาร

| โฟลเดอร์ | เนื้อหา |
| --- | --- |
| `product/` | [requirements](product/requirements.md) |
| `architecture/` | [overview](architecture/overview.md), [backend](architecture/backend.md), [frontend](architecture/frontend.md), [data-model](architecture/data-model.md), [infrastructure](architecture/infrastructure.md), [project-setup](architecture/project-setup.md), [domain-and-ports](architecture/domain-and-ports.md), [use-cases](architecture/use-cases.md), [api-contract](architecture/api-contract.md), [error-catalog](architecture/error-catalog.md) |
| `specs/` | [access-gate](specs/access-gate.md), [line-messaging](specs/line-messaging.md), [webchat-inbox](specs/webchat-inbox.md), [admin-backoffice](specs/admin-backoffice.md), [ai-reply](specs/ai-reply.md), [topic-guard](specs/topic-guard.md), [knowledge-base](specs/knowledge-base.md), [usage-cost](specs/usage-cost.md), [ui-screens](specs/ui-screens.md), [ui-copy](specs/ui-copy.md), [ai-prompt](specs/ai-prompt.md) |
| `adr/` | บันทึกการตัดสินใจ เรียงตามเลข ล่าสุด: [0017](adr/0017-ibm-plex-until-line-seed-license-verified.md) (ถูกแทนที่โดย 0018), [0018](adr/0018-use-line-seed-sans-th.md) ฟอนต์ LINE Seed Sans TH, [0019](adr/0019-heic-conversion-with-heic-to.md) การแปลง HEIC ด้วย `heic-to`, [0020](adr/0020-topic-guardrail-as-separate-check.md) ขอบเขตหัวข้อเป็นการตรวจแยก, [0021](adr/0021-explicit-cache-marker-and-fallback-per-model.md) cache marker แบบระบุเองและการสลับโมเดลสำรองตามโมเดล (แทนบางข้อของ 0007) |
| `plans/` | [implementation-plan](plans/implementation-plan.md), [work-breakdown](plans/work-breakdown.md) |
| `guidelines/` | [code-style](guidelines/code-style.md), [ux-writing](guidelines/ux-writing.md), [pitfalls-and-prevention](guidelines/pitfalls-and-prevention.md) |
| `qa/` | [test-strategy](qa/test-strategy.md), [manual-test-script](qa/manual-test-script.md), [stubs-and-fixtures](qa/stubs-and-fixtures.md) |
| `security/` | [threat-model](security/threat-model.md), [ai-guardrails](security/ai-guardrails.md) |
| `runbooks/` | [line-oa-setup](runbooks/line-oa-setup.md), [deploy](runbooks/deploy.md), [operations](runbooks/operations.md) |
| `agent-memory/` | บันทึกงานที่ยังเปิดอยู่ ไม่ใช่ source of truth |
| `_templates/` | แม่แบบของ spec, ADR และแผน |

## กฎของเอกสาร

1. ข้อเท็จจริงหนึ่งเรื่องอยู่ที่เดียว ไฟล์อื่นลิงก์ไป ไม่คัดลอก เจ้าของแต่ละเรื่อง: type และ port อยู่ใน domain-and-ports, ขั้นตอนและรายการ test ของ use case อยู่ใน use-cases, endpoint DTO และ polling อยู่ใน api-contract, รหัส error และข้อความไทยของรหัส (รวมเหตุผลรอแอดมินและบรรทัดเหตุการณ์) อยู่ใน error-catalog, ตารางและ seed อยู่ใน data-model, dependency config และค่าของ constant ทุกตัวอยู่ใน project-setup, component test id และ logic ของหน้าเว็บอยู่ใน ui-screens, ถ้อยคำบนหน้าจออยู่ใน ui-copy, prompt อยู่ใน ai-prompt, stub fixture และขั้นตอน E2E อยู่ใน stubs-and-fixtures
2. ทุกไฟล์มีบรรทัดสถานะใต้หัวเรื่อง: `ร่าง`, `อนุมัติ` หรือ `สร้างแล้ว`
3. การตัดสินใจที่เปลี่ยนภายหลัง เขียน ADR ใหม่ และแก้สถานะของฉบับเก่าเป็น "ถูกแทนที่โดย"
4. `agent-memory/` เป็นบันทึกงาน เมื่องานจบให้ย้ายข้อสรุปเข้า spec หรือ ADR แล้วลบไฟล์
5. ไม่มีไฟล์ลอยที่ระดับบนของ `docs/` นอกจากไฟล์นี้
6. โค้ดที่เปลี่ยนพฤติกรรมต้องแก้เอกสารใน commit เดียวกัน
7. repo นี้เป็นสาธารณะ เอกสารต้องไม่มี credential, URL ภายใน หรือข้อมูลลูกค้าจริง
8. วันที่ในเอกสารใช้รูปแบบ `2026-11-18`

## อภิธานศัพท์

คำที่ใช้บนหน้าจออยู่ใน [ux-writing](guidelines/ux-writing.md) ส่วนคำด้านล่างใช้ในเอกสารและโค้ด

| คำ | ความหมาย |
| --- | --- |
| Contact | ลูกค้าหนึ่งคนบน LINE ซึ่งเท่ากับหนึ่งแชท |
| แอดมิน | คนของร้านที่ใช้ webchat |
| Kill switch | สวิตช์ "เปิดใช้ AI ทั้งระบบ" ในหน้าตั้งค่า |
| AI ตอบแทน | สวิตช์รายลูกค้าที่ให้ AI ตอบเอง |
| รอแอดมิน | สถานะของแชทที่ AI ตอบไม่ได้และต้องมีคนมาตอบ |
| คลังความรู้ | ข้อความที่แปลงจาก PDF ของร้าน ซึ่ง AI ใช้ตอบ |
| Port / Adapter | interface ที่แกนกลางประกาศ และตัวที่ต่อกับของจริง ตาม hexagonal |
| Reply token | token ใช้ครั้งเดียวที่ LINE แนบมากับข้อความขาเข้า ใช้ตอบกลับโดยไม่กินโควตา push |
| ขอบเขตหัวข้อ | Topic guardrail: เมื่อเปิด AI คุยได้เฉพาะหัวข้อที่ร้านกำหนด ตรวจด้วย port `TopicGuard` ก่อนการตอบ |
