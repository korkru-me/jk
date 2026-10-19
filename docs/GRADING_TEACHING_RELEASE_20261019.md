# Grading and teaching follow-up release — 19 October 2026

The owner authorized publishing all completed work from this chat. This follow-up releases the eight remaining commits after the grading UI application release in PR #63. Password, signup and email work remains owned by another chat.

## Application and scope

- Application PR [#65](https://github.com/korkru-me/jk/pull/65), merge `afb74c04a06f667566f36c54953396e54ff52998` on master; candidate `0b2846de78849fbd9fdb0baeeec7ad77ce617958` on `codex/grading-teaching-release-20261019`, based on current production `f0ed209`.
- Selected primary commits: `834d5d4`, `6581f81`, `df27658`, `4eee5af`, `b67ee33`, `f0efce4`, `3161a43`, `eb03173`. The four earlier primary commits `ad4e5d4`, `56f7925`, `8382a9c`, `0c92b5d` were already patch-equivalent to the previous production release and were not replayed.
- Reviewed/pending badges, framed compact grading panels, explanatory tooltips, per-part unsaved/private-draft warnings, bulk score step 0.1, return to the matching table after publishing, removal of draft deletion, contextual assignment navigation on question/student review, flush sticky question context, student roster before questions with five working sort buttons, and exactly one question/board at a time in teaching mode.
- Sixteen application/test paths plus three existing documentation files changed. No Auth/password/signup/email/settings source, package/lockfile, migration, Supabase configuration, proxy, environment example or deployment configuration changed. No new migration or dependency is required.

## Validation and isolation

- Composed candidate passes TypeScript, token lint, diff checks, Vitest **311 files / 4,155 tests**, and an isolated Webpack production build with placeholder environment values. The running primary .next cache was not removed; build-generated tsconfig includes were restored.
- Staging merge `b07e2acf86152ec030b52f057990aa186a2587b2`, READY deployment `dpl_AKRgKxyJsScAcUA4whAoLPbGRUJc`, canonical `https://staging.korkru.com` alias verified. Staging's independent newer authentication work was preserved by merging the scoped candidate into Staging; Staging was not promoted wholesale to master.
- The existing hard-fenced grading integration gate passed private draft/CAS/isolation, invalid-batch rollback, actor permissions, two-student atomic publication, explicit work zero, hidden/revealed generic notifications, and retry idempotency. The existing environment file contains a placeholder for its service key; the actual Staging credential was retrieved through the authenticated CLI and passed only in child-process memory, without writing a new secret file or exposing values.
- Hosted browser QA verified the visible STAGING badge, question/student contextual sidebar, six settings inputs at 96px, save/collapse, uniform drafting with step 0.1, inline unsaved and persisted-draft badges, no draft deletion button, teacher success/check icon, publish confirmation/cancel, successful synthetic publication and return to the student table, roster-before-questions with five sort controls, and one teaching question with correct first/last boundaries. Browser console was clean.
- Only this run's two synthetic teachers/two synthetic students and owned fixture rows were used. Manifest-verified cleanup revoked sessions and removed all four accounts and exact data. No teaching board was persisted, no production accounts/data were created or changed for testing, and no secret was copied to primary local settings.
- Staging grading migrations `20261018005611`, `20261018040444`, `20261018133739` were confirmed applied. The pre-existing Staging ledger difference (local retention `20261015132234`, remote SEB `20261009142610`) is already recorded in AUTH_RELEASE_20261017.md; this UI release did not apply, replay, reset or repair either history. This is not a claim of whole-ledger parity.

## Primary localhost parity

- Port 3000 listener node PID `22002`, actual cwd `/Users/korkusonmasaen/Korkru/korkru`, branch `codex/student-classroom-cards`, application HEAD `eb03173515fb0534e3d97f7949e0bbcc4c98a2df`.
- All sixteen released application/test paths match the merged application byte-for-byte, including current primary working files. Required grading and teaching dependencies introduce no new package/configuration requirement. This confirms parity of the released scope; it does not claim unrelated primary Auth code equals all of master.
- Browser on actual localhost:3000 verified single-question teaching, next-question navigation, review sidebar context, absence of draft deletion, and quick/uniform/essay-keyword tools. Next compilation reports no issues; runtime config/session errors and browser error/warning logs are empty.
- Preserved unrelated dirty/untracked question UI, AGENTS, local environment, tsconfig, and other-chat files. No reset, broad copy/stash, primary branch switch or server restart was used. Protected pre-existing file checksums remained unchanged.

## Production confirmation

Application deployment `dpl_4fAWY25ZGsxYdSKKk83xsH9c9Yub` is READY at merge `afb74c04a06f667566f36c54953396e54ff52998`. The project's production target assigns the canonical `https://www.korkru.com` domain to this application release. Read-only authenticated browser verification showed one teaching question, no per-page selector, next-question navigation, the assignment sidebar on grading detail, no draft deletion button, and quick/uniform/keyword controls. There was no STAGING badge and the browser error/warning log was empty. No production grading, drafting, notifications, board saves or data writes were performed for QA.

This document accompanies the application release and supersedes the historical local-only labels for its eight selected commits. A subsequent documentation-only merge may advance the deployed commit without changing the verified application files.

Limits: hosted QA used desktop and synthetic exercise data; the teaching route is shared by exams/exercises but an exam assignment was not tested separately. No real touch/IME/SEB, signup, recovery or email workflow testing was performed. The student in-progress/official-attempt and random-question refresh behaviors audited in FEATURE_STATUS remain unchanged.

## Pending hand-in copy follow-up — PR #67

The owner found “มี 1 ชิ้น” unclear. [PR #67](https://github.com/korkru-me/jk/pull/67), merge `411e8a9c096bacb53d7f617a44779665723ef06f`, replaces it with “มีงานส่งของนักเรียน … รายการที่รอตรวจให้คะแนน” and explains that each item is one submission and may include several questions to review. The shared sidebar uses “รอตรวจงานส่ง … รายการ”; capped values use “อย่างน้อย”. Existing counting/query/scoring behavior is unchanged; FEATURE_STATUS documents the pre-existing difference between overview and official-attempt workspace counts. The synthetic assignment-detail fixture now includes two pending hand-ins.

Primary application commit `b426bc8`, scope clarification `9a5213a` on `codex/student-classroom-cards`, and release candidate `3fbd82d` were pushed. TypeScript passed on primary and candidate; token lint, diff checks, Next compilation/runtime checks and independent unit-semantics review passed. Local primary port 3000 showed the actual one-hand-in banner/sidebar, and local/Staging synthetic views showed two hand-ins at desktop and 390px with no horizontal overflow. Staging `50aa76192f344b683815d1b36749335cbc2d1419`, deployment `dpl_F6HmJymj6SLfHSYmBJRV6TzVCnVq`, was READY with the visible STAGING badge. The hosted fixture exposed a pre-existing StudentsTab date hydration warning: its unchanged formatter omits timeZone, so UTC SSR 02:15 differs from Asia/Bangkok 09:15. Copy QA passed; that warning was not fixed or reported as a clean console.

Production `dpl_BDKLLeBhceovWH8YhfEhUaDX2hJW` is READY at merge `411e8a9c096bacb53d7f617a44779665723ef06f`; project metadata confirms aliases www.korkru.com and korkru.com. Read-only browser verification showed the new one-hand-in banner without horizontal overflow. All three changed application/fixture paths match current primary working files byte-for-byte; the actual port 3000 page was reloaded and verified after Production became Ready. No primary server restart or cache/environment change was required. Unrelated work and protected checksums remained unchanged.

This follow-up is text-only: no separate local production build/full Vitest or grading integration-gate rerun, migration, Auth/password/signup/email change, or production data mutation. Hosted Staging/Production builds succeeded. Screenshot evidence was saved for desktop, 390px, Staging and Production; temporary synthetic fixture tabs were closed.
