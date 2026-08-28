# Data model และ invariants

อัปเดตล่าสุด: 24 สิงหาคม 2026

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
- `questions` — เนื้อหา ชนิด เฉลย ตัวแปร การมองเห็น และ metadata; `content_fingerprint` เป็น SHA-256 ของเนื้อหาในรูป canonical (`questionFingerprint()` ใน `lib/question-content-match.ts`) ใช้หาโจทย์ซ้ำโดยไม่ต้องอ่านทั้งคลัง เขียนโดย server action ที่บันทึกโจทย์ผ่าน `withContentFingerprint()` และ backfill ด้วย `scripts/backfill-content-fingerprint.mjs` ค่า NULL แปลว่ายังไม่คำนวณ ไม่ใช่ไม่ซ้ำกับใคร
- `formula_presets` — สมการ/ตัวแปรที่นำกลับมาใช้
- `question_sets` — รายการ `question_ids` ที่บันทึกเป็นแฟ้ม พร้อม `sections` (jsonb) สำหรับแฟ้มย่อยในแฟ้ม
- `question_shares` และ `question_set_shares` — แชร์เข้าทีม/organization เพิ่มเติม

ความสัมพันธ์สำคัญ:

- Question อาจมี parent/group/order สำหรับโจทย์หลายข้อที่สัมพันธ์กัน
- QuestionSet เก็บ array ของ IDs ซึ่งอาจเกิด dangling reference เมื่อโจทย์ถูกลบ โค้ดต้องรับมือ
- `question_sets.sections` เป็นมุมมองบน `question_ids` ไม่ใช่แหล่งความจริงคู่ขนาน: `[{ id, title, question_ids }]` โดย id ทุกตัวต้องอยู่ใน `question_ids`, ห้ามซ้ำภายในแฟ้มย่อยเดียวกัน (แต่ข้ามแฟ้มย่อยซ้ำได้ — ข้อเดียวอยู่ได้หลายแฟ้มย่อย) ส่วน `question_ids` เป็นลำดับของแฟ้มเองที่ครูจัด ไม่ได้สร้างใหม่จากลำดับแฟ้มย่อย ทุกครั้งที่บันทึก server จะผ่าน `normalizeSetSections` ใน `lib/question-set-sections.ts` — ห้ามเขียนคอลัมน์ใดคอลัมน์หนึ่งโดยไม่ผ่านฟังก์ชันนี้
- `assignments.sections` เป็น snapshot ของแฟ้มย่อยตอนสร้างงาน (แช่แข็งเหมือน `question_ids`) และ `assignments.show_sections` คุมว่านักเรียน/ใบงานจะเห็นชื่อแฟ้มย่อยหรือไม่ การแก้แฟ้มโจทย์ภายหลังไม่ย้อนไปเปลี่ยนงานที่มอบหมายไปแล้ว
- visibility ไม่แทน authorization ทั้งหมด ต้องพิจารณา owner, org, share และ assignment access ร่วมกัน
- `content_fingerprint` นับเฉพาะสิ่งที่นักเรียนเห็นและสิ่งที่ถือว่าตอบถูก ไม่นับ label (ชื่อโจทย์ แท็ก ระดับความยาก หมวด การแชร์ เฉลย และ `requires_work_image` ที่เลิกใช้แล้ว) การเปลี่ยน label จึงไม่เปลี่ยน fingerprint และไม่ทำให้โจทย์ซ้ำหลุดจากการตรวจจับ
- `search_text` เป็น generated column (`title` + เนื้อโจทย์ที่ถอด markup แล้ว lowercase) ฐานข้อมูลคำนวณเองทุกครั้งที่แถวเปลี่ยน ห้ามเขียนทับ และห้ามใช้เป็นแหล่งความจริงของเนื้อหา — `question_text` ยังเป็นตัวจริงที่เก็บ markup ไว้แสดงผล คอลัมน์นี้มีไว้ให้ค้นหาอย่างเดียว และมีคู่ฝาฝั่ง TypeScript คือ `questionSearchText()` ใน `lib/question-search.ts`

## ห้องเรียน

- `classrooms` — owner teacher, type, class code และ lifecycle
- `classroom_students` — roster
- `classroom_co_teachers` — ครูร่วมและ permission
- `classroom_invitations` — invitation token สำหรับครูร่วม
- `classroom_posts` และ `post_comments` — stream การสื่อสาร

ห้อง `homeroom` และ `subject` ใช้ตารางเดียวกัน แต่มี business behavior ต่างกัน

## งานและการส่งคำตอบ

- `assignments` — การมอบหมายและการตั้งค่าข้อสอบ; `random_question_count` กำหนดจำนวนที่สุ่มจาก `question_ids` ต่อ attempt และ `exam_watermark_enabled` เปิดลายน้ำระบุตัวผู้เข้าสอบบนหน้าข้อสอบ
- `assignment_classrooms` — many-to-many ระหว่าง assignment กับ classroom
- `assignment_extensions` — ขยายเวลารายคน
- `submissions` — attempt ต่อผู้เรียน
- `submission_answers` — answer snapshot และคะแนนรายข้อ
- `exam_proctor_sessions` — presence ล่าสุดและ counter สรุปหนึ่งแถวต่อ attempt สำหรับห้องคุมสอบสด
- `exam_proctor_events` — browser-level event แบบ append-only ที่เก็บเฉพาะชนิดเหตุการณ์ เวลา และ foreign keys; ไม่เก็บภาพหน้าจอ เสียง กล้อง เนื้อหาคำตอบ หรือ keystroke
- `exam_proctor_connections` — heartbeat lease ต่อแท็บด้วย UUID สุ่มและเวลาเห็นล่าสุด ใช้นับการเปิด attempt พร้อมกันหลายจุด; ไม่เก็บ IP, user-agent, device fingerprint หรือเนื้อหาบนจอ

`assignments.classroom_id` ยังมีไว้เป็น home/legacy reference อย่า query เฉพาะ field นี้เมื่อความหมายต้องรองรับหลายห้อง

Tenant invariant ของเส้นทางการส่งคำตอบ:

- `submissions.org_id` ต้องเท่ากับ `assignments.org_id` ของงานนั้น ไม่ใช่ organization หลักหรือ personal workspace ของนักเรียน
- `submission_answers.org_id` ต้องเท่ากับ `submissions.org_id`
- นักเรียนอาจเข้าร่วมห้องผ่าน `classroom_students` โดยไม่เป็น `organization_members`; สิทธิ์เริ่ม attempt ต้องมาจาก assignment ที่เผยแพร่และ roster ของห้อง
- `assignments.access_code`, `submission_answers.correct_answer`/คะแนน และ answer-bearing fields ใน `questions` เป็น server-only ระหว่าง attempt; RLS แบบรายแถวปกป้องคอลัมน์ลับกับคอลัมน์สาธารณะในแถวเดียวกันไม่ได้ จึงห้ามเปิด full row ให้นักเรียนแล้วพยายาม strip เฉพาะใน UI
- browser role ไม่มีสิทธิ์ `INSERT/UPDATE/DELETE` ตาราง `submissions` และ `submission_answers`; mutation ต้องผ่าน server action ที่ตรวจเจ้าของ/ครู สถานะ และเวลา ก่อนใช้ service role แบบ exact resource
- browser role ไม่มีสิทธิ์เขียน `exam_proctor_sessions`/`exam_proctor_events` โดยตรง; `record_exam_proctor_signal` เรียกได้เฉพาะ service role หลัง Server Action ตรวจว่าเป็น attempt ของนักเรียนคนนั้น ยัง `in_progress`, เป็นข้อสอบ online และเปิด proctoring ส่วนครูอ่านผ่าน RLS ตาม assignment ที่จัดการได้
- browser role ไม่มีสิทธิ์เขียน `exam_proctor_connections` โดยตรงเช่นกัน RPC ใช้ advisory lock ต่อ submission เพื่อคำนวณ transition จากหนึ่งเป็นหลาย lease แบบ atomic; `concurrent_connection` สร้างโดยฐานข้อมูลเท่านั้นและ client ปลอม event ชนิดนี้ไม่ได้
- `assignments.proctoring_enabled`, `fullscreen_required`, `block_clipboard` และ `exam_watermark_enabled` เป็นการตั้งค่าแรงเสียดทาน/สัญญาณระดับ browser ไม่ใช่ kiosk mode หรือ security boundary; event, connection lease และ session summary ของ attempt ถูกลบเมื่อไม่มี heartbeat เกิน 90 วัน โดยไม่ลบ submission, answer หรือ score และครูผู้จัดการ assignment ล้างก่อนกำหนดได้เมื่อไม่มี session สด
- `random_question_count` ต้องไม่เกินจำนวน `question_ids`; การแก้จำนวนถูกปิดหลังมี submission แรก และ subset จริงไม่เก็บซ้ำใน assignment แต่ดูจาก `submission_answers` ที่สร้างและตรึงไว้ต่อ attempt
- นักเรียนอ่าน submission header ระหว่างทำได้เพื่อ resume แต่ answer rows/question solution เปิดหลังส่งตาม `show_results` เท่านั้น (`score_only` ไม่เปิดรายข้อ, `never` ไม่เปิดคะแนน)

## วิจัยการศึกษา

- `education_research_projects` — โครงการหนึ่งกลุ่มวัดก่อน–หลัง ผูก `org_id`, ห้องเรียนรายวิชา ผู้สร้าง เกณฑ์ผ่าน ระดับนัยสำคัญ และ lifecycle; `org_id`, `classroom_id`, `created_by` และแบบแผนวิจัยเปลี่ยนไม่ได้หลังสร้าง
- `education_research_participants` — cohort ที่ตรึงจาก roster ของห้อง โดยใช้ `student_id` เป็นตัวจับคู่ ไม่ใช้ชื่อหรือลำดับแถว และหนึ่งนักเรียนอยู่ได้หนึ่งครั้งต่อโครงการ
- `education_research_measurements` — การตั้งค่ารอบ `pretest`/`posttest`, แหล่งคะแนน, วิธีเลือกแฟ้ม/แฟ้มย่อย/รายข้อ, source IDs, immutable snapshot IDs, เวลา และ optional assignment ที่ต้องอยู่ในห้อง/organization เดียวกับโครงการ
- `education_research_scores` — observation คะแนนหนึ่งค่าต่อผู้เข้าร่วมต่อรอบวัด พร้อมคะแนนเต็ม แหล่งที่มา submission ที่เกี่ยวข้อง และผู้บันทึก; บังคับ `0 <= raw_score <= max_score` และ composite foreign key ป้องกันการเชื่อมข้ามโครงการ/organization
- `education_research_score_history` — audit แบบ append-only ที่ trigger สร้างเมื่อคะแนนถูกเพิ่ม แก้ หรือลบ ผู้ใช้ทั่วไปอ่านได้ตามสิทธิ์โครงการแต่เขียนประวัติโดยตรงไม่ได้
- `education_research_score_drafts` — ฉบับร่างคะแนน manual แยกตามครูผู้บันทึกและ project/participant/measurement; การบันทึกร่างครั้งใหม่แทนชุดเดิมของครูคนนั้นและยังไม่ถือเป็นคะแนนวิจัยจริง
- `education_research_import_templates` / `education_research_import_template_rows` — รุ่นแม่แบบและ snapshot รายชื่อสำหรับดาวน์โหลด Excel แต่ละแถวผูก participant ด้วย UUID token สุ่มที่ซ่อนใน workbook และตรวจกลับฝั่ง server
- `education_research_import_batches` / `education_research_import_batch_rows` — normalized preview ของไฟล์ที่อัปโหลด เก็บค่า incoming/current, action, สถานะ และข้อความตรวจ ไม่เก็บ binary workbook; batch ยืนยันได้ครั้งเดียวและใช้เป็น audit ของผลกระทบทั้งชุด

Invariant สำคัญ:

- โครงการรับได้เฉพาะ classroom ชนิด `subject`; ผู้เข้าร่วมใหม่ต้องเป็นสมาชิก roster ปัจจุบัน แต่การออกจากห้องภายหลังไม่ลบ cohort ที่ตรึงไว้โดยอัตโนมัติ
- ข้อมูลที่หายคือไม่มีแถว score ไม่ใช่คะแนน 0 และการวิเคราะห์ก่อน–หลังใช้เฉพาะ student เดียวกันที่มี observation ครบสองรอบ
- สิทธิ์ข้อมูลระดับบุคคลมาจากเจ้าของห้องหรือ co-teacher `admin/manage` ไม่ใช่เพียงเป็นสมาชิก organization; co-teacher `view` เห็นได้เฉพาะ metadata โครงการ/รอบวัด
- ตารางใหม่ทุกตารางมี `org_id`, index สำหรับ join/RLS และ RLS ป้องกันการเรียก API โดยตรงจากนักเรียนหรือผู้ใช้คนละห้อง
- `questions.is_research_snapshot` แยกสำเนาเครื่องมือวัดออกจากโจทย์ในคลัง แต่ละสำเนาผูก `research_snapshot_project_id`, เก็บ source ID เพื่ออ้างอิงย้อนหลังโดยไม่ใช้ foreign key และ trigger ห้ามแก้หรือลบสำเนาหลังสร้าง
- assignment ออนไลน์ของโครงการต้องใช้ snapshot IDs ของ measurement นั้น เป็น `exam/online` ทำได้ครั้งเดียว และคะแนนเต็มคำนวณซ้ำจากโครงสร้างสำเนาในฐานข้อมูล ห้ามเชื่อค่าคะแนนเต็มจาก client
- ช่องทางเขียนคะแนนจริงทั้งหมดผ่าน trigger/RPC: submission sync สำหรับ `korkru_exam`, manual confirm สำหรับ `manual`, import confirm สำหรับ `excel`; browser role ถูก revoke สิทธิ์ `INSERT/UPDATE/DELETE` ตรงกับตารางคะแนน/ร่าง/import
- ช่องว่างใน manual/Excel ไม่สร้างหรือลบ score; การเปลี่ยนคะแนนเดิมต้องมีเหตุผลใน audit และ Excel ต้องมีการยืนยัน overwrite ชัดเจน
- Excel import ตรวจ template/project/row token/ตัวตน/ช่วงคะแนนตอนสร้าง preview และตรวจ roster/ค่าปัจจุบันซ้ำตอน confirm เพื่อให้ทั้งชุดสำเร็จหรือ rollback พร้อมกัน
- ค่าเฉลี่ย, sample S.D., paired/one-sample t-test, ช่วงเชื่อมั่น และ effect size เป็นผลคำนวณ request-time จาก `education_research_scores` ไม่ใช่ entity ที่เก็บซ้ำในฐานข้อมูล เมื่อคะแนนเปลี่ยนหน้าผลจึงใช้ข้อมูลล่าสุดโดยไม่ต้อง sync summary row

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

| bucket | ลิมิต | ชนิดที่รับ | ใครเขียน |
| --- | --- | --- | --- |
| `question-images` | 10 MB | PNG, JPEG, WebP, GIF, PDF | `question-image-upload.tsx` (รูปโจทย์) และ `question-file-upload.tsx` (ไฟล์อ้างอิงของโจทย์ส่งไฟล์งาน ซึ่งมัก **เป็น PDF** จึงตัดชนิดนี้ออกไม่ได้) |
| `work-images` | 5 MB | PNG, JPEG, WebP | `work-image-upload.tsx` — นักเรียนถ่ายรูปวิธีทำ 1 รูปต่อข้อย่อย |
| `submission-files` | 10 MB | PNG, JPEG, WebP, PDF | `file-submission-upload.tsx` — ไฟล์คำตอบของนักเรียน |

- ทั้งสาม bucket เป็น public-read และเก็บไฟล์ใต้ `{auth.uid()}/...` โดย `work-images`/`submission-files` มี RLS จำกัดให้เขียน/ลบได้เฉพาะโฟลเดอร์ของตัวเอง
- **`question-images` เคยไม่มีลิมิตและไม่จำกัดชนิดไฟล์เลย** ทั้งที่ UI เขียนว่า "สูงสุด 5 MB" เพราะเป็น bucket เดียวที่ถูกสร้างจากหน้า dashboard ก่อนโปรเจกต์ใช้ CLI — migration `20260828073436` ตั้งค่าให้ตรงกับอีกสองตัว (ลิมิตเป็น 10 MB ไม่ใช่ 5 เพราะ widget ไฟล์แนบโฆษณา 10 MB ไว้ และ PDF ย่อไม่ได้)
- **รูปถูกย่อในเบราว์เซอร์ก่อนอัปโหลดเสมอ** (`lib/image-downscale.ts`) ลิมิตของ bucket เป็นแค่ตาข่ายรับ ไม่ใช่ทางเดินปกติ
- ยังไม่มีระบบเก็บกวาดไฟล์กำพร้า: ครูอัปรูปแล้วปิดหน้าโดยไม่บันทึกโจทย์ ไฟล์นั้นค้างถาวร (ตอนกดลบรูปในฟอร์มลบให้จริง)

## กฎการเปลี่ยน schema

1. ตรวจ migration history และ schema ของฐานข้อมูลเป้าหมาย
2. ออกแบบ backward-compatible transition สำหรับข้อมูลเดิม
3. สร้าง migration ใหม่ ห้ามแก้ไฟล์ที่ apply แล้ว
4. เพิ่ม index สำหรับ field ที่ใช้ใน RLS/join/filter สำคัญ
5. ทดสอบ RLS ด้วยอย่างน้อย teacher, student, unrelated user และ admin ที่เกี่ยวข้อง
6. ทดสอบ rollback/recovery plan แม้ migration จะไม่มี down script
7. อัปเดตเอกสารนี้และ `docs/FEATURE_STATUS.md`
