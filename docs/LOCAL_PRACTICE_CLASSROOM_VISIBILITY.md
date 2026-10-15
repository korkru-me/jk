# Local classroom practice visibility · 14 October 2026

The published practice listing was deployed to Production in PR #51, but the primary localhost:3000 worktree stayed on its separate student-classroom branch while that UI was being edited. This left the local creation screen working with no practice section on either classroom view. After the classroom changes were committed (4ee9e67, aec9b44), integrate the existing listing changes into the current UI rather than replace either classroom component.

Teacher: subject classroom → งานที่มอบหมาย → คลังฝึก, below the type/category toolbar. Student: subject classroom → คลังฝึก, between announcements and the assignment section. Exercises remain under งานที่มอบหมาย and the exercise/all-type filter; only published exercises are listed for students.

Use the session Supabase client and existing RLS, scope the query to the authorized classroom ID, and send only title/status/count metadata. Feature gating and the existing permission checks remain unchanged. Practice actions invalidate the linked classroom pages. No database migration or Production data mutation is required for this local integration.

Keep concurrent landing/icon, profile/announcement and timed-submission work outside this commit. Validation is recorded below; the commit contains only these practice/classroom paths and this handoff.

## Verification

- Primary worktree: TypeScript passed; design-token lint passed; 250 unit test files / 3,270 tests passed.
- Isolated checkout of committed classroom changes plus the practice patch: webpack production build passed. Turbopack in the temporary checkout rejected its outside-root node_modules symlink; webpack was used for this isolated build and browser server.
- Live Staging: eight synthetic roles, 1,000 questions, classroom metadata/count/status isolation and safe projections passed. Browser teacher showed both draft and published fixtures; browser student showed only the published fixture between announcements and assignments. Visible Staging badge confirmed. All ten source files matched the primary worktree byte for byte after validation.
- Production read-only metadata inspection confirmed the saved library in the requested active subject classroom. Vercel Production is READY on 002c7ef with the practice feature enabled. No Production data was written and no migrations were applied for this integration.
- Actual authenticated Production teacher/student browser sessions were not exercised in this task; the role flows were verified using synthetic Staging accounts. The primary localhost:3000 source is now integrated; refresh the classroom page to fetch its new props.
