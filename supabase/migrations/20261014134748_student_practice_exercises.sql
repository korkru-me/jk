-- Private student-created practice groups. No answers, verdicts or grades.
CREATE TABLE public.student_practice_exercises (
  id uuid PRIMARY KEY,
  library_id uuid NOT NULL REFERENCES public.practice_libraries(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  question_ids uuid[] NOT NULL CHECK (cardinality(question_ids) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_practice_exercises_owner_library
  ON public.student_practice_exercises(student_id, library_id, created_at DESC);
ALTER TABLE public.student_practice_exercises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_practice_exercises FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_practice_exercises TO service_role;

-- The authenticated server boundary supplies actor; SQL rechecks exact access.
-- This narrow service-only definer helper is required to lock existing rows
-- without granting service_role direct UPDATE privileges on protected tables.
CREATE FUNCTION public.assert_student_practice_exercise_access(p_actor_id uuid, p_library_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.practice_libraries l
  JOIN public.classrooms c ON c.id = l.classroom_id AND c.org_id = l.org_id
  JOIN public.classroom_students r ON r.classroom_id = c.id AND r.student_id = p_actor_id
  JOIN public.users u ON u.id = r.student_id
  WHERE l.id = p_library_id AND l.status = 'published'
    AND c.status = 'active' AND c.classroom_type = 'subject'
    AND u.status = 'active' AND u.role::text = 'student'
  FOR SHARE OF l, c, r, u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice exercise access denied' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_student_practice_exercise_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_student_practice_exercise_access(uuid, uuid) TO service_role;

CREATE FUNCTION public.create_student_practice_exercise(
  p_actor_id uuid, p_library_id uuid, p_id uuid, p_title text, p_question_ids uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing public.student_practice_exercises;
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  IF p_id IS NULL OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 120
    OR p_question_ids IS NULL OR cardinality(p_question_ids) NOT BETWEEN 1 AND 500
    OR EXISTS (SELECT 1 FROM unnest(p_question_ids) q WHERE q IS NULL)
    OR (SELECT count(DISTINCT q) FROM unnest(p_question_ids) q) <> cardinality(p_question_ids)
    OR (SELECT count(*) FROM public.practice_library_questions q
        WHERE q.library_id = p_library_id AND q.question_id = ANY(p_question_ids)) <> cardinality(p_question_ids)
  THEN RAISE EXCEPTION 'invalid practice exercise' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.student_practice_exercises(id, library_id, student_id, title, question_ids)
    VALUES(p_id, p_library_id, p_actor_id, btrim(p_title), p_question_ids)
    ON CONFLICT (id) DO NOTHING;
  SELECT * INTO existing FROM public.student_practice_exercises WHERE id = p_id;
  IF existing.student_id <> p_actor_id OR existing.library_id <> p_library_id
    OR existing.title <> btrim(p_title) OR existing.question_ids <> p_question_ids
  THEN RAISE EXCEPTION 'practice exercise conflict' USING ERRCODE = '42501'; END IF;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_student_practice_exercise(uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_student_practice_exercise(uuid, uuid, uuid, text, uuid[]) TO service_role;

CREATE FUNCTION public.list_student_practice_exercises(p_actor_id uuid, p_library_id uuid)
RETURNS TABLE(id uuid, title text, question_ids uuid[], attempted_count bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  RETURN QUERY SELECT e.id, e.title, e.question_ids,
    (SELECT count(DISTINCT a.question_id) FROM public.practice_answer_attempts a
      WHERE a.library_id = p_library_id AND a.student_id = p_actor_id
        AND a.question_id = ANY(e.question_ids))
    FROM public.student_practice_exercises e
    WHERE e.library_id = p_library_id AND e.student_id = p_actor_id
    ORDER BY e.created_at DESC, e.id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_student_practice_exercises(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_practice_exercises(uuid, uuid) TO service_role;

CREATE FUNCTION public.get_student_practice_exercise_questions(
  p_actor_id uuid, p_library_id uuid, p_exercise_id uuid, p_limit integer, p_offset integer
)
RETURNS TABLE(question_id uuid, title text, question_type text, tags text[], "position" integer, attempt_count bigint, total_count bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE ids uuid[];
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  SELECT e.question_ids INTO ids FROM public.student_practice_exercises e
    WHERE e.id = p_exercise_id AND e.library_id = p_library_id AND e.student_id = p_actor_id;
  IF ids IS NULL THEN RAISE EXCEPTION 'practice exercise access denied' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT q.id, q.title, q.question_type::text, q.tags, (chosen.ordinality - 1)::integer,
    (SELECT count(*) FROM public.practice_answer_attempts a WHERE a.library_id = p_library_id
      AND a.student_id = p_actor_id AND a.question_id = q.id), cardinality(ids)::bigint
    FROM unnest(ids) WITH ORDINALITY chosen(id, ordinality)
    JOIN public.practice_library_questions member ON member.library_id = p_library_id AND member.question_id = chosen.id
    JOIN public.questions q ON q.id = member.question_id
    ORDER BY chosen.ordinality LIMIT least(greatest(p_limit, 1), 24) OFFSET greatest(p_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_practice_exercise_questions(uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_practice_exercise_questions(uuid, uuid, uuid, integer, integer) TO service_role;
