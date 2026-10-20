# ตั้งค่า Resend Free สำหรับ KorKru

เจ้าของเลือก Resend Free และผู้รับแจ้งเตือน `korkru.me@gmail.com` เมื่อ 17 ตุลาคม 2026 และวันที่ 18 ตุลาคมเปลี่ยนระดับสุดท้ายจาก 97% เป็น **95%** พร้อมขอให้ตรวจ **ทั้งรายวันและรายเดือน** ระดับปัจจุบันจึงเป็น **80%, 90%, 95%** แยกต่อช่วง สำหรับ Free 100 ฉบับ/วัน คือ 80, 90, 95 ฉบับ และ 3,000 ฉบับ/เดือน คือ 2,400, 2,700, 2,850 ฉบับ ([Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage)) ไม่มีการอัปเกรดแพ็กเกจหรือเปิดค่าใช้จ่ายส่วนเกินอัตโนมัติ

**สถานะล่าสุด 19 ตุลาคม 2026: Staging SMTP, recovery core flow และ signed webhook → Usage API ผ่านแล้ว** Staging รุ่น `8cd3919` ขึ้น Ready และเปิด quota monitor แล้ว ผลจริงตอบ `200 {"status":"below_threshold"}` เพราะทั้งรายวันและรายเดือนยังต่ำกว่า 80% ตัวอย่างอีเมล TEST จำลองรายวัน 80% ส่งจริงเพียง 1 ฉบับ Resend ขึ้น Delivered และเจ้าของยืนยันพบใน Inbox แล้ว ส่วนการส่งอีเมลเตือนจริงที่ระดับ 80/90/95 ยังไม่ได้บังคับให้เกิด งาน SEB ยังพัก และยังไม่เปิด Production SMTP หรือ Google

- บัญชี Resend สร้างแล้ว; `mail.korkru.com` ขึ้น Verified ใน region Tokyo ตรวจ public DNS พบ TXT `resend._domainkey.mail`, CNAME `rsend.mail` → `rsend-apne1.forge.rmta.net` และ `send.mail` → `send.forge.rmta.net` โดย CNAME เป็น DNS only
- เจ้าของสร้าง Sending access key และกรอก custom SMTP เอง ไม่ส่ง key มาในแชท การอ่าน configuration ยืนยัน Staging ใช้ `smtp.resend.com:465`, username `resend`, sender `auth@mail.korkru.com`, ชื่อ `KorKru Staging` และมี SMTP password โดยไม่อ่าน/บันทึกค่าลับ
- Staging Site URL เป็น `https://staging.korkru.com`, email autoconfirm ปิด, Require current password เปิด และ signup/recovery templates ยังคง `{{ .ConfirmationURL }}` ตามเดิม
- **เจ้าของรายงานว่าได้รับอีเมลสมัคร กดยืนยัน และเข้า Staging สำเร็จแล้ว** และวันที่ 18 ตุลาคมทดสอบ recovery ด้วยอีเมลใหม่ผ่าน: ได้รับอีเมล → เปิด reset form → ลองรหัสเดิมมีคำเตือนใต้ช่อง → ส่งรหัสอื่น → หน้า login มี banner “เปลี่ยนรหัสผ่านแล้ว” ตามภาพเวลา 22:10:54 → เข้าได้ด้วยรหัสใหม่ที่กรอกไว้ ต่อมายืนยันว่ารหัสก่อน reset รอบล่าสุดถูกปฏิเสธด้วย “อีเมลหรือรหัสผ่านไม่ถูกต้อง” ตามภาพเวลา 22:17:18 และรหัสใหม่ยังเข้าได้ตามปกติ เป็น manual/owner-reported proof พร้อมภาพ แยกจาก independent hosted E2E ส่วนลิงก์ใช้แล้วซ้ำ/หมดอายุยังไม่ได้รายงาน; การส่งอีเมลเตือนเมื่อยอดถึงเกณฑ์จริงยังไม่ได้บังคับทดสอบ
- เจ้าของตั้ง `RESEND_QUOTA_API_KEY`, `RESEND_QUOTA_WEBHOOK_SECRET`, `RESEND_QUOTA_ALERT_FROM`, `RESEND_QUOTA_ALERT_TO` แล้ว ทั้งสี่รายการคงไว้เฉพาะ **Vercel Preview → gitBranch `staging`** และนำสำเนาที่ผูก Preview กว้างออก Flag เฉพาะ Staging เป็น `RESEND_QUOTA_ALERTS_ENABLED=true` และ deployment รับ signed event/อ่าน Usage API ผ่านแล้ว ไม่อ่าน/บันทึกค่าลับลงเอกสาร Production ยังปิด
- Apply เฉพาะ **`20261018154826_resend_quota_alert_delivery_ledger.sql`** บน Staging แล้ว ตรวจ history รวม 162 รายการ พร้อม RLS และสิทธิ์ RPC แบบ service-only ผ่าน ไม่ apply/replay migration SEB หรือเปลี่ยน schema งานนั้น เจ้าของบันทึก public endpoint เดิมใน Resend เวลา 22:03 น. ไทย และ signed delivery ผ่านตามหลักฐานด้านล่าง

