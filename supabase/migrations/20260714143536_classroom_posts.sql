-- Classroom "stream" announcements (teacher -> students, broadcast only, no
-- comments/replies). A `classroom_posts` + `post_comments` pair already
-- existed on the remote project from an earlier out-of-band experiment (no
-- local migration ever created them, different column names, 0 rows) —
-- dropped and replaced here with the schema this feature's code expects.
DROP TABLE IF EXISTS public.post_comments;
DROP TABLE IF EXISTS public.classroom_posts;

CREATE TABLE public.classroom_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body         text NOT NULL,
  pinned       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classroom_posts_classroom
  ON public.classroom_posts(classroom_id, pinned DESC, created_at DESC);

ALTER TABLE public.classroom_posts ENABLE ROW LEVEL SECURITY;

-- Owning teacher or an admin/manage co-teacher can read/write/delete any post
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

-- Enrolled students can read (uses the SECURITY DEFINER helper already
-- established for assignments_student_select, to avoid RLS recursion)
CREATE POLICY "classroom_posts_student_select" ON public.classroom_posts
  FOR SELECT TO authenticated
  USING (classroom_id = ANY(get_my_enrolled_classroom_ids()));

-- Extend the notifications type enum for the new classroom-post fan-out
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('assignment_reminder', 'co_teacher_invite', 'extension_granted', 'classroom_post'));
