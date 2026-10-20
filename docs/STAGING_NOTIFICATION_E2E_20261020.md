# Staging migration reconciliation and assignment-notice E2E — 20 October 2026

Status: **Migration parity restored; synthetic fixture ready; hosted browser flow awaits the owner's Vercel sign-in.** This record supersedes the prior migration-history stop in the assigned-work/reminder release notes. It does not claim teacher publication, student popup or durable acknowledgement has passed yet.

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

The runner accepts only the exact Staging project/origin/deployment flags and independently validates anon/service-role JWT project claims. A separate parity attestation is set only after the live comparison. Run-owned credentials and IDs remain in an owned mode-0600 temporary manifest; keys are not printed or committed. Discovery accepts at most two exact run titles (exercise/exam), the canonical owner/org, one exact room and one exact question. Verification requires one own `classroom_post` notice with assignment ID per published work, exact recipient/actor/org/room/link, the expected durable read count and zero attempts.

Cleanup independently verifies Auth `qa_run`/`qa_kind`/email and exclusive sole-owner organizations, revokes synthetic sessions, removes only exact proven resources and verifies removal. A partial account-setup failure can recover its exact organization receipt; unexpected/shared resources fail closed and preserve the private manifest.

- Syntax and scoped whitespace checks passed.
- **59 new runner safety tests / 103 combined runner tests passed.** Tests include exact target/network fencing, manifest/provenance validation, notice/read-state checks and partial-setup cleanup recovery with unsafe cases preserving evidence.
- Actual fixture creation passed its Staging schema preflight and canonical ownership checks: two identities, one room/roster/question and **zero works, notices and attempts**. The private fixture is retained while awaiting browser access; cleanup has not yet run.

## Browser gate and remaining acceptance

Opening canonical Staging currently reaches Vercel login before KorKru. Ordinary GitHub and Google login attempts each reached their credential forms; no existing provider session was available. The owner said they would sign in; the latest observation still shows the normal Vercel login page. That tab is retained for handoff. No authentication bypass, protection override, secret-in-URL, permission expansion or weakening of Staging protection was used.

Before the manual flow, verify the visible `STAGING · ระบบทดสอบ` badge. Then sign in as the synthetic teacher, create and publish the exact run-owned exercise (and ordinary-browser exam variant), verify canonical unread notice rows, sign in as the synthetic student, inspect the popup metadata, click **รับทราบ**, verify the same notice becomes `is_read=true`, and reload to confirm it stays acknowledged with zero submissions. Record screenshot evidence and exact bounded cleanup results here. Until then, hosted publication-to-acknowledgement remains unverified.
