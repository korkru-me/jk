-- Additive, service-role-only start. The caller authenticates the student and
-- verifies CK+BEK/signed intent; the database repeats resource authorization.
-- Keep the legacy function, grants, existing records and Storage unchanged.
CREATE FUNCTION public.start_seb_submission_atomic(
  p_assignment_id uuid,
  p_student_id uuid,
  p_release_id text,
  p_config_revision integer,
  p_verified_at timestamptz,
  p_valid_until timestamptz,
  p_platform text,
  p_version text,
  p_expected_predecessor_id uuid,
  p_assignment_updated_at timestamptz,
  p_question_versions jsonb,
  p_fresh_answers jsonb,
  p_carried_answer_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  submission_id uuid,
  started_at timestamptz,
  submission_status text,
  attempt_number integer,
  seb_config_revision integer,
  created boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_assignment public.assignments%ROWTYPE;
  v_predecessor public.submissions%ROWTYPE;
  v_receipt public.submissions%ROWTYPE;
  v_next integer := 1;
  v_latest integer;
  v_now timestamptz;
  v_deadline timestamptz;
  v_classroom uuid;
  v_group_ids uuid[];
  v_has_submission boolean;
  v_allowed uuid[];
  v_expected_fresh uuid[];
  v_expected_carried uuid[];
  v_actual_fresh uuid[];
  v_item jsonb;
  v_question uuid;
  v_count integer;
  v_max numeric;
  v_submission uuid;
BEGIN
  IF p_assignment_id IS NULL OR p_student_id IS NULL
    OR p_release_id IS NULL OR length(p_release_id) NOT BETWEEN 1 AND 120
    OR p_config_revision IS NULL OR p_config_revision NOT BETWEEN 1 AND 2147483646
    OR p_verified_at IS NULL OR p_valid_until IS NULL
    OR p_platform IS NULL OR p_platform NOT IN ('windows', 'macos', 'ios')
    OR p_version IS NULL OR length(p_version) NOT BETWEEN 5 AND 240
    OR p_version ~ '[\x00-\x1f\x7f]'
    OR p_carried_answer_ids IS NULL
  THEN
    RAISE EXCEPTION 'invalid atomic SEB start input' USING ERRCODE = '22023';
  END IF;

  -- Same first lock as quit-password rotation. This also serializes concurrent
  -- generations; no browser-state counter or advisory-lock collision is used.
  SELECT a.* INTO v_assignment FROM public.assignments a
  WHERE a.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.status::text <> 'published'
    OR v_assignment.mode::text <> 'online' OR v_assignment.type::text <> 'exam'
    OR v_assignment.secure_browser_mode <> 'seb_required'
  THEN
    RAISE EXCEPTION 'SEB assignment unavailable' USING ERRCODE = '42501';
  END IF;
  v_now := clock_timestamp();
  IF p_verified_at > v_now + interval '1 minute'
    OR p_valid_until <= p_verified_at
    OR p_valid_until > p_verified_at + interval '12 hours'
  THEN
    RAISE EXCEPTION 'invalid verification lifetime' USING ERRCODE = '22023';
  END IF;
  IF p_valid_until <= v_now THEN
    RAISE EXCEPTION 'SEB verification expired' USING ERRCODE = 'PT410';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_student_id AND u.status::text = 'active') THEN
    RAISE EXCEPTION 'student unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_config_revision IS DISTINCT FROM (
    SELECT max(r.revision) FROM public.assignment_seb_config_revisions r WHERE r.assignment_id = p_assignment_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.assignment_seb_config_releases r
    WHERE r.assignment_id = p_assignment_id AND r.revision = p_config_revision
      AND r.release_id = p_release_id AND r.org_id = v_assignment.org_id
      AND r.owner_id = v_assignment.created_by
  ) THEN
    RAISE EXCEPTION 'SEB release changed' USING ERRCODE = '40001';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.submissions s
    WHERE s.assignment_id = p_assignment_id AND s.student_id = p_student_id)
  INTO v_has_submission;
  -- Preserve studentHasAssignment: existing work survives a group move, but
  -- the student must still be on a roster of a linked classroom.
  SELECT ac.classroom_id, ac.group_ids INTO v_classroom, v_group_ids
  FROM public.assignment_classrooms ac
  JOIN public.classroom_students cs ON cs.classroom_id = ac.classroom_id AND cs.student_id = p_student_id
  WHERE ac.assignment_id = p_assignment_id AND (
    ac.group_ids IS NULL OR v_has_submission OR EXISTS (
      SELECT 1 FROM public.classroom_group_members gm WHERE gm.classroom_id = ac.classroom_id
        AND gm.student_id = p_student_id AND gm.group_id = ANY(ac.group_ids)
    )) ORDER BY ac.classroom_id LIMIT 1 FOR SHARE OF ac, cs;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student outside assignment roster' USING ERRCODE = '42501';
  END IF;
  IF v_group_ids IS NOT NULL AND NOT v_has_submission THEN
    PERFORM gm.student_id FROM public.classroom_group_members gm
    WHERE gm.classroom_id = v_classroom AND gm.student_id = p_student_id
      AND gm.group_id = ANY(v_group_ids) FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'student group changed' USING ERRCODE = '40001';
    END IF;
  END IF;
  SELECT e.extended_end_at INTO v_deadline FROM public.assignment_extensions e
  WHERE e.assignment_id = p_assignment_id AND e.student_id = p_student_id FOR SHARE;
  v_deadline := coalesce(v_deadline, v_assignment.end_at);
  IF v_assignment.start_at > v_now OR v_deadline < v_now THEN
    RAISE EXCEPTION 'outside exam window' USING ERRCODE = 'PT410';
  END IF;

  IF p_expected_predecessor_id IS NOT NULL THEN
    SELECT s.* INTO v_predecessor FROM public.submissions s
    WHERE s.id = p_expected_predecessor_id AND s.assignment_id = p_assignment_id
      AND s.student_id = p_student_id FOR UPDATE;
    IF NOT FOUND OR v_predecessor.org_id IS DISTINCT FROM v_assignment.org_id
      OR v_predecessor.status::text NOT IN ('submitted', 'graded') THEN
      RAISE EXCEPTION 'invalid start generation' USING ERRCODE = '40001';
    END IF;
    IF v_predecessor.attempt_number >= 2147483646 THEN
      RAISE EXCEPTION 'attempt generation exhausted' USING ERRCODE = '22003';
    END IF;
    v_next := v_predecessor.attempt_number + 1;
  END IF;
  SELECT s.* INTO v_receipt FROM public.submissions s
  WHERE s.assignment_id = p_assignment_id AND s.student_id = p_student_id
    AND s.attempt_number = v_next FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.org_id <> v_assignment.org_id OR v_receipt.exam_access_mode <> 'seb'
      OR v_receipt.seb_config_revision IS DISTINCT FROM p_config_revision
      OR v_receipt.status::text NOT IN ('in_progress', 'submitted', 'graded')
    THEN
      RAISE EXCEPTION 'attempt context changed' USING ERRCODE = '40001';
    END IF;
    IF v_receipt.status::text = 'in_progress' AND v_assignment.duration_minutes IS NOT NULL
      AND v_receipt.started_at + v_assignment.duration_minutes * interval '1 minute' < clock_timestamp()
    THEN
      -- Caller may run the existing forced finalizer; never reset this timer.
      RAISE EXCEPTION 'attempt requires finalization' USING ERRCODE = 'PT410';
    END IF;
    IF v_assignment.completion_rule <> 'streak' AND NOT EXISTS (
      SELECT 1 FROM public.submission_answers sa WHERE sa.submission_id = v_receipt.id
    ) THEN
      RAISE EXCEPTION 'legacy incomplete attempt' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_receipt.id, v_receipt.started_at, v_receipt.status::text,
      v_receipt.attempt_number, v_receipt.seb_config_revision, false;
    RETURN;
  END IF;
  SELECT coalesce(max(s.attempt_number), 0) INTO v_latest FROM public.submissions s
  WHERE s.assignment_id = p_assignment_id AND s.student_id = p_student_id;
  IF v_latest <> v_next - 1 OR EXISTS (SELECT 1 FROM public.submissions s
    WHERE s.assignment_id = p_assignment_id AND s.student_id = p_student_id AND s.status::text = 'in_progress')
  THEN
    RAISE EXCEPTION 'start generation changed' USING ERRCODE = '40001';
  END IF;
  IF v_assignment.completion_rule <> 'streak'
    AND NOT (v_assignment.passing_type IS NOT NULL AND v_assignment.passing_value IS NOT NULL)
    AND v_next > coalesce(v_assignment.max_attempts, 1)
  THEN
    RAISE EXCEPTION 'attempt limit reached' USING ERRCODE = '42501';
  END IF;
  -- Match findPassingCompletion, including JS Math.round for nonnegative
  -- scores: use float8 arithmetic/floor, rather than numeric round().
  IF EXISTS (
    SELECT 1 FROM public.submissions s
    CROSS JOIN LATERAL (SELECT CASE
      WHEN s.total_score IS NOT NULL AND v_assignment.display_max_score IS NOT NULL AND s.max_score > 0
      THEN floor((s.total_score::double precision * v_assignment.display_max_score::double precision
        / s.max_score::double precision * 100) + 0.5) / 100
      ELSE s.total_score::double precision END AS score,
      coalesce(v_assignment.display_max_score, s.max_score)::double precision AS max_score) scaled
    WHERE s.assignment_id = p_assignment_id AND s.student_id = p_student_id
      AND s.status::text IN ('submitted', 'graded') AND (
        (v_assignment.completion_rule = 'streak' AND s.streak_reached)
        OR (v_assignment.completion_rule <> 'streak' AND s.total_score IS NOT NULL AND v_assignment.passing_value IS NOT NULL AND (
          (v_assignment.passing_type = 'score' AND scaled.score >= v_assignment.passing_value)
          OR (v_assignment.passing_type = 'percent' AND
            CASE WHEN scaled.max_score > 0 THEN scaled.score / scaled.max_score * 100 ELSE 0 END >= v_assignment.passing_value)
        )))
  ) THEN
    RAISE EXCEPTION 'assignment completion reached' USING ERRCODE = '42501';
  END IF;

  IF p_assignment_updated_at IS NULL OR v_assignment.updated_at IS DISTINCT FROM p_assignment_updated_at THEN
    RAISE EXCEPTION 'assignment snapshot changed' USING ERRCODE = '40001';
  END IF;
  IF v_assignment.question_ids IS NULL OR cardinality(v_assignment.question_ids) = 0 OR cardinality(v_assignment.question_ids) <> (
    SELECT count(DISTINCT id) FROM unnest(v_assignment.question_ids) id
  ) THEN
    RAISE EXCEPTION 'invalid assignment question pool' USING ERRCODE = '22023';
  END IF;
  PERFORM q.id FROM public.questions q WHERE q.id = ANY(v_assignment.question_ids) ORDER BY q.id FOR SHARE;
  PERFORM qs.question_id FROM public.question_shares qs WHERE qs.org_id = v_assignment.org_id
    AND qs.question_id = ANY(v_assignment.question_ids) ORDER BY qs.question_id FOR SHARE;
  PERFORM m.assignment_id FROM public.education_research_measurements m
    WHERE m.assignment_id = p_assignment_id FOR SHARE;
  SELECT coalesce(array_agg(q.id ORDER BY q.id), '{}'::uuid[]) INTO v_allowed FROM public.questions q
  WHERE q.id = ANY(v_assignment.question_ids) AND (CASE WHEN q.is_research_snapshot THEN EXISTS (
    SELECT 1 FROM public.education_research_measurements m WHERE m.assignment_id = p_assignment_id
      AND m.snapshot_question_ids = v_assignment.question_ids AND q.research_snapshot_project_id = m.project_id
      AND q.created_by = v_assignment.created_by AND q.org_id = v_assignment.org_id
  ) ELSE q.created_by = v_assignment.created_by OR q.visibility::text = 'public'
    OR (q.org_id = v_assignment.org_id AND q.visibility::text IN ('organization', 'school'))
    OR EXISTS (SELECT 1 FROM public.question_shares qs WHERE qs.org_id = v_assignment.org_id AND qs.question_id = q.id) END);
  IF cardinality(v_allowed) <> cardinality(v_assignment.question_ids) THEN
    RAISE EXCEPTION 'question provenance unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_question_versions IS NULL OR jsonb_typeof(p_question_versions) <> 'array'
    OR jsonb_array_length(p_question_versions) <> cardinality(v_allowed)
    OR octet_length(p_question_versions::text) > 4194304
  THEN
    RAISE EXCEPTION 'invalid question versions' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_question_versions) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR v_item - ARRAY['question_id', 'updated_at'] <> '{}'::jsonb
      OR jsonb_typeof(v_item->'question_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_item->'updated_at') IS DISTINCT FROM 'string'
    THEN RAISE EXCEPTION 'invalid question version' USING ERRCODE = '22023'; END IF;
    v_question := (v_item->>'question_id')::uuid;
    IF NOT v_question = ANY(v_allowed) OR NOT EXISTS (SELECT 1 FROM public.questions q
      WHERE q.id = v_question AND q.updated_at = (v_item->>'updated_at')::timestamptz)
    THEN RAISE EXCEPTION 'question snapshot changed' USING ERRCODE = '40001'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'question_id') FROM jsonb_array_elements(p_question_versions)) <> cardinality(v_allowed) THEN
    RAISE EXCEPTION 'duplicate question versions' USING ERRCODE = '22023';
  END IF;
  IF p_fresh_answers IS NULL OR jsonb_typeof(p_fresh_answers) <> 'array'
    OR jsonb_array_length(p_fresh_answers) > (CASE
      WHEN p_expected_predecessor_id IS NOT NULL AND v_assignment.retry_scope = 'wrong_only'
      THEN (SELECT count(*) FROM public.submission_answers sa WHERE sa.submission_id = p_expected_predecessor_id)
      ELSE cardinality(v_allowed) END)
    OR octet_length(p_fresh_answers::text) > 16777216
    OR cardinality(p_carried_answer_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_carried_answer_ids) id)
    OR array_position(p_carried_answer_ids, NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'invalid answer snapshots' USING ERRCODE = '22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_fresh_answers) LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR v_item - ARRAY['question_id', 'random_values', 'correct_answer', 'max_score', 'order_index', 'option_order'] <> '{}'::jsonb
      OR (SELECT count(*) FROM jsonb_object_keys(v_item)) <> 6
      OR jsonb_typeof(v_item->'question_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_item->'correct_answer') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_item->'random_values') IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item->'max_score') IS DISTINCT FROM 'number'
      OR (v_item->>'max_score')::numeric < 0
      OR jsonb_typeof(v_item->'order_index') IS DISTINCT FROM 'number'
      OR v_item->>'order_index' !~ '^[0-9]+$'
      OR jsonb_typeof(v_item->'option_order') NOT IN ('array', 'null')
    THEN RAISE EXCEPTION 'invalid fresh answer' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(v_item->'random_values') v WHERE jsonb_typeof(v.value) <> 'number') THEN
      RAISE EXCEPTION 'invalid random values' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_item->'option_order') = 'array' THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_item->'option_order') v
        WHERE jsonb_typeof(v.value) <> 'number' OR v.value::text !~ '^[0-9]+$')
        OR jsonb_array_length(v_item->'option_order') <> (
          SELECT count(DISTINCT value) FROM jsonb_array_elements(v_item->'option_order'))
      THEN RAISE EXCEPTION 'invalid option order' USING ERRCODE = '22023'; END IF;
    END IF;
    IF NOT (v_item->>'question_id')::uuid = ANY(v_allowed) THEN
      RAISE EXCEPTION 'answer outside assignment' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  SELECT coalesce(array_agg((value->>'question_id')::uuid ORDER BY (value->>'question_id')::uuid), '{}'::uuid[])
    INTO v_actual_fresh FROM jsonb_array_elements(p_fresh_answers);
  IF (SELECT count(DISTINCT value->>'order_index') FROM jsonb_array_elements(p_fresh_answers)) <> cardinality(v_actual_fresh) THEN
    RAISE EXCEPTION 'duplicate answer slots' USING ERRCODE = '22023';
  END IF;

  IF p_expected_predecessor_id IS NOT NULL AND v_assignment.retry_scope = 'wrong_only' THEN
    PERFORM sa.id FROM public.submission_answers sa WHERE sa.submission_id = p_expected_predecessor_id ORDER BY sa.id FOR SHARE;
    IF EXISTS (SELECT 1 FROM public.submission_answers sa
      WHERE sa.submission_id = p_expected_predecessor_id AND sa.org_id IS DISTINCT FROM v_assignment.org_id) THEN
      RAISE EXCEPTION 'retry answer tenant changed' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(array_agg(sa.question_id ORDER BY sa.question_id) FILTER (WHERE sa.is_correct IS NOT NULL AND sa.score < sa.max_score AND sa.question_id = ANY(v_allowed)), '{}'::uuid[]),
      coalesce(array_agg(sa.id ORDER BY sa.id) FILTER (WHERE sa.is_correct IS NULL OR sa.score >= sa.max_score OR NOT sa.question_id = ANY(v_allowed)), '{}'::uuid[])
    INTO v_expected_fresh, v_expected_carried FROM public.submission_answers sa WHERE sa.submission_id = p_expected_predecessor_id;
    IF cardinality(v_expected_fresh) = 0 OR v_expected_fresh IS DISTINCT FROM v_actual_fresh
      OR v_expected_carried IS DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) FROM unnest(p_carried_answer_ids) id)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_fresh_answers) f WHERE NOT EXISTS (
        SELECT 1 FROM public.submission_answers sa WHERE sa.submission_id = p_expected_predecessor_id
          AND sa.question_id = (f.value->>'question_id')::uuid AND sa.order_index = (f.value->>'order_index')::integer
          AND sa.max_score = (f.value->>'max_score')::numeric AND sa.is_correct IS NOT NULL AND sa.score < sa.max_score))
    THEN RAISE EXCEPTION 'retry snapshot changed' USING ERRCODE = '40001'; END IF;
  ELSE
    IF cardinality(p_carried_answer_ids) <> 0 THEN
      RAISE EXCEPTION 'unexpected carried answers' USING ERRCODE = '22023';
    END IF;
    v_count := CASE WHEN v_assignment.completion_rule = 'streak' THEN 0
      ELSE coalesce(v_assignment.random_question_count, cardinality(v_allowed)) END;
    IF cardinality(v_actual_fresh) <> v_count
      OR (SELECT count(DISTINCT id) FROM unnest(v_actual_fresh) id) <> v_count
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_fresh_answers) f WHERE (f.value->>'order_index')::integer >= v_count)
    THEN RAISE EXCEPTION 'invalid answer selection' USING ERRCODE = '22023'; END IF;
  END IF;
  IF v_assignment.completion_rule = 'streak' AND (
    SELECT count(*) FROM public.questions q WHERE q.id = ANY(v_allowed) AND q.question_type::text NOT IN ('essay', 'file_upload')
  ) < coalesce(v_assignment.streak_target, 0) THEN
    RAISE EXCEPTION 'streak pool unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(sum((value->>'max_score')::numeric), 0) INTO v_max FROM jsonb_array_elements(p_fresh_answers);
  SELECT v_max + coalesce(sum(sa.max_score), 0) INTO v_max FROM public.submission_answers sa WHERE sa.id = ANY(p_carried_answer_ids);
  v_now := clock_timestamp();
  IF p_valid_until <= v_now OR v_deadline < v_now OR v_assignment.start_at > v_now THEN
    RAISE EXCEPTION 'exam authorization expired' USING ERRCODE = 'PT410';
  END IF;
  INSERT INTO public.submissions (org_id, assignment_id, student_id, started_at, max_score, status,
    attempt_number, exam_access_mode, secure_browser_verified_at, secure_browser_platform, secure_browser_version, seb_config_revision)
  VALUES (v_assignment.org_id, p_assignment_id, p_student_id, v_now, v_max, 'in_progress', v_next,
    'seb', p_verified_at, p_platform, p_version, p_config_revision) RETURNING id INTO v_submission;
  INSERT INTO public.submission_answers (org_id, submission_id, question_id, random_values, correct_answer,
    max_score, order_index, option_order, carried_over)
  SELECT v_assignment.org_id, v_submission, (f.value->>'question_id')::uuid, f.value->'random_values',
    f.value->>'correct_answer', (f.value->>'max_score')::numeric, (f.value->>'order_index')::integer,
    nullif(f.value->'option_order', 'null'::jsonb), false FROM jsonb_array_elements(p_fresh_answers) f;
  INSERT INTO public.submission_answers (org_id, submission_id, question_id, random_values, correct_answer,
    student_answer, is_correct, score, max_score, teacher_feedback, order_index, option_order, work_images,
    math_input_modes, score_edited_by, score_edited_at, carried_over)
  SELECT v_assignment.org_id, v_submission, sa.question_id, sa.random_values, sa.correct_answer,
    sa.student_answer, sa.is_correct, sa.score, sa.max_score, sa.teacher_feedback, sa.order_index, sa.option_order,
    sa.work_images, sa.math_input_modes, sa.score_edited_by, sa.score_edited_at, true
  FROM public.submission_answers sa WHERE sa.id = ANY(p_carried_answer_ids);
  RETURN QUERY SELECT v_submission, v_now, 'in_progress'::text, v_next, p_config_revision, true;
END;
$$;

COMMENT ON FUNCTION public.start_seb_submission_atomic(uuid,uuid,text,integer,timestamptz,timestamptz,text,text,uuid,timestamptz,jsonb,jsonb,uuid[]) IS
  'Service-only explicit SEB start: exact authorization, generation receipt, immutable timer and atomic answer snapshots.';
REVOKE ALL ON FUNCTION public.start_seb_submission_atomic(uuid,uuid,text,integer,timestamptz,timestamptz,text,text,uuid,timestamptz,jsonb,jsonb,uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_seb_submission_atomic(uuid,uuid,text,integer,timestamptz,timestamptz,text,text,uuid,timestamptz,jsonb,jsonb,uuid[])
  TO service_role;
