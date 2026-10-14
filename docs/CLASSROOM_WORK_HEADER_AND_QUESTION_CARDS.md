# Classroom work headers and question cards

Date: 14 October 2026. Branch: `codex/compact-classroom-work-header`.

## Owner-approved behavior

- Successful exercise/exam creation, including drafts and multi-classroom creation, returns to the first selected classroom's assignment tab. Practice creation/settings save already use this destination and remain covered by regression QA.
- A shared `ClassroomWorkHeader` renders classroom cover colors, pattern and icon from stored description metadata. Assignment detail/settings and practice create/settings use it. Assignment submission counts, average and progress sit beside the title with inline schedule details; there are no nested statistic cards.
- Assignment question lists reuse `QuestionCard` in read-only mode with numbering, question metadata and preview. The preview only uses the questions already authorized by the assignment route, including private co-teacher provenance. No question-bank management controls appear there.
- All shared question-card surfaces lose answer-derived item analysis. The usage/p-value/discrimination/last-used calculator, answer queries, preview tab, card strip and sorting options are removed. Old statistical sort URLs fall back to the normal stored-field sort. Assignment scoring, completion rules, answer review and submission summaries are unchanged; no stored questions or answers are deleted.

## Validation

- Primary localhost:3000 port: TypeScript passed, synthetic detail route returned HTTP 200 and Next MCP reported no runtime/config errors.
- TypeScript: passed. Full unit suite: 245 files / 3,235 tests passed. Design-token lint: passed, no file regression. Webpack production build: passed.
- Synthetic Staging QA: eight-role practice contract (1,000 questions, pagination, safe DTO, privacy, multi-classroom creation and frozen membership) passed.
- Real browser/server actions in the isolated Staging checkout: published one-question exercise and exam each returned to `/classrooms/[id]?view=assignments`; both appeared in the recent-created frame and assignment list. New practice publication and published practice settings save also returned there.
- Real assignment cards showed number, metadata and preview without mutation controls or statistics. Preview loaded the question; Escape closed it and focus returned to its preview button.
- Orange saved classroom theme verified on exercise/exam detail, exam settings and practice settings. A short desktop assignment header measured 166px; practice settings header 198px. The long-title fixture measured 199px. Mobile 390px and desktop 1440px showed no horizontal overflow in light/dark checks; screenshots visually reviewed.
- Question bank rendered 24 cards and retained eight own-bank stored-field sort options, with no item-analysis text. Next MCP returned empty config/runtime errors after all flows. React tree was available, but compiled names did not identify the new components.
- Cleanup completed: both synthetic classrooms, 1,000 questions and eight accounts removed; no failure.
- All browser mutations were confined to this run's synthetic Staging classrooms/accounts. No production test writes, schema changes or migrations.

## Concurrent checkout integration

The primary local checkout has independent changes from other chats in creation/edit forms, exam/student result pages and shared docs. This task uses a separate worktree and ports only its source paths plus this unique handoff. Do not overwrite the dirty shared `FEATURE_STATUS.md`, `DESIGN_SYSTEM.md`, `SCOPE.md`, creation/edit forms, exam client, take/preview/submission routes, or the other chats' new student components. Canonical release documentation is updated on this isolated branch. Check changed paths again immediately before integration and commit only explicit paths.

## Release record

Local and production release commit IDs are recorded by the final handoff and Git history. No migration is required. Authenticated production UI is not used for test writes; browser QA uses Staging, while release verification uses deployment metadata and public reachability.
