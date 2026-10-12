-- Atomic self-practice read and mutation RPCs. Kept in a follow-up migration
-- so environments that already applied the foundation retain ledger parity.

-- The student list is assembled inside the database so the service boundary
-- never has to read raw attempt rows and aggregate them in application code.
-- p_actor_id is deliberately explicit: service_role has no end-user JWT, so
-- every authorization relation is rechecked here before any aggregate leaves.
CREATE FUNCTION public.get_practice_library_student_progress(
  p_actor_id uuid,
  p_library_id uuid
)
RETURNS TABLE (
  student_id uuid,
  display_name text,
  class_number smallint,
  roster_order integer,
  attempted_question_count bigint,
  total_attempt_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
BEGIN
  IF p_actor_id IS NULL OR p_library_id IS NULL THEN
    RAISE EXCEPTION 'practice progress identifiers are required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.users actor ON actor.id = p_actor_id
  WHERE library.id = p_library_id
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
  FOR SHARE OF library, classroom, actor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice progress is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH attempt_totals AS (
    SELECT
      attempt.student_id,
      count(DISTINCT attempt.question_id)::bigint AS attempted_question_count,
      count(*)::bigint AS total_attempt_count
    FROM public.practice_answer_attempts attempt
    WHERE attempt.library_id = p_library_id
    GROUP BY attempt.student_id
  )
  SELECT
    roster.student_id,
    student.full_name,
    profile.class_number,
    roster.roster_order,
    COALESCE(totals.attempted_question_count, 0::bigint),
    COALESCE(totals.total_attempt_count, 0::bigint)
  FROM public.practice_libraries library
  JOIN public.classroom_students roster
    ON roster.classroom_id = library.classroom_id
  JOIN public.users student
    ON student.id = roster.student_id
   AND student.status = 'active'
   AND student.role::text = 'student'
  LEFT JOIN public.student_profiles profile
    ON profile.student_id = roster.student_id
  LEFT JOIN attempt_totals totals
    ON totals.student_id = roster.student_id
  WHERE library.id = p_library_id
  ORDER BY roster.roster_order NULLS LAST,
           profile.class_number NULLS LAST,
           student.full_name,
           roster.student_id;
END;
$$;

COMMENT ON FUNCTION public.get_practice_library_student_progress(uuid, uuid) IS
  'Service-only current-roster aggregate for an authorized practice-library manager.';

REVOKE ALL ON FUNCTION public.get_practice_library_student_progress(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_library_student_progress(uuid, uuid)
  TO service_role;

-- One student's teacher-facing detail has the same narrow vocabulary as the
-- overview: safe question identity, tags and an event count. No event time or
-- answer-bearing question field is returned.
CREATE FUNCTION public.get_practice_student_question_progress(
  p_actor_id uuid,
  p_library_id uuid,
  p_student_id uuid,
  p_query text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  question_id uuid,
  title text,
  tags text[],
  attempt_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_query text := lower(btrim(regexp_replace(COALESCE(p_query, ''), '[[:space:]]+', ' ', 'g')));
  v_pattern text;
BEGIN
  IF p_actor_id IS NULL OR p_library_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'practice progress identifiers are required' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid practice progress page' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_query) > 160 THEN
    RAISE EXCEPTION 'practice progress query is too long' USING ERRCODE = '22023';
  END IF;

  v_pattern := replace(
    replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  );

  PERFORM 1
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.users actor ON actor.id = p_actor_id
  JOIN public.classroom_students roster
    ON roster.classroom_id = classroom.id
   AND roster.student_id = p_student_id
  JOIN public.users student
    ON student.id = roster.student_id
   AND student.status = 'active'
   AND student.role::text = 'student'
  WHERE library.id = p_library_id
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
  FOR SHARE OF library, classroom, actor, roster, student;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice student progress is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH attempt_totals AS (
    SELECT
      attempt.question_id,
      count(*)::bigint AS attempt_count
    FROM public.practice_answer_attempts attempt
    WHERE attempt.library_id = p_library_id
      AND attempt.student_id = p_student_id
    GROUP BY attempt.question_id
  ), matched AS (
    SELECT
      membership.question_id,
      membership.position,
      question.title,
      COALESCE(question.tags, ARRAY[]::text[]) AS tags,
      COALESCE(totals.attempt_count, 0::bigint) AS attempt_count
    FROM public.practice_library_questions membership
    JOIN public.questions question ON question.id = membership.question_id
    LEFT JOIN attempt_totals totals ON totals.question_id = membership.question_id
    WHERE membership.library_id = p_library_id
      AND (
        v_query = ''
        OR question.search_text ILIKE '%' || v_pattern || '%' ESCAPE E'\\'
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(question.tags, ARRAY[]::text[])) question_tag(tag)
          WHERE lower(public.question_tag_display(question_tag.tag))
            ILIKE '%' || v_pattern || '%' ESCAPE E'\\'
        )
      )
  ), numbered AS (
    SELECT
      matched.*,
      count(*) OVER ()::bigint AS total_count
    FROM matched
  )
  SELECT
    numbered.question_id,
    numbered.title,
    numbered.tags,
    numbered.attempt_count,
    numbered.total_count
  FROM numbered
  ORDER BY numbered.position, numbered.question_id
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_practice_student_question_progress(uuid, uuid, uuid, text, integer, integer) IS
  'Service-only paged safe question/count detail for one current roster member.';

REVOKE ALL ON FUNCTION public.get_practice_student_question_progress(uuid, uuid, uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_student_question_progress(uuid, uuid, uuid, text, integer, integer)
  TO service_role;

-- Student library search combines filtering, exact total count and the
-- student's per-question count in one statement. Tags are whole-tag AND
-- matches by their canonical key; LIKE metacharacters in terms stay literal.
CREATE FUNCTION public.search_practice_library_questions(
  p_actor_id uuid,
  p_library_id uuid,
  p_terms text[],
  p_tags text[],
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  question_id uuid,
  "position" integer,
  title text,
  question_type text,
  tags text[],
  attempt_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
BEGIN
  IF p_actor_id IS NULL OR p_library_id IS NULL THEN
    RAISE EXCEPTION 'practice search identifiers are required' USING ERRCODE = '22023';
  END IF;
  IF cardinality(COALESCE(p_terms, ARRAY[]::text[])) > 12
     OR cardinality(COALESCE(p_tags, ARRAY[]::text[])) > 20
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 24
     OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid practice search bounds' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_terms, ARRAY[]::text[])) input_term(term)
    WHERE input_term.term IS NULL
       OR char_length(btrim(regexp_replace(input_term.term, '[[:space:]]+', ' ', 'g'))) NOT BETWEEN 1 AND 160
  ) OR EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) input_tag(tag)
    WHERE input_tag.tag IS NULL
       OR char_length(public.question_tag_display(input_tag.tag)) NOT BETWEEN 1 AND 80
  ) THEN
    RAISE EXCEPTION 'invalid practice search value' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.classroom_students roster
    ON roster.classroom_id = library.classroom_id
   AND roster.student_id = p_actor_id
  JOIN public.users actor ON actor.id = roster.student_id
  WHERE library.id = p_library_id
    AND library.status = 'published'
    AND actor.status = 'active'
    AND actor.role::text = 'student'
    AND classroom.status = 'active'
    AND classroom.classroom_type = 'subject'
  FOR SHARE OF library, classroom, roster, actor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice search is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH normalized_terms AS (
    SELECT DISTINCT
      replace(
        replace(
          replace(
            lower(btrim(regexp_replace(input_term.term, '[[:space:]]+', ' ', 'g'))),
            E'\\', E'\\\\'
          ),
          '%', E'\\%'
        ),
        '_', E'\\_'
      ) AS pattern
    FROM unnest(COALESCE(p_terms, ARRAY[]::text[])) input_term(term)
  ), normalized_tags AS (
    SELECT DISTINCT public.question_tag_key(input_tag.tag) AS tag_key
    FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) input_tag(tag)
  ), attempt_totals AS (
    SELECT
      attempt.question_id,
      count(*)::bigint AS attempt_count
    FROM public.practice_answer_attempts attempt
    WHERE attempt.library_id = p_library_id
      AND attempt.student_id = p_actor_id
    GROUP BY attempt.question_id
  ), matched AS (
    SELECT
      membership.question_id,
      membership.position,
      question.title,
      question.question_type::text AS question_type,
      COALESCE(question.tags, ARRAY[]::text[]) AS tags,
      COALESCE(totals.attempt_count, 0::bigint) AS attempt_count
    FROM public.practice_library_questions membership
    JOIN public.questions question ON question.id = membership.question_id
    LEFT JOIN attempt_totals totals ON totals.question_id = membership.question_id
    WHERE membership.library_id = p_library_id
      AND question.question_type::text IN (
        'mcq',
        'written',
        'matching',
        'true_false',
        'fill_blank',
        'ordering',
        'composite',
        'classify',
        'image_label'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM normalized_terms term
        WHERE question.search_text NOT ILIKE '%' || term.pattern || '%' ESCAPE E'\\'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM normalized_tags selected_tag
        WHERE NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(question.tags, ARRAY[]::text[])) question_tag(tag)
          WHERE public.question_tag_key(question_tag.tag) = selected_tag.tag_key
        )
      )
  ), numbered AS (
    SELECT
      matched.*,
      count(*) OVER ()::bigint AS total_count
    FROM matched
  )
  SELECT
    numbered.question_id,
    numbered.position,
    numbered.title,
    numbered.question_type,
    numbered.tags,
    numbered.attempt_count,
    numbered.total_count
  FROM numbered
  ORDER BY numbered.position, numbered.question_id
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.search_practice_library_questions(uuid, uuid, text[], text[], integer, integer) IS
  'Service-only published-library search with tag/term AND filters and per-question attempt counts.';

