-- "ให้นักเรียนทุกคนได้ตัวเลขชุดเดียวกัน" สำหรับโจทย์สุ่มตัวเลข
--
-- NULL = แบบเดิม: นักเรียนแต่ละคน (และแต่ละรอบ) สุ่มตัวเลขของตัวเองตอนเริ่มทำ
-- มีค่า = ตอนเริ่มทำ ค่าตัวแปรของแต่ละข้อสุ่มจากตัวสุ่มที่ตั้งต้นด้วยเลขนี้คู่กับ
-- id ของข้อนั้น (lib/math/shared-random.ts) ทุกคนทุกรอบจึงได้ตัวเลขชุดเดียวกัน
-- ค่าที่ได้ยังถูกตรึงลง submission_answers.random_values เหมือนเดิม การตรวจคำตอบ
-- จึงไม่ได้อ่านคอลัมน์นี้เลย
--
-- server เป็นคนสร้างเลขนี้ (createAssignment / updateAssignment) ไม่รับจาก browser
-- และเปลี่ยนไม่ได้หลังมีนักเรียนเริ่มทำ ไม่อย่างนั้นคนที่เริ่มก่อนกับหลังจะได้คนละชุด
--
-- ไม่มี default งานเดิมทุกชิ้นจึงเป็น NULL และสุ่มรายคนเหมือนก่อนมีคอลัมน์นี้
-- ต้อง apply ก่อน deploy โค้ดที่อ้างคอลัมน์นี้ (สร้าง/แก้/ทำสำเนางาน และหน้าแก้ไขงาน)
ALTER TABLE public.assignments
  ADD COLUMN shared_random_seed integer
    CONSTRAINT assignments_shared_random_seed_positive CHECK (shared_random_seed > 0);

COMMENT ON COLUMN public.assignments.shared_random_seed IS
  'When set, every attempt draws each question''s random variable values from a PRNG seeded by this value and the question id, so all students get the same numbers. NULL = each attempt draws its own. See lib/math/shared-random.ts.';
