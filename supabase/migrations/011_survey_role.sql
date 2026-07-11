-- Migration 011: Add survey_role and role_custom for registration survey
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS survey_role TEXT,
  ADD COLUMN IF NOT EXISTS role_custom  TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_survey_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_survey_role_check
  CHECK (survey_role IS NULL OR survey_role IN ('teacher', 'tutor', 'student', 'parent', 'other'));
