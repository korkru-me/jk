# Architecture

อัปเดตล่าสุด: 24 สิงหาคม 2026

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
5. หากตั้ง `random_question_count` ระบบสุ่ม subset จากคลัง `question_ids` ก่อน แล้วตรึง subset, ค่าตัวแปรสุ่ม เฉลย ลำดับข้อ และลำดับตัวเลือกไว้ใน `submission_answers` ของ attempt; reload/resume จึงไม่สุ่มใหม่
6. `getExamTakingData()` อ่าน attempt ด้วย trusted server client หลังตรวจ owner แล้วแปลงผ่าน `toSafeExamAnswer()`; browser ไม่ได้รับ answer snapshot, สูตร, correct flags หรือ canonical ordering
7. นักเรียนบันทึกคำตอบระหว่างทำผ่าน Server Action; direct browser mutation ของ `submissions`/`submission_answers` ถูก revoke
8. หาก assignment เปิดคุมสอบ `useExamProctor()` ส่ง heartbeat/เหตุการณ์แบบ batch พร้อม opaque id ต่อแท็บไปยัง `recordProctorSignal()`; action ตรวจ session + exact attempt แล้วให้ service role เรียก RPC ที่ตรวจซ้ำและเขียน lease ใน `exam_proctor_connections` พร้อมสรุป/เหตุการณ์ใน `exam_proctor_sessions`/`exam_proctor_events` แบบ atomic หากมี lease สดเกินหนึ่งจะสร้าง `concurrent_connection` ฝั่งฐานข้อมูล สัญญาณที่ส่งไม่สำเร็จ retry แบบ backoff 1/3/10/30 วินาทีและยังมี heartbeat ทุก 15 วินาที ครูรับการเปลี่ยนแปลงผ่าน Supabase Realtime ภายใต้ RLS; เมื่อ channel หลุด dashboard อ่าน snapshot ผ่าน RLS ทุก 15 วินาทีและ reconcile ทุก 60 วินาทีแม้ channel ปกติ โดย replay event ที่มาระหว่าง query เพื่อไม่ย้อนสถานะ หน้าครู resolve เฉพาะชื่อของ student IDs ที่อยู่ใน roster/submission/event หลัง assignment ผ่าน RLS แล้ว จึงแสดงได้ว่าใครเกิดเหตุการณ์ใดโดยไม่เปิด profile อื่น ส่วน `exam_watermark_enabled` แสดงชื่อกับรหัส attempt เฉพาะบน client เพื่อเป็นแรงเสียดทานต่อการส่งภาพ ไม่ได้บันทึกภาพหน้าจอ
9. `pg_cron` เรียก `purge_expired_exam_proctor_data()` วันละครั้งเพื่อลบ event, connection lease และ session summary ของ attempt ที่ไม่มี heartbeat เกิน 90 วัน; ครูที่มีสิทธิ์จัดการกดล้างราย assignment ได้ผ่าน Server Action + service-role-only RPC ซึ่งตรวจ actor ซ้ำและไม่ยอมล้างขณะมี session สด คำตอบ คะแนน และ submission ไม่อยู่ในขอบเขตการล้างนี้
10. เมื่อส่ง ระบบตรวจชนิดที่รองรับ คงงานที่ต้องตรวจโดยครูไว้ และปิด presence ของห้องคุมสอบแบบ best-effort
11. RLS คืนคะแนน/เฉลยให้นักเรียนตาม `show_results` เท่านั้น ส่วนการแสดงคะแนนอาจผ่าน per-question override, display rescaling และ attempt strategy

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
