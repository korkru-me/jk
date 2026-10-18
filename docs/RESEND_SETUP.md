# ตั้งค่า Resend Free สำหรับ KorKru

เจ้าของเลือก Resend Free และผู้รับแจ้งเตือน `korkru.me@gmail.com` เมื่อ 17 ตุลาคม 2026 และวันที่ 18 ตุลาคมเปลี่ยนระดับสุดท้ายจาก 97% เป็น **95%** พร้อมขอให้ตรวจ **ทั้งรายวันและรายเดือน** ระดับปัจจุบันจึงเป็น **80%, 90%, 95%** แยกต่อช่วง สำหรับ Free 100 ฉบับ/วัน คือ 80, 90, 95 ฉบับ และ 3,000 ฉบับ/เดือน คือ 2,400, 2,700, 2,850 ฉบับ ([Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage)) ไม่มีการอัปเกรดแพ็กเกจหรือเปิดค่าใช้จ่ายส่วนเกินอัตโนมัติ

**สถานะล่าสุด 18 ตุลาคม 2026: ต่อ custom SMTP บน Staging แล้ว; เจ้าของทดสอบ signup และ recovery core flow ผ่าน; quota alerts ยังปิด** โค้ดระบบบัญชีและ webhook ขึ้น Production ในรอบก่อนแล้ว รอบนี้เจ้าของกลับมาทำ Resend ต่อและพักงาน SEB โดยยังไม่เปิด Production SMTP หรือ Google

- บัญชี Resend สร้างแล้ว; `mail.korkru.com` ขึ้น Verified ใน region Tokyo ตรวจ public DNS พบ TXT `resend._domainkey.mail`, CNAME `rsend.mail` → `rsend-apne1.forge.rmta.net` และ `send.mail` → `send.forge.rmta.net` โดย CNAME เป็น DNS only
- เจ้าของสร้าง Sending access key และกรอก custom SMTP เอง ไม่ส่ง key มาในแชท การอ่าน configuration ยืนยัน Staging ใช้ `smtp.resend.com:465`, username `resend`, sender `auth@mail.korkru.com`, ชื่อ `KorKru Staging` และมี SMTP password โดยไม่อ่าน/บันทึกค่าลับ
- Staging Site URL เป็น `https://staging.korkru.com`, email autoconfirm ปิด, Require current password เปิด และ signup/recovery templates ยังคง `{{ .ConfirmationURL }}` ตามเดิม
- **เจ้าของรายงานว่าได้รับอีเมลสมัคร กดยืนยัน และเข้า Staging สำเร็จแล้ว** และวันที่ 18 ตุลาคมทดสอบ recovery ด้วยอีเมลใหม่ผ่าน: ได้รับอีเมล → เปิด reset form → ลองรหัสเดิมมีคำเตือนใต้ช่อง → ส่งรหัสอื่น → หน้า login มี banner “เปลี่ยนรหัสผ่านแล้ว” ตามภาพเวลา 22:10:54 → เข้าได้ด้วยรหัสใหม่ที่กรอกไว้ ต่อมายืนยันว่ารหัสก่อน reset รอบล่าสุดถูกปฏิเสธด้วย “อีเมลหรือรหัสผ่านไม่ถูกต้อง” ตามภาพเวลา 22:17:18 และรหัสใหม่ยังเข้าได้ตามปกติ เป็น manual/owner-reported proof พร้อมภาพ แยกจาก independent hosted E2E ส่วนลิงก์ใช้แล้วซ้ำ/หมดอายุยังไม่ได้รายงาน; quota-alert delivery ยังต้องตรวจต่อ
- `RESEND_QUOTA_ALERTS_ENABLED=false`; ยังไม่มี Full access monitor key/webhook signing secret ที่ตั้งค่าในรอบนี้ จึงยังไม่ส่งเตือน 80/90/95% จริงทั้งสองช่วง

รอบ release ก่อนมี migration จำกัดคำขอส่งอีเมลและ `AUTH_FLOW_SECRET` พร้อมแล้ว อ่าน `docs/AUTH_SIGNUP_ROLLOUT.md` ประกอบ; SMTP เพียงอย่างเดียวไม่ทดแทน dependency ของ email actions

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

**สถานะ: โค้ดรุ่นใหม่และ migration ตรวจในเครื่องผ่านแล้ว ยังไม่ apply ฐานข้อมูลหรือเปิด webhook จริง** รุ่นเดิมตรวจรายวันเท่านั้น รุ่นใหม่นี้ต้องมี durable delivery ledger ก่อนเปิด flag มิฉะนั้นหยุดส่งแทนการเสี่ยงส่งซ้ำ ไม่เพิ่ม cron หรือซื้อบริการตั้งเวลา Webhook เป็นตัวกระตุ้นให้อ่านยอดจริงจาก Usage API จึงไม่มีการตรวจเป็นช่วงเวลาขณะที่ไม่มี event

