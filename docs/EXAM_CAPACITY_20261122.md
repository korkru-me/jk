# การเตรียมสอบ 80 คน — 22 พฤศจิกายน 2026

เจ้าของขอให้จำลองนักเรียน 80 คนสมัครและทำข้อสอบปรนัย 40 ข้อพร้อมกันบน Staging และแก้จุดเสี่ยง Auth ให้พร้อมสำหรับ 23 พฤศจิกายน โดยยังไม่อัปเกรดแพ็กเกจ ห้ามใช้ข้อมูลจริงหรือทดสอบเขียนบน Production

## เป้าหมายและขอบเขต

- Canonical Staging: https://staging.korkru.com; Supabase dyuxkrzeveknqgtuzpbh, สถานะ ACTIVE_HEALTHY และ Health advisors ไม่มีรายการเตือน
- อ่านโค้ดจาก origin/master 5bb741b ใน worktree แยก codex/exam-capacity-auth-20261122 ไม่ทับ primary ที่มีงานค้าง
- ใช้ 80 บัญชีนักเรียนสังเคราะห์และ canary 1 บัญชีในโดเมน qa.staging.korkru.com มี manifest ส่วนตัวสิทธิ์ 0600 ระบุ run, email และ credentials สำหรับเก็บกวาดเฉพาะรอบนี้ ไม่ commit credentials หรือ session
- ใช้สิทธิ์ Vercel automation ที่มีอยู่แล้วเฉพาะ canonical Staging ไม่สร้างสิทธิ์ใหม่ ไม่ปิด Deployment Protection ไม่อ่าน service key ของ Production
- `supabase migration list --project-ref ...` ใช้ไม่ได้เพราะ CLI ไม่มี access token จึงอ่าน history ด้วย connector แล้วเทียบไฟล์: Staging มี 168 versions; master ขาด migration ที่เป็น Staging-only 20261009142610 เท่านั้น กู้ source จาก origin/staging เพื่อเทียบครบ 168/168 โดยไม่ replay SQL หรือแก้ migration history ไฟล์นี้ไม่ใช่ migration ใหม่ของแพตช์ Auth

## ผลก่อนแก้

ทดสอบสมัครพร้อมกัน 80 คนผ่าน Server Action register ของ deployment เดิม: ผ่าน 10 / ไม่ผ่าน 70; p50 9,487 ms, p95 12,848 ms, max 13,149 ms ทุกคำขอตอบ HTTP 200 แต่ harness อ่านผลแอปจึงนับข้อผิดพลาดได้ถูกต้อง 41 คำขอเป็นข้อความสมัครไม่สำเร็จทั่วไป และ 29 คำขอเป็นลิมิตอีเมล ยังไม่อ้างว่าข้อผิดพลาดทั่วไปทั้ง 41 เกิดจากสาเหตุเดียวกัน

SQL อิสระพบ 11 Auth users และ 11 profiles ของ run (รวม canary) และยังไม่มีผู้ยืนยันอีเมล ไม่มีบัญชีจากคำขอ validation ที่ผิดก่อนรอบทดสอบ

ตรวจการตั้งค่าจริงแล้ว: Production ปิด Confirm email อยู่เดิม; Staging เปิด Confirm email จึงไม่ใช่สภาพสมัครแบบเดียวกัน ต้องแยกผลลิมิตอีเมลของ Staging ออกจากประสบการณ์สมัครของนักเรียนพรุ่งนี้ ยังไม่เปลี่ยน Confirm email ของ Production ขออนุญาตเฉพาะการปิด Staging ชั่วคราวและคืนค่าหลังทดสอบอยู่ระหว่างรอคำตอบ เพราะเป็นการลดการตรวจยืนยันอีเมลบน Staging

## Candidate

- เพิ่ม bounded retry เฉพาะ explicit Auth 429 สำหรับ signup/token/user ที่ origin Supabase เดิม ไม่เปลี่ยน RLS/getUser/สิทธิ์ข้อมูล และไม่ retry email-quota, network errors หรือ 5xx ที่อาจสร้างบัญชีไปแล้ว
- คำขอเดิมรักษา cookie/session/body แยกต่อผู้ใช้ ไม่มี global session cache ไม่ใช้ admin signup ข้าม flow จริง
- เพิ่มข้อความไทยที่แยก Auth 429 ออกจากข้อมูลสมัครหรือรหัสผ่านผิด
- เพิ่ม harness เป้าหมายตายตัวเฉพาะ Staging, บัญชีไม่เกิน 81, fixed confirmation argument, ไม่ตาม redirect ไปปลายทางอื่น และเก็บ p50/p95/max กับข้อผิดพลาดของแอป
- Fixture เป็นห้องและข้อสอบสังเคราะห์ 40 ข้อ MCQ, เวลา 60 นาที, เปิดคุมสอบ แบบ browser ทั่วไป ไม่คัดลอกโจทย์หรือข้อมูลนักเรียนจาก Production

## Validation ปัจจุบัน

- TypeScript ผ่าน
- Full unit suite หลังแพตช์ Auth: 350 suites / 4,919 tests ผ่าน; harness ใหม่และ Auth retry targeted: 17 tests ผ่าน
- Default Turbopack build ติด filesystem boundary ของ symlink node_modules ใน isolated worktree; Webpack production build ผ่านหลังอนุญาต network สำหรับ Google Fonts ไม่เปลี่ยน bundler ของเว็บที่ deploy
- ยังไม่มีผลยืนยัน 80 คนครบตั้งแต่สมัครจนส่ง และยังไม่ปล่อยแพตช์ขึ้น Production ต้องบันทึกผล hosted, cleanup, exact release และ primary localhost parity ก่อนประกาศพร้อม
