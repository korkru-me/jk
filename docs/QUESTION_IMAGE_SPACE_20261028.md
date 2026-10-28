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

Production PR #98 merged as `986d2ec19c4572ad8cf372de30d3d639c7ea6873`. Deployment `dpl_9HJqC6hzT8bL7zjKU6qJ83PojNzM` is **Ready / Production / Current** on `https://www.korkru.com`; the Vercel dashboard explicitly lists the canonical domain and exact commit, and GitHub deployment `7376280368` reports success. The deployment's component is byte-identical to the tested Staging component.

Read-only Production smoke: the teacher waiting screen and active teacher preview rendered without creating attempts, answers or scores, with no captured console warnings/errors. The active preview showed existing non-MCQ questions; the detailed MCQ interaction/layout checks were performed on isolated Staging. One older assignment preview returned 404 before rendering its questions; that route/data condition was not changed, and the active preview loaded successfully. No Production data was written or modified.

Actual primary server metadata confirms `/Users/korkusonmasaen/Korkru/korkru` at `http://localhost:3000`. Its shared component exactly matches released commit `986d2ec` (SHA-256 `684945ebd12054fd40793d80c0a0e6b7f0f82c41d3ed7770951ebbf57ca91c46`). No dependency/configuration change was needed. Existing unrelated primary work and local environment were preserved.

Primary browser verification: at 1512px question/choice widths 729.875/364.938px with no max-height; at 390px both widths 330.406px, stacked without horizontal overflow. Screenshots: `/private/tmp/korkru-image-space-primary-desktop.png` and `/private/tmp/korkru-image-space-primary-mobile.png`. Primary TypeScript, token lint, Next compilation and runtime checks passed. The only hosted interaction tests used the synthetic Staging fixture; no database-backed real submission or upload was tested or required for this layout-only release. No migrations, cleanup or remaining rollout step required.