ทำทีละขั้นบน Staging ก่อน โดยไม่ส่ง key/secret มาในแชท:

1. **ขั้นแรกสำหรับเจ้าของ:** Resend → API Keys → Create API Key ตั้งชื่อ **`korkru-staging-quota-monitor`** เลือก **Full access** แล้วเก็บ key ใน secret manager ให้เรียบร้อย `GET /usage` ใช้ Sending access ไม่ได้ จึงต้องแยกจาก SMTP key ที่จำกัดโดเมน เมื่อสร้างแล้วตอบเพียงว่า “สร้าง monitor key แล้ว” เพื่อไปขั้น Vercel ไม่ต้องส่งค่า key
2. ฝั่งทีมตรวจ migration history ของ Staging ก่อน rollout migration **`20261018154826_resend_quota_alert_delivery_ledger.sql`** ที่สร้างผ่าน CLI รอบนี้ `supabase migration list --linked` ติด `LegacyProjectNotLinkedError`; เทียบไฟล์กับ live `list_migrations` ผ่าน MCP แบบอ่านอย่างเดียวพบ local-only `20261015132234` และไฟล์ ledger ใหม่นี้ ส่วน remote-only คือ `20261009142610` จึง **ยังไม่ apply** และไม่ใช้ `supabase db push`, reset หรือ repair เพื่อข้ามความต่าง ต้องตรวจและเตรียมวิธีปล่อยเฉพาะ migration นี้พร้อมบันทึกให้ตรวจสอบได้ก่อนเปิด flag งาน SEB ยังพักไว้
3. Vercel project **`jk`** → Settings → Environment Variables เพิ่มเฉพาะ Staging โดยยังปิด flag และเก็บทุกค่าต่อไปนี้เป็น server-only:

```dotenv
KORKRU_DEPLOYMENT_ENV=staging
RESEND_QUOTA_ALERTS_ENABLED=false
RESEND_QUOTA_API_KEY=key_full_access_ที่เก็บเป็น_secret
RESEND_QUOTA_WEBHOOK_SECRET=signing_secret_ของ_endpoint_เมื่อสร้างแล้ว
RESEND_QUOTA_ALERT_FROM=auth@mail.korkru.com
RESEND_QUOTA_ALERT_TO=korkru.me@gmail.com
```

   ใช้ `SUPABASE_SERVICE_ROLE_KEY` ของ Staging ที่มีอยู่เพื่อเรียก ledger ห้ามคัดลอกจาก Production หรือใส่ `NEXT_PUBLIC_*` Runtime ของ route เป็น Node.js และตั้ง `maxDuration=60`; โปรเจกต์นี้ใช้ Node.js 24
4. ตรวจ **readiness แบบอ่านอย่างเดียว** ด้วย monitor key: `GET https://api.resend.com/usage` ต้องได้ daily/monthly `used`, `limit`, `resets_at` ที่สมเหตุสมผล ตรวจการเข้าถึง ledger ใน Staging ด้วย ไม่มี key/Authorization header ใน output/log ตรวจรอบเดือนจากค่าจริงที่ API ให้ ไม่เดาวันตัดรอบจากวันสมัคร ถ้ายังตรวจไม่ได้ให้คง flag ปิด
5. Deploy รุ่นที่มี route และ ledger dependency แล้ว Resend → Webhooks → Add Webhook เลือก **`email.sent` และ `email.received`** URL **`https://staging.korkru.com/api/webhooks/resend`**
6. ตรวจว่า Resend POST ถึง endpoint ได้จริงโดยไม่ติดหน้า Vercel sign-in/Cloudflare challenge Staging ปัจจุบันมี Deployment Protection จึงเป็น dependency ที่ต้องแก้ด้วยข้อยกเว้นที่เจาะจง endpoint/วิธีที่บริการรองรับ **อย่าปิด protection ของทั้งเว็บหรือเผย bypass secret ในแชท/URL/log** Route ตรวจ Svix อยู่แล้ว แต่ไม่สามารถข้ามหน้าป้องกันของ Vercel ด้วย session ของผู้ทดสอบได้เอง หากยังไม่มีวิธีให้ provider ถึง route ให้คงปิด flag
7. เก็บ Signing secret (`whsec_...`) ของ endpoint นั้นใน `RESEND_QUOTA_WEBHOOK_SECRET` ตรวจ prerequisites ข้างต้นครบแล้วจึงเปลี่ยน flag เป็น `true` และ redeploy การเปลี่ยน env ต้อง redeploy จึงมีผล ตรวจ delivery ตามหัวข้อถัดไปก่อนอ้างว่าเปิดใช้งานแล้ว
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
3. **Staging readiness:** ยืนยัน migration/config และอ่าน Usage API จริงได้ด้วย key Full access พร้อมบันทึกเฉพาะยอด/เพดาน/รอบที่ไม่ใช่ secret ตรวจ webhook URL จากภายนอกว่าไม่เป็น sign-in page และตรวจ Svix rejection โดยไม่เรียก Usage/ส่งอีเมล
4. **Staging signed delivery:** ใช้ event ของอีเมลทดสอบที่เจ้าของส่งให้ตนเองตาม flow ปกติ หรือ Resend replay ของ event ที่เหมาะสม ตรวจ webhook ได้ 200, เหตุผล below-threshold เมื่อทั้งสองช่วงยังต่ำ และไม่มี alert เพิ่ม ใช้บัญชีสังเคราะห์ตามกติกา Staging ตรวจทั้ง Resend delivery log และ route response ไม่ถือว่าแค่เปิดหน้าเว็บได้คือ webhook ผ่าน
5. **ทดสอบตัวอีเมลเตือน:** ข้อความ/ผู้รับ/threshold และการทำงานระดับ 80/90/95 ยืนยันใน local mocks ก่อน หากต้องการส่งตัวอย่างจริงให้ส่งเพียงฉบับที่ตกลงไว้ผ่านขั้นตอนทดสอบแยก ไม่ปลอม signed production event/ลดเกณฑ์/ล้าง ledger เพื่อบังคับส่ง ตัวอย่างถึง Gmail ไม่ทดแทนหลักฐานว่าการข้าม threshold ของ provider เกิดจริง
6. หลัง Staging ผ่านจึงย้าย endpoint และตั้ง Production ตาม release workflow; การตรวจ Production ต้องได้รับอนุมัติและเป็น read-only เว้นแต่ได้รับอนุญาตการเปลี่ยนแปลงเฉพาะนั้นแล้ว

