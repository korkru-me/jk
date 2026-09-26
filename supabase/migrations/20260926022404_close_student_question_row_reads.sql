-- ปิดทางที่นักเรียนอ่านแถวโจทย์ตรงจากฐานข้อมูล
--
-- policy นี้เปิดทั้งแถวของ questions ให้นักเรียนที่ส่งงานแล้วเมื่อ show_results
-- เป็น immediate (หรือ after_due ที่พ้นกำหนด) — RLS คุมได้ทีละแถว ไม่ใช่ทีละ
-- คอลัมน์ แถวที่ได้จึงมี solution_text และ solution_image_urls ติดมาด้วย นักเรียน
-- ที่ยังเหลือรอบให้ทำจึงดึงเฉลยวิธีทำผ่าน API ได้ก่อนเวลาที่ assignments.
-- show_solutions อนุญาต (หรือแม้ครูไม่ได้ติ๊กให้ดูเลย)
--
-- หน้าผลสอบเป็นที่เดียวที่อ่านโจทย์ผ่าน policy นี้ โค้ดชุดเดียวกับ migration
-- 20260926020630 เปลี่ยนให้หน้านั้นอ่านเฉพาะคอลัมน์ที่แสดงผ่าน server หลังตรวจ
-- เจ้าของและ show_results แล้ว ส่วนเฉลยวิธีทำอ่านผ่าน getAttemptSolutions
-- นักเรียนจึงไม่ต้องอ่านตารางนี้ตรงอีก (policy ของ submission_answers ที่ใช้
-- can_current_user_view_submission_answers ยังอยู่ตามเดิม)
--
-- ต้อง apply หลัง deploy โค้ดนั้นแล้วเท่านั้น: หน้าผลสอบรุ่นเก่ายังอ่านโจทย์ผ่าน
-- policy นี้ ถ้าปิดก่อน นักเรียนที่เปิดหน้าผลสอบระหว่างนั้นจะเจอหน้าเสีย
DROP POLICY IF EXISTS "questions_student_results_select" ON public.questions;
DROP FUNCTION IF EXISTS public.can_current_user_view_question_solution(uuid);
