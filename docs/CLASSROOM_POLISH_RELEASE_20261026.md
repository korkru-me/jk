# Classroom labels, calendar and announcement PDF release

The owner authorized releasing only these three chat tasks and their required support. Production Auth/email/question-import work already present in master was preserved. No dependency, environment, database or migration change is required or applied.

## Released scope

- Classroom create/settings labels read **ภาคเรียน / ปีการศึกษา**, matching the existing term/year value.
- Homeroom deadline calendar uses compact 44px day cells, responsive controls and selected-day styling. All days fit within one calendar, including six-week months.
- Announcement PDFs open a modal preview in teacher/student streams and the nested student announcement inbox. Outside click, Escape and close dismiss only the preview; the separate download control retains the original filename. Requests allow only this project's announcement Storage path and validate MIME, signature and a 10MiB bounded stream. Blob URLs and requests are cleaned up on close.
- The nested PDF opts into its own Base UI overlay. One synthetic PDF fixture is available only in local/isolated Staging QA. Its relative request retains the existing same-origin Vercel session; Storage requests omit credentials. Production labs remain disabled.

Production PR: https://github.com/korkru-me/jk/pull/85, merge `f45fae1c6291327a50195c047f472cf592771e1f`. Application candidate `9c6c9eab3c615536e8b433be4453dcd6031b81df` is based on master `65503184c93c3356d718eb04e02c0e120c2934d1`; do not deploy the older primary branch wholesale.

## Validation

- Candidate: 328 Vitest files / 4,747 tests passed; TypeScript, semantic token lint and production Webpack build passed. TypeScript was rerun after the build to avoid racing generated `.next/types` files.
- Staging PRs #84, #86 and #87 produced READY deployment `dpl_Ck4t4Qvo2iRQDfvVBDzEbagwhE8L`, exact source `403465c8ec7673e7c553467cb86e9222f722c081`, canonical `https://staging.korkru.com`, deployment URL `https://jk-336t5d9he-korkru-mes-projects.vercel.app`.
- Hosted synthetic browser checks confirmed the visible Staging badge, both term/year labels, 31-day and six-week calendars, native PDF content and outside/Escape dismissal while retaining the student parent announcement and all three pending announcements. No acknowledgement, notification or database write was performed.
- Local browser checks covered teacher stream and student nested preview, download (819-byte `%PDF-` sample), error/retry, X/Escape/outside dismissal, focus restore, object URL cleanup and mobile layouts. Scoped WCAG 2 A/AA checks reported no violations; native Chrome PDF frame best-practice warnings are not claimed as covered.
- Hosted lab date formatting produced the existing SSR/client timezone text hydration warning. The preview loaded after hydration; this release does not change the shared date formatter. Hosted validation uses a synthetic PDF, not a real classroom upload. The browser download-event helper stalled on Staging; the completed local download is the byte-level download evidence.

## Production and primary local parity

Production deployment `dpl_7EHuNgQt8HqvWdSUKoxU7FhEX5yB` is READY at exact source `f45fae1c6291327a50195c047f472cf592771e1f`. Both `https://www.korkru.com` and `https://korkru.com` are assigned to this deployment; deployment URL `https://jk-32k5akyrv-korkru-mes-projects.vercel.app`. Read-only public smoke checks passed: `/login` 200 without the Staging badge; calendar, classroom-announcement and student-announcement labs and the synthetic PDF asset each returned 404. No Production data was created or changed for verification.

Actual primary server: PID 1995, checkout `/Users/korkusonmasaen/Korkru/korkru`, `http://localhost:3000`. Branch `codex/student-classroom-cards`, pushed application commit `2254117`. Twelve application/test paths match the release byte-for-byte. Hashes of all 58 pre-existing modified/untracked files were preserved; local environment settings were not copied from hosting.

Primary validation: 323 Vitest files / 4,576 tests passed, TypeScript/token lint passed and Next MCP compilation issues and runtime configuration/session errors were empty. Rendered desktop/mobile calendar checks showed 31 days, 44px cells and no horizontal overflow (last day at 532px in 1512×747 and 578px in 390×844). PDF mobile bounds were left/right 16/374 and top/bottom 38/806 in 390×844. Student nested preview loaded and outside click returned to the original announcement without acknowledgement. After Production became Ready, all twelve scoped paths were compared against the fetched release commit again and the actual localhost student preview was reloaded and opened successfully.

Temporary evidence: `/private/tmp/korkru-classroom-staging-calendar.png`, `/private/tmp/korkru-classroom-staging-pdf-final.png`, `/private/tmp/korkru-classroom-local-calendar-final.png`, `/private/tmp/korkru-classroom-local-calendar-mobile-final.png`, `/private/tmp/korkru-classroom-local-pdf-nested-final.png` and `/private/tmp/korkru-classroom-local-pdf-mobile-final.png`. This document is a pushed handoff record on the isolated release branch; it does not require another Production deployment.
