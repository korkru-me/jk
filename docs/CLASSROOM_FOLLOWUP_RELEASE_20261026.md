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

Candidate: 335 test files / 4,805 tests passed. TypeScript and semantic-token lint passed. Production Webpack build passed; TypeScript was rerun after generated types settled. Hosted Staging verification passed with the visible environment badge and synthetic fixtures (details below). Primary localhost:3000 is `/Users/korkusonmasaen/Korkru/korkru`, PID 1995 at release preparation. Local synthetic header hover and desktop/mobile sidebar checks passed. No migration, schema, RLS, dependency or environment change is needed. Real Production data is not used for tests.

## Staging evidence

PR #90 merged as `cba6a69f3786515c8d61e51e24ede6e270ca68a4`; deployment `dpl_7pcVwnEqKYuKtDdDianusFTmJo41` is READY with canonical `staging.korkru.com`. Existing origin-scoped automation headers were used without changing protection settings or placing secrets in URLs.

- The visible STAGING badge was verified. Header hover/focus showed the full classroom/work and Thai deadline on desktop/mobile; title and classroom computed colours differed. At 250px internal scrolling, the header top remained unchanged. Non-members and unassigned students had separate statuses, and Today/clash UI was absent.
- Teacher search left the URL unchanged after typing and an 800ms pause; Enter updated uq and the committed-search label. Student Enter updated q. Practice-card deletion opened a confirmation and removed the synthetic exercise with a success notice; the fixture overrides all mutations in memory.
- Synthetic bell displayed exactly grades, due-soon and overdue notices; Mark All Read removed the unread action through its in-memory adapter. Classroom/assignment/teaching home links, library/create/import order and mobile drawer were verified.
- Server authorization, audience, extension, deadline and receipt behavior is covered by mocked tests. Authenticated real database delivery and real exercise deletion were not exercised; no Production records were read or changed for tests.

Evidence: `/private/tmp/korkru-followup-staging-header.png`, `korkru-followup-staging-header-mobile.png`, `korkru-followup-staging-bell.png`, `korkru-followup-staging-sidebar-mobile.png`.

## Production completion and primary parity

PR #91 merged as `108b902458932884a2d488ea5538271fb990fd48`. Deployment `dpl_Gd5FsAGffAsW4oTriNC3MAVHF1HL` is READY, target production, aliasAssigned true. Vercel metadata confirms both `www.korkru.com` and `korkru.com` resolve to this exact deployment/commit. Staging remains READY at `cba6a69`. No Production user-data test or mutation was performed.

The actual primary is still PID 1995 at `/Users/korkusonmasaen/Korkru/korkru`, port 3000. After Production became Ready, all 37 scoped application paths matched the fetched release commit byte-for-byte. Runtime and dev dependency declarations match; no reinstall or environment copy was needed. Hashes of all 115 pre-existing modified/untracked files were unchanged before adding this handoff. No reset, broad stash or blanket copy was used.

After Ready, primary homeroom header hover/focus was inspected again at desktop/mobile sizes; question-search forms, exercise edit/delete/start controls, bell and classroom home navigation were re-opened on port 3000. Next MCP returned no runtime configuration/session or compilation issues. Evidence: `/private/tmp/korkru-followup-primary-header-final.png` and `/private/tmp/korkru-followup-primary-header-mobile-final.png`. Candidate checks: 335 files / 4,805 tests, TypeScript, semantic-token lint and production Webpack build passed. No migration applied or required; authenticated database delivery/deletion remains untested against real records.
