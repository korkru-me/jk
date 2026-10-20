# Classroom header and teacher tabs release — 20 October 2026

Status: **Production application released; actual primary localhost:3000 parity verified.**

The owner explicitly approved publishing both chat changes after their local review: the classroom-list header proportions/deer clearance and the teacher subject-classroom Overview/Assigned work tabs. Unrelated dirty primary Auth, question UI, quota and configuration work was excluded.

## Released application

- PR [#77](https://github.com/korkru-me/jk/pull/77), merged as `92a3d83a707b3c0f92b006252f0fd6b3017d2e95`.
- Vercel deployment `dpl_GnJK2qE9evgjtnAwAwHvUhJGEsKB`, [deployment overview](https://vercel.com/korkru-mes-projects/jk/GnJK2qE9evgjtnAwAwHvUhJGEsKB), visibly **Ready**, **Production**, with source commit `92a3d83` and canonical domain `www.korkru.com` in the owner's authenticated Chrome session.
- Deployment URL: `https://jk-pfurm0xf5-korkru-mes-projects.vercel.app`; GitHub deployment `7201233396` reports success for that exact merge SHA.
- Original chat commits `4110b51` and `c36fb8b` were integrated onto fresh Production base `f488c93` as `9d90d7c` and `bf12b13`. Commit `4536e16` allows the synthetic classroom-entry fixture on isolated Staging through the existing environment guard; Production still returns 404.

Application scope is two UI files and the two guarded fixture entry files. No database, migration, authentication, scoring, notification or entitlement behavior changed.

## Validation before Production

- Clean `npm ci` from the release lockfile; TypeScript, design-token lint, scoped diff checks and isolated Webpack production build passed. Build used placeholder Supabase keys and did not read or mutate a live database.
- All 6 existing `exam-screen-lab-access` tests passed. Full unit suite was not repeated because the feature changes are UI/navigation and no `lib/` module changed.
- Staging commit `5f965fbabbe5817f9203cadadeb7526837bd1a87`; GitHub deployment `7201070948`, success, URL `https://jk-5y6pqfz31-korkru-mes-projects.vercel.app`.
- The owner signed in to Vercel in Chrome. Hosted checks used `https://staging.korkru.com/exam-screen-lab/classroom-list` and `/exam-screen-lab/classroom-entry`, with the visible **STAGING · ระบบทดสอบ** badge and synthetic data only.
- Verified the 2px border, 119.2px desktop header, 44px actions and no deer overlap; select-all/cancel and empty state; teacher Overview/Assigned work server navigation and its existing management controls; desktop and actual 390px layout without horizontal overflow. The original local checks also covered keyboard/focus, Back/Forward, rapid return clicks during loading, 320px, dark mode, homeroom and view-only guards.
- The release-branch preview was canceled by the configured ignored-build step; it is not claimed as a preview build pass. The clean local build and actual Staging deployment supplied validation instead.

## Production and primary-local checks

- Read-only Production checks: `https://www.korkru.com/login` returns 200; both `/exam-screen-lab/classroom-list` and `/exam-screen-lab/classroom-entry` return 404, preserving fixture isolation. Opening the protected classroom route in Chrome reached the ordinary KorKru login screen; no authenticated Production classroom workflow or data mutation is claimed.
- Primary checkout: `/Users/korkusonmasaen/Korkru/korkru`, existing branch `codex/student-classroom-cards`. Port 3000 had no listener at release verification, so the dev server was started there with its existing local environment; PID 5628 was observed listening on `127.0.0.1:3000`.
- The released UI files, fixture guards and required brand/Tabs/navigation dependencies match the release source byte-for-byte. Only the fixture guard delta needed syncing; the two original UI changes were already in primary.
- Chrome verified the real primary port 3000 fixtures: header 119.2px, border 2px, actions clear of the deer; Assigned work selects correctly and renders one teacher work list. At a measured 390px viewport, both tabs retain 44px height with no horizontal overflow. Next MCP reports no compilation issues or runtime errors.
- All 50 pre-existing modified/untracked files hashed at release start remained unchanged through verification. Primary local secrets and configuration were preserved. There was no schema apply/repair, external test fixture creation, or Production data write.

Evidence screenshots were captured for the Staging header/tabs, Production Ready deployment, and actual primary desktop/mobile parity. A documentation-only follow-up can advance the hosting SHA without changing the application files verified above.
