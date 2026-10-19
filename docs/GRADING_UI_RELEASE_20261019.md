# Grading UI release — 19 October 2026

The owner authorized committing and deploying the completed grading work in this chat. Password, signup and email implementation remains owned by another chat and was excluded from this release.

## Released application

- PR [#63](https://github.com/korkru-me/jk/pull/63), application merge `92adba92223e391d0175e63f73007904e67570e3` on `master`.
- Verified canonical `https://www.korkru.com` alias points to READY Production deployment `dpl_na6WPJvBartd684D8mCBYj7JG5Qf`, exact merge SHA above.
- Candidate `c4f5a1469ae68d906d1c468d9bbcab0e2623f75b` on `codex/grading-ui-release-20261019` contains nine UI commits selected onto current master `7975456`. Do not deploy the older primary branch wholesale: newer Production auth and question-bank work must remain intact.
- Scope: hide answer-key editing for fully manual questions; compact actions; six readable presets; aligned disclosure tools; draft warning in the summary; sticky cyan question context; clearer filters/sort icons; draft score color; uniform-score label; up to ten essay keywords and “ลบร่างคะแนน”.
- Nineteen application/test paths plus existing documentation changed. No Auth/password/signup/email source, schema, server action/reader, dependency or deployment configuration changes. No new migration required or applied in this release. Classroom-loading and grading backend changes were already released in PR #61.

## Validation

- Composed release: TypeScript, design token lint and whitespace checks passed; Vitest **310 files / 4,149 tests** passed; isolated Webpack production build passed with placeholder environment values and separate output. Initial sandbox build could not resolve Google Fonts; the network-enabled rerun passed. No active dev cache was removed.
- Hosted Staging merge `566dd1bcadf11d5f7826f40c660cd12b0f75ccea`: canonical `https://staging.korkru.com` READY at `dpl_7v3ErkUb9W8psE4YmM4xL72RAZ6c`. Existing newer Staging auth changes were preserved by merge; no auth source was authored by this release.
- Read-only Staging migration ledger confirmed `20261018005611`, `20261018040444`, `20261018133739` already applied. Existing `scripts/verify-grading-staging.mjs` passed private draft/CAS/isolation, invalid-batch rollback, permission matrix, atomic publish, explicit work zero, hidden/revealed generic notifications and retry idempotency using two synthetic teachers and two synthetic students. Credentials stayed in memory; none were printed or copied to a new environment file.
- Browser checked visible Staging badge, real question and student grading routes, essay-only highlights shared between views, six preset buttons and settings (about 183px per input at tested desktop width), aligned toolbar, manual key-edit button absent, editable scores, private save, warning color, publish confirmation, successful publish and normal score color. Mobile 320px had no horizontal overflow. Browser error log empty.
- Closed QA browser tab; cleanup validated manifest ownership, revoked sessions and removed all four synthetic accounts and this run's exact data. No Production data was created, changed or used for grading QA. Signup/recovery/email flows were not tested.

## Primary localhost parity

- Actual port 3000 listener: node PID `72854`, cwd `/Users/korkusonmasaen/Korkru/korkru`, branch `codex/student-classroom-cards`, application HEAD `0c92b5d` during verification. Next runtime independently reported this project path and `http://127.0.0.1:3000`.
- All nineteen released application/test paths match the release byte-for-byte. Grading route/server-action dependencies and Next configuration match; no new grading dependency was introduced. Primary package differences are unrelated newer Auth dependencies (`jose`/`svix`), intentionally outside the owner's allowed scope; this is grading release parity, not a claim that all primary Auth code equals master.
- Verified the shared production grading components on actual `http://localhost:3000` with the safe local fixture, alongside real authenticated Staging route validation above. Question table shows type/status, question review renders answers directly, Thai keyword had 60 marks in 30 answers and four marks in page two's two answers, question context computed `position: sticky`, six buttons per score part, and only essay text was highlighted in student review. Tested desktop and 320px mobile; no horizontal overflow. Removed only the added keyword, changed no local scores and left the running server/cache intact.
- Next compilation returned `issues: []`; runtime returned empty config/session errors. Browser error log empty. Proof files for this session: `/private/tmp/korkru-grading-ui-local-parity.png` and `/private/tmp/korkru-grading-staging-release.png` (temporary evidence, not required by the application).
- Preserved all pre-existing primary dirty/untracked question UI, password/signup/email work, local environment and tsconfig files. No blanket checkout/reset/stash or force push.

## Handoff

Application release is complete; no remaining blocker or migration for this UI scope. Previous per-feature “local only” entries record historical checks before PR #63 and are superseded by this release record. Future work must fetch current master and inspect dirty primary work before integration.

Limits: no Production account/data testing, real touch-device/IME testing or full auth synchronization. The parked regrading/void feature still needs the owner's product acceptance; its reminder was already delivered once. This release does not claim that acceptance.
