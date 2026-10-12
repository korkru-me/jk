-- Self-practice libraries are deliberately separate from assignments and
-- submissions. The only durable student activity is metadata saying that one
-- authenticated roster member asked the server to check one library question.

CREATE TABLE public.practice_libraries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  classroom_id      uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_by        uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  title             text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description       text CHECK (description IS NULL OR char_length(description) <= 2000),
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'closed')),
  reveal_answer_key boolean NOT NULL DEFAULT false,
  published_at      timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, classroom_id)
);

CREATE TABLE public.practice_library_questions (
  library_id uuid NOT NULL REFERENCES public.practice_libraries(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (library_id, question_id),
  UNIQUE (library_id, position)
);

-- Keep this table at exactly five columns. In particular, never add an answer,
-- correctness, score, feedback, answer key, or browser-provided timestamp.
CREATE TABLE public.practice_answer_attempts (
  library_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key uuid NOT NULL,
  CONSTRAINT practice_answer_attempts_membership_fkey
    FOREIGN KEY (library_id, question_id)
    REFERENCES public.practice_library_questions(library_id, question_id)
    ON DELETE CASCADE,
  CONSTRAINT practice_answer_attempts_idempotency_key
    UNIQUE (library_id, student_id, idempotency_key)
);

CREATE INDEX practice_libraries_classroom_updated_idx
  ON public.practice_libraries(classroom_id, updated_at DESC, id DESC);
CREATE INDEX practice_libraries_classroom_status_idx
  ON public.practice_libraries(classroom_id, status);
CREATE INDEX practice_library_questions_order_idx
  ON public.practice_library_questions(library_id, position, question_id);
CREATE INDEX practice_answer_attempts_student_progress_idx
  ON public.practice_answer_attempts(library_id, student_id, question_id);
CREATE INDEX practice_answer_attempts_question_progress_idx
  ON public.practice_answer_attempts(library_id, question_id, student_id);

DROP TRIGGER IF EXISTS practice_libraries_updated_at ON public.practice_libraries;
CREATE TRIGGER practice_libraries_updated_at
  BEFORE UPDATE ON public.practice_libraries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Recursion-safe helpers used by RLS. Each helper checks the active account as
-- well as the classroom relation so a suspended user cannot retain access via
-- a stale roster or co-teacher row.
CREATE FUNCTION public.current_user_can_read_practice_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classrooms classroom
    JOIN public.users actor ON actor.id = (SELECT auth.uid())
    WHERE classroom.id = p_classroom_id
      AND actor.status = 'active'
      AND actor.role::text IN ('teacher', 'admin')
      AND classroom.status = 'active'
      AND classroom.classroom_type = 'subject'
      AND (
        classroom.teacher_id = actor.id
        OR EXISTS (
          SELECT 1
          FROM public.classroom_co_teachers co_teacher
          WHERE co_teacher.classroom_id = classroom.id
            AND co_teacher.user_id = actor.id
            AND co_teacher.permission IN ('admin', 'manage', 'view')
        )
      )
  );
$$;

CREATE FUNCTION public.current_user_can_manage_practice_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classrooms classroom
    JOIN public.users actor ON actor.id = (SELECT auth.uid())
    WHERE classroom.id = p_classroom_id
      AND actor.status = 'active'
      AND actor.role::text IN ('teacher', 'admin')
      AND classroom.status = 'active'
      AND classroom.classroom_type = 'subject'
      AND (
        classroom.teacher_id = actor.id
        OR EXISTS (
          SELECT 1
          FROM public.classroom_co_teachers co_teacher
          WHERE co_teacher.classroom_id = classroom.id
            AND co_teacher.user_id = actor.id
            AND co_teacher.permission IN ('admin', 'manage')
        )
      )
  );
$$;

