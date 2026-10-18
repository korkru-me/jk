-- Finished-attempt answer-key corrections and assignment-scoped void questions.
-- The server grades frozen student answers, then this transaction independently
-- validates actor, scope and every optimistic snapshot before changing anything.
ALTER TABLE public.submission_answers
  ADD COLUMN grading_config jsonb,
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN void_original_max_score numeric NOT NULL DEFAULT 0
    CHECK (void_original_max_score >= 0 AND void_original_max_score::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE public.submissions ADD COLUMN voided_max_score numeric NOT NULL DEFAULT 0
  CHECK (voided_max_score >= 0 AND voided_max_score::text NOT IN ('NaN','Infinity','-Infinity'));
COMMENT ON COLUMN public.submission_answers.void_original_max_score IS
  'Original frozen weight retained when a question is void; carried retries preserve it.';
COMMENT ON COLUMN public.submissions.voided_max_score IS
  'Sum of removed raw question weights. Display scaling uses max_score + voided_max_score as the original denominator.';

CREATE TABLE public.assignment_void_questions (
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, question_id)
);
CREATE TABLE public.question_grading_change_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  kind text NOT NULL CHECK (kind IN ('answer_key', 'void')),
  void_assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  reason text,
  old_question jsonb,
  new_question jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.question_grading_change_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.question_grading_change_batches(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  answer_id uuid NOT NULL REFERENCES public.submission_answers(id) ON DELETE CASCADE,
  old_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  UNIQUE (batch_id, answer_id)
);
CREATE INDEX question_grading_change_items_submission_idx ON public.question_grading_change_items(submission_id);
ALTER TABLE public.assignment_void_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_grading_change_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_grading_change_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assignment_void_questions, public.question_grading_change_batches,
  public.question_grading_change_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.assignment_void_questions, public.question_grading_change_batches,
  public.question_grading_change_items TO service_role;

CREATE FUNCTION public.actor_can_manage_grading_assignment(p_actor_id uuid, p_assignment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a JOIN public.users actor ON actor.id = p_actor_id
    WHERE a.id = p_assignment_id AND actor.status::text = 'active'
      AND (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = actor.id)
        OR (actor.role::text IN ('teacher', 'admin') AND (
          a.created_by = actor.id OR EXISTS (
            SELECT 1 FROM public.assignment_classrooms ac
            JOIN public.classroom_co_teachers co ON co.classroom_id = ac.classroom_id
            WHERE ac.assignment_id = a.id AND co.user_id = actor.id AND co.permission IN ('admin', 'manage')
          )
        )))
  );
$$;
REVOKE ALL ON FUNCTION public.actor_can_manage_grading_assignment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actor_can_manage_grading_assignment(uuid, uuid) TO service_role;

-- Capture legacy rules before replacing the old answer-write guard: this only
-- fills the new metadata column, leaving frozen keys, answers and scores alone.
-- That keeps assignments outside an editor's managed scope on their existing
-- rules when the shared bank question is corrected later.
UPDATE public.submission_answers a SET grading_config = pg_catalog.jsonb_build_object(
  'question_type', q.question_type,
  'answer_tolerance', COALESCE(q.answer_tolerance, 0.1),
  'answer_parts', q.answer_parts,
  'extra_data', COALESCE(NULLIF(q.extra_data, 'null'::jsonb), '{}'::jsonb)
) FROM public.questions q WHERE q.id = a.question_id AND a.grading_config IS NULL;

CREATE FUNCTION public.freeze_attempt_grading_config() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_config jsonb; v_revision timestamptz;
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'question_type', q.question_type,
    'answer_tolerance', COALESCE(q.answer_tolerance, 0.1),
    'answer_parts', q.answer_parts,
    'extra_data', COALESCE(NULLIF(q.extra_data, 'null'::jsonb), '{}'::jsonb)
  ), q.updated_at INTO v_config, v_revision FROM public.questions q WHERE q.id = NEW.question_id FOR SHARE;
  IF v_config IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'question unavailable while starting attempt';
  END IF;
  IF NEW.grading_config IS NULL OR NEW.grading_config = 'null'::jsonb THEN
    NEW.grading_config := v_config;
  ELSIF NOT COALESCE(NEW.carried_over, false) THEN
    IF NEW.grading_config ? 'question_revision' THEN
      BEGIN
        IF (NEW.grading_config->>'question_revision')::timestamptz IS DISTINCT FROM v_revision THEN
          RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'question changed while starting attempt';
        END IF;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'invalid question revision while starting attempt';
      END;
    END IF;
    IF (NEW.grading_config - 'question_revision') IS DISTINCT FROM v_config THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'grading rules changed while starting attempt';
    END IF;
  END IF;
  -- Earned scores carried from a previous round intentionally retain the
  -- grading snapshot under which the teacher accepted that answer.
  RETURN NEW;