REVOKE ALL ON FUNCTION public.search_practice_library_questions(uuid, uuid, text[], text[], integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_practice_library_questions(uuid, uuid, text[], text[], integer, integer)
  TO service_role;

-- The trusted grading record and its library context are selected through the
-- complete student authorization relation in one snapshot. This replaces the
-- former service-client sequence of library, classroom, roster and membership
-- reads, which could observe different states between queries.
CREATE FUNCTION public.get_practice_question_for_student(
  p_actor_id uuid,
  p_library_id uuid,
  p_question_id uuid
)
RETURNS TABLE (
  library_id uuid,
  classroom_id uuid,
  library_title text,
  library_description text,
  reveal_answer_key boolean,
  question_id uuid,
  "position" integer,
  title text,
  question_text text,
  question_type text,
  variables jsonb,
  logic_rules jsonb,
  answer_formula text,
  answer_unit text,
  answer_tolerance numeric,
  answer_parts jsonb,
  mcq_options jsonb,
  tags text[],
  image_urls text[],
  extra_data jsonb,
  is_random boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    library.id,
    library.classroom_id,
    library.title,
    library.description,
    library.reveal_answer_key,
    question.id,
    membership.position,
    question.title,
    question.question_text,
    question.question_type::text,
    question.variables,
    question.logic_rules,
    question.answer_formula,
    question.answer_unit,
    question.answer_tolerance,
    question.answer_parts,
    question.mcq_options,
    COALESCE(question.tags, ARRAY[]::text[]),
    question.image_urls,
    question.extra_data,
    question.is_random
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.classroom_students roster
    ON roster.classroom_id = library.classroom_id
   AND roster.student_id = p_actor_id
  JOIN public.users actor
    ON actor.id = roster.student_id
   AND actor.status = 'active'
   AND actor.role::text = 'student'
  JOIN public.practice_library_questions membership
    ON membership.library_id = library.id
   AND membership.question_id = p_question_id
  JOIN public.questions question ON question.id = membership.question_id
  WHERE library.id = p_library_id
    AND library.status = 'published'
    AND classroom.status = 'active'
    AND classroom.classroom_type = 'subject'
$$;

COMMENT ON FUNCTION public.get_practice_question_for_student(uuid, uuid, uuid) IS
  'Service-only one-statement trusted question read for an active published-library roster member.';

REVOKE ALL ON FUNCTION public.get_practice_question_for_student(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_question_for_student(uuid, uuid, uuid)
  TO service_role;

-- A manager may need to validate or render questions already attached by the
-- library owner even when those source questions are private. Keep that
-- answer-bearing shape behind service_role and derive it only from exact
-- membership after rechecking owner/admin/manage scope in this statement.
CREATE FUNCTION public.get_practice_library_questions_for_manager(
  p_actor_id uuid,
  p_library_id uuid
)
RETURNS TABLE (
  question_id uuid,
  "position" integer,
  created_by uuid,
  org_id uuid,
  title text,
  question_text text,
  question_type text,
  difficulty text,
  subject text,
  variables jsonb,
  logic_rules jsonb,
  answer_formula text,
  answer_unit text,
  answer_tolerance numeric,
  answer_parts jsonb,
  mcq_options jsonb,
  tags text[],
  image_urls text[],
  extra_data jsonb,
  is_random boolean,
  is_research_snapshot boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    question.id,
    membership.position,
    question.created_by,
    question.org_id,
    question.title,
    question.question_text,
    question.question_type::text,
    question.difficulty::text,
    question.subject,
    question.variables,
    question.logic_rules,
    question.answer_formula,
    question.answer_unit,
    question.answer_tolerance,
    question.answer_parts,
    question.mcq_options,
    COALESCE(question.tags, ARRAY[]::text[]),
    question.image_urls,
    question.extra_data,
    question.is_random,
    question.is_research_snapshot
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.users actor
    ON actor.id = p_actor_id
   AND actor.status = 'active'
   AND actor.role::text IN ('teacher', 'admin')
  JOIN public.practice_library_questions membership
    ON membership.library_id = library.id
  JOIN public.questions question ON question.id = membership.question_id
  WHERE library.id = p_library_id
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
  ORDER BY membership.position, membership.question_id
$$;

COMMENT ON FUNCTION public.get_practice_library_questions_for_manager(uuid, uuid) IS
  'Service-only ordered trusted question shapes for an exactly authorized library manager.';

REVOKE ALL ON FUNCTION public.get_practice_library_questions_for_manager(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_library_questions_for_manager(uuid, uuid)
  TO service_role;

-- Tag mutation is deliberately narrower than library management: the caller
-- must manage this exact active subject classroom and must own every selected
-- source question. A single invalid id aborts before the set-based UPDATE.
CREATE FUNCTION public.bulk_update_practice_question_tags(
  p_library_id uuid,
  p_question_ids uuid[],
  p_operation text,
  p_tag text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_locked_library uuid;
  v_requested_count integer;
  v_visible_count integer;
  v_updated_count integer;
  v_tag text := public.question_tag_display(p_tag);
  v_tag_key text := public.question_tag_key(p_tag);
BEGIN
  v_requested_count := cardinality(p_question_ids);
  IF v_actor_id IS NULL OR p_library_id IS NULL THEN
    RAISE EXCEPTION 'authentication and library are required' USING ERRCODE = '42501';
  END IF;
  IF p_question_ids IS NULL OR v_requested_count < 1 OR v_requested_count > 1000
     OR EXISTS (SELECT 1 FROM unnest(p_question_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_question_ids) requested(id)) <> v_requested_count THEN
    RAISE EXCEPTION 'invalid practice question selection' USING ERRCODE = '22023';
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('add', 'remove')
     OR v_tag IS NULL OR char_length(v_tag) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid practice tag operation' USING ERRCODE = '22023';
  END IF;

  SELECT library.id INTO v_locked_library
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.users actor ON actor.id = v_actor_id
  WHERE library.id = p_library_id
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
  FOR UPDATE OF library;

  IF v_locked_library IS NULL THEN
    RAISE EXCEPTION 'practice tag update is not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.questions question
  JOIN public.practice_library_questions membership
    ON membership.question_id = question.id
   AND membership.library_id = p_library_id
  WHERE question.id = ANY(p_question_ids)
    AND question.created_by = v_actor_id
    AND question.is_research_snapshot = false
  FOR UPDATE OF question;
  GET DIAGNOSTICS v_visible_count = ROW_COUNT;

  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'practice tag selection is not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.questions question
  SET tags = (
    SELECT
      COALESCE(
        array_agg(existing.display_tag ORDER BY existing.first_ordinal),
        ARRAY[]::text[]
      ) || CASE
        WHEN p_operation = 'add' AND NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(question.tags, ARRAY[]::text[])) raw_tag(tag)
          WHERE public.question_tag_key(raw_tag.tag) = v_tag_key
        ) THEN ARRAY[v_tag]
        ELSE ARRAY[]::text[]
      END
    FROM (
      SELECT
        public.question_tag_key(tag_item.tag) AS tag_key,
        (array_agg(public.question_tag_display(tag_item.tag) ORDER BY tag_item.ordinality))[1]
          AS display_tag,
        min(tag_item.ordinality) AS first_ordinal
      FROM unnest(COALESCE(question.tags, ARRAY[]::text[]))
        WITH ORDINALITY AS tag_item(tag, ordinality)
      WHERE public.question_tag_display(tag_item.tag) <> ''
        AND (
          p_operation <> 'remove'
          OR public.question_tag_key(tag_item.tag) <> v_tag_key
        )
      GROUP BY public.question_tag_key(tag_item.tag)
    ) existing
  )
  WHERE question.id = ANY(p_question_ids);
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> v_requested_count THEN
    RAISE EXCEPTION 'practice tag update was incomplete' USING ERRCODE = '40001';
  END IF;
  RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_practice_question_tags(uuid, uuid[], text, text) IS
  'Authenticated atomic tag add/remove for owned questions that are current members of an exactly managed library.';

REVOKE ALL ON FUNCTION public.bulk_update_practice_question_tags(uuid, uuid[], text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_update_practice_question_tags(uuid, uuid[], text, text)
  TO authenticated;

-- Replacement is a definer because a co-manager must be able to preserve and
-- reorder owner-private questions already attached to this exact library.
-- New ids still need the same owner/public/org/share visibility that question
-- RLS grants a teacher; merely guessing a UUID is never enough. The parent row
-- lock serializes this replacement with publish and every row trigger.
CREATE FUNCTION public.replace_draft_practice_library_questions(
  p_library_id uuid,
  p_question_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_status text;
  v_requested_count integer := cardinality(p_question_ids);
  v_visible_count integer;
BEGIN
  IF v_actor_id IS NULL OR p_library_id IS NULL THEN
    RAISE EXCEPTION 'authentication and library are required' USING ERRCODE = '42501';
  END IF;
  IF p_question_ids IS NULL OR v_requested_count > 1000
     OR EXISTS (SELECT 1 FROM unnest(p_question_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_question_ids) requested(id)) <> v_requested_count THEN
    RAISE EXCEPTION 'invalid practice question selection' USING ERRCODE = '22023';
  END IF;

  SELECT library.status INTO v_status
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  WHERE library.id = p_library_id
    AND public.current_user_can_manage_practice_classroom(classroom.id)
  FOR UPDATE OF library;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'practice membership replacement is not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'practice question membership is frozen after publishing'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.questions question
  WHERE question.id = ANY(p_question_ids)
    AND question.is_research_snapshot = false
    AND (
      EXISTS (
        SELECT 1
        FROM public.practice_library_questions existing_membership
        WHERE existing_membership.library_id = p_library_id
          AND existing_membership.question_id = question.id
      )
      OR question.created_by = v_actor_id
      OR question.visibility::text = 'public'
      OR (
        question.visibility::text IN ('school', 'organization')
        AND question.org_id IS NOT NULL
        AND question.org_id = ANY(
          COALESCE(public.get_user_org_ids(), ARRAY[]::uuid[])
        )
      )
      OR public.question_shared_with_my_orgs(question.id)
    )
  FOR SHARE OF question;
  GET DIAGNOSTICS v_visible_count = ROW_COUNT;
  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'practice question selection is not allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.practice_library_questions membership
  WHERE membership.library_id = p_library_id;

  INSERT INTO public.practice_library_questions (library_id, question_id, position)
  SELECT p_library_id, requested.question_id, (requested.ordinality - 1)::integer
  FROM unnest(p_question_ids) WITH ORDINALITY AS requested(question_id, ordinality);

  RETURN v_requested_count;
END;
$$;

COMMENT ON FUNCTION public.replace_draft_practice_library_questions(uuid, uuid[]) IS
  'Authenticated atomic replacement of an authorized draft library question order.';

REVOKE ALL ON FUNCTION public.replace_draft_practice_library_questions(uuid, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_draft_practice_library_questions(uuid, uuid[])
  TO authenticated;

-- Creation uses the same invoker/RLS boundary as ordinary authenticated table
-- writes, but keeps the parent, memberships and optional publish transition in
-- one statement transaction so callers never need compensating deletion.
CREATE FUNCTION public.create_practice_library(
  p_org_id uuid,
  p_classroom_id uuid,
  p_title text,
  p_description text,
  p_reveal_answer_key boolean,
  p_question_ids uuid[],
  p_publish boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_library_id uuid;
  v_requested_count integer := cardinality(p_question_ids);
  v_visible_count integer;
  v_title text := btrim(p_title);
BEGIN
  IF v_actor_id IS NULL OR p_org_id IS NULL OR p_classroom_id IS NULL THEN
    RAISE EXCEPTION 'authentication and library scope are required' USING ERRCODE = '42501';
  END IF;
  IF v_title IS NULL OR char_length(v_title) NOT BETWEEN 1 AND 160
     OR (p_description IS NOT NULL AND char_length(p_description) > 2000)
     OR p_reveal_answer_key IS NULL OR p_publish IS NULL THEN
    RAISE EXCEPTION 'invalid practice library fields' USING ERRCODE = '22023';
  END IF;
  IF p_question_ids IS NULL OR v_requested_count > 1000
     OR EXISTS (SELECT 1 FROM unnest(p_question_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_question_ids) requested(id)) <> v_requested_count
     OR (p_publish AND v_requested_count = 0) THEN
    RAISE EXCEPTION 'invalid practice question selection' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.classrooms classroom
  WHERE classroom.id = p_classroom_id
    AND classroom.org_id = p_org_id
    AND public.current_user_can_manage_practice_classroom(classroom.id)
  FOR SHARE OF classroom;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice library creation is not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.questions question
  WHERE question.id = ANY(p_question_ids)
    AND question.is_research_snapshot = false;
  GET DIAGNOSTICS v_visible_count = ROW_COUNT;
  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'practice question selection is not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.practice_libraries (
    org_id,
    classroom_id,
    created_by,
    title,
    description,
    reveal_answer_key
  ) VALUES (
    p_org_id,
    p_classroom_id,
    v_actor_id,
    v_title,
    NULLIF(btrim(p_description), ''),
    p_reveal_answer_key
  )
  RETURNING id INTO v_library_id;

  INSERT INTO public.practice_library_questions (library_id, question_id, position)
  SELECT v_library_id, requested.question_id, (requested.ordinality - 1)::integer
  FROM unnest(p_question_ids) WITH ORDINALITY AS requested(question_id, ordinality);

  IF p_publish THEN
    UPDATE public.practice_libraries library
    SET status = 'published'
    WHERE library.id = v_library_id;
  END IF;

  RETURN v_library_id;
END;
$$;

COMMENT ON FUNCTION public.create_practice_library(uuid, uuid, text, text, boolean, uuid[], boolean) IS
  'Authenticated atomic creation of a draft or immediately published practice library.';

REVOKE ALL ON FUNCTION public.create_practice_library(uuid, uuid, text, text, boolean, uuid[], boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_practice_library(uuid, uuid, text, text, boolean, uuid[], boolean)
  TO authenticated;

-- Duplication is source-aware so an authorized co-manager can copy the exact
-- owner-private membership without gaining a general private-question read or
-- attaching a guessed UUID. The copy always starts as a draft owned by the
-- caller and keeps source order inside the same transaction.
CREATE FUNCTION public.duplicate_practice_library(
  p_source_library_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source public.practice_libraries%ROWTYPE;
  v_library_id uuid;
  v_question_count integer;
  v_valid_count integer;
  v_suffix constant text := ' (สำเนา)';
BEGIN
  IF v_actor_id IS NULL OR p_source_library_id IS NULL THEN
    RAISE EXCEPTION 'authentication and source library are required' USING ERRCODE = '42501';
  END IF;

  SELECT library.* INTO v_source
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  JOIN public.users actor ON actor.id = v_actor_id
  WHERE library.id = p_source_library_id
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
  FOR SHARE OF library, classroom, actor;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'practice library duplication is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_question_count
  FROM public.practice_library_questions membership
  WHERE membership.library_id = v_source.id;
  IF v_question_count > 1000 THEN
    RAISE EXCEPTION 'source practice library has too many questions' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.practice_library_questions membership
  JOIN public.questions question ON question.id = membership.question_id
  WHERE membership.library_id = v_source.id
    AND question.is_research_snapshot = false
  FOR SHARE OF membership, question;
  GET DIAGNOSTICS v_valid_count = ROW_COUNT;
  IF v_valid_count <> v_question_count THEN
    RAISE EXCEPTION 'source practice membership is not valid' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.practice_libraries (
    org_id,
    classroom_id,
    created_by,
    title,
    description,
    reveal_answer_key
  ) VALUES (
    v_source.org_id,
    v_source.classroom_id,
    v_actor_id,
    left(v_source.title, 160 - char_length(v_suffix)) || v_suffix,
    v_source.description,
    v_source.reveal_answer_key
  )
  RETURNING id INTO v_library_id;

  INSERT INTO public.practice_library_questions (library_id, question_id, position)
  SELECT v_library_id, membership.question_id, membership.position
  FROM public.practice_library_questions membership
  WHERE membership.library_id = v_source.id
  ORDER BY membership.position, membership.question_id;

  RETURN v_library_id;
END;
$$;

COMMENT ON FUNCTION public.duplicate_practice_library(uuid) IS
  'Authenticated atomic draft copy sourced only from an exactly managed practice library.';

REVOKE ALL ON FUNCTION public.duplicate_practice_library(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_practice_library(uuid)
  TO authenticated;

-- Draft editing is a single database statement: metadata cannot commit unless
-- the validated membership replacement and its exact order commit as well.
-- Published/closed metadata continues through the existing direct UPDATE path;
-- this RPC intentionally refuses those states because their membership is
-- frozen and its name promises draft semantics.
CREATE FUNCTION public.update_practice_library_draft(
  p_library_id uuid,
  p_title text,
  p_description text,
  p_reveal_answer_key boolean,
  p_question_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_status text;
  v_requested_count integer := cardinality(p_question_ids);
  v_visible_count integer;
  v_title text := btrim(p_title);
BEGIN
  IF v_actor_id IS NULL OR p_library_id IS NULL THEN
    RAISE EXCEPTION 'authentication and library are required' USING ERRCODE = '42501';
  END IF;
  IF v_title IS NULL OR char_length(v_title) NOT BETWEEN 1 AND 160
     OR (p_description IS NOT NULL AND char_length(p_description) > 2000)
     OR p_reveal_answer_key IS NULL THEN
    RAISE EXCEPTION 'invalid practice library fields' USING ERRCODE = '22023';
  END IF;
  IF p_question_ids IS NULL OR v_requested_count > 1000
     OR EXISTS (SELECT 1 FROM unnest(p_question_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_question_ids) requested(id)) <> v_requested_count THEN
    RAISE EXCEPTION 'invalid practice question selection' USING ERRCODE = '22023';
  END IF;

  SELECT library.status INTO v_status
  FROM public.practice_libraries library
  JOIN public.classrooms classroom
    ON classroom.id = library.classroom_id
   AND classroom.org_id = library.org_id
  WHERE library.id = p_library_id
    AND public.current_user_can_manage_practice_classroom(classroom.id)
  FOR UPDATE OF library;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'practice draft update is not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'only a draft practice library can use atomic membership update'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.questions question
  WHERE question.id = ANY(p_question_ids)
    AND question.is_research_snapshot = false
    AND (
      EXISTS (
        SELECT 1
        FROM public.practice_library_questions existing_membership
        WHERE existing_membership.library_id = p_library_id
          AND existing_membership.question_id = question.id
      )
      OR question.created_by = v_actor_id
      OR question.visibility::text = 'public'
      OR (
        question.visibility::text IN ('school', 'organization')
        AND question.org_id IS NOT NULL
        AND question.org_id = ANY(
          COALESCE(public.get_user_org_ids(), ARRAY[]::uuid[])
        )
      )
      OR public.question_shared_with_my_orgs(question.id)
    )
  FOR SHARE OF question;
  GET DIAGNOSTICS v_visible_count = ROW_COUNT;
  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'practice question selection is not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.practice_libraries library
  SET title = v_title,
      description = NULLIF(btrim(p_description), ''),
      reveal_answer_key = p_reveal_answer_key
  WHERE library.id = p_library_id;

  DELETE FROM public.practice_library_questions membership
  WHERE membership.library_id = p_library_id;

  INSERT INTO public.practice_library_questions (library_id, question_id, position)
  SELECT p_library_id, requested.question_id, (requested.ordinality - 1)::integer
  FROM unnest(p_question_ids) WITH ORDINALITY AS requested(question_id, ordinality);

  RETURN v_requested_count;
END;
$$;

COMMENT ON FUNCTION public.update_practice_library_draft(uuid, text, text, boolean, uuid[]) IS
  'Authenticated atomic metadata and membership update for an exactly managed draft library.';

REVOKE ALL ON FUNCTION public.update_practice_library_draft(uuid, text, text, boolean, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_practice_library_draft(uuid, text, text, boolean, uuid[])
  TO authenticated;
