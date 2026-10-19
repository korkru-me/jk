# Gradebook follow-up release — 19 October 2026

The owner explicitly requested publishing every remaining completed change in this chat after the earlier migration-history stop/report. The release composes five scoped commits onto Production baseline `9004e96`, preserving other chats' Auth/password/signup/email implementation and all dirty primary work. PR [#69](https://github.com/korkru-me/jk/pull/69) is merged as `757eb5f75e316bc810167dd781702bb3d932435e`. Both exact deadline migrations are active, Production is READY on the merged application commit, and actual primary-local parity is verified below.

## Release scope

Primary commits: `efcf1fe`, `a45b5ce`, `0b43b95`, `f999922`, `2fa5a12`. They remove the tools/history panel and unused reader data, compact the roster matrix with full-name tooltips, move extensions to assignment headers with an assignment-wide dialog, and separate assignment-detail links from score-sort arrows. The release adds a narrow RPC organization-membership check matching assignment UPDATE policy; its tests reproduce the actual owner/co-teacher/super-admin RLS helpers. The existing service-only grading helper is unchanged.

## Database activation completed

Pre-activation read-only checks on both hosted projects found every target dependency present and compatible. Production then had 149 applied versions; its 13 older local-only migrations were genuinely unapplied SEB/storage work, not prerequisites. Staging had those versions, but lacked the separate retention migration. Auth-rate-limit history missing from the old primary branch was already canonically tracked on master. These unrelated versions were not replayed, marked applied or reverted by this release.

For each environment, a private temporary CLI project fetched that environment's actual applied history and checked it against the remote ledger. Only these CLI-created versions were added and applied, preserving their canonical versions and transaction/ledger records:

- `20261019154815_extend_assignment_deadline.sql`, SHA-256 `9c4c434c5ef39f8d4b8c506b4a08a0904fc0c6614d91de8aac3d94fcad1b5248`.
- `20261019162413_assignment_deadline_conflict_response.sql`, SHA-256 `709e712d0b90f1f722716b6b392409a7664cbceacc898096a49919e32ee38df9`.

Each dry-run was restricted to the intended pending deadline version(s), with vault/seed/roles excluded. Both versions are applied on Staging `dyuxkrzeveknqgtuzpbh` and Production `libsutfinswqkruihwdx`. There was no history repair or broad push from the old primary migration directory. This deliberately scoped activation follows the owner's renewed release instruction and does not claim whole-repository migration parity. The final deadline function body MD5 is `0d0b11450b5924ae566912e590f48336`; the guard and function grants retain the verified boundaries. The RPC allows authenticated callers only after its own exact active-actor/assignment authorization, with PUBLIC/anon/service-role execution revoked and the internal guard not exposed for direct execution.

The security advisor reports the intentional [0029 authenticated security-definer entry point](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) for this RPC. Its fixed empty search path, exact current-user management checks, owner organization-membership predicate, row lock and CAS are required controls; broadening table or function grants is not a remediation. This warning is recorded rather than claiming every advisor finding is clear.

Production verification is read-only; all write testing used owned synthetic Staging accounts and rows. No real Production deadline, grade, notification or student data was changed for QA.

## Validation and hosted Staging evidence

The composed application passed all 317 Vitest files / 4,284 tests, TypeScript, token lint, diff checks and an isolated Webpack production build before the SQL-only conflict follow-up. Application code was unchanged by that follow-up; its final 41 real-SQL cases and the Stage harness's 40 safety cases passed independently. An independent read-only review found no release-blocking application issue. Initial Staging deployment `dpl_FLgphgzgAuNsxM3aekjESrjaiyVN` at `0bfd4f1217cc5f763a124f79184b043dc7efb978` was superseded by READY deployment `dpl_57dYsyYuYGPJKL8JQ4B1TjbsaeXF` at `f43d6c6b1676268551af538d5dc2cc8c345c3ffd`. The final deployment owns the canonical `staging.korkru.com` alias.

The first synthetic gate exposed a hosted stale-CAS hang: PostgREST 14 retries custom SQLSTATE `40001`. The additive conflict migration changes only that function's application conflict to `PT409`, preserving its owner, grants, security-definer status and empty search path. The already-applied base migration stays immutable. This follows the [Supabase troubleshooting guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Every unsuccessful synthetic run was cleaned through its exact private manifest; no real data was used.

The final hosted gate passed every phase using two linked classrooms and four synthetic accounts, including assignment-wide receipt/persistence, student direct-table denial, exact management boundaries, stale CAS rejection, legacy personal on-time preservation and unchanged scores/timers. The Stage-only harness uses bounded requests, no POST retries, strict project/origin/migration fences and safe request tracing, and requires both migration versions before writes.

The real Staging UI saved `2026-10-22 05:27` Asia/Bangkok and persisted `2026-10-21T22:27:00Z`, closed the dialog, and showed the saved closing time when reopened. The due date, 120-minute duration, submitted score `0.4` and in-progress score `0.2` were unchanged. Both score-sort directions, assignment-title navigation, pending-review navigation and removed tools-panel absence passed. Cleanup of all four synthetic accounts and exact owned data passed.

## Production and actual primary-local parity

PR #69 is merged into master `757eb5f75e316bc810167dd781702bb3d932435e`. Production deployment `dpl_EofAVuccURGnNLLoz3wVrMvWtwry` is READY at that exact application commit and owns both `www.korkru.com` and `korkru.com`. Authenticated read-only browser verification confirms the production environment marker, no Staging badge, compact identity widths of 48/173/67/58/58/86px, 12 header extension controls and zero cell controls. A real unlimited assignment correctly explains that no extension is required; no deadline save was attempted. The pending-review button opens the matching assignment results route, and the removed tools/history panel is absent. Screenshot: `/private/tmp/korkru-gradebook-production-20261019.png`.

The actual primary checkout at `localhost:3000` runs the same 18 scoped runtime/test/migration files byte for byte; retired `grading-tools.tsx` remains absent. Primary synchronization commit `d7616c0` is pushed on `codex/student-classroom-cards`. Browser verification matches the same six identity widths, 12 header controls, zero cell controls and 16 assignment links. Primary TypeScript and Next MCP compilation/runtime checks pass. The existing question UI edits, AGENTS changes, tsconfig, solution-PDF component and work-type patch are preserved; no server restart, `.next` wipe, Auth-source overwrite or real-data QA write was performed.

Status: released and verified on Production and actual localhost:3000; hosted synthetic Staging data cleaned. This record can be followed by a documentation-only commit without changing the verified application scope. Physical touch devices, native SEB/IME and Auth/email flows are outside this release's verification scope.
