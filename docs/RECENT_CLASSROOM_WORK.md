# Practice save return and recent classroom work

## Behavior · 14 October 2026

Successful practice creation (draft or publish) and settings save return to the primary classroom assignment tab. Contextual creation preserves that classroom as the destination; global multi-room creation uses the first selected room; editing uses the library classroom. Failed saves remain in the form with its validation errors. The saved navigation bypass is enabled only after a successful action.

Above practice libraries, the teacher sees “งานที่เพิ่งมอบหมาย” with their own recently created exercise, exam and practice metadata. Drafts carry an accurate draft label. The 72-hour window uses immutable creation time; edits do not renew it. Each item expires separately, including while the page remains open. Empty sections are omitted. Existing work remains in its normal list after the confirmation expires.

The confirmation subtitle is “สร้างสำเร็จแล้ว”. Each work item has its own bordered Card, with the whole card retaining its existing link and keyboard focus indicator. Right-pointing arrows and the explanatory three-day subtitle are removed; the 72-hour visibility rule stays the same.

The teacher's type filters and create/category actions sit below this confirmation. Practice libraries share the assignment-category cards with exercises and exams, using practice-specific settings/progress actions and a no-score label. Their category/order metadata and atomic mixed reorder depend on `20261014125654_classroom_practice_work_layout.sql`; the loader falls back to the old metadata projection before that migration is installed. Practice grouping and mixed dragging are disabled during that compatibility window.

## Data and concurrent work

No migration, new grants, scoring change or Production-data mutation is needed. The authorized teacher route supplies this room's linked assignment IDs; session-client reads additionally enforce RLS and filter the authenticated creator. The safe DTO includes only ID/title/type/status/creation time. Student and view-only routes never load this confirmation. Failed recent reads show an error separately from the regular work lists.

Implementation was prepared on `codex/practice-return-recent-work` in a separate checkout. Preserve unrelated exam/timer, exercise passing-threshold, student homeroom, and landing/logo changes when integrating. Do not overwrite the main worktree's dirty global documentation.

## Validation

- 246 unit test files / 3,251 tests passed, including seven cases for exactly-72-hour expiry, immutable creation time, invalid/future dates, draft status, creator isolation, ordering and safe DTO projection. TypeScript and design-token lint passed; isolated webpack production build passed.
- Live Staging: eight synthetic actors and 1,000 questions passed existing role, classroom metadata/count, multi-room and privacy gates. Real browser wizard creation to two rooms returned to the contextual classroom assignment tab, displaying the success section before practice libraries. Editing its title and saving returned to the same tab with the updated title.
- Scoped synthetic exercises/exams verified type mixing, draft labeling and exclusion of expired/other-author rows. A 320px classroom view had no horizontal overflow.
- Live automatic expiry was verified with the production component on a temporary local/Staging-only preview fixture near the 72-hour boundary; the confirmation disappeared while its normal-list fixture remained. The preview route is removed from the release. Production-data creation timestamps were never modified. The Staging Data API correctly denied a timestamp modification on a published fixture (42501), so this was not bypassed.
- Student browser verification passed: no teacher confirmation section, published practice visible, draft practice hidden. Primary localhost source integration passed TypeScript. No Production authenticated browser writes are used for QA. Staging cleanup passed for all eight accounts, 1,000 questions, both classrooms and extra synthetic assignments; the browser state was removed. Production deployment is confirmed during release handoff.
