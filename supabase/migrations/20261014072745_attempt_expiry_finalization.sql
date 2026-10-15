-- The database clock is the write boundary, even with no student browser.
ALTER TABLE public.submissions ADD COLUMN closed_at timestamptz,
  ADD COLUMN close_reason text CHECK (close_reason IN ('manual', 'time_limit', 'close_time')),
  ADD COLUMN answer_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.submissions ADD COLUMN missing_work_evidence boolean NOT NULL DEFAULT false;
ALTER TABLE public.submissions ADD CONSTRAINT submission_close_pair
  CHECK ((closed_at IS NULL) = (close_reason IS NULL));
CREATE INDEX submissions_pending_close_idx ON public.submissions(started_at)
  WHERE status = 'in_progress';

CREATE FUNCTION public.submission_hard_close(p_submission_id uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT LEAST(CASE WHEN a.duration_minutes > 0
    THEN s.started_at + pg_catalog.make_interval(mins => a.duration_minutes) END,
    COALESCE(e.extended_end_at, a.end_at))
  FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id
  LEFT JOIN public.assignment_extensions e ON e.assignment_id = s.assignment_id AND e.student_id = s.student_id
  WHERE s.id = p_submission_id AND a.type IN ('exam', 'exercise');
$$;

CREATE FUNCTION public.guard_attempt_answer_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.submissions%ROWTYPE;
BEGIN
  -- Grading/teacher feedback updates do not modify the student's answer.
  IF TG_OP = 'UPDATE' AND ROW(NEW.student_answer, NEW.work_images, NEW.math_input_modes,
      NEW.random_values, NEW.correct_answer, NEW.submission_id, NEW.carried_over, NEW.check_count)
    IS NOT DISTINCT FROM ROW(OLD.student_answer, OLD.work_images, OLD.math_input_modes,
      OLD.random_values, OLD.correct_answer, OLD.submission_id, OLD.carried_over, OLD.check_count) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.submission_id <> OLD.submission_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'answer scope is immutable'; END IF;
  SELECT * INTO v FROM public.submissions WHERE id = NEW.submission_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'in_progress' OR v.closed_at IS NOT NULL
    OR public.submission_hard_close(v.id) <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT425', MESSAGE = 'attempt no longer accepts answers'; END IF;
  UPDATE public.submissions SET answer_revision = answer_revision + 1 WHERE id = v.id;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_attempt_answer_write BEFORE INSERT OR UPDATE ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.guard_attempt_answer_write();

CREATE FUNCTION public.guard_attempt_work_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.submissions%ROWTYPE; v_answer uuid;
BEGIN
  v_answer := CASE WHEN TG_OP = 'DELETE' THEN OLD.submission_answer_id ELSE NEW.submission_answer_id END;
  SELECT s.* INTO v FROM public.submissions s JOIN public.submission_answers a ON a.submission_id = s.id
    WHERE a.id = v_answer FOR UPDATE OF s;
  -- Cascading deletion of a removed parent still has to be possible.
  IF v.id IS NULL AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF v.id IS NULL OR v.status <> 'in_progress' OR v.closed_at IS NOT NULL
    OR public.submission_hard_close(v.id) <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT425', MESSAGE = 'attempt no longer accepts working'; END IF;
  UPDATE public.submissions SET answer_revision = answer_revision + 1 WHERE id = v.id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
CREATE TRIGGER guard_attempt_work_write BEFORE INSERT OR UPDATE OR DELETE ON public.student_work_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_attempt_work_write();

CREATE FUNCTION public.claim_submission_close(p_submission_id uuid, p_student_id uuid,
  p_expired_only boolean, p_expected_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.submissions%ROWTYPE; v_end timestamptz; v_reason text;
BEGIN
  SELECT * INTO v FROM public.submissions WHERE id = p_submission_id AND student_id = p_student_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'submission not owned'; END IF;
  IF v.status <> 'in_progress' THEN RETURN pg_catalog.jsonb_build_object('completed', true, 'total_score', v.total_score); END IF;
  v_end := public.submission_hard_close(v.id);
  IF p_expired_only AND v.closed_at IS NULL AND (v_end IS NULL OR v_end > pg_catalog.clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT425', MESSAGE = 'attempt not expired'; END IF;
  IF v.closed_at IS NULL THEN
    IF NOT p_expired_only AND (p_expected_revision IS NULL OR p_expected_revision <> v.answer_revision) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'answer changed during submit'; END IF;
    IF v_end <= pg_catalog.clock_timestamp() THEN
      SELECT CASE WHEN a.duration_minutes > 0 AND
        v.started_at + pg_catalog.make_interval(mins => a.duration_minutes) = v_end
        THEN 'time_limit' ELSE 'close_time' END INTO v_reason FROM public.assignments a WHERE a.id = v.assignment_id;
    ELSE v_end := pg_catalog.clock_timestamp(); v_reason := 'manual'; END IF;
    UPDATE public.submissions SET closed_at = v_end, close_reason = v_reason WHERE id = v.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('completed', false);
END; $$;

CREATE FUNCTION public.commit_submission_grade(p_submission_id uuid, p_student_id uuid, p_updates jsonb,
  p_missing_work_evidence boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.submissions%ROWTYPE; v_total numeric; v_count integer;
BEGIN
  SELECT * INTO v FROM public.submissions WHERE id = p_submission_id AND student_id = p_student_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'submission not owned'; END IF;
  IF v.status <> 'in_progress' THEN RETURN pg_catalog.jsonb_build_object('total_score', v.total_score); END IF;
  IF v.closed_at IS NULL THEN RAISE EXCEPTION 'attempt must be closed first'; END IF;
  IF pg_catalog.jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid grades'; END IF;
  SELECT count(*) INTO v_count FROM public.submission_answers WHERE submission_id = v.id AND NOT COALESCE(carried_over, false);
  IF v_count <> pg_catalog.jsonb_array_length(p_updates) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_updates) AS u(id uuid, score numeric, is_correct boolean)
    LEFT JOIN public.submission_answers a ON a.id = u.id AND a.submission_id = v.id AND NOT COALESCE(a.carried_over, false)
    WHERE a.id IS NULL OR u.score IS NULL OR u.score < 0 OR u.score > a.max_score
  ) OR (SELECT count(DISTINCT u.id) FROM pg_catalog.jsonb_to_recordset(p_updates) AS u(id uuid)) <> v_count THEN
    RAISE EXCEPTION 'grades do not match the closed attempt'; END IF;
  UPDATE public.submission_answers a SET score = u.score, is_correct = u.is_correct
    FROM pg_catalog.jsonb_to_recordset(p_updates) AS u(id uuid, score numeric, is_correct boolean)
    WHERE a.id = u.id AND a.submission_id = v.id AND NOT COALESCE(a.carried_over, false);
  SELECT COALESCE(sum(score), 0) INTO v_total FROM public.submission_answers WHERE submission_id = v.id;
  UPDATE public.submissions SET status = 'submitted', submitted_at = closed_at, total_score = v_total,
    missing_work_evidence = COALESCE(p_missing_work_evidence, false) WHERE id = v.id;
  RETURN pg_catalog.jsonb_build_object('total_score', v_total);
END; $$;

CREATE FUNCTION public.close_expired_submission_attempts(p_limit integer DEFAULT 500) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v record; v_count integer := 0;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid batch size'; END IF;
  FOR v IN SELECT s.id, s.student_id FROM public.submissions s
    WHERE s.status = 'in_progress' AND s.closed_at IS NULL
      AND public.submission_hard_close(s.id) <= pg_catalog.clock_timestamp()
    ORDER BY s.started_at LIMIT p_limit FOR UPDATE OF s SKIP LOCKED LOOP
    PERFORM public.claim_submission_close(v.id, v.student_id, true, NULL);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- The optional grader callback uses environment-specific Vault credentials.
-- Closure itself continues even if HTTP/the grading worker is unavailable.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE FUNCTION public.dispatch_attempt_finalizer() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.submissions WHERE status = 'in_progress' AND closed_at IS NOT NULL) THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'korkru_attempt_finalizer_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'korkru_attempt_finalizer_secret';
  IF v_url IS NULL OR v_url !~ '^https://[a-zA-Z0-9.-]+/api/internal/attempt-finalizer$'
    OR v_secret IS NULL OR length(v_secret) < 32 THEN RETURN; END IF;
  PERFORM net.http_post(url := v_url, headers := pg_catalog.jsonb_build_object(
    'Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
END; $$;

REVOKE ALL ON FUNCTION public.submission_hard_close(uuid), public.guard_attempt_answer_write(),
  public.guard_attempt_work_write(), public.claim_submission_close(uuid,uuid,boolean,bigint),
  public.commit_submission_grade(uuid,uuid,jsonb,boolean), public.close_expired_submission_attempts(integer),
  public.dispatch_attempt_finalizer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submission_hard_close(uuid), public.guard_attempt_answer_write(),
  public.guard_attempt_work_write(), public.claim_submission_close(uuid,uuid,boolean,bigint),
  public.commit_submission_grade(uuid,uuid,jsonb,boolean), public.close_expired_submission_attempts(integer)
  TO service_role;
-- dispatch is only for postgres/cron; service_role cannot read Vault secrets.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is required for automatic attempt closure'; END IF;
  PERFORM cron.schedule('korkru-close-expired-attempts', '10 seconds', 'SELECT public.close_expired_submission_attempts(500)');
  PERFORM cron.schedule('korkru-grade-closed-attempts', '* * * * *', 'SELECT public.dispatch_attempt_finalizer()');
END $$;