รอบ release ก่อนมี migration จำกัดคำขอส่งอีเมลและ `AUTH_FLOW_SECRET` พร้อมแล้ว อ่าน `docs/AUTH_SIGNUP_ROLLOUT.md` ประกอบ; SMTP เพียงอย่างเดียวไม่ทดแทน dependency ของ email actions

## URL รับ webhook สำหรับ Staging — 19 ตุลาคม 2026

ใช้ `https://jk-resend-staging-korkru-mes-projects.vercel.app/api/webhooks/resend` แทน URL เว็บ Staging เดิมที่ติด Vercel sign-in เจ้าของแก้และบันทึก endpoint เดิมใน Resend แล้วเวลา **22:03 น. ไทย** คง events `email.sent`, `email.received` พร้อม signing secret เดิม โดเมนนี้ verified และผูก project `jk` กับ gitBranch `staging` จึงตาม Staging release ถัดไป ไม่ต้องตั้ง DNS เพิ่ม

ก่อนเปิดข้อยกเว้น ได้สร้างและเปิด WAF rule เฉพาะ hostname นี้: ปฏิเสธทุก path ที่ไม่ใช่ `/api/webhooks/resend` หรือ method ที่ไม่ใช่ POST จากนั้นเปิด alias-scoped `alias-protection-override` เฉพาะ alias นี้ ไม่แก้ project automation bypass หรือปิด protection ของทั้งเว็บ Probe ก่อน deploy รุ่นใหม่: GET หน้าแรก/login/webhook ได้403; unsigned POST ถึงแอปได้503 `not_configured` ของรุ่นที่ยังปิด flag; URL `staging.korkru.com` เดิมยังได้401 ผลช่วงเตรียมนี้ยังไม่ใช่ signed delivery proof

**หลัง deploy:** commit `3e87c8458f80008dc5d4c3d69d6e7491c86745e2` บน branch `staging` ขึ้น READY (`dpl_5oakdtauo8qXb77UNpeyUfoZFdWy`) และรุ่นปัจจุบัน `8cd3919` ขึ้น Ready แล้ว หน้า login มีป้าย Staging และ source revision ตรงกัน Alias ย้ายตาม release อัตโนมัติและคงข้อยกเว้นไว้ ตรวจ unsigned POST ได้400 `invalid_webhook` แสดงว่า missing signature ถูกปฏิเสธ GET guard ยัง403 และเว็บ Staging เดิมยัง401 ผล signed integration ที่ตามมาบันทึกแยกด้านล่าง

**Signed integration ผ่าน:** วันที่ 19 ตุลาคมคำขอทดสอบ recovery ใหม่บน Staging ได้ 200 และ Auth audit action `user_recovery_requested` เวลา **15:05:06 UTC (22:05:06 น. ไทย)** Resend SMTP-associated `POST /emails` ได้ 200 เวลา 15:05 UTC และ `email.sent` ของอีเมลเดียวกันมี `created_at` **15:05:09.993Z** จากนั้น Resend แสดง webhook **Success, 1 attempt, HTTP 200** เวลา **15:08:06.344Z (22:08:06 น. ไทย)** พร้อม response **`{"status":"below_threshold"}`** ยืนยันเส้นทาง SMTP → signed Svix webhook → Usage API จริง โดยทั้งสองช่วงยังต่ำกว่าเกณฑ์ จึงไม่มีอีเมลเตือนเพิ่ม เจ้าของยืนยันได้รับอีเมลพร้อมภาพ และไม่ได้ trigger ฉบับอื่นเพิ่มจากการ debug นี้

