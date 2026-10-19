# ตั้งค่า Resend Free สำหรับ KorKru

เจ้าของเลือก Resend Free และผู้รับแจ้งเตือน `korkru.me@gmail.com` เมื่อ 17 ตุลาคม 2026 และวันที่ 18 ตุลาคมเปลี่ยนระดับสุดท้ายจาก 97% เป็น **95%** พร้อมขอให้ตรวจ **ทั้งรายวันและรายเดือน** ระดับปัจจุบันจึงเป็น **80%, 90%, 95%** แยกต่อช่วง สำหรับ Free 100 ฉบับ/วัน คือ 80, 90, 95 ฉบับ และ 3,000 ฉบับ/เดือน คือ 2,400, 2,700, 2,850 ฉบับ ([Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage)) ไม่มีการอัปเกรดแพ็กเกจหรือเปิดค่าใช้จ่ายส่วนเกินอัตโนมัติ

**สถานะล่าสุด 19 ตุลาคม 2026: Staging SMTP และ recovery core flow ผ่าน; apply ledger ใหม่บน Staging แล้ว; เปิด quota flag เฉพาะ Staging เพื่อทดสอบ; กำลัง deploy รุ่นใหม่และรอ signed provider delivery** โค้ดตรวจรายวันและรายเดือนเตรียมแล้ว แต่ยังไม่อ้างว่าอ่าน Usage API หรือรับ signed webhook จาก Resend จริงผ่าน งาน SEB ยังพัก และยังไม่เปิด Production SMTP หรือ Google

- บัญชี Resend สร้างแล้ว; `mail.korkru.com` ขึ้น Verified ใน region Tokyo ตรวจ public DNS พบ TXT `resend._domainkey.mail`, CNAME `rsend.mail` → `rsend-apne1.forge.rmta.net` และ `send.mail` → `send.forge.rmta.net` โดย CNAME เป็น DNS only
- เจ้าของสร้าง Sending access key และกรอก custom SMTP เอง ไม่ส่ง key มาในแชท การอ่าน configuration ยืนยัน Staging ใช้ `smtp.resend.com:465`, username `resend`, sender `auth@mail.korkru.com`, ชื่อ `KorKru Staging` และมี SMTP password โดยไม่อ่าน/บันทึกค่าลับ
- Staging Site URL เป็น `https://staging.korkru.com`, email autoconfirm ปิด, Require current password เปิด และ signup/recovery templates ยังคง `{{ .ConfirmationURL }}` ตามเดิม
- **เจ้าของรายงานว่าได้รับอีเมลสมัคร กดยืนยัน และเข้า Staging สำเร็จแล้ว** และวันที่ 18 ตุลาคมทดสอบ recovery ด้วยอีเมลใหม่ผ่าน: ได้รับอีเมล → เปิด reset form → ลองรหัสเดิมมีคำเตือนใต้ช่อง → ส่งรหัสอื่น → หน้า login มี banner “เปลี่ยนรหัสผ่านแล้ว” ตามภาพเวลา 22:10:54 → เข้าได้ด้วยรหัสใหม่ที่กรอกไว้ ต่อมายืนยันว่ารหัสก่อน reset รอบล่าสุดถูกปฏิเสธด้วย “อีเมลหรือรหัสผ่านไม่ถูกต้อง” ตามภาพเวลา 22:17:18 และรหัสใหม่ยังเข้าได้ตามปกติ เป็น manual/owner-reported proof พร้อมภาพ แยกจาก independent hosted E2E ส่วนลิงก์ใช้แล้วซ้ำ/หมดอายุยังไม่ได้รายงาน; quota-alert delivery ยังต้องตรวจต่อ
- เจ้าของตั้ง `RESEND_QUOTA_API_KEY`, `RESEND_QUOTA_WEBHOOK_SECRET`, `RESEND_QUOTA_ALERT_FROM`, `RESEND_QUOTA_ALERT_TO` แล้ว ทั้งสี่รายการคงไว้เฉพาะ **Vercel Preview → gitBranch `staging`** และนำสำเนาที่ผูก Preview กว้างออก และเปลี่ยน flag เฉพาะ Staging เป็น `RESEND_QUOTA_ALERTS_ENABLED=true` สำหรับ integration test (ต้อง deploy จึงมีผล) ไม่อ่าน/บันทึกค่าลับลงเอกสาร การตั้งค่านี้ยังไม่พิสูจน์ว่า deployment ใช้ค่าใหม่หรือ provider เชื่อมสำเร็จ
- Apply เฉพาะ **`20261018154826_resend_quota_alert_delivery_ledger.sql`** บน Staging แล้ว ตรวจ history รวม 162 รายการ พร้อม RLS และสิทธิ์ RPC แบบ service-only ผ่าน ไม่ apply/replay migration SEB หรือเปลี่ยน schema งานนั้น public webhook URL พร้อมแล้วตามด้านล่าง กำลัง deploy ให้รับ configuration ใหม่ก่อนทดสอบ signed delivery จริง

