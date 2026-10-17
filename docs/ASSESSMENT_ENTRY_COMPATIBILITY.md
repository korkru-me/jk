# Assessment entry schema compatibility — 14 October 2026

The user’s ordinary browser exam failed before the waiting room because the live database lacks `submissions.seb_config_revision`, a field from the gated SEB release-binding rollout. The previous read selected it for every exam and exercise and received PostgreSQL 42703.

`readWithSubmissionRevision` retries only that exact missing-column error with the legacy projection. Entry, attempt resume, writable-answer access and streak draws keep their authenticated resource/student filters. SEB-required work fails closed on the legacy schema; permission/network/other schema errors are not ignored. No migration, RLS/Storage change, native rollout or scoring change is included.

Validation: TypeScript and token lint PASS; 245 Vitest files / 3,244 tests PASS; isolated production webpack build PASS. Regression covers current/legacy schemas, read-only waiting, explicit start/resume, write access and SEB denial. Production schema-only waiting/resume/write queries return HTTP 200 with limit=0; no real answer or QA attempt was read/written in Production.

Synthetic Staging browser UAT: exercise and browser exam reach waiting then load ExamClient with answer controls after explicit start. Exercise autosave was confirmed as a boolean without printing its payload. Practice passes its access-code waiting page and reaches the paginated question list. React inspection confirms ExamClient for both assessment types. Next MCP reports no compilation/runtime issues for QA and the primary localhost:3000 server after integration. Only the assessment files were integrated into the primary checkout; its unrelated dirty classroom, dashboard and branding work is preserved.

The synthetic assessments are removed before the manifest-scoped practice cleanup. All QA credentials/state remain outside Git. The primary checkout and the isolated release branch both receive committed source; release deployment remains subject to exact commit, READY and canonical-domain verification.

Cleanup PASS: two synthetic assessments and their attempts, eight synthetic accounts, two synthetic classrooms, and 1,000 synthetic source questions removed; manifest removed.