Event รอบนี้มาหลังเวลา payload ประมาณ **177 วินาที** ช่วงที่ UI ยังแสดง Queued/ไม่มี event จึงไม่ใช่หลักฐานว่าเมลถูกบล็อกหรือ key ผิด และไม่มีหลักฐานว่าเป็น outage การค้น Vercel logs ด้วย filter **Preview** พบคำขอ200 เวลา **15:08:06.458Z** ตรงกับ signed delivery แล้ว ผลค้นว่างก่อนหน้านั้นเป็นช่วงเวลาก่อน event มาถึง ไม่ต้องแก้ helper/filter สำหรับกรณีนี้ ไม่เก็บ event ID/email ID, reset link หรือ payload ที่มีข้อมูลผู้รับลงเอกสาร

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

**สถานะ 19 ตุลาคม: ledger/deployment/public endpoint และ signed provider integration ของ Staging ผ่านแล้ว; flag Staging เปิด** รุ่นเดิมตรวจรายวันเท่านั้น รุ่นใหม่นี้ต้องมี durable delivery ledger ก่อนเปิด flag มิฉะนั้นหยุดส่งแทนการเสี่ยงส่งซ้ำ ไม่เพิ่ม cron หรือซื้อบริการตั้งเวลา Webhook เป็นตัวกระตุ้นให้อ่านยอดจริงจาก Usage API จึงไม่มีการตรวจเป็นช่วงเวลาขณะที่ไม่มี event ยังไม่ได้บังคับยอดให้ถึงเกณฑ์เพื่อส่งอีเมลเตือนจริง และ Production ยังปิด

ทำทีละขั้นบน Staging ก่อน โดยไม่ส่ง key/secret มาในแชท:

1. **เสร็จแล้ว:** เจ้าของสร้าง **`korkru-staging-quota-monitor`** แบบ **Full access** และเก็บค่าใน Vercel เอง `GET /usage` ใช้ Sending access ไม่ได้ จึงแยกจาก SMTP key ที่จำกัดโดเมน ไม่ต้องสร้างซ้ำหรือส่งค่า key ในแชท
2. **เสร็จแล้วเฉพาะ Staging:** ปล่อย migration CLI **`20261018154826_resend_quota_alert_delivery_ledger.sql`** เพียงไฟล์เดียว ตรวจ history รวม **162 รายการ**, ledger เปิด RLS, browser ไม่มี direct grants และ RPC เปิดเฉพาะ service role ผ่านแล้ว ก่อนหน้านี้ CLI `migration list --linked` ติด `LegacyProjectNotLinkedError` และ live history เทียบไฟล์มีความต่าง จึงไม่ได้ใช้ db push/reset/replay เพื่อข้ามความต่างหรือปล่อย migration SEB ที่พักไว้ หลักฐาน apply รอบนี้ไม่ครอบคลุม Production
3. **ตั้งแล้ว:** Vercel project **`jk`** → Settings → Environment Variables มี API key/signing secret/from/to **เฉพาะ Preview ของ gitBranch `staging`** แล้ว ไม่เพิ่มสำเนา Preview แบบทุก branch อีก เริ่มด้วย flag `false` ระหว่างเตรียม ก่อนเปลี่ยนเฉพาะ Staging เป็น `true` และ redeploy จนรับ signed event ผ่าน ค่าปัจจุบันของ Staging เป็น server-only:

```dotenv
KORKRU_DEPLOYMENT_ENV=staging
RESEND_QUOTA_ALERTS_ENABLED=true
RESEND_QUOTA_API_KEY=key_full_access_ที่เก็บเป็น_secret
RESEND_QUOTA_WEBHOOK_SECRET=signing_secret_ของ_endpoint_ที่ตั้งไว้
RESEND_QUOTA_ALERT_FROM=auth@mail.korkru.com
RESEND_QUOTA_ALERT_TO=korkru.me@gmail.com
```

   ใช้ `SUPABASE_SERVICE_ROLE_KEY` ของ Staging ที่มีอยู่เพื่อเรียก ledger ห้ามคัดลอกจาก Production หรือใส่ `NEXT_PUBLIC_*` Runtime ของ route เป็น Node.js และตั้ง `maxDuration=60`; โปรเจกต์นี้ใช้ Node.js 24
