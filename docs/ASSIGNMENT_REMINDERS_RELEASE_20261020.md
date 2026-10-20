# Assignment reminders — 20 October 2026

Status: the clean Production-base candidate passes final unit/type/token/build checks, and the actual localhost:3000 synthetic UI passes browser verification. Application publication is still pending. Hosted real teacher-to-student Staging delivery was intentionally not performed because migration preflight found the recorded history mismatch and AGENTS requires stopping database mutations. This record does not describe the already released 19 October gradebook/deadline work as unfinished.

## Behavior

- Teacher Remind targets active learners in the exact linked classroom/group who have no submitted or graded attempt. Never-started and in-progress learners are included. Earlier finished attempts suppress a reminder even when a later attempt is active, a score is zero, or a hand-in still awaits grading; score strategy does not alter this rule.
- The student app reuses one automatic inbox Dialog for announcements and work reminders, choosing announcements first. Reminder details show the work, classroom, teacher, reminder time, close and whether the learner can start or continue. Acknowledgement updates the existing notification's `is_read`; only acknowledged success advances/navigates and refreshes the bell. Defer does not mark read, failed acknowledgement retains the notice, and X/Escape/backdrop confirm dismissal.
- Automatic notices and reminder fetches pause on assignment take routes, including their waiting/secure entry states, and the supported practice take/question routes. Visible-tab polling runs every 45 seconds, with route/focus/visibility refresh and stale-response guards. This is an in-app notice, not email, Web Push or a guarantee while the browser is closed.

## Authorization and boundaries

Sending rechecks the active verified actor, exact assignment management, exact classroom owner/admin/manage role, current assignment link and group audience before privileged reads. The assignment supplies canonical organization identity. All relevant row sets are paginated/chunked; errors do not become assumed empty success.

Student reading is bound to the session recipient and current roster/active classroom/link/group reach. A narrow service projection supplies current published assignment title/close/author metadata and only that student's submission states after reach is proven. Students still cannot SELECT full `assignments` rows; access codes, answers, keys, scores, peers and private profiles are absent from the notice DTO. Display hrefs are derived on the server. The latest reminder per assignment wins, and acknowledging it suppresses older unread duplicates. Exact-ID/recipient/type acknowledgement requires a returned row.

No migration, table, RLS grant, notification type or external email/Auth/password/signup workflow changes. Existing `assignment_reminder` rows are reused. Sending retains the 24-hour unread dedupe lookup; it is not atomic across concurrent senders, and completion/membership changes may race delivery. Fresh reader eligibility and latest-per-assignment selection reduce stale or duplicate display without claiming exactly-once delivery.

## Candidate and local validation

- Backend helper/action focused checks: 85 pure/mocked tests passed, including finished-vs-active attempts, scope/group/role checks, denied reads, pagination, latest/read duplicate suppression, exact acknowledgement, and direct student assignment-table denial with the authorized safe projection.
- The final clean Production-base candidate passed the full suite: **322 files / 4,478 tests**, TypeScript, token lint, and an isolated Webpack production build with placeholder environment keys. This is candidate validation, not evidence of hosted notification delivery.
- New Staging-harness safety suite: 44 offline tests passed; together with the reused deadline harness suite, 84 passed. Script syntax and scoped diff checks passed. These checks made no hosted requests.
- CUA browser checks on the actual primary localhost:3000 fixture passed reminder sequencing, acknowledgement, deferral and X/backdrop dismissal confirmation; announcement-first order followed by reminders; completed-work/exam-route suppression; acknowledgement failure retaining the notice; and CTA navigation to an injected mock URL. The measured narrow viewport was **410px**, with no horizontal page overflow. Polling/external actions were injected/disabled; no live notification was written. These checks do not prove a real Supabase send or receipt update.

## Staging preflight stop and unverified delivery

Read-only Staging migration preflight returned **165 history rows** and the already recorded exceptions: remote-only `20261009142610` and local-only `20261015132234`. No new reminder migration is needed, but the AGENTS history-mismatch rule still requires stopping database mutations. No synthetic fixture/account/notification was created, no project keys were read, and no schema was applied, repaired or replayed in this task. The exception was not silently reconciled or treated as permission to continue test writes.

**Hosted real teacher button → stored notification → student popup → acknowledgement was intentionally not performed.** Deployed RLS/data behavior and real delivery remain a release-verification limitation, not a passing test. No cleanup run is required because no hosted fixture was created.

The prepared fixed-target `scripts/verify-assignment-reminders-staging.mjs` supports explicit create/retain, read-only notification verification and exact cleanup modes for a later permitted run. It would create one synthetic teacher and four students (never started, in progress, submitted and graded), with nonzero completed scores and legal close/grade/review transitions. Its mode-0600 private manifest would contain synthetic credentials, exact IDs and score/timer metadata baselines; project keys and session tokens are never persisted. Verification expects only the two unfinished recipients and can check read counts after real UI acknowledgement. Cleanup verifies provenance and revokes sessions before deleting exact run-owned rows, personal organizations and accounts. Creating a new attempt through the never-started learner's take URL falls outside its saved baseline; use acknowledgement or the already in-progress learner for that scoped browser check.

## Remaining release work

Commit and push only the scoped application/tests/docs, publish the prepared application candidate while preserving independent Auth work, wait for Ready/canonical alias confirmation, and verify the released scope on the actual primary localhost:3000. Record exact commits, deployments and any remaining limitations here. Do not portray the completed offline/local checks as a hosted end-to-end pass; any later Staging data test must first satisfy the repository's migration-history rule and use synthetic accounts only.
