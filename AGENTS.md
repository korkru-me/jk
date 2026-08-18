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
- Keep organization data isolated. Treat student profiles, guardians, health/family notes, answers, and survey data as sensitive.
- Do not present mock data, pricing, compliance, security, analytics, or unfinished UI as production truth.
- Preserve existing question and submission compatibility when extending question types or scoring.

## Change workflow

- Inspect the relevant route, server action, types, migrations, and RLS policies before implementation.
- Prefer small, reversible changes and validate authorization on the server, not only in the UI.
- Run `npx tsc --noEmit` for TypeScript changes and `npm run build` for material application changes.
- There is no automated test suite yet; state what was and was not verified.
- Update `docs/FEATURE_STATUS.md` and any affected domain/architecture document when behavior or scope changes.

## Next.js version rule

- This project uses Next.js 16.2.4. Before writing framework-specific code, read the relevant guide in `node_modules/next/dist/docs/` because APIs and conventions may differ from older Next.js versions.
