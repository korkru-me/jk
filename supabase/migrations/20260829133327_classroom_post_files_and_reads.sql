-- Two things an announcement could not do yet: carry the file a teacher
-- actually hands out (a PDF ใบงาน, a Word form, a spreadsheet), and tell the
-- teacher who has seen it.

-- ─── 1. Attachments, not just pictures ──────────────────────────────────────
--
-- `image_urls` (added this morning, 20260829124126) is replaced rather than
-- kept alongside a second list: one array with a type per entry is what lets a
-- picture render inline and a PDF render as a file chip, and two parallel
-- arrays would be two orders to keep in sync. It is dropped, not migrated,
-- because it holds nothing anywhere — verified before writing this.
--
-- Each entry is {url, name, mime, size}. `name` exists because the stored path
-- is randomised: without it every attachment downloads as
-- "1788007637477_gv4hcdo5px4.pdf" instead of "ใบงานที่ 3.pdf".
ALTER TABLE public.classroom_posts DROP COLUMN IF EXISTS image_urls;
ALTER TABLE public.classroom_posts
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The bucket is replaced for the same reason: it was created hours ago, holds
-- no objects, and "classroom-post-images" would be a lie about a bucket that
-- now takes documents. 10 MB matches `submission-files`, the other bucket that
-- accepts PDFs — a PDF cannot be downscaled in the browser the way an image is.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'classroom-post-files', 'classroom-post-files', true, 10485760,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "classroom_post_files_owner_insert" ON storage.objects;
CREATE POLICY "classroom_post_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'classroom-post-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "classroom_post_files_owner_delete" ON storage.objects;
CREATE POLICY "classroom_post_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'classroom-post-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "classroom_post_files_owner_list" ON storage.objects;
CREATE POLICY "classroom_post_files_owner_list" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'classroom-post-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Retire the image-only bucket. Its policies go here, but the bucket row
-- itself cannot: Postgres refuses a direct DELETE on `storage.buckets`
-- ("Direct deletion from storage tables is not allowed"), so the row is
-- removed through the Storage API in the same session as this migration. It
-- was empty, so nothing was orphaned by the split.
DROP POLICY IF EXISTS "classroom_post_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "classroom_post_images_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "classroom_post_images_owner_list" ON storage.objects;

-- ─── 2. Who has seen an announcement ────────────────────────────────────────
--
-- One row per student per announcement, written the first time the post is on
-- their screen. Deliberately "seen", not "read": the app can tell that the
-- announcement was rendered in front of someone, and nothing more — the UI says
-- เห็นแล้ว for that reason.
--
-- No `updated_at`: the first sighting is the fact worth keeping. Re-reading an
-- announcement is not a new event, and ON CONFLICT DO NOTHING keeps the
-- original timestamp.
CREATE TABLE IF NOT EXISTS public.post_reads (
  post_id uuid NOT NULL REFERENCES public.classroom_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- The teacher's question is always "who in this room has not seen it", asked
-- per post.
CREATE INDEX IF NOT EXISTS idx_post_reads_post ON public.post_reads(post_id);

ALTER TABLE public.post_reads ENABLE ROW LEVEL SECURITY;

-- A student records only their own sighting, and only of an announcement they
-- are allowed to see in the first place. The EXISTS goes through
-- classroom_posts' own policies, so enrolment is checked there once rather
-- than restated here.
DROP POLICY IF EXISTS "post_reads_own_insert" ON public.post_reads;
CREATE POLICY "post_reads_own_insert" ON public.post_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.classroom_posts p WHERE p.id = post_id)
  );

-- A student sees their own rows; the teaching side sees every row for their own
-- classroom's announcements — that is the whole point of the feature.
DROP POLICY IF EXISTS "post_reads_select" ON public.post_reads;
CREATE POLICY "post_reads_select" ON public.post_reads
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.classroom_posts p
      WHERE p.id = post_id
        AND (
          p.classroom_id = ANY(get_my_teaching_classroom_ids())
          OR is_classroom_co_teacher(p.classroom_id, ARRAY['admin', 'manage', 'view'])
        )
    )
  );
