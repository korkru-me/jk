# Architecture

อัปเดตล่าสุด: 30 สิงหาคม 2026

เอกสารนี้อธิบายสถาปัตยกรรมที่พบใน repository ปัจจุบัน ไม่ใช่การรับรองว่าทุกส่วนถูก deploy หรือผ่านการทดสอบ production แล้ว

## Stack

- Next.js 16.2.4 App Router
- React 19.2.4 และ TypeScript `strict`
- Tailwind CSS 4, Base UI และ component ภายใน `components/ui/`
- Supabase Auth, PostgreSQL, RLS และ Storage
- Next.js Server Components เป็นค่าเริ่มต้น และ Client Components เฉพาะส่วนโต้ตอบ
- Server Actions ใน `lib/actions/` สำหรับ mutation หลัก

## โครงสร้าง repository

- `app/` — routes, layouts และ server-side page composition
- `components/` — UI ตามโดเมนและ reusable primitives
- `lib/actions/` — Server Actions และ authorization ก่อน mutation
- `lib/math/` — การสุ่มตัวแปร ประเมินสูตร และตรวจคำตอบตัวเลข
- `lib/supabase/` — browser, server, admin และ middleware clients
- `lib/types.ts` — application domain types ที่เขียนด้วยมือ
- `supabase/migrations/` — ประวัติการเปลี่ยน schema/RLS
- `supabase/schema.sql` — baseline รุ่นแรก ไม่ควรถือว่าแทน migration ทั้งหมด
- `proxy.ts` — refresh Supabase session สำหรับ request ที่เข้าแอป

## Runtime boundaries

### Browser

ใช้ `lib/supabase/client.ts` ซึ่งรับเฉพาะ public URL และ anon key ห้าม import service-role client เข้า Client Component

### Server with user session

ใช้ `lib/supabase/server.ts` เพื่อให้ query ทำงานภายใต้ session และ RLS ของผู้ใช้ นี่ควรเป็นค่าเริ่มต้น

`lib/auth/server.ts` memoize ผล `auth.getUser()` ด้วย React `cache()` ภายใน server render request เดียว เพื่อให้ layout และ page ไม่ตรวจ session ซ้ำกัน ผลนี้ไม่ถูกเก็บข้าม request หรือข้ามผู้ใช้

### Privileged server

`lib/supabase/admin.ts` ใช้ `SUPABASE_SERVICE_ROLE_KEY` และข้าม RLS ได้ เรียกได้เฉพาะ server และต้องตรวจ authentication/authorization ก่อนทุกครั้ง การมี session อย่างเดียวไม่เพียงพอ

## Authentication และ authorization

- Supabase Auth ดูแล session
- `users.role` ใช้ `teacher`, `student`, `admin`
- `organization_members.org_role` ใช้ `owner`, `admin`, `teacher`, `student`
- ครูประจำชั้นมาจากการเป็นครูของ classroom ชนิด `homeroom`
- ครูผู้สอนร่วมมาจาก `classroom_co_teachers` และ permission `admin`, `manage`, `view`
- มีตาราง `super_admins` ใน migration แต่หน้า `/super-admin` ปัจจุบันยังตรวจ `users.role === 'admin'` จึงต้องทบทวน authority model ก่อน production

ต้องบังคับสิทธิ์ทั้งที่ Server Action/page และ RLS อย่าพึ่งการซ่อนปุ่มใน UI

## Multi-tenancy

ทรัพยากรหลักผูกกับ `org_id` และ migration มี trigger ป้องกันเปลี่ยน organization ของ resource หลังสร้าง การเข้าถึงข้ามองค์กรต้องผ่าน visibility/sharing ที่ออกแบบไว้ ไม่ใช่การแก้ `org_id`

ก่อนใช้ `createAdminClient()` เพื่อแก้ RLS recursion ต้องตรวจ membership/ownership ด้วย query ที่เชื่อถือได้ แล้วจำกัด query ให้แคบตาม resource ที่อนุญาต

