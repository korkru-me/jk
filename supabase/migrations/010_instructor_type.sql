-- Migration 010: Add instructor_type to distinguish teachers from tutors
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS instructor_type TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_instructor_type_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_instructor_type_check
  CHECK (instructor_type IS NULL OR instructor_type IN ('teacher', 'tutor'));