รอบ release ก่อนมี migration จำกัดคำขอส่งอีเมลและ `AUTH_FLOW_SECRET` พร้อมแล้ว อ่าน `docs/AUTH_SIGNUP_ROLLOUT.md` ประกอบ; SMTP เพียงอย่างเดียวไม่ทดแทน dependency ของ email actions

## URL รับ webhook สำหรับ Staging — 19 ตุลาคม 2026

ใช้ `https://jk-resend-staging-korkru-mes-projects.vercel.app/api/webhooks/resend` แทน URL เว็บ Staging เดิมที่ติด Vercel sign-in โดยแก้ endpoint เดิมใน Resend และคง events `email.sent`, `email.received` พร้อม signing secret เดิม โดเมนนี้ verified และผูก project `jk` กับ gitBranch `staging` จึงตาม Staging release ถัดไป ไม่ต้องตั้ง DNS เพิ่ม

ก่อนเปิดข้อยกเว้น ได้สร้างและเปิด WAF rule เฉพาะ hostname นี้: ปฏิเสธทุก path ที่ไม่ใช่ `/api/webhooks/resend` หรือ method ที่ไม่ใช่ POST จากนั้นเปิด alias-scoped `alias-protection-override` เฉพาะ alias นี้ ไม่แก้ project automation bypass หรือปิด protection ของทั้งเว็บ Probe ก่อน deploy รุ่นใหม่: GET หน้าแรก/login/webhook ได้403; unsigned POST ถึงแอปได้503 `not_configured` ของรุ่นที่ยังปิด flag; URL `staging.korkru.com` เดิมยังได้401 จึงยังไม่ถือว่า signed delivery ผ่าน

WAF config `waf_0G4wivLDsFkX` version1, rule `rule_korkru_staging_resend_webhook_alias_only_MC7lhU` เป็น rule เดียวที่เพิ่ม เริ่มต้นไม่มี active/draft custom config หากยกเลิกให้ revoke alias protection override ก่อนแก้/ลบ guard และไม่เปิด route อื่นบน alias นี้ Production deployment, credentials และฐานข้อมูลไม่เปลี่ยนจากงานนี้

## สมัครและยืนยันโดเมน

