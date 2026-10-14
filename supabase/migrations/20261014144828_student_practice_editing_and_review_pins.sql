-- Personal exercise editing and review pins; no answer or grading data.
ALTER TABLE public.student_practice_exercises
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE FUNCTION public.update_student_practice_exercise(
  p_actor_id uuid, p_library_id uuid, p_id uuid, p_title text,
  p_question_ids uuid[], p_expected_revision integer
)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing public.student_practice_exercises;
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  SELECT * INTO existing FROM public.student_practice_exercises e
    WHERE e.id = p_id AND e.library_id = p_library_id AND e.student_id = p_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'practice exercise access denied' USING ERRCODE = '42501'; END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 120
    OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR p_question_ids IS NULL OR cardinality(p_question_ids) NOT BETWEEN 1 AND 500
    OR EXISTS (SELECT 1 FROM unnest(p_question_ids) q WHERE q IS NULL)
    OR (SELECT count(DISTINCT q) FROM unnest(p_question_ids) q) <> cardinality(p_question_ids)
    OR (SELECT count(*) FROM public.practice_library_questions q
        WHERE q.library_id = p_library_id AND q.question_id = ANY(p_question_ids)) <> cardinality(p_question_ids)
  THEN RAISE EXCEPTION 'invalid practice exercise' USING ERRCODE = '22023'; END IF;
  -- A retry of an already accepted payload must not create another revision.
  IF existing.title = btrim(p_title) AND existing.question_ids = p_question_ids THEN RETURN existing.revision; END IF;
  IF existing.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'practice exercise changed' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.student_practice_exercises SET title = btrim(p_title), question_ids = p_question_ids,
    revision = revision + 1, updated_at = clock_timestamp() WHERE id = existing.id;
  RETURN existing.revision + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.update_student_practice_exercise(uuid, uuid, uuid, text, uuid[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_practice_exercise(uuid, uuid, uuid, text, uuid[], integer) TO service_role;

DROP FUNCTION public.list_student_practice_exercises(uuid, uuid);
CREATE FUNCTION public.list_student_practice_exercises(p_actor_id uuid, p_library_id uuid)
RETURNS TABLE(id uuid, title text, question_ids uuid[], attempted_count bigint, revision integer, question_titles jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  RETURN QUERY SELECT e.id, e.title, e.question_ids,
    (SELECT count(DISTINCT a.question_id) FROM public.practice_answer_attempts a
      WHERE a.library_id = p_library_id AND a.student_id = p_actor_id AND a.question_id = ANY(e.question_ids)),
    e.revision,
    (SELECT jsonb_object_agg(q.id::text, q.title) FROM public.questions q WHERE q.id = ANY(e.question_ids))
    FROM public.student_practice_exercises e
    WHERE e.library_id = p_library_id AND e.student_id = p_actor_id
    ORDER BY e.created_at DESC, e.id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_student_practice_exercises(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_practice_exercises(uuid, uuid) TO service_role;

CREATE TABLE public.student_practice_review_pins (
  library_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (library_id, student_id, question_id),
  FOREIGN KEY (library_id, question_id) REFERENCES public.practice_library_questions(library_id, question_id) ON DELETE CASCADE
);
CREATE INDEX student_practice_review_pins_student_idx ON public.student_practice_review_pins(student_id);
CREATE INDEX student_practice_review_pins_member_idx ON public.student_practice_review_pins(library_id, question_id);
ALTER TABLE public.student_practice_review_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_practice_review_pins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.student_practice_review_pins TO service_role;

CREATE FUNCTION public.set_student_practice_review_pin(
  p_actor_id uuid, p_library_id uuid, p_question_id uuid, p_pinned boolean
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  IF p_question_id IS NULL OR p_pinned IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.practice_library_questions WHERE library_id = p_library_id AND question_id = p_question_id
  ) THEN RAISE EXCEPTION 'invalid practice review pin' USING ERRCODE = '22023'; END IF;
  IF p_pinned THEN
    INSERT INTO public.student_practice_review_pins(library_id, student_id, question_id)
      VALUES (p_library_id, p_actor_id, p_question_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.student_practice_review_pins
      WHERE library_id = p_library_id AND student_id = p_actor_id AND question_id = p_question_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_student_practice_review_pin(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_practice_review_pin(uuid, uuid, uuid, boolean) TO service_role;

CREATE FUNCTION public.list_student_practice_review_pins(p_actor_id uuid, p_library_id uuid)
RETURNS TABLE(question_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  RETURN QUERY SELECT pin.question_id FROM public.student_practice_review_pins pin
    WHERE pin.library_id = p_library_id AND pin.student_id = p_actor_id ORDER BY pin.created_at DESC, pin.question_id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_student_practice_review_pins(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_practice_review_pins(uuid, uuid) TO service_role;

CREATE FUNCTION public.search_student_practice_review_questions(
  p_actor_id uuid, p_library_id uuid, p_terms text[], p_tags text[], p_limit integer, p_offset integer
)
RETURNS TABLE(question_id uuid, title text, question_type text, tags text[], "position" integer, attempt_count bigint, total_count bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_student_practice_exercise_access(p_actor_id, p_library_id);
  IF cardinality(COALESCE(p_terms, ARRAY[]::text[])) > 12
    OR cardinality(COALESCE(p_tags, ARRAY[]::text[])) > 20
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 24 OR p_offset IS NULL OR p_offset < 0
    OR EXISTS (SELECT 1 FROM unnest(p_terms) term WHERE term IS NULL OR char_length(btrim(term)) NOT BETWEEN 1 AND 160)
    OR EXISTS (SELECT 1 FROM unnest(p_tags) tag WHERE tag IS NULL OR char_length(public.question_tag_display(tag)) NOT BETWEEN 1 AND 80)
  THEN RAISE EXCEPTION 'invalid practice review search' USING ERRCODE = '22023'; END IF;
  RETURN QUERY WITH matched AS (
    SELECT q.id, q.title, q.question_type::text question_type, COALESCE(q.tags, ARRAY[]::text[]) tags, member.position,
      (SELECT count(*) FROM public.practice_answer_attempts a WHERE a.library_id = p_library_id
        AND a.student_id = p_actor_id AND a.question_id = q.id) attempt_count
    FROM public.student_practice_review_pins pin
    JOIN public.practice_library_questions member ON member.library_id = pin.library_id AND member.question_id = pin.question_id
    JOIN public.questions q ON q.id = pin.question_id
    WHERE pin.library_id = p_library_id AND pin.student_id = p_actor_id
      AND q.question_type::text IN ('mcq','written','matching','true_false','fill_blank','ordering','composite','classify','image_label')
      AND NOT EXISTS (SELECT 1 FROM unnest(p_terms) term
        WHERE strpos(lower(q.search_text), lower(btrim(regexp_replace(term, '[[:space:]]+', ' ', 'g')))) = 0)
      AND NOT EXISTS (SELECT 1 FROM unnest(p_tags) selected_tag WHERE NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(q.tags, ARRAY[]::text[])) tag WHERE public.question_tag_key(tag) = public.question_tag_key(selected_tag)
      ))
  ) SELECT m.id, m.title, m.question_type, m.tags, m.position, m.attempt_count, count(*) OVER ()::bigint
    FROM matched m ORDER BY m.position, m.id LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.search_student_practice_review_questions(uuid, uuid, text[], text[], integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_student_practice_review_questions(uuid, uuid, text[], text[], integer, integer) TO service_role;
