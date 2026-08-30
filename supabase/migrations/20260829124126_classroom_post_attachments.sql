-- Lets an announcement carry pictures — a timetable photo, a form to fill in,
-- a picture of the board — instead of being plain text only. Links need no
-- column: a URL typed into the body is turned into a link at render time.
--
-- Shape follows `submission_answers.work_images`: a jsonb array of public
-- URLs, positional, defaulting to empty. Every existing post reads back as
-- "no images" without a backfill.
ALTER TABLE public.classroom_posts
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Own bucket rather than a corner of `question-images`. The storage sweep
-- (`storage_paths_still_referenced`) only knows about `questions` and
-- `submission_answers`, so a post image living in a bucket that sweep covers
-- would be reported as an orphan and offered up for deletion while a class is
-- still reading it. A separate bucket is invisible to that sweep, which is the
-- safe direction to be wrong in; deleting a post removes its own images.
--
-- Public read by URL, 5 MB, images only — the same convention as
-- `work-images`, whose migration explains why there is no SELECT policy.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('classroom-post-images', 'classroom-post-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Writing is per-user under `{auth.uid()}/`, not per-classroom: Storage
-- policies cannot see who co-teaches what without a join back into public
-- tables, and the real gate on an announcement is the INSERT policy on
-- `classroom_posts` itself. Uploading a file nothing links to costs a few
-- kilobytes in the uploader's own folder.
DROP POLICY IF EXISTS "classroom_post_images_owner_insert" ON storage.objects;
CREATE POLICY "classroom_post_images_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'classroom-post-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "classroom_post_images_owner_delete" ON storage.objects;
CREATE POLICY "classroom_post_images_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'classroom-post-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Lets the uploader see their own folder (needed to re-list after a failed
-- write), matching 20260828080024_storage_owner_can_list_own_folder.sql. Scoped
-- to the caller's prefix, so it grants no view of anyone else's files.
DROP POLICY IF EXISTS "classroom_post_images_owner_list" ON storage.objects;
CREATE POLICY "classroom_post_images_owner_list" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'classroom-post-images' AND (storage.foldername(name))[1] = auth.uid()::text);
