# Manual reminder-button Staging E2E — 20 October 2026

**PASS:** real teacher **เตือน** → exact unfinished recipients → student popup → durable **รับทราบ**, followed by exact synthetic cleanup. This closes the manual-reminder gap independently of the earlier [new-assignment publication test](STAGING_NOTIFICATION_E2E_20261020.md).

## Environment and fixture

Canonical `https://staging.korkru.com` was READY at SHA `290c50beb64544bab46a4efb419f46edc5254c44`, deployment `dpl_56D8Q6D1Q9Fe5dMxzJAjgZsUMtgw`. Normal Chrome Vercel sign-in, the visible **STAGING · ระบบทดสอบ** badge and normal synthetic app logins were verified. Fresh migration parity was **165/165**, with no differences. No application, RLS, schema, migration or Production data test was introduced; this is QA tooling/evidence only.

Run `1c649bdb-21b6-40d3-aef8-d38d367803b7` owned one teacher/four students, room `faada82e-9799-45a8-a681-407323888366`, assignment `640ea924-5b2a-4417-b493-64d09521454f` and question `a3f7634c-3018-4788-99a1-cd5ac2be3480`. The three pre-existing synthetic attempts/answers had scores **0.2 in progress / 0.6 submitted / 0.8 graded**, maximum 2, attempt number 1; the never-started learner had no attempt.

## Actual browser and durable receipts

- Before the teacher click, the exact assignment had **0 notifications**. One real assignment-header **เตือน** click created exactly **2 unread `assignment_reminder` rows**, only for never-started `181ccae0-b590-414a-9eb8-61ffad1c9fe4` and in-progress `eee5cffb-f339-48c4-ad97-d85861e44adc`.
- The never-started dashboard showed **ยังไม่ได้ส่งงาน / ไปทำงาน**; real **รับทราบ** changed exact notice `67421516-0f3b-4274-a984-18c7b19c5923` from false to true. The active dashboard showed **กำลังทำ · ยังไม่ส่ง / ทำต่อ**; its real acknowledgement changed exact notice `f8ae57e4-0074-4516-b41b-b188abaa4d10` from false to true. Both reloads showed **0 dialogs**.
- Submitted `cd83267c-1ba4-4d7f-b2da-322daf62031e` and graded `07215d85-5c7f-4eb6-85f4-58552c8bc465` each logged into their actual dashboard: **0 reminder rows, 0 dialogs, ส่งแล้ว 1 / ต้องทำ 0**.
- Guarded read counts were **0 → 1 → 2**; final result **2 reminders / 2 read / 0 unread**. Exact ownership and the complete three-attempt/three-answer score/revision/timer snapshot remained unchanged. Plain acknowledgement was used; no take/resume CTA or new attempt was created. Captured browser warning/error entries were empty.

Hosted synthetic screenshots are `/private/tmp/korkru-staging-reminder-{teacher-sent,never-started-popup,never-started-read-reload,in-progress-popup,submitted-no-popup,graded-no-popup}-20261020.png` (six temporary local files, not the injected lab).

## Runner checks and cleanup

An initial fixture hit SQLSTATE `23514` because its dated work lacked a required late band. Automatic cleanup passed for five accounts and independent recent-QA-only checks returned zero in four checked resource categories. Only the harness was corrected with a valid late band/shared reference clock; application constraints were preserved. Partial Auth receipt recovery requires exact ID/email/run/kind plus exclusive sole-owner membership, and private manifests must be owned regular files. **51 runner tests / 175 combined tests in five suites passed**, including real SQL on PGlite; the full app build was not rerun for QA-only changes.

**Cleanup PASS:** sessions were revoked before deletion; the runner removed all five exact synthetic accounts and owned resources. Independent exact-run SQL confirmed **all nine categories zero**: Auth users, classrooms, roster, assignments, questions, notices, attempts, answers and all five personal-organization IDs. The private manifest and exact temporary two-key environment file were removed. No fixture remains.

The existing application was already released in PR #71; no new Production application deployment is needed for this QA evidence. Acceptance covers one click and four synthetic states, not repeated-send/24-hour deduplication, concurrent exactly-once delivery, large cohorts, SMTP, SEB, real-student UAT or Production writes.