## เส้นทางข้อมูลหลัก

### โจทย์ถึงคะแนน

1. ครูสร้าง `questions` และ optional configuration ตาม `question_type`
2. ครูรวมโจทย์เป็น `question_sets` หรือเลือกตรงเข้า `assignments`
3. `assignment_classrooms` เชื่อมงานหนึ่งรายการกับหลายห้อง
4. เมื่อเริ่มทำ `startSubmission()` จะสร้าง `submissions` และ `submission_answers`
5. ถ้า `assignments.secure_browser_mode = 'seb_required'` เส้นทาง take จะออก challenge แบบ HMAC อายุ 5 นาที; `SebLaunchGate` อ่าน CK/BEK request hashes จาก SEB JavaScript API แล้ว Server Action ตรวจ exact origin/path/challenge, Config Key, Browser Exam Key และ version ก่อนออก HttpOnly session ที่ผูก user + assignment อายุ 12 ชั่วโมง ทุก server boundary ของ attempt ตรวจ session นี้ซ้ำ และบันทึกเฉพาะเวลา/platform/version ลง submission ไม่เก็บ raw key/hash ส่วน `/system-check` ออก challenge คนละ purpose หลังตรวจ roster เพื่อทดสอบเครื่องโดยไม่อ่านโจทย์/สร้าง attempt/เริ่ม timer และ server ปฏิเสธการ publish ข้อสอบ SEB เมื่อ production URL หรือ secret/CK/BEK ยังไม่พร้อม
   - ถ้าเปิด `android_exam_mode = 'monitored'` อุปกรณ์ Android ใช้ห้องรอแทน SEB นักเรียนยังไม่ได้ attempt/timer จนกว่าครูที่จัดการ assignment จะตรวจเครื่องจริงและอนุมัติ exact student จากห้องคุมสอบ Server จึงออก signed HttpOnly session ที่ผูก student + assignment + approver ทุก read/write boundary ใช้ `getExamAccessSession()` ตรวจ SEB หรือ Android session แล้วบันทึก assurance จริงใน `exam_access_mode`; user-agent ใช้เลือก UI เท่านั้นและไม่ใช่หลักฐานอุปกรณ์
