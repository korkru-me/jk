-- classroom_posts was left half-migrated: old out-of-band columns
-- (user_id/content/image_url/pinned_at) and old RLS policies still present
-- alongside the new author_id/body columns the app code expects, and
-- author_id's FK pointed at auth.users instead of public.users (breaking
-- the users(full_name) embed). 0 rows in the table, safe to fix in place.

DROP POLICY IF EXISTS "classroom_posts_student_insert" ON public.classroom_posts;
DROP POLICY IF EXISTS "classroom_posts_student_select" ON public.classroom_posts;
DROP POLICY IF EXISTS "classroom_posts_teacher_all" ON public.classroom_posts;

ALTER TABLE public.classroom_posts DROP COLUMN user_id;
ALTER TABLE public.classroom_posts DROP COLUMN content;
ALTER TABLE public.classroom_posts DROP COLUMN image_url;
ALTER TABLE public.classroom_posts DROP COLUMN pinned_at;
ALTER TABLE public.classroom_posts ADD COLUMN pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.classroom_posts ALTER COLUMN body SET NOT NULL;

ALTER TABLE public.classroom_posts DROP CONSTRAINT classroom_posts_author_id_fkey;
ALTER TABLE public.classroom_posts ADD CONSTRAINT classroom_posts_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_classroom_posts_classroom;
DROP INDEX IF EXISTS idx_classroom_posts_created;
CREATE INDEX idx_classroom_posts_classroom
  ON public.classroom_posts(classroom_id, pinned DESC, created_at DESC);

CREATE POLICY "classroom_posts_owner_all" ON public.classroom_posts
  FOR ALL TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  )
  WITH CHECK (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  );

CREATE POLICY "classroom_posts_student_select" ON public.classroom_posts
  FOR SELECT TO authenticated
  USING (classroom_id = ANY(get_my_enrolled_classroom_ids()));
;
