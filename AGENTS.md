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

- Push finished work to `origin` before ending a session. A change that exists only in a local worktree does not exist for the other agent.
- The worktree is usually dirty with the other agent's work in progress. Touch only the files your task needs, and never revert or "tidy" a change you did not make.
- State in the final report which migrations must be applied and which commands were not run, so the next session can pick the task up without re-deriving it.
- Migration history diverged once this way in July 2026 — CLI-named files versus hand-named files run in the dashboard — and was reconciled on 23 สิงหาคม 2026. `supabase/migrations` now matches the live history table one-for-one (`supabase migration list` shows every version in both columns). How it was done, in case it is ever needed again: `supabase migration fetch --linked` writes the statements the database recorded back out as files, files whose SQL matched a dashboard-run twin were renamed to the version the database actually recorded, and only versions verified against the live schema were marked with `supabase migration repair --status applied`. Docker was not available, so `db pull`, `db diff`, `db dump` and `migration squash` could not be used at all.
- The reconciliation found one migration that had never been applied — `20260726120000_file_upload_question_type.sql`, which had left the "ส่งไฟล์งาน" question type broken in production since July. It was run through the dashboard on 23 สิงหาคม 2026 and recorded with `migration repair --status applied`, so the two sides now agree on all 69 versions. Anything still pending shows up as local-only in `supabase migration list` — check there before assuming a feature's schema exists.
- `supabase/migrations` describes the live schema's history, not a script that can rebuild it from nothing: the pre-CLI script in `supabase/legacy/` is not replayed, and two of the renamed files differ in wording from the SQL the database ran (a follow-up migration reconciled each). Never run `supabase db reset` against this project expecting a working database.

## Next.js version rule

- This project uses Next.js 16.2.4. Before writing framework-specific code, read the relevant guide in `node_modules/next/dist/docs/` because APIs and conventions may differ from older Next.js versions.
