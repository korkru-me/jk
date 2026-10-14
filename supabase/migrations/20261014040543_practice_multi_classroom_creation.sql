-- A practice library remains classroom-scoped so each room keeps an
-- independent roster and progress view. This atomic creator mirrors the
-- assignment wizard's multi-room targeting: one teacher action creates the
-- same configured library in every selected room, while preserving the first
-- room as the primary destination returned to the browser.

CREATE FUNCTION public.create_practice_libraries_for_classrooms(
  p_org_id uuid,
  p_classroom_ids uuid[],
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
  v_primary_library_id uuid;
  v_library_id uuid;
  v_classroom_id uuid;
  v_classroom_ordinality bigint;
  v_requested_classroom_count integer := cardinality(p_classroom_ids);
  v_allowed_classroom_count integer;
  v_requested_question_count integer := cardinality(p_question_ids);
  v_visible_question_count integer;
  v_title text := btrim(p_title);
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
     OR p_reveal_answer_key IS NULL OR p_publish IS NULL THEN
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
      org_id,
      classroom_id,
      created_by,
      title,
      description,
      reveal_answer_key
    ) VALUES (
      p_org_id,
      v_classroom_id,
      v_actor_id,
      v_title,
      NULLIF(btrim(p_description), ''),
      p_reveal_answer_key
    )
    RETURNING id INTO v_library_id;

    IF v_classroom_ordinality = 1 THEN
      v_primary_library_id := v_library_id;
    END IF;

    INSERT INTO public.practice_library_questions (library_id, question_id, position)
    SELECT v_library_id, requested.question_id, (requested.ordinality - 1)::integer
    FROM unnest(p_question_ids) WITH ORDINALITY AS requested(question_id, ordinality);

    IF p_publish THEN
      UPDATE public.practice_libraries library
      SET status = 'published'
      WHERE library.id = v_library_id;
    END IF;
  END LOOP;

  RETURN v_primary_library_id;
END;
$$;

COMMENT ON FUNCTION public.create_practice_libraries_for_classrooms(
  uuid, uuid[], text, text, boolean, uuid[], boolean
) IS
  'Atomically creates equivalent classroom-scoped practice libraries for every selected classroom and returns the first library id.';

REVOKE ALL ON FUNCTION public.create_practice_libraries_for_classrooms(
  uuid, uuid[], text, text, boolean, uuid[], boolean
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_practice_libraries_for_classrooms(
  uuid, uuid[], text, text, boolean, uuid[], boolean
) TO authenticated;
