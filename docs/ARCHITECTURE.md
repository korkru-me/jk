# Architecture

อัปเดตล่าสุด: 19 สิงหาคม 2026

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
5. ค่าตัวแปรสุ่ม เฉลย ลำดับข้อ และลำดับตัวเลือกถูกตรึงใน attempt
6. นักเรียนบันทึกคำตอบระหว่างทำ
7. เมื่อส่ง ระบบตรวจชนิดที่รองรับ และคงงานที่ต้องตรวจโดยครูไว้
8. การแสดงคะแนนอาจผ่าน per-question override, display rescaling และ attempt strategy

### โฮมรูม

1. ห้อง `homeroom` ใช้ roster ของตัวเอง
2. ระบบค้นหาห้องรายวิชาอื่นของนักเรียนใน roster
3. รวม published assignments และ submissions จากห้องเหล่านั้น
4. แสดง compliance, ปฏิทิน และภาพรวมแก่ครูประจำชั้นหรือนักเรียนตามสิทธิ์

โฮมรูมไม่ควรสร้าง assignment ของตัวเองตามโมเดลปัจจุบัน

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

- Migration `20260819090000_core_query_indexes.sql` เติม index สำหรับ query หลักและ `SECURITY DEFINER` RLS helpers โดยไม่เปลี่ยนขอบเขตสิทธิ์
- Migration `20260819091000_rls_initplan_performance.sql` ทำให้ direct `auth.uid()` ใน policy หลักถูกคำนวณครั้งเดียวต่อ query โดยรักษาเงื่อนไขสิทธิ์เดิม
- `classroom_students` ต้องมี index ที่ขึ้นต้นด้วย `student_id`; unique index เดิมขึ้นต้นด้วย `classroom_id` และใช้แทนกันไม่ได้
- ตาราง submissions มีทั้งเส้นทางอ่านตามนักเรียนและตามงาน จึงต้องรักษา index ทั้งสองทิศทาง
- `sprint5_exam_system.sql` ไม่มี timestamp ตามรูปแบบ Supabase CLI และถูกข้าม จึงห้ามถือว่า index ในไฟล์นั้นมีอยู่บนฐานข้อมูลจริง
- Remote migration history มี migration แบบ out-of-band ที่ไม่มีไฟล์ local และ local รุ่นเก่าหลายรายการไม่ได้ถูกบันทึกเป็น applied ห้ามใช้ `db push --include-all` จนกว่าจะทำ migration-history reconciliation แยกต่างหาก
- Recovery ของรอบนี้ไม่แตะข้อมูล: index ใหม่ย้อนกลับได้ด้วย `DROP INDEX` ตามชื่อ และ RLS optimization ย้อนกลับได้ด้วยการคืน `(SELECT auth.uid())` เป็น `auth.uid()` ใน policy เดิม

## คุณภาพและการทดสอบ

Repository ยังไม่มี automated test suite และไม่มี lint script การเปลี่ยน critical path ต้องเพิ่มหรือบันทึก manual verification ให้ชัด อย่างน้อยให้รัน:

```bash
npx tsc --noEmit
npm run build
```

สำหรับ auth/RLS/grading ต้องทดสอบด้วยหลายบทบาทและข้อมูลคนละ organization ไม่ใช่ทดสอบเฉพาะ happy path
