-- Acknowledgement records that a teacher has seen a browser integrity signal.
-- It is deliberately stored on the existing event so it shares the same
-- authorization, Realtime publication, purge path, and 90-day retention.
ALTER TABLE public.exam_proctor_events
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN acknowledged_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.exam_proctor_events
  ADD CONSTRAINT exam_proctor_events_acknowledgement_shape_check
  CHECK (acknowledged_at IS NOT NULL OR acknowledged_by IS NULL);

COMMENT ON COLUMN public.exam_proctor_events.acknowledged_at IS
  'When a proctor acknowledged seeing this signal. This is not a cheating verdict.';
COMMENT ON COLUMN public.exam_proctor_events.acknowledged_by IS
  'Teacher who first acknowledged the signal; may become null if that user is deleted.';

CREATE INDEX idx_exam_proctor_events_assignment_unacknowledged
  ON public.exam_proctor_events(assignment_id, created_at DESC)
  WHERE acknowledged_at IS NULL
    AND event_type IN (
      'tab_hidden',
      'fullscreen_exited',
      'window_blur',
      'copy_attempt',
      'cut_attempt',
      'paste_attempt',
      'context_menu_attempt',
      'screenshot_key',
      'concurrent_connection'
    );

-- Keep the evidence portion of an event immutable even if a future privileged
-- caller receives UPDATE access. Only acknowledgement metadata may change.
CREATE OR REPLACE FUNCTION public.protect_exam_proctor_event_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.org_id,
    NEW.assignment_id,
    NEW.submission_id,
    NEW.student_id,
    NEW.client_event_id,
    NEW.event_type,
    NEW.occurred_at_client,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.org_id,
    OLD.assignment_id,
    OLD.submission_id,
    OLD.student_id,
    OLD.client_event_id,
    OLD.event_type,
    OLD.occurred_at_client,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'exam proctor event evidence is immutable' USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_exam_proctor_event_evidence()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_exam_proctor_event_evidence_before_update
  BEFORE UPDATE ON public.exam_proctor_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_exam_proctor_event_evidence();

-- The server action authenticates the caller before using the service role,
-- and this function independently repeats exact owner/co-teacher/super-admin
-- authorization. The WHERE clause makes acknowledgement first-write-wins.
CREATE OR REPLACE FUNCTION public.acknowledge_exam_proctor_events(
  p_assignment_id uuid,
  p_event_ids bigint[],
  p_actor_id uuid
)
RETURNS TABLE (
  event_id bigint,
  event_acknowledged_at timestamptz,
  event_acknowledged_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_assignment_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'assignment and actor are required' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(cardinality(p_event_ids), 0) < 1
    OR cardinality(p_event_ids) > 100
    OR EXISTS (
      SELECT 1
      FROM unnest(p_event_ids) AS requested_event(value)
      WHERE requested_event.value IS NULL OR requested_event.value < 1
    )
  THEN
    RAISE EXCEPTION 'invalid proctor event ids' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    WHERE assignment.id = p_assignment_id
      AND (
        assignment.created_by = p_actor_id
        OR EXISTS (
          SELECT 1
          FROM public.assignment_classrooms assignment_classroom
          JOIN public.classroom_co_teachers co_teacher
            ON co_teacher.classroom_id = assignment_classroom.classroom_id
          WHERE assignment_classroom.assignment_id = assignment.id
            AND co_teacher.user_id = p_actor_id
            AND co_teacher.permission IN ('admin', 'manage')
        )
        OR EXISTS (
          SELECT 1
          FROM public.super_admins super_admin
          WHERE super_admin.user_id = p_actor_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'actor cannot acknowledge this assignment' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exam_proctor_events event
  SET
    acknowledged_at = now(),
    acknowledged_by = p_actor_id
  WHERE event.assignment_id = p_assignment_id
    AND event.id = ANY(p_event_ids)
    AND event.acknowledged_at IS NULL
    AND event.event_type IN (
      'tab_hidden',
      'fullscreen_exited',
      'window_blur',
      'copy_attempt',
      'cut_attempt',
      'paste_attempt',
      'context_menu_attempt',
      'screenshot_key',
      'concurrent_connection'
    );

  -- Return the durable first acknowledgement even when a second proctor
  -- repeats the same request after a Realtime race.
  RETURN QUERY
  SELECT
    event.id,
    event.acknowledged_at,
    event.acknowledged_by
  FROM public.exam_proctor_events event
  WHERE event.assignment_id = p_assignment_id
    AND event.id = ANY(p_event_ids)
    AND event.acknowledged_at IS NOT NULL
    AND event.event_type IN (
      'tab_hidden',
      'fullscreen_exited',
      'window_blur',
      'copy_attempt',
      'cut_attempt',
      'paste_attempt',
      'context_menu_attempt',
      'screenshot_key',
      'concurrent_connection'
    );
END;
$$;

COMMENT ON FUNCTION public.acknowledge_exam_proctor_events(uuid, bigint[], uuid) IS
  'First-write-wins acknowledgement of reviewable proctor signals by an authorized assignment proctor.';

REVOKE ALL ON FUNCTION public.acknowledge_exam_proctor_events(uuid, bigint[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_exam_proctor_events(uuid, bigint[], uuid)
  TO service_role;
