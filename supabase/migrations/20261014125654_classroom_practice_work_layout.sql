-- Presentation metadata only; practice remains separate from graded work.
ALTER TABLE public.practice_libraries
  ADD COLUMN category_id uuid REFERENCES public.classroom_assignment_categories(id) ON DELETE SET NULL,
  ADD COLUMN display_order integer;

CREATE INDEX practice_libraries_category_idx ON public.practice_libraries(category_id)
  WHERE category_id IS NOT NULL;

CREATE TRIGGER practice_libraries_category_same_classroom
  BEFORE INSERT OR UPDATE OF classroom_id, category_id ON public.practice_libraries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_category_classroom();

CREATE FUNCTION public.reorder_classroom_work(p_actor_id uuid, p_classroom_id uuid, p_work_ids text[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_count integer := cardinality(p_work_ids);
  v_matched integer;
  v_total integer;
BEGIN
  IF p_actor_id IS NULL OR p_classroom_id IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 1000
    OR (SELECT count(DISTINCT id) FROM unnest(p_work_ids) id) <> v_count
    OR EXISTS (SELECT 1 FROM unnest(p_work_ids) id
      WHERE id IS NULL OR id !~ '^(practice:)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') THEN
    RAISE EXCEPTION 'invalid work order' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.classrooms c JOIN public.users actor ON actor.id = p_actor_id
  WHERE c.id = p_classroom_id AND c.status = 'active' AND c.classroom_type = 'subject'
    AND actor.status = 'active' AND actor.role::text IN ('teacher', 'admin')
    AND (c.teacher_id = actor.id OR EXISTS (
      SELECT 1 FROM public.classroom_co_teachers co
      WHERE co.classroom_id = c.id AND co.user_id = actor.id AND co.permission IN ('admin', 'manage')
    )) FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'work order not allowed' USING ERRCODE = '42501'; END IF;

  -- Hold the exact rows before checking membership and writing either table.
  PERFORM 1 FROM public.assignment_classrooms WHERE classroom_id = p_classroom_id FOR UPDATE;
  PERFORM 1 FROM public.practice_libraries WHERE classroom_id = p_classroom_id FOR UPDATE;
  WITH available AS (
    SELECT assignment_id::text id FROM public.assignment_classrooms WHERE classroom_id = p_classroom_id
    UNION ALL
    SELECT 'practice:' || id::text FROM public.practice_libraries WHERE classroom_id = p_classroom_id
  ) SELECT count(*)::int, count(*) FILTER (WHERE id = ANY(p_work_ids))::int
    INTO v_total, v_matched FROM available;
  IF v_total <> v_count OR v_matched <> v_count THEN
    RAISE EXCEPTION 'work list changed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.assignment_classrooms link SET display_order = requested.position::integer
  FROM unnest(p_work_ids) WITH ORDINALITY requested(id, position)
  WHERE link.classroom_id = p_classroom_id AND link.assignment_id::text = requested.id;

  UPDATE public.practice_libraries library SET display_order = requested.position::integer
  FROM unnest(p_work_ids) WITH ORDINALITY requested(id, position)
  WHERE library.classroom_id = p_classroom_id AND 'practice:' || library.id::text = requested.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_classroom_work(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_classroom_work(uuid, uuid, text[]) TO service_role;
GRANT UPDATE (display_order) ON public.practice_libraries TO service_role;