Core recovery บน Staging ที่เจ้าของทดสอบผ่านแล้วคงผลเดิม: อีเมล → reset form → same-password warning → ส่งรหัสอื่น → success banner → รหัสเก่าถูกปฏิเสธ/รหัสใหม่เข้าได้ ส่วนลิงก์ใช้แล้ว/หมดอายุแบบ manual ยังไม่ได้รายงาน งาน monitor นี้ไม่ต้องให้ทดสอบ recovery ชุดเดิมใหม่

## สถานะการตรวจ

รอบ **80/90/95 รายวันและรายเดือนพร้อม durable ledger (18 ตุลาคม 2026)** ผ่าน TypeScript, full Vitest **313 ไฟล์ / 4,214 เคส** และ Node.js 24 production Webpack build ชุดโควตาเฉพาะ **132 เคส** ประกอบด้วย runtime 90, migration SQL จริงบน PGlite 31 และ RPC boundary 11; runtime 90 เคสรันซ้ำผ่านหลังจัดลำดับ mock ให้ตรง SQL แล้ว

Signed Next HTTP fixture ผ่าน **9 กรณี** รวมขอบเขต threshold ทั้งหก, unsigned rejection, partial retry และ self-event ระดับ 95 ที่ข้ามอีกช่วง ใช้ Supabase/Resend จำลอง ไม่มีอีเมลภายนอก Next MCP compilation/config/session errors ว่าง และหน้า login เดิม render/React tree ถูกต้อง ไม่มี UI เปลี่ยนจึงไม่รัน token lint รอบนี้ Build ครั้งแรกติด sandbox Google Fonts DNS และผ่านเมื่ออนุญาต network สำหรับ build ไม่ใช่ application failure

ผลข้างต้นไม่ใช่ hosted provider integration: **ยังไม่ apply migration, ตั้ง Full access key/signing secret, อ่าน Usage API จริงด้วย key ใหม่, ตรวจ signed webhook delivery จริง หรือส่งอีเมลเตือนจริง** Flag ยังปิด Production SMTP/Google ยังรอ และ SEB ยังพักไว้

หลักฐานย้อนหลังของ **รุ่น daily-only 80/90/97**: TypeScript, Vitest 276 ไฟล์ / 3,447 เคส (monitor 47 เคส), Webpack build และ Next HTTP กับ provider จำลองผ่าน จึงเป็นหลักฐานเฉพาะรุ่นเดิม แพตช์ recovery/branding ถัดมามีผลตรวจแยกใน `docs/AUTH_SIGNUP_ROLLOUT.md` และไม่ยืนยัน quota-alert delivery หรือ Production SMTP

อ้างอิงตรวจ 18 ตุลาคม 2026: [Pricing](https://resend.com/pricing), [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage), [API keys](https://resend.com/docs/api-reference/api-keys/create-api-key), [Account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [Verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [Email sent payload](https://resend.com/docs/webhooks/emails/sent), [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Retries](https://resend.com/docs/webhooks/retries-and-replays)
