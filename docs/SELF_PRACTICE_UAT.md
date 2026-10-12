# UAT — คลังฝึกแบบไม่มีคะแนน

อัปเดตล่าสุด: 13 ตุลาคม 2026

เอกสารนี้เป็น release gate ของ Phase 7 การมี route หรือ migration file ใน Git ไม่เท่ากับผ่าน UAT และห้ามเปิด `PRACTICE_LIBRARY_ENABLED=true` บน Production จนกว่ารายการบังคับและ owner sign-off จะครบ

## หลักฐานรอบทดสอบ

- Environment / URL: Local candidate `http://localhost:3001`; hosted UAT ต้องใช้ `https://staging.korkru.com` เท่านั้น
- Branch / commit: `codex/self-practice-library` @ `4a979ee`; migration delivery `codex/self-practice-staging-delivery` @ `d71e21b`
- Supabase project ref (ไม่ใส่ secret): `dyuxkrzeveknqgtuzpbh` (Staging)
- Migration version + checksum:
  - `20261012155740_self_practice_library.sql` — `ddb723b0cdf87e42d47417d5a55cc6c7a52f46326b6527aca1ad20d40692ae11`
  - `20261013045149_self_practice_atomic_rpcs.sql` — `faebef616f7060dcbbcd38d910c39b7f6b72fecce4bb6ad2fd0682bf8652fa85`
- ยืนยันว่าตั้ง `PRACTICE_VARIANT_SECRET` ฝั่ง server ความยาวอย่างน้อย 32 ตัวอักษร: [ ]
- ผู้ทดสอบ / วันที่:
- ผลรวม: `ผ่าน` / `ไม่ผ่าน` / `ถูกบล็อก`

### Automated candidate evidence (13 ตุลาคม 2026)

- TypeScript: `npx tsc --noEmit` ผ่าน
- Vitest: 238 files / 3,193 tests ผ่าน รวม SQL/RLS/RPC contract บน PGlite 32 เคส
- Design-token lint: ผ่าน; palette 105 (baseline 149), hand-rolled cards 0, buttons 259 (baseline 302)
- Production build: `next build --webpack` ผ่าน และสร้าง practice routes ครบ
- Next 16 runtime: `get_compilation_issues` ไม่พบ issue; `get_errors` ไม่พบ config/session error หลังเปิด route ใหม่
- Browser local: เปิด `/practice` โดยไม่มี session แล้ว redirect ไป `/login`; console รอบใหม่สะอาด และ viewport 320 px มี `scrollWidth = innerWidth = 320`
- Staging migration: apply จาก committed delivery `d71e21b` เฉพาะ `20261012155740` + `20261013045149` สำเร็จ; post-apply ledger ตรง local/remote, dry-run คืน `upToDate: true` และ `db lint --linked --level error` ไม่พบผลลัพธ์
- Staging anonymous negative smoke: direct `SELECT` ของทั้งสามตารางและ service-only search RPC ถูกปฏิเสธด้วย PostgreSQL `42501`
- Staging readiness guard: 6 checks ผ่าน แต่ขาด `SUPABASE_SERVICE_ROLE_KEY` ของ Staging จึงไม่สร้าง synthetic accounts/fixtures และไม่อ้าง authenticated UAT ว่าผ่าน
- Local scale evidence: PGlite fixture 1,000 โจทย์ มี progress สังเคราะห์ของนักเรียน 2 คน; ค้นข้อความ + แท็ก AND พบ 500 ข้อและคืน 24 แถวผ่าน RPC เดียว, payload แถวผลลัพธ์ 5,440 bytes, เวลาที่ caller วัด 37.03 ms และ `EXPLAIN ANALYZE` เป็น `Function Scan` 24 actual rows / 33.197 ms (ค่าจากเครื่อง local รอบนี้ ไม่ใช่ hosted latency หรือ RSC bytes)

หลักฐานชุดนี้ยังไม่แทน authenticated multi-role browser UAT, hosted 1,000-question/RSC measurement, physical-device UAT หรือ owner sign-off; รายการเหล่านั้นยังคงเป็น release gate ของ Production

