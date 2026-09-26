-- เฉลยวิธีทำที่ครูแนบกับโจทย์ (questions.solution_text / solution_image_urls)
-- เปิดให้นักเรียนดูจากหน้าสรุปผลได้เมื่อครูติ๊ก "ให้นักเรียนดูเฉลยวิธีทำ" และ
-- นักเรียนคนนั้นทำงานนี้ต่อไม่ได้แล้ว: ครูปิดงาน · พ้นกำหนดส่งของคนนั้น ·
-- ทำครบจำนวนครั้ง — และไม่มีรอบที่ยังแก้คำตอบได้ค้างอยู่ กติกาทั้งหมดอยู่ที่
-- lib/solution-release.ts และ Server Action ตรวจซ้ำทุกครั้งที่เปิด
--
-- ค่าเริ่มต้นเป็น false เพราะงานที่มอบหมายไปแล้วไม่เคยเปิดเฉลยวิธีทำให้นักเรียน
-- การเพิ่มคอลัมน์จึงต้องไม่ทำให้ใครเห็นอะไรเพิ่มเอง
--
-- ต้อง apply ก่อน deploy โค้ดที่อ่านคอลัมน์นี้ (หน้าสรุปผล หน้าแก้ไขงาน และการ
-- สร้าง/แก้/ทำสำเนางานอ้างชื่อคอลัมน์ตรง ๆ) — โค้ดเดิมไม่รู้จักคอลัมน์นี้จึงไม่กระทบ
ALTER TABLE public.assignments
  ADD COLUMN show_solutions boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assignments.show_solutions IS
  'Students may open each question''s attached solution (เฉลยวิธีทำ) once they can no longer work on this assignment. Enforced server-side by getAttemptSolutions; see lib/solution-release.ts.';
