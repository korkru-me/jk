-- Gives `question-images` the limits its own UI already claims it has.
--
-- The widget has always said "JPG, PNG, GIF — สูงสุด 5 MB" and nothing has ever
-- enforced any part of that. This is the one bucket of the three created from
-- the dashboard before the project used the CLI, so unlike `work-images`
-- (5 MB, images only) and `submission-files` (10 MB, images + PDF) it was left
-- with no size limit and no MIME allow-list at all: any file, any size.
--
-- Not hypothetical — the bucket already holds two PDFs and 50 imported images
-- alongside the 131 question pictures.
--
-- 10 MB, matching `submission-files`, because two widgets write here and the
-- more permissive of them is right: `question-file-upload.tsx` stores a
-- teacher's reference material, which is routinely a scanned PDF, and a PDF is
-- not something the browser-side shrinker can reduce. Capping at the 5 MB the
-- *image* widget advertises would have started refusing worksheets that upload
-- fine today.
--
-- The cap is a backstop, not the usual path. Images are now shrunk in the
-- browser first (`lib/image-downscale.ts`), which takes a phone photo from
-- megabytes to a few hundred kilobytes long before it reaches Storage. What
-- the limit catches is what shrinking deliberately will not touch — an
-- animated GIF, a PDF, an image the browser could not decode.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'image/png',
      'image/jpeg',
      -- The browser-side shrinker re-encodes to WebP, so the bucket has to
      -- accept what the app now produces.
      'image/webp',
      -- Kept whole rather than re-encoded, because a canvas would flatten the
      -- animation to its first frame.
      'image/gif',
      -- `question-file-upload.tsx` puts a teacher's reference material in this
      -- same bucket, and that material is routinely a PDF. Restricting this to
      -- images would break the "ส่งไฟล์งาน" question type.
      'application/pdf'
    ]
WHERE id = 'question-images';
