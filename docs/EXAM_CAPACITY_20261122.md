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

ตรวจการตั้งค่าจริงแล้ว: Production ปิด Confirm email อยู่เดิม; Staging เปิด Confirm email จึงไม่ใช่สภาพสมัครแบบเดียวกัน ต้องแยกผลลิมิตอีเมลของ Staging ออกจากประสบการณ์สมัครของนักเรียนพรุ่งนี้ ยังไม่เปลี่ยน Confirm email ของ Production เจ้าของอนุญาตปิด Confirm email เฉพาะ Staging ชั่วคราว และได้คืนค่าเป็นเปิดหลังสั่งหยุดทดสอบแล้ว

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


## ผลรอบสองและขอบเขตสุดท้าย

- Staging PR #147 merge เป็น e04aedbc8b1def2905439b1cc118b6de9609ee5f; deployment dpl_5QwzgXJ4uKA8oe69DLrHrQ9dcZMW READY และ alias staging.korkru.com ตรงกับ commit นี้
- ทดสอบสมัครด้วย cohort ใหม่ 80 คน หลังลงแพตช์ retry และปิด Confirm email ให้ตรงกับ Production: ผ่าน 55 / ไม่ผ่าน 25; p50 4,640 ms, p95 35,415 ms, max 35,537 ms ข้อผิดพลาดรอบนี้เป็น Auth rate limit ไม่มีลิมิตอีเมล จึงยังไม่ผ่านเกณฑ์ 80/80
- ก่อนรอบสอง reset เฉพาะ network counter ของเครื่องทดสอบที่พิสูจน์ว่ามี 81 requests และ 81 email-hour counters จาก baseline เท่านั้น มี optimistic count/time guards และไม่เพิ่มเพดานตัว limiter การ reset ไม่คืนโควตาผู้ให้บริการ
- เจ้าของอนุญาตตั้ง Staging signup/sign-in และ token limits เป็น 600 requests/5 min/IP แต่สั่งหยุดก่อนวัดซ้ำ จึงไม่มีผลรับรองการสมัคร 80 คนภายใต้ค่า 600 และไม่ได้รันทดสอบทำข้อสอบ/heartbeat/ส่งข้อสอบ
- หลังสั่งหยุด คืนค่าชั่วคราวทั้งหมดก่อน ต่อมาเจ้าของยืนยันให้ Accept cleanup และแก้เฉพาะ Staging จึงตั้งสอง Auth limits ของ Staging กลับเป็น 600 ตามที่อนุญาต โดย Confirm email ยังคงเปิดตามเดิม ไม่ทดสอบโหลดเพิ่ม
- Production ไม่เปลี่ยนโค้ดหรือ Auth settings และไม่อัปเกรดแพ็กเกจ Draft PR #146 ไม่ได้รับอนุญาตให้ปล่อย Production ภายใต้ขอบเขตล่าสุด

## Cleanup ที่อนุมัติและตรวจแล้ว

คำขอลบครั้งแรกถูกปฏิเสธ จึงยังไม่เปลี่ยนข้อมูล หลังเจ้าของยืนยัน Accept จึงรัน transaction เดิมเฉพาะ Staging พร้อมตรวจ exact run namespaces, 66 synthetic Auth users, personal organizations ที่ไม่มีสมาชิกอื่น, resource ownership และไม่มี learner attempts ก่อนลบ หากจำนวนหรือ provenance เปลี่ยน transaction จะยกเลิกทั้งหมด

ผลหลัง transaction: synthetic Auth users 0, questions 0, classroom 0, exam 0 ลบเฉพาะบัญชีที่สร้างสำเร็จ 11 บัญชีใน baseline (รวม canary) และ 55 บัญชีในรอบสอง รวม 66 บัญชี รวมถึง personal organizations/session ของบัญชีเหล่านั้น ไม่มี DROP/TRUNCATE หรือ schema/RLS/migration change ไม่มี Production data ถูกเขียน

เก็บเฉพาะสรุปตัวเลขและ provenance ที่จำเป็น ลบไฟล์ชั่วคราวที่มี passwords, cookies และ automation credential หลัง cleanup โควตาคำขอ/egress/MAU ที่ใช้ไปไม่ย้อนคืนจากการลบข้อมูล

## ยอดที่อ่านได้หลังหยุดและข้อจำกัด

- Vercel Last 30 Days: Function Invocations ประมาณ 145K/1M, Active CPU 1h38m/4h, Fast Data Transfer 1.23/100 GB และ Origin Transfer 831.7 MB/10 GB
- Supabase Usage รอบ 26 Oct–26 Nov ยังคงแสดง Egress 0.42/5 GB, Cached Egress 0.402/5 GB, MAU 183/50K และข้อความว่ายังไม่เกิน Free quota แต่ dashboard ระบุว่าบางยอดช้าได้ 1 ชั่วโมง และ MAU อัปเดตเป็นช่วง จึงไม่อ้างว่าตัวเลขเหล่านี้สะท้อนทุกคำขอที่เพิ่งทดสอบหรือใช้ผลต่างเป็นต้นทุนทดสอบที่แน่นอน
- ความเสี่ยงหลักที่พิสูจน์ได้คือ Auth burst ขณะที่โควตารายเดือนยังมีพื้นที่เหลือ ไม่มี full exam load result จึงยังไม่รับรอง database latency หรือการส่งพร้อมกัน 80 คน
- ผู้ใช้สั่งหยุดโหลด และขอบเขตล่าสุดคือ Staging เท่านั้น ห้ามตีความการอนุมัติ cleanup เป็นการอนุญาตทดสอบหรือปล่อย Production ต่อ