END; $$;
CREATE TRIGGER freeze_attempt_grading_config BEFORE INSERT ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.freeze_attempt_grading_config();
REVOKE ALL ON FUNCTION public.freeze_attempt_grading_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_attempt_grading_config() TO service_role;

-- A transaction-local flag is insufficient by itself: only the non-browser
-- service role may cross the finalized-answer boundary, and only student data
-- remaining byte-for-byte unchanged is eligible for this correction path.
CREATE OR REPLACE FUNCTION public.guard_attempt_answer_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.submissions%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.submission_id <> OLD.submission_id OR NEW.question_id <> OLD.question_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'answer scope is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND current_user = 'service_role'
    AND pg_catalog.current_setting('korkru.question_grading_change', true) = 'on'
    AND ROW(NEW.student_answer, NEW.work_images, NEW.math_input_modes, NEW.random_values,
      NEW.submission_id, NEW.question_id, NEW.carried_over, NEW.check_count, NEW.option_order, NEW.order_index)
    IS NOT DISTINCT FROM ROW(OLD.student_answer, OLD.work_images, OLD.math_input_modes, OLD.random_values,
      OLD.submission_id, OLD.question_id, OLD.carried_over, OLD.check_count, OLD.option_order, OLD.order_index)
    THEN RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.student_answer, NEW.work_images, NEW.math_input_modes,
      NEW.random_values, NEW.correct_answer, NEW.submission_id, NEW.carried_over, NEW.check_count,
      NEW.grading_config, NEW.is_void, NEW.void_original_max_score, NEW.option_order, NEW.order_index)
    IS NOT DISTINCT FROM ROW(OLD.student_answer, OLD.work_images, OLD.math_input_modes,
      OLD.random_values, OLD.correct_answer, OLD.submission_id, OLD.carried_over, OLD.check_count,
      OLD.grading_config, OLD.is_void, OLD.void_original_max_score, OLD.option_order, OLD.order_index) THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.submissions WHERE id = NEW.submission_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'in_progress' OR v.closed_at IS NOT NULL
    OR public.submission_hard_close(v.id) <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT425', MESSAGE = 'attempt no longer accepts answers'; END IF;
  UPDATE public.submissions SET answer_revision = answer_revision + 1 WHERE id = v.id;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.apply_assignment_void_to_answer() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assignment_void_questions q JOIN public.submissions s
    ON s.assignment_id = q.assignment_id WHERE s.id = NEW.submission_id AND q.question_id = NEW.question_id) THEN
    IF TG_OP = 'UPDATE' THEN
      -- Preserve the original weight on subsequent key corrections/manual edits.
      NEW.void_original_max_score := CASE WHEN OLD.is_void THEN OLD.void_original_max_score ELSE OLD.max_score END;
    ELSE
      -- A carried-over void answer already has max_score=0; its original weight
      -- is copied with the carried row. A fresh skeleton still has its ceiling.
      NEW.void_original_max_score := GREATEST(NEW.void_original_max_score, NEW.max_score);
    END IF;
    NEW.is_void := true;
    NEW.score := 0;
    NEW.max_score := 0;
    NEW.is_correct := true;
  ELSIF NEW.is_void OR NEW.void_original_max_score <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'answer has no assignment void decision';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER apply_assignment_void_to_answer BEFORE INSERT OR UPDATE ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.apply_assignment_void_to_answer();

CREATE FUNCTION public.refresh_void_attempt_ceiling() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assignment_void_questions q JOIN public.submissions s
    ON s.assignment_id = q.assignment_id WHERE s.id = NEW.submission_id) THEN
    UPDATE public.submissions SET (max_score, voided_max_score) = (
      SELECT COALESCE(sum(a.max_score), 0), COALESCE(sum(a.void_original_max_score), 0)
      FROM public.submission_answers a WHERE a.submission_id = NEW.submission_id
    ) WHERE id = NEW.submission_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER refresh_void_attempt_ceiling AFTER INSERT ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.refresh_void_attempt_ceiling();
