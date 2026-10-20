# Assigned-work notices — 20 October 2026

Status: **Production application released; actual primary-local parity verified.** PR [#73](https://github.com/korkru-me/jk/pull/73) is merged and the Production deployment is READY with canonical aliases. The clean candidate passed full tests, TypeScript, token lint and build, and actual localhost:3000 UI/runtime checks pass. Real hosted publication → student popup → acknowledgement remains unverified because of the prior Staging ledger mismatch and hosting SSO gate. The earlier reminder-only release in [ASSIGNMENT_REMINDERS_RELEASE_20261020.md](ASSIGNMENT_REMINDERS_RELEASE_20261020.md) remains a separate historical record.

## Published application and primary-local parity

- Production merge: `a1f542cff80380e22b3adb627aaf0380febbb92f`; deployment `dpl_9YLvKTRFu9rjRikkXeuKdcXZgcQZ`, READY. Canonical aliases `www.korkru.com` and `korkru.com` are confirmed by deployment metadata.
- Read-only Production checks returned HTTP **200** for `/login` and **404** for `/exam-screen-lab/assignment-reminders`. They verify public availability and lab isolation only, not authenticated notification delivery.
- Staging commit: `c77f4ecf87a63b3f82d75df16435e9ee40f4dae5`; deployment `dpl_3tUATfRQohKUo5pQv7ApmVP6mzhA`, READY, canonical `staging.korkru.com` confirmed by metadata. This is not a claim of authenticated hosted lab or delivery verification.
- Primary application commit `36036465a6d2d7c3f2639d20ab3626ea4ecdef73` is pushed on `codex/student-classroom-cards`. The released application files match the candidate byte-for-byte on the actual primary localhost:3000 checkout. Protected tsconfig, PDF-preview and patch hashes remain unchanged from the prior baseline, preserving unrelated local work.
- Actual primary-local UI/runtime checks pass, including the mixed queue, acknowledgement success/failure, dismissal confirmation/focus, narrow viewport, exam-route suspension and one-time publication-warning toast/query cleanup. Next MCP reports **0 runtime errors**. The detailed injected evidence below is separate from hosted notification-write evidence.

## Behavior and scope

- An acknowledged publication or published audience update notifies the current active student audience of a published online exercise/exam. Never-started and in-progress students are eligible; any submitted or graded attempt excludes the learner even with a zero/pending score or a later in-progress attempt.
- Student notices share one inbox Dialog with announcements and explicit reminders. Priority is announcement → assigned work → reminder; an already open item is not preempted. Assigned work shows “มีงานใหม่จากผู้สอน”, exercise/exam type, canonical title, classroom/subject label, teacher and date details. “กำหนดส่ง” uses the due date, null displays “ไม่กำหนดวันส่ง”, and future opening/hard close are distinct details.
- Assigned work offers “ไว้ภายหลัง” and “รับทราบ” only. Reading and acknowledging never start an attempt or navigate automatically. Defer pauses the queue without an acknowledgement; acknowledgement success alone advances it and updates the bell. Failures retain the item for retry. New-work acknowledgement does not consume a separate reminder receipt.
- The existing route/focus/visibility freshness checks and visible-only 45-second polling apply to all work notices. Automatic notice opening/reads pause on assignment take and supported practice answer routes. Stale responses cannot reopen a notice from an earlier route, and an existing dialog is respected. X/backdrop/Escape request confirmation with focus preserved; pending acknowledgement prevents closing.
- No retroactive backfill, email, Web Push, browser-closed delivery guarantee or new notification type/schema is added.

## Publication hooks and acknowledged writes

`lib/assignment-publication-notifications.ts` owns the server-only publisher. Creation calls it after assignment-room links persist and non-SEB publication is complete; SEB setup keeps its existing publication flow. Status updates require a returned published receipt. Published group targeting requires an exact link update receipt. Research publication uses canonical persisted measurement assignment IDs and published exam receipts rather than client-supplied recipient/assignment lists.

Notification work follows the successful publish/audience write. A later notification failure returns a warning while preserving the successful publication result; creation still redirects to its acknowledged work. The UI explains that student notification needs retry instead of reporting creation failed and inviting a duplicate assignment. Partial sends report a warning and retry rechecks the prior notification history.

## Authorization and data contract

The publisher verifies the session against its actor argument, active teacher/admin status, exact `canManageAssignment` and management of every canonical linked active classroom before learner roster reads. Assignment organization is canonical. Current active rosters and group reach determine targets, with any finished attempt excluded. Reads are paginated/chunked and fail closed. Students reached through multiple linked rooms receive one deterministic eligible room link.

New-work rows reuse `notifications.type = 'classroom_post'` with a nonnull `related_assignment_id`; ordinary announcement notifications have no related assignment ID. Explicit reminders retain `assignment_reminder`. The recipient+assignment lifetime lookup includes both read and unread assigned notices. It is best-effort deduplication without a unique constraint or exactly-once guarantee under concurrent hooks; completion/membership may also change around delivery.

`getPendingAssignmentNotices` starts from the active session student's own notification history and current memberships, then rechecks active room, exact assignment link, current group and own submission state. Only then does a narrow privileged projection return canonical assignment type/title, classroom label, teacher, due/start/close and safe href. Full assignment rows, access codes, answers/keys, scores, peers and credentials are excluded. Students gain no direct full-assignment SELECT. Stored notification content/links and recipient-editable IDs are not resource authority.

Assigned hrefs are plain `/classrooms/[id]`, a student-safe route; explicit reminders retain `/assignments/[id]/take`. Latest/read suppression is independent per assignment and notice kind. `acknowledgeAssignmentNotice` restricts exact ID, session recipient, allowed work-notice type and nonnull assignment ID, and confirms a returned row. Old reminder-only wrappers stay compatible. No ordinary classroom post is acknowledged as a work notice.

No table, column, type enum, RLS grant, RPC or migration is introduced. Authentication/password/signup/email behavior is outside this change.

## Recorded local validation

- Pure/mocked focused checks reported passing: backend/helper/action **141 tests**, publication actions **23 tests**, and research **21 tests**. These are individual suite reports, not a hosted delivery test or a claim of a disjoint aggregate total.
- The clean Production-base candidate passed the full suite: **324 files / 4,578 tests**. TypeScript, token lint and scoped diff checks passed. The isolated Webpack production build completed successfully with placeholder keys.
- Actual primary localhost:3000 CUA passed the new exam/no-due acknowledgement (one receipt, dialog closed), mixed announcement → two assigned notices → reminder order, acknowledgement failure retaining the item, Escape/backdrop confirmation and return focus to X, defer, and all-three-kind suppression on the exam route. The measured narrow viewport was **410×820 CSS px**, dialog **378×464 CSS px**, without horizontal or internal overflow. Next MCP reported no runtime error. These were injected fixture actions, not genuine Supabase receipts.
- The local classroom-entry fixture showed the post-save notification warning and removed its one-time query parameter, with no Auth/database calls.
- The isolated `/exam-screen-lab/assignment-reminders` fixture injects reads and acknowledgement actions; it covers assigned exercise dates, no-due exam, mixed ordering, retry after an acknowledgement error and take-route suspension without genuine notification or attempt writes. Existing reminder-only fixture contracts remain supported.

These checks do not verify deployed RLS, a real publication notification insert, student hosted delivery or durable hosted acknowledgement.

## Environment boundary and remaining verification gap

The immediately preceding read-only Staging preflight recorded **165 migration history rows**, with remote-only `20261009142610` and local-only `20261015132234`. This task has not run a new external preflight or resolved that difference. The repository rule requires stopping database mutations at a mismatch. No external fixture/account/notification was written, no new migration exists, and no schema was applied, repaired or replayed for this addition.

The application is released and actual primary-local parity is verified; do not repeat publication because the hosted data test remains unperformed. No hosted fixture test was run for this addition, and deployment READY metadata must not be described as an authenticated end-to-end pass. Hosted publication → notice → acknowledgement remains unverified until normal hosting access and the database-history rule permit a bounded synthetic run. A later documentation-only merge may advance hosting without changing the verified application files. Any future hosted data test must use permitted synthetic accounts and exact cleanup; no cleanup is required for this release because no external fixture was created.
