-- Lets a teacher require students to attach a photo of their work
-- (แสดงวิธีทำ) alongside the numeric answer on "written" (short-answer)
-- questions, so the teacher can verify the method, not just the final
-- number. Off by default; toggled per-question.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS requires_work_image boolean NOT NULL DEFAULT false;

-- One image per answer part, positional by the same index already used for
-- student_answer/correct_answer (see submitSubmission / handlePartAnswerChange
-- in exam-client.tsx) — NOT keyed by answer_parts[].id.
ALTER TABLE public.submission_answers
  ADD COLUMN IF NOT EXISTS work_images jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Dedicated bucket for student-submitted work photos, separate from the
-- teacher-authored `question-images` bucket (which has no RLS/ownership
-- constraints since only teachers write to it). Each student can only
-- write/delete under their own `{auth.uid()}/...` path prefix; anyone with
-- the URL can read (same public-read convention as question-images).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('work-images', 'work-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "work_images_owner_insert" ON storage.objects;
CREATE POLICY "work_images_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'work-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "work_images_owner_delete" ON storage.objects;
CREATE POLICY "work_images_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'work-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- No SELECT policy needed: the bucket is public, so objects are readable by
-- URL without RLS. A broad SELECT policy here would additionally allow
-- listing/enumerating every file in the bucket (see follow-up migration
-- 20260723090100_work_images_drop_redundant_read_policy.sql).
