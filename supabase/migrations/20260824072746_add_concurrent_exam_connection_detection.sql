-- Track only an opaque per-tab connection id and heartbeat state. This lets
-- the live room detect overlapping exam windows without device fingerprinting,
-- IP addresses, user agents, screen contents, or other invasive metadata.

CREATE TABLE public.exam_proctor_connections (
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  client_instance_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  is_tab_visible boolean NOT NULL DEFAULT true,
  is_fullscreen boolean NOT NULL DEFAULT false,
  PRIMARY KEY (submission_id, client_instance_id)
);

COMMENT ON TABLE public.exam_proctor_connections IS
  'Privacy-minimised per-tab heartbeat leases used only to detect concurrent exam windows. No device fingerprint, IP, user agent, content, camera, or audio is stored.';

CREATE INDEX idx_exam_proctor_connections_assignment_last_seen
  ON public.exam_proctor_connections(assignment_id, last_seen_at DESC);
CREATE INDEX idx_exam_proctor_connections_submission_active
  ON public.exam_proctor_connections(submission_id, last_seen_at DESC)
  WHERE closed_at IS NULL;

ALTER TABLE public.exam_proctor_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_proctor_connections_teacher_select"
  ON public.exam_proctor_connections
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR assignment_id = ANY(public.get_my_created_assignment_ids())
    OR assignment_id = ANY(public.get_my_co_teaching_assignment_ids())
  );

REVOKE ALL ON public.exam_proctor_connections FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.exam_proctor_connections FROM authenticated;
GRANT SELECT ON public.exam_proctor_connections TO authenticated;

ALTER TABLE public.exam_proctor_sessions
  ADD COLUMN active_connection_count integer NOT NULL DEFAULT 0
    CHECK (active_connection_count >= 0),
  ADD COLUMN concurrent_connection_count integer NOT NULL DEFAULT 0
    CHECK (concurrent_connection_count >= 0);

COMMENT ON COLUMN public.exam_proctor_sessions.active_connection_count IS
  'Number of per-tab heartbeat leases active within the last 45 seconds.';
COMMENT ON COLUMN public.exam_proctor_sessions.concurrent_connection_count IS
  'Number of transitions where an attempt moved from one-or-fewer to multiple active exam windows.';

ALTER TABLE public.exam_proctor_events
  DROP CONSTRAINT IF EXISTS exam_proctor_events_event_type_check;
ALTER TABLE public.exam_proctor_events
  ADD CONSTRAINT exam_proctor_events_event_type_check CHECK (event_type IN (
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
    'screenshot_key',
    'concurrent_connection'
  ));