4. **ผ่านแล้ว:** ledger/RPC และ env scope ของ Staging ตรวจแล้ว Signed event ที่รับจริงอ่าน `GET https://api.resend.com/usage` และตรวจ daily/monthly ได้ โดยตอบ `below_threshold` ไม่เก็บ key/Authorization header ใน output/log ไม่เดารอบเดือนจากวันสมัคร หากเริ่ม environment ใหม่ให้ตรวจ readiness ก่อนและเริ่มด้วย flag ปิด ซึ่งตอนนั้น route จะตอบ `503 not_configured` จนเปิดทดสอบ
5. **เสร็จแล้ว:** โค้ด Staging `8cd3919` ขึ้น Ready และเจ้าของบันทึก endpoint เดิมเป็น **`https://jk-resend-staging-korkru-mes-projects.vercel.app/api/webhooks/resend`** พร้อม events **`email.sent` และ `email.received`** แล้ว ไม่ใช้ URL เว็บ Staging เดิมที่ติด Vercel sign-in
6. **ผ่านแล้ว:** provider POST ถึง public endpoint นี้ได้จริงผ่าน alias-scoped protection override และ WAF guard ที่เจาะจง POST/path ตามข้างต้น **ไม่ปิด protection ของทั้งเว็บหรือเผย bypass secret ในแชท/URL/log** Session ของผู้ทดสอบไม่ใช่หลักฐาน reachability; หลักฐานคือ signed delivery และ Preview log ที่ตรงกัน
7. **ผ่านแล้วบน Staging:** เปิด flag และ redeploy จากนั้น signed event จริงได้ Success/HTTP 200/`below_threshold` หลังหน่วงประมาณ 177 วินาที ก่อนเปิด Production ต้องรักษาขอบเขตผลนี้: ยืนยันการรับ event/อ่าน Usage แล้ว แต่ยังไม่ใช่หลักฐานส่งอีเมลเตือนจริงเมื่อข้ามจุดเกณฑ์ทั้งหก การเปลี่ยน env ครั้งต่อไปยังต้อง redeploy; หาก readiness ล้มเหลวให้ปิด flag กลับและแก้สาเหตุ
8. หลัง Staging ผ่านจึงเตรียม Production: monitor/SMTP key และ webhook signing secret คนละค่ากับ Staging, ledger migration ที่ตรวจ history แล้ว และ `KORKRU_DEPLOYMENT_ENV=production` Free มี webhook endpoint **1 แห่ง** จึงใช้ endpoint เดิมทดสอบ Staging ก่อน แล้วค่อยย้ายไป **`https://www.korkru.com/api/webhooks/resend`** พร้อมหยุด Staging monitor อย่าสร้างหลายบัญชีเพื่อหลบโควตา การเปลี่ยน environment เป็น scope ใหม่จึงต้องตรวจประวัติแจ้งเตือนที่ส่งจริงก่อนย้าย เพื่อจัดการระดับที่อาจแจ้งซ้ำในรอบเดือนนั้น

