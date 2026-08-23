-- Expand student_profiles per school-registration conventions: restrict
-- gender (เพศสภาพ) to male/female, add health fields (food allergy, chronic
-- disease), split the old combined student_number into a proper section
-- number (ห้อง 1-15), student code (รหัสนักเรียน), and class roster number
-- (เลขที่), add a home address, and replace the single guardian name/phone
-- with a repeatable guardians list (a family may list 2-3 contacts).

UPDATE public.student_profiles SET gender = NULL WHERE gender = 'other';

ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_gender_check;
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female'));

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS food_allergy    text,
  ADD COLUMN IF NOT EXISTS chronic_disease text,
  ADD COLUMN IF NOT EXISTS section_number  smallint,
  ADD COLUMN IF NOT EXISTS student_code    text,
  ADD COLUMN IF NOT EXISTS class_number    smallint,
  ADD COLUMN IF NOT EXISTS address         text,
  ADD COLUMN IF NOT EXISTS guardians       jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_section_number_check;
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_section_number_check CHECK (section_number IS NULL OR section_number BETWEEN 1 AND 15);

-- Carry forward any existing single guardian into the new list as entry #1.
UPDATE public.student_profiles
SET guardians = jsonb_build_array(jsonb_build_object('name', COALESCE(parent_name, ''), 'phone', COALESCE(parent_phone, '')))
WHERE parent_name IS NOT NULL OR parent_phone IS NOT NULL;

ALTER TABLE public.student_profiles
  DROP COLUMN IF EXISTS parent_name,
  DROP COLUMN IF EXISTS parent_phone,
  DROP COLUMN IF EXISTS student_number;