6. หากตั้ง `random_question_count` ระบบสุ่ม subset จากคลัง `question_ids` ก่อน แล้วตรึง subset, ค่าตัวแปรสุ่ม เฉลย ลำดับข้อ และลำดับตัวเลือกไว้ใน `submission_answers` ของ attempt; reload/resume จึงไม่สุ่มใหม่
7. `getExamTakingData()` อ่าน attempt ด้วย trusted server client หลังตรวจ owner แล้วแปลงผ่าน `toSafeExamAnswer()`; browser ไม่ได้รับ answer snapshot, สูตร, correct flags หรือ canonical ordering
8. นักเรียนบันทึกคำตอบระหว่างทำผ่าน Server Action; direct browser mutation ของ `submissions`/`submission_answers` ถูก revoke
9. หาก assignment เปิดคุมสอบ `useExamProctor()` ส่ง heartbeat/เหตุการณ์แบบ batch พร้อม opaque id ต่อแท็บไปยัง `recordProctorSignal()`; action ตรวจ session + exact attempt แล้วให้ service role เรียก RPC ที่ตรวจซ้ำและเขียน lease ใน `exam_proctor_connections` พร้อมสรุป/เหตุการณ์ใน `exam_proctor_sessions`/`exam_proctor_events` แบบ atomic หากมี lease สดเกินหนึ่งจะสร้าง `concurrent_connection` ฝั่งฐานข้อมูล สัญญาณที่ส่งไม่สำเร็จ retry แบบ backoff 1/3/10/30 วินาทีและยังมี heartbeat ทุก 15 วินาที ครูรับการเปลี่ยนแปลงผ่าน Supabase Realtime ภายใต้ RLS; เมื่อ channel หลุด dashboard อ่าน snapshot ผ่าน RLS ทุก 15 วินาทีและ reconcile ทุก 60 วินาทีแม้ channel ปกติ โดย replay event ที่มาระหว่าง query เพื่อไม่ย้อนสถานะ หน้าครู resolve เฉพาะชื่อของ student IDs ที่อยู่ใน roster/submission/event หลัง assignment ผ่าน RLS แล้ว จึงแสดงได้ว่าใครเกิดเหตุการณ์ใดโดยไม่เปิด profile อื่น ครูรับทราบ reviewable event ผ่าน service-role-only RPC แบบ first-ack-wins; metadata นี้อยู่บน event เดิมจึงกระจาย `UPDATE` ผ่าน Realtime และใช้ retention เดียวกัน โดย payload หลักมี trigger ห้ามแก้ ส่วน seen-ID registry รวมสัญญาณใหม่ต่อคนก่อน toast/เสียงและไม่เตือนซ้ำจาก snapshot หรือ acknowledgement update เสียงกับ Browser Notification ต้องเปิดจาก user gesture และทำงานเฉพาะขณะ dashboard ยังเปิด ไม่มี background push ส่วน `exam_watermark_enabled` แสดงชื่อกับรหัส attempt เฉพาะบน client เพื่อเป็นแรงเสียดทานต่อการส่งภาพ ไม่ได้บันทึกภาพหน้าจอ
10. `pg_cron` เรียก `purge_expired_exam_proctor_data()` วันละครั้งเพื่อลบ event, connection lease และ session summary ของ attempt ที่ไม่มี heartbeat เกิน 90 วัน; ครูที่มีสิทธิ์จัดการกดล้างราย assignment ได้ผ่าน Server Action + service-role-only RPC ซึ่งตรวจ actor ซ้ำและไม่ยอมล้างขณะมี session สด คำตอบ คะแนน และ submission ไม่อยู่ในขอบเขตการล้างนี้
11. เมื่อส่ง ระบบตรวจชนิดที่รองรับ คงงานที่ต้องตรวจโดยครูไว้ และปิด presence ของห้องคุมสอบแบบ best-effort
12. RLS คืนคะแนน/เฉลยให้นักเรียนตาม `show_results` เท่านั้น ส่วนการแสดงคะแนนอาจผ่าน per-question override, display rescaling และ attempt strategy

### โฮมรูม

1. ห้อง `homeroom` ใช้ roster ของตัวเอง
2. ระบบค้นหาห้องรายวิชาอื่นของนักเรียนใน roster
3. รวม published assignments และ submissions จากห้องเหล่านั้น
4. แสดง compliance, ปฏิทิน และภาพรวมแก่ครูประจำชั้นหรือนักเรียนตามสิทธิ์

โฮมรูมไม่ควรสร้าง assignment ของตัวเองตามโมเดลปัจจุบัน

### วิจัยการศึกษา