ใช้เฉพาะ Staging ที่ผ่าน isolation guard และข้อมูล QA สังเคราะห์ ห้ามใช้ข้อมูลนักเรียนจริงหรือ Production เพื่อทดสอบ mutation

## ข้อมูลและบัญชีขั้นต่ำ

- ครูเจ้าของห้อง 1 คน, co-teacher `admin`, `manage`, `view` อย่างละ 1 คน, นักเรียนในห้อง 2 คน, นักเรียนนอกห้อง 1 คน และผู้ใช้ต่าง organization 1 คน
- ห้องรายวิชาอย่างน้อย 1 ห้อง และคลังฝึก `draft`, `published`, `closed` อย่างละหนึ่งชุด
- โจทย์อย่างน้อย 100 ข้อ; มีแท็ก `สอวน. ค่าย 1`, `สอวน. ค่าย 2`, `ไฟฟ้า`, `นิวตัน`, `ของไหล` ที่ทับซ้อนกัน และมีชื่อ/ข้อความซ้ำบางส่วนเพื่อทดสอบ search + AND + pagination
- มีโจทย์ที่ตรวจอัตโนมัติได้ โจทย์ชนิดไม่รองรับ โจทย์ที่ถูกนำออกหลังมี event และ randomized question อย่างน้อยหนึ่งข้อ

## 1. Feature flag และทางเข้า

- [ ] เมื่อ flag ปิด sidebar เมนูมอบหมาย และตัวเลือกสร้างงานไม่มี “คลังฝึก”; เปิด URL ตรงแล้ว 404 โดยไม่เปิดข้อมูล
- [ ] เมื่อ flag เปิด ครูเห็น “คลังฝึก · ไม่มีคะแนน” และลิงก์ไป `/practice` หรือ `/practice/new?classroom=<uuid>`; `AssignmentType` ยังมีเฉพาะ `exercise|exam`
- [ ] นักเรียนไม่เห็นเมนูจัดการของครู และทุก route ยังตรวจสิทธิ์แม้แก้ URL เอง

## 2. เส้นทางครู

- [ ] เจ้าของและ co-teacher `admin/manage` สร้าง draft, เลือกห้อง/โจทย์, แก้, ทำสำเนา, เผยแพร่, ปิด และลบได้ พร้อม pending/success/error feedback
- [ ] ฟอร์มและ payload ไม่มีคะแนน คะแนนเต็ม เกณฑ์ผ่าน due date เวลา access code score strategy หรือจำนวน attempt สูงสุด
- [ ] หลังเผยแพร่ สมาชิกโจทย์ถูก freeze; การแก้แท็กหลายข้อเปลี่ยนแท็กที่โจทย์ต้นทางและสะท้อนใน search
- [ ] view-only co-teacher เห็น metadata ตามนโยบาย แต่เปิด `/progress`, URL รายคน หรือ mutation โดยตรงไม่ได้
- [ ] ผู้ใช้ต่างห้อง/ต่าง organization ได้ permission-denied/404 ไม่ใช่ empty state ที่กลบข้อผิดพลาด

## 3. เส้นทางนักเรียน

- [ ] เห็นเฉพาะคลัง `published` ของห้องที่ยังเป็นสมาชิก; `draft`, `closed`, ห้องอื่น, student ID อื่น และการถอน roster ถูกปฏิเสธ
- [ ] ค้นชื่อ/ข้อความร่วมกับ `สอวน. ค่าย 1` + `ไฟฟ้า` แล้วได้เฉพาะโจทย์ที่มีครบทั้งสองแท็ก; เพิ่มแท็กทำให้ผลเท่าเดิมหรือน้อยลง ลบ chip/ล้างทั้งหมดได้
- [ ] reload/back คืน `q`, tag ซ้ำ, page และตำแหน่งรายการเดิม ผลไม่ซ้ำ/หายข้ามหน้า
- [ ] เปิดข้อ พิมพ์ร่าง reload หรือกดตรวจคำตอบว่างไม่สร้าง event
- [ ] กดตรวจคำตอบถูกและผิดอย่างละหนึ่งครั้งเพิ่มจำนวนเท่ากัน ครูแยกไม่ได้ว่าเหตุการณ์ใดถูก; นักเรียนเห็น feedback ของตนและลองใหม่ได้
- [ ] retry/double click/concurrent request ด้วย UUID เดิมเพิ่มเพียงหนึ่ง event; UUID ใหม่จากการกดใหม่เพิ่มอีกหนึ่ง
- [ ] initial RSC/network payload ไม่มี answer key, correct flags, formula snapshot, canonical ordering, solution หรือข้อมูลนักเรียนคนอื่น
- [ ] receipt ที่แก้ลายเซ็น หมดอายุ หรือผูก actor/library/question คนละค่า ถูกปฏิเสธและไม่สร้าง event

