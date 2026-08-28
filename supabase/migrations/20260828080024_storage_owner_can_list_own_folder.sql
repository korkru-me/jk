-- Lets someone list their own folder — and only their own.
--
-- All three buckets carry INSERT and DELETE policies scoped to
-- `{auth.uid()}/...` but no SELECT policy at all, which is why reading an image
-- works (the buckets are public, so a known URL needs no policy) while listing
-- returns an empty array. That was deliberate: 20260723030024 dropped a broad
-- read policy precisely so nobody could enumerate the bucket.
--
-- The orphan sweep in ตั้งค่า → พื้นที่จัดเก็บไฟล์ has to enumerate to work.
-- "Which of my files does nothing point at any more" cannot be answered without
-- first knowing which files are mine. Without this it reported zero orphans for
-- everyone, forever — a silent no-op, which is worse than not shipping it.
--
-- Scoped to the caller's own first path segment, so it grants exactly what the
-- sweep needs and nothing the earlier decision withheld: a teacher can list
-- their own uploads, and still cannot enumerate anyone else's.
DROP POLICY IF EXISTS "question_images_owner_select" ON storage.objects;
CREATE POLICY "question_images_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'question-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "work_images_owner_select" ON storage.objects;
CREATE POLICY "work_images_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'work-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "submission_files_owner_select" ON storage.objects;
CREATE POLICY "submission_files_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submission-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- `question-images` was created from the dashboard and never had a delete
-- policy written down alongside the others. The sweep deletes through the same
-- API the "remove this picture" button already uses, so state the rule here
-- rather than leaving it as whatever the dashboard happened to set.
DROP POLICY IF EXISTS "question_images_owner_delete" ON storage.objects;
CREATE POLICY "question_images_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'question-images' AND (storage.foldername(name))[1] = auth.uid()::text);