1. `/research` เป็น Server Component และอ่านโครงการผ่าน session-bound Supabase client เพื่อให้ RLS เป็นขอบเขตหลัก หน้า production ไม่เติมข้อมูลตัวอย่างเมื่อไม่มีโครงการ
2. `/research/new` ส่งการตั้งค่าครั้งเดียวเข้า RPC แบบ atomic ซึ่งผูกโครงการกับ subject classroom เดียว ตรึงผู้เข้าร่วมจาก roster สร้าง immutable question snapshots และสร้าง assignment ก่อน/หลังในห้องนั้น
3. คะแนนแต่ละค่าผ่าน composite foreign keys ที่ยืนยัน project/participant/measurement/org เดียวกัน และ trigger สร้าง audit history อัตโนมัติ
4. RLS แยก project metadata ออกจาก student-level scores: co-teacher `view` อ่าน metadata ได้ แต่ข้อมูลผู้เข้าร่วม คะแนน และประวัติต้องเป็น owner หรือ `admin/manage`
5. นักเรียนไม่มี route หรือ policy สำหรับโมดูลวิจัย งานก่อน/หลังยังคงใช้ assignment/submission runtime เดิมเพื่อไม่สร้างระบบสอบซ้ำ สำเนาโจทย์วิจัยถูกซ่อนจากคลังและ admin listings แต่ยังอ่านได้ตามเส้นทาง assignment ที่ได้รับสิทธิ์
6. `/research/[id]` เป็น Server Component ที่อ่าน project/measurements/assignments/counts ภายใต้ RLS แล้วส่งเฉพาะข้อมูล serializable ไปยัง client dialogs สำหรับแก้รายละเอียดและกำหนดการ
7. `/research/[id]/data` และเส้นทางย่อยอ่านข้อมูลระดับนักเรียนเฉพาะหลังตรวจ `can_manage_education_research_project`; co-teacher ที่มีแค่ `view` ไม่ได้รับชื่อ รหัส คะแนน หรือประวัติ
8. submission ที่เสร็จของ assignment วิจัยจะซิงก์เข้า `education_research_scores` ด้วย database trigger ส่วนคะแนน manual/Excel เขียนผ่าน `SECURITY DEFINER` RPC ที่ตรวจ project/participant/measurement/org และช่วงคะแนนซ้ำใน transaction
9. `/research/[id]/results` ตรวจ manage permission แล้วคำนวณผล request-time ด้วย pure module `lib/education-research-statistics.ts`; ไม่มี persisted result ที่อาจเก่ากว่า score source of truth และแท็บข้อมูลรายคนทำ filtering/pagination ฝั่ง server ก่อนส่งเฉพาะหน้าปัจจุบันไป browser
9. แม่แบบ Excel สร้างผ่าน route handler แบบ `POST` หลังตรวจ session/สิทธิ์ และผูกแถวกับ template row token ที่ตรวจกลับในฐานข้อมูล การอัปโหลดอ่านไฟล์ในหน่วยความจำเท่านั้น แล้วเก็บเฉพาะ normalized preview/audit rows ไม่เก็บ binary ต้นฉบับ
10. การยืนยัน import ล็อก batch, ตรวจค่าคะแนนปัจจุบันเทียบกับ preview ทุกแถว แล้วเขียนทั้งชุดใน transaction เดียว; batch ที่ยืนยันแล้ว retry ได้โดยไม่เขียนซ้ำ

## Compatibility hotspots

- `assignments.classroom_id` เป็น home/legacy classroom ขณะที่ `assignment_classrooms` เป็นความสัมพันธ์หลายห้อง
- `FillBlankItem.answer` ยังเก็บเพื่อ backward compatibility แต่ `answers` รองรับหลายคำตอบ
- `answer_tolerance` มีความหมายตาม convention เดิม ต้องตรวจ `lib/math/evaluator.ts` ก่อนเปลี่ยน
- `question_ids` ใน assignment/set อาจอ้างถึงโจทย์ที่ถูกลบ โค้ดบางจุดตั้งใจข้าม dangling IDs
- score ที่แสดงอาจต่างจาก raw stored score เพราะ `display_max_score`

## Source of truth

- พฤติกรรมปัจจุบัน: โค้ดและฐานข้อมูลที่ deploy จริง
- วิวัฒนาการ schema: migration files ร่วมกับสถานะ migration ของฐานข้อมูลเป้าหมาย
- ความตั้งใจผลิตภัณฑ์: `docs/PRODUCT.md` และ `docs/SCOPE.md`
- สถานะความพร้อม: `docs/FEATURE_STATUS.md`

อย่าสร้าง migration จาก `supabase/schema.sql` เพียงไฟล์เดียว และอย่าคิดว่า local migration ทุกไฟล์ถูก apply แล้ว

## Database performance

