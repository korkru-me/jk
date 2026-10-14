# UAT — คลังฝึกแบบไม่มีคะแนน

อัปเดตล่าสุด: 13 ตุลาคม 2026

เอกสารนี้เป็น release gate ของ Phase 7 การมี route หรือ migration file ใน Git ไม่เท่ากับผ่าน UAT และห้ามเปิด `PRACTICE_LIBRARY_ENABLED=true` บน Production จนกว่ารายการบังคับและ owner sign-off จะครบ

## หลักฐานรอบทดสอบ

- Environment / URL: Hosted UAT `https://staging.korkru.com`; Supabase Staging แยกจาก Production
- Branch / commit: `codex/self-practice-library` code @ `34256db` + evidence @ `4bf6ca8`; final Staging merge `30492cd` ขึ้นสถานะ Ready และตรวจ route/authorization ซ้ำบน `staging.korkru.com`
- Supabase project ref (ไม่ใส่ secret): `dyuxkrzeveknqgtuzpbh` (Staging)
- Migration version + checksum:
  - `20261012155740_self_practice_library.sql` — `ddb723b0cdf87e42d47417d5a55cc6c7a52f46326b6527aca1ad20d40692ae11`
  - `20261013045149_self_practice_atomic_rpcs.sql` — `faebef616f7060dcbbcd38d910c39b7f6b72fecce4bb6ad2fd0682bf8652fa85`
- ยืนยันว่าตั้ง `PRACTICE_VARIANT_SECRET` ฝั่ง server ความยาวอย่างน้อย 32 ตัวอักษร: [x] (แยก Vercel Secret ระหว่าง Preview branch `staging` และ Production)
- ผู้ทดสอบ / วันที่: Codex automated + authenticated browser UAT / 13 ตุลาคม 2026
- ผลรวม: Technical Staging UAT, final build และ full-suite ผ่าน; เจ้าของผลิตภัณฑ์อนุมัติ Production release เมื่อ 13 ตุลาคม 2026 หลังเปิดดูหน้าสร้างบน local ที่ใช้ข้อมูลจริง

### Automated + hosted Staging evidence (13 ตุลาคม 2026)

- Staging isolation guard ยืนยัน project ref `dyuxkrzeveknqgtuzpbh`; dry-run ของ release candidate และ `db lint --linked --level error` ผ่าน และ anonymous `SELECT`/service-only RPC ถูกปฏิเสธด้วย PostgreSQL `42501` · audit ก่อน Production เมื่อ 13 ตุลาคมพบว่า worktree ที่ link กลับ Staging มี remote-only `20261009142610_atomic_seb_exam_start` จึงไม่อ้างว่า ledger ของ feature worktree ตรงทุก version
- Fixture สังเคราะห์ 8 บทบาทและคลัง 1,000 โจทย์ผ่าน gate ครบ: search + exact tag **AND** พบ 500 ข้อ, หน้าแรกคืน 24 แถวผ่าน DB RPC เดียว, JSON row payload 5,824 bytes และ caller latency 112.24 ms (ไม่อ้างว่าเป็น RSC bytes หรือ Production latency)
- Canonical browser role matrix ผ่าน: owner และ co-teacher `admin/manage` จัดการ/ดู progress ได้; co-teacher `view` เห็น metadata แต่ไม่มีปุ่มจัดการและเปิด edit/progress ตรงได้ 404; นักเรียนในห้องเห็นเฉพาะ published library; นักเรียนนอกห้องไม่เห็นรายการและ direct URL ได้ 404; ครูต่าง organization ถูกปฏิเสธจาก gate
- นักเรียนกรอง `สอวน. ค่าย 1` + `ไฟฟ้า` ได้ 500 ผลลัพธ์/21 หน้า, URL เก็บ tag ซ้ำและกลับจากหน้าทำโจทย์แล้วยังคง filter; การตรวจคำตอบแสดง “ตรวจแล้ว · ไม่คิดคะแนน” และเพิ่ม attempt แบบ idempotent โดย payload ไม่เปิด answer key/solution/score
- หน้าครูแสดงนักเรียน 2 คน จำนวนข้อที่เคยตอบและจำนวนครั้งเท่านั้น; detail มีเพียงโจทย์ แท็ก และจำนวนครั้ง และการตรวจ HTML/RSC ไม่พบ answer, correctness, formula, tolerance, solution, score, points หรือ verdict
- Responsive candidate ล่าสุดที่ 320, 390, 768 และ 1280px ไม่มี global horizontal overflow; filter มือถือสูงประมาณ 221px, รายการ 1,000 ข้อในหน้าแก้ไขใช้ internal scroll และตาราง progress มือถือเลื่อนแนวนอนเฉพาะภายในกรอบ
- axe บน candidate ล่าสุดผ่าน `0 violations / 0 incomplete`; Next 16 `get_compilation_issues` และ `get_errors` ไม่พบปัญหา และ practice routes ครบ
- หลัง ARIA patch ล่าสุด TypeScript และ design-token lint ผ่าน, full Vitest ผ่าน 238 files / 3,193 tests และ final `next build --webpack` ผ่านโดยสร้าง static pages 68/68 พร้อม practice routes ครบ
- Vercel ตั้ง `PRACTICE_LIBRARY_ENABLED=true` และ `PRACTICE_VARIANT_SECRET` แยกทั้ง Preview branch `staging` และ Production; ค่า Production มีผลกับ deployment ใหม่เท่านั้น
- หลังจบ UAT cleanup ผ่าน: ลบบัญชี QA สังเคราะห์ 8 บัญชีและโจทย์ 1,000 ข้อ, ลบ manifest สำเร็จ และไม่พบ cleanup failure

