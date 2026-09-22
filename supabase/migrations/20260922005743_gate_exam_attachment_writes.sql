-- Student answer attachments now use a server-authorized signed upload URL.
-- The Server Action re-checks the exact answer owner, active attempt,
-- timer/deadline and SEB/Android exam-access session before issuing a target,
-- then inspects the stored object before returning its public URL.
--
-- Keeping these direct authenticated INSERT/DELETE policies would leave a
-- second write path that bypasses that boundary. Existing objects and public
-- read URLs remain untouched for backward compatibility; only direct client
-- mutation is removed. Server-side signed uploads and service-role cleanup do
-- not depend on these policies.

DROP POLICY IF EXISTS "work_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "work_images_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "submission_files_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "submission_files_owner_delete" ON storage.objects;
