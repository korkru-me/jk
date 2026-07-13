-- Migration 017: Add grade_level column to questions
-- The app has always sent grade_level on create/update (see lib/actions/questions.ts),
-- but the column was never added to the schema, causing "Could not find the
-- 'grade_level' column" errors from PostgREST on every question save.
alter table public.questions
  add column if not exists grade_level text null;