หลักฐาน responsive เป็น browser emulation ไม่ใช่ physical-device UAT; เจ้าของผลิตภัณฑ์รับทราบข้อจำกัดนี้และอนุมัติ Production release แล้ว

### Production rollout (13 ตุลาคม 2026)

- Production Supabase project ref `libsutfinswqkruihwdx` ตรงกับ `.env.local` และ linked project ก่อน apply
- เนื่องจาก repository มี SEB/Staging-only migrations เก่า 12 ตัวที่ตั้งใจไม่ลง Production จึงใช้ isolated release view ซึ่ง dry-run แสดงเฉพาะ `20261011025759_classroom_recent_views.sql`, `20261012155740_self_practice_library.sql` และ `20261013045149_self_practice_atomic_rpcs.sql`; ไม่ใช้ `--include-all`, seed หรือ migration repair
- apply สามไฟล์สำเร็จตามลำดับ; post-apply migration ledger ตรงสำหรับ release view, dry-run รายงาน up-to-date และ `supabase db lint --linked --level error` ผ่านโดยไม่มีผลลัพธ์
- ตั้ง Production-only `PRACTICE_VARIANT_SECRET` ใหม่และ `PRACTICE_LIBRARY_ENABLED=true` สำหรับ deployment ใหม่ โดยไม่ reuse secret ของ Staging
- ไม่สร้างผู้ใช้ โจทย์ คลังฝึก หรือ attempt สำหรับ QA บน Production; การตรวจหลัง deploy จำกัดเป็น read-only smoke และการใช้งานจริงของเจ้าของผลิตภัณฑ์

ใช้เฉพาะ Staging ที่ผ่าน isolation guard และข้อมูล QA สังเคราะห์ ห้ามใช้ข้อมูลนักเรียนจริงหรือ Production เพื่อทดสอบ mutation

## ข้อมูลและบัญชีขั้นต่ำ

- ครูเจ้าของห้อง 1 คน, co-teacher `admin`, `manage`, `view` อย่างละ 1 คน, นักเรียนในห้อง 2 คน, นักเรียนนอกห้อง 1 คน และผู้ใช้ต่าง organization 1 คน
- ห้องรายวิชาอย่างน้อย 1 ห้อง และคลังฝึก `draft`, `published`, `closed` อย่างละหนึ่งชุด
- โจทย์อย่างน้อย 100 ข้อ; มีแท็ก `สอวน. ค่าย 1`, `สอวน. ค่าย 2`, `ไฟฟ้า`, `นิวตัน`, `ของไหล` ที่ทับซ้อนกัน และมีชื่อ/ข้อความซ้ำบางส่วนเพื่อทดสอบ search + AND + pagination
- มีโจทย์ที่ตรวจอัตโนมัติได้ โจทย์ชนิดไม่รองรับ โจทย์ที่ถูกนำออกหลังมี event และ randomized question อย่างน้อยหนึ่งข้อ

## 1. Feature flag และทางเข้า

