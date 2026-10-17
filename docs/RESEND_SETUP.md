# ตั้งค่า Resend Free สำหรับ KorKru

เจ้าของเลือก Resend Free และผู้รับแจ้งเตือน `korkru.me@gmail.com` เมื่อใช้ถึงอย่างน้อย 80 ฉบับ/วัน เมื่อ 17 ตุลาคม 2026 ไม่มีการอัปเกรดแพ็กเกจหรือเปิดค่าใช้จ่ายส่วนเกินอัตโนมัติ

**สถานะ: เตรียมโค้ดแล้ว ยังไม่เปิดใช้งานจริง** ต้องสมัครบัญชี ยืนยันโดเมน ใส่ secret เปิด SMTP/webhook และ deploy ก่อน ไม่มีการเปลี่ยน Supabase/RLS หรือ migration ในงานนี้

## สมัครและยืนยันโดเมน

1. เปิด [สมัคร Resend](https://resend.com/signup) ใช้บัญชีที่เจ้าของควบคุม เช่น `korkru.me@gmail.com` และเลือก **Free**
2. ไป Domains → Add Domain แนะนำ **`mail.korkru.com`** เป็นโดเมนส่งแยกจากเว็บไซต์ (เป็นค่าที่เสนอให้ตั้ง ไม่ได้เพิ่มแล้ว)
3. ที่ Cloudflare DNS ของ `korkru.com` เพิ่ม record ตามที่ Resend แสดง **ชื่อ ชนิด และค่าจริงจากหน้าจอ** โดยเฉพาะ DKIM และ SPF/Return-Path ใช้ DNS only สำหรับ record ที่ตั้ง proxy ได้
4. อย่าแทน MX ของโดเมนหลักหรือ A/CNAME ของเว็บ อย่าใส่ SPF สอง TXT ในชื่อเดียวกัน เพิ่มเฉพาะชื่อย่อยที่ Resend ขอและรักษานโยบาย DMARC เดิม
5. รอ Resend ขึ้น **Verified** จากนั้นส่งจาก `KorKru <auth@mail.korkru.com>` ได้ ไม่ต้องซื้อกล่องรับเมลสำหรับที่อยู่นี้เพื่อส่งผ่าน Resend ผู้รับ Gmail รับได้ตามปกติ
6. ปิด **click tracking** ของโดเมนส่งอีเมลบัญชี เพื่อไม่ให้การติดตามเปลี่ยนลิงก์กู้รหัสผ่าน

อ้างอิง: [Verified domains](https://resend.com/docs/dashboard/domains/introduction), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

## เชื่อม Supabase SMTP

เริ่มบน **Staging Supabase และ `https://staging.korkru.com`** ด้วยบัญชีสังเคราะห์ตาม `.cursor/rules/staging-testing.mdc` ก่อน ไม่ใช้ข้อมูล Production ทดสอบ และแยก key/secret ตาม environment

1. Resend → API Keys → Create API Key ชื่อเช่น `korkru-production-supabase-smtp` เลือก **Sending access** และจำกัดโดเมนเป็น `mail.korkru.com`
2. เก็บ key `re_...` ใน secret manager ไม่ใส่ในแชท Git หรือ `NEXT_PUBLIC_*` ไม่ใช้รหัสผ่านบัญชี Gmail เป็น SMTP password
3. Supabase โปรเจกต์เป้าหมาย → Authentication → Email (หมวด Notifications) → SMTP Settings → Enable custom SMTP กรอก:

```text
Sender name: KorKru
Sender email: auth@mail.korkru.com
Host: smtp.resend.com
Port: 465
Username: resend
Password: Resend key แบบ Sending access
```

4. Auth → URL Configuration: Production Site URL เป็น `https://www.korkru.com` และ allow-list callback ที่โค้ดใช้ `https://www.korkru.com/auth/callback?next=/reset-password` ส่วน Staging แทน origin ด้วย `https://staging.korkru.com` ค่า `NEXT_PUBLIC_SITE_URL` ใน Vercel ต้องตรงกับ environment นั้น
5. รักษา `{{ .ConfirmationURL }}` ใน Reset Password template ตาม Supabase flow เดิม อย่าแทนด้วยลิงก์หน้า reset เปล่า ๆ ที่ไม่มีการยืนยันตัวตน
6. Supabase มี rate limit อีกชั้น: Custom SMTP เริ่มต้น 30 ฉบับ/ชั่วโมง ตรวจ Auth → Rate Limits และการป้องกันบอตก่อนปรับ ไม่ถือว่า Resend 100/วันทำให้ส่งติดกัน 100 ฉบับผ่าน Supabase ได้ทันที

Flow เดิม: `forgotPassword` → อีเมล recovery → `/auth/callback?next=/reset-password` แลก PKCE code เป็น server session → `/reset-password` → `updateUser` และ global sign-out ไม่ต้องสร้างระบบเก็บรหัสผ่านใหม่

อ้างอิง: [Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## เปิดอีเมลเตือนเมื่อใช้ถึง 80 ฉบับ

Webhook ทำงานเมื่ออีเมลส่ง/รับ แล้วอ่านยอดจริงจาก Usage API ไม่ต้องเพิ่ม cron หรือซื้อบริการตั้งเวลา

1. สร้าง Resend key **อีกใบ** ชื่อเช่น `korkru-production-quota-monitor` แบบ **Full access** เพราะ `GET /usage` ใช้ Sending access ไม่ได้ เก็บใบนี้เฉพาะ server แยกจาก SMTP key
2. ใน Vercel project ของ KorKru → Settings → Environment Variables เพิ่มเฉพาะ environment เป้าหมาย:

```dotenv
RESEND_QUOTA_ALERTS_ENABLED=true
RESEND_QUOTA_API_KEY=key_full_access_ที่เก็บเป็น_secret
RESEND_QUOTA_WEBHOOK_SECRET=signing_secret_ขึ้นต้น_whsec_
RESEND_QUOTA_ALERT_FROM=auth@mail.korkru.com
RESEND_QUOTA_ALERT_TO=korkru.me@gmail.com
```

3. Deploy โค้ดที่มี `/api/webhooks/resend` นี้ก่อน การใส่ env บนเว็บรุ่นเดิมไม่สร้าง route ให้ และการเปลี่ยน env ต้อง redeploy Runtime ใช้ Node.js 22 ขึ้นไปตาม requirement ของ `svix@2.8.0`
4. Resend → Webhooks → Add Webhook เลือก **`email.sent` และ `email.received`** ตั้ง URL ของ environment ที่ deploy แล้ว:
   - Staging: `https://staging.korkru.com/api/webhooks/resend`
   - Production หลัง Staging ผ่าน: `https://www.korkru.com/api/webhooks/resend`
5. นำ **Signing secret** ของ endpoint นั้นไปตั้ง `RESEND_QUOTA_WEBHOOK_SECRET` ใน Vercel และ redeploy อย่าใช้ key/secret ของ Staging ซ้ำใน Production
6. ต้องให้ Resend POST ถึง route ได้ ถ้ามี Vercel Deployment Protection/Cloudflare challenge ให้ใช้ข้อยกเว้น endpoint ตามวิธีของบริการ Route ใช้ลายเซ็น Svix ตรวจสิทธิ์ ไม่ใช้ session ครู/นักเรียน
7. Free มี webhook endpoint ได้ **1 แห่ง** จึงทดสอบ Staging ก่อนแล้วสลับ endpoint ตอน rollout ไม่สมัครหลายบัญชีเพื่อหลบโควตา Key/โดเมนใน team เดียวใช้โควตารวมกัน

## ระบบเตือนทำอะไรบ้าง

- รับเฉพาะ signed event ของวัน UTC ปัจจุบัน อ่าน `emails.daily.used` และเตือนเมื่อ **>= 80** รวมอีเมลส่ง/รับทั้ง Resend team ไม่ใช่เฉพาะการรีเซ็ตรหัสผ่าน
- ส่งไปอีเมลจาก server env เท่านั้น ไม่ใช้รายชื่อผู้รับใน webhook ไม่เก็บ/ส่งต่อเนื้อหาอีเมล ลิงก์รีเซ็ต หรือข้อมูลนักเรียน
- อีเมลเตือนเป็นภาษาไทย มีลิงก์ Usage/Billing กับเวลา reset ไทย ใช้โควตาเพิ่มอีก 1 ฉบับ (พบ 80 แล้วส่งเตือน ยอดเป็นอย่างน้อย 81)
- ใช้ idempotency key ตาม environment + วัน UTC และ payload คงที่ เพื่อป้องกัน retry/concurrent event ส่งซ้ำ Resend เก็บ key 24 ชั่วโมง ซึ่งครอบคลุมช่วงที่เหลือของ quota day
- อีเมลเตือนมี tag ให้ข้าม event ของตัวเอง ป้องกัน loop ข้าม old-day replay และหยุดการเตือนแบบ Free เมื่ออัปเกรดจนไม่มีเพดานรายวัน (`limit: null`)
- รอบ quota reset **00:00 UTC = 07:00 น. ไทย** ไม่ใช่เที่ยงคืนไทย เริ่มสิทธิ์เตือนวันใหม่ตอนนั้น
- ตรวจลายเซ็น/เวลาและจำกัด raw body 32 KiB ก่อนติดต่อ provider มี timeout และไม่ตาม redirect ตอบ 503 เมื่อ Usage API/การส่งเตือนล้มเหลวให้ Resend retry ไม่ log key/payload/รายชื่อ/เนื้อหาอีเมล

**ข้อจำกัด:** Webhook/Usage อาจมาช้าจึงไม่รับประกันว่าจะทันฉบับที่ 80 เป๊ะ อาจตรวจพบ 81 หรือสูงกว่า หากเต็ม 100 หรือโควตารายเดือนหมดก่อนส่งเตือน ก็อาจส่งเตือนด้วย Resend ใบเดิมไม่ได้ ยังไม่มีช่องทางสำรองนอกโควตา ต้องตรวจ failed webhook deliveries/server log การเปิด webhook หลังใช้ถึง 80 จะตรวจเมื่อมี event ใหม่ ไม่ย้อนหลังหรือตรวจเป็นช่วงเวลาเมื่อไม่มี event

API ตอบ `alert_accepted` แปลว่า Resend รับคำขอแล้ว ไม่ใช่ยืนยันว่าอีเมลถึง Gmail inbox (ยัง bounce/spam ได้) ควรตรวจ delivery log

## ตรวจบน Staging ก่อนเปิดจริง

1. ใช้บัญชีสังเคราะห์กดลืมรหัสผ่าน ตรวจอีเมล คลิกลิงก์กลับ **Staging** ตั้งรหัสใหม่และ login ด้วยรหัสใหม่ ตรวจลิงก์ใช้แล้ว/หมดอายุและการยืนยันรหัสไม่ตรง
2. ตรวจ signed `email.sent` ใน Resend ว่า webhook ได้ 200 และ `below_threshold` เมื่อยอดยังไม่ถึง 80 ตรวจ permissions/shape ของ Usage API จริงด้วย key ที่ตั้งค่าแล้ว
3. คำขอไม่มีลายเซ็น/ลายเซ็นปลอมต้องได้ 400 และไม่อ่าน Usage/ส่งอีเมล Missing configuration ได้ 503
4. ทดสอบ threshold ด้วย local mock tests (79/80/retry/concurrency) ไม่ส่ง 80 ฉบับจริง ไม่ลด threshold หรือทำให้โควตา Production หมดเพื่อทดสอบ
5. หลัง Staging ผ่านค่อยตั้ง key/secret ของ Production และ deploy ตาม release workflow การตรวจ Production ต้องเป็น read-only และขออนุมัติเจ้าของก่อนตามกติกาโปรเจกต์

## สถานะการตรวจในงานนี้

TypeScript ผ่าน; Vitest 276 ไฟล์ / 3,433 เคส (รวม monitor 33 เคส) ผ่าน; Webpack production build ผ่าน การเรียก Next HTTP จริงกับ provider จำลองผ่านยอด 79/80 การส่งซ้ำ ลายเซ็นปลอม และ provider ล้มเหลว; Next MCP ไม่พบ compilation/runtime errors หน้าเดิมเปิดได้ใน browser/React ไม่มีการส่งอีเมลภายนอก

Turbopack production build ค้างในสภาพแวดล้อมจำกัดจึงหยุดและใช้ Webpack ที่ผ่านแทน ยังไม่มี Resend account/key/signing secret ที่ตั้งค่าในงานนี้ จึงยังไม่ทดสอบส่งถึง Gmail หรือบริการจริง ไม่ได้ deploy และไม่มี migration

อ้างอิงตรวจ 17 ตุลาคม 2026: [Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage), [Verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [Email sent payload](https://resend.com/docs/webhooks/emails/sent), [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Retries](https://resend.com/docs/webhooks/retries-and-replays)
