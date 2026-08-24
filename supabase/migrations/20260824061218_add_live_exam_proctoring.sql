-- Live exam proctoring records browser-level integrity signals only. These
-- signals are evidence for a teacher to review, not proof of misconduct and
-- not an operating-system security boundary.

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS proctoring_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fullscreen_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_clipboard boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assignments.proctoring_enabled IS
  'Enable browser-level presence and integrity signals for this online exam.';
COMMENT ON COLUMN public.assignments.fullscreen_required IS
  'Ask the student to stay in browser fullscreen; cannot enforce OS-level kiosk mode.';
COMMENT ON COLUMN public.assignments.block_clipboard IS
  'Prevent copy/cut/paste/context-menu events in the exam UI as a deterrent.';

CREATE TABLE public.exam_proctor_sessions (
  submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_monitoring_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_online boolean NOT NULL DEFAULT true,
  is_tab_visible boolean NOT NULL DEFAULT true,
  is_fullscreen boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  tab_switch_count integer NOT NULL DEFAULT 0 CHECK (tab_switch_count >= 0),
  fullscreen_exit_count integer NOT NULL DEFAULT 0 CHECK (fullscreen_exit_count >= 0),
  window_blur_count integer NOT NULL DEFAULT 0 CHECK (window_blur_count >= 0),
  clipboard_attempt_count integer NOT NULL DEFAULT 0 CHECK (clipboard_attempt_count >= 0),
  screenshot_key_count integer NOT NULL DEFAULT 0 CHECK (screenshot_key_count >= 0),
  last_event_type text,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exam_proctor_sessions_assignment_last_seen
  ON public.exam_proctor_sessions(assignment_id, last_seen_at DESC);
CREATE INDEX idx_exam_proctor_sessions_org
  ON public.exam_proctor_sessions(org_id);
CREATE INDEX idx_exam_proctor_sessions_student
  ON public.exam_proctor_sessions(student_id);

CREATE TABLE public.exam_proctor_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'monitoring_started',
    'tab_hidden',
    'tab_visible',
    'fullscreen_entered',
    'fullscreen_exited',
    'window_blur',
    'window_focus',
    'copy_attempt',
    'cut_attempt',
    'paste_attempt',
    'context_menu_attempt',
    'screenshot_key'
  )),
  occurred_at_client timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_proctor_events
  ADD CONSTRAINT exam_proctor_events_submission_client_event_unique
  UNIQUE (submission_id, client_event_id);

CREATE INDEX idx_exam_proctor_events_assignment_created
  ON public.exam_proctor_events(assignment_id, created_at DESC);
CREATE INDEX idx_exam_proctor_events_submission_created
  ON public.exam_proctor_events(submission_id, created_at DESC);
CREATE INDEX idx_exam_proctor_events_org
  ON public.exam_proctor_events(org_id);

ALTER TABLE public.exam_proctor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_proctor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_proctor_sessions_teacher_select"
  ON public.exam_proctor_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR assignment_id = ANY(public.get_my_created_assignment_ids())
    OR assignment_id = ANY(public.get_my_co_teaching_assignment_ids())
  );

CREATE POLICY "exam_proctor_events_teacher_select"
  ON public.exam_proctor_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR assignment_id = ANY(public.get_my_created_assignment_ids())
    OR assignment_id = ANY(public.get_my_co_teaching_assignment_ids())
  );

REVOKE ALL ON public.exam_proctor_sessions FROM anon;
REVOKE ALL ON public.exam_proctor_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.exam_proctor_sessions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.exam_proctor_events FROM authenticated;
GRANT SELECT ON public.exam_proctor_sessions TO authenticated;
GRANT SELECT ON public.exam_proctor_events TO authenticated;