1. เปิด [สมัคร Resend](https://resend.com/signup) ใช้บัญชีที่เจ้าของควบคุม เช่น `korkru.me@gmail.com` และเลือก **Free**
2. ไป Domains → Add Domain ใช้ **`mail.korkru.com`** เป็นโดเมนส่งแยกจากเว็บไซต์ (บัญชีนี้ยืนยันแล้วใน Tokyo)
3. ที่ Cloudflare DNS ของ `korkru.com` เพิ่ม record ตามที่ Resend แสดง **ชื่อ ชนิด และค่าจริงจากหน้าจอ** โดยเฉพาะ DKIM และ SPF/Return-Path ใช้ DNS only สำหรับ record ที่ตั้ง proxy ได้
4. อย่าแทน MX ของโดเมนหลักหรือ A/CNAME ของเว็บ อย่าใส่ SPF สอง TXT ในชื่อเดียวกัน เพิ่มเฉพาะชื่อย่อยที่ Resend ขอและรักษานโยบาย DMARC เดิม
5. รอ Resend ขึ้น **Verified** จากนั้นส่งจาก `KorKru <auth@mail.korkru.com>` ได้ ไม่ต้องซื้อกล่องรับเมลสำหรับที่อยู่นี้เพื่อส่งผ่าน Resend ผู้รับ Gmail รับได้ตามปกติ
6. คง click/open tracking ไม่เปิดสำหรับอีเมลบัญชี ภาพ UI ปัจจุบันแสดง **Enable tracking metrics / Configure** โดยยังไม่ตั้งค่า ไม่ต้องหาสวิตช์ Off เพิ่ม: Resend ระบุว่าทั้งสองชนิดปิดเป็นค่าเริ่มต้น ([Custom Tracking Domains](https://resend.com/blog/introducing-custom-tracking-domain))

อ้างอิง: [Verified domains](https://resend.com/docs/dashboard/domains/introduction), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

## เชื่อม Supabase SMTP

เริ่มบน **Staging Supabase และ `https://staging.korkru.com`** ด้วยบัญชีสังเคราะห์ตาม `.cursor/rules/staging-testing.mdc` ก่อน ไม่ใช้ข้อมูล Production ทดสอบ และแยก key/secret ตาม environment

1. Resend → API Keys → Create API Key ชื่อเช่น `korkru-staging-supabase-smtp` เลือก **Sending access** และจำกัดโดเมนเป็น `mail.korkru.com` แยก Production key เมื่อตั้ง environment นั้น
2. เก็บ key `re_...` ใน secret manager ไม่ใส่ในแชท Git หรือ `NEXT_PUBLIC_*` ไม่ใช้รหัสผ่านบัญชี Gmail เป็น SMTP password
3. Supabase โปรเจกต์เป้าหมาย → Authentication → Email (หมวด Notifications) → SMTP Settings → Enable custom SMTP กรอก:

```text
Sender name: KorKru Staging
Sender email: auth@mail.korkru.com
Host: smtp.resend.com
Port: 465
Username: resend
Password: Resend key แบบ Sending access
```

4. Auth → URL Configuration: Site URL และ `NEXT_PUBLIC_SITE_URL` ต้องตรง environment (`https://staging.korkru.com` หรือ `https://www.korkru.com`) รักษา redirect allowlist ให้รองรับ callback ที่แอปสร้างพร้อม query แบบ dynamic ไม่จำกัดเป็นลิงก์ reset คงที่ที่ทำ `recovery_nonce` หาย
5. รักษา `{{ .ConfirmationURL }}` ใน signup และ recovery templates ตาม flow เดิม โดย recovery ต้องส่งต่อ callback ของคำขอพร้อม `next=/reset-password` และ `recovery_nonce` ที่แอปสร้างใหม่แต่ละครั้ง อย่าแทนด้วย hardcoded callback หรือลิงก์หน้า reset เปล่า ๆ
6. Supabase มี rate limit อีกชั้น: Custom SMTP เริ่มต้น 30 ฉบับ/ชั่วโมง ตรวจ Auth → Rate Limits และการป้องกันบอตก่อนปรับ ไม่ถือว่า Resend 100/วันทำให้ส่งติดกัน 100 ฉบับผ่าน Supabase ได้ทันที

Recovery contract: `forgotPassword` หรือขอตั้งรหัสจาก settings สร้าง HMAC intent อายุ 1 ชั่วโมงและ nonce → อีเมลผ่าน `{{ .ConfirmationURL }}` → callback ที่รักษา `recovery_nonce` และ `next=/reset-password` → ตรวจ intent/nonce, PKCE ในเบราว์เซอร์เดิม และ recipient/expected user ID → grant 10 นาที → `/reset-password` → `updateUser` และพยายาม global sign-out ลิงก์เก่าที่ไม่มี nonce ต้องขอใหม่ และไม่รับประกันว่า JWT เดิมถูกยกเลิกทันที

อ้างอิง: [Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## เตรียมแจ้งเตือน 80%, 90%, 95% ทั้งสองช่วง

**สถานะ 19 ตุลาคม: ledger apply เฉพาะ Staging และตรวจ RLS/service-only RPC แล้ว; โค้ดรวม Staging build ผ่าน; flag ยังปิด** รุ่นเดิมตรวจรายวันเท่านั้น รุ่นใหม่นี้ต้องมี durable delivery ledger ก่อนเปิด flag มิฉะนั้นหยุดส่งแทนการเสี่ยงส่งซ้ำ ไม่เพิ่ม cron หรือซื้อบริการตั้งเวลา Webhook เป็นตัวกระตุ้นให้อ่านยอดจริงจาก Usage API จึงไม่มีการตรวจเป็นช่วงเวลาขณะที่ไม่มี event Deployment/public endpoint และ provider integration ยังอยู่ระหว่างเตรียม

ทำทีละขั้นบน Staging ก่อน โดยไม่ส่ง key/secret มาในแชท:

1. **เสร็จแล้ว:** เจ้าของสร้าง **`korkru-staging-quota-monitor`** แบบ **Full access** และเก็บค่าใน Vercel เอง `GET /usage` ใช้ Sending access ไม่ได้ จึงแยกจาก SMTP key ที่จำกัดโดเมน ไม่ต้องสร้างซ้ำหรือส่งค่า key ในแชท
2. **เสร็จแล้วเฉพาะ Staging:** ปล่อย migration CLI **`20261018154826_resend_quota_alert_delivery_ledger.sql`** เพียงไฟล์เดียว ตรวจ history รวม **162 รายการ**, ledger เปิด RLS, browser ไม่มี direct grants และ RPC เปิดเฉพาะ service role ผ่านแล้ว ก่อนหน้านี้ CLI `migration list --linked` ติด `LegacyProjectNotLinkedError` และ live history เทียบไฟล์มีความต่าง จึงไม่ได้ใช้ db push/reset/replay เพื่อข้ามความต่างหรือปล่อย migration SEB ที่พักไว้ หลักฐาน apply รอบนี้ไม่ครอบคลุม Production
3. **ตั้งแล้ว:** Vercel project **`jk`** → Settings → Environment Variables มี API key/signing secret/from/to **เฉพาะ Preview ของ gitBranch `staging`** แล้ว ไม่เพิ่มสำเนา Preview แบบทุก branch อีก รักษา flag เดิม `false` จน ledger, deployment และ public endpoint พร้อมก่อนเปิดทดสอบจริง ทุกค่าเป็น server-only:

```dotenv
KORKRU_DEPLOYMENT_ENV=staging
RESEND_QUOTA_ALERTS_ENABLED=false
RESEND_QUOTA_API_KEY=key_full_access_ที่เก็บเป็น_secret
RESEND_QUOTA_WEBHOOK_SECRET=signing_secret_ของ_endpoint_ที่ตั้งไว้
RESEND_QUOTA_ALERT_FROM=auth@mail.korkru.com
RESEND_QUOTA_ALERT_TO=korkru.me@gmail.com
```

   ใช้ `SUPABASE_SERVICE_ROLE_KEY` ของ Staging ที่มีอยู่เพื่อเรียก ledger ห้ามคัดลอกจาก Production หรือใส่ `NEXT_PUBLIC_*` Runtime ของ route เป็น Node.js และตั้ง `maxDuration=60`; โปรเจกต์นี้ใช้ Node.js 24
4. ตรวจ ledger/RPC และ env scope ของ Staging ให้ตรงก่อนเปิดทดสอบ Usage API ที่ `GET https://api.resend.com/usage` ต้องได้ daily/monthly `used`, `limit`, `resets_at` สมเหตุสมผลโดยไม่มี key/Authorization header ใน output/log ตรวจรอบเดือนจากค่าจริง ไม่เดาจากวันสมัคร การตรวจ provider นี้ยังรอทำผ่าน signed event หลังเปิด flag ในขั้น 7; ตอน flag `false` route ตอบ `503 not_configured` จึงยังตรวจ Usage ไม่ได้
5. Deploy โค้ดรวม Staging รุ่นที่มี route และ ledger dependency โดย flag ยังปิด จากนั้นกำหนด **public URL ของ Staging endpoint `/api/webhooks/resend` ที่ตรวจ reachability แล้ว** และให้ Resend webhook เลือก **`email.sent` และ `email.received`** ชื่อ hostname/alias สุดท้ายยังรอยืนยัน อย่าใช้ลิงก์ที่ยังติดหน้า Vercel sign-in เป็น endpoint ทดสอบ
6. ตรวจว่า provider POST ถึง public endpoint นั้นได้โดยไม่ติด Vercel sign-in/Cloudflare challenge ระหว่างนี้กำลังเตรียมวิธีให้เข้าถึงเฉพาะ endpoint ที่จำเป็น **อย่าปิด protection ของทั้งเว็บหรือเผย bypass secret ในแชท/URL/log** Route ตรวจ Svix อยู่แล้ว แต่ session ของผู้ทดสอบไม่ได้ทำให้ provider ข้าม Deployment Protection ได้เอง หาก public URL/กติกาป้องกันยังไม่ตรวจผ่านให้คงปิด flag
7. เมื่อ ledger/key/signing secret/deployment และ public endpoint พร้อมแล้ว เปลี่ยน flag ของ **Staging** เป็น `true` และ redeploy เพื่อทดสอบ signed event จริง ตรวจ Usage API/route response ตามหัวข้อถัดไป การเปลี่ยน env ต้อง redeploy จึงมีผล ไม่ต้องรอ signed success ก่อนเปิด flag เพราะ flag ปิดจะปฏิเสธทุก event; หาก readiness หรือ signed delivery ไม่ผ่านให้ปิด flag กลับและแก้สาเหตุ ก่อนเปิด Production ต้องมีผลทดสอบ Staging นี้ผ่านแล้ว
8. หลัง Staging ผ่านจึงเตรียม Production: monitor/SMTP key และ webhook signing secret คนละค่ากับ Staging, ledger migration ที่ตรวจ history แล้ว และ `KORKRU_DEPLOYMENT_ENV=production` Free มี webhook endpoint **1 แห่ง** จึงใช้ endpoint เดิมทดสอบ Staging ก่อน แล้วค่อยย้ายไป **`https://www.korkru.com/api/webhooks/resend`** พร้อมหยุด Staging monitor อย่าสร้างหลายบัญชีเพื่อหลบโควตา การเปลี่ยน environment เป็น scope ใหม่จึงต้องตรวจประวัติแจ้งเตือนที่ส่งจริงก่อนย้าย เพื่อจัดการระดับที่อาจแจ้งซ้ำในรอบเดือนนั้น

โควตาเป็นยอดของ **Resend team รวมทั้งส่งและรับ** การแยก SMTP/monitor key หรือ environment ไม่ได้แยกโควตาให้ใหม่ ([Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage), [Pricing](https://resend.com/pricing)) Production SMTP, Google และ SEB ไม่ได้เปิดเพิ่มจากงานนี้

## ระบบเตือนทำอะไรบ้าง

- ทุก signed `email.sent`/`email.received` ที่ยอมรับจะอ่าน Usage API แล้วประเมิน **daily และ monthly แยกกัน** ใช้ยอดและเพดานจาก provider คำนวณ `ceil(limit × percentage / 100)` ถ้าข้ามหลายระดับ ส่งเฉพาะระดับสูงสุดที่ถึงของช่วงนั้น ไม่ไล่ส่งย้อนหลัง ระดับที่ต่ำกว่าหรือเท่าระดับสูงสุดที่รับงานไว้แล้วไม่ส่งใหม่ `daily.limit=null` ข้ามเฉพาะรายวัน ส่วนรายเดือนยังตรวจตามเดิม
- **รายวัน:** ใช้ยอด daily ล่าสุดที่ API รายงาน และจำกัดการเตือนระดับละครั้งต่อ **วันแจ้งเตือน UTC (`YYYY-MM-DD`)** ซึ่งเปลี่ยน 07:00 น. ไทย นี่เป็นขอบเขต dedup ของ KorKru ไม่ใช่คำรับรองว่า counter ของ Resend รีเซ็ตตอนนั้น [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage) ระบุ daily เป็น rolling 24 ชั่วโมง ขณะที่ [Account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) ระบุรอบ UTC จึงไม่บังคับ `daily.resets_at` ให้เที่ยงคืนและไม่แจ้งเวลานั้นว่าโควตากลับมาแน่นอน
- **รายเดือน:** ใช้ `monthly.resets_at` ที่ provider ให้เป็น window key หลัง normalize ISO และตรวจว่าเป็นอนาคตไม่เกิน 35 วัน ไม่ใช้เดือนจากเวลาของ webhook หรือเดารอบบิล Ledger จึงคงระดับเดิมข้ามวันได้ และเริ่มสิทธิ์เตือนรอบใหม่เมื่อ provider เปลี่ยนรอบเดือนจริง
- อีเมลมีภาษาไทย แยกชื่อช่วง/ระดับ/เพดานอย่างชัดเจน ส่งไป `korkru.me@gmail.com` จาก server env เท่านั้น ไม่ใช้รายชื่อผู้รับใน webhook Payload ของแต่ละ claim คงที่ตามช่วง/threshold/เพดาน ไม่ใส่ยอด used ที่เปลี่ยนทุกครั้งหรือยอดอีกช่วงที่ทำให้ idempotent retry ส่ง body คนละชุด
- Ledger ใน Supabase เก็บ scope/period/window/level, delivery UUID, payload hash และเวลาสถานะ ไม่มีที่อยู่อีเมล เนื้อหาอีเมล หรือลิงก์รีเซ็ต Atomic claim/high-water กัน event พร้อมกันและการส่งระดับเดิม/ต่ำกว่า ส่วน Resend idempotency key อายุ 24 ชั่วโมงช่วยให้ retry หลัง timeout ยังเป็นคำขอเดิม ([Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys))
- งานที่ค้างโดยยังยืนยันผลรับส่งไม่ได้เกิน **23 ชั่วโมง** จะหยุดเพื่อ reconcile กับ delivery log ไม่ retry หลัง key อาจหมดอายุและเสี่ยงส่งซ้ำ อย่าล้าง ledger เพื่อบังคับส่งอีก ให้ตรวจสถานะจริงก่อน
- Signed `email.sent` ของอีเมลเตือนอาจยืนยัน claim ว่า provider รับแล้ว จากนั้นยังตรวจ **ทั้งสองช่วง** อีกครั้ง อีเมลเตือนระดับ 95 รายวันจึงยังทำให้แจ้งรายเดือนได้ถ้ามันเป็นฉบับที่ข้ามเกณฑ์รายเดือน Ledger กันการวนส่งระดับเดิม ไม่ใช้ final-level tag ไปปิดการตรวจอีกช่วง
- อีเมลเตือนแต่ละฉบับใช้โควตาเพิ่ม 1 ฉบับ ถ้าค่อย ๆ ผ่านทุกระดับจะมีได้สูงสุด 3 ฉบับต่อวันแจ้งเตือนสำหรับรายวัน และ 3 ฉบับต่อรอบเดือนสำหรับรายเดือน เมื่อทั้งสองช่วงถึงเกณฑ์ใน event เดียวอาจเกิด 2 ฉบับตามสถานะ ledger ไม่มีช่องทางสำรองนอกโควตานี้
- ตรวจ Svix signature/timestamp บน raw body จำกัด 32 KiB ก่อนแตะ provider/ledger เรียกเฉพาะ Resend HTTPS endpoints คงที่ มี timeout และไม่ตาม redirect ไม่บันทึก key, payload, รายชื่อผู้รับ หรือเนื้อหาอีเมล Missing schema/config, provider หรือ ledger ล้มเหลวหยุดส่ง/ตอบ retryable error ตามชนิด ไม่ fallback เป็น in-memory counter

**ข้อจำกัด:** Webhook/Usage อาจมาช้า ยอดอาจกระโดดหรือโควตาอีกช่วงหมดก่อนส่งเตือน เลือก 95% ช่วยเหลือพื้นที่มากกว่า 97% แต่ไม่รับประกันว่าจะทันทุกครั้ง การเปิด monitor หลังถึงเกณฑ์จะตรวจเมื่อมี event ใหม่ ไม่ตรวจย้อนหลังหรือเป็นช่วงเวลาขณะไม่มี event Provider รับคำขอแล้วไม่แปลว่าถึง Gmail inbox ยังต้องดูสถานะ delivered/bounce/spam

## วิธีทดสอบโดยไม่ใช้โควตาหลายร้อยฉบับ

แยกผลจำลองในเครื่องจากการต่อบริการจริง ไม่ลด threshold บนเว็บจริงและไม่ส่งจนโควตาเต็มเพื่อทดสอบ รันชุดทดสอบเฉพาะโควตาซ้ำได้จากโฟลเดอร์โปรเจกต์:

```bash
npm test -- lib/resend-quota-alert.test.ts lib/resend-quota-store.test.ts lib/resend-quota-ledger-sql.test.ts
```

1. **Local mock tests:** daily 79/80/89/90/94/95/100 และ monthly 2,399/2,400/2,699/2,700/2,849/2,850; ยอดต่ำกว่าเงียบและยอดแตะเกณฑ์เตือนช่วงถูกต้อง ตรวจทั้งสองช่วงถึงเกณฑ์พร้อมกัน, daily ไม่จำกัดแต่ monthly ถึงเกณฑ์, ยอดกระโดดให้ระดับสูงสุด, retry/concurrency, วันใหม่แต่รอบเดือนเดิม, รอบเดือนใหม่ และ signed self-event ของระดับ 95 ที่ข้ามอีกช่วง
2. **Local failure/ledger tests:** ลายเซ็นปลอม/หาย/เก่า, raw body เกินขนาด, Usage malformed/timeout/redirect, monthly window ไม่สมเหตุสมผล, payload hash เปลี่ยน, provider รับแล้ว response หาย, mark accepted ล้มเหลว และ pending เกิน 23 ชั่วโมงต้องไม่ส่งซ้ำ ทุกกรณีใช้ provider/ฐานข้อมูลจำลอง ไม่ส่งอีเมลจริง
3. **Staging readiness:** ยืนยัน migration/config และ public webhook URL จากภายนอกว่าไม่เป็น sign-in page ก่อนเปิด flag ทดสอบ จากนั้นตรวจ Svix rejection โดยไม่เรียก Usage/ส่งอีเมล และใช้ signed event ตรวจว่าอ่าน Usage API จริงได้ด้วย key Full access บันทึกเฉพาะยอด/เพดาน/รอบที่ไม่ใช่ secret เมื่อ flag ยังปิดจะได้ `503 not_configured` แทน
4. **Staging signed delivery:** ใช้ event ของอีเมลทดสอบที่เจ้าของส่งให้ตนเองตาม flow ปกติ หรือ Resend replay ของ event ที่เหมาะสม ตรวจ webhook ได้ 200, เหตุผล below-threshold เมื่อทั้งสองช่วงยังต่ำ และไม่มี alert เพิ่ม ใช้บัญชีสังเคราะห์ตามกติกา Staging ตรวจทั้ง Resend delivery log และ route response ไม่ถือว่าแค่เปิดหน้าเว็บได้คือ webhook ผ่าน
5. **ทดสอบตัวอีเมลเตือน:** ข้อความ/ผู้รับ/threshold และการทำงานระดับ 80/90/95 ยืนยันใน local mocks ก่อน หากต้องการส่งตัวอย่างจริงให้ส่งเพียงฉบับที่ตกลงไว้ผ่านขั้นตอนทดสอบแยก ไม่ปลอม signed production event/ลดเกณฑ์/ล้าง ledger เพื่อบังคับส่ง ตัวอย่างถึง Gmail ไม่ทดแทนหลักฐานว่าการข้าม threshold ของ provider เกิดจริง
6. หลัง Staging ผ่านจึงย้าย endpoint และตั้ง Production ตาม release workflow; การตรวจ Production ต้องได้รับอนุมัติและเป็น read-only เว้นแต่ได้รับอนุญาตการเปลี่ยนแปลงเฉพาะนั้นแล้ว

Core recovery บน Staging ที่เจ้าของทดสอบผ่านแล้วคงผลเดิม: อีเมล → reset form → same-password warning → ส่งรหัสอื่น → success banner → รหัสเก่าถูกปฏิเสธ/รหัสใหม่เข้าได้ ส่วนลิงก์ใช้แล้ว/หมดอายุแบบ manual ยังไม่ได้รายงาน งาน monitor นี้ไม่ต้องให้ทดสอบ recovery ชุดเดิมใหม่

## สถานะการตรวจ

รอบ **80/90/95 รายวันและรายเดือนพร้อม durable ledger (18 ตุลาคม 2026)** ผ่าน TypeScript, full Vitest **313 ไฟล์ / 4,214 เคส** และ Node.js 24 production Webpack build ชุดโควตาเฉพาะ **132 เคส** ประกอบด้วย runtime 90, migration SQL จริงบน PGlite 31 และ RPC boundary 11; runtime 90 เคสรันซ้ำผ่านหลังจัดลำดับ mock ให้ตรง SQL แล้ว

Signed Next HTTP fixture ผ่าน **9 กรณี** รวมขอบเขต threshold ทั้งหก, unsigned rejection, partial retry และ self-event ระดับ 95 ที่ข้ามอีกช่วง ใช้ Supabase/Resend จำลอง ไม่มีอีเมลภายนอก Next MCP compilation/config/session errors ว่าง และหน้า login เดิม render/React tree ถูกต้อง ไม่มี UI เปลี่ยนจึงไม่รัน token lint รอบนี้ Build ครั้งแรกติด sandbox Google Fonts DNS และผ่านเมื่ออนุญาต network สำหรับ build ไม่ใช่ application failure

**รอบรวม Staging วันที่ 19 ตุลาคม 2026:** Node.js 24 production Webpack build ผ่านพร้อม TypeScript Full suite รอบแรกผ่าน **315 ไฟล์ / 4,296 เคส** แต่มี 7 เคสไม่ผ่านใน 3 ไฟล์ SEB ที่ quota patch ไม่ได้แก้ (PGlite timeout 5 วินาที 6 เคส และ helper probe ได้ null 1 เคส) หลัง build จบรัน 3 ไฟล์นี้แยกผ่าน **3 ไฟล์ / 17 เคส** โดยไม่แก้ application code จึงบันทึก full-run failure และผล rerun แยกกัน ไม่อ้างว่า full run รอบแรกผ่านทั้งหมด ผลโควตาเฉพาะ 132 เคสข้างต้นยังเป็นหลักฐานของแพตช์เดิมที่ผ่านแล้ว

Hosted Staging รอบนี้ apply/ตรวจ **ledger ใหม่เพียงไฟล์ `20261018154826`** แล้ว: history 162 รายการ, RLS เปิด และ service-only RPC ผ่าน พร้อมเก็บ API key/signing secret/from/to เฉพาะ Preview branch `staging` และลบสำเนา scope กว้างแล้ว **ยังไม่ยืนยัน Usage API จริงด้วย monitor key, signed webhook delivery หรืออีเมลเตือนถึง Gmail** Public endpoint ตรวจถึงแอปแล้วและเปิด flag เฉพาะ Staging เป็น `true` สำหรับ deployment/integration test ไม่มี Production SMTP/Google หรือ SEB rollout เพิ่ม

หลักฐานย้อนหลังของ **รุ่น daily-only 80/90/97**: TypeScript, Vitest 276 ไฟล์ / 3,447 เคส (monitor 47 เคส), Webpack build และ Next HTTP กับ provider จำลองผ่าน จึงเป็นหลักฐานเฉพาะรุ่นเดิม แพตช์ recovery/branding ถัดมามีผลตรวจแยกใน `docs/AUTH_SIGNUP_ROLLOUT.md` และไม่ยืนยัน quota-alert delivery หรือ Production SMTP

อ้างอิงตรวจ 18 ตุลาคม 2026: [Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage), [API keys](https://resend.com/docs/api-reference/api-keys/create-api-key), [Account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [Verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [Email sent payload](https://resend.com/docs/webhooks/emails/sent), [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Retries](https://resend.com/docs/webhooks/retries-and-replays)
