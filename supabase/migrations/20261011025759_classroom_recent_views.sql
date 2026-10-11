-- One row per user and classroom records the latest successful visit to the
-- classroom detail page. This stays separate from classrooms.updated_at so a
-- content/settings edit cannot silently reorder the user's recent list.
CREATE TABLE public.classroom_recent_views (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, classroom_id)
);

CREATE INDEX classroom_recent_views_user_viewed_idx
  ON public.classroom_recent_views(user_id, viewed_at DESC);

ALTER TABLE public.classroom_recent_views ENABLE ROW LEVEL SECURITY;

-- The current product uses this recency list for classrooms a teacher owns.
-- Keep the write boundary equally narrow even though the page also checks
-- ownership before attempting the upsert.
CREATE POLICY "classroom_recent_views_own_select"
  ON public.classroom_recent_views
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "classroom_recent_views_owned_insert"
  ON public.classroom_recent_views
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.classrooms classroom
      WHERE classroom.id = classroom_id
        AND classroom.teacher_id = auth.uid()
    )
  );

CREATE POLICY "classroom_recent_views_owned_update"
  ON public.classroom_recent_views
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.classrooms classroom
      WHERE classroom.id = classroom_id
        AND classroom.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.classrooms classroom
      WHERE classroom.id = classroom_id
        AND classroom.teacher_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.classroom_recent_views TO authenticated;