โควตาเป็นยอดของ **Resend team รวมทั้งส่งและรับ** การแยก SMTP/monitor key หรือ environment ไม่ได้แยกโควตาให้ใหม่ ([Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage), [Pricing](https://resend.com/pricing)) Production SMTP, Google และ SEB ไม่ได้เปิดเพิ่มจากงานนี้

### เริ่มเตรียม Production — เจ้าของอนุญาต 19 ตุลาคม 2026

เจ้าของขอให้ตั้งแจ้งเตือน 80/90/95 ทั้งรายวันและรายเดือนบน Production แบบทีละขั้นตอนแล้ว ขอบเขตนี้เป็น quota monitor เท่านั้น ไม่เปิด Production SMTP/Google หรือปล่อย SEB เพิ่ม การตรวจรอบแรกเป็น read-only ยังไม่มีการสร้าง key, แก้ env/webhook, apply migration หรือ deploy Production ใหม่

- ผลตรวจครั้งแรก19ตุลาคม: Production Ready ที่ `9004e96` ตรง `origin/master` ยังเป็น daily-only 80/90/97 ไม่มี durable store เลือกเฉพาะ implementation commit `0352be1` เป็นขอบเขต candidate จาก master ไม่ merge Staging/auth release ทั้ง branch เพราะมีงานอื่น ขึ้น Production แล้วต้อง sync เฉพาะส่วนนี้และ dependency ที่จำเป็นสู่ primary `localhost:3000` ตาม release workflow โดยรักษางานคำถาม/deadlineที่ dirty อยู่
- Production Supabase history จาก MCP มี149รายการ ล่าสุด `20261018133739`; ledger migration `20261018154826` และ quota table/RPC ยังไม่มี เทียบชื่อไฟล์กับ auth release พบ local-only13รายการ = quota1 + SEBที่พักไว้12 ไม่มี remote-only ต้องตรวจ CLI migration list ก่อนเขียนและใช้ isolated Production history baseline พร้อม quota migrationเดียว ห้าม db push checkout นี้หรือใช้ Staging baseline เพราะ Production มี retention/grading ที่ต่างกัน
- Vercel metadata มี Production scope/flag/service-role key อยู่แล้ว แต่ยังไม่มี quota API key/signing secret/from/to ฝั่ง Production การอ่านรอบนี้เก็บเฉพาะชื่อ/target/type ค่าของ scope/flagยังยืนยันจาก metadataไม่ได้ จึงต้องตรวจว่า flagเป็นfalseก่อนบันทึกค่าใหม่หรือเปิดระบบ ไม่อ่าน/บันทึกค่าลับ
- เปิด Resend Add API Key form และเตรียมชื่อ `korkru-production-quota-monitor`, Permission Full access, Domain All domains ไว้ให้เจ้าของกด Add และเก็บค่าตัวเต็มเอง **เจ้าของยืนยันวันที่20ตุลาคมว่าสร้างแล้ว** ไม่ขอ key หรือ signing secret ผ่านแชท

**20ตุลาคม — รอเจ้าของบันทึก Vercel:** ตรวจ UI ยืนยัน `RESEND_QUOTA_ALERTS_ENABLED` แถว **Production เป็น `false`** แล้ว โดยอ่านเฉพาะ boolean ไม่แก้ค่า เปิด Add Environment Variable เตรียม Type Secret, Key `RESEND_QUOTA_API_KEY`, Environments Production เท่านั้น และ Value ยังว่างไว้ให้เจ้าของกรอกคีย์ใหม่และ Save เอง ยังไม่ยืนยันว่าบันทึกแล้ว และยังไม่ redeploy คงขั้นถัดไปเป็น from/to, signing secret, scoped code/ledger/deployment และ webhook cutoverตามลำดับ readiness ตรวจ source/deploymentใหม่พบ Production/masterขยับเป็น **`949c44d` Ready** และ Staging`1916b46`; quota preimageยังตรง parentของ`0352be1` จึงคง candidateเฉพาะโควตาได้ ไม่มีpackagechangeจำเป็นบนProduction ต้องตรวจhistoryฐานข้อมูลใหม่ก่อน applyเพราะมีreleaseอื่นแทรก และรักษางานdirtyของprimarylocalhostไว้

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

### ตัวอย่างอีเมลจริง 1 ฉบับ — เจ้าของอนุญาต 19 ตุลาคม 2026

เจ้าของขอส่งตัวอย่างไป `korkru.me@gmail.com` เพียง 1 ฉบับ และยืนยันว่าเก็บ key ไว้ส่วนตัว เตรียม local helper `/private/tmp/korkru-quota-sample-local.mjs` ที่ `http://127.0.0.1:3069/` ให้เจ้าของกรอก Full access monitor key ในช่อง password เอง Key ใน Vercel/Supabase อ่านกลับมาใช้ไม่ได้ จึงไม่ขอ key ผ่านแชทหรือแก้ credentials เดิม

ข้อความระบุ “ทดสอบ KorKru Staging” และจำลองรายวัน 80% ชัดเจน ใช้ผู้ส่งเดิมกับผู้รับตายตัวเพียงรายเดียว เป็นการทดสอบรูปแบบ/ส่งถึงกล่องเมล ไม่ใช่หลักฐานว่าถึง threshold จริง Helper ตรวจ webhook ของบัญชีและ Usage ทั้งสองช่วงก่อนส่ง ไม่เปลี่ยน quota threshold/env/ฐานข้อมูล/Production และใช้ test tag แยกจาก receipt ของ alert จริง

Helper รับเฉพาะ loopback พร้อม Host/Origin/CSRF guards และมี manifest ที่ไม่มี credentials `/private/tmp/korkru-quota-sample-20261019-state.json` เขียนแบบ exclusive ก่อน POST พร้อม payload/hash และ idempotency key คงที่ ทุกสถานะหลังเริ่มส่งล็อกการส่งซ้ำ หากผลไม่แน่นอนให้ตรวจ Resend ก่อน ห้ามล้าง manifest เพื่อบังคับส่งใหม่ ขณะเตรียมผ่าน syntax/review และ local rejection checks โดยไม่ใช้ valid key/ไม่เรียก provider/ไม่ส่งอีเมล ผล accepted/delivered และ Inbox/Spam แยกตรวจตามหลักฐานด้านล่าง

แก้ปัญหา local form ตอบ403 หลังเจ้าของกดส่ง: Chrome native form ภายใต้ `Referrer-Policy: no-referrer` ส่ง `Origin: null` ทำให้ strict Origin guard ปฏิเสธ ยืนยันด้วยฟอร์มเปล่าบน Chrome จริงก่อนแก้ แล้วเปลี่ยนเฉพาะ header เป็น `same-origin` และเพิ่มคำอธิบายเมื่อ Origin ถูกปฏิเสธ คง Host/loopback/Origin/CSRF/CSP และ one-send lock เดิม เปิดเอกสาร GET ใหม่ให้เจ้าของใช้ต่อ Native form ด้วย dummy key เข้าถึง validation400 ได้; HTTP checks อีก8กรณีผ่าน โดย null/missing/wrong Origin, cross-site, wrong Host/CSRF ยัง403 และ extra field400 ตรวจ manifest ยังไม่มี จึงไม่มี provider call หรืออีเมลจากการแก้รอบนี้ ไม่แก้ app/ฐานข้อมูล/env/deploy

**ส่งตัวอย่างจริงแล้ว 19 ตุลาคม:** หลังเจ้าของกรอก key ส่วนตัวและกดส่ง manifest บันทึก accepted เวลา **15:43:56.555Z (22:43:56 น. ไทย)** เพียง 1 ฉบับ ไม่มี retry ตรวจ Resend email detail พบผู้ส่ง `KorKru <auth@mail.korkru.com>`, ผู้รับ `korkru.me@gmail.com`, หัวข้อ TEST จำลองรายวัน 80% และ test tag ถูกต้อง; รายการ Emails ขึ้น **Delivered** เมื่อสังเกตประมาณ **22:45 น. ไทย** และต่อมาเจ้าของตอบ **“พบใน Inbox”** เป็น owner-reported receipt proof แยกจากสถานะเซิร์ฟเวอร์ปลายทางและการอ่าน Gmail โดยอิสระ

Webhook ของตัวอย่างฉบับเดียวกันขึ้น **Success / HTTP 200 / 1 attempt** เวลา **15:43:58.012Z (22:43:58 น. ไทย)** ด้วยสถานะ `below_threshold`; Vercel request log ที่จำกัด exact alias/path/POST และ environment Preview พบ **200 เวลา15:43:58.130Z** ตรงกัน จึงไม่มีการส่งเตือนเพิ่มจาก event ของตัวอย่าง ไม่เก็บ provider/event IDs หรือ payload ลงเอกสาร ปิด local helper หลังตรวจ acceptance/delivery แล้วและคง accepted manifest ไว้ป้องกันส่งซ้ำ รอบนี้ไม่มี app/env/ฐานข้อมูล/migration/deploy เปลี่ยน Production ยังปิดและ SEB ยังพัก ตัวอย่างนี้ไม่ทดแทนหลักฐานการตรวจยอดจริงแตะทั้งหกเกณฑ์

แยกผลจำลองในเครื่องจากการต่อบริการจริง ไม่ลด threshold บนเว็บจริงและไม่ส่งจนโควตาเต็มเพื่อทดสอบ รันชุดทดสอบเฉพาะโควตาซ้ำได้จากโฟลเดอร์โปรเจกต์:

```bash
npm test -- lib/resend-quota-alert.test.ts lib/resend-quota-store.test.ts lib/resend-quota-ledger-sql.test.ts
```

1. **Local mock tests:** daily 79/80/89/90/94/95/100 และ monthly 2,399/2,400/2,699/2,700/2,849/2,850; ยอดต่ำกว่าเงียบและยอดแตะเกณฑ์เตือนช่วงถูกต้อง ตรวจทั้งสองช่วงถึงเกณฑ์พร้อมกัน, daily ไม่จำกัดแต่ monthly ถึงเกณฑ์, ยอดกระโดดให้ระดับสูงสุด, retry/concurrency, วันใหม่แต่รอบเดือนเดิม, รอบเดือนใหม่ และ signed self-event ของระดับ 95 ที่ข้ามอีกช่วง
2. **Local failure/ledger tests:** ลายเซ็นปลอม/หาย/เก่า, raw body เกินขนาด, Usage malformed/timeout/redirect, monthly window ไม่สมเหตุสมผล, payload hash เปลี่ยน, provider รับแล้ว response หาย, mark accepted ล้มเหลว และ pending เกิน 23 ชั่วโมงต้องไม่ส่งซ้ำ ทุกกรณีใช้ provider/ฐานข้อมูลจำลอง ไม่ส่งอีเมลจริง
3. **Staging readiness:** ยืนยัน migration/config และ public webhook URL จากภายนอกว่าไม่เป็น sign-in page ก่อนเปิด flag ทดสอบ จากนั้นตรวจ Svix rejection โดยไม่เรียก Usage/ส่งอีเมล และใช้ signed event ตรวจว่าอ่าน Usage API จริงได้ด้วย key Full access บันทึกเฉพาะยอด/เพดาน/รอบที่ไม่ใช่ secret เมื่อ flag ยังปิดจะได้ `503 not_configured` แทน
4. **Staging signed delivery — ผ่านแล้ว 19 ตุลาคม:** event จาก recovery email ใหม่ของเจ้าของได้ Success/HTTP200/`below_threshold` ตามหลักฐานข้างต้น ทั้งสองช่วงยังต่ำกว่าเกณฑ์และไม่มี alert เพิ่ม Preview log ตรงกัน ไม่ต้องส่งซ้ำเพื่อแก้ปัญหาที่ผ่านแล้ว การทดสอบครั้งต่อไปต้องใช้ข้อมูลสังเคราะห์ตามกติกา Staging และตรวจ delivery log/route response ไม่ถือว่าแค่เปิดหน้าเว็บได้คือ webhook ผ่าน
5. **ทดสอบตัวอีเมลเตือน:** ข้อความ/ผู้รับ/threshold และการทำงานระดับ 80/90/95 ยืนยันใน local mocks ก่อน หากต้องการส่งตัวอย่างจริงให้ส่งเพียงฉบับที่ตกลงไว้ผ่านขั้นตอนทดสอบแยก ไม่ปลอม signed production event/ลดเกณฑ์/ล้าง ledger เพื่อบังคับส่ง ตัวอย่างถึง Gmail ไม่ทดแทนหลักฐานว่าการข้าม threshold ของ provider เกิดจริง
6. หลัง Staging ผ่านจึงย้าย endpoint และตั้ง Production ตาม release workflow; การตรวจ Production ต้องได้รับอนุมัติและเป็น read-only เว้นแต่ได้รับอนุญาตการเปลี่ยนแปลงเฉพาะนั้นแล้ว

Core recovery บน Staging ที่เจ้าของทดสอบผ่านแล้วคงผลเดิม: อีเมล → reset form → same-password warning → ส่งรหัสอื่น → success banner → รหัสเก่าถูกปฏิเสธ/รหัสใหม่เข้าได้ ส่วนลิงก์ใช้แล้ว/หมดอายุแบบ manual ยังไม่ได้รายงาน งาน monitor นี้ไม่ต้องให้ทดสอบ recovery ชุดเดิมใหม่

## สถานะการตรวจ

รอบ **80/90/95 รายวันและรายเดือนพร้อม durable ledger (18 ตุลาคม 2026)** ผ่าน TypeScript, full Vitest **313 ไฟล์ / 4,214 เคส** และ Node.js 24 production Webpack build ชุดโควตาเฉพาะ **132 เคส** ประกอบด้วย runtime 90, migration SQL จริงบน PGlite 31 และ RPC boundary 11; runtime 90 เคสรันซ้ำผ่านหลังจัดลำดับ mock ให้ตรง SQL แล้ว

Signed Next HTTP fixture ผ่าน **9 กรณี** รวมขอบเขต threshold ทั้งหก, unsigned rejection, partial retry และ self-event ระดับ 95 ที่ข้ามอีกช่วง ใช้ Supabase/Resend จำลอง ไม่มีอีเมลภายนอก Next MCP compilation/config/session errors ว่าง และหน้า login เดิม render/React tree ถูกต้อง ไม่มี UI เปลี่ยนจึงไม่รัน token lint รอบนี้ Build ครั้งแรกติด sandbox Google Fonts DNS และผ่านเมื่ออนุญาต network สำหรับ build ไม่ใช่ application failure

**รอบรวม Staging วันที่ 19 ตุลาคม 2026:** Node.js 24 production Webpack build ผ่านพร้อม TypeScript Full suite รอบแรกผ่าน **315 ไฟล์ / 4,296 เคส** แต่มี 7 เคสไม่ผ่านใน 3 ไฟล์ SEB ที่ quota patch ไม่ได้แก้ (PGlite timeout 5 วินาที 6 เคส และ helper probe ได้ null 1 เคส) หลัง build จบรัน 3 ไฟล์นี้แยกผ่าน **3 ไฟล์ / 17 เคส** โดยไม่แก้ application code จึงบันทึก full-run failure และผล rerun แยกกัน ไม่อ้างว่า full run รอบแรกผ่านทั้งหมด ผลโควตาเฉพาะ 132 เคสข้างต้นยังเป็นหลักฐานของแพตช์เดิมที่ผ่านแล้ว

Hosted Staging รอบนี้ apply/ตรวจ **ledger ใหม่เพียงไฟล์ `20261018154826`** แล้ว: history 162 รายการ, RLS เปิด และ service-only RPC ผ่าน พร้อมเก็บ API key/signing secret/from/to เฉพาะ Preview branch `staging` และลบสำเนา scope กว้างแล้ว Staging รุ่น `8cd3919` ขึ้น Ready ตรวจ source revision/badge และ unsigned rejection ผ่าน และ **signed delivery จาก recovery email ใหม่ตอบ 200/`below_threshold` เวลา 15:08:06.344Z** ยืนยัน Svix/Usage API จริงทั้งรายวันและรายเดือนตามเส้นทางนี้ Flag Staging เป็น `true`; Preview log ที่ **15:08:06.458Z** ตรงกัน การอ่านยอดรวม ledger หลังทดสอบพบ **0 แถว** และกลุ่ม scope/period/level เป็น `[]` สอดคล้องกับการยังไม่ถึงเกณฑ์และไม่มี alert claim เพิ่ม **การข้ามจุดเกณฑ์ทั้งหกและการส่งเตือนจำลองผ่าน local 132 เคส/HTTP fixture 9 กรณี ส่วนอีเมลเตือนจริงยังไม่ได้บังคับทดสอบ** ไม่ส่งจนถึงโควตาและไม่มี Production SMTP/Google หรือ SEB rollout เพิ่ม

หลักฐานย้อนหลังของ **รุ่น daily-only 80/90/97**: TypeScript, Vitest 276 ไฟล์ / 3,447 เคส (monitor 47 เคส), Webpack build และ Next HTTP กับ provider จำลองผ่าน จึงเป็นหลักฐานเฉพาะรุ่นเดิม แพตช์ recovery/branding ถัดมามีผลตรวจแยกใน `docs/AUTH_SIGNUP_ROLLOUT.md` และไม่ยืนยัน quota-alert delivery หรือ Production SMTP

อ้างอิงตรวจ 18 ตุลาคม 2026: [Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage), [API keys](https://resend.com/docs/api-reference/api-keys/create-api-key), [Account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [Verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [Email sent payload](https://resend.com/docs/webhooks/emails/sent), [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Retries](https://resend.com/docs/webhooks/retries-and-replays)
