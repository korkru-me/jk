-- Comments on classroom stream posts. classroom_posts is broadcast (teacher
-- announcement) but replies are two-way: anyone who can see the post
-- (owning teacher, admin/manage co-teacher, or an enrolled student) can
-- comment on it.
CREATE TABLE public.post_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.classroom_posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON public.post_comments(post_id, created_at ASC);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_comments_select" ON public.post_comments
  FOR SELECT TO authenticated
  USING (
    post_id IN (
      SELECT cp.id FROM public.classroom_posts cp
      WHERE cp.classroom_id = ANY(get_my_teaching_classroom_ids())
         OR is_classroom_co_teacher(cp.classroom_id, ARRAY['admin', 'manage', 'view'])
         OR cp.classroom_id = ANY(get_my_enrolled_classroom_ids())
    )
  );

CREATE POLICY "post_comments_insert" ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND post_id IN (
      SELECT cp.id FROM public.classroom_posts cp
      WHERE cp.classroom_id = ANY(get_my_teaching_classroom_ids())
         OR is_classroom_co_teacher(cp.classroom_id, ARRAY['admin', 'manage', 'view'])
         OR cp.classroom_id = ANY(get_my_enrolled_classroom_ids())
    )
  );
