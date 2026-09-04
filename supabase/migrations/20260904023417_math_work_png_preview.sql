-- Board previews may also be stored as PNG.
--
-- No version of Safari can encode WebP from a canvas: canvas.toBlob() quietly
-- returns a PNG instead. Every iPad, iPhone and Mac-on-Safari therefore failed
-- to save a teaching board or attach scratchpad work, because the client, the
-- bucket and the server all required image/webp. The client now falls back to
-- PNG and tells the Server Action which format it produced, so the bucket has
-- to accept that one extra image type.
--
-- Nothing else about the bucket changes: it stays private with a 5 MiB limit
-- and no storage.objects policy, so browsers still reach it only through
-- path-bound signed upload tokens and short-lived signed read URLs.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/webp', 'image/png', 'application/json']
WHERE id = 'math-work-artifacts';
