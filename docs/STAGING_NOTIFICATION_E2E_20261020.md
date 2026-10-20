# Staging migration reconciliation and assignment-notice E2E — 20 October 2026

Status: **Migration parity restored; real hosted publication → student popup → durable acknowledgement passed for both an exercise and a browser-mode exam; exact synthetic cleanup passed.** This closes the prior assigned-work hosted verification gap. It does not claim a separate real manual-reminder-button or SEB/SMTP test.

The repair and guarded runner are pushed through PR [#78](https://github.com/korkru-me/jk/pull/78), merged into `staging` as `26c010aed9133f928213719c5fed4dda7d4c840d` (implementation commit `876692927cdd0bb51268fbce887546b03d7da1de`). Read-only Vercel inspection confirms canonical Staging is READY at deployment `dpl_9QXYozgMj7yWihEDL4vP2pT2GP7n`; READY metadata is not an authenticated UI test. No Production release is part of this repair.

## Scope and authorization

The owner requested repairing migration history and Staging access, then testing real teacher assignment publication through student popup and acknowledgement. After automatic approval review rejected the initial retention execution and broad Preview environment download, the owner explicitly approved (1) existing migration `20261015132234` on Staging only and (2) only the Staging anon/service-role keys for synthetic fixture management. The broad environment download was not performed. No Production data, credentials or configuration were changed.

## Migration evidence

- Exact target: Supabase `Korkru Staging`, project `dyuxkrzeveknqgtuzpbh`; canonical UI `https://staging.korkru.com`.
- Fresh CLI preflight found remote-only `20261009142610` and local-only `20261015132234`. The earlier report of 165 history rows is historical; the fresh remote count was 164 before this repair.
- `supabase migration fetch --project-ref ...` recovered the remote history into a temporary directory. The SEB source `20261009142610_atomic_seb_exam_start.sql` matched the existing known source byte-for-byte, SHA-256 `a4570d2a03b51be4d2b9ab69d8d391a6a5543c3d9674cfe9f0fba0e06655a2b0`. Restored only this source file to the Staging branch; its SQL was not replayed.
- Catalog checks proved retention migration `20261015132234` was not applied: the three purge functions and two retention indexes still existed, and the five table comments still described the older state. The two scheduled retention jobs were already absent.
- Verified the exact committed retention source SHA-256 `f85bfad6c692ac5727a7ee7b40203fb5bc4ba6a7f17029426d5815706f6a6161`. Executed that source once inside a transaction with an unapplied-history assertion through `supabase db query --linked --project-ref ... --file ...`, then recorded only `20261015132234` with `supabase migration repair --status applied`.
- Post-check: **165 local / 165 remote versions, no local-only or remote-only versions.** Three purge functions, two retention indexes and both scheduled jobs are absent; exactly one history row exists for the applied version. Evidence row counts stayed unchanged: events 8, sessions 1, connections 1, SEB check-ins 1, Android approvals 0.
- The retention change keeps evidence until parent assignment deletion; it changes neither current evidence rows nor RLS, exam-access validity or parent deletion cascades. No blanket push/reset, reverted-history repair, new migration or Production migration was used.

## Bounded synthetic fixture and checks

`scripts/verify-assigned-work-notices-staging.mjs` creates only two synthetic identities (one teacher, one student), their personal organizations, one active subject room, one roster membership and one private written question. It creates no assignment, notification, attempt or acknowledgement. The actual teacher and student UI must produce those results.

The runner accepts only the exact Staging project/origin/deployment flags, validates project/role claims when JWT keys are used, and contains every request to the fixed Staging project. This run used JWT keys with matching project/role claims; opaque publishable/secret keys are also supported without a claim-validation assertion. A separate parity attestation is set only after the live comparison. Run-owned credentials and IDs remain in an owned mode-0600 temporary manifest; keys are not printed or committed. Discovery accepts at most two exact run titles (exercise/exam), the canonical owner/org, one exact room and one exact question. Verification requires one own `classroom_post` notice with assignment ID per published work, exact recipient/actor/org/room/link, the expected durable read count and zero attempts.

Cleanup independently verifies Auth `qa_run`/`qa_kind`/email and exclusive sole-owner organizations, revokes synthetic sessions, removes only exact proven resources and verifies removal. A partial account-setup failure can recover its exact organization receipt; unexpected/shared resources fail closed and preserve the private manifest.

- Syntax and scoped whitespace checks passed.
- **59 new runner safety tests / 103 combined runner tests passed.** Tests include exact target/network fencing, manifest/provenance validation, notice/read-state checks and partial-setup cleanup recovery with unsafe cases preserving evidence.
- Actual fixture creation passed its Staging schema preflight and canonical ownership checks: two identities, one room/roster/question and **zero works, notices and attempts**. After the two real UI flows, scoped cleanup revoked synthetic sessions and removed exact notices, works, question, room, sole-owner organizations and Auth accounts. The private manifest and temporary two-key environment file were removed.

## Hosted browser acceptance completed

The owner completed normal Vercel sign-in in Chrome. The in-app browser had a separate unauthenticated cookie jar, which explains why its old login page did not change. Browser inventory located the already accessible Chrome Staging tab; the visible **STAGING · ระบบทดสอบ** badge was verified before the real app flow. Both synthetic accounts then used normal KorKru email/password login. No authentication bypass, protection override, secret-in-URL, permission expansion or weakening of Staging protection was used. The agent-created test tab and obsolete in-app login tab were closed; the owner's original Chrome tabs were preserved.

The resumed read-only migration preflight again confirmed **165 versions, zero differences**. The existing synthetic run was validated rather than recreated. Real teacher UI `/assignments/new` selected the one owned question and exact room/all-student audience, then clicked creation and **เผยแพร่ทันที**. No script or SQL invoked publication, notification creation or acknowledgement.

- Exercise `d9565ff4-2685-4030-86c6-ef507aa21e55`: teacher UI publication created exactly one canonical unread `classroom_post` notice. The student saw the exact title, room, teacher, exercise badge and **ไม่กำหนดวันส่ง**, then clicked **รับทราบ**. The verifier changed from 1 work / 1 notice / 0 read / 1 unread to 1 / 1 / 1 / 0, with zero attempts throughout. Reload showed zero dialogs.
- Browser-mode exam `39b99b9d-3e58-4492-bea2-bba3a2b14a62`: native date controls showed the correct values and review summary before publication. Persisted start was `2026-10-20T01:00:00Z`; due was `2026-10-23T16:59:00Z`; close was `2026-10-24T16:59:00Z`. The student popup showed **ข้อสอบ**, **23 ต.ค. 2569 23:59** due and **24 ต.ค. 2569 23:59** close, matching Asia/Bangkok data.
- Direct scoped SQL observed exam notification `f33f0d65-0d69-45c4-b41c-26263459cc6a` as `is_read=false` before the student's real click and **the same ID** as `is_read=true` afterward. Exercise notice `aec6f05e-ed17-4815-a523-205adb420573` stayed true. Final guarded verification passed **2 works / 2 notices / 2 read / 0 unread / 0 attempts**. Reload again showed zero dialogs; the test tab's captured warning/error console entries were empty.
- Screenshots captured the actual hosted teacher publication, both student popups and acknowledged dashboard. The exam popup image includes the visible Staging badge, work type, room/teacher and correct due/close metadata; it is synthetic-account hosted evidence, not the injected local lab.
- Final cleanup runner passed. Independent exact-run SQL confirmed **0 synthetic Auth users, 0 room, 0 roster, 0 question, 0 works, 0 notices and 0 attempts**. The runner independently checked the deletion of both exact personal organizations. No fixture or temporary project-key file remains.

## Scope and date-entry note

This resumed verification required no application, RLS, schema or migration changes. The first attempt to fill native datetime controls through the browser's Playwright `fill` API did not update the controlled form values, leaving the exercise's dates empty. The actual persisted nulls and no-due popup were checked explicitly. Native CUA `setValue` then visibly updated the exam inputs, added the late-band section and review summary, and persisted all three exact dates. No application date-reset bug is established by the failed automation entry. Future browser verification should inspect visible native control/review values before publishing.

Hosted claims are bounded to these two synthetic publication/acknowledgement workflows. They do not establish large-cohort performance, concurrent-hook exactly-once delivery, SEB entry, SMTP/email delivery, manual reminder-button delivery, real-student UAT or any Production write test. The application release itself was already published in PR #73; this work closes its Staging data-verification gap and records the authorized earlier Staging-only migration repair.
