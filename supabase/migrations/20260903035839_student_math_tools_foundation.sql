-- Student math tools phase 1: assignment settings, answer metadata, private
-- work artifacts, and teacher-owned teaching boards.
--
-- Browser scratch scenes that have not been attached stay in IndexedDB and
-- deliberately have no row here. Only an explicit attachment creates a
-- student_work_artifacts row and objects in the private bucket below.

-- Existing assignments stay off so a migration cannot change the rules of a
-- published exercise or exam. createAssignment applies the approved defaults
-- for newly-created online work (exercise on, exam off); print stays off.
ALTER TABLE public.assignments
  ADD COLUMN calculator_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN scratchpad_enabled boolean NOT NULL DEFAULT false;

-- Phase 2 will persist DEG/RAD per logical numeric input in this object. An
-- empty object means the legacy/default DEG behavior. Keeping this separate
-- preserves every historical student_answer shape.
ALTER TABLE public.submission_answers
  ADD COLUMN math_input_modes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT submission_answers_math_input_modes_object
    CHECK (jsonb_typeof(math_input_modes) = 'object');

CREATE TABLE public.student_work_artifacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  submission_answer_id uuid NOT NULL REFERENCES public.submission_answers(id) ON DELETE CASCADE,
  student_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  part_key              text NOT NULL,
  source_type           text NOT NULL CHECK (source_type IN ('scratchpad', 'photo')),
  preview_path          text NOT NULL,
  scene_path            text,
  format_version        smallint NOT NULL DEFAULT 1 CHECK (format_version BETWEEN 1 AND 100),
  preview_size_bytes    integer NOT NULL CHECK (preview_size_bytes BETWEEN 1 AND 5242880),
  scene_size_bytes      integer CHECK (scene_size_bytes BETWEEN 1 AND 2097152),
  element_count         integer CHECK (element_count BETWEEN 0 AND 10000),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_work_artifacts_part_key
    CHECK (part_key ~ '^[a-z0-9][a-z0-9:_-]{0,99}$'),
  CONSTRAINT student_work_artifacts_preview_path
    CHECK (
      preview_path LIKE 'students/' || student_id::text || '/%/preview.webp'
      AND preview_path !~ '(^|/)\.\.(/|$)'
    ),
  CONSTRAINT student_work_artifacts_scene_path
    CHECK (
      scene_path IS NULL
      OR (
        scene_path LIKE 'students/' || student_id::text || '/%/scene.json'
        AND scene_path !~ '(^|/)\.\.(/|$)'
      )
    ),
  CONSTRAINT student_work_artifacts_scene_metadata
    CHECK (
      (scene_path IS NULL AND scene_size_bytes IS NULL AND element_count IS NULL)
      OR (scene_path IS NOT NULL AND scene_size_bytes IS NOT NULL AND element_count IS NOT NULL)
    ),
  CONSTRAINT student_work_artifacts_scratchpad_scene
    CHECK (source_type <> 'scratchpad' OR scene_path IS NOT NULL),
  CONSTRAINT student_work_artifacts_answer_part_unique
    UNIQUE (submission_answer_id, part_key),
  CONSTRAINT student_work_artifacts_preview_unique UNIQUE (preview_path),
  CONSTRAINT student_work_artifacts_scene_unique UNIQUE (scene_path)
);

CREATE INDEX student_work_artifacts_student_updated_idx
  ON public.student_work_artifacts(student_id, updated_at DESC);
CREATE INDEX student_work_artifacts_org_idx
  ON public.student_work_artifacts(org_id);

