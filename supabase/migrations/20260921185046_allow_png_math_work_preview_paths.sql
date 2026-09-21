-- Safari cannot reliably encode canvas previews as WebP, so the application
-- falls back to PNG. The private bucket and Server Actions already validate
-- PNG MIME/signatures; keep the existing path scopes while allowing the same
-- exact preview filename with either supported extension.

ALTER TABLE public.student_work_artifacts
  ADD CONSTRAINT student_work_artifacts_preview_path_png
  CHECK (
    (
      preview_path LIKE 'students/' || student_id::text || '/%/preview.webp'
      OR preview_path LIKE 'students/' || student_id::text || '/%/preview.png'
    )
    AND preview_path !~ '(^|/)\.\.(/|$)'
  ) NOT VALID;

ALTER TABLE public.student_work_artifacts
  VALIDATE CONSTRAINT student_work_artifacts_preview_path_png;

ALTER TABLE public.student_work_artifacts
  DROP CONSTRAINT student_work_artifacts_preview_path;

ALTER TABLE public.student_work_artifacts
  RENAME CONSTRAINT student_work_artifacts_preview_path_png
  TO student_work_artifacts_preview_path;

ALTER TABLE public.teaching_boards
  ADD CONSTRAINT teaching_boards_preview_path_png
  CHECK (
    (
      preview_path LIKE 'teachers/' || created_by::text || '/' || assignment_id::text
        || '/' || question_id::text || '/' || slot::text || '/%/preview.webp'
      OR preview_path LIKE 'teachers/' || created_by::text || '/' || assignment_id::text
        || '/' || question_id::text || '/' || slot::text || '/%/preview.png'
    )
    AND preview_path !~ '(^|/)\.\.(/|$)'
  ) NOT VALID;

ALTER TABLE public.teaching_boards
  VALIDATE CONSTRAINT teaching_boards_preview_path_png;

ALTER TABLE public.teaching_boards
  DROP CONSTRAINT teaching_boards_preview_path;

ALTER TABLE public.teaching_boards
  RENAME CONSTRAINT teaching_boards_preview_path_png
  TO teaching_boards_preview_path;

CREATE OR REPLACE FUNCTION public.validate_student_work_artifact_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.submission_answer_id IS DISTINCT FROM NEW.submission_answer_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.part_key IS DISTINCT FROM NEW.part_key
  ) THEN
    RAISE EXCEPTION 'student work artifact scope is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.submission_answers sa
    JOIN public.submissions s ON s.id = sa.submission_id
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE sa.id = NEW.submission_answer_id
      AND sa.org_id = NEW.org_id
      AND s.org_id = NEW.org_id
      AND a.org_id = NEW.org_id
      AND s.student_id = NEW.student_id
      AND s.status = 'in_progress'
      AND a.mode = 'online'
      AND (
        NEW.preview_path LIKE 'students/' || NEW.student_id::text || '/'
          || s.id::text || '/' || NEW.submission_answer_id::text || '/%/preview.webp'
        OR NEW.preview_path LIKE 'students/' || NEW.student_id::text || '/'
          || s.id::text || '/' || NEW.submission_answer_id::text || '/%/preview.png'
      )
      AND (
        NEW.scene_path IS NULL
        OR NEW.scene_path LIKE 'students/' || NEW.student_id::text || '/'
          || s.id::text || '/' || NEW.submission_answer_id::text || '/%/scene.json'
      )
      AND (
        TG_OP = 'UPDATE'
        OR (NEW.source_type = 'scratchpad' AND a.scratchpad_enabled)
        OR (
          NEW.source_type = 'photo'
          AND (a.scratchpad_enabled OR a.require_work_image)
        )
      )
  ) THEN
    RAISE EXCEPTION 'student work artifact scope is invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