CREATE FUNCTION public.current_user_is_practice_student(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_students roster
    JOIN public.users actor ON actor.id = roster.student_id
    WHERE roster.classroom_id = p_classroom_id
      AND roster.student_id = (SELECT auth.uid())
      AND actor.status = 'active'
      AND actor.role::text = 'student'
      AND EXISTS (
        SELECT 1
        FROM public.classrooms classroom
        WHERE classroom.id = roster.classroom_id
          AND classroom.status = 'active'
          AND classroom.classroom_type = 'subject'
      )
  );
$$;

CREATE FUNCTION public.current_user_can_read_practice_library(p_library_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_libraries library
    WHERE library.id = p_library_id
      AND (
        public.current_user_can_read_practice_classroom(library.classroom_id)
        OR (
          library.status = 'published'
          AND public.current_user_is_practice_student(library.classroom_id)
        )
      )
  );
$$;

CREATE FUNCTION public.current_user_can_manage_practice_library(p_library_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_libraries library
    WHERE library.id = p_library_id
      AND public.current_user_can_manage_practice_classroom(library.classroom_id)
  );
$$;

CREATE FUNCTION public.current_user_can_read_own_practice_progress(
  p_library_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_student_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1
    FROM public.practice_libraries library
    WHERE library.id = p_library_id
      AND library.status = 'published'
      AND public.current_user_is_practice_student(library.classroom_id)
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_read_practice_classroom(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_practice_classroom(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_practice_student(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_read_practice_library(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_practice_library(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_read_own_practice_progress(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_practice_classroom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_practice_classroom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_practice_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_practice_library(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_practice_library(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_own_practice_progress(uuid, uuid) TO authenticated;

-- Validate immutable scope even for service-role writes. The creator must be an
-- active teacher/admin who owns the classroom or has admin/manage co-teacher
-- access, and the supplied organization must be the classroom's organization.
CREATE FUNCTION public.validate_practice_library_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.classroom_id IS DISTINCT FROM OLD.classroom_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'practice library scope is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classrooms classroom
    JOIN public.users creator ON creator.id = NEW.created_by
    WHERE classroom.id = NEW.classroom_id
      AND classroom.org_id = NEW.org_id
      AND classroom.status = 'active'
      AND classroom.classroom_type <> 'homeroom'
      AND creator.status = 'active'
      AND creator.role::text IN ('teacher', 'admin')
      AND (
        classroom.teacher_id = creator.id
        OR EXISTS (
          SELECT 1
          FROM public.classroom_co_teachers co_teacher
          WHERE co_teacher.classroom_id = classroom.id
            AND co_teacher.user_id = creator.id
            AND co_teacher.permission IN ('admin', 'manage')
        )
      )
  ) THEN
    RAISE EXCEPTION 'invalid practice library scope' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_practice_library_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_practice_library_scope
  BEFORE INSERT OR UPDATE ON public.practice_libraries
  FOR EACH ROW EXECUTE FUNCTION public.validate_practice_library_scope();

CREATE FUNCTION public.guard_practice_library_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A library always starts as a draft. This is enforced here (including for
  -- service-role writes) so callers cannot bypass the publish validation by
  -- supplying a lifecycle state or timestamps on INSERT.
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    NEW.published_at := NULL;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' AND EXISTS (
      SELECT 1 FROM public.classrooms classroom
      WHERE classroom.id = OLD.classroom_id
    ) THEN
      RAISE EXCEPTION 'published practice libraries must be closed, not deleted'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'published' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.practice_library_questions membership
        WHERE membership.library_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'practice library needs at least one question before publishing'
          USING ERRCODE = '23514';
      END IF;
      NEW.published_at := COALESCE(OLD.published_at, clock_timestamp());
      NEW.closed_at := NULL;
    ELSIF OLD.status = 'published' AND NEW.status = 'closed' THEN
      NEW.closed_at := clock_timestamp();
    ELSE
      RAISE EXCEPTION 'invalid practice library status transition'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.published_at := OLD.published_at;
    NEW.closed_at := OLD.closed_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_practice_library_lifecycle() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_practice_library_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.practice_libraries
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_library_lifecycle();

CREATE FUNCTION public.guard_practice_library_question_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_library_id uuid := COALESCE(NEW.library_id, OLD.library_id);
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.library_id IS DISTINCT FROM OLD.library_id
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
  ) THEN
    RAISE EXCEPTION 'practice question membership identity is immutable'
      USING ERRCODE = '23514';
  END IF;

  -- Serialize membership changes with publish/close/delete operations on the
  -- parent. Without this lock, a concurrent publish could validate a question
  -- and then race with its deletion before either transaction commits.
  SELECT library.status INTO v_status
  FROM public.practice_libraries library
  WHERE library.id = v_library_id
  FOR UPDATE;

  -- A missing parent is possible only during a cascading parent delete.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'practice question membership is frozen after publishing'
      USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_practice_library_question_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_practice_library_question_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.practice_library_questions
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_library_question_mutation();

ALTER TABLE public.practice_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_library_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_answer_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_libraries_select
  ON public.practice_libraries FOR SELECT TO authenticated
  USING (
    public.current_user_can_read_practice_classroom(classroom_id)
    OR (
      status = 'published'
      AND public.current_user_is_practice_student(classroom_id)
    )
  );

CREATE POLICY practice_libraries_insert
  ON public.practice_libraries FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.current_user_can_manage_practice_classroom(classroom_id)
  );

CREATE POLICY practice_libraries_update
  ON public.practice_libraries FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_practice_classroom(classroom_id))
  WITH CHECK (public.current_user_can_manage_practice_classroom(classroom_id));

CREATE POLICY practice_libraries_delete
  ON public.practice_libraries FOR DELETE TO authenticated
  USING (public.current_user_can_manage_practice_classroom(classroom_id));

CREATE POLICY practice_library_questions_select
  ON public.practice_library_questions FOR SELECT TO authenticated
  USING (public.current_user_can_read_practice_library(library_id));

CREATE POLICY practice_library_questions_insert
  ON public.practice_library_questions FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_manage_practice_library(library_id)
    AND EXISTS (
      SELECT 1 FROM public.practice_libraries library
      WHERE library.id = practice_library_questions.library_id
        AND library.status = 'draft'
    )
    AND EXISTS (
      SELECT 1 FROM public.questions question
      WHERE question.id = question_id
        AND question.is_research_snapshot = false
    )
  );

CREATE POLICY practice_library_questions_update
  ON public.practice_library_questions FOR UPDATE TO authenticated
  USING (
    public.current_user_can_manage_practice_library(library_id)
    AND EXISTS (
      SELECT 1 FROM public.practice_libraries library
      WHERE library.id = practice_library_questions.library_id
        AND library.status = 'draft'
    )
  )
  WITH CHECK (
    public.current_user_can_manage_practice_library(library_id)
    AND EXISTS (
      SELECT 1 FROM public.practice_libraries library
      WHERE library.id = practice_library_questions.library_id
        AND library.status = 'draft'
    )
    AND EXISTS (
      SELECT 1 FROM public.questions question
      WHERE question.id = question_id
        AND question.is_research_snapshot = false
    )
  );

CREATE POLICY practice_library_questions_delete
  ON public.practice_library_questions FOR DELETE TO authenticated
  USING (
    public.current_user_can_manage_practice_library(library_id)
    AND EXISTS (
      SELECT 1 FROM public.practice_libraries library
      WHERE library.id = practice_library_questions.library_id
        AND library.status = 'draft'
    )
  );

CREATE POLICY practice_answer_attempts_select
  ON public.practice_answer_attempts FOR SELECT TO authenticated
  USING (
    public.current_user_can_manage_practice_library(library_id)
    OR public.current_user_can_read_own_practice_progress(library_id, student_id)
  );

REVOKE ALL ON TABLE public.practice_libraries FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.practice_library_questions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.practice_answer_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.practice_libraries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.practice_library_questions TO authenticated;
GRANT SELECT (library_id, student_id, question_id)
  ON TABLE public.practice_answer_attempts TO authenticated;
REVOKE ALL ON TABLE public.practice_libraries FROM service_role;
REVOKE ALL ON TABLE public.practice_library_questions FROM service_role;
GRANT SELECT ON TABLE public.practice_libraries TO service_role;
GRANT SELECT ON TABLE public.practice_library_questions TO service_role;
REVOKE ALL ON TABLE public.practice_answer_attempts FROM service_role;
GRANT SELECT (library_id, student_id, question_id)
  ON TABLE public.practice_answer_attempts TO service_role;

CREATE FUNCTION public.record_practice_answer_attempt(
  p_actor_id uuid,
  p_library_id uuid,
  p_question_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE (
  library_id uuid,
  student_id uuid,
  question_id uuid,
  checked_at timestamptz,
  idempotency_key uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.practice_answer_attempts%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_library_id IS NULL
     OR p_question_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'practice attempt identifiers are required' USING ERRCODE = '22023';
  END IF;

  -- Hold read locks on every authorization row until the append commits. This
  -- prevents a concurrent suspension, roster removal, classroom retirement,
  -- library close, or membership deletion from invalidating the check between
  -- authorization and INSERT.
  PERFORM 1
    FROM public.practice_libraries library
    JOIN public.classrooms classroom
      ON classroom.id = library.classroom_id
     AND classroom.org_id = library.org_id
    JOIN public.classroom_students roster
      ON roster.classroom_id = library.classroom_id
     AND roster.student_id = p_actor_id
    JOIN public.users actor ON actor.id = roster.student_id
    JOIN public.practice_library_questions membership
      ON membership.library_id = library.id
     AND membership.question_id = p_question_id
    WHERE library.id = p_library_id
      AND library.status = 'published'
      AND actor.status = 'active'
      AND actor.role::text = 'student'
      AND classroom.status = 'active'
      AND classroom.classroom_type = 'subject'
    FOR SHARE OF library, classroom, roster, actor, membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice attempt is not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.practice_answer_attempts AS attempt (
    library_id,
    student_id,
    question_id,
    idempotency_key
  ) VALUES (
    p_library_id,
    p_actor_id,
    p_question_id,
    p_idempotency_key
  )
  ON CONFLICT ON CONSTRAINT practice_answer_attempts_idempotency_key DO NOTHING
  RETURNING attempt.* INTO v_attempt;

  IF v_attempt.library_id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_attempt.library_id,
      v_attempt.student_id,
      v_attempt.question_id,
      v_attempt.checked_at,
      v_attempt.idempotency_key,
      true;
    RETURN;
  END IF;

  SELECT attempt.* INTO STRICT v_attempt
  FROM public.practice_answer_attempts attempt
  WHERE attempt.library_id = p_library_id
    AND attempt.student_id = p_actor_id
    AND attempt.idempotency_key = p_idempotency_key;

  IF v_attempt.question_id <> p_question_id THEN
    RAISE EXCEPTION 'idempotency key was already used for another question'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT
    v_attempt.library_id,
    v_attempt.student_id,
    v_attempt.question_id,
    v_attempt.checked_at,
    v_attempt.idempotency_key,
    false;
END;
$$;

COMMENT ON TABLE public.practice_answer_attempts IS
  'Append-only self-practice check metadata. Contains no answer, correctness, score, or feedback.';
COMMENT ON FUNCTION public.record_practice_answer_attempt(uuid, uuid, uuid, uuid) IS
  'Service-only idempotent append. The server grades ephemerally before calling this function.';

REVOKE ALL ON FUNCTION public.record_practice_answer_attempt(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_practice_answer_attempt(uuid, uuid, uuid, uuid)
  TO service_role;
