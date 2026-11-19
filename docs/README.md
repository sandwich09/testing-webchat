# เอกสารของ Test webchat application

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

โฟลเดอร์นี้คือ source of truth ของระบบ โค้ดต้องตรงกับเอกสาร ถ้าไม่ตรง ให้ถือว่าเป็น bug ของฝั่งใดฝั่งหนึ่งและต้องแก้

## ลำดับการอ่าน

1. [Requirement](product/requirements.md): โจทย์ ขอบเขต และสิ่งที่ไม่ทำ
2. [ภาพรวมสถาปัตยกรรม](architecture/overview.md): ส่วนประกอบและเส้นทางหลัก
3. [ADR](adr/): เหตุผลของการตัดสินใจแต่ละเรื่อง
4. [Specs](specs/): พฤติกรรมของแต่ละส่วน ([ui-screens](specs/ui-screens.md), [ui-copy](specs/ui-copy.md) และ [ai-prompt](specs/ai-prompt.md) ลงรายละเอียดของหน้าจอ ถ้อยคำ และ prompt)
5. สัญญาสำหรับการสร้าง: [domain-and-ports](architecture/domain-and-ports.md), [use-cases](architecture/use-cases.md), [api-contract](architecture/api-contract.md), [error-catalog](architecture/error-catalog.md), [data-model](architecture/data-model.md) และ [project-setup](architecture/project-setup.md)
6. การทดสอบ: [test-strategy](qa/test-strategy.md), [stubs-and-fixtures](qa/stubs-and-fixtures.md) และ [manual-test-script](qa/manual-test-script.md)
7. [แผนการสร้าง](plans/implementation-plan.md): ลำดับงานและสถานะ แล้ว [work-breakdown](plans/work-breakdown.md): ticket ที่หยิบไปทำได้ทันที

## แผนที่เอกสาร

