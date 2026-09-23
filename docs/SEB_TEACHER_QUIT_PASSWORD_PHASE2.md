# Teacher-owned SEB quit password — Phase 2 persistence contract

Phase 2 persists only the SEB-compatible password hash and immutable revision
metadata. It does not add the teacher UI, generate a `.seb` file, register
CK/BEK, change the student entry flow, or make an assignment distributable.

## Stored data

`assignment_seb_config_revisions` is an append-only history keyed by exact
assignment and revision. Each row contains:

- assignment, organization and owning teacher IDs;
- a monotonic revision number;
- the lower-case Base16 SHA-256 value required by SEB's
  `hashedQuitPassword` setting; and
- a server timestamp.

Plaintext password and confirmation never cross this persistence boundary and
are never stored, returned, logged or attached to an error. The RPC returns
revision metadata only; it never returns the stored hash. Browser roles have
no table policy or privilege, and only `service_role` can execute the creation
RPC.

## Atomic creation rule

`create_assignment_seb_quit_password_revision()` locks the exact assignment
row and then repeats all mutable checks from database truth in one transaction:

1. the actor is the active teacher in the assignment organization;
2. the actor is the exact assignment owner, not a co-teacher or administrator;
3. the assignment is an online exam, requires SEB and is not closed;
4. no submission for that assignment is `in_progress`; and
5. the caller's expected revision equals the current maximum revision.

The assignment row lock serializes password rotation with the foreign-key lock
taken when the current submission start path inserts a new attempt. Therefore
an attempt that commits first is observed and blocks rotation; a rotation that
commits first becomes the current revision before the attempt can proceed.

This lock does not by itself bind an earlier SEB session verification to a
later attempt insert. Before rotation is exposed to teachers, the artifact and
attempt phase must bind the exact configuration revision to the signed session
and recheck that revision inside the same database transaction that creates the
attempt. A real two-transaction PostgreSQL/Staging race test is also required
before claiming end-to-end concurrency evidence; the Phase 2 suite verifies
the lock design and invariants in PGlite but does not claim that live evidence.

Rows reject direct update and delete. Parent-assignment cascade deletion is the
only deletion path retained for the existing assignment lifecycle. Application
code has no direct insert/update/delete grant and writes only through the RPC.

## Server boundary

`persistSebQuitPasswordRevision()` accepts only the exact frozen output of the
Phase 1 preparation boundary, sends the hash to the service-role RPC, validates
the returned identity/revision metadata and returns a frozen metadata-only
object. SQLSTATE values are mapped to fixed domain errors; unknown database or
transport detail is replaced with a fixed failure code and is not reflected.

`createAdminClient()` is explicitly marked `server-only` so this boundary
cannot be imported into a browser bundle by mistake.

## Verification and phase boundary

PGlite regression tests cover role privileges/RLS, successful persistence,
canonical hash shape, compare-and-swap conflicts, active-attempt blocking,
exact owner/organization/eligibility checks, immutable history and parent
cascade deletion. Unit tests cover the server RPC arguments, SQLSTATE mapping,
malformed input/response rejection and secret-safe failures.

Phase 2 is still not a “ready” SEB configuration. Phase 3 may add the
teacher-facing workflow. A later artifact phase must bind the exact immutable
revision into a generated `.seb` file and register its CK/BEK before students
can receive it.

The Base16 representation follows the official SEB developer specification:
<https://safeexambrowser.org/developer/seb-config-key.html>.
