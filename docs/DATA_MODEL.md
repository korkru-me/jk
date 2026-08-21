# Data model และ invariants

อัปเดตล่าสุด: 21 สิงหาคม 2026

เอกสารนี้เป็นแผนที่เชิงแนวคิด ไม่ใช่ schema dump ก่อนแก้ฐานข้อมูลต้องอ่าน migration ที่เกี่ยวข้องและตรวจสถานะฐานข้อมูลจริง

## Identity และ tenancy

- `auth.users` — ตัวตนจาก Supabase Auth
- `public.users` — profile และ global role ของ application
- `organizations` — tenant/workspace และ subscription tier เชิงข้อมูล
- `organization_members` — สมาชิกและ role ภายใน organization
- `org_invitations` — คำเชิญเข้า organization
- `super_admins` — แนวทางแยก platform-level authority จาก user role

Invariant สำคัญ:

- resource หลักต้องมี `org_id`
- ห้ามย้าย resource ข้าม organization ด้วยการ update `org_id`
- ผู้ใช้หนึ่งคนอาจมีหลาย organization แต่ helper บางส่วนยังเลือก organization เดียว จึงต้องตรวจ context ก่อนเพิ่ม multi-org workflow

## คลังโจทย์

- `question_categories` — หมวดหมู่แบบ parent/child เป็น taxonomy กลางร่วมทุก organization เขียนได้เฉพาะทาง admin action (`lib/actions/admin.ts`) การนำเข้าไฟล์จึงจับคู่ตามชื่อเท่านั้น ไม่สร้างหมวดใหม่
- `questions` — เนื้อหา ชนิด เฉลย ตัวแปร การมองเห็น และ metadata
- `formula_presets` — สมการ/ตัวแปรที่นำกลับมาใช้
- `question_sets` — รายการ `question_ids` ที่บันทึกเป็นชุด
- `question_shares` และ `question_set_shares` — แชร์เข้าทีม/organization เพิ่มเติม

ความสัมพันธ์สำคัญ:

- Question อาจมี parent/group/order สำหรับโจทย์หลายข้อที่สัมพันธ์กัน
- QuestionSet เก็บ array ของ IDs ซึ่งอาจเกิด dangling reference เมื่อโจทย์ถูกลบ โค้ดต้องรับมือ
- visibility ไม่แทน authorization ทั้งหมด ต้องพิจารณา owner, org, share และ assignment access ร่วมกัน

## ห้องเรียน

- `classrooms` — owner teacher, type, class code และ lifecycle
- `classroom_students` — roster
- `classroom_co_teachers` — ครูร่วมและ permission
- `classroom_invitations` — invitation token สำหรับครูร่วม
- `classroom_posts` และ `post_comments` — stream การสื่อสาร

ห้อง `homeroom` และ `subject` ใช้ตารางเดียวกัน แต่มี business behavior ต่างกัน

## งานและการส่งคำตอบ

- `assignments` — การมอบหมายและการตั้งค่าข้อสอบ
- `assignment_classrooms` — many-to-many ระหว่าง assignment กับ classroom
- `assignment_extensions` — ขยายเวลารายคน
- `submissions` — attempt ต่อผู้เรียน
- `submission_answers` — answer snapshot และคะแนนรายข้อ

`assignments.classroom_id` ยังมีไว้เป็น home/legacy reference อย่า query เฉพาะ field นี้เมื่อความหมายต้องรองรับหลายห้อง

Tenant invariant ของเส้นทางการส่งคำตอบ:

- `submissions.org_id` ต้องเท่ากับ `assignments.org_id` ของงานนั้น ไม่ใช่ organization หลักหรือ personal workspace ของนักเรียน
- `submission_answers.org_id` ต้องเท่ากับ `submissions.org_id`
- นักเรียนอาจเข้าร่วมห้องผ่าน `classroom_students` โดยไม่เป็น `organization_members`; สิทธิ์เริ่ม attempt ต้องมาจาก assignment ที่เผยแพร่และ roster ของห้อง

## Snapshot ที่ต้องคงที่ต่อ attempt

เมื่อเริ่ม submission ระบบต้องตรึงอย่างน้อย:

- ลำดับคำถาม
- ลำดับตัวเลือก
- ค่าตัวแปรสุ่ม
- เฉลยที่คำนวณจากค่าชุดนั้น
- max score ตาม assignment ณ เวลาสร้าง attempt

ห้ามคำนวณ random values ใหม่เมื่อ refresh หรือ grade เพราะจะทำให้คำถามและเฉลยเปลี่ยนหลังนักเรียนตอบ

## คะแนน

- `submission_answers.score/max_score` คือคะแนนรายคำตอบ
- `submissions.total_score/max_score` คือผลรวมของ attempt
- `assignments.question_points` override น้ำหนักรายข้อ
- `assignments.display_max_score` เปลี่ยนสเกลตอนแสดง ไม่ใช่ raw stored score
- `assignments.score_strategy` เลือก best/average/latest สำหรับหลาย attempt

ก่อนแก้ scoring ต้องตรวจ `lib/scoring.ts`, `lib/grading.ts`, `lib/actions/submissions.ts` และหน้าที่อ่านคะแนนทั้งหมด

## โฮมรูมและข้อมูลอ่อนไหว

- `student_profiles` — ข้อมูลโปรไฟล์ นักเรียน ผู้ปกครอง สุขภาพ และการติดต่อ
- `student_notes` — บันทึกส่วนตัวของครูประจำชั้น
- homeroom aggregate อ่าน assignment/submission จาก subject classrooms ของ roster

`student_profiles` และ `student_notes` ต้องใช้ policy แคบกว่าการเป็นสมาชิก organization ทั่วไป การใช้ admin client ต้องตรวจ self/homeroom authorization ก่อน

## Notifications

- `notifications` เชื่อม recipient, actor และ optional related assignment/classroom
- ประเภทปัจจุบันรวม assignment reminder, co-teacher invite, extension, classroom post และ homeroom weekly digest

Notification body ต้องไม่เปิดเผยข้อมูลละเอียดกว่าที่ recipient มีสิทธิ์เปิดจากหน้าปลายทาง

## Storage

โค้ดมีการใช้รูปโจทย์ รูปเฉลย รูปวิธีทำ และไฟล์ส่งงาน ก่อนเปลี่ยน upload flow ต้องตรวจ bucket policy, MIME type, file size, ownership, signed/public URL และการลบไฟล์ orphan

## กฎการเปลี่ยน schema

1. ตรวจ migration history และ schema ของฐานข้อมูลเป้าหมาย
2. ออกแบบ backward-compatible transition สำหรับข้อมูลเดิม
3. สร้าง migration ใหม่ ห้ามแก้ไฟล์ที่ apply แล้ว
4. เพิ่ม index สำหรับ field ที่ใช้ใน RLS/join/filter สำคัญ
5. ทดสอบ RLS ด้วยอย่างน้อย teacher, student, unrelated user และ admin ที่เกี่ยวข้อง
6. ทดสอบ rollback/recovery plan แม้ migration จะไม่มี down script
7. อัปเดตเอกสารนี้และ `docs/FEATURE_STATUS.md`
