-- Assignment-local grading parts. The original answer weight never changes.
CREATE TABLE public.assignment_question_grading_parts (
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  work_share numeric NOT NULL CHECK (work_share BETWEEN 0 AND 1 AND work_share::text NOT IN ('NaN','Infinity','-Infinity')),
  updated_by uuid NOT NULL REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, question_id)
);
CREATE TABLE public.grading_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_id uuid REFERENCES public.submission_answers(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  kind text NOT NULL CHECK (kind IN ('configure','review')),
  old_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX grading_review_events_assignment_idx ON public.grading_review_events(assignment_id,created_at DESC);
ALTER TABLE public.assignment_question_grading_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assignment_question_grading_parts,public.grading_review_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.assignment_question_grading_parts,public.grading_review_events TO service_role;
-- This private helper was originally callable only from research functions.
-- Allocation validation now invokes it as the service role as well.
GRANT EXECUTE ON FUNCTION public.education_research_question_max_score(public.questions) TO service_role;

ALTER TABLE public.submission_answers
  ADD COLUMN answer_score numeric,
  ADD COLUMN work_score numeric,
  ADD COLUMN answer_max_score numeric,
  ADD COLUMN work_max_score numeric,
  ADD COLUMN answer_reviewed_at timestamptz,
  ADD COLUMN work_reviewed_at timestamptz;

-- Attachment presence used to receive automatic full credit. Only a teacher's
-- explicit previous score is retained; receiving a file is no longer a grade.
UPDATE public.submission_answers a SET score=0,is_correct=NULL
FROM public.questions q WHERE q.id=a.question_id AND q.question_type='file_upload'
  AND a.score_edited_by IS NULL AND NOT a.is_void;
UPDATE public.submission_answers SET answer_max_score=max_score,work_max_score=0,
  answer_score=score,work_score=NULL,
  answer_reviewed_at=CASE WHEN score_edited_by IS NOT NULL THEN COALESCE(score_edited_at,clock_timestamp()) ELSE NULL END;
UPDATE public.submissions s SET total_score=(SELECT COALESCE(sum(a.score),0) FROM public.submission_answers a WHERE a.submission_id=s.id)
WHERE s.status IN ('submitted','graded');

ALTER TABLE public.submission_answers ADD CONSTRAINT submission_answer_grading_parts_valid CHECK (
  answer_max_score >= 0 AND work_max_score >= 0 AND answer_max_score+work_max_score=max_score
  AND answer_max_score::text NOT IN ('NaN','Infinity','-Infinity') AND work_max_score::text NOT IN ('NaN','Infinity','-Infinity')
  AND COALESCE(answer_score,0) BETWEEN 0 AND answer_max_score
  AND COALESCE(work_score,0) BETWEEN 0 AND work_max_score
  AND COALESCE(answer_score,0)::text NOT IN ('NaN','Infinity','-Infinity')
  AND COALESCE(work_score,0)::text NOT IN ('NaN','Infinity','-Infinity')
);

CREATE FUNCTION public.apply_answer_grading_parts() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_share numeric; v_type text; v_assignment uuid; v_carried public.submission_answers%ROWTYPE;
BEGIN
  IF NEW.is_void THEN
    IF TG_OP='INSERT' AND COALESCE(NEW.carried_over,false) AND COALESCE(NEW.void_original_max_score,0)=0 THEN
      SELECT a.* INTO v_carried FROM public.submission_answers a
        JOIN public.submissions prior ON prior.id=a.submission_id
        JOIN public.submissions fresh ON fresh.id=NEW.submission_id
        WHERE prior.assignment_id=fresh.assignment_id AND prior.student_id=fresh.student_id
          AND prior.id<>fresh.id AND prior.status IN ('submitted','graded') AND a.question_id=NEW.question_id AND a.is_void
          AND ROW(a.score,a.max_score,a.score_edited_by,a.score_edited_at,a.student_answer,a.correct_answer,a.random_values,a.option_order,a.is_correct,a.work_images,a.math_input_modes)
            IS NOT DISTINCT FROM ROW(NEW.score,NEW.max_score,NEW.score_edited_by,NEW.score_edited_at,NEW.student_answer,NEW.correct_answer,NEW.random_values,NEW.option_order,NEW.is_correct,NEW.work_images,NEW.math_input_modes)
        ORDER BY prior.created_at DESC,a.order_index DESC,a.created_at DESC LIMIT 1;
      IF v_carried.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='carried void snapshot unavailable'; END IF;
      NEW.void_original_max_score:=v_carried.void_original_max_score;
    END IF;
    NEW.answer_max_score:=0; NEW.work_max_score:=0;
    NEW.answer_score:=0; NEW.work_score:=0; NEW.score:=0; NEW.is_correct:=true;
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT s.assignment_id INTO v_assignment FROM public.submissions s WHERE s.id=NEW.submission_id;
    SELECT COALESCE(p.work_share,0) INTO v_share FROM public.assignments a
      LEFT JOIN public.assignment_question_grading_parts p ON p.assignment_id=a.id AND p.question_id=NEW.question_id
      WHERE a.id=v_assignment;
    IF v_share IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='attempt unavailable'; END IF;
    -- Older atomic SEB-start functions copy whole scores rather than these new
    -- columns. Recover the exact carried grade only within the same student's
    -- assignment; matching every grade/student snapshot avoids inventing a
    -- whole-answer override from a work-only teacher review.
    IF COALESCE(NEW.carried_over,false) AND NEW.answer_max_score IS NULL AND NEW.work_max_score IS NULL THEN
      SELECT a.* INTO v_carried FROM public.submission_answers a
        JOIN public.submissions prior ON prior.id=a.submission_id
        JOIN public.submissions fresh ON fresh.id=NEW.submission_id
        WHERE prior.assignment_id=fresh.assignment_id AND prior.student_id=fresh.student_id
          AND prior.id<>fresh.id AND prior.status IN ('submitted','graded') AND a.question_id=NEW.question_id
          AND ROW(a.score,a.max_score,a.score_edited_by,a.score_edited_at,a.student_answer,a.correct_answer,a.random_values,a.option_order,a.is_correct,a.work_images,a.math_input_modes)
            IS NOT DISTINCT FROM ROW(NEW.score,NEW.max_score,NEW.score_edited_by,NEW.score_edited_at,NEW.student_answer,NEW.correct_answer,NEW.random_values,NEW.option_order,NEW.is_correct,NEW.work_images,NEW.math_input_modes)
        ORDER BY prior.created_at DESC,a.order_index DESC,a.created_at DESC LIMIT 1;
      IF v_carried.id IS NOT NULL THEN
        NEW.answer_score:=v_carried.answer_score; NEW.work_score:=v_carried.work_score;
        NEW.answer_max_score:=v_carried.answer_max_score; NEW.work_max_score:=v_carried.work_max_score;
        NEW.answer_reviewed_at:=v_carried.answer_reviewed_at; NEW.work_reviewed_at:=v_carried.work_reviewed_at;
      ELSE
        RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='carried grading snapshot unavailable';
      END IF;
    END IF;
    IF COALESCE(NEW.carried_over,false) AND NEW.answer_max_score IS NOT NULL AND NEW.work_max_score IS NOT NULL THEN
      IF NEW.answer_max_score IS DISTINCT FROM LEAST(NEW.max_score,round(NEW.max_score*(1-v_share),2))
        OR NEW.work_max_score IS DISTINCT FROM NEW.max_score-NEW.answer_max_score THEN
        RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='grading allocation changed while starting attempt';
      END IF;
      NEW.score:=COALESCE(NEW.answer_score,0)+COALESCE(NEW.work_score,0);
      RETURN NEW;
    END IF;
    NEW.answer_max_score:=LEAST(NEW.max_score,round(NEW.max_score*(1-v_share),2));
    NEW.work_max_score:=NEW.max_score-NEW.answer_max_score;
    IF COALESCE(NEW.carried_over,false) AND NEW.score_edited_by IS NOT NULL THEN
      NEW.answer_score:=CASE WHEN NEW.max_score=0 THEN 0 ELSE LEAST(NEW.answer_max_score,round(NEW.score*NEW.answer_max_score/NEW.max_score,2)) END;
      NEW.work_score:=NEW.score-NEW.answer_score;
      NEW.answer_reviewed_at:=CASE WHEN NEW.answer_max_score>0 THEN COALESCE(NEW.score_edited_at,clock_timestamp()) ELSE NULL END;
      NEW.work_reviewed_at:=CASE WHEN NEW.work_max_score>0 THEN COALESCE(NEW.score_edited_at,clock_timestamp()) ELSE NULL END;
    ELSE
      SELECT COALESCE(NEW.grading_config->>'question_type',q.question_type::text) INTO v_type
        FROM public.questions q WHERE q.id=NEW.question_id;
      NEW.answer_score:=CASE WHEN v_type IN ('essay','file_upload') THEN NULL
        WHEN NEW.max_score=0 THEN 0 ELSE LEAST(NEW.answer_max_score,round(COALESCE(NEW.score,0)*NEW.answer_max_score/NEW.max_score,2)) END;
      NEW.work_score:=NULL; NEW.answer_reviewed_at:=NULL; NEW.work_reviewed_at:=NULL;
      NEW.score:=COALESCE(NEW.answer_score,0);
      IF v_type IN ('essay','file_upload') THEN NEW.is_correct:=NULL; END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- Only the guarded review/configuration functions supply component values.
  IF current_user='service_role' AND pg_catalog.current_setting('korkru.grading_review_write',true)='on' THEN
    NEW.score:=COALESCE(NEW.answer_score,0)+COALESCE(NEW.work_score,0);
    RETURN NEW;
  END IF;
  IF OLD.answer_reviewed_at IS NOT NULL THEN
    -- A global key correction keeps a teacher's explicit answer override.
    NEW.answer_score:=OLD.answer_score; NEW.work_score:=OLD.work_score;
    NEW.answer_max_score:=OLD.answer_max_score; NEW.work_max_score:=OLD.work_max_score;
    NEW.answer_reviewed_at:=OLD.answer_reviewed_at; NEW.work_reviewed_at:=OLD.work_reviewed_at;
    NEW.score:=COALESCE(OLD.answer_score,0)+COALESCE(OLD.work_score,0);
  ELSIF NEW.score IS DISTINCT FROM OLD.score OR NEW.is_correct IS DISTINCT FROM OLD.is_correct
    OR pg_catalog.current_setting('korkru.question_grading_change',true)='on' THEN
    -- Finalization and key correction still supply a FULL-RAW automatic score.
    -- Convert once to the answer share; never turn unreviewed work into points.
    SELECT COALESCE(NEW.grading_config->>'question_type',q.question_type::text) INTO v_type
      FROM public.questions q WHERE q.id=NEW.question_id;
    NEW.answer_score:=CASE WHEN v_type IN ('essay','file_upload') THEN NULL
      WHEN NEW.max_score=0 THEN 0 ELSE LEAST(NEW.answer_max_score,round(COALESCE(NEW.score,0)*NEW.answer_max_score/NEW.max_score,2)) END;
    NEW.work_score:=OLD.work_score;
    NEW.score:=COALESCE(NEW.answer_score,0)+CASE WHEN OLD.work_reviewed_at IS NULL THEN 0 ELSE COALESCE(OLD.work_score,0) END;
    IF v_type IN ('essay','file_upload') THEN NEW.is_correct:=NULL; END IF;
  END IF;
  -- A displayed automatic result is also a score revision. Do not let a
  -- teacher overwrite a newly corrected answer using an old screen's token.
  -- Review ownership/timestamps remain separate and are never fabricated.
  IF ROW(NEW.score,NEW.is_correct,NEW.correct_answer,NEW.grading_config,NEW.answer_score,NEW.work_score)
    IS DISTINCT FROM ROW(OLD.score,OLD.is_correct,OLD.correct_answer,OLD.grading_config,OLD.answer_score,OLD.work_score) THEN
    NEW.score_edited_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER zz_apply_answer_grading_parts BEFORE INSERT OR UPDATE ON public.submission_answers
FOR EACH ROW EXECUTE FUNCTION public.apply_answer_grading_parts();
REVOKE ALL ON FUNCTION public.apply_answer_grading_parts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_answer_grading_parts() TO service_role;

-- Match scoreParts(): manual answer components, unreviewed work, and required
-- written-work questions whose teacher has not allocated the raw weight yet.
-- Frozen answer rules remain authoritative after a question-bank edit.
CREATE FUNCTION public.has_pending_grading_review(p_submission_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.submission_answers a
      JOIN public.submissions s ON s.id=a.submission_id
      JOIN public.assignments task ON task.id=s.assignment_id
      JOIN public.questions q ON q.id=a.question_id
      CROSS JOIN LATERAL (SELECT COALESCE(a.grading_config->>'question_type',q.question_type::text) AS type,
        COALESCE(NULLIF(a.grading_config->'extra_data','null'::jsonb),q.extra_data,'{}'::jsonb) AS extra) rules
    WHERE a.submission_id=p_submission_id AND NOT a.is_void AND a.max_score>0 AND (
      (a.answer_max_score>0 AND a.answer_reviewed_at IS NULL AND (
        a.is_correct IS NULL OR rules.type IN ('essay','file_upload')
        OR (rules.type='true_false' AND COALESCE(rules.extra->>'explanation_mode','always')<>'none')
        OR (rules.type='fill_blank' AND EXISTS(
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rules.extra->'blanks')='array' THEN rules.extra->'blanks' ELSE '[]'::jsonb END) b
          WHERE COALESCE(b->>'type',CASE WHEN rules.extra->>'grading_mode'='manual' THEN 'text' ELSE 'fixed' END)='text'))
        OR (rules.type='composite' AND EXISTS(
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rules.extra->'parts')='array' THEN rules.extra->'parts' ELSE '[]'::jsonb END) part
          WHERE part->>'type'='fill_blank' AND (
            part->'blanks'->0 IS NULL OR part->'blanks'->0='null'::jsonb OR COALESCE(part->'blanks'->0->>'type','fixed')='text')))
      ))
      OR (a.work_max_score>0 AND a.work_reviewed_at IS NULL)
      OR (rules.type='written' AND (q.requires_work_image OR task.require_work_image)
        AND NOT EXISTS(SELECT 1 FROM public.assignment_question_grading_parts p WHERE p.assignment_id=s.assignment_id AND p.question_id=a.question_id))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.has_pending_grading_review(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_pending_grading_review(uuid) TO service_role;

-- The older answer-key correction RPC is intentionally left unchanged. Its
-- transaction-local flag reaches the header UPDATE after all answer triggers,
-- so this new migration can normalize the resulting review state atomically.
CREATE FUNCTION public.normalize_question_change_review_status() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user='service_role' AND NEW.status IN ('submitted','graded')
    AND pg_catalog.current_setting('korkru.question_grading_change',true)='on' THEN
    IF public.has_pending_grading_review(NEW.id) THEN NEW.status:='submitted';
    ELSE NEW.status:='graded'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER normalize_question_change_review_status BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.normalize_question_change_review_status();
REVOKE ALL ON FUNCTION public.normalize_question_change_review_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_question_change_review_status() TO service_role;
-- Legacy automatic file grades were removed above; reflect any newly pending
-- review in their finished headers as well as in the stored answer scores.
UPDATE public.submissions s SET status=CASE WHEN public.has_pending_grading_review(s.id)
  THEN 'submitted'::public.submission_status ELSE 'graded'::public.submission_status END
WHERE s.status IN ('submitted','graded');

CREATE FUNCTION public.save_grading_review(p_actor_id uuid,p_assignment_id uuid,p_answer_id uuid,
  p_expected_score_edited_at timestamptz,p_answer_score numeric,p_work_score numeric,
  p_update_answer boolean,p_update_work boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_answer public.submission_answers%ROWTYPE; v_submission public.submissions%ROWTYPE; v_assignment public.assignments%ROWTYPE;
  v_before jsonb; v_now timestamptz:=clock_timestamp(); v_flag text; v_current integer:=0; v_best integer:=0;
BEGIN
  IF current_user<>'service_role' OR NOT public.actor_can_manage_grading_assignment(p_actor_id,p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='grading assignment unavailable'; END IF;
  SELECT * INTO v_assignment FROM public.assignments WHERE id=p_assignment_id FOR SHARE;
  SELECT * INTO v_submission FROM public.submissions WHERE id=(SELECT submission_id FROM public.submission_answers WHERE id=p_answer_id)
    AND assignment_id=p_assignment_id FOR UPDATE;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='answer outside assignment'; END IF;
  IF v_submission.status NOT IN ('submitted','graded') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='attempt unfinished'; END IF;
  SELECT * INTO v_answer FROM public.submission_answers WHERE id=p_answer_id AND submission_id=v_submission.id FOR UPDATE;
  IF v_answer.id IS NULL OR v_answer.is_void OR v_answer.max_score<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='answer is void or unavailable'; END IF;
  IF v_answer.score_edited_at IS DISTINCT FROM p_expected_score_edited_at THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='score revision changed'; END IF;
  IF p_update_answer IS NULL OR p_update_work IS NULL OR NOT(p_update_answer OR p_update_work)
    OR (p_update_answer AND (p_answer_score IS NULL OR p_answer_score::text IN ('NaN','Infinity','-Infinity') OR p_answer_score<0 OR p_answer_score>v_answer.answer_max_score OR v_answer.answer_max_score<=0))
    OR (p_update_work AND (p_work_score IS NULL OR p_work_score::text IN ('NaN','Infinity','-Infinity') OR p_work_score<0 OR p_work_score>v_answer.work_max_score OR v_answer.work_max_score<=0)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading component score'; END IF;
  v_before:=pg_catalog.to_jsonb(v_answer);
  v_flag:=pg_catalog.current_setting('korkru.grading_review_write',true);
  PERFORM pg_catalog.set_config('korkru.grading_review_write','on',true);
  UPDATE public.submission_answers SET
    answer_score=CASE WHEN p_update_answer THEN LEAST(answer_max_score,round(p_answer_score,2)) ELSE answer_score END,
    work_score=CASE WHEN p_update_work THEN LEAST(work_max_score,round(p_work_score,2)) ELSE work_score END,
    answer_reviewed_at=CASE WHEN p_update_answer THEN v_now ELSE answer_reviewed_at END,
    work_reviewed_at=CASE WHEN p_update_work THEN v_now ELSE work_reviewed_at END,
    score_edited_by=p_actor_id,score_edited_at=v_now,
    is_correct=CASE WHEN p_update_answer THEN round(p_answer_score,2)>=answer_max_score ELSE is_correct END
    WHERE id=p_answer_id;
  IF v_assignment.completion_rule='streak' THEN
    FOR v_answer IN SELECT * FROM public.submission_answers WHERE submission_id=v_submission.id AND NOT is_void
      ORDER BY order_index,created_at,id LOOP
      -- Preserve the existing automatic verdict semantics, including a correct
      -- true/false choice whose explanation still awaits teacher points.
      IF v_answer.is_correct THEN v_current:=v_current+1;
      ELSIF v_answer.is_correct=false THEN v_current:=0; END IF;
      v_best:=GREATEST(v_best,v_current);
    END LOOP;
  END IF;
  UPDATE public.submissions s SET total_score=(SELECT COALESCE(sum(score),0) FROM public.submission_answers WHERE submission_id=s.id),
    status=CASE WHEN public.has_pending_grading_review(s.id) THEN 'submitted'::public.submission_status ELSE 'graded'::public.submission_status END,
    answer_revision=answer_revision+1,
    current_streak=CASE WHEN v_assignment.completion_rule='streak' THEN v_current ELSE s.current_streak END,
    best_streak=CASE WHEN v_assignment.completion_rule='streak' THEN v_best ELSE s.best_streak END,
    streak_reached=CASE WHEN v_assignment.completion_rule='streak' THEN v_best>=v_assignment.streak_target ELSE s.streak_reached END
    WHERE id=v_submission.id;
  INSERT INTO public.grading_review_events(assignment_id,question_id,answer_id,actor_id,kind,old_state,new_state)
    SELECT p_assignment_id,a.question_id,a.id,p_actor_id,'review',v_before,pg_catalog.to_jsonb(a)
      FROM public.submission_answers a WHERE a.id=p_answer_id;
  PERFORM pg_catalog.set_config('korkru.grading_review_write',COALESCE(v_flag,''),true);
  RETURN pg_catalog.jsonb_build_object('submission_id',v_submission.id,'answer_id',p_answer_id);
END; $$;
REVOKE ALL ON FUNCTION public.save_grading_review(uuid,uuid,uuid,timestamptz,numeric,numeric,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_grading_review(uuid,uuid,uuid,timestamptz,numeric,numeric,boolean,boolean) TO service_role;

CREATE FUNCTION public.configure_assignment_question_grading_parts(p_actor_id uuid,p_assignment_id uuid,p_question_id uuid,
  p_answer_max_score numeric,p_work_max_score numeric,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_question public.questions%ROWTYPE; v_assignment public.assignments%ROWTYPE;
  v_policy public.assignment_question_grading_parts%ROWTYPE; v_answer public.submission_answers%ROWTYPE;
  v_reference numeric; v_share numeric; v_answer_max numeric; v_work_max numeric; v_answer_score numeric; v_work_score numeric;
  v_now timestamptz:=clock_timestamp(); v_before jsonb; v_flag text; v_legacy_teacher boolean;
  v_submission public.submissions%ROWTYPE; v_current integer; v_best integer;
BEGIN
  IF current_user<>'service_role' OR NOT public.actor_can_manage_grading_assignment(p_actor_id,p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='grading assignment unavailable'; END IF;
  -- Match the existing key-correction/answer-insert lock order. Taking the
  -- question lock also serializes a newly arriving answer from another scope.
  SELECT * INTO v_question FROM public.questions WHERE id=p_question_id FOR UPDATE;
  SELECT * INTO v_assignment FROM public.assignments WHERE id=p_assignment_id FOR UPDATE;
  IF v_question.id IS NULL OR v_assignment.id IS NULL OR NOT(p_question_id=ANY(v_assignment.question_ids))
    OR EXISTS(SELECT 1 FROM public.assignment_void_questions WHERE assignment_id=p_assignment_id AND question_id=p_question_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='question unavailable or void'; END IF;
  SELECT * INTO v_policy FROM public.assignment_question_grading_parts WHERE assignment_id=p_assignment_id AND question_id=p_question_id FOR UPDATE;
  IF v_policy.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='allocation revision changed'; END IF;
  IF p_answer_max_score IS NULL OR p_work_max_score IS NULL OR p_answer_max_score<0 OR p_work_max_score<0
    OR p_answer_max_score::text IN ('NaN','Infinity','-Infinity') OR p_work_max_score::text IN ('NaN','Infinity','-Infinity')
    OR p_answer_max_score+p_work_max_score<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid allocation'; END IF;
  v_reference:=COALESCE(NULLIF(v_assignment.question_points->>p_question_id::text,'')::numeric,
    CASE WHEN v_question.question_type='true_false' THEN
      COALESCE((v_question.extra_data->>'score_answer')::numeric,1)
        *(1+CASE WHEN jsonb_typeof(v_question.extra_data->'statements')='array' THEN jsonb_array_length(v_question.extra_data->'statements') ELSE 0 END)
      +CASE WHEN COALESCE(v_question.extra_data->>'explanation_mode','always')<>'none'
        THEN COALESCE((v_question.extra_data->>'score_explanation')::numeric,1) ELSE 0 END
    ELSE public.education_research_question_max_score(v_question) END);
  IF p_answer_max_score+p_work_max_score IS DISTINCT FROM v_reference THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='allocation must preserve question raw maximum'; END IF;
  v_share:=p_work_max_score/v_reference;
  PERFORM id FROM public.submissions WHERE assignment_id=p_assignment_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.submissions WHERE assignment_id=p_assignment_id AND status='in_progress') THEN
    RAISE EXCEPTION USING ERRCODE='PT425',MESSAGE='active attempts prevent allocation change'; END IF;
  PERFORM a.id FROM public.submission_answers a JOIN public.submissions s ON s.id=a.submission_id
    WHERE s.assignment_id=p_assignment_id AND a.question_id=p_question_id ORDER BY a.id FOR UPDATE OF a;
  v_flag:=pg_catalog.current_setting('korkru.grading_review_write',true);
  PERFORM pg_catalog.set_config('korkru.grading_review_write','on',true);
  FOR v_answer IN SELECT a.* FROM public.submission_answers a JOIN public.submissions s ON s.id=a.submission_id
    WHERE s.assignment_id=p_assignment_id AND a.question_id=p_question_id AND NOT a.is_void ORDER BY a.id LOOP
    v_before:=pg_catalog.to_jsonb(v_answer);
    v_answer_max:=LEAST(v_answer.max_score,round(v_answer.max_score*(1-v_share),2));
    v_work_max:=v_answer.max_score-v_answer_max;
    v_legacy_teacher:=v_policy.assignment_id IS NULL AND v_answer.score_edited_by IS NOT NULL;
    IF v_legacy_teacher OR (v_answer.answer_reviewed_at IS NOT NULL AND v_answer.work_reviewed_at IS NOT NULL) THEN
      v_answer_score:=CASE WHEN v_answer.max_score=0 THEN 0 ELSE LEAST(v_answer_max,round(v_answer.score*v_answer_max/v_answer.max_score,2)) END;
      v_work_score:=v_answer.score-v_answer_score;
    ELSIF v_answer.answer_reviewed_at IS NOT NULL THEN
      v_answer_score:=v_answer.score; v_work_score:=NULL;
    ELSE
      v_answer_score:=CASE WHEN COALESCE(v_answer.answer_max_score,0)=0 THEN 0
        ELSE LEAST(v_answer_max,round(COALESCE(v_answer.answer_score,0)*v_answer_max/v_answer.answer_max_score,2)) END;
      v_work_score:=CASE WHEN v_answer.work_reviewed_at IS NOT NULL THEN v_answer.score-v_answer_score ELSE NULL END;
    END IF;
    IF v_answer_score<0 OR v_answer_score>v_answer_max OR COALESCE(v_work_score,0)<0 OR COALESCE(v_work_score,0)>v_work_max THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='allocation cannot preserve existing reviewed total'; END IF;
    UPDATE public.submission_answers SET answer_max_score=v_answer_max,work_max_score=v_work_max,
      answer_score=v_answer_score,work_score=CASE WHEN v_work_max=0 THEN NULL ELSE v_work_score END,
      is_correct=CASE WHEN v_answer.answer_reviewed_at IS NOT NULL OR v_legacy_teacher
        THEN v_answer_max>0 AND v_answer_score>=v_answer_max ELSE is_correct END,
      answer_reviewed_at=CASE WHEN v_legacy_teacher THEN COALESCE(v_answer.answer_reviewed_at,v_answer.score_edited_at,v_now) ELSE answer_reviewed_at END,
      work_reviewed_at=CASE WHEN v_legacy_teacher THEN COALESCE(v_answer.answer_reviewed_at,v_answer.score_edited_at,v_now) ELSE work_reviewed_at END,
      score_edited_at=v_now WHERE id=v_answer.id;
    INSERT INTO public.grading_review_events(assignment_id,question_id,answer_id,actor_id,kind,old_state,new_state)
      SELECT p_assignment_id,p_question_id,a.id,p_actor_id,'configure',v_before,pg_catalog.to_jsonb(a)
        FROM public.submission_answers a WHERE a.id=v_answer.id;
  END LOOP;
  INSERT INTO public.assignment_question_grading_parts(assignment_id,question_id,work_share,updated_by,updated_at)
    VALUES(p_assignment_id,p_question_id,v_share,p_actor_id,v_now)
    ON CONFLICT(assignment_id,question_id) DO UPDATE SET work_share=EXCLUDED.work_share,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
  -- Even an unused question has an auditable policy change.
  INSERT INTO public.grading_review_events(assignment_id,question_id,actor_id,kind,old_state,new_state)
    VALUES(p_assignment_id,p_question_id,p_actor_id,'configure',COALESCE(pg_catalog.to_jsonb(v_policy),'{}'::jsonb),
      pg_catalog.jsonb_build_object('work_share',v_share,'updated_at',v_now));
  FOR v_submission IN SELECT * FROM public.submissions WHERE assignment_id=p_assignment_id ORDER BY id LOOP
    v_current:=0; v_best:=0;
    IF v_assignment.completion_rule='streak' THEN
      FOR v_answer IN SELECT * FROM public.submission_answers WHERE submission_id=v_submission.id AND NOT is_void
        ORDER BY order_index,created_at,id LOOP
        -- Preserve automatic true/false verdicts, but include explicit teacher
        -- answer verdicts recomputed from their newly allocated answer ceiling.
        IF v_answer.is_correct THEN v_current:=v_current+1;
        ELSIF v_answer.is_correct=false THEN v_current:=0; END IF;
        v_best:=GREATEST(v_best,v_current);
      END LOOP;
    END IF;
    UPDATE public.submissions s SET total_score=(SELECT COALESCE(sum(score),0) FROM public.submission_answers WHERE submission_id=s.id),
      status=CASE WHEN public.has_pending_grading_review(s.id) THEN 'submitted'::public.submission_status ELSE 'graded'::public.submission_status END,
      answer_revision=answer_revision+1,
      current_streak=CASE WHEN v_assignment.completion_rule='streak' THEN v_current ELSE s.current_streak END,
      best_streak=CASE WHEN v_assignment.completion_rule='streak' THEN v_best ELSE s.best_streak END,
      streak_reached=CASE WHEN v_assignment.completion_rule='streak' THEN v_best>=v_assignment.streak_target ELSE s.streak_reached END
      WHERE id=v_submission.id;
  END LOOP;
  PERFORM pg_catalog.set_config('korkru.grading_review_write',COALESCE(v_flag,''),true);
  RETURN pg_catalog.jsonb_build_object('work_share',v_share,'updated_at',v_now);
END; $$;
REVOKE ALL ON FUNCTION public.configure_assignment_question_grading_parts(uuid,uuid,uuid,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_assignment_question_grading_parts(uuid,uuid,uuid,numeric,numeric,timestamptz) TO service_role;