-- The browser calls a server action. Only the service role may execute this
-- function, after that action authenticates the student and checks the exact
-- in-progress submission. The function repeats those invariants and updates
-- counters atomically so concurrent heartbeat/event batches cannot lose data.
CREATE OR REPLACE FUNCTION public.record_exam_proctor_signal(
  p_submission_id uuid,
  p_student_id uuid,
  p_tab_visible boolean,
  p_fullscreen boolean,
  p_events jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_assignment_id uuid;
  v_event_count integer;
  v_last_event_type text;
  v_tab_switch_count integer;
  v_fullscreen_exit_count integer;
  v_window_blur_count integer;
  v_clipboard_attempt_count integer;
  v_screenshot_key_count integer;
  v_new_event_count integer;
BEGIN
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'events must be an array' USING ERRCODE = '22023';
  END IF;

  v_event_count := jsonb_array_length(p_events);
  IF v_event_count > 20 THEN
    RAISE EXCEPTION 'too many events' USING ERRCODE = '22023';
  END IF;

  SELECT s.org_id, s.assignment_id
    INTO v_org_id, v_assignment_id
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE s.id = p_submission_id
    AND s.student_id = p_student_id
    AND s.status = 'in_progress'
    AND a.proctoring_enabled = true
    AND a.mode = 'online';

  IF v_assignment_id IS NULL THEN
    RAISE EXCEPTION 'submission is not eligible for proctoring' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_events) event
    WHERE NOT (event ? 'type')
      OR jsonb_typeof(event->'type') IS DISTINCT FROM 'string'
      OR event->>'type' NOT IN (
        'monitoring_started', 'tab_hidden', 'tab_visible',
        'fullscreen_entered', 'fullscreen_exited',
        'window_blur', 'window_focus', 'copy_attempt', 'cut_attempt',
        'paste_attempt', 'context_menu_attempt', 'screenshot_key'
      )
  ) THEN
    RAISE EXCEPTION 'unknown proctor event type' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_events) event
    WHERE NOT (event ? 'id')
      OR jsonb_typeof(event->'id') IS DISTINCT FROM 'string'
      OR (event->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'invalid proctor event id' USING ERRCODE = '22023';
  END IF;

  WITH inserted_events AS (
    INSERT INTO public.exam_proctor_events (
      org_id, assignment_id, submission_id, student_id,
      client_event_id, event_type, occurred_at_client
    )
    SELECT
      v_org_id,
      v_assignment_id,
      p_submission_id,
      p_student_id,
      (event->>'id')::uuid,
      event->>'type',
      CASE
        WHEN event ? 'client_at' AND jsonb_typeof(event->'client_at') = 'string'
        THEN (event->>'client_at')::timestamptz
        ELSE NULL
      END
    FROM jsonb_array_elements(p_events) event
    ON CONFLICT (submission_id, client_event_id) DO NOTHING
    RETURNING event_type
  )
  SELECT
    count(*) FILTER (WHERE event_type = 'tab_hidden'),
    count(*) FILTER (WHERE event_type = 'fullscreen_exited'),
    count(*) FILTER (WHERE event_type = 'window_blur'),
    count(*) FILTER (WHERE event_type IN (
      'copy_attempt', 'cut_attempt', 'paste_attempt', 'context_menu_attempt'
    )),
    count(*) FILTER (WHERE event_type = 'screenshot_key'),
    count(*)
  INTO
    v_tab_switch_count,
    v_fullscreen_exit_count,
    v_window_blur_count,
    v_clipboard_attempt_count,
    v_screenshot_key_count,
    v_new_event_count
  FROM inserted_events;

  IF v_new_event_count > 0 THEN
    v_last_event_type := p_events->(v_event_count - 1)->>'type';
  END IF;

  INSERT INTO public.exam_proctor_sessions (
    submission_id, org_id, assignment_id, student_id,
    last_seen_at, is_online, is_tab_visible, is_fullscreen,
    tab_switch_count, fullscreen_exit_count, window_blur_count,
    clipboard_attempt_count, screenshot_key_count,
    last_event_type, last_event_at, updated_at
  ) VALUES (
    p_submission_id, v_org_id, v_assignment_id, p_student_id,
    now(), true, p_tab_visible, p_fullscreen,
    v_tab_switch_count, v_fullscreen_exit_count, v_window_blur_count,
    v_clipboard_attempt_count, v_screenshot_key_count,
    v_last_event_type,
    CASE WHEN v_last_event_type IS NULL THEN NULL ELSE now() END,
    now()
  )
  ON CONFLICT (submission_id) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    is_online = true,
    is_tab_visible = EXCLUDED.is_tab_visible,
    is_fullscreen = EXCLUDED.is_fullscreen,
    completed_at = NULL,
    tab_switch_count = public.exam_proctor_sessions.tab_switch_count + EXCLUDED.tab_switch_count,
    fullscreen_exit_count = public.exam_proctor_sessions.fullscreen_exit_count + EXCLUDED.fullscreen_exit_count,
    window_blur_count = public.exam_proctor_sessions.window_blur_count + EXCLUDED.window_blur_count,
    clipboard_attempt_count = public.exam_proctor_sessions.clipboard_attempt_count + EXCLUDED.clipboard_attempt_count,
    screenshot_key_count = public.exam_proctor_sessions.screenshot_key_count + EXCLUDED.screenshot_key_count,
    last_event_type = COALESCE(EXCLUDED.last_event_type, public.exam_proctor_sessions.last_event_type),
    last_event_at = COALESCE(EXCLUDED.last_event_at, public.exam_proctor_sessions.last_event_at),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_exam_proctor_signal(uuid, uuid, boolean, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_proctor_signal(uuid, uuid, boolean, boolean, jsonb)
  TO service_role;

-- Teacher clients subscribe to these tables. RLS still limits every delivered
-- row to assignments the teacher is allowed to manage.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_proctor_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_proctor_events;
  END IF;
END;
$$;
