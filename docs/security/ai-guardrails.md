# Guardrail ของ AI

> สถานะ: อนุมัติ · อัปเดตล่าสุด: 2026-11-19

เอกสารนี้จับคู่แนวปฏิบัติด้าน guardrail ของ AI เก้าข้อ (input validation, prompt-injection defence, data privacy, least privilege, structured output, grounding and verification, human-in-the-loop, observability และ continuous evaluation) กับสิ่งที่ระบบนี้ทำจริง แยกตามชั้น แนวปฏิบัติเหล่านี้มาจากกรอบทั่วไปอย่าง OWASP Top 10 for LLM Applications และ NIST AI RMF เอกสารนี้ไม่ได้อ้างรายละเอียดหรือข้อกำหนดเฉพาะจากกรอบเหล่านั้น เพราะยังไม่ได้ตรวจกับต้นฉบับ

ภัยและการรับมือของทั้งระบบอยู่ใน [threat-model](threat-model.md) ตัวเลขของวันนี้ของแต่ละชั้นไม่แสดงบนหน้าจอ ([ADR 0024](../adr/0024-scope-reductions.md)) ดูได้จาก: `GET /api/system/guardrails` ที่ต้องมี cookie ([api-contract](../architecture/api-contract.md#get-apisystemguardrails), [GetGuardrailStats](../architecture/use-cases.md#getguardrailstats)) ซึ่งรวมทุกชั้น, บรรทัด "วันนี้กันไป" ของส่วนขอบเขตหัวข้อ (ชั้นข้อมูลเข้า), แถวคัดกรองของส่วนค่าใช้จ่าย AI, ข้อผิดพลาดล่าสุดของ AI ในส่วนสถานะระบบ (ชั้นผลลัพธ์) และ log เหตุการณ์ `guard.blocked` และ `ai.reply.*` ([operations](../runbooks/operations.md))

## ชั้นข้อมูลเข้า (input)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Input validation | AI ตอบเฉพาะข้อความตัวอักษร ชนิดอื่นขึ้นรอแอดมิน, webhook ตรวจ signature และขนาด body ก่อนทำอย่างอื่น, ข้อความรัวถูกรวมก่อนเรียกโมเดล, ประวัติจำกัด `AI_HISTORY_LIMIT` ข้อความ | `shouldAiReply` ใน `ai-decision.logic.ts`, `ReceiveLineEvents`, `GenerateAiReply` | unit กลุ่ม "เงื่อนไข" และ "การรวมข้อความและล็อก" ของ `GenerateAiReply`, test ของ `ReceiveLineEvents`, E2E เส้นที่ 1 และ 3 |
| Prompt-injection defence | ข้อความของผู้ใช้และเนื้อหา PDF อยู่ในตำแหน่งข้อมูล คำสั่งระบบสั่งให้ถือเป็นข้อมูล ตัวคั่นถูก escape, ขอบเขตหัวข้อคัดกรองด้วยการเรียกโมเดลแยกที่ถือข้อความผู้ใช้เป็นข้อมูลและตอบไม่ผ่านเมื่อไม่แน่ใจ | `buildSystemInstructions`, `formatKnowledgeBase`, `buildGuardClassifierPrompt`, port `TopicGuard` ([ai-prompt ข้อ 2 และ 9](../specs/ai-prompt.md#9-prompt-ของขอบเขตหัวข้อ)) | unit ของฟังก์ชันใน `ai-prompt.logic.ts` และ `topic-guard.logic.ts`, unit กลุ่ม "ขอบเขตหัวข้อ" ของ `GenerateAiReply`, ชุดทดสอบของ port `TopicGuard`, E2E เส้นที่ 9, ข้อ C2 และ G4 ของชุดคำถามวัดคุณภาพ |

## ชั้นข้อมูล (data)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Data privacy | โมเดลเห็นเฉพาะประวัติของแชทนั้น (แยกตามผู้ใช้) ระบบมีบัญชี LINE OA เดียวจึงไม่มีการแยกข้อมูลระหว่างบัญชี, ตัวคัดกรองได้เฉพาะหัวข้อ ข้อความล่าสุด และบริบทไม่เกิน `GUARD_CONTEXT_TURNS` turn, log ไม่มีข้อความ ชื่อ prompt หรือคำตอบของ AI, credential ของ LINE เข้ารหัส | `MessageRepository.recentForAi`, `guardContextTurns`, port `Logger` ([ADR 0016](../adr/0016-logging-without-pii-and-status-in-db.md)), `SecretCipher` | unit "คำขอที่โมเดลได้รับ" และ "คำขอที่ `TopicGuard` ได้รับ" ของ `GenerateAiReply`, ชุดทดสอบของ port `Logger` (ทิ้ง key ที่ไม่อนุญาต), test ของ `SetLineCredentials` |

## ชั้นผลลัพธ์ (output)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Structured output | การตอบแชทและการคัดกรองใช้ structured output แล้วตรวจซ้ำด้วย zod ใน adapter ผลที่ไม่ตรง schema ถูกปฏิเสธ ไม่ถูกส่ง คำตอบถูกทำความสะอาดและจำกัดความยาว และแสดงเป็นข้อความล้วน | adapter ใน `src/adapters/claude/`, `sanitizeAiReply`, `usageOutcomeOf`, `guardVerdictOf` | unit กลุ่ม "ผลของโมเดล" และ "ขอบเขตหัวข้อ" ของ `GenerateAiReply`, ชุดทดสอบของ port `ChatModel` และ `TopicGuard` กับ stub, unit ของ `sanitizeAiReply` |
| Grounding and verification | คำสั่งระบบให้ยึด `<knowledge>` ก่อนเสมอ ห้ามเดาข้อมูลเฉพาะของบัญชีที่ไม่มีใน `<knowledge>` (ขอบเขต `knowledge_only` ตอบข้อเท็จจริงจาก `<knowledge>` เท่านั้น) และให้ส่งต่อแอดมินเมื่อไม่พบ เมื่อโมเดลส่งต่อ ระบบส่งข้อความคงที่แทนคำตอบของโมเดล รุ่นนี้ไม่มีการตรวจคำตอบกับคลังความรู้แบบกำหนดผลได้แน่นอน การยึดข้อมูลจึงพึ่งคำสั่งและการส่งต่อ | แม่แบบใน [ai-prompt ข้อ 2.2](../specs/ai-prompt.md#22-แม่แบบ), `handoffText`, `GenerateAiReply` ข้อ 14 | unit กรณี `needsAdmin` ของ `GenerateAiReply`, กลุ่ม A และ B ของชุดคำถามวัดคุณภาพ (ด้วยมือ) |

## ชั้นการกระทำ (action)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Least privilege | โมเดลไม่มีเครื่องมือ ไม่ค้นเว็บ ไม่แก้ข้อมูล ผลของโมเดลเป็นข้อความที่เสนอเท่านั้น backend เป็นผู้ตัดสินทุกการส่ง (kill switch, สวิตช์รายผู้ใช้, การติดตาม ตรวจซ้ำก่อนส่ง) ข้อกำหนด "อนุมัติก่อนลงมือ" จึงเป็นจริงด้วยการไม่ให้สิทธิ์ลงมือใดเลย ไม่ใช่ด้วยขั้นตอนอนุมัติ | คำขอของ adapter ไม่ส่ง `tools` ([domain-and-ports](../architecture/domain-and-ports.md#adapter-ของ-claude)), ข้อ 12 ของ `replyOnce` และ `sendGuardRefusal` | adapter test ของ `TopicGuard` ตรวจว่าคำขอไม่มี `tools` (ของการตอบแชทเป็นข้อกำหนดในตารางคำขอที่ตรวจตอน review ยังไม่มี test เฉพาะ), unit กลุ่ม "ตรวจซ้ำก่อนส่ง" ของ `GenerateAiReply`, E2E เส้นที่ 4 |

## ชั้นส่งต่อให้คน (human-in-the-loop)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Human-in-the-loop | ผู้ใช้ใหม่เริ่มด้วย AI ตอบแทนปิด, kill switch, AI หยุดเมื่อแอดมินตอบเอง, ทุกความล้มเหลวและทุกเรื่องที่ AI ไม่รู้ขึ้นรอแอดมินพร้อมเหตุผล, การคัดกรองที่ล้มเหลวปิดแบบปลอดภัยแล้วขึ้นรอแอดมิน, การตั้งหัวข้อเป็นของแอดมิน | `raiseHandoff`, `SendAdminMessage`, `SetContactAi`, `UpdateSettings` | unit ของ `SendAdminMessage`, `SetContactAi` และ `GenerateAiReply`, E2E เส้นที่ 3, 4 และ 9 |

## ชั้นการเฝ้าดู (monitoring)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Observability | ทุกการเรียกโมเดลมีแถว AiUsage พร้อม kind, outcome, error, token และต้นทุน, ข้อผิดพลาดล่าสุดของ AI อยู่ใน Settings, บรรทัดเหตุการณ์ในแชท, log ที่มีเฉพาะ field ที่อนุญาต (`guard.checked`, `guard.blocked`, `guard.failed`, `ai.model.called`), งบต่อวัน และ `GET /api/system/guardrails` ที่นับของวันนี้จากข้อมูลเหล่านี้ (ไม่มีหน้าจอแสดง) | `UsageRepository`, `GetGuardrailStats`, `GetSystemStatus`, `GetUsageReport` | test ของ `GetGuardrailStats`, `GetSettings` และ `GetUsageReport`, ชุดทดสอบของ `UsageRepository` และ `MessageRepository` กับ Postgres, E2E เส้นที่ 9 ขั้น 9.7 |

## ชั้นการประเมิน (evaluation)

| แนวปฏิบัติ | สิ่งที่ระบบนี้ทำ | อยู่ที่ไหน | ทดสอบด้วย |
| --- | --- | --- | --- |
| Continuous evaluation | ชุดคำถามวัดคุณภาพ 22 ข้อ (กลุ่ม A, B, C และ G) รันสองรอบ ขอบเขตหัวข้อปิดและเปิด แล้วเขียนตัวชี้วัด attack success rate, false-positive rate, task success rate, unauthorized-action rate และภาระเพิ่มด้านเวลาและค่าใช้จ่ายของการคัดกรอง ลงไฟล์ผลใน `docs/qa/` รันเมื่อเจ้าของงานสั่งเท่านั้น ไม่อยู่ใน CI จึง "ต่อเนื่อง" ในความหมายว่ารันซ้ำได้ทุกครั้งที่เปลี่ยน prompt หรือโมเดล ไม่ใช่รันอัตโนมัติ | `scripts/ai-eval.ts`, [ai-prompt ข้อ 8](../specs/ai-prompt.md#8-ชุดคำถามวัดคุณภาพ-ai) | unit ของฟังก์ชันเกณฑ์ผ่านใน `scripts/ai-eval.ts` ตัวเลขจริงมาจากการรันด้วยมือ ([test-strategy](../qa/test-strategy.md#ชุดคำถามวัดคุณภาพ-ai)) ตรรกะของสคริปต์มี unit test ใน `e2e/ai-eval.unit.ts` ([test-strategy](../qa/test-strategy.md#ชุดคำถามวัดคุณภาพ-ai)) |

## ข้อจำกัดที่ยอมรับ

- ขอบเขตหัวข้อเป็นตัวคัดกรองที่ใช้ prompt ไม่ปิดสนิท ผู้ที่ตั้งใจอาจผ่านได้ และอาจกันข้อความที่อยู่ในหัวข้อจริง ([topic-guard](../specs/topic-guard.md#สิ่งที่ไม่ทำและข้อจำกัด))
- ไม่มีการตรวจคำตอบกับคลังความรู้แบบกำหนดผลได้แน่นอน คำตอบที่ผิดแต่ตรง schema ยังถูกส่งได้
- ระบบมีบัญชี LINE OA เดียว จึงมีเฉพาะการแยกประวัติรายผู้ใช้ ไม่มีการแยกข้อมูลระหว่างบัญชี
- ไม่มีขั้นตอนอนุมัติก่อนส่ง เพราะ AI ไม่มีสิทธิ์ลงมือ และข้อความที่ AI ตอบถูกส่งทันทีเมื่อผ่านทุกเงื่อนไข
- ตัวชี้วัดของการประเมินมาจากคำถามจำนวนน้อยและรันด้วยมือเท่านั้น ไม่มีการเฝ้าดูคุณภาพบน production แบบอัตโนมัติ
- ไม่มีการแจ้งเตือน และไม่มีหน้าจอที่รวมตัวเลขของทุกชั้น ต้องเรียก `GET /api/system/guardrails` เอง ตัวเลขที่มาจากบรรทัดเหตุการณ์นับครั้งที่แชทขึ้นรอแอดมิน ไม่ใช่จำนวนข้อความ