CREATE TABLE public.teaching_boards (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id     uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_by        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot              smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
  preview_path      text NOT NULL,
  scene_path        text NOT NULL,
  format_version    smallint NOT NULL DEFAULT 1 CHECK (format_version BETWEEN 1 AND 100),
  preview_size_bytes integer NOT NULL CHECK (preview_size_bytes BETWEEN 1 AND 5242880),
  scene_size_bytes   integer NOT NULL CHECK (scene_size_bytes BETWEEN 1 AND 2097152),
  element_count      integer NOT NULL CHECK (element_count BETWEEN 0 AND 10000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teaching_boards_preview_path
    CHECK (
      preview_path LIKE 'teachers/' || created_by::text || '/' || assignment_id::text
        || '/' || question_id::text || '/' || slot::text || '/%/preview.webp'
      AND preview_path !~ '(^|/)\.\.(/|$)'
    ),
  CONSTRAINT teaching_boards_scene_path
    CHECK (
      scene_path LIKE 'teachers/' || created_by::text || '/' || assignment_id::text
        || '/' || question_id::text || '/' || slot::text || '/%/scene.json'
      AND scene_path !~ '(^|/)\.\.(/|$)'
    ),
  CONSTRAINT teaching_boards_slot_unique
    UNIQUE (assignment_id, question_id, created_by, slot),
  CONSTRAINT teaching_boards_preview_unique UNIQUE (preview_path),
  CONSTRAINT teaching_boards_scene_unique UNIQUE (scene_path)
);

CREATE INDEX teaching_boards_assignment_question_idx
  ON public.teaching_boards(assignment_id, question_id);
CREATE INDEX teaching_boards_org_idx
  ON public.teaching_boards(org_id);

DROP TRIGGER IF EXISTS student_work_artifacts_updated_at ON public.student_work_artifacts;
CREATE TRIGGER student_work_artifacts_updated_at
  BEFORE UPDATE ON public.student_work_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS teaching_boards_updated_at ON public.teaching_boards;
CREATE TRIGGER teaching_boards_updated_at
  BEFORE UPDATE ON public.teaching_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Recursion-safe permission helpers. Organization membership by itself is not
-- enough: authority comes from the exact assignment's owner/classrooms.
CREATE FUNCTION public.can_view_math_tools_assignment(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR (
    public.current_user_can_manage_question_bank()
    AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND a.org_id = ANY(public.get_user_org_ids())
      AND (
        a.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.assignment_classrooms ac
          JOIN public.classroom_co_teachers ct ON ct.classroom_id = ac.classroom_id
          WHERE ac.assignment_id = a.id
            AND ct.user_id = (SELECT auth.uid())
            AND ct.permission IN ('admin', 'manage', 'view')
        )
      )
    )
  );
$$;

CREATE FUNCTION public.can_manage_math_tools_assignment(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR (
    public.current_user_can_manage_question_bank()
    AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND a.org_id = ANY(public.get_user_org_ids())
      AND (
        a.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.assignment_classrooms ac
          JOIN public.classroom_co_teachers ct ON ct.classroom_id = ac.classroom_id
          WHERE ac.assignment_id = a.id
            AND ct.user_id = (SELECT auth.uid())
            AND ct.permission IN ('admin', 'manage')
        )
      )
    )
  );
$$;

CREATE FUNCTION public.math_tools_assignment_contains_question(
  p_assignment_id uuid,
  p_question_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND p_question_id = ANY(a.question_ids)
      AND public.can_view_math_tools_assignment(a.id)
  );
$$;

CREATE FUNCTION public.can_read_student_work_artifact(
  p_submission_answer_id uuid,
  p_student_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submission_answers sa
    JOIN public.submissions s ON s.id = sa.submission_id
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE sa.id = p_submission_answer_id
      AND sa.org_id = p_org_id
      AND s.org_id = p_org_id
      AND a.org_id = p_org_id
      AND s.student_id = p_student_id
      AND (
        p_student_id = (SELECT auth.uid())
        OR public.can_view_math_tools_assignment(a.id)
      )
  );
$$;

