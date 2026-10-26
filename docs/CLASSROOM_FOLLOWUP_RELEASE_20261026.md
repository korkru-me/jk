# Classroom, practice, search and student bell follow-up release

The owner authorized all work in this chat for isolated Staging and Production release on 26 October 2026. The candidate is based on Production master `1a89610`, preserving the newer Auth/email releases. Only application changes from primary commits `5ed71fe`, `058ce70`, `cbb3e7d`, `f023aed`, `d50b378`, `fd69677`, `f8a4224` and `6180d50` are integrated; pre-existing uncommitted local work is excluded.

## Scope

- Homeroom matrix counts only reached classroom/group students, distinguishes non-members and unassigned students, and pins table headers. Assignment titles and classroom names use distinct semantic colours. Hover/focus shows the full source classroom, work title and Bangkok deadline, or no deadline.
- Homeroom calendar removes Today and same-day clash indicators.
- Personal exercises remove saved-card checkboxes and add confirmed deletion with compact edit/delete/start actions. Server deletion verifies current actor/library/revision and deletes only the owned exercise; local deletion persists the filtered owner/library state.
- Student search supports Enter; teacher library/question search runs only on Enter/Search.
- Student bell retains published grades and read-only due-soon/overdue projections for unfinished authorized work, including extensions. Loading/counting never writes. Explicit acknowledgements save server-built, recipient-bound receipts; teacher work/announcement popups remain separate. No background/offline push or email is added.
- Contextual classroom, assignment, teaching and loading sidebars share a top home link; global teacher question links are library/create/import.

## Verification and rollout

Candidate: 335 test files / 4,805 tests passed. TypeScript and semantic-token lint passed. Production Webpack build passed; TypeScript was rerun after generated types settled. Hosted Staging verification is in progress. Primary localhost:3000 is `/Users/korkusonmasaen/Korkru/korkru`, PID 1995 at release preparation. Local synthetic header hover and desktop/mobile sidebar checks passed. No migration, schema, RLS, dependency or environment change is needed. Real Production data is not used for tests.
