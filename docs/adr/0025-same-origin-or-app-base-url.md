# 0025: ต้นทางของคำขอที่แก้ข้อมูล: same-origin หรือ APP_BASE_URL

> สถานะ: อนุมัติ · วันที่: 2026-11-19

## บริบท

กฎเดิมใน [api-contract](../architecture/api-contract.md#กติการ่วม) ให้คำขอ `/api/*` ที่ไม่ใช่ GET หรือ HEAD ผ่านเฉพาะเมื่อ header `Origin` เท่ากับ origin ของ `APP_BASE_URL` ตัวเดียว ใน production ครั้งแรกบน Vercel เจ้าของงานเปิดเว็บที่โดเมนของ Vercel ใส่รหัสถูก แต่ได้ "คำขอนี้ไม่ได้มาจากหน้าเว็บของระบบ" (`request.origin_forbidden`) เพราะค่าของตัวแปรไม่ตรงกับ address ที่ใช้จริง ความต่างเล็กน้อยใด ๆ (deployment เดียวมีหลายโดเมนบน Vercel, `/` ท้าย, `http` กับ `https`, พิมพ์ผิด, โดเมนของร้านที่เพิ่มทีหลัง) ทำให้ทุกคำขอที่แก้ข้อมูล รวมการเข้าระบบ ถูกปฏิเสธทั้งหมด

สิ่งที่สังเกตใน Next.js 16.4 แบบ standalone (`node server.js` ซึ่งเป็นสิ่งที่ Docker รัน): `request.url` และ `nextUrl.origin` ทั้งใน proxy.ts และ route handler เป็น address ที่ server bind (`http://0.0.0.0:3000`) ไม่ใช่ host ที่ browser ใช้ scheme ตาม `x-forwarded-proto` ส่วน host ที่ browser ใช้อยู่ใน `Host` และ Next.js เติม `x-forwarded-host` จาก `Host` และ `x-forwarded-proto` จาก socket ให้เมื่อคำขอไม่มี (ถ้ามีมาแล้วจะคงค่าเดิม) `x-forwarded-port` เป็น port ที่ server ฟัง ไม่ใช่ port ที่ browser ใช้ จึงไม่ใช้ค่านี้

## การตัดสินใจ

- คำขอผ่านเมื่อ `Origin` เป็น origin แบบ http(s) ที่ถูกรูป (ไม่มี path ไม่มีชื่อผู้ใช้ ไม่มี port ค่าเริ่มต้นที่เขียนเอง ตัวพิมพ์ของ host ไม่มีผล) และเท่ากับอย่างใดอย่างหนึ่ง: origin ของคำขอเอง (same-origin) หรือ origin ของ `APP_BASE_URL` ไม่มี `Origin` หรือเป็น `null` ยังถูกปฏิเสธ webhook ยังยกเว้นตามเดิม
- Origin ของคำขอเองประกอบจาก `x-forwarded-proto` (ไม่มีจึงใช้ scheme ของ `request.url`) และ `x-forwarded-host` (ไม่มีจึงใช้ `Host`) ค่าแรกเมื่อเป็นรายการคั่นด้วยจุลภาค host ที่ไม่ใช่ชื่อ host หรือ IPv6 ในวงเล็บถือว่าไม่รู้ origin และไม่ผ่านทางนี้ ไม่ใช้ `request.url` เป็น host เพราะเป็น address ที่ bind
- ทั้ง proxy.ts และตัวห่อ route ใช้ฟังก์ชันเดียว `isAllowedOrigin` ใน `src/composition/request-origin.ts` log `http.origin.rejected` และรหัส `request.origin_forbidden` คงเดิม
- `APP_BASE_URL` ถูก trim แล้วแปลงเป็น origin ตอนอ่าน environment (`/` ท้ายถูกตัด host เป็นตัวเล็ก port ค่าเริ่มต้นถูกตัด) ค่าที่ไม่ใช่ URL แบบ http(s) ที่สมบูรณ์ หรือมี path, query, fragment หรือชื่อผู้ใช้ ทำให้ `assertEnv()` ล้มพร้อมชื่อตัวแปร
- Webhook URL ในหน้าตั้งค่า, URL ของไฟล์ในที่เก็บแบบ local และ seed ยังใช้ `APP_BASE_URL` ไม่ใช้ origin ที่แอดมินกำลังเปิด เพราะ URL ที่ให้ LINE ต้องเป็นโดเมนถาวรของ production ส่วนโดเมนที่แอดมินบังเอิญเปิด (เช่น URL เฉพาะ deployment ของ Vercel) อาจเปลี่ยนทุก deploy การแสดงค่านั้นจึงชวนให้ตั้งผิดมากกว่า

ข้อสมมติเรื่องความไว้ใจ: บน Vercel header `Host`, `x-forwarded-host` และ `x-forwarded-proto` เขียนโดย proxy ของ Vercel ใน Docker หรือ `next start` ที่ไม่มี proxy ผู้เรียกเขียนเองได้ แต่หน้าเว็บของเว็บอื่นทำไม่ได้: browser ไม่ยอมให้หน้าเว็บตั้ง `Host` และการตั้ง header `X-Forwarded-*` ทำให้คำขอไม่ใช่ simple request browser จึงส่ง CORS preflight ก่อน ซึ่งแอปนี้ไม่เคยตอบด้วย `Access-Control-Allow-Headers` คำขอจริงจึงไม่ถูกส่ง โปรแกรมที่ไม่ใช่ browser ปลอมได้ทุก header รวม `Origin` แต่ไม่มี cookie ของแอดมิน การตรวจต้นทางกันคำขอข้ามเว็บที่ใช้ browser ของแอดมิน ไม่ได้กันสคริปต์ ([threat-model](../security/threat-model.md))

## ทางเลือกที่พิจารณา

- คงกฎเดิมแล้วให้ตั้ง `APP_BASE_URL` ให้ถูก: ค่าเดียวผิดนิดเดียวทำให้เข้าระบบไม่ได้เลย และ deployment เดียวมีหลายโดเมนตามธรรมชาติของ Vercel
- รายการ origin ที่อนุญาตหลายค่าใน environment variable ใหม่: ต้องเพิ่มตัวแปร และยังพลาดแบบเดิมได้เมื่อเพิ่มโดเมน
- เทียบเฉพาะ host แบบ `serverActions` ของ Next.js: ไม่จับ `http` กับ `https` ที่ต่างกัน
- ใช้ `nextUrl.origin`: เป็น address ที่ bind ใน standalone จึงไม่เคยตรงกับ `Origin` ของ browser
- ตัดการตรวจต้นทางเหลือ `SameSite=Lax`: Lax ไม่กันคำขอจาก subdomain อื่นของ site เดียวกัน และเป็นชั้นป้องกันเดียว

## ผลที่ตามมา

การเข้าระบบทำงานบนทุกโดเมนที่ชี้มาที่ deployment โดยไม่ขึ้นกับค่าของ `APP_BASE_URL` ส่วน `APP_BASE_URL` ที่ผิดยังทำให้ Webhook URL ที่แสดงผิด จึงต้องตรวจตาม [deploy](../runbooks/deploy.md) คำขอจากเว็บอื่นยังได้ 403 พฤติกรรมของ header บน Vercel จริงยังไม่ได้ยืนยัน

## จะทบทวนเมื่อ

ยืนยันบน Vercel แล้วพบว่า `x-forwarded-host` หรือ `x-forwarded-proto` ไม่ใช่ค่าที่ browser ใช้ หรือรับค่าจากผู้เรียกผ่านไป, มี proxy อีกชั้นหน้า Vercel, หรือแอปเริ่มตอบ CORS