-- New overload used by current clients. The advisory lock serializes leases
-- for one attempt, ensuring a transition to multiple windows produces one
-- server-authored alert rather than a race-dependent duplicate or omission.
CREATE OR REPLACE FUNCTION public.record_exam_proctor_signal(
  p_submission_id uuid,
  p_student_id uuid,
  p_client_instance_id uuid,
  p_tab_visible boolean,
  p_fullscreen boolean,
  p_connection_closed boolean,
  p_events jsonb
)
RETURNS integer
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
  v_concurrent_connection_count integer := 0;
  v_new_event_count integer;
  v_active_before integer;
  v_active_count integer;
  v_all_tabs_visible boolean;
  v_all_fullscreen boolean;
  v_became_concurrent boolean;
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_submission_id::text, 0));

  -- The backwards-compatible wrapper below uses submission_id as a sentinel
  -- instance id. Close that rollout lease when a modern client first arrives,
  -- so a normal refresh across app versions is not mistaken for two windows.
  IF p_client_instance_id <> p_submission_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_proctor_connections
      WHERE submission_id = p_submission_id
        AND client_instance_id = p_client_instance_id
    )
  THEN
    UPDATE public.exam_proctor_connections
    SET closed_at = now(), last_seen_at = now()
    WHERE submission_id = p_submission_id
      AND client_instance_id = p_submission_id
      AND closed_at IS NULL;
  END IF;

  SELECT count(*)::integer
    INTO v_active_before
  FROM public.exam_proctor_connections
  WHERE submission_id = p_submission_id
    AND closed_at IS NULL
    AND last_seen_at >= now() - interval '45 seconds';

  IF p_connection_closed THEN
    UPDATE public.exam_proctor_connections
    SET
      last_seen_at = now(),
      closed_at = now(),
      is_tab_visible = p_tab_visible,
      is_fullscreen = p_fullscreen
    WHERE submission_id = p_submission_id
      AND client_instance_id = p_client_instance_id;
  ELSE
    INSERT INTO public.exam_proctor_connections (
      submission_id, client_instance_id, org_id, assignment_id, student_id,
      connected_at, last_seen_at, closed_at, is_tab_visible, is_fullscreen
    ) VALUES (
      p_submission_id, p_client_instance_id, v_org_id, v_assignment_id, p_student_id,
      now(), now(), NULL, p_tab_visible, p_fullscreen
    )
    ON CONFLICT (submission_id, client_instance_id) DO UPDATE SET
      org_id = EXCLUDED.org_id,
      assignment_id = EXCLUDED.assignment_id,
      student_id = EXCLUDED.student_id,
      last_seen_at = now(),
      closed_at = NULL,
      is_tab_visible = EXCLUDED.is_tab_visible,
      is_fullscreen = EXCLUDED.is_fullscreen;
  END IF;

  SELECT
    count(*)::integer,
    bool_and(is_tab_visible),
    bool_and(is_fullscreen)
  INTO v_active_count, v_all_tabs_visible, v_all_fullscreen
  FROM public.exam_proctor_connections
  WHERE submission_id = p_submission_id
    AND closed_at IS NULL
    AND last_seen_at >= now() - interval '45 seconds';

  v_became_concurrent := v_active_before <= 1 AND v_active_count > 1;

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

  IF v_became_concurrent THEN
    INSERT INTO public.exam_proctor_events (
      org_id, assignment_id, submission_id, student_id,
      client_event_id, event_type, occurred_at_client
    ) VALUES (
      v_org_id, v_assignment_id, p_submission_id, p_student_id,
      gen_random_uuid(), 'concurrent_connection', now()
    );
    v_concurrent_connection_count := 1;
    v_last_event_type := 'concurrent_connection';
  END IF;

  INSERT INTO public.exam_proctor_sessions (
    submission_id, org_id, assignment_id, student_id,
    last_seen_at, is_online, is_tab_visible, is_fullscreen,
    active_connection_count, concurrent_connection_count,
    tab_switch_count, fullscreen_exit_count, window_blur_count,
    clipboard_attempt_count, screenshot_key_count,
    last_event_type, last_event_at, updated_at
  ) VALUES (
    p_submission_id, v_org_id, v_assignment_id, p_student_id,
    now(), v_active_count > 0,
    COALESCE(v_all_tabs_visible, p_tab_visible),
    COALESCE(v_all_fullscreen, p_fullscreen),
    v_active_count, v_concurrent_connection_count,
    v_tab_switch_count, v_fullscreen_exit_count, v_window_blur_count,
    v_clipboard_attempt_count, v_screenshot_key_count,
    v_last_event_type,
    CASE WHEN v_last_event_type IS NULL THEN NULL ELSE now() END,
    now()
  )
  ON CONFLICT (submission_id) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    is_online = EXCLUDED.is_online,
    is_tab_visible = EXCLUDED.is_tab_visible,
    is_fullscreen = EXCLUDED.is_fullscreen,
    completed_at = NULL,
    active_connection_count = EXCLUDED.active_connection_count,
    concurrent_connection_count = public.exam_proctor_sessions.concurrent_connection_count + EXCLUDED.concurrent_connection_count,
    tab_switch_count = public.exam_proctor_sessions.tab_switch_count + EXCLUDED.tab_switch_count,
    fullscreen_exit_count = public.exam_proctor_sessions.fullscreen_exit_count + EXCLUDED.fullscreen_exit_count,
    window_blur_count = public.exam_proctor_sessions.window_blur_count + EXCLUDED.window_blur_count,
    clipboard_attempt_count = public.exam_proctor_sessions.clipboard_attempt_count + EXCLUDED.clipboard_attempt_count,
    screenshot_key_count = public.exam_proctor_sessions.screenshot_key_count + EXCLUDED.screenshot_key_count,
    last_event_type = COALESCE(EXCLUDED.last_event_type, public.exam_proctor_sessions.last_event_type),
    last_event_at = COALESCE(EXCLUDED.last_event_at, public.exam_proctor_sessions.last_event_at),
    updated_at = now();

  RETURN v_active_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_exam_proctor_signal(uuid, uuid, uuid, boolean, boolean, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_proctor_signal(uuid, uuid, uuid, boolean, boolean, boolean, jsonb)
  TO service_role;

-- Backwards-compatible wrapper for a previously deployed client. It keeps
-- heartbeat/event recording working during a rolling app deployment, but
-- cannot distinguish multiple windows until that client is updated.
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
BEGIN
  PERFORM public.record_exam_proctor_signal(
    p_submission_id,
    p_student_id,
    p_submission_id,
    p_tab_visible,
    p_fullscreen,
    false,
    p_events
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_exam_proctor_signal(uuid, uuid, boolean, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_proctor_signal(uuid, uuid, boolean, boolean, jsonb)
  TO service_role;
