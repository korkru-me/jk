# รองรับนักเรียนสมัครพร้อมกัน 80 คน — 22 พฤศจิกายน 2026

## ขอบเขตที่อนุญาตรอบล่าสุด

เจ้าของขอแก้โค้ดและลิมิต Auth บนเว็บจริง โดยไม่อัปเกรดแพ็กเกจ และตรวจการสมัครบัญชีใหม่บน Staging หลังอัปเดต คำขอนี้อนุญาตงาน Production ต่อจากขอบเขต Staging-only ที่บันทึกก่อนหน้า แต่ไม่อนุญาตรันข้อสอบยาวหรือใช้ข้อมูลจริงในการทดสอบ

## โค้ด

- ใช้ bounded Auth 429 retry ที่ origin/endpoint allowlist เดิม ครบ server client, browser client และ session-refresh proxy จึงไม่ปล่อยให้ proxy/browser refresh ล้มทันทีขณะคำขอกระจุก
- ใช้ jitter และเคารพ Retry-After จำกัดแปด retries / 40 วินาทีของการรอ ไม่ cache session ข้ามผู้ใช้ ไม่เปลี่ยน getUser/RLS/ownership verification
- ไม่ replay ambiguous network errors, 5xx, invalid credentials, database writes หรือ email quota รองรับรูปแบบ quota error ทั้ง code และ error_code
- คง anonymous email/IP reservations เดิม: 120 requests/hour/IP ฝั่งแอป ไม่มี privileged signup shortcut
- Supabase signup/sign-in และ token limits ที่จะใช้: 600 requests/5 min/IP โดยไม่อัปเกรด ค่า Confirm email ของ Production คงปิดตามเดิม Staging ปิดชั่วคราวระหว่างทดสอบตามที่เคยอนุญาต แล้วคืนเปิดหลังจบ

## งบการตรวจ Staging

ตัวทดสอบ scripts/verify-auth-signup-staging.mjs จำกัดบัญชีใหม่ 80 คนเพียง cohort เดียว, ไม่เกิน 300 HTTP requests และหยุดเมื่อข้อมูลรับส่งรวมเกิน 64 MiB ต้องยืนยัน canonical Staging badge, project ref และ public Auth settings ว่าไม่ส่งอีเมลก่อนเริ่ม ไม่มี setup ผ่าน admin Auth API ไม่มีการสร้างห้อง/ข้อสอบ/โจทย์

ทุกการสมัครใช้ Server Action register ที่เว็บส่งให้ browser จริง ตรวจ application receipt, signedIn และ auth cookie ของโครงการ Staging ไม่ใช้ HTTP 200 เพียงอย่างเดียว มี authenticated dashboard probes แปดบัญชี และตรวจจำนวน profile/organization/education/session ครบ 80 ด้วย SQL แยกต่างหาก ข้อมูล credentials/session อยู่ใน temporary manifest สิทธิ์ 0600 เท่านั้น

ไม่ล้าง limiter counters เพิ่ม รอให้ช่วงชั่วโมงของรอบเดิมหมดเองก่อนเริ่ม ปริมาณที่ใช้จริงและผลตรวจจะบันทึกเมื่อเสร็จ ไม่มีการรับรอง 80/80 ก่อนมีหลักฐาน

## สถานะ

Local checks ผ่าน: TypeScript, 352 suites / 4,928 tests, design-token lint และ Webpack production build กำลังปล่อย Staging ก่อนทดสอบ cohort ใหม่ ยังไม่ใช่ Production release evidence และไม่มี migration ใหม่
