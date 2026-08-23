# KorKru AI Working Agreement

## Read before working

- Read `docs/PRODUCT.md`, `docs/SCOPE.md`, and `docs/FEATURE_STATUS.md` before planning product work.
- Read `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, and `docs/DATA_MODEL.md` before changing application or database behavior.
- Read `docs/SECURITY.md` before touching authentication, authorization, uploads, exports, student data, or Supabase.
- Read `docs/DESIGN_SYSTEM.md` before changing user-facing UI or copy.
- For matching files, also follow `.cursor/rules/typescript-react.mdc`, `.cursor/rules/supabase-security.mdc`, and `.cursor/rules/product-ui.mdc`.
- If documentation conflicts with working code, treat code as current behavior, report the mismatch, and update the documentation with the same change.

## Product direction

- The official brand is **KorKru / ก่อครู**. The adaptable brand line is **“ก่อ…โดยครู”**; the middle phrase changes with what teachers create.
- Finish the MVP in this order: question bank, classrooms, assignments/exams, grading, then homeroom.
- Surveys, education research, and paid-plan enforcement are later phases unless the user explicitly reprioritizes them.
- Explanations and product copy are Thai; filenames, code, database identifiers, and standard technical terms remain English.

## Non-negotiable guardrails

- Preserve unrelated user changes in this dirty worktree.
- Explain the plan before changing auth, Supabase RLS, migrations, grading/scoring, billing, or subscription entitlements.
- Never weaken RLS, expose `SUPABASE_SERVICE_ROLE_KEY`, or use the admin client without explicit server-side authorization.
- Never edit an already-applied migration to change production behavior; add a new migration after checking live migration state.
- Create migrations with `supabase migration new <name>` only. Never hand-name a file in `supabase/migrations`, and never apply SQL through the Supabase dashboard without recording it — if the dashboard is the only route available, follow it with `supabase migration repair --status applied <version>` in the same session and say so in the final report.
- Commit a migration in the same commit as the code that depends on it. Never push schema to the database and leave the file uncommitted.
- Keep organization data isolated. Treat student profiles, guardians, health/family notes, answers, and survey data as sensitive.
- Do not present mock data, pricing, compliance, security, analytics, or unfinished UI as production truth.
- Preserve existing question and submission compatibility when extending question types or scoring.

## Change workflow

- Inspect the relevant route, server action, types, migrations, and RLS policies before implementation.
- Before touching the database, run `supabase migration list` and compare local against remote. If they disagree, stop and report — never "fix" the gap with `supabase db push` or `supabase migration repair --status reverted`, which would replay old migrations over a live schema.
- Prefer small, reversible changes and validate authorization on the server, not only in the UI.
- Run `npx tsc --noEmit` for TypeScript changes and `npm run build` for material application changes.
- Run `npm run lint:tokens` after touching UI. It fails when a file gains raw Tailwind palette classes (`bg-gray-100`, `text-blue-600`) instead of the semantic tokens in `app/globals.css`, or a hand-written card surface instead of `<Card>`. Existing debt is baselined per file, so only a file getting worse fails; update the baseline with `-- --update` only for a deliberate increase.
- Run `npm test` for changes to `lib/` — vitest covers the evaluator, scoring and shared text helpers. Add a case alongside any change to how a question is sampled or graded.
- Coverage stops at the pure modules: nothing exercises Supabase, server actions or the browser, so state what was and was not verified.
- Update `docs/FEATURE_STATUS.md` and any affected domain/architecture document when behavior or scope changes.

## Working across two agents and two machines

Claude Code and Codex both work in this repo, on more than one machine. Git is the only channel that carries context between them; anything left outside it is lost to whoever works next.

### Shared handoff protocol for Claude Code and Codex

- At the start of every task, re-read this file, then inspect the current branch, `git status --short --branch`, the recent log, and the upstream state before editing. Fetch `origin` when network access is available. Fast-forward a clean branch only; if the tree is dirty or the branch has diverged, inspect and report before pulling, merging, or rebasing.
- Treat chats, agent memory, Canvas files, and notes outside this repository as private session context, not a handoff channel. Put approved decisions, current phase, constraints, and unfinished work in the relevant tracked document under `docs/`, then commit and push it.
- Define the task scope and expected files before editing. Assume every pre-existing uncommitted change belongs to the user or the other agent; never revert, rewrite, format, stage, or "tidy" unrelated work.
- Do not have two agents modify the same files or mutable branch at the same time. For parallel work, use separate branches or worktrees with non-overlapping scopes, then review and integrate deliberately.
- Before committing, inspect the final diff and run the checks required by this file. Stage explicit paths only; do not use broad staging such as `git add .` or `git add -A` in a shared or dirty worktree.
- Commit one coherent, reviewable unit of finished work. Include dependent code, migrations, tests, and documentation together; do not commit secrets, local environment files, generated caches, or unrelated changes.
- Push finished work to the current branch on `origin` before ending the session and verify that the upstream contains the commit. Never use force push. If a push is rejected, fetch and inspect the remote changes, then integrate safely without overwriting another agent's work.
- Every final handoff must state the branch, commit hash, whether it was pushed, the files/behavior changed, checks run and their results, checks not run, migrations applied or still required, and any remaining blockers or next step.
- The next agent must begin from the pushed commit, re-read the updated project documents, and verify the working tree before continuing. A local-only change is not shared across machines, even if one agent already described it in chat.

- Migration history diverged once this way in July 2026 — CLI-named files versus hand-named files run in the dashboard — and was reconciled on 23 สิงหาคม 2026. `supabase/migrations` now matches the live history table one-for-one (`supabase migration list` shows every version in both columns). How it was done, in case it is ever needed again: `supabase migration fetch --linked` writes the statements the database recorded back out as files, files whose SQL matched a dashboard-run twin were renamed to the version the database actually recorded, and only versions verified against the live schema were marked with `supabase migration repair --status applied`. Docker was not available, so `db pull`, `db diff`, `db dump` and `migration squash` could not be used at all.
- The reconciliation found one migration that had never been applied — `20260726120000_file_upload_question_type.sql`, which had left the "ส่งไฟล์งาน" question type broken in production since July. It was run through the dashboard on 23 สิงหาคม 2026 and recorded with `migration repair --status applied`, so the two sides now agree on all 69 versions. Anything still pending shows up as local-only in `supabase migration list` — check there before assuming a feature's schema exists.
- `supabase/migrations` describes the live schema's history, not a script that can rebuild it from nothing: the pre-CLI script in `supabase/legacy/` is not replayed, and two of the renamed files differ in wording from the SQL the database ran (a follow-up migration reconciled each). Never run `supabase db reset` against this project expecting a working database.

## Next.js version rule

- This project uses Next.js 16.2.4. Before writing framework-specific code, read the relevant guide in `node_modules/next/dist/docs/` because APIs and conventions may differ from older Next.js versions.