- App shell ดึงเฉพาะ `id`, `email`, `full_name` และ `role`; หน้ารวมห้องเรียนใช้ embedded relation counts สำหรับ roster และ `assignment_classrooms` แทน query ตาม `assignments.classroom_id` รุ่นเก่า
- การค้นหาในคลังโจทย์ยังคงกรองและแบ่งหน้าที่ฐานข้อมูล: เมื่อมีคำค้น server นับกลุ่มแท็ก/ชื่อ/เนื้อหาแบบไม่ซ้ำตามลำดับความสำคัญ แล้วใช้ `questionSearchGroupSlices` ประกอบผลหน้าปัจจุบัน หน้าแรกดึงช่วงสั้นของแต่ละกลุ่มพร้อมจำนวนใน database round เดียว ส่วนหน้าถัดไปนับก่อนคำนวณ offset และทุกกรณีส่งเข้า browser ไม่เกิน 24 ข้อแทนการส่งคลังทั้งหมดไปจัดกลุ่ม
- Migration `20260819090000_core_query_indexes.sql` เติม index สำหรับ query หลักและ `SECURITY DEFINER` RLS helpers โดยไม่เปลี่ยนขอบเขตสิทธิ์
- Migration `20260819091000_rls_initplan_performance.sql` ทำให้ direct `auth.uid()` ใน policy หลักถูกคำนวณครั้งเดียวต่อ query โดยรักษาเงื่อนไขสิทธิ์เดิม
- Migration `20260825144758_question_bank_read_path_phase_1.sql` ตัดงานที่โตตามขนาดคลังออกจากการ render หน้าคลังโจทย์หนึ่งครั้ง (ค้นหา กดแท็ก เปลี่ยนหน้า ใช้เส้นทางเดียวกันหมดเพราะ filter อยู่ใน URL): `idx_submission_answers_question` ทำให้ item analysis เลิก sequential scan ทั้งตาราง (index เดิมขึ้นต้นด้วย `submission_id` ใช้กับ `question_id IN (...)` ไม่ได้), `idx_questions_tags_gin` รองรับ `tags @>` ของการกดแท็กและ `tags &&` ของการค้นหา ซึ่ง b-tree ทำแทนไม่ได้
- การหาโจทย์ซ้ำเดิมอ่าน `question_text` ของทั้งคลังทุกครั้งที่ render แล้วสร้าง fingerprint ใหม่หมด ตอนนี้ fingerprint อยู่บนแถว (`questions.content_fingerprint`) และหน้าคลังถามเฉพาะ fingerprint ที่อยู่บนจอ — index lookup ที่ผูกกับจำนวนที่แสดง ไม่ใช่ขนาดคลัง
- กฎการสร้าง fingerprint อยู่ใน `lib/question-content-match.ts` ฝั่ง TypeScript ที่เดียว ไม่เขียนซ้ำเป็น plpgsql เพราะ `canonical()` เรียง key, ตัด `id` ที่ browser สุ่ม และยุบ empty string/array/object/null ให้เป็นค่าเดียว — สองสำเนาของกฎชุดนี้จะ drift แน่นอน server action ที่บันทึกโจทย์เรียก `withContentFingerprint()` และ `scripts/backfill-content-fingerprint.mjs` ตามเก็บของเก่า
- `content_fingerprint` เป็น NULL ได้และแปลว่า "ยังไม่คำนวณ" ไม่ใช่ "ไม่ซ้ำกับใคร" แถวแบบนั้นถูกข้ามในการนับ ผลคือ badge ไม่ขึ้น ไม่ใช่ตัวเลขผิด — write path ที่ตกหล่นจึงเสียคำเตือน ไม่เสียความถูกต้อง
- `questions_updated_at` ถูกแทนด้วย `questions_touch_updated_at()` ซึ่งไม่บั๊ก `updated_at` เมื่อ UPDATE เปลี่ยนแค่ `content_fingerprint` เพราะแท็บประวัติใน preview modal อ่านคอลัมน์นั้นเป็น "แก้ไขล่าสุด" การ backfill จึงต้องไม่ไปรายงานว่าครูแก้โจทย์ทั้งคลังในวันเดียว ส่วนการบันทึกโจทย์จริงเปลี่ยนทั้งเนื้อหาและ fingerprint พร้อมกันและยังบั๊กเวลาเหมือนเดิม ตารางอื่นยังใช้ `update_updated_at()` ตามเดิม (`search_text` ถูกกันออกจากการเทียบด้วยเหตุผลเดียวกัน)
- Migration `20260825151036_question_bank_search_text.sql` เพิ่ม generated column `questions.search_text` (title + เนื้อโจทย์ที่ถอด markup แล้ว lowercase ตาม `questionExcerpt()`) พร้อม GIN trigram index คำค้นจึงวิ่งเข้า index แทนการ scan HTML ทุกแถว
- เลือก `pg_trgm` ไม่ใช่ `tsvector` เพราะ Postgres ไม่มี dictionary ภาษาไทย `to_tsvector` ตัดคำไทยไม่ได้เลย ส่วน trigram ทำงานระดับตัวอักษรจึงไม่ต้องตัดคำ ข้อแลกเปลี่ยนคือคำค้นสั้นกว่า 3 ตัวอักษรไม่มี trigram เต็มให้ค้นและตกไปเป็น scan — แต่เป็น scan บนคอลัมน์ข้อความที่อ่านได้ ไม่ใช่บน HTML
- การค้นหาเปลี่ยนจาก `question_text.ilike` เป็น `search_text.ilike` ซึ่งแก้ความไม่ตรงกันที่มีมานาน: ฝั่ง server ค้นบน HTML ดิบ (จึง match ชื่อ tag อย่าง `span`/`class` และหาวลีที่ถูก tag คั่นไม่เจอ) ส่วนฝั่ง browser `matchesSearch()` ค้นบนข้อความที่ strip แล้วมาตลอด ตอนนี้สองฝั่งใช้สตริงเดียวกัน ผลคือจำนวนที่แสดงบนแถบ แท็ก/ชื่อโจทย์/เนื้อหาโจทย์ ขยับได้เมื่อเทียบกับก่อนหน้า และนั่นคือผลที่ตั้งใจ
- `questionSearchText()` ใน `lib/question-search.ts` เป็นคู่ฝาที่อ่านและทดสอบได้ของ expression ใน migration ถ้าแก้ `questionExcerpt()` ต้องออก migration ใหม่ให้ตรงกัน มิฉะนั้นสองฝั่งจะเริ่มเห็นโจทย์ไม่ตรงกันอีก
- `select('*')` บน `questions` (6 จุด: print/export/preview ของงาน, แก้โจทย์, โจทย์กลุ่ม, เริ่มทำข้อสอบ) จะได้ `search_text` ติดมาด้วย เป็นข้อความที่ strip แล้วซ้ำกับ `question_text` ทั้งหมดอยู่ฝั่ง server ไม่ได้ถูกส่งต่อไป browser
- Migration `20260825152716_question_tag_use_counts.sql` ย้ายการนับแท็กไปไว้ในฐานข้อมูล (`my_question_tag_uses()`, `team_question_tag_uses()`) เดิมหน้าคลังอ่านคอลัมน์ `tags` ของทุกแถวในคลังมานับใน JavaScript เพื่อให้ได้แท็กไม่กี่สิบตัว และการนับนั้นขวางอยู่หน้า query หลัก เพราะ `loadOwnQuestions()` ต้องรู้ tag universe ก่อนจึงจะประกอบ filter ได้
- ทั้งสองฟังก์ชันเป็น `SECURITY INVOKER` จึงอ่าน `questions` ในสิทธิ์ของผู้เรียกและ RLS เดิมเป็นตัวตัดสินว่านับอะไรได้ พารามิเตอร์ `p_org_ids`/`p_question_ids` มีไว้จำกัดผลให้แคบลงเท่านั้น ไม่ได้เปิดสิทธิ์เพิ่ม
- การเรียงยังอยู่ฝั่ง TypeScript (`rankCountedTags` ใน `lib/tag-suggest.ts`) เพราะ tie-break ใช้ `localeCompare(…, 'th')` ซึ่ง collation ของ Postgres ให้ผลไม่เหมือนกัน ฐานข้อมูลจัดกลุ่มและนับ TypeScript เรียง — แบ่งกันคนละครึ่งโดยตั้งใจ
- SQL ใช้ `count(DISTINCT q.id)` ไม่ใช่ `count(*)` เพื่อให้ตรงกับ `dedupeTags()`: โจทย์ที่ติดทั้ง "ไฟฟ้า" และ "ไฟฟ้า " นับเป็นการใช้ครั้งเดียว ส่วนตัวสะกดที่แสดงเลือกจาก `q.id` ที่น้อยที่สุด ลำดับจึงไม่สลับไปมาระหว่างการโหลด
- การนับยังเป็น O(ขนาดคลัง) อยู่ แต่เกิดในฐานข้อมูลบน index ไม่ใช่การขนข้อมูลข้ามเน็ตมา parse ที่ขนาดหลักพันแถวคุ้มกว่าการทำตารางนับแยก ถ้าคลังโตเกินหลักหมื่นปลายๆ ค่อยเปลี่ยนเป็นตาราง `question_tag_counts` ที่ trigger ดูแล — จุดที่ต้องแก้คือฟังก์ชันสองตัวนี้
- หน้าคลังโจทย์เคยยิง query เป็นทอดๆ ราว 6–7 ชั้น ตอนนี้เหลือ 4 ชั้นโดยไม่ได้ย้าย logic ลง SQL เพิ่ม แค่เลิกรอสิ่งที่ไม่ต้องรอ: (1) `loadOwnQuestions()` await tag universe เฉพาะตอนมีคำค้น การกดแท็กหรือเปลี่ยนหน้าจึงเริ่ม query หลักได้ทันที (2) `loadTeamContext()` ต้องการแค่ membership ของผู้เรียก จึงวิ่งขนานกับ query ของคลังตัวเองแทนที่จะรออยู่หลัง `Promise.all` ก้อนแรก (3) สอง pass ใน `fetchSubQuestionCounts` ไม่ได้ขึ้นต่อกัน — pass ที่นับสมาชิกกลุ่มอ่าน `group_id` จาก argument ไม่ใช่จากผลของ pass แรก จึงยิงพร้อมกันได้
- Migration `20260825153608_team_tag_uses_resolve_shares.sql` ให้ `team_question_tag_uses()` หาสมาชิกภาพการแชร์เองด้วย `EXISTS` การนับแท็กทีมจึงไม่ต้องรอ query `question_shares` — พารามิเตอร์ `p_question_ids` ยังอยู่และยัง OR เข้าไปเหมือนเดิม ผู้เรียกเดิมจึงไม่เปลี่ยนพฤติกรรม
- ชั้นที่เหลือถูกกำหนดโดยเส้นทางทีม: membership → question_shares → team query เพราะ team query ต้องใช้ `sharedIds` มาประกอบ `unionFilter` การลดต่ำกว่า 4 ชั้นต้องย้าย union ทั้งก้อนลงไปเป็นฟังก์ชันเดียวใน SQL ซึ่งยังไม่ได้ทำ
- URL เป็นเจ้าของ filter และ server เป็นคนกรอง ปุ่มทุกตัวจึงเคยดูเหมือนไม่ถูกกดจนกว่าจะ render กลับมาทั้งหน้า `optimisticParams` ใน `question-bank-client.tsx` เก็บค่าที่เพิ่งคลิกไว้ยืนแทนจนของจริงมาถึง ชิปแท็ก/ระดับความยาก/รูปแบบ/แท็บ/กลุ่มผลค้น จึงตอบสนองทันที และรายการที่กำลังรอถูกหรี่ด้วย `aria-busy` + `opacity-50`
- หรี่แทนที่จะใส่ skeleton โดยตั้งใจ — แถวที่อยู่บนจอยังเป็นคำตอบที่ถูกต้องของ filter ก่อนหน้า การล้างทิ้งเพื่อให้ดูเหมือนกำลังทำงานทำให้ผู้อ่านเสียตำแหน่งที่กำลังดูอยู่ และคลิกยังทำงานได้ระหว่างรอ จึงเปลี่ยนใจกลางคันได้โดยไม่ต้องรอให้จบก่อน
- `optimisticParams` ถูกล้างเมื่อ transition จบ **หรือ** เมื่อ filter จาก server เปลี่ยน อย่างใดอย่างหนึ่ง เพราะ navigation ที่จบโดยไม่เคยรายงานว่า pending จะทิ้งปุ่มค้างอยู่ที่ค่าที่รายการไม่ได้สะท้อนแล้ว
- `isPending` จาก `useTransition` เพียงพอสำหรับสถานะกำลังโหลด — วัดจริงด้วย MutationObserver แล้วมันพลิกพร้อมกับ state ปกติใน render เดียวกัน (~100ms บน dev) ไม่ได้ถูก React เลื่อนลำดับอย่างที่เคยเข้าใจ อย่าเพิ่มตัวแปรสถานะซ้อนขึ้นมาเพื่อแก้ปัญหานี้ เพราะไม่มีปัญหาให้แก้ (ระวังการวัดด้วย `setInterval` — แท็บที่ไม่ได้โฟกัสถูก throttle จนอ่านได้เป็นหลัก 700ms)
- `SEARCH_DEBOUNCE_MS` = 500ms ยาวกว่าเวลา render หนึ่งรอบ เพื่อไม่ให้พิมพ์คำเดียวแล้วมี request ค้างท่อหลายตัว
- `classroom_students` ต้องมี index ที่ขึ้นต้นด้วย `student_id`; unique index เดิมขึ้นต้นด้วย `classroom_id` และใช้แทนกันไม่ได้
- ตาราง submissions มีทั้งเส้นทางอ่านตามนักเรียนและตามงาน จึงต้องรักษา index ทั้งสองทิศทาง
- `sprint5_exam_system.sql` ไม่มี timestamp ตามรูปแบบ Supabase CLI และถูกข้าม จึงห้ามถือว่า index ในไฟล์นั้นมีอยู่บนฐานข้อมูลจริง
- Remote migration history มี migration แบบ out-of-band ที่ไม่มีไฟล์ local และ local รุ่นเก่าหลายรายการไม่ได้ถูกบันทึกเป็น applied ห้ามใช้ `db push --include-all` จนกว่าจะทำ migration-history reconciliation แยกต่างหาก
- Recovery ของรอบนี้ไม่แตะข้อมูล: index ใหม่ย้อนกลับได้ด้วย `DROP INDEX` ตามชื่อ และ RLS optimization ย้อนกลับได้ด้วยการคืน `(SELECT auth.uid())` เป็น `auth.uid()` ใน policy เดิม

## คุณภาพและการทดสอบ

Repository มี Vitest unit test สำหรับ critical pure logic และมี design-token check แต่ยังไม่มี browser E2E suite อัตโนมัติ การเปลี่ยน critical path ต้องเพิ่ม test ที่เหมาะสมหรือบันทึก manual verification ให้ชัด อย่างน้อยให้รัน:

```bash
npx tsc --noEmit
npm test
npm run lint:tokens
npm run build
```

สำหรับ auth/RLS/grading ต้องทดสอบด้วยหลายบทบาทและข้อมูลคนละ organization ไม่ใช่ทดสอบเฉพาะ happy path
