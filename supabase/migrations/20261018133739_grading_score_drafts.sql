-- Grader-private saved scores. Publication alone changes live grading rows.
CREATE TABLE public.grading_score_drafts (
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  answer_id uuid NOT NULL REFERENCES public.submission_answers(id) ON DELETE CASCADE,
  base_score_edited_at timestamptz,
  answer_score numeric,
  work_score numeric,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_id, assignment_id, answer_id),
  CHECK (answer_score IS NOT NULL OR work_score IS NOT NULL),
  CHECK (answer_score IS NULL OR answer_score BETWEEN 0 AND 1000000),
  CHECK (work_score IS NULL OR work_score BETWEEN 0 AND 1000000)
);
CREATE INDEX grading_score_drafts_answer_idx ON public.grading_score_drafts(answer_id);
CREATE INDEX grading_score_drafts_assignment_idx ON public.grading_score_drafts(assignment_id);
ALTER TABLE public.grading_score_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grading_score_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grading_score_drafts TO service_role;

-- Same-request retries return the original committed result, including after
-- drafts have been deleted by publication. Payload equality prevents token reuse.
CREATE TABLE public.grading_draft_requests (
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  outcome jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_id, request_id)
);
CREATE INDEX grading_draft_requests_assignment_idx ON public.grading_draft_requests(assignment_id);
ALTER TABLE public.grading_draft_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grading_draft_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.grading_draft_requests TO service_role;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'assignment_reminder','co_teacher_invite','extension_granted','classroom_post','homeroom_weekly_digest','grade_published'
));
ALTER TABLE public.notifications ADD COLUMN grading_publication_request_id uuid;
CREATE UNIQUE INDEX notifications_grading_publication_recipient_idx
  ON public.notifications(actor_id,grading_publication_request_id,recipient_id)
  WHERE type='grade_published';

CREATE FUNCTION public.read_grading_drafts(p_actor_id uuid,p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user<>'service_role' OR NOT public.actor_can_manage_grading_assignment(p_actor_id,p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='grading assignment unavailable'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'answerId',d.answer_id,'updatedAt',d.updated_at,'answerScore',d.answer_score,'workScore',d.work_score
  )) || jsonb_build_object('expectedScoreEditedAt',d.base_score_edited_at) ORDER BY d.answer_id),'[]'::jsonb)
    FROM public.grading_score_drafts d
    JOIN public.submission_answers a ON a.id=d.answer_id
    JOIN public.submissions s ON s.id=a.submission_id AND s.assignment_id=d.assignment_id
    WHERE d.actor_id=p_actor_id AND d.assignment_id=p_assignment_id);