- [ ] เมื่อ flag ปิด เมนูมอบหมายและตัวเลือกสร้างงานไม่มี “คลังฝึก”; เปิด URL ตรงแล้ว 404 โดยไม่เปิดข้อมูล
- [ ] เมื่อ flag เปิด sidebar หลักไม่มี “คลังฝึก” และครูเห็น “คลังฝึก” เฉพาะทางเข้าสร้างงานภายในห้องเรียน ซึ่งลิงก์ไป `/practice/new?classroom=<uuid>`; `AssignmentType` ยังมีเฉพาะ `exercise|exam`
- [ ] นักเรียนไม่เห็นเมนูจัดการของครู และทุก route ยังตรวจสิทธิ์แม้แก้ URL เอง

## 2. เส้นทางครู

- [ ] เจ้าของและ co-teacher `admin/manage` สร้าง draft, เลือกห้อง/โจทย์, แก้, ทำสำเนา, เผยแพร่, ปิด และลบได้ พร้อม pending/success/error feedback
- [ ] ฟอร์มและ payload ไม่มีคะแนน คะแนนเต็ม เกณฑ์ผ่าน due date เวลา access code score strategy หรือจำนวน attempt สูงสุด
- [ ] หลังเผยแพร่ สมาชิกโจทย์ถูก freeze; การแก้แท็กหลายข้อเปลี่ยนแท็กที่โจทย์ต้นทางและสะท้อนใน search
- [ ] view-only co-teacher เห็น metadata ตามนโยบาย แต่เปิด `/progress`, URL รายคน หรือ mutation โดยตรงไม่ได้
- [ ] ผู้ใช้ต่างห้อง/ต่าง organization ได้ permission-denied/404 ไม่ใช่ empty state ที่กลบข้อผิดพลาด

## 3. เส้นทางนักเรียน

- [ ] เปิด `/practice/[id]` แล้วเห็นหน้ารอก่อนรายการโจทย์; หน้ารอไม่สร้าง event/รอบทำ ไม่โหลด input คำตอบ และปุ่ม “เข้าคลังฝึก” พาไป `/practice/[id]/library`
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

- [x] ยืนยันว่าคำว่า “ไม่มีคะแนน” ตรงกับเจตนาผลิตภัณฑ์หลังการเปิดดูบน local
- [x] ยืนยันว่าครูเห็นเพียงข้อที่เคยตอบและจำนวนครั้ง ไม่เห็นคำตอบหรือความถูกต้อง
- [x] ยืนยันว่า view-only co-teacher ไม่ควรเห็น roster progress
- [x] อนุมัติให้เปิด Production flag แบบจำกัด

ผู้อนุมัติ / วันที่ / หมายเหตุ: เจ้าของผลิตภัณฑ์ / 13 ตุลาคม 2026 / อนุมัติให้ดันขึ้นเว็บจริงเพื่อเริ่มทดลองใช้งานส่วนนี้ โดยห้ามสร้างข้อมูล QA สังเคราะห์บน Production

### Production and local synchronization - 14 October 2026

- The owner authorized synchronizing the completed local source with Production and restoring practice creation. The release includes the committed learning-home changes through `db11c22`, including the completed compact student-classroom and assignment-card changes. The local working tree was clean at this release snapshot.
- Staging and Production now have `20261014040543_practice_multi_classroom_creation`, `20261014042628_practice_library_settings`, and `20261014043342_practice_draft_backward_compatibility`. The first two SQL files are byte-identical to their original CLI-created files; their canonical filenames now follow the recorded Staging version and dependency order. No migration repair/revert/reset or deferred SEB migration was used.
- Authenticated Staging gate passed eight synthetic roles, two rooms with 1,000 questions each, persisted settings, previous-editor compatibility, denied view-only permissions, search/pagination, append idempotency, and progress isolation. Cleanup passed. Latest measured search returned 24 of 500 exact tag-AND matches, 5,824 bytes in 162.26ms.
- Production was updated only after that gate. Isolated post-apply dry-run is up-to-date and database lint at error level passed. All creator/editor function definition hashes, signatures, security modes and fixed search paths match the tested Staging database; all five settings columns exist. Production verification was read-only; no synthetic accounts or practice rows were created there.
- The final integrated source passed TypeScript, token lint, 241 Vitest files / 3,214 tests, and webpack production build. Local practice signing uses a separate untracked key. Website deployment/alias verification is the remaining rollout step.
