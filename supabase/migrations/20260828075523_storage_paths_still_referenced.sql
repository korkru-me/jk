-- "Is anything still pointing at this file?" — the one question the storage
-- sweep and the delete-a-โจทย์ cleanup both have to answer before removing
-- anything.
--
-- It cannot be answered under RLS. Duplicating a โจทย์ copies its `image_urls`
-- verbatim, so a file in my folder can be the only picture in a private โจทย์
-- belonging to a teammate who duplicated something I shared. That row is
-- invisible to me, I would read "nothing references this", and deleting the
-- file would put a hole in their โจทย์. So the check runs as definer, over
-- every row, regardless of who owns it.
--
-- Nothing leaks by doing so. The function is only ever told about paths and
-- only ever answers with a subset of the paths it was given, and it derives the
-- folder it will look at from `auth.uid()` rather than taking it as an
-- argument — so a caller cannot ask about a file that is not already theirs,
-- and cannot enumerate anyone's. That is deliberate: `work-images` was created
-- without a SELECT policy for exactly this reason (see
-- 20260723090100_work_images_drop_redundant_read_policy.sql), and a function
-- that listed other people's object keys would hand back what that decision
-- withheld.
--
-- Matching is plain substring containment against whole rows cast to text, not
-- a column list and not a regex. Images live in `image_urls`,
-- `solution_image_urls`, `mcq_options[].image_url` and
-- `extra_data.attachment_urls` today, and a column added next month would be
-- missed by any list written now. A URL carrying a `?v=` suffix still contains
-- the path, so containment holds where an exact match would not — and every
-- inexactness here errs towards keeping a file, which is the only direction
-- that is safe to be wrong in.
CREATE OR REPLACE FUNCTION public.storage_paths_still_referenced(paths text[])
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prefix text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ไม่ได้เข้าสู่ระบบ';
  END IF;

  IF paths IS NULL OR array_length(paths, 1) IS NULL THEN
    RETURN;
  END IF;

  -- A caller may only ask about their own folder, and the folder comes from
  -- their token rather than from the call.
  prefix := auth.uid()::text || '/';
  IF EXISTS (SELECT 1 FROM unnest(paths) p WHERE p IS NULL OR position(prefix in p) <> 1) THEN
    RAISE EXCEPTION 'ตรวจสอบได้เฉพาะไฟล์ของตัวเอง';
  END IF;

  -- Rows are narrowed to those mentioning this user's folder before the
  -- per-path check, so the expensive part runs once per table rather than once
  -- per file.
  RETURN QUERY
  WITH candidate_rows AS (
    SELECT q::text AS body FROM public.questions q WHERE q::text LIKE '%' || prefix || '%'
    UNION ALL
    SELECT a::text FROM public.submission_answers a WHERE a::text LIKE '%' || prefix || '%'
  )
  SELECT DISTINCT p
  FROM unnest(paths) AS p
  WHERE EXISTS (SELECT 1 FROM candidate_rows c WHERE position(p in c.body) > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_paths_still_referenced(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.storage_paths_still_referenced(text[]) TO authenticated;
