-- New question type: "ส่งไฟล์งาน" (file_upload) — a Google-Classroom-style
-- file-submission assignment. The teacher's instructions live in the
-- existing `question_text` field; optional teacher reference attachments
-- (images/PDF) are stored as `extra_data.attachment_urls` and reuse the
-- existing `question-images` bucket. The student's submitted files are
-- stored as a JSON array in `submission_answers.student_answer` (the same
-- generic text column ordering/fill_blank already encode as JSON — see
-- saveFileSubmission in lib/actions/submissions.ts), so no new columns are
-- needed on either table. Grading is "submitted vs not submitted": at least
-- one attached file = full credit, zero files = no credit — see the
-- `question_type === 'file_upload'` branch in gradeAndFinalizeSubmission.
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'file_upload';

-- Note: the `question-images` bucket (used for the teacher-side reference
-- attachments above) was checked live and already has
-- allowed_mime_types = null / file_size_limit = null, i.e. it is already
-- unrestricted and accepts PDFs without any change here. Do not add an
-- explicit allow-list to it — that would newly *restrict* a bucket that
-- today accepts anything, which is a regression for every other question
-- type that also uploads into it.

-- Dedicated bucket for student-submitted answer files (photos of written
-- work, scanned PDFs, etc.) — separate from `question-images` (teacher-only,
-- no ownership constraints) and from `work-images` (single required photo
-- per numeric answer part). Each student can only write/delete under their
-- own `{auth.uid()}/...` path prefix; anyone with the URL can read (same
-- public-read convention as the other upload buckets).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('submission-files', 'submission-files', true, 10485760,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "submission_files_owner_insert" ON storage.objects;
CREATE POLICY "submission_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'submission-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "submission_files_owner_delete" ON storage.objects;
CREATE POLICY "submission_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'submission-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- No SELECT policy needed: the bucket is public, so objects are readable by
-- URL without RLS. A broad SELECT policy here would additionally allow
-- listing/enumerating every file in the bucket (see
-- 20260723090100_work_images_drop_redundant_read_policy.sql for the same
-- reasoning applied to work-images).
