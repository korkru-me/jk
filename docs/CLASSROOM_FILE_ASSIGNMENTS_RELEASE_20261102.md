# Classroom switcher and direct file assignments release — 2 November 2026

The owner explicitly authorized publishing all three completed changes on 2 November 2026. Production is **READY** at `master@0d75126ff3276d21863ad41e4f2aaed1b9bb8598`, merged through [PR #120](https://github.com/korkru-me/jk/pull/120). Vercel deployment `dpl_9jMw2fdaUq6B929ZcBqEPBySrdhV` reports target `production`, that exact `meta.githubCommitSha`, and canonical aliases `https://www.korkru.com` and `https://korkru.com`. Independent canonical-domain inspection returns the same deployment. Deployment URL: `https://jk-r2jds6ki9-korkru-mes-projects.vercel.app`.

## Released scope

- `9355ca4`: classroom-list contextual sidebar switcher using the already-authorized classroom rows, icons and metadata, with links into each room.
- `1c48072`: direct “งานส่งไฟล์” creation from the assignment menu, instructions and attachments owned by the assignment and excluded from the bank, one whole-work manual grade, ten student files, and withdrawal before the due date and before teacher review while retaining files. Existing file-upload questions remain compatible.
- `c9cdc3d`: informational overflow popup recommending one combined PDF, shared announcement/instruction PDF preview with fullscreen controls in direct work, legacy exams and question previews, and accurate manual-grading copy.

No schema, migration, RLS or dependency change was needed. The reserved assignment metadata does not add a QuestionType or alter the legacy Word import convention.

## Validation

The Production candidate passed TypeScript, semantic-token lint, 342 Vitest files / 4,863 tests, and an isolated Webpack production build. Local synthetic flows covered creating work, starting, attaching, submitting, withdrawing with files retained, resubmitting, zero/full manual grades, deadline/review blocking, ten/eleven files, and desktop/mobile rendering.

[Staging PR #119](https://github.com/korkru-me/jk/pull/119) merged as `80214aeea3f32cc836e51113a1cc3d252e5ef6c9`. Deployment `dpl_27BTuHfGosaauAKBkaJXCiQNm5Re` was READY at `https://staging.korkru.com`. The Staging branch passed TypeScript, token lint, 344 Vitest files / 4,885 tests and its Vercel build. The 166 local/remote Staging migration versions matched exactly (CLI lacked an access token; the connected migration-list tool supplied the remote read). No migration was applied.

The visible Staging badge was verified. Hosted synthetic labs exercised the real creation form with in-memory callbacks, the classroom dropdown and all five destination links, plus actual PDF loading, fullscreen (1512 × 753), shrinking and closing; console errors were empty. These fixture callbacks never contact Auth, Storage or the database.

Production smoke checks were read-only, using the owner's existing browser session: the new switcher listed eight rooms plus the all-rooms link, navigating into another room succeeded, the assignment menu exposed “งานส่งไฟล์”, and its real creation route rendered the instructions and whole-work score controls. No Production assignment, upload, answer, score or account was created or changed for testing.

## Primary localhost parity

The process listening on port 3000 was PID 3752, working directory `/Users/korkusonmasaen/Korkru/korkru`. All 46 released application files match the Production merge byte-for-byte. The 147 unrelated pre-existing changed/untracked files recorded before release retained their hashes; the primary branch/index and environment were preserved.

After Production became READY, the actual `localhost:3000` fixture again loaded the instruction PDF and expanded it to desktop and mobile viewport dimensions. Selecting file eleven opened the notice without altering the ten existing references. Closing returned focus to the attach button. At mobile width 390, the document width remained 390. Next MCP returned no runtime/config errors and no compilation issues. Evidence: `/private/tmp/korkru-release-local-pdf-desktop.png`, `/private/tmp/korkru-release-local-file-limit-desktop.png`, `/private/tmp/korkru-release-local-limit-mobile.png`, `/private/tmp/korkru-release-local-pdf-mobile.png`.

## Verification limits and handoff

A hosted Auth/Storage create-upload-submit-grade-withdraw roundtrip and a real database grading/withdrawal race were not exercised. The Chrome extension's file-URL permission prevented selecting local files again on hosted Staging; the corresponding ten/eleven-file flows passed on the primary local website. No extension permission was changed, no Supabase API keys were accessed, and the temporary redacted Staging environment download was removed. Pure/mocked tests and fixture behavior do not constitute those hosted integration results.

Application release is on `master` through PR #120. The release evidence is committed and pushed on isolated branch `codex/file-assignments-20261102`, alongside the released source, and its scoped documentation is merged into the dirty primary checkout without replacing other work. No database work remains required for this release.