| โฟลเดอร์ | เนื้อหา |
| --- | --- |
| `product/` | [requirements](product/requirements.md) |
| `architecture/` | [overview](architecture/overview.md), [backend](architecture/backend.md), [frontend](architecture/frontend.md), [data-model](architecture/data-model.md), [infrastructure](architecture/infrastructure.md), [project-setup](architecture/project-setup.md), [domain-and-ports](architecture/domain-and-ports.md), [use-cases](architecture/use-cases.md), [api-contract](architecture/api-contract.md), [error-catalog](architecture/error-catalog.md) |
| `specs/` | [access-gate](specs/access-gate.md), [line-messaging](specs/line-messaging.md), [webchat-inbox](specs/webchat-inbox.md), [admin-backoffice](specs/admin-backoffice.md), [ai-reply](specs/ai-reply.md), [topic-guard](specs/topic-guard.md), [knowledge-base](specs/knowledge-base.md), [usage-cost](specs/usage-cost.md), [ui-screens](specs/ui-screens.md), [ui-copy](specs/ui-copy.md), [ai-prompt](specs/ai-prompt.md) |
| `adr/` | บันทึกการตัดสินใจ เรียงตามเลข: [0001](adr/0001-docs-as-source-of-truth.md) เอกสารเป็น source of truth, [0002](adr/0002-single-nextjs-app-on-vercel.md) Next.js แอปเดียวบน Vercel, [0003](adr/0003-hexagonal-architecture.md) โครงสร้างแบบ hexagonal, [0004](adr/0004-postgres-neon-and-prisma.md) PostgreSQL บน Neon กับ Prisma 7, [0005](adr/0005-polling-instead-of-realtime.md) polling แทน real-time (บางข้อแทนที่โดย 0028), [0006](adr/0006-shared-access-code.md) รหัสเข้าใช้ร่วมกัน (บางข้อแทนที่โดย 0028), [0007](adr/0007-ai-provider-port-and-default-model.md) port ของผู้ให้บริการ AI และโมเดลเริ่มต้น (บางข้อแทนที่โดย 0021 และ 0026), [0008](adr/0008-knowledge-base-without-embeddings.md) คลังความรู้แบบไม่ใช้ embedding, [0009](adr/0009-media-in-vercel-blob.md) สื่อใน Vercel Blob, [0010](adr/0010-reply-token-first-and-idempotency.md) reply token ก่อน push และกันการส่งซ้ำ, [0011](adr/0011-two-level-ai-switch-and-daily-budget.md) สวิตช์ AI สองระดับและงบต่อวัน, [0012](adr/0012-testing-with-fakes-and-stubs.md) ทดสอบด้วยตัวปลอมและ stub, [0013](adr/0013-ci-on-main-then-deploy-hook.md) CI บน main แล้วเรียก Deploy Hook (บางข้อแทนที่โดย 0028), [0014](adr/0014-ui-stack-and-theme.md) เครื่องมือ UI และ theme, [0015](adr/0015-thai-only-ui-and-doc-language.md) UI ภาษาไทยและภาษาของเอกสาร, [0016](adr/0016-logging-without-pii-and-status-in-db.md) log ไม่มีข้อมูลส่วนบุคคล, [0017](adr/0017-ibm-plex-until-line-seed-license-verified.md) (ถูกแทนที่โดย 0018), [0018](adr/0018-use-line-seed-sans-th.md) ฟอนต์ LINE Seed Sans TH, [0019](adr/0019-heic-conversion-with-heic-to.md) การแปลง HEIC ด้วย `heic-to`, [0020](adr/0020-topic-guardrail-as-separate-check.md) ขอบเขตหัวข้อเป็นการตรวจแยก (บางข้อแทนที่โดย 0024), [0021](adr/0021-explicit-cache-marker-and-fallback-per-model.md) cache marker แบบระบุเองและการสลับโมเดลสำรองตามโมเดล (แทนบางข้อของ 0007), [0022](adr/0022-client-ip-from-last-forwarded-hop.md) IP ของผู้เรียกจากค่าสุดท้ายของ `x-forwarded-for`, [0023](adr/0023-retry-key-v5-window-and-reply-400.md) retry key แบบ UUID version 5, หน้าต่าง 24 ชั่วโมง, การแยก 400 ของ reply และการตรวจ Channel secret (เสริม 0010), [0024](adr/0024-scope-reductions.md) ลดขอบเขต: ข้อความสำเร็จรูป แผง Guardrails และข้อความปฏิเสธที่ตั้งเอง (แทนบางข้อของ 0020), [0025](adr/0025-same-origin-or-app-base-url.md) ต้นทางของคำขอที่แก้ข้อมูลเป็น same-origin หรือ `APP_BASE_URL`, [0026](adr/0026-neutral-core-prompt-and-layered-settings.md) แกนของคำสั่งที่เป็นกลาง คำแนะนำสำหรับ AI ขอบเขตคำตอบ ชื่อ AI การทักทาย และโมเดลเริ่มต้น (แทนบางข้อของ 0007, เสริม 0020), [0027](adr/0027-rich-menu-and-welcome-card.md) rich menu และการ์ดต้อนรับจัดการจาก webchat ด้วย postback ชุดเดียว, [0028](adr/0028-review-fixes-concurrency-polling-and-ci.md) การนับก่อนตรวจ ลำดับของ event polling ต่อ query และการตรวจ migration ทุกไฟล์ (แทนบางข้อของ 0005, 0006, 0013 เสริม 0023, 0027) |
| `plans/` | [implementation-plan](plans/implementation-plan.md), [work-breakdown](plans/work-breakdown.md) |
| `guidelines/` | [code-style](guidelines/code-style.md), [ux-writing](guidelines/ux-writing.md), [pitfalls-and-prevention](guidelines/pitfalls-and-prevention.md) |
| `qa/` | [test-strategy](qa/test-strategy.md), [manual-test-script](qa/manual-test-script.md), [stubs-and-fixtures](qa/stubs-and-fixtures.md) |
| `security/` | [threat-model](security/threat-model.md), [ai-guardrails](security/ai-guardrails.md) |
| `runbooks/` | [line-oa-setup](runbooks/line-oa-setup.md), [deploy](runbooks/deploy.md), [operations](runbooks/operations.md) |
| `agent-memory/` | บันทึกงานที่ยังเปิดอยู่ ไม่ใช่ source of truth เริ่มจาก [แม่แบบ](agent-memory/_template.md) |
| `_templates/` | แม่แบบของ [spec](_templates/feature-spec-template.md), [ADR](_templates/adr-template.md) และ [แผน](_templates/implementation-plan-template.md) |

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
| แอดมิน | คนของบัญชี LINE OA ที่ใช้ webchat |
| Kill switch | สวิตช์ "เปิดใช้ AI ทั้งระบบ" ในหน้าตั้งค่า |
| AI ตอบแทน | สวิตช์รายลูกค้าที่ให้ AI ตอบเอง |
| รอแอดมิน | สถานะของแชทที่ AI ตอบไม่ได้และต้องมีคนมาตอบ |
| คลังความรู้ | ข้อความที่แปลงจาก PDF ที่แอดมินอัปโหลด ซึ่ง AI ใช้ตอบ |
| Port / Adapter | interface ที่แกนกลางประกาศ และตัวที่ต่อกับของจริง ตาม hexagonal |
| Reply token | token ใช้ครั้งเดียวที่ LINE แนบมากับข้อความขาเข้า ใช้ตอบกลับโดยไม่กินโควตา push |
| ขอบเขตหัวข้อ | Topic guardrail: เมื่อเปิด AI คุยได้เฉพาะหัวข้อที่แอดมินกำหนด (คำทักทายสั้น ๆ ผ่านได้) ตรวจด้วย port `TopicGuard` ก่อนการตอบ |