REVOKE ALL ON FUNCTION public.apply_assignment_void_to_answer(), public.refresh_void_attempt_ceiling()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_assignment_void_to_answer(), public.refresh_void_attempt_ceiling() TO service_role;

CREATE FUNCTION public.apply_question_grading_change(
  p_actor_id uuid,
  p_question_id uuid,
  p_expected_question_updated_at timestamptz,
  p_question_patch jsonb,
  p_changes jsonb,
  p_void_assignment_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_requires_unused_question boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_question public.questions%ROWTYPE;
  v_new_question public.questions%ROWTYPE;
  v_assignment_ids uuid[];
  v_provided_ids uuid[];
  v_change jsonb;
  v_assignment_id uuid;
  v_assignment public.assignments%ROWTYPE;
  v_submission public.submissions%ROWTYPE;
  v_answer public.submission_answers%ROWTYPE;
  v_row jsonb;
  v_current integer;
  v_best integer;
  v_batch uuid;
  v_count integer := 0;
  v_previous_flag text;
  v_is_super boolean;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'grading changes require the server role';
  END IF;
  IF p_actor_id IS NULL OR p_question_id IS NULL OR pg_catalog.jsonb_typeof(p_changes) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_question_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid grading change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND status::text = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'actor is not active';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = p_actor_id) INTO v_is_super;
  SELECT * INTO v_question FROM public.questions WHERE id = p_question_id FOR UPDATE;
  IF v_question.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'question unavailable'; END IF;
  -- The trusted server determines structural compatibility. An incompatible
  -- edit planned while unused must remain unused under this same question lock;
  -- fresh answer INSERTs take FOR SHARE on it, including foreign assignments.
  IF p_requires_unused_question AND EXISTS (
    SELECT 1 FROM public.submission_answers WHERE question_id = p_question_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'question gained answers while changing structure';
  END IF;

  IF p_void_assignment_id IS NULL THEN
    IF v_question.is_research_snapshot OR NOT (v_is_super OR (
      EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND role::text IN ('teacher', 'admin'))
      AND (v_question.created_by = p_actor_id OR (v_question.team_edit_allowed AND EXISTS (
        SELECT 1 FROM public.organization_members m WHERE m.user_id = p_actor_id AND (
          (m.org_id = v_question.org_id AND v_question.visibility::text IN ('organization', 'school'))
          OR EXISTS (SELECT 1 FROM public.question_shares qs WHERE qs.question_id = p_question_id AND qs.org_id = m.org_id)
        )
      )))
    )) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'actor cannot edit this answer key'; END IF;
    IF p_expected_question_updated_at IS NULL OR v_question.updated_at IS DISTINCT FROM p_expected_question_updated_at THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'question changed; reload before grading';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_question_patch) AS k(key) WHERE key <> ALL(ARRAY[
      'org_id','visibility','team_edit_allowed','category_id','grade_level','subject','title','question_text','question_type',
      'difficulty','is_random','variables','logic_rules','answer_parts','answer_formula','answer_unit','answer_tolerance',
      'mcq_options','extra_data','solution_text','solution_image_urls','tags','image_urls','requires_work_image','content_fingerprint'
    ])) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'question patch contains protected fields'; END IF;
    v_new_question := pg_catalog.jsonb_populate_record(v_question, p_question_patch);
    IF NOT v_is_super AND v_question.created_by <> p_actor_id AND
      ROW(v_new_question.org_id, v_new_question.visibility, v_new_question.team_edit_allowed)
      IS DISTINCT FROM ROW(v_question.org_id, v_question.visibility, v_question.team_edit_allowed) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the question owner may change sharing';
    END IF;
    IF v_new_question.org_id IS DISTINCT FROM v_question.org_id AND NOT v_is_super AND
      NOT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = p_actor_id AND org_id = v_new_question.org_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'question organization unavailable';
    END IF;
    SELECT COALESCE(array_agg(a.id ORDER BY a.id), ARRAY[]::uuid[]) INTO v_assignment_ids
    FROM public.assignments a WHERE p_question_id = ANY(a.question_ids)
      AND public.actor_can_manage_grading_assignment(p_actor_id, a.id);
  ELSE
    IF p_question_patch <> '{}'::jsonb OR p_reason IS NULL OR length(btrim(p_reason)) = 0
      OR length(p_reason) > 2000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'void requires an assignment and reason without a question patch';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = p_void_assignment_id
      AND p_question_id = ANY(a.question_ids) AND public.actor_can_manage_grading_assignment(p_actor_id, a.id)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'actor cannot void this assignment question';
    END IF;
    IF EXISTS (SELECT 1 FROM public.assignment_void_questions WHERE assignment_id = p_void_assignment_id AND question_id = p_question_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'question is already void';
    END IF;
    v_assignment_ids := ARRAY[p_void_assignment_id];
  END IF;

  SELECT COALESCE(array_agg((c->>'assignment_id')::uuid ORDER BY (c->>'assignment_id')::uuid), ARRAY[]::uuid[])
    INTO v_provided_ids FROM pg_catalog.jsonb_array_elements(p_changes) c;
  IF v_assignment_ids IS DISTINCT FROM v_provided_ids THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'affected assignment set changed';
  END IF;
  -- This order also prevents a new attempt from crossing an existing
  -- assignment's FK lock before the corrected question has been committed.
  PERFORM id FROM public.assignments WHERE id = ANY(v_assignment_ids) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.submissions WHERE assignment_id = ANY(v_assignment_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.submissions WHERE assignment_id = ANY(v_assignment_ids) AND status = 'in_progress') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'wait until all affected attempts have finished';
  END IF;
  PERFORM a.id FROM public.submission_answers a JOIN public.submissions s ON s.id = a.submission_id
    WHERE s.assignment_id = ANY(v_assignment_ids) ORDER BY a.id FOR UPDATE OF a;

  -- Validate ALL headers and target-question answer rows before any mutation.
  FOR v_change IN SELECT value FROM pg_catalog.jsonb_array_elements(p_changes) LOOP
    v_assignment_id := (v_change->>'assignment_id')::uuid;
    IF pg_catalog.jsonb_typeof(v_change->'submissions') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_typeof(v_change->'answers') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid assignment grading payload';
    END IF;
    IF (SELECT count(*) FROM public.submissions WHERE assignment_id = v_assignment_id) <> pg_catalog.jsonb_array_length(v_change->'submissions')
      OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(v_change->'submissions')) <> pg_catalog.jsonb_array_length(v_change->'submissions')
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_to_recordset(v_change->'submissions') AS u(id uuid, answer_revision bigint, status text, total_score numeric, max_score numeric)
        LEFT JOIN public.submissions s ON s.id = u.id AND s.assignment_id = v_assignment_id
        WHERE s.id IS NULL OR ROW(s.answer_revision, s.status::text, s.total_score, s.max_score)
          IS DISTINCT FROM ROW(u.answer_revision, u.status, u.total_score, u.max_score)
      ) THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'submission snapshot changed'; END IF;
    IF (SELECT count(*) FROM public.submission_answers a JOIN public.submissions s ON s.id = a.submission_id
        WHERE s.assignment_id = v_assignment_id AND a.question_id = p_question_id) <> pg_catalog.jsonb_array_length(v_change->'answers')
      OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(v_change->'answers')) <> pg_catalog.jsonb_array_length(v_change->'answers')
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_to_recordset(v_change->'answers') AS u(id uuid, submission_id uuid, correct_answer text,
          score numeric, is_correct boolean, max_score numeric, grading_config jsonb, is_void boolean)
        LEFT JOIN public.submission_answers a ON a.id = u.id AND a.question_id = p_question_id AND a.submission_id = u.submission_id
        LEFT JOIN public.submissions s ON s.id = a.submission_id AND s.assignment_id = v_assignment_id
        WHERE a.id IS NULL OR s.id IS NULL OR u.correct_answer IS NULL OR u.score IS NULL OR u.max_score IS NULL
          OR u.score::text IN ('NaN', 'Infinity', '-Infinity') OR u.max_score::text IN ('NaN', 'Infinity', '-Infinity')
          OR u.score < 0 OR u.max_score < 0 OR u.score > u.max_score OR u.is_void IS NULL
          OR (u.grading_config IS NOT NULL AND pg_catalog.jsonb_typeof(u.grading_config) NOT IN ('object','null'))
          OR u.is_void IS DISTINCT FROM (COALESCE(p_void_assignment_id = v_assignment_id, false) OR EXISTS (
            SELECT 1 FROM public.assignment_void_questions q WHERE q.assignment_id = v_assignment_id AND q.question_id = p_question_id))
          OR (u.is_void AND (u.score <> 0 OR u.max_score <> 0 OR u.is_correct IS DISTINCT FROM true))
      ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid or incomplete question grades'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_change->'answers') u
      WHERE pg_catalog.jsonb_typeof(u->'expected') IS DISTINCT FROM 'object'
        OR NOT ((u->'expected') ?& ARRAY['correct_answer','score','is_correct','max_score','score_edited_by',
          'score_edited_at','student_answer','random_values','is_void','grading_config'])) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected answer snapshot is required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_change->'answers') u
      JOIN public.submission_answers a ON a.id = (u->>'id')::uuid
      CROSS JOIN LATERAL pg_catalog.jsonb_to_record(u->'expected') AS e(correct_answer text,score numeric,
        is_correct boolean,max_score numeric,score_edited_by uuid,score_edited_at timestamptz,
        student_answer text,random_values jsonb,is_void boolean,grading_config jsonb)
      WHERE ROW(a.correct_answer,a.score,a.is_correct,a.max_score,a.score_edited_by,a.score_edited_at,
        a.student_answer,COALESCE(NULLIF(a.random_values,'null'::jsonb),'{}'::jsonb),a.is_void,a.grading_config)
      IS DISTINCT FROM ROW(e.correct_answer,e.score,e.is_correct,e.max_score,e.score_edited_by,e.score_edited_at,
        e.student_answer,COALESCE(NULLIF(e.random_values,'null'::jsonb),'{}'::jsonb),e.is_void,NULLIF(e.grading_config,'null'::jsonb))
    ) THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'answer snapshot changed'; END IF;
  END LOOP;

  INSERT INTO public.question_grading_change_batches(question_id,actor_id,kind,void_assignment_id,reason,old_question,new_question)
  VALUES (p_question_id,p_actor_id,CASE WHEN p_void_assignment_id IS NULL THEN 'answer_key' ELSE 'void' END,
    p_void_assignment_id,NULLIF(btrim(p_reason),''),
    CASE WHEN p_void_assignment_id IS NULL THEN pg_catalog.to_jsonb(v_question) ELSE NULL END,
    CASE WHEN p_void_assignment_id IS NULL THEN pg_catalog.to_jsonb(v_new_question) ELSE NULL END)
  RETURNING id INTO v_batch;
  IF p_void_assignment_id IS NULL THEN
    UPDATE public.questions SET org_id = v_new_question.org_id, visibility = v_new_question.visibility,
      team_edit_allowed = v_new_question.team_edit_allowed, category_id = v_new_question.category_id,
      grade_level = v_new_question.grade_level, subject = v_new_question.subject, title = v_new_question.title,
      question_text = v_new_question.question_text, question_type = v_new_question.question_type, difficulty = v_new_question.difficulty,
      is_random = v_new_question.is_random, variables = v_new_question.variables, logic_rules = v_new_question.logic_rules,
      answer_parts = v_new_question.answer_parts, answer_formula = v_new_question.answer_formula, answer_unit = v_new_question.answer_unit,
      answer_tolerance = v_new_question.answer_tolerance, mcq_options = v_new_question.mcq_options, extra_data = v_new_question.extra_data,
      solution_text = v_new_question.solution_text, solution_image_urls = v_new_question.solution_image_urls, tags = v_new_question.tags,
      image_urls = v_new_question.image_urls, requires_work_image = v_new_question.requires_work_image,
      content_fingerprint = v_new_question.content_fingerprint, updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_question_id;
  ELSE
    INSERT INTO public.assignment_void_questions(assignment_id,question_id,reason,actor_id)
      VALUES (p_void_assignment_id,p_question_id,btrim(p_reason),p_actor_id);
  END IF;
  v_previous_flag := pg_catalog.current_setting('korkru.question_grading_change', true);
  PERFORM pg_catalog.set_config('korkru.question_grading_change', 'on', true);
  FOR v_change IN SELECT value FROM pg_catalog.jsonb_array_elements(p_changes) LOOP
    v_assignment_id := (v_change->>'assignment_id')::uuid;
    FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(v_change->'answers') LOOP
      SELECT * INTO v_answer FROM public.submission_answers WHERE id = (v_row->>'id')::uuid;
      UPDATE public.submission_answers SET correct_answer = v_row->>'correct_answer', score = (v_row->>'score')::numeric,
        is_correct = (v_row->>'is_correct')::boolean, max_score = (v_row->>'max_score')::numeric,
        grading_config = NULLIF(v_row->'grading_config','null'::jsonb), is_void = (v_row->>'is_void')::boolean
      WHERE id = v_answer.id;
      INSERT INTO public.question_grading_change_items(batch_id,assignment_id,submission_id,answer_id,old_state,new_state)
      SELECT v_batch,v_assignment_id,a.submission_id,a.id,
        pg_catalog.jsonb_build_object('correct_answer',v_answer.correct_answer,'score',v_answer.score,'is_correct',v_answer.is_correct,
          'max_score',v_answer.max_score,'grading_config',v_answer.grading_config,'is_void',v_answer.is_void,
          'void_original_max_score',v_answer.void_original_max_score),
        pg_catalog.jsonb_build_object('correct_answer',a.correct_answer,'score',a.score,'is_correct',a.is_correct,
          'max_score',a.max_score,'grading_config',a.grading_config,'is_void',a.is_void,
          'void_original_max_score',a.void_original_max_score)
      FROM public.submission_answers a WHERE a.id = v_answer.id;
      v_count := v_count + 1;
    END LOOP;
    SELECT * INTO v_assignment FROM public.assignments WHERE id = v_assignment_id;
    FOR v_submission IN SELECT * FROM public.submissions WHERE assignment_id = v_assignment_id ORDER BY id LOOP
      v_current := 0; v_best := 0;
      IF v_assignment.completion_rule = 'streak' THEN
        FOR v_answer IN SELECT * FROM public.submission_answers WHERE submission_id = v_submission.id AND NOT is_void
          ORDER BY order_index, created_at, id LOOP
          -- Match the live feedback verdict. For true/false an automatically
          -- correct answer may still have explanation points awaiting a teacher;
          -- those manual points do not turn that verdict into a wrong answer.
          IF v_answer.is_correct THEN v_current := v_current + 1;
          ELSIF v_answer.is_correct = false THEN v_current := 0; END IF;
          v_best := GREATEST(v_best, v_current);
        END LOOP;
      END IF;
      UPDATE public.submissions s SET total_score = (SELECT COALESCE(sum(score),0) FROM public.submission_answers WHERE submission_id=s.id),
        max_score = (SELECT COALESCE(sum(max_score),0) FROM public.submission_answers WHERE submission_id=s.id),
        voided_max_score = (SELECT COALESCE(sum(void_original_max_score),0) FROM public.submission_answers WHERE submission_id=s.id),
        answer_revision = answer_revision + 1,
        current_streak = CASE WHEN v_assignment.completion_rule = 'streak' THEN v_current ELSE s.current_streak END,
        best_streak = CASE WHEN v_assignment.completion_rule = 'streak' THEN v_best ELSE s.best_streak END,
        streak_reached = CASE WHEN v_assignment.completion_rule = 'streak' THEN v_best >= v_assignment.streak_target ELSE s.streak_reached END
      WHERE s.id = v_submission.id;
    END LOOP;
  END LOOP;
  PERFORM pg_catalog.set_config('korkru.question_grading_change', COALESCE(v_previous_flag,''), true);
  RETURN pg_catalog.jsonb_build_object('batch_id',v_batch,'assignment_count',cardinality(v_assignment_ids),'answer_count',v_count);
END; $$;
REVOKE ALL ON FUNCTION public.apply_question_grading_change(uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_question_grading_change(uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,boolean) TO service_role;


-- A failed fresh INSERT with an explicit stale-grading error leaves an empty
-- header. Cleanup must lock the same parent as the answer-write guard, so a
-- concurrent insert either wins (and prevents deletion) or observes deletion.
CREATE FUNCTION public.discard_empty_grading_attempt(p_submission_id uuid, p_student_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.submissions%ROWTYPE;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'attempt cleanup requires the server role';
  END IF;
  SELECT * INTO v FROM public.submissions
    WHERE id = p_submission_id AND student_id = p_student_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'in_progress' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.submission_answers WHERE submission_id = v.id) THEN RETURN false; END IF;
  DELETE FROM public.submissions WHERE id = v.id;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.discard_empty_grading_attempt(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_empty_grading_attempt(uuid,uuid) TO service_role;
