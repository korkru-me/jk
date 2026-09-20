# Staging phase 2C — isolated Supabase and Vercel Preview rollout

อัปเดต: 20 กันยายน 2026
สถานะ: **ทรัพยากรภายนอก, bootstrap, Vercel Preview deploy, DNS และ HTTPS เสร็จแล้ว; รอเฉพาะ authenticated UI smoke test โดยผู้ใช้**

## ทรัพยากรที่สร้าง

- Supabase project: `Korkru Staging`
- Supabase ref: `dyuxkrzeveknqgtuzpbh`
- region: `ap-southeast-1`
- Vercel project เดิม: `jk`
- Production branch: `master`
- Staging branch: `staging`
- canonical Staging URL: `https://staging.korkru.com`
- canonical Production URL: `https://www.korkru.com`

ทั้งสอง environment ใช้โค้ดชุดเดียวกัน แต่ Supabase project, public URL,
anon key, service-role key, cron secret และ SEB session secret เป็นคนละค่า
ทั้งหมด ตัวแปรของ Staging ถูกจำกัดขอบเขตเป็น Vercel Preview เฉพาะ Git branch
`staging`; ไม่ได้แทนค่าของ Production หรือ Preview branch อื่น

credential สำหรับ bootstrap ถูกเก็บใน macOS Keychain และไม่ถูกเขียนลง repo,
`.env.qa.local`, command output หรือเอกสารนี้

## ผล bootstrap

ลำดับจาก `supabase/bootstrap/manifest.json` ถูกใช้ครบ:

1. apply `supabase/schema.sql`
2. apply prerequisite ของ bucket `question-images`
3. apply migration ledger ตั้งแต่ `002` ถึง `20260916230106`
4. ปิด named cron jobs ของ Staging
5. reconcile Storage ผ่าน API และลบ `classroom-post-images` เฉพาะหลังยืนยันว่า
   ว่าง
6. ไม่ seed และไม่ copy ข้อมูลจาก Production

post-bootstrap audit:

- migration dry-run รายงาน `Remote database is up to date`
- public tables 52 ตาราง และเปิด RLS 52/52 ตาราง
- RLS policies 129 รายการ
- Realtime publication มีตารางคุมสอบ 3 ตาราง
- named database cron jobs ที่กำหนดไว้มี 0 งาน
- Auth users, organizations, classrooms และ questions มี 0 แถว
- Storage required buckets ครบ 6 รายการ และ reconciliation เหลือ 0 changes
- Auth Site URL และ redirect allow-list ชี้ `staging.korkru.com`
- Google OAuth ยังปิดใน Staging; email/password ยังเปิดตามค่าเริ่มต้น
- Vercel Preview ของ branch `staging` build สำเร็จและอยู่ในสถานะ Ready
- `staging.korkru.com` ถูกผูกกับ branch `staging` โดยเฉพาะ
- Cloudflare A record ชี้ `staging.korkru.com` ไป Vercel ที่ `76.76.21.21`
- HTTP และ HTTPS request ถึง Vercel และถูกส่งไป Vercel Authentication ตาม
  deployment protection ที่ตั้งใจไว้
- Vercel ออก TLS certificate สำหรับ `staging.korkru.com` สำเร็จ เปิด auto-renew
  และส่ง HSTS header แล้ว

## Fresh-bootstrap compatibility ที่พบจากการรันจริง

ฐาน Production เดิมเคยมี schema บางส่วนที่สร้าง/แก้ผ่าน Dashboard ก่อน migration
ledger จึงพบช่องว่าง 4 จุดเมื่อ replay บนฐานใหม่:

1. `20260718133752` คาดว่ามีคอลัมน์ทดลองของ `classroom_posts` และ policy
   ชื่อเดิมอยู่เสมอ — ปรับเป็น `IF EXISTS`/`IF NOT EXISTS` และ drop policy ก่อน
   create
2. `20260819091000` อ้าง policy `classrooms_org_teacher_all` ซึ่ง migration 014
   เปลี่ยนชื่อเป็น `classrooms_teacher_all` — ปรับให้ตรงกับ ledger ปัจจุบัน
3. `questions.tags` เป็น nullable `text[]` ที่มีใน Production ก่อน ledger — เพิ่ม
   prerequisite แบบ `ADD COLUMN IF NOT EXISTS` ก่อนสร้าง GIN index
4. Production เปิด RLS บน `super_admins` โดยไม่มี client policy แต่ migration 012
   ไม่ได้บันทึกคำสั่งนี้ — เพิ่ม `ENABLE ROW LEVEL SECURITY` เพื่อคง fail-closed
   posture บน fresh project

ทุกจุดถูกพิสูจน์กับ Staging project จริงจน migration ทั้งหมดผ่าน และ migration
ที่ Production เคยบันทึกแล้วจะไม่ถูกรันซ้ำเพราะ version เดิมอยู่ใน remote ledger

## Audit ที่ยังเป็นหนี้เดิม ไม่ใช่ Staging drift

- `supabase db lint` ไม่มี error และมี warning เดิม 3 กลุ่มเกี่ยวกับตัวแปรใน
  PL/pgSQL, volatility และ type assignment
- Supabase Security Advisor: Staging 76 รายการ เทียบกับ Production 77 รายการ;
  กลุ่ม RLS/search-path/extension/SECURITY DEFINER ตรงกับ schema เดิม ส่วน
  Production มี warning leaked-password protection เพิ่มอีก 1 รายการ

ห้ามแก้ warning เหล่านี้แบบเหมารวมใน rollout Staging เพราะหลาย function เป็น
authorization boundary; ต้อง audit signature, owner, grants และ caller แยกเป็น
security-hardening phase

## สิ่งที่ตั้งใจยังไม่เปิด

- ไม่ copy ผู้ใช้ ห้องเรียน ข้อสอบ คำตอบ คะแนน หรืองานวิจัยจาก Production
- ไม่เปิด database cron หรือ Vercel Cron สำหรับข้อมูล Staging
- ไม่ copy `SEB_CONFIG_KEY` หรือ `SEB_BROWSER_EXAM_KEYS` จาก Production เพราะ
  config ที่ชี้ Staging URL ต้องสร้าง CK/BEK ชุดใหม่ในเฟสทดสอบ SEB บน Staging
- ไม่เปิด Google OAuth จนกว่าจะมี client configuration สำหรับ Staging โดยเฉพาะ
