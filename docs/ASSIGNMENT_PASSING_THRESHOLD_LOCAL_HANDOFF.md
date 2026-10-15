# Local passing-threshold fix handoff

14 October 2026

- The isolated branch `codex/assignment-passing-threshold`, commit `6d9f7e8`, contains the reviewed fix and its `docs/FEATURE_STATUS.md` entry. Its earlier push was blocked because the repository is public. The owner explicitly authorized the full production synchronization on 15 October; this fix is now included in pushed local snapshot `0bb51b3`, and the original `codex/assignment-passing-threshold` branch is also backed up on origin.
- The two form changes from that commit have also been copied into the active localhost checkout, after confirming both files still matched base commit `d0e8d58`. No shared-branch commit or checkout was performed while another chat was editing it. Those previously uncommitted changes are now preserved in `0bb51b3` and released to Production through `e1ccfc0` / PR #56.
- Affected files: `components/assignments/create-assignment-form.tsx` and `components/assignments/edit-assignment-form.tsx`. The visible 70 is now an actual draft value; previously it was a placeholder over an empty input. Saved values, including zero, are retained. Applying settings without a threshold restores the 70 draft. Explicitly cleared inputs and percentages over 100 are still rejected. The complete mode still sends no threshold.
- Verification in the isolated checkout: TypeScript, semantic-token lint, 56 related Vitest cases and a Turbopack production build passed. Local memory-only browser regression passed for exercise/exam 70, custom 85, zero, blank, 101, complete mode, edit input and React inspection; resetting to system settings kept draft 70.
- No migration is required. No database writes or deployed-site tests were performed. Production persistence and authenticated server-action integration were not tested.
- Preserve other chats' changes. Integration is complete: the form changes are in both the synchronized local checkout and Production, and the original branch is pushed for recovery.
