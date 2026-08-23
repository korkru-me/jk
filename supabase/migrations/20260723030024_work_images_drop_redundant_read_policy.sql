-- The bucket is already public (public = true), which lets anyone fetch an
-- object by its known URL without any storage.objects RLS policy. The
-- explicit SELECT policy added in the previous migration additionally let
-- clients call storage list() and enumerate every file in the bucket
-- (flagged by the Supabase security linter as public_bucket_allows_listing).
-- Drop it — public read-by-URL still works via the bucket's public flag.
DROP POLICY IF EXISTS "work_images_public_read" ON storage.objects;
