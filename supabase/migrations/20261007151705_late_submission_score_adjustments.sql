-- Teacher-owned score adjustments for late-submission colour groups.
--
-- The auto-graded score remains in submissions.total_score.  This migration
-- stores a separate display-point adjustment so an audit entry can explain
-- every teacher decision and re-grading an answer can never erase it.

ALTER TABLE public.submissions
  ADD COLUMN score_adjustment numeric(10, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT submissions_score_adjustment_range
    CHECK (score_adjustment BETWEEN -10000 AND 10000);

COMMENT ON COLUMN public.submissions.score_adjustment IS
  'Teacher-set display-point adjustment. Applied after display_max_score rescaling; never part of raw answer totals.';

CREATE TABLE public.assignment_student_score_adjustments (
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  adjustment numeric(10, 2) NOT NULL CHECK (adjustment BETWEEN -10000 AND 10000),
  updated_by uuid NOT NULL REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);

CREATE INDEX assignment_student_score_adjustments_org_idx
  ON public.assignment_student_score_adjustments(org_id, assignment_id);

CREATE TABLE public.assignment_score_adjustment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate')),
  adjustment numeric(10, 2) NOT NULL CHECK (adjustment BETWEEN -10000 AND 10000),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 200),
  affected_count integer NOT NULL CHECK (affected_count > 0),
  changed_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assignment_score_adjustment_batches_assignment_idx
  ON public.assignment_score_adjustment_batches(assignment_id, created_at DESC);

CREATE TABLE public.assignment_score_adjustment_items (
  batch_id uuid NOT NULL REFERENCES public.assignment_score_adjustment_batches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  previous_adjustment numeric(10, 2) NOT NULL,
  new_adjustment numeric(10, 2) NOT NULL,
  PRIMARY KEY (batch_id, student_id)
);

ALTER TABLE public.assignment_student_score_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_score_adjustment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_score_adjustment_items ENABLE ROW LEVEL SECURITY;

-- These tables contain sensitive grading history.  Browser clients receive
-- no policy and no direct table privilege; authenticated server actions first
-- prove assignment-management access, then use the service role.
REVOKE ALL ON TABLE public.assignment_student_score_adjustments FROM anon, authenticated;
REVOKE ALL ON TABLE public.assignment_score_adjustment_batches FROM anon, authenticated;
REVOKE ALL ON TABLE public.assignment_score_adjustment_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.inherit_submission_score_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT adjustment
  INTO NEW.score_adjustment
  FROM public.assignment_student_score_adjustments
  WHERE assignment_id = NEW.assignment_id
    AND student_id = NEW.student_id;

  NEW.score_adjustment := coalesce(NEW.score_adjustment, 0);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inherit_submission_score_adjustment() FROM PUBLIC;

CREATE TRIGGER submissions_inherit_score_adjustment
BEFORE INSERT ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.inherit_submission_score_adjustment();

CREATE OR REPLACE FUNCTION public.apply_assignment_score_adjustment(
  p_org_id uuid,
  p_assignment_id uuid,
  p_student_ids uuid[],
  p_color text,
  p_adjustment numeric,
  p_reason text,
  p_changed_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_student_ids uuid[];
  v_affected_count integer;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  IF p_color NOT IN ('blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate') THEN
    RAISE EXCEPTION 'invalid late-submission colour' USING ERRCODE = '22023';
  END IF;
  IF p_adjustment IS NULL OR p_adjustment < -10000 OR p_adjustment > 10000 THEN
    RAISE EXCEPTION 'score adjustment is out of range' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'score adjustment reason is too long' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assignments
    WHERE id = p_assignment_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'assignment does not belong to organization' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(student_id ORDER BY student_id), ARRAY[]::uuid[])
  INTO v_student_ids
  FROM (
    SELECT DISTINCT unnest(p_student_ids) AS student_id
  ) targets;

  v_affected_count := cardinality(v_student_ids);
  IF v_affected_count = 0 THEN
    RAISE EXCEPTION 'no students selected' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_student_ids) AS target(student_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.submissions submission
      WHERE submission.assignment_id = p_assignment_id
        AND submission.student_id = target.student_id
        AND submission.status IN ('submitted', 'graded')
    )
  ) THEN
    RAISE EXCEPTION 'every selected student must have a completed submission' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.assignment_score_adjustment_batches (
    id, assignment_id, org_id, color, adjustment, reason,
    affected_count, changed_by
  ) VALUES (
    v_batch_id, p_assignment_id, p_org_id, p_color, p_adjustment, v_reason,
    v_affected_count, p_changed_by
  );

  INSERT INTO public.assignment_score_adjustment_items (
    batch_id, student_id, previous_adjustment, new_adjustment
  )
  SELECT
    v_batch_id,
    target.student_id,
    coalesce(current_adjustment.adjustment, 0),
    p_adjustment
  FROM unnest(v_student_ids) AS target(student_id)
  LEFT JOIN public.assignment_student_score_adjustments current_adjustment
    ON current_adjustment.assignment_id = p_assignment_id
   AND current_adjustment.student_id = target.student_id;

  INSERT INTO public.assignment_student_score_adjustments (
    assignment_id, student_id, org_id, adjustment, updated_by, updated_at
  )
  SELECT p_assignment_id, target.student_id, p_org_id, p_adjustment, p_changed_by, now()
  FROM unnest(v_student_ids) AS target(student_id)
  ON CONFLICT (assignment_id, student_id) DO UPDATE
  SET adjustment = EXCLUDED.adjustment,
      org_id = EXCLUDED.org_id,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

  UPDATE public.submissions
  SET score_adjustment = p_adjustment
  WHERE assignment_id = p_assignment_id
    AND student_id = ANY(v_student_ids);

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_assignment_score_adjustment(uuid, uuid, uuid[], text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_assignment_score_adjustment(uuid, uuid, uuid[], text, numeric, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_assignment_score_adjustment(uuid, uuid, uuid[], text, numeric, text, uuid) TO service_role;
