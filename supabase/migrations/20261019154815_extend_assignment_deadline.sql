-- A whole-assignment extension changes only the hard close. Personal on-time
-- boundaries, published grades and already-finished attempts retain their meaning.
CREATE FUNCTION public.guard_assignment_extension_global_close()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_global_end_at timestamptz;
BEGIN
  -- Serialize legacy personal-extension writes with the parent-row lock used
  -- below. A delayed old client cannot shorten the newly extended global close.
  SELECT a.end_at INTO v_global_end_at
  FROM public.assignments a WHERE a.id = NEW.assignment_id FOR SHARE;

  IF v_global_end_at IS NOT NULL AND pg_catalog.isfinite(v_global_end_at)
    AND NEW.extended_end_at < v_global_end_at THEN
    NEW.extended_due_at := COALESCE(NEW.extended_due_at, NEW.extended_end_at);
    NEW.extended_end_at := v_global_end_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_assignment_extension_global_close()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER assignment_extensions_guard_global_close
  BEFORE INSERT OR UPDATE OF assignment_id, extended_end_at ON public.assignment_extensions
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_extension_global_close();

CREATE FUNCTION public.extend_assignment_deadline(
  p_assignment_id uuid,
  p_end_at timestamptz,
  p_expected_end_at timestamptz,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_assignment public.assignments%ROWTYPE;
  v_result jsonb;
  v_band jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT public.actor_can_manage_grading_assignment(v_actor_id, p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment management permission required';
  END IF;

  SELECT a.* INTO v_assignment FROM public.assignments a
  WHERE a.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.actor_can_manage_grading_assignment(v_actor_id, p_assignment_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment management permission required';
  END IF;
  -- This authenticated SECURITY DEFINER entry point must also retain the
  -- assignment UPDATE policies. The shared grading helper allows ownership
  -- without org membership; that service-only rule must not let a departed
  -- organization member bypass the session-bound assignment edit boundary.
  IF NOT (
    EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = v_actor_id)
    OR (
      v_assignment.created_by = v_actor_id
      AND EXISTS (
        SELECT 1 FROM public.organization_members member
        WHERE member.user_id = v_actor_id AND member.org_id = v_assignment.org_id
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.assignment_classrooms ac
      JOIN public.classroom_co_teachers co ON co.classroom_id = ac.classroom_id
      WHERE ac.assignment_id = v_assignment.id AND co.user_id = v_actor_id
        AND co.permission IN ('admin', 'manage')
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment edit permission required';
  END IF;
  IF v_assignment.end_at IS DISTINCT FROM p_expected_end_at
    OR v_assignment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'assignment deadline changed; refresh before extending';
  END IF;

  IF v_assignment.status::text <> 'published'
    OR v_assignment.mode::text <> 'online'
    OR v_assignment.type::text NOT IN ('exercise', 'exam') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'only a published online assignment can be extended';
  END IF;
  IF v_assignment.end_at IS NULL OR NOT pg_catalog.isfinite(v_assignment.end_at) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'assignment has no finite closing time to extend';
  END IF;
  IF p_end_at IS NULL OR NOT pg_catalog.isfinite(p_end_at)
    OR p_end_at <= pg_catalog.clock_timestamp()
    OR p_end_at <= v_assignment.end_at
    OR p_end_at <= v_assignment.start_at
    OR p_end_at <= v_assignment.due_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'new closing time must be in the future and after the existing schedule';
  END IF;
  FOR v_band IN SELECT value FROM pg_catalog.jsonb_array_elements(v_assignment.late_bands)
  LOOP
    IF p_end_at <= (v_band->>'starts_at')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'new closing time must follow every late-submission band';
    END IF;
  END LOOP;

  -- The existing assignments_updated_at trigger owns the revision timestamp.
  UPDATE public.assignments SET end_at = p_end_at WHERE id = p_assignment_id
  RETURNING pg_catalog.jsonb_build_object('id', id, 'end_at', end_at, 'updated_at', updated_at)
  INTO v_result;

  -- COALESCE readers historically treat a personal hard close as overriding the
  -- global close. Lift only shorter overrides; preserve their original on-time
  -- boundary, including the legacy NULL extended_due_at representation.
  UPDATE public.assignment_extensions
  SET extended_due_at = COALESCE(extended_due_at, extended_end_at),
      extended_end_at = p_end_at
  WHERE assignment_id = p_assignment_id AND extended_end_at < p_end_at;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.extend_assignment_deadline(uuid, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.extend_assignment_deadline(uuid, timestamptz, timestamptz, timestamptz)
  TO authenticated;
COMMENT ON FUNCTION public.extend_assignment_deadline(uuid, timestamptz, timestamptz, timestamptz) IS
  'Authenticated exact assignment managers atomically extend the whole assignment hard close with revision checks; personal due dates, grades and attempt timers are preserved.';