END; $$;
REVOKE ALL ON FUNCTION public.read_grading_drafts(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_grading_drafts(uuid,uuid) TO service_role;

-- Both public wrappers share validation, lock order and idempotency. Each RPC
-- invocation is one transaction; any row/notification failure rolls it all back.
CREATE FUNCTION public.write_grading_drafts(p_actor_id uuid,p_assignment_id uuid,p_request_id uuid,p_items jsonb,p_publish boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  v_assignment public.assignments%ROWTYPE;
  v_answer public.submission_answers%ROWTYPE;
  v_draft public.grading_score_drafts%ROWTYPE;
  v_request public.grading_draft_requests%ROWTYPE;
  v_item jsonb; v_ids uuid[]:='{}'; v_answer_id uuid;
  v_base timestamptz; v_expected_draft timestamptz; v_updated timestamptz;
  v_answer_score numeric; v_work_score numeric; v_remove boolean; v_exists boolean;
  v_payload jsonb; v_outcome jsonb; v_drafts jsonb:='[]'; v_published jsonb:='[]'; v_deleted jsonb:='[]';
  v_notification_count integer:=0;
BEGIN
  IF current_user<>'service_role' OR NOT public.actor_can_manage_grading_assignment(p_actor_id,p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='grading assignment unavailable'; END IF;
  IF p_request_id IS NULL OR p_publish IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading batch'; END IF;
  -- Serialize this grader's assignment drafts even when a draft does not exist.
  PERFORM pg_advisory_xact_lock(hashtextextended('grading-drafts:'||p_actor_id::text||':'||p_assignment_id::text,0));
  PERFORM id FROM public.users WHERE id=p_actor_id FOR SHARE;
  SELECT * INTO v_assignment FROM public.assignments WHERE id=p_assignment_id FOR SHARE;
  IF NOT public.actor_can_manage_grading_assignment(p_actor_id,p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='grading assignment unavailable'; END IF;
  v_payload:=jsonb_build_object('assignmentId',p_assignment_id,'publish',p_publish,'items',p_items);
  SELECT * INTO v_request FROM public.grading_draft_requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_request.assignment_id<>p_assignment_id OR v_request.request_payload<>v_payload THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='grading request payload changed'; END IF;
    RETURN v_request.outcome;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item->'answerId') IS DISTINCT FROM 'string'
      OR NOT (v_item->>'answerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR NOT (v_item ? 'expectedScoreEditedAt') OR NOT (v_item ? 'expectedDraftUpdatedAt')
      OR jsonb_typeof(v_item->'expectedScoreEditedAt') NOT IN ('null','string')
      OR jsonb_typeof(v_item->'expectedDraftUpdatedAt') NOT IN ('null','string')
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN ('answerId','expectedScoreEditedAt','expectedDraftUpdatedAt','answerScore','workScore','remove')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading draft item'; END IF;
    IF (jsonb_typeof(v_item->'expectedScoreEditedAt')='string' AND NOT(v_item->>'expectedScoreEditedAt' ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$'))
      OR (jsonb_typeof(v_item->'expectedDraftUpdatedAt')='string' AND NOT(v_item->>'expectedDraftUpdatedAt' ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading revision'; END IF;
    v_answer_id:=(v_item->>'answerId')::uuid;
    IF v_answer_id=ANY(v_ids) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate grading answer'; END IF;
    v_ids:=array_append(v_ids,v_answer_id);
    v_remove:=COALESCE(v_item->'remove'='true'::jsonb,false);
    IF (v_item ? 'remove' AND NOT v_remove) OR (v_remove AND (p_publish OR v_item ? 'answerScore' OR v_item ? 'workScore'))
      OR (NOT v_remove AND NOT(v_item ? 'answerScore' OR v_item ? 'workScore')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading draft operation'; END IF;
    IF (v_item ? 'answerScore' AND jsonb_typeof(v_item->'answerScore') IS DISTINCT FROM 'number')
      OR (v_item ? 'workScore' AND jsonb_typeof(v_item->'workScore') IS DISTINCT FROM 'number') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading score'; END IF;
  END LOOP;

  -- All submission locks precede answer locks, matching save_grading_review.
  -- Deterministic order prevents two graders' overlapping batches deadlocking.
  IF (SELECT count(*) FROM public.submission_answers a JOIN public.submissions s ON s.id=a.submission_id
    WHERE s.assignment_id=p_assignment_id AND a.id=ANY(v_ids))<>cardinality(v_ids) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='answer outside assignment'; END IF;
  PERFORM s.id FROM public.submissions s
    WHERE s.assignment_id=p_assignment_id AND s.id IN (SELECT a.submission_id FROM public.submission_answers a WHERE a.id=ANY(v_ids))
    ORDER BY s.id FOR UPDATE;
  PERFORM a.id FROM public.submission_answers a JOIN public.submissions s ON s.id=a.submission_id
    WHERE s.assignment_id=p_assignment_id AND a.id=ANY(v_ids) ORDER BY a.id FOR UPDATE OF a;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'answerId' LOOP
    v_answer_id:=(v_item->>'answerId')::uuid;
    v_base:=(v_item->>'expectedScoreEditedAt')::timestamptz;
    v_expected_draft:=(v_item->>'expectedDraftUpdatedAt')::timestamptz;
    v_answer_score:=(v_item->>'answerScore')::numeric;
    v_work_score:=(v_item->>'workScore')::numeric;
    v_remove:=COALESCE(v_item->'remove'='true'::jsonb,false);
    SELECT a.* INTO v_answer FROM public.submission_answers a JOIN public.submissions s ON s.id=a.submission_id
      WHERE a.id=v_answer_id AND s.assignment_id=p_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='answer outside assignment'; END IF;
    SELECT * INTO v_draft FROM public.grading_score_drafts
      WHERE actor_id=p_actor_id AND assignment_id=p_assignment_id AND answer_id=v_answer_id FOR UPDATE;
    v_exists:=FOUND;
    IF (v_exists AND v_draft.updated_at IS DISTINCT FROM v_expected_draft) OR (NOT v_exists AND v_expected_draft IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='private grading draft revision changed'; END IF;
    IF v_remove THEN
      DELETE FROM public.grading_score_drafts WHERE actor_id=p_actor_id AND assignment_id=p_assignment_id AND answer_id=v_answer_id;
      v_deleted:=v_deleted||jsonb_build_array(v_answer_id);
      CONTINUE;
    END IF;
    IF v_answer.score_edited_at IS DISTINCT FROM v_base THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='published grading revision changed'; END IF;
    IF v_answer.is_void OR v_answer.max_score<=0 OR NOT EXISTS(SELECT 1 FROM public.submissions s WHERE s.id=v_answer.submission_id AND s.status IN ('submitted','graded'))
      OR (v_answer_score IS NOT NULL AND (v_answer_score<0 OR v_answer_score>1000000 OR v_answer_score>v_answer.answer_max_score OR v_answer.answer_max_score<=0))
      OR (v_work_score IS NOT NULL AND (v_work_score<0 OR v_work_score>1000000 OR v_work_score>v_answer.work_max_score OR v_answer.work_max_score<=0)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid grading score or answer state'; END IF;
    IF p_publish THEN
      PERFORM public.save_grading_review(p_actor_id,p_assignment_id,v_answer_id,v_base,v_answer_score,v_work_score,v_item ? 'answerScore',v_item ? 'workScore');
      SELECT * INTO v_answer FROM public.submission_answers WHERE id=v_answer_id;
      v_published:=v_published||jsonb_build_array(jsonb_build_object('answerId',v_answer.id,'submissionId',v_answer.submission_id,'scoreEditedAt',v_answer.score_edited_at));
      DELETE FROM public.grading_score_drafts WHERE actor_id=p_actor_id AND assignment_id=p_assignment_id AND answer_id=v_answer_id
        AND updated_at IS NOT DISTINCT FROM v_expected_draft;
      v_deleted:=v_deleted||jsonb_build_array(v_answer_id);
    ELSE
      v_updated:=GREATEST(clock_timestamp(),COALESCE(v_draft.updated_at,'-infinity'::timestamptz)+interval '1 microsecond');
      INSERT INTO public.grading_score_drafts(actor_id,assignment_id,answer_id,base_score_edited_at,answer_score,work_score,updated_at)
        VALUES(p_actor_id,p_assignment_id,v_answer_id,v_base,v_answer_score,v_work_score,v_updated)
        ON CONFLICT(actor_id,assignment_id,answer_id) DO UPDATE SET base_score_edited_at=EXCLUDED.base_score_edited_at,
          answer_score=EXCLUDED.answer_score,work_score=EXCLUDED.work_score,updated_at=EXCLUDED.updated_at;
      v_drafts:=v_drafts||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('answerId',v_answer_id,'updatedAt',v_updated,'answerScore',v_answer_score,'workScore',v_work_score))
        ||jsonb_build_object('expectedScoreEditedAt',v_base));
    END IF;
  END LOOP;

  IF p_publish THEN
    -- One notification per recipient for this publication, without numeric
    -- scores or answer content. The existing owner/result route enforces all
    -- show_results/answer visibility rules when the student follows the link.
    INSERT INTO public.notifications(org_id,recipient_id,actor_id,type,title,body,link,related_assignment_id,grading_publication_request_id)
      SELECT v_assignment.org_id,affected.student_id,p_actor_id,'grade_published','ครูตรวจคะแนนแล้ว',v_assignment.title,
        '/submissions/'||affected.id::text,p_assignment_id,p_request_id
      FROM (SELECT DISTINCT ON(s.student_id) s.student_id,s.id FROM public.submissions s
        JOIN public.submission_answers a ON a.submission_id=s.id WHERE a.id=ANY(v_ids)
        ORDER BY s.student_id,s.created_at DESC,s.id DESC) affected;
    GET DIAGNOSTICS v_notification_count=ROW_COUNT;
    v_outcome:=jsonb_build_object('success',true,'requestId',p_request_id,'published',v_published,'deletedDraftIds',v_deleted,'notificationCount',v_notification_count);
  ELSE
    v_outcome:=jsonb_build_object('success',true,'requestId',p_request_id,'drafts',v_drafts,'deletedDraftIds',v_deleted);
  END IF;
  INSERT INTO public.grading_draft_requests(actor_id,assignment_id,request_id,request_payload,outcome)
    VALUES(p_actor_id,p_assignment_id,p_request_id,v_payload,v_outcome);
  RETURN v_outcome;
END; $$;
REVOKE ALL ON FUNCTION public.write_grading_drafts(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_grading_drafts(uuid,uuid,uuid,jsonb,boolean) TO service_role;

CREATE FUNCTION public.save_grading_drafts(p_actor_id uuid,p_assignment_id uuid,p_request_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT public.write_grading_drafts(p_actor_id,p_assignment_id,p_request_id,p_items,false);
$$;
CREATE FUNCTION public.publish_grading_drafts(p_actor_id uuid,p_assignment_id uuid,p_request_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT public.write_grading_drafts(p_actor_id,p_assignment_id,p_request_id,p_items,true);
$$;
REVOKE ALL ON FUNCTION public.save_grading_drafts(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.publish_grading_drafts(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_grading_drafts(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_grading_drafts(uuid,uuid,uuid,jsonb) TO service_role;
