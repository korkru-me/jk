# Current-local production synchronization — 15 October 2026

## Source and recovery

The owner requested an audit of 14–15 October chats, excluding SEB, and deployment matching the current localhost interface. Eighteen relevant KorKru chats were inspected, including earlier turns needed to map completed work to source. Two imported Claude chats cannot expose their message history through the app tool; their titles concern image/video models and are outside this web release. No other chat was messaged or resumed.

The active local interface is preserved by `0bb51b3` on `codex/student-classroom-cards`, pushed to origin. Before committing, the working patch, untracked-file archive, refs and file hashes were saved locally under `/private/tmp/korkru-release-20261015-2148`. The paused PDF viewer, duplicate handoff patch and generated local TypeScript cache include remain untouched outside the finished-source commit.

Release worktree: `korkru-release-20261015`, branch `codex/local-production-sync-20261015`. It merges current production `df3ec7f` with the complete local interface, preserves the browser schema compatibility fix, and integrates the completed attempt-expiry work from `codex/attempt-expiry`. UI files for classrooms, questions, landing and the browser icon match the local snapshot; expiry notices preserve the current compact result component and work-type buttons.

The unreleased `20261009142610_atomic_seb_exam_start.sql` was excluded from this release tree. Existing production SEB behavior and compatibility remain; this release does not activate native SEB or apply its pending migrations. Proctor report retirement and retention were requested in the separate new-question UI chat; the retention migration was already applied by that chat and is not rerun here.

## Scoped database rollout

Production history contains older pending migrations outside this release, including SEB. Per AGENTS.md, stop on history disagreement rather than using broad `db push` or reverting history. Catalog-only inspection confirms the new personal exercise/pin tables, practice ordering and timed-closure columns are absent from Production.

The owner previously chose to release avatars/announcement receipts with Production and explicitly requested the completed work be deployed on 15 October. This rollout uses that authorization for only the named feature migrations; it does not reconcile or replay unrelated SEB history.

Only these existing reviewed migrations are required for this release, in order:

1. `20261014053207_classroom_announcement_acknowledgements.sql` — protected explicit announcement receipts.
2. `20261014065458_account_avatars.sql` — isolated display-avatar bucket and server-only write policy.
3. `20261014071012_announcement_round_conflict_response.sql` — stale-round conflict response.
4. `20261014072745_attempt_expiry_finalization.sql` — closed-at fence, atomic grading RPCs and scheduled close/worker dispatch.
5. `20261014125654_classroom_practice_work_layout.sql` — practice grouping/order in classroom work.
6. `20261014134748_student_practice_exercises.sql` — private personal exercise groups.
7. `20261014144828_student_practice_editing_and_review_pins.sql` — private editing/review pins.

Staging already contains migrations 1–4. Apply and verify only 5–7 there before hosted integration QA; Production needs 1–7. Record each exact version with its SQL; do not replay or mark the unrelated historical migrations. The expiry worker needs a separate per-environment `ATTEMPT_FINALIZER_SECRET` and matching Supabase Vault callback URL/secret. Never expose either secret in tracked files or logs.

The expiry migration schedules closure of overdue existing in-progress rounds as well as future rounds. It preserves attempts and stored answers, freezes late writes and later grades accepted answers; this changes live round state and must be called out when approving the exact rollout.

## Verification so far

- Preserved local snapshot: TypeScript, semantic-token lint, 273 Vitest files / 3,376 tests passed.
- Integrated release: TypeScript, semantic-token lint, 275 Vitest files / 3,400 tests and isolated Webpack production build passed.
- Source localhost Next.js compilation returned no issues. Synthetic student classroom cards measure 117.28px with no desktop overflow.
- Staging migrations 5–7 were applied through exact SQL files and immediately recorded as their original versions with `migration repair --status applied`; no other history was changed.
- Authenticated Staging practice gate passed using 8 synthetic accounts/1,000 questions, including private exercise creation/edit/pagination, stale-edit rejection, review pin/search/unpin, peer/outsider/browser-spoof denial and persisted work ordering. Cleanup passed for all fixtures.
- Fixed the pre-existing React missing-key warning by giving slotted server components stable keys. Fresh Next.js runtime session reports no errors. Final TypeScript/token lint/build passed.
- Production migrations, worker configuration and production deployment are not complete at this checkpoint.

Do not treat this checkpoint as a completed deployment. Update the rollout and verification results here after each authorized stage.
