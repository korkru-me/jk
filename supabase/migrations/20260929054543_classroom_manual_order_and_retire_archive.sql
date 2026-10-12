-- Teachers can arrange active subject classrooms manually. Pinned classrooms
-- remain outside this order and keep leading the list until they are unpinned.
ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS display_order integer;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY teacher_id, classroom_type
      ORDER BY created_at DESC, id
    )::integer AS next_order
  FROM public.classrooms
  WHERE status = 'active'
)
UPDATE public.classrooms AS classroom
SET display_order = ranked.next_order
FROM ranked
WHERE classroom.id = ranked.id
  AND classroom.display_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_manual_order
  ON public.classrooms(teacher_id, status, classroom_type, pinned_at, display_order);

-- Archive is retired from the product. Preserve every legacy classroom by
-- moving it to the recoverable trash instead of deleting it.
UPDATE public.classrooms
SET
  status = 'deleted',
  deleted_at = COALESCE(deleted_at, now())
WHERE status = 'archived';

CREATE OR REPLACE FUNCTION public.reorder_my_classrooms(ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_count integer;
  supplied_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  supplied_count := COALESCE(array_length(ordered_ids, 1), 0);
  IF supplied_count < 1 OR supplied_count > 500 THEN
    RAISE EXCEPTION 'invalid classroom order';
  END IF;

  IF (SELECT count(DISTINCT id) FROM unnest(ordered_ids) AS ids(id)) <> supplied_count THEN
    RAISE EXCEPTION 'duplicate classroom id';
  END IF;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.classrooms
  WHERE teacher_id = auth.uid()
    AND status = 'active'
    AND classroom_type = 'subject'
    AND pinned_at IS NULL;

  IF expected_count <> supplied_count OR EXISTS (
    SELECT 1
    FROM unnest(ordered_ids) AS ids(id)
    LEFT JOIN public.classrooms AS classroom
      ON classroom.id = ids.id
      AND classroom.teacher_id = auth.uid()
      AND classroom.status = 'active'
      AND classroom.classroom_type = 'subject'
      AND classroom.pinned_at IS NULL
    WHERE classroom.id IS NULL
  ) THEN
    RAISE EXCEPTION 'classroom list changed';
  END IF;

  UPDATE public.classrooms AS classroom
  SET display_order = ordered.position::integer
  FROM unnest(ordered_ids) WITH ORDINALITY AS ordered(id, position)
  WHERE classroom.id = ordered.id
    AND classroom.teacher_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_my_classrooms(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_my_classrooms(uuid[]) TO authenticated;
