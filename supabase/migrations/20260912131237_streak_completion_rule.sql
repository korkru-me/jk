-- เงื่อนไขจบงาน: ทำครบแล้วจบ หรือต้องตอบถูกติดต่อกันให้ครบตามที่ครูตั้ง
--
-- ทุกงานที่แจกไปแล้วจบเมื่อทำครบตามจำนวนข้อที่ได้รับ ค่า 'fixed' จึงเป็น
-- พฤติกรรมเดิมทั้งหมด และเป็นค่าเริ่มต้นของทุกแถวที่มีอยู่ ส่วน 'streak'
-- เปลี่ยนความหมายของคำว่า "จบ": จำนวนข้อไม่คงที่อีกต่อไป นักเรียนทำไปเรื่อย ๆ
-- จนตอบถูกติดต่อกันครบ `streak_target` ข้อ ตอบผิดหนึ่งข้อเริ่มนับใหม่จาก 0
--
-- ตั้งใจไม่แตะ passing_type/passing_value ซึ่งเป็นเกณฑ์คะแนน/เปอร์เซ็นต์เดิม
-- เพราะ computePassed(), หน้าผลลัพธ์, หน้าวิเคราะห์, สมุดคะแนนห้องเรียน และ
-- ไฟล์ส่งออก อ่านสองคอลัมน์นั้นอยู่ การยัดค่าที่สามเข้าไปจะทำให้ทุกจุดต้องแก้
-- พร้อมกัน แยกคอลัมน์ใหม่จึงปลอดภัยกว่า และ 'streak' บังคับให้ทั้งคู่เป็น NULL
ALTER TABLE public.assignments
  ADD COLUMN completion_rule text NOT NULL DEFAULT 'fixed'
    CHECK (completion_rule IN ('fixed', 'streak')),

  -- ต้องถูกติดต่อกันกี่ข้อจึงจะจบ ต่ำกว่า 2 ไม่ใช่ "ติดต่อกัน" และเพดาน 20
  -- เป็นค่าที่สูงกว่าที่ครูจะตั้งจริงอยู่แล้ว NULL เมื่อ completion_rule = 'fixed'
  ADD COLUMN streak_target integer
    CHECK (streak_target IS NULL OR streak_target BETWEEN 2 AND 20),

  -- เพดานกันวนไม่จบ: ถึงจำนวนข้อนี้แล้วยังไม่ถึงเกณฑ์ ให้จบเป็น "ยังไม่ผ่าน"
  -- NULL = ไม่จำกัด ซึ่งครูเลือกได้แต่ไม่ใช่ค่าเริ่มต้นจากฟอร์ม
  ADD COLUMN streak_question_cap integer
    CHECK (streak_question_cap IS NULL OR streak_question_cap BETWEEN 1 AND 200),

  -- ทำครบคลังแล้ววนกลับมาถามใหม่ไหม โจทย์สุ่มตัวเลขจะได้ค่าชุดใหม่ทุกครั้งที่
  -- วนกลับมา (randomizeVariables ทำงานตอนสร้างแถวใหม่) ข้อคงที่จะซ้ำของเดิม
  ADD COLUMN streak_recycle_pool boolean NOT NULL DEFAULT true;

-- streak ที่ไม่มีเป้าหมายคือสถานะที่อ่านไม่ได้ — จะจบเมื่อไหร่ก็ไม่รู้
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_streak_target_required
  CHECK (completion_rule <> 'streak' OR streak_target IS NOT NULL);

-- โหมดนี้คือการตรวจทีละข้อโดยนิยาม: นักเรียนต้องรู้ผลของข้อที่เพิ่งทำจึงจะมี
-- "ติดต่อกัน" ให้นับ ความสัมพันธ์นี้จึงเป็น constraint ไม่ใช่กติกาที่อยู่ใน
-- ฟอร์มอย่างเดียว ส่วนจะเปิดเฉลยด้วยหรือบอกแค่ถูก/ผิด ใช้
-- instant_check_answer_key ที่มีอยู่แล้วตั้งแต่ 20260901023801 — ข้อสอบควรตั้ง
-- เป็นบอกแค่ถูก/ผิด ไม่งั้นคนที่จบก่อนถือเฉลยออกไปจากห้อง
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_streak_needs_instant_check
  CHECK (completion_rule <> 'streak' OR instant_check = true);

-- เกณฑ์คะแนน/เปอร์เซ็นต์ใช้ร่วมกับ streak ไม่ได้ เพราะจำนวนข้อไม่คงที่ คะแนน
-- ของสองคนจึงเทียบกันไม่ได้ โหมดนี้บันทึกเป็นผ่าน/ไม่ผ่านแทน
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_streak_has_no_score_threshold
  CHECK (
    completion_rule <> 'streak'
    OR (passing_type IS NULL AND passing_value IS NULL)
  );

COMMENT ON COLUMN public.assignments.completion_rule IS
  'fixed = จบเมื่อทำครบตามจำนวนข้อที่ได้รับ (พฤติกรรมเดิมทุกงาน). streak = จบเมื่อตอบถูกติดต่อกันครบ streak_target ข้อ จำนวนข้อทั้งหมดจึงไม่คงที่';

-- ยอดที่นับได้ของแต่ละรอบ ต้องอยู่ที่ submission ไม่ใช่คำนวณย้อนหลังจาก
-- ผลรวมคะแนนแบบ computePassed() เพราะ "ติดต่อกัน" เป็นคุณสมบัติของลำดับการตอบ
-- ไม่ใช่ของผลรวม — และ current_streak คือสิ่งที่ทำให้นักเรียนปิดหน้าจอแล้วกลับ
-- มาทำต่อจากยอดเดิมได้ แทนที่จะเริ่มนับใหม่ทุกครั้งที่โหลดหน้า
ALTER TABLE public.submissions
  ADD COLUMN current_streak integer NOT NULL DEFAULT 0
    CHECK (current_streak >= 0),
  -- ยอดสูงสุดที่ทำได้ในรอบนั้น เก็บไว้ให้ครูเห็นว่าเด็กที่ยังไม่ผ่านเข้าใกล้
  -- แค่ไหน ซึ่งต่างจาก current_streak ที่อาจถูกรีเซ็ตเป็น 0 ตอนจบรอบพอดี
  ADD COLUMN best_streak integer NOT NULL DEFAULT 0
    CHECK (best_streak >= 0),
  -- ผ่านเกณฑ์แล้วหรือยัง เขียนครั้งเดียวตอนถึงเป้า และไม่ถูกลบเมื่อนักเรียน
  -- กด "ฝึกต่ออีก" แล้วตอบผิด — ผ่านแล้วคือผ่านแล้ว
  ADD COLUMN streak_reached boolean NOT NULL DEFAULT false;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_best_streak_not_below_current
  CHECK (best_streak >= current_streak);
