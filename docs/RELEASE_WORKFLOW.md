# Release completion and primary local parity

Owner decision, 18 October 2026: after every successful Production deployment,
sync the released changes to the primary local website on port 3000 and verify
them before handing the work back. This is a standing project rule for every
chat and agent, recorded in `AGENTS.md` and
`.cursor/rules/production-local-parity.mdc`.

1. Complete the checks and Staging validation required by the change. Confirm
   the Ready Production deployment, exact deployed commit, and canonical domain.
2. Find the actual checkout/process serving `localhost:3000`; inspect its Git
   state and any concurrent work before making changes.
3. Integrate the released changes plus their dependencies into that checkout.
   Preserve unrelated/newer work and local settings. If the primary branch is
   shared, record and push the scoped handoff on an isolated branch.
4. Inspect the affected pages and behavior on port 3000 itself, including relevant
   desktop/mobile layouts for UI work. Use local fixtures for isolated UI checks;
   follow the Staging testing rule for Auth, database, and integration testing.
5. In the final handoff, state the deployed commit, primary checkout and port,
   sync result, checks, and any unresolved gap. A blocked sync or unverified page
   remains unfinished and must be reported clearly.

This requirement followed a release where the redesigned question cards worked
in a separate preview checkout on port 3054 while the primary port 3000 still
served the previous UI. Checking only the preview would miss that failure.
Parity covers the released application changes; environment secrets, real user
data, and unrelated local work remain appropriate to their own environment.
