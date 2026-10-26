# Resend และ SMTP สำหรับ KorKru

## สถานะที่ใช้งานจริง — 26 ตุลาคม 2026

- Production SMTP เปิดแล้ว: `smtp.resend.com`, port `465`, ผู้ส่ง `KorKru <auth@mail.korkru.com>` ใช้ Sending access key เฉพาะโดเมนที่เจ้าของเก็บเป็นส่วนตัว
- Recovery template ภาษาไทยใช้บน Staging/Production แล้วและคง `{{ .ConfirmationURL }}` เพื่อรักษา PKCE callback, recovery nonce และการผูกเบราว์เซอร์เดิม หลักฐานส่งถึง Inbox/SPF/DKIM/DMARC/ไม่มีคำเตือนและผลเปลี่ยนรหัสที่เจ้าของรายงานอยู่ใน [SMTP_PRODUCTION_RELEASE_20261020.md](SMTP_PRODUCTION_RELEASE_20261020.md)
- Quota monitor 80/90/95% ทั้งรายวันและรายเดือนปล่อยผ่าน PR #75 แล้ว `RESEND_QUOTA_ALERTS_ENABLED=true` บน Production และ `false` บน Staging
- Resend webhook เดิม Enabled และชี้ `https://www.korkru.com/api/webhooks/resend` รับ `email.sent`/`email.received` มี signed provider → Production → Usage API ผ่าน HTTP200 และรายการ Success จริง ดู [RESEND_PRODUCTION_RELEASE_20261020.md](RESEND_PRODUCTION_RELEASE_20261020.md)
- Migration `20261017111034_auth_email_request_limits` และ `20261018154826_resend_quota_alert_delivery_ledger` อยู่ใน Production history แล้ว ไม่ apply ซ้ำหรือ replay migration งานอื่น
- Google provider/account linking และการเปลี่ยนนโยบาย Confirm email ยังพักไว้ตามคำสั่งเจ้าของ ไม่เปิดจากการซิงก์เอกสารหรือ signup feedback

## การตั้งค่าและการแยกสิทธิ์

SMTP ใช้ Resend Sending access key ที่จำกัดโดเมน แยกจาก monitor key ซึ่งต้องอ่าน Usage API ได้ เก็บค่าใน secret manager/Supabase/Vercel ตามหน้าที่ ห้ามใส่ key หรือ webhook signing secret ใน Git, แชท หรือ `NEXT_PUBLIC_*` และไม่คัดลอก Production secrets ไป local/Staging

Quota runtime ใช้ server-only `RESEND_QUOTA_API_KEY`, `RESEND_QUOTA_WEBHOOK_SECRET`, `RESEND_QUOTA_ALERT_FROM`, `RESEND_QUOTA_ALERT_TO` และ rollout flag ส่วน recovery/email limiter ใช้ `AUTH_FLOW_SECRET` แยกต่อ environment และ schema ที่ปล่อยแล้ว Site URL/callback allowlist ต้องตรง environment และคง query ของ recovery request ไม่แทนด้วย URL รีเซ็ตตายตัว

คง email click/open tracking สำหรับอีเมลบัญชีตามค่าที่เจ้าของตั้งไว้ ไม่เปลี่ยน provider security/rotation หรือขยาย rate limits โดยอาศัยการ deploy โค้ดอย่างเดียว Require current password และ app-side limiter เป็นคนละชั้นกับ hosted Auth limits

## พฤติกรรมและข้อจำกัด

Webhook เป็นตัวกระตุ้นให้อ่าน usage จริง ไม่มี cron ขณะที่ไม่มี event ยอดที่กระโดดข้ามหลายเกณฑ์จะเตือนระดับสูงสุดที่พบ ใช้ durable claim/receipt และ provider idempotency key เพื่อกันซ้ำ หาก schema/config ไม่ครบต้องหยุดส่ง ไม่ fallback เป็นการส่งแบบไม่จำกัด

Quota alert ใช้โควตาอีเมลเองและอาจส่งไม่ทันเมื่อโควตาหมด การตอบ accepted/delivered ไม่ใช่หลักฐานว่าเข้า Inbox ทุกผู้รับ ยังไม่ได้บังคับยอดจริงให้ถึงทั้งหกเกณฑ์เพื่อทดสอบ Production ส่วน signed delivery/Usage integration และ local HTTP fixtures มีหลักฐานแยกใน release record

## การตรวจหรือเปลี่ยนค่ารอบถัดไป

เริ่มทดสอบแบบเขียน/ส่งอีเมลบน isolated Staging ด้วยข้อมูลสังเคราะห์ตาม `.cursor/rules/staging-testing.mdc` ก่อน การส่งอีเมลหรือทดสอบรหัส Production ต้องมีขอบเขตที่เจ้าของอนุญาต ไม่ส่งซ้ำเพื่อเดาปัญหาและไม่ลดเกณฑ์หรือล้าง ledger เพื่อให้ได้ผลทดสอบ

Free-account webhook เดิมย้ายจาก Staging มา Production แล้ว ไม่เปิด monitor สอง environment พร้อมกัน การย้อนกลับต้องประสาน endpoint, signing secret และ flag เป็นชุด และเก็บ additive ledger ไว้ ไม่แก้ applied migration เพื่อ rollback

รายละเอียดการเตรียม/ผลตรวจ/rollback ที่ตรวจแล้วเป็นแหล่งอ้างอิงใน release records สองฉบับด้านบน ข้อความ candidate เก่าในประวัติ Git ไม่ใช่สถานะปัจจุบัน
