-- Phase 1 foundation for teacher-defined late-submission colour bands.
--
-- `end_at` remains the hard close enforced by the existing submission paths.
-- `due_at` is only the on-time boundary.  The ordered JSON array describes
-- which label/colour applies after each transition.  Keeping the whole policy
-- on the assignment makes edits atomic and lets future grading adjustments
-- reference one immutable schedule once a student has started.

CREATE OR REPLACE FUNCTION public.is_valid_assignment_late_bands(
  p_start_at timestamptz,
  p_due_at timestamptz,
  p_end_at timestamptz,
  p_bands jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_band jsonb;
  v_count integer;
  v_key_count integer;
  v_position integer := 0;
  v_ids text[] := ARRAY[]::text[];
  v_starts_at timestamptz;
  v_previous_starts_at timestamptz;
BEGIN
  IF p_bands IS NULL OR jsonb_typeof(p_bands) <> 'array' THEN
    RETURN false;
  END IF;

  v_count := jsonb_array_length(p_bands);
  IF p_due_at IS NULL THEN
    RETURN v_count = 0;
  END IF;

  IF p_end_at IS NOT NULL AND p_due_at >= p_end_at THEN
    RETURN false;
  END IF;
  IF p_start_at IS NOT NULL AND p_due_at < p_start_at THEN
    RETURN false;
  END IF;
  IF v_count < 1 OR v_count > 8 THEN
    RETURN false;
  END IF;

  FOR v_band IN SELECT value FROM jsonb_array_elements(p_bands)
  LOOP
    v_position := v_position + 1;
    IF jsonb_typeof(v_band) <> 'object' THEN
      RETURN false;
    END IF;

    SELECT count(*) INTO v_key_count FROM jsonb_object_keys(v_band);
    IF v_key_count <> 4
      OR NOT (v_band ?& ARRAY['id', 'starts_at', 'label', 'color'])
      OR jsonb_typeof(v_band->'id') <> 'string'
      OR jsonb_typeof(v_band->'starts_at') <> 'string'
      OR jsonb_typeof(v_band->'label') <> 'string'
      OR jsonb_typeof(v_band->'color') <> 'string'
    THEN
      RETURN false;
    END IF;

    IF (v_band->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR lower(v_band->>'id') = ANY(v_ids)
      OR char_length(btrim(v_band->>'label')) < 1
      OR char_length(btrim(v_band->>'label')) > 60
      OR (v_band->>'label') <> btrim(v_band->>'label')
      OR (v_band->>'color') NOT IN ('blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate')
      OR (v_band->>'starts_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    THEN
      RETURN false;
    END IF;

    BEGIN
      v_starts_at := (v_band->>'starts_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;

    IF (v_position = 1 AND v_starts_at <> p_due_at)
      OR (v_position > 1 AND v_starts_at <= v_previous_starts_at)
      OR (p_end_at IS NOT NULL AND v_starts_at >= p_end_at)
    THEN
      RETURN false;
    END IF;

    v_ids := array_append(v_ids, lower(v_band->>'id'));
    v_previous_starts_at := v_starts_at;
  END LOOP;

  RETURN true;
END;
$$;

ALTER TABLE public.assignments
  ADD COLUMN due_at timestamptz,
  ADD COLUMN late_bands jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_late_bands_valid
  CHECK (public.is_valid_assignment_late_bands(start_at, due_at, end_at, late_bands));

COMMENT ON COLUMN public.assignments.due_at IS
  'On-time boundary. end_at remains the hard close; NULL keeps legacy assignments unclassified.';
COMMENT ON COLUMN public.assignments.late_bands IS
  'Ordered immutable-after-start JSON bands [{id,starts_at,label,color}]. The first starts_at equals due_at.';

-- Existing extensions only have extended_end_at.  A NULL extended_due_at keeps
-- their legacy meaning: the student is on time until that personal deadline.
-- Newer flows may set both values and shift the assignment bands by the same
-- amount as the personal due-date extension.
ALTER TABLE public.assignment_extensions
  ADD COLUMN extended_due_at timestamptz;

ALTER TABLE public.assignment_extensions
  ADD CONSTRAINT assignment_extensions_due_before_close
  CHECK (extended_due_at IS NULL OR extended_due_at <= extended_end_at);

COMMENT ON COLUMN public.assignment_extensions.extended_due_at IS
  'Optional personal on-time boundary. NULL preserves legacy extension semantics.';

CREATE OR REPLACE FUNCTION public.guard_assignment_late_schedule_after_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD.due_at IS DISTINCT FROM NEW.due_at
    OR OLD.late_bands IS DISTINCT FROM NEW.late_bands
  ) AND EXISTS (
    SELECT 1
    FROM public.submissions
    WHERE assignment_id = OLD.id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'assignment late-submission schedule is locked after the first attempt starts'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_assignment_late_schedule_after_start() FROM PUBLIC;

CREATE TRIGGER assignments_guard_late_schedule_after_start
BEFORE UPDATE OF due_at, late_bands ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.guard_assignment_late_schedule_after_start();