CREATE FUNCTION public.can_write_student_work_artifact(
  p_submission_answer_id uuid,
  p_student_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submission_answers sa
    JOIN public.submissions s ON s.id = sa.submission_id
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE sa.id = p_submission_answer_id
      AND sa.org_id = p_org_id
      AND s.org_id = p_org_id
      AND a.org_id = p_org_id
      AND s.student_id = p_student_id
      AND p_student_id = (SELECT auth.uid())
      AND s.status = 'in_progress'
      AND a.mode = 'online'
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_math_tools_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_math_tools_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.math_tools_assignment_contains_question(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_student_work_artifact(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_student_work_artifact(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_math_tools_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_math_tools_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.math_tools_assignment_contains_question(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_student_work_artifact(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_student_work_artifact(uuid, uuid, uuid) TO authenticated;

-- Triggers also protect service-role code from connecting paths and tenants to
-- the wrong parent row. Scope fields never change after creation.
CREATE FUNCTION public.validate_student_work_artifact_scope()
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
      AND NEW.preview_path LIKE 'students/' || NEW.student_id::text || '/'
        || s.id::text || '/' || NEW.submission_answer_id::text || '/%/preview.webp'
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

CREATE FUNCTION public.validate_teaching_board_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.assignment_id IS DISTINCT FROM NEW.assignment_id
    OR OLD.question_id IS DISTINCT FROM NEW.question_id
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.slot IS DISTINCT FROM NEW.slot
  ) THEN
    RAISE EXCEPTION 'teaching board scope is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = NEW.assignment_id
      AND a.org_id = NEW.org_id
      AND NEW.question_id = ANY(a.question_ids)
      AND (
        a.created_by = NEW.created_by
        OR EXISTS (
          SELECT 1
          FROM public.assignment_classrooms ac
          JOIN public.classroom_co_teachers ct ON ct.classroom_id = ac.classroom_id
          WHERE ac.assignment_id = a.id
            AND ct.user_id = NEW.created_by
            AND ct.permission IN ('admin', 'manage')
        )
      )
  ) THEN
    RAISE EXCEPTION 'teaching board scope is invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_student_work_artifact_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_teaching_board_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_student_work_artifact_scope
  BEFORE INSERT OR UPDATE ON public.student_work_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.validate_student_work_artifact_scope();

CREATE TRIGGER validate_teaching_board_scope
  BEFORE INSERT OR UPDATE ON public.teaching_boards
  FOR EACH ROW EXECUTE FUNCTION public.validate_teaching_board_scope();

ALTER TABLE public.student_work_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_work_artifacts_select" ON public.student_work_artifacts
  FOR SELECT TO authenticated
  USING (
    public.can_read_student_work_artifact(
      submission_answer_id,
      student_id,
      org_id
    )
  );

CREATE POLICY "student_work_artifacts_insert" ON public.student_work_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_student_work_artifact(
      submission_answer_id,
      student_id,
      org_id
    )
  );

CREATE POLICY "student_work_artifacts_update" ON public.student_work_artifacts
  FOR UPDATE TO authenticated
  USING (
    public.can_write_student_work_artifact(
      submission_answer_id,
      student_id,
      org_id
    )
  )
  WITH CHECK (
    public.can_write_student_work_artifact(
      submission_answer_id,
      student_id,
      org_id
    )
  );

CREATE POLICY "student_work_artifacts_delete" ON public.student_work_artifacts
  FOR DELETE TO authenticated
  USING (
    public.can_write_student_work_artifact(
      submission_answer_id,
      student_id,
      org_id
    )
  );

CREATE POLICY "teaching_boards_select" ON public.teaching_boards
  FOR SELECT TO authenticated
  USING (public.can_view_math_tools_assignment(assignment_id));

CREATE POLICY "teaching_boards_insert" ON public.teaching_boards
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id = ANY(public.get_user_org_ids())
    AND public.can_manage_math_tools_assignment(assignment_id)
    AND public.math_tools_assignment_contains_question(assignment_id, question_id)
  );

CREATE POLICY "teaching_boards_update" ON public.teaching_boards
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND public.can_manage_math_tools_assignment(assignment_id)
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id = ANY(public.get_user_org_ids())
    AND public.can_manage_math_tools_assignment(assignment_id)
    AND public.math_tools_assignment_contains_question(assignment_id, question_id)
  );

CREATE POLICY "teaching_boards_delete" ON public.teaching_boards
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND public.can_manage_math_tools_assignment(assignment_id)
  );

REVOKE ALL ON TABLE public.student_work_artifacts FROM anon;
REVOKE ALL ON TABLE public.teaching_boards FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_work_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teaching_boards TO authenticated;

-- The browser receives only path-bound signed upload tokens and short-lived
-- signed read URLs after a Server Action authorizes the exact parent row. No
-- storage.objects policy is created for this private bucket, so authenticated
-- clients cannot list, read, upload, overwrite, or delete arbitrary objects.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'math-work-artifacts',
  'math-work-artifacts',
  false,
  5242880,
  ARRAY['image/webp', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
