-- ถามกลุ่มสาระการเรียนรู้ตอนสมัครสมาชิก (เฉพาะบทบาทครูผู้สอน)
--
-- subject_group        เก็บ slug ตาม lib/subject-groups.ts
-- subject_group_other  ข้อความที่ครูกรอกเอง ใช้เมื่อ subject_group = 'other'
--
-- ทั้งสองคอลัมน์เป็น NULL ได้: บัญชีเดิม บัญชีนักเรียน และผู้ที่สมัครผ่าน
-- Google OAuth ไม่มีค่านี้

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subject_group       text,
  ADD COLUMN IF NOT EXISTS subject_group_other text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subject_group_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_subject_group_check
    CHECK (subject_group IS NULL OR subject_group IN (
      'science_physics',
      'science_chemistry',
      'science_biology',
      'science_general',
      'math',
      'arts',
      'thai',
      'foreign_language',
      'social_studies',
      'occupations',
      'health_pe',
      'other'
    ));

-- ทริกเกอร์สร้างโปรไฟล์ตอนสมัคร: เดิม (20260728120000_user_name_parts.sql)
-- คัดลอกเฉพาะชื่อกับ role ทำให้ survey_role/instructor_type ที่ส่งมากับ
-- signup metadata ตกหล่นไป เพิ่มให้ครบพร้อม subject_group ในรอบเดียว
--
-- SET search_path = public ยังจำเป็นเหมือนเดิม: ทริกเกอร์ทำงานภายใต้ role
-- supabase_auth_admin ที่ search_path มีแค่ "auth" ถ้าไม่ตั้งจะ cast
-- user_role ไม่ได้และสมัครสมาชิกล้มเหลว
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (
    id, email, full_name, prefix, first_name, last_name, role,
    instructor_type, survey_role, role_custom, subject_group, subject_group_other
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'prefix',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student'),
    NEW.raw_user_meta_data->>'instructor_type',
    NEW.raw_user_meta_data->>'survey_role',
    NEW.raw_user_meta_data->>'role_custom',
    NEW.raw_user_meta_data->>'subject_group',
    NEW.raw_user_meta_data->>'subject_group_other'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