## 4. ความคืบหน้าและการไม่เป็นคะแนน

- [ ] overview เรียงตาม roster ไม่ใช่ ranking แสดงเพียงนักเรียน จำนวนข้อไม่ซ้ำที่เคยตอบ และจำนวนครั้งรวม
- [ ] detail รายคนแสดงเพียงชื่อ/รหัสโจทย์ แท็ก และจำนวนครั้ง รวม event ตรงกับฐานแม้มี retry หรือโจทย์ถูกนำออก
- [ ] UI/RSC/API ไม่มี answer, correctness, is_correct, score, points, verdict, solution, accuracy, ผ่าน/ไม่ผ่าน หรือเวลา activity
- [ ] ไม่มีแถวใหม่หรือผลกระทบใน `assignments`, `assignment_classrooms`, `submissions`, `submission_answers`, gradebook, homeroom score และ question statistics
- [ ] ไม่มี export เป็นคะแนน leaderboard กราฟ mastery หรือสีแดง/เขียวที่ตีความเป็นผลการเรียน

## 5. Database และ security

- [ ] local และ Staging migration ledger ตรงกันก่อน apply; migration ที่ commit กับ SQL ที่ apply มี checksum เดียวกัน และ dry-run มีเฉพาะ migration ที่ตั้งใจ
- [ ] RLS/RPC negative cases ผ่านสำหรับ anon, student คนอื่น, roster ถูกถอน, draft/closed, view-only, ครูนอกห้อง, ต่าง organization และ question ที่ไม่อยู่ใน library
- [ ] browser role insert/update/delete `practice_answer_attempts` ตรงไม่ได้; service RPC ตรวจ actor/library/question/idempotency ใน transaction
- [ ] schema event ไม่มี forbidden answer/correctness/score columns; database time เป็นผู้กำหนด `checked_at`
- [ ] `supabase db lint --linked --level error` ผ่าน และ log/error/analytics ที่ตรวจได้ไม่มี answer payload หรือผลถูกผิด

## 6. ประสิทธิภาพ การเข้าถึง และ responsive

- [ ] fixture 1,000 โจทย์กับ progress หลายคนไม่มี N+1; บันทึก query plan, จำนวน query, RSC/payload bytes และเวลาที่วัดจริงไว้กับหลักฐานรอบทดสอบ
- [ ] 320, 390, 768 และ 1280/1440px ไม่มี horizontal overflow; ที่ 1440×900 เห็นโจทย์อย่างน้อย 5 แถวและ roster อย่างน้อย 7 แถวเหนือ fold
- [ ] toolbar ไม่สูงเกินประมาณ 96px, แถวโจทย์ 64–72px, แถว progress 44–48px, tag ไม่กินเกินสองบรรทัดก่อน “+N” และไม่มี Card ซ้อน Card
- [ ] keyboard/focus order, accessible name, touch target 44px, loading/empty/no-result/error/permission states และ axe ผ่านโดยไม่มี critical/serious violation
- [ ] browser console, Next runtime diagnostics, TypeScript, full tests, token lint และ production build ผ่าน

## Owner sign-off

- [ ] ยืนยันว่าคำว่า “ไม่มีคะแนน” ตรงกับเจตนาผลิตภัณฑ์
- [ ] ยืนยันว่าครูเห็นเพียงข้อที่เคยตอบและจำนวนครั้ง ไม่เห็นคำตอบหรือความถูกต้อง
- [ ] ยืนยันว่า view-only co-teacher ไม่ควรเห็น roster progress
- [ ] อนุมัติให้เปิด Production flag แบบจำกัด

ผู้อนุมัติ / วันที่ / หมายเหตุ:
