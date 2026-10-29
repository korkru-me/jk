-- "ให้นักเรียนดูข้อสอบที่ทำแล้ว" — ข้อสอบเท่านั้น (แบบฝึกหัดไม่มีตัวเลือกนี้)
-- เมื่อครูติ๊ก หน้าผลสอบของนักเรียนจะมีปุ่ม "ดูข้อสอบที่ทำเสร็จแล้ว" เปิดหน้า
-- ข้อสอบเดิมแบบดูอย่างเดียว เห็นคำตอบของตัวเองพร้อมเฉลยว่าถูกหรือผิดทีละข้อ
--
-- ไม่ได้เปิดคำตอบเร็วกว่าที่ครูตั้งไว้: คำตอบรายข้ออ่านผ่าน RLS ของ
-- submission_answers (can_current_user_view_submission_answers) จึงยังเป็นไป
-- ตาม show_results เหมือนหน้าผลสอบทุกอย่าง และหน้า /submissions/[id]/review
-- ตรวจคอลัมน์นี้กับประเภทงานซ้ำบน server ทุกครั้ง (lib/exam-review.ts)
--
-- ค่าเริ่มต้นเป็น false เพราะข้อสอบที่มอบหมายไปแล้วไม่เคยมีหน้านี้ การเพิ่ม
-- คอลัมน์จึงต้องไม่ทำให้นักเรียนคนไหนเห็นอะไรเพิ่มเอง
--
-- ต้อง apply ก่อน deploy โค้ดที่อ่านคอลัมน์นี้ (หน้าผลสอบ หน้าแก้ไขงาน และการ
-- สร้าง/แก้/ทำสำเนางานอ้างชื่อคอลัมน์ตรง ๆ) — โค้ดเดิมไม่รู้จักคอลัมน์นี้จึงไม่กระทบ
ALTER TABLE public.assignments
  ADD COLUMN allow_exam_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assignments.allow_exam_review IS
  'Exams only: once answers are released by show_results, a student may reopen their submitted exam read-only with per-question feedback. Enforced server-side by lib/exam-review.ts.';
