# Gradebook follow-up release — 19 October 2026

The owner explicitly requested publishing every remaining completed change in this chat after the earlier migration-history stop/report. The release composes five scoped commits onto current Production master `9004e96`, preserving other chats' Auth/password/signup/email implementation and all dirty primary work.

## Candidate scope

Primary commits: `efcf1fe`, `a45b5ce`, `0b43b95`, `f999922`, `2fa5a12`. They remove the tools/history panel and unused reader data, compact the roster matrix with full-name tooltips, move extensions to assignment headers with an assignment-wide dialog, and separate assignment-detail links from score-sort arrows. The release adds a narrow RPC organization-membership check matching assignment UPDATE policy; its tests reproduce the actual owner/co-teacher/super-admin RLS helpers. The existing service-only grading helper is unchanged.

## Database activation plan and scope

Read-only checks on both hosted projects found every target dependency present and compatible. Production has 149 applied versions; its 13 older local-only migrations are genuinely unapplied SEB/storage work, not prerequisites. Staging has those versions, but lacks the separate retention migration. Auth-rate-limit history missing from the old primary branch is already canonically tracked on master. These unrelated versions must not be replayed, marked applied or reverted by this release.

For each environment, a private temporary CLI project fetches that environment's actual applied history. Verify its versions match the remote ledger, then add only CLI-created `20261019154815_extend_assignment_deadline.sql`, SHA-256 `9c4c434c5ef39f8d4b8c506b4a08a0904fc0c6614d91de8aac3d94fcad1b5248`. The dry-run must list exactly this one pending version. Apply it through the CLI with vault/seed/roles excluded, preserving its canonical version and transaction/ledger record. No history repair or broad push from the old primary migration directory is allowed. This is a deliberately scoped activation following the owner's renewed release instruction, not a claim of whole-repository migration parity.

Staging application/SQL tests, deployment identifiers, Production confirmation and primary port-3000 parity are recorded below as each phase completes. Production verification is read-only; all write testing uses owned synthetic Staging accounts and rows.

## Validation and Staging findings

The composed application passed all 317 Vitest files / 4,284 tests, TypeScript, token lint, diff checks and an isolated Webpack production build. An independent read-only review found no release-blocking application issue. Staging application deployment `dpl_FLgphgzgAuNsxM3aekjESrjaiyVN` is READY at `0bfd4f1217cc5f763a124f79184b043dc7efb978`, with `staging.korkru.com` assigned to it.

The first migration is applied on Staging. The synthetic gate confirmed the assignment-wide save, both classroom links, safe student table denial, legacy deadlines and unchanged scores/timers. It also exposed a hosted stale-CAS hang: PostgREST 14 retries custom SQLSTATE `40001`. The additive CLI-created `20261019162413_assignment_deadline_conflict_response.sql` changes only that function's application conflict to `PT409`, preserving its owner, grants, security-definer status and empty search path. The already-applied base migration stays immutable. This follows the [Supabase troubleshooting guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Every unsuccessful synthetic run was cleaned through its exact private manifest; no real data was used.

The Stage-only harness has bounded requests, no POST retries, strict project/origin/migration fences and safe request tracing. Its 40 safety tests pass. It requires both migration versions before write testing.

Status: additive conflict fix and full hosted validation in progress; Production remains unchanged.
