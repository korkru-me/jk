-- Migration 002: Admin Panel Fields
-- Run this in Supabase SQL Editor after schema.sql

-- 1. Add status field to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended'));

-- 2. Add 'pending' to visibility enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pending'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'visibility')
  ) THEN
    ALTER TYPE visibility ADD VALUE 'pending';
  END IF;
END$$;

-- 3. Add rejected_reason to questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- 4. Allow admins to read all users (RLS policy)
DROP POLICY IF EXISTS "admins_read_all_users" ON public.users;
CREATE POLICY "admins_read_all_users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 5. Allow admins to update all users
DROP POLICY IF EXISTS "admins_update_users" ON public.users;
CREATE POLICY "admins_update_users" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 6. Allow admins to read all questions
DROP POLICY IF EXISTS "admins_read_all_questions" ON public.questions;
CREATE POLICY "admins_read_all_questions" ON public.questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 7. Allow admins to update all questions
DROP POLICY IF EXISTS "admins_update_questions" ON public.questions;
CREATE POLICY "admins_update_questions" ON public.questions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 8. Allow admins to delete any question
DROP POLICY IF EXISTS "admins_delete_questions" ON public.questions;
CREATE POLICY "admins_delete_questions" ON public.questions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
