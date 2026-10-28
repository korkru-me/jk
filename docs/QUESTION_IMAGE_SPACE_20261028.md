# Illustrated MCQ layout release — 28 October 2026

Scope: shared `components/exam/exam-question-frame.tsx`, design guidance and release documentation. Question images receive two thirds of a row when the container is at least 44rem wide; choices receive one third. Narrow containers stack a full-width image above choices. Images preserve aspect ratio with no height cap, and MCQs without images keep the answer full-width. No data shape, grading, auth, migration, dependency or environment changes.

## Staging evidence

- PR #99 merged into `staging` as `84c82dd725b77b4f5daf01a7cc8f088b5cfcec86`; Vercel deployment `4he9SYPTiPCYjBTh8djLaRsczez1` succeeded.
- Canonical `https://staging.korkru.com/exam-screen-lab?perPage=1&type=exercise&watermark=off` opened through the existing authenticated Chrome profile, with visible `STAGING · ระบบทดสอบ`. No protection configuration or credentials changed.
- Real deployed ExamClient with synthetic in-memory fixture: at 1512px viewport, image/answer widths 729.875/364.938px; at 390px both widths 330.406px, image above choices; no horizontal overflow and computed image max-height `none`.
- Selected the correct option, checked it (1/1), retried, eliminated and restored a choice. Mobile focus mode and desktop focus mode passed; desktop focus widths 489.875/244.945px. Captured console warnings/errors were empty.
- Screenshots: `/private/tmp/korkru-image-space-staging-desktop.png`, `/private/tmp/korkru-image-space-staging-mobile.png`.
- Earlier local checks: TypeScript, isolated production build, token lint, diff checks and Next runtime/compilation checks passed. A synthetic 600×900 image retained its 1.5 aspect ratio at 682×1023 without clipping. Unit suite was not rerun for this reversible CSS/layout change; no database-backed attempt, upload or grading integration was changed or tested.

## Production and primary parity

Production PR #98 awaits promotion after the completed Staging checks. Primary localhost:3000 already contains the identical component; re-verify against the Ready Production commit after deployment. Preserve unrelated primary changes and local environment.
