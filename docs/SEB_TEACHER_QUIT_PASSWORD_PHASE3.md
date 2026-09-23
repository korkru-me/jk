# Teacher-owned SEB quit password — Phase 3 teacher workflow

Phase 3 adds the teacher-facing workflow for setting the quit/unlock password
of an exact SEB assignment. It does not add an entry password, generate or
publish a `.seb` artifact, register CK/BEK, deploy the application, or make an
assignment distributable to students.

## Product rule

- Students must not enter a password before starting an exam.
- The teacher-defined password is only the SEB quit/unlock password used when
  an authorized person must leave or unlock SEB before submission.
- After a successful submission, the configured Quit Link remains the normal
  exit path and does not require the quit/unlock password.
- The password belongs to one assignment and one owning teacher. It is not a
  shared school-wide or customer-wide password.

## Create workflow

When a teacher creates an online exam and selects **Safe Exam Browser**, the
existing SEB settings card asks for a quit password and confirmation. Both
fields are required before the teacher can leave the settings step. The
client-side checks mirror the server contract for immediate feedback, while
the server remains authoritative.

The assignment is first inserted as `draft`. Classroom links are then created
and revision 1 is appended through the Phase 2 service-only boundary. A create
form that requested `published` still remains `draft`: Phase 4 must register the
exact `.seb` artifact, CK and BEKs for that revision before publication is
allowed. Failure in any step therefore cannot expose an incomplete SEB exam.
Plaintext is sent only to the trusted Server Action and is never included in
the confirmation summary.

## Existing assignment workflow

The edit page loads display-safe metadata only. The exact active teacher who
owns the assignment may create or rotate the password when the assignment is
an open online exam that requires SEB and has no active attempt. The UI shows
only whether a revision exists and its number; it never returns the previous
password or the stored hash.

Both local plaintext copies are cleared immediately after every save attempt,
including an error. Co-teachers, organization administrators and other users
do not learn whether a revision exists. Rotation remains blocked for a closed
assignment or while any attempt is `in_progress`.

If an existing published browser exam is changed to require SEB, the update
returns it to `draft`. The owner must set a quit password and the exact Phase 4
artifact release must be registered before publishing it again. Publishing an
SEB assignment fails closed when either shared signing/canonical URL readiness
or the current assignment-specific release is missing.

## Server boundary

`saveSebQuitPassword()` authenticates the current user, loads current database
truth on the server, applies the Phase 1 authorization and password rules, and
passes only the prepared hash to the Phase 2 persistence RPC. Its response is
limited to revision number and server timestamp. Database, transport and
secret details are mapped to fixed safe errors.

The publication helper is internal and fail-closed. It checks for revision
existence with a server-only admin client and does not expose the row or hash
to a browser bundle.

## Verification

Unit tests cover the display-safe state, exact-owner checks, active-attempt and
eligibility blocks, the Server Action response boundary and safe failures. The
Phase 1–3 focused suites, TypeScript and design-token checks pass. The password
fields were also exercised in a local Next.js runtime at mobile width, with
show/hide behavior and WCAG A/AA automated checks; the temporary fixture was
removed after verification.

This local component verification is not an authenticated Staging owner-flow
test and is not native SEB evidence.

## Phase boundary

Phase 3 must not be deployed as a completed student workflow on its own. Before
students can receive an assignment-specific config, the artifact/attempt phase
must:

1. generate an immutable `.seb` artifact for the exact password revision;
2. bind and verify the corresponding CK and platform/build-specific BEK;
3. bind that exact config revision into the signed SEB session; and
4. recheck it in the same database transaction that creates the attempt.

Phase 4 now implements the server/database binding described above; see
[`SEB_ASSIGNMENT_ARTIFACT_PHASE4.md`](./SEB_ASSIGNMENT_ARTIFACT_PHASE4.md).
Native artifact generation/enrollment and supported-platform evidence remain
required before an assignment can be released.

## Deployment status

The Phase 3 application and UI changes exist only on the SEB completion branch.
They have not been deployed to Staging or Production. Phase 2 persistence is
present only in the isolated Korkru Staging database; Production is unchanged.
