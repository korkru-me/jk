-- Persist the self-practice controls that are visible in the teacher wizard.
-- Access codes never cross the student read RPC; the application verifies them
-- server-side and issues a short-lived signed HttpOnly session cookie.
ALTER TABLE public.practice_libraries
  ADD COLUMN access_code text,
  ADD COLUMN calculator_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN scratchpad_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN shuffle_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN shuffle_options boolean NOT NULL DEFAULT true;

ALTER TABLE public.practice_libraries
  ADD CONSTRAINT practice_libraries_access_code_check CHECK (
    access_code IS NULL
    OR (access_code = btrim(access_code) AND char_length(access_code) BETWEEN 1 AND 100)
  );

DROP FUNCTION public.create_practice_libraries_for_classrooms(
  uuid, uuid[], text, text, boolean, uuid[], boolean
);

CREATE FUNCTION public.create_practice_libraries_for_classrooms(
  p_org_id uuid,
  p_classroom_ids uuid[],
  p_title text,
  p_description text,
  p_reveal_answer_key boolean,
  p_access_code text,
  p_calculator_enabled boolean,
  p_scratchpad_enabled boolean,
  p_shuffle_questions boolean,
  p_shuffle_options boolean,
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
  v_primary_library_id uuid;
  v_library_id uuid;
  v_classroom_id uuid;
  v_classroom_ordinality bigint;
  v_requested_classroom_count integer := cardinality(p_classroom_ids);
  v_allowed_classroom_count integer;
  v_requested_question_count integer := cardinality(p_question_ids);
  v_visible_question_count integer;
  v_title text := btrim(p_title);
  v_access_code text := NULLIF(btrim(p_access_code), '');
BEGIN
  IF v_actor_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'authentication and library scope are required' USING ERRCODE = '42501';
  END IF;
  IF p_classroom_ids IS NULL OR v_requested_classroom_count NOT BETWEEN 1 AND 50
     OR EXISTS (SELECT 1 FROM unnest(p_classroom_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_classroom_ids) requested(id))
        <> v_requested_classroom_count THEN
    RAISE EXCEPTION 'invalid practice classroom selection' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL OR char_length(v_title) NOT BETWEEN 1 AND 160
     OR (p_description IS NOT NULL AND char_length(p_description) > 2000)
     OR p_reveal_answer_key IS NULL
     OR p_calculator_enabled IS NULL
     OR p_scratchpad_enabled IS NULL
     OR p_shuffle_questions IS NULL
     OR p_shuffle_options IS NULL
     OR (v_access_code IS NOT NULL AND char_length(v_access_code) > 100)
     OR p_publish IS NULL THEN
    RAISE EXCEPTION 'invalid practice library fields' USING ERRCODE = '22023';
  END IF;
  IF p_question_ids IS NULL OR v_requested_question_count > 1000
     OR EXISTS (SELECT 1 FROM unnest(p_question_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_question_ids) requested(id))
        <> v_requested_question_count
     OR (p_publish AND v_requested_question_count = 0) THEN
    RAISE EXCEPTION 'invalid practice question selection' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.classrooms classroom
  WHERE classroom.id = ANY(p_classroom_ids)
    AND classroom.org_id = p_org_id
    AND classroom.status = 'active'
    AND classroom.classroom_type <> 'homeroom'
    AND public.current_user_can_manage_practice_classroom(classroom.id)
  FOR SHARE OF classroom;
  GET DIAGNOSTICS v_allowed_classroom_count = ROW_COUNT;
  IF v_allowed_classroom_count <> v_requested_classroom_count THEN
    RAISE EXCEPTION 'practice library creation is not allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.questions question
  WHERE question.id = ANY(p_question_ids)
    AND question.is_research_snapshot = false;
  GET DIAGNOSTICS v_visible_question_count = ROW_COUNT;
  IF v_visible_question_count <> v_requested_question_count THEN
    RAISE EXCEPTION 'practice question selection is not allowed' USING ERRCODE = '42501';
  END IF;

  FOR v_classroom_id, v_classroom_ordinality IN
    SELECT requested.classroom_id, requested.ordinality
    FROM unnest(p_classroom_ids) WITH ORDINALITY AS requested(classroom_id, ordinality)
    ORDER BY requested.ordinality
  LOOP
    INSERT INTO public.practice_libraries (
      org_id, classroom_id, created_by, title, description, reveal_answer_key,
      access_code, calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options
    ) VALUES (
      p_org_id, v_classroom_id, v_actor_id, v_title, NULLIF(btrim(p_description), ''),
      p_reveal_answer_key, v_access_code, p_calculator_enabled, p_scratchpad_enabled,
      p_shuffle_questions, p_shuffle_options
    )
    RETURNING id INTO v_library_id;

    IF v_classroom_ordinality = 1 THEN v_primary_library_id := v_library_id; END IF;

    INSERT INTO public.practice_library_questions (library_id, question_id, position)
    SELECT v_library_id, requested.question_id, (requested.ordinality - 1)::integer
    FROM unnest(p_question_ids) WITH ORDINALITY AS requested(question_id, ordinality);

    IF p_publish THEN
      UPDATE public.practice_libraries SET status = 'published' WHERE id = v_library_id;
    END IF;
  END LOOP;
  RETURN v_primary_library_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_practice_libraries_for_classrooms(
  uuid, uuid[], text, text, boolean, text, boolean, boolean, boolean, boolean, uuid[], boolean
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_practice_libraries_for_classrooms(
  uuid, uuid[], text, text, boolean, text, boolean, boolean, boolean, boolean, uuid[], boolean
) TO authenticated;

DROP FUNCTION public.update_practice_library_draft(uuid, text, text, boolean, uuid[]);

CREATE FUNCTION public.update_practice_library_draft(
  p_library_id uuid,
  p_title text,
  p_description text,
  p_reveal_answer_key boolean,
  p_access_code text,
  p_calculator_enabled boolean,
  p_scratchpad_enabled boolean,
  p_shuffle_questions boolean,
  p_shuffle_options boolean,
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
  v_access_code text := NULLIF(btrim(p_access_code), '');
BEGIN
  IF v_actor_id IS NULL OR p_library_id IS NULL THEN
    RAISE EXCEPTION 'authentication and library are required' USING ERRCODE = '42501';
  END IF;
  IF v_title IS NULL OR char_length(v_title) NOT BETWEEN 1 AND 160
     OR (p_description IS NOT NULL AND char_length(p_description) > 2000)
     OR p_reveal_answer_key IS NULL
     OR p_calculator_enabled IS NULL
     OR p_scratchpad_enabled IS NULL
     OR p_shuffle_questions IS NULL
     OR p_shuffle_options IS NULL
     OR (v_access_code IS NOT NULL AND char_length(v_access_code) > 100) THEN
    RAISE EXCEPTION 'invalid practice library fields' USING ERRCODE = '22023';
  END IF;
  IF p_question_ids IS NULL OR v_requested_count > 1000
     OR EXISTS (SELECT 1 FROM unnest(p_question_ids) requested(id) WHERE requested.id IS NULL)
     OR (SELECT count(DISTINCT requested.id) FROM unnest(p_question_ids) requested(id)) <> v_requested_count THEN
    RAISE EXCEPTION 'invalid practice question selection' USING ERRCODE = '22023';
  END IF;

  SELECT library.status INTO v_status
  FROM public.practice_libraries library
  JOIN public.classrooms classroom ON classroom.id = library.classroom_id AND classroom.org_id = library.org_id
  WHERE library.id = p_library_id
    AND public.current_user_can_manage_practice_classroom(classroom.id)
  FOR UPDATE OF library;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'practice draft update is not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'only a draft practice library can use atomic membership update' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.questions question
  WHERE question.id = ANY(p_question_ids)
    AND question.is_research_snapshot = false
    AND (
      EXISTS (
        SELECT 1 FROM public.practice_library_questions existing_membership
        WHERE existing_membership.library_id = p_library_id
          AND existing_membership.question_id = question.id
      )
      OR question.created_by = v_actor_id
      OR question.visibility::text = 'public'
      OR (question.visibility::text IN ('school', 'organization')
        AND question.org_id IS NOT NULL
        AND question.org_id = ANY(COALESCE(public.get_user_org_ids(), ARRAY[]::uuid[])))
      OR public.question_shared_with_my_orgs(question.id)
    )
  FOR SHARE OF question;
  GET DIAGNOSTICS v_visible_count = ROW_COUNT;
  IF v_visible_count <> v_requested_count THEN
    RAISE EXCEPTION 'practice question selection is not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.practice_libraries
  SET title = v_title,
      description = NULLIF(btrim(p_description), ''),
      reveal_answer_key = p_reveal_answer_key,
      access_code = v_access_code,
      calculator_enabled = p_calculator_enabled,
      scratchpad_enabled = p_scratchpad_enabled,
      shuffle_questions = p_shuffle_questions,
      shuffle_options = p_shuffle_options
  WHERE id = p_library_id;

  DELETE FROM public.practice_library_questions WHERE library_id = p_library_id;
  INSERT INTO public.practice_library_questions (library_id, question_id, position)
  SELECT p_library_id, requested.question_id, (requested.ordinality - 1)::integer
  FROM unnest(p_question_ids) WITH ORDINALITY AS requested(question_id, ordinality);
  RETURN v_requested_count;
END;
$$;

REVOKE ALL ON FUNCTION public.update_practice_library_draft(
  uuid, text, text, boolean, text, boolean, boolean, boolean, boolean, uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_practice_library_draft(
  uuid, text, text, boolean, text, boolean, boolean, boolean, boolean, uuid[]
) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_practice_library_questions(
  p_actor_id uuid,
  p_library_id uuid,
  p_terms text[],
  p_tags text[],
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  question_id uuid, "position" integer, title text, question_type text, tags text[],
  attempt_count bigint, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_shuffle_questions boolean;
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
    SELECT 1 FROM unnest(COALESCE(p_terms, ARRAY[]::text[])) input_term(term)
    WHERE input_term.term IS NULL
      OR char_length(btrim(regexp_replace(input_term.term, '[[:space:]]+', ' ', 'g'))) NOT BETWEEN 1 AND 160
  ) OR EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) input_tag(tag)
    WHERE input_tag.tag IS NULL
      OR char_length(public.question_tag_display(input_tag.tag)) NOT BETWEEN 1 AND 80
  ) THEN
    RAISE EXCEPTION 'invalid practice search value' USING ERRCODE = '22023';
  END IF;

  SELECT library.shuffle_questions INTO v_shuffle_questions
  FROM public.practice_libraries library
  JOIN public.classrooms classroom ON classroom.id = library.classroom_id AND classroom.org_id = library.org_id
  JOIN public.classroom_students roster ON roster.classroom_id = library.classroom_id AND roster.student_id = p_actor_id
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
    SELECT DISTINCT replace(replace(replace(
      lower(btrim(regexp_replace(input_term.term, '[[:space:]]+', ' ', 'g'))),
      E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') AS pattern
    FROM unnest(COALESCE(p_terms, ARRAY[]::text[])) input_term(term)
  ), normalized_tags AS (
    SELECT DISTINCT public.question_tag_key(input_tag.tag) AS tag_key
    FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) input_tag(tag)
  ), attempt_totals AS (
    SELECT attempt.question_id, count(*)::bigint AS attempt_count
    FROM public.practice_answer_attempts attempt
    WHERE attempt.library_id = p_library_id AND attempt.student_id = p_actor_id
    GROUP BY attempt.question_id
  ), matched AS (
    SELECT membership.question_id, membership.position, question.title,
      question.question_type::text AS question_type,
      COALESCE(question.tags, ARRAY[]::text[]) AS tags,
      COALESCE(totals.attempt_count, 0::bigint) AS attempt_count
    FROM public.practice_library_questions membership
    JOIN public.questions question ON question.id = membership.question_id
    LEFT JOIN attempt_totals totals ON totals.question_id = membership.question_id
    WHERE membership.library_id = p_library_id
      AND question.question_type::text IN (
        'mcq','written','matching','true_false','fill_blank','ordering','composite','classify','image_label'
      )
      AND NOT EXISTS (
        SELECT 1 FROM normalized_terms term
        WHERE question.search_text NOT ILIKE '%' || term.pattern || '%' ESCAPE E'\\'
      )
      AND NOT EXISTS (
        SELECT 1 FROM normalized_tags selected_tag
        WHERE NOT EXISTS (
          SELECT 1 FROM unnest(COALESCE(question.tags, ARRAY[]::text[])) question_tag(tag)
          WHERE public.question_tag_key(question_tag.tag) = selected_tag.tag_key
        )
      )
  ), numbered AS (
    SELECT matched.*,
      CASE WHEN v_shuffle_questions THEN
        (row_number() OVER (
          ORDER BY md5(p_actor_id::text || ':' || matched.question_id::text), matched.question_id
        ) - 1)::integer
      ELSE matched.position END AS display_position,
      count(*) OVER ()::bigint AS total_count
    FROM matched
  )
  SELECT numbered.question_id, numbered.display_position, numbered.title,
    numbered.question_type, numbered.tags, numbered.attempt_count, numbered.total_count
  FROM numbered
  ORDER BY numbered.display_position, numbered.question_id
  LIMIT p_limit OFFSET p_offset;
END;
$$;

DROP FUNCTION public.get_practice_question_for_student(uuid, uuid, uuid);

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
  requires_access_code boolean,
  calculator_enabled boolean,
  scratchpad_enabled boolean,
  shuffle_options boolean,
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
  SELECT library.id, library.classroom_id, library.title, library.description,
    library.reveal_answer_key, library.access_code IS NOT NULL,
    library.calculator_enabled, library.scratchpad_enabled, library.shuffle_options,
    question.id, membership.position, question.title, question.question_text,
    question.question_type::text, question.variables, question.logic_rules,
    question.answer_formula, question.answer_unit, question.answer_tolerance,
    question.answer_parts, question.mcq_options, COALESCE(question.tags, ARRAY[]::text[]),
    question.image_urls, question.extra_data, question.is_random
  FROM public.practice_libraries library
  JOIN public.classrooms classroom ON classroom.id = library.classroom_id AND classroom.org_id = library.org_id
  JOIN public.classroom_students roster ON roster.classroom_id = library.classroom_id AND roster.student_id = p_actor_id
  JOIN public.users actor ON actor.id = roster.student_id AND actor.status = 'active' AND actor.role::text = 'student'
  JOIN public.practice_library_questions membership ON membership.library_id = library.id AND membership.question_id = p_question_id
  JOIN public.questions question ON question.id = membership.question_id
  WHERE library.id = p_library_id
    AND library.status = 'published'
    AND classroom.status = 'active'
    AND classroom.classroom_type = 'subject'
$$;

REVOKE ALL ON FUNCTION public.get_practice_question_for_student(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_question_for_student(uuid, uuid, uuid)
  TO service_role;

-- A duplicate is expected to preserve every student-facing setting while
-- remaining a draft owned by the actor.
CREATE OR REPLACE FUNCTION public.duplicate_practice_library(
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
    org_id, classroom_id, created_by, title, description, reveal_answer_key,
    access_code, calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options
  ) VALUES (
    v_source.org_id, v_source.classroom_id, v_actor_id,
    left(v_source.title, 160 - char_length(v_suffix)) || v_suffix,
    v_source.description, v_source.reveal_answer_key, v_source.access_code,
    v_source.calculator_enabled, v_source.scratchpad_enabled,
    v_source.shuffle_questions, v_source.shuffle_options
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
