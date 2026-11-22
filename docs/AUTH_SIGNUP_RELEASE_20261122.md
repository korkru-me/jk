# รองรับนักเรียนสมัครพร้อมกัน 80 คน — 22 พฤศจิกายน 2026

## ขอบเขตที่อนุญาตรอบล่าสุด

เจ้าของขอแก้โค้ดและลิมิต Auth บนเว็บจริง โดยไม่อัปเกรดแพ็กเกจ และตรวจการสมัครบัญชีใหม่บน Staging หลังอัปเดต คำขอนี้อนุญาตงาน Production ต่อจากขอบเขต Staging-only ที่บันทึกก่อนหน้า แต่ไม่อนุญาตรันข้อสอบยาวหรือใช้ข้อมูลจริงในการทดสอบ

## โค้ด

- ใช้ bounded Auth 429 retry ที่ origin/endpoint allowlist เดิม ครบ server client, browser client และ session-refresh proxy จึงไม่ปล่อยให้ proxy/browser refresh ล้มทันทีขณะคำขอกระจุก
- ใช้ jitter และเคารพ Retry-After จำกัดแปด retries / 40 วินาทีของการรอ ไม่ cache session ข้ามผู้ใช้ ไม่เปลี่ยน getUser/RLS/ownership verification
- คำขอฐานข้อมูล/Storage และ Auth operations นอก allowlist ส่งผ่าน input/init เดิม รวมถึง Next.js fetch metadata
- ไม่ replay ambiguous network errors, 5xx, invalid credentials, database writes หรือ email quota รองรับรูปแบบ quota error ทั้ง code และ error_code
- คง anonymous email/IP reservations เดิม: 120 requests/hour/IP ฝั่งแอป ไม่มี privileged signup shortcut
- Supabase signup/sign-in และ token limits ที่จะใช้: 600 requests/5 min/IP โดยไม่อัปเกรด ค่า Confirm email ของ Production คงปิดตามเดิม Staging ปิดชั่วคราวระหว่างทดสอบตามที่เคยอนุญาต แล้วคืนเปิดหลังจบ

## งบการตรวจ Staging

ตัวทดสอบ scripts/verify-auth-signup-staging.mjs จำกัดบัญชีใหม่ 80 คนเพียง cohort เดียว, ไม่เกิน 300 HTTP requests และหยุดเมื่อข้อมูลรับส่งรวมเกิน 64 MiB ต้องยืนยัน canonical Staging badge, project ref และ public Auth settings ว่าไม่ส่งอีเมลก่อนเริ่ม ไม่มี setup ผ่าน admin Auth API ไม่มีการสร้างห้อง/ข้อสอบ/โจทย์

ทุกการสมัครใช้ Server Action register ที่เว็บส่งให้ browser จริง ตรวจ application receipt, signedIn และ auth cookie ของโครงการ Staging ไม่ใช้ HTTP 200 เพียงอย่างเดียว มี authenticated dashboard probes แปดบัญชี และตรวจจำนวน profile/organization/education/session ครบ 80 ด้วย SQL แยกต่างหาก ข้อมูล credentials/session อยู่ใน temporary manifest สิทธิ์ 0600 เท่านั้น

ไม่ล้าง limiter counters เพิ่ม รอให้ช่วงชั่วโมงของรอบเดิมหมดเองก่อนเริ่ม ปริมาณที่ใช้จริงและผลตรวจจะบันทึกเมื่อเสร็จ ไม่มีการรับรอง 80/80 ก่อนมีหลักฐาน

## สถานะ

Local checks ผ่าน: TypeScript, 352 suites / 4,929 tests, design-token lint และ Webpack production build ไม่มี migration ใหม่

Staging canonical alias ใช้ Ready deployment dpl_BB5XgvTrgUvsVywbrcWmrV2MNHL1, commit c9288b0eb63eea0d951406319c417b2d586268b6 (PR #149; source ae813d7)

ทดสอบ cohort 43018f00-0889-4c45-b4ac-177d4417cadf สมัครใหม่พร้อมกันผ่าน 80/80, p50 6,093 ms, p95 11,607 ms, max 11,756 ms; authenticated dashboard probes ผ่าน 8/8 ใช้ 105 HTTP requests, download 2,519,027 bytes และ email sends 0 ตัวเลขนี้เป็นเฉพาะ harness traffic ไม่รวมคำขอภายใน server/CI และไม่ใช่การวัด quota invoice

SQL ยืนยัน auth users, confirmed users, active student profiles, education records ที่ตรงแต่ละบัญชี, owner memberships และ sessions อย่างละ 80 คืน Confirm email ของ Staging เป็น ON แล้ว Production บันทึก token refresh 150 → 600 และ signup/signin 30 → 600 requests/5min/IP ยืนยันค่าคงอยู่หลัง reload ไม่เปลี่ยน SMTP/Confirm email/IP forwarding ของ Production

Production PR #146 merged เป็น fb8e0665fcd8cbcf00c0c8e4b9e3f8f4c29f3e4f, deployment dpl_XPff6FGSWgTqMKvZJgVTmaHqfa1w READY และ canonical www.korkru.com ชี้ deployment นี้แล้ว ตรวจหน้า signup บนเว็บจริงแบบอ่านอย่างเดียวได้ ไม่มีบัญชีทดสอบ Production

Primary /Users/korkusonmasaen/Korkru/korkru ที่ localhost:3000 (PID 5498) ซิงก์ exact released source/test หกไฟล์: lib/actions/auth.ts, lib/auth/rate-limit-fetch.ts + test และ lib/supabase/{client,server,middleware}.ts ไม่มี dependency/env change รักษา hash ของ dirty/untracked files อื่น 349 ไฟล์ครบ

Primary validation: TypeScript ผ่าน, targeted retry tests 16/16, full suite 352 files / 4,963 tests ผ่าน (ต่างจาก candidate เพราะคงงาน local อื่นไว้), isolated Webpack production build ผ่านโดยใช้ NEXT_DIST_DIR แยก แล้วคืนเฉพาะ generated build includes เพื่อรักษา tsconfig เดิม ตรวจ localhost signup เลือกนักเรียนและ empty-form validation ได้ Next MCP compilation issues [], configErrors 0, sessionErrors 0 การสมัคร hosted ที่มี Auth จริงตรวจบน Staging เท่านั้น

Cleanup สำเร็จ: guarded transaction ตรวจ email/full_name/run/time/role/ownership ครบ และตรวจ dependent rows ผ่าน pg_constraint ก่อนลบ exactly 80 sessions, 80 empty personal orgs, 80 synthetic Auth users ยืนยัน Auth users/public profiles/orgs ของ run เหลือ 0 ลบ temporary keys/passwords/session manifest แล้ว ไม่ reset limiter counters เพิ่ม

ไม่ได้รันทดสอบข้อสอบ 40 ข้อตลอดคาบ/heartbeat จึงยืนยันเฉพาะ signup/authenticated entry burst ไม่ใช่การรับประกันโหลดข้อสอบทั้งระบบ คง app signup/email guard 120/hour/IP มีพื้นที่อีก 40 ครั้งต่อ IP ในชั่วโมงเดียวกันเมื่อเริ่มจาก bucket ว่าง; password login ไม่ผ่าน guard ตัวนี้ การลบบัญชีทดสอบไม่คืนโควตา usage ที่ใช้ไปแล้ว ไม่มี migrations หรือ schema/RLS changes
