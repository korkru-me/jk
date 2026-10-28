# Question library bulk actions — 28 October 2026

Candidate based on Production `master@e998278`, isolated branch `codex/question-library-bulk-20261028`. Scope: LibraryPanel, owner-scoped bulk delete action, bounded complete-file export, tests and synthetic screen lab. No schema/RLS changes or Production user-data tests.

Behavior: four selection actions (clear, file, delete, share as one `.korkru.json`), cross-page selection, destructive confirmation, group-parent deletion including children, partial deletion feedback. Existing import UI creates private recipient-owned copies and handles duplicates. Legacy multi-step groups remain unsupported by portable JSON; mixed selections now fail visibly instead of silently dropping those groups. Existing image URL references and portable format are unchanged.

Validation in progress. Initial full suite: 337 files / 4,819 tests passed, including 14 new action tests. Hosted Staging, build, UI and primary parity evidence will be recorded before release completion.
