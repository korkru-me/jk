# Assignment-specific SEB artifact binding — Phase 4

Phase 4 binds one teacher-owned quit-password revision to one immutable SEB
artifact release and then binds that exact release to every SEB session and
attempt. It closes the gap between “the teacher saved a quit password” and
“students may safely receive a `.seb` file”.

This phase does not add an entry password. Students still open the exam without
typing a password. The password set by the owning teacher is only the native
SEB quit/unlock password; the configured Quit Link remains the normal exit after
a successful submission.

## Release invariant

A publishable assignment-specific release is one unit containing:

- the exact assignment and teacher-owned password revision;
- one private `.seb` object, its canonical path, byte length and SHA-256 digest;
- the Config Key derived from that exact configuration; and
- one or more Browser Exam Keys identified by exact platform, SEB version and
  build.

The application must not invent a Browser Exam Key. Native SEB must produce the
artifact and the CK/BEK evidence for the same final settings. Re-saving or
changing the file creates different evidence and therefore requires a new
release instead of modifying an existing row.

## Teacher workflow

1. The exact active teacher who owns an eligible online SEB exam sets or rotates
   the quit password.
2. The server stores only the SHA-256 value required by SEB in an append-only
   revision and keeps the assignment as `draft`.
3. The teacher UI reports **รอไฟล์ SEB**. It never displays the password or hash.
4. A trusted internal operator/native pipeline builds the exact `.seb` file,
   uploads it to private Storage, verifies the downloaded bytes, and registers
   its CK/BEKs through the service-role-only boundary.
5. Only when the registered artifact revision equals the current password
   revision does the UI report **พร้อมเผยแพร่** and the publish gate allow the
   assignment to become visible.

Publication is also protected by a database trigger, so an older application
deployment or a direct RLS-authorized update cannot bypass the current-release
requirement. During rollout, any already-published SEB assignment that has no
assignment-specific release is returned to `draft` and must be enrolled and
republished deliberately.

Rotating the password while no attempt is active appends a revision and returns
an already-published assignment to `draft` in the same database transaction.
It also clears that assignment's short-lived SEB preflight check-ins so the
teacher roster cannot show a stale **พร้อม** result from the previous file.
The previous artifact remains immutable historical evidence and is never reused
for the new revision.

## Student and attempt binding

- The system-check and take flows issue a five-minute signed Storage URL for the
  exact private object only after assignment and roster authorization.
- Challenge and HttpOnly SEB session claims contain both the opaque release ID
  and the integer assignment revision.
- CK and BEK request hashes are verified on the trusted server against the
  server-only release row for that exact challenge.
- A new SEB submission is created through a service-role-only database function
  that locks the assignment, rechecks published/SEB eligibility, confirms the
  current registered revision, and writes `submissions.seb_config_revision` in
  the same transaction.
- Resume, question reads, answer writes, attachments, proctor heartbeat and
  submit all reload the stored revision. The access mode is also immutable: an
  attempt that began in SEB cannot fall back to Android monitored mode, and an
  Android attempt cannot be upgraded to SEB mid-attempt.
- Legacy SEB attempts without a stored revision fail closed. Server-initiated
  finalization after an expired timer remains the deliberate exception so an
  abandoned attempt can be closed safely.

## Storage and database boundary

`assignment_seb_config_releases` has no browser policy or browser grant. It is
immutable and readable only by the service role. CK and BEKs exist only in that
trusted verification row; they are never returned by the registration function,
teacher state, download response metadata, or student actions.

The `assignment-seb-configs` bucket is private, limited to 2 MiB per object, and
has no `storage.objects` policy. The internal registration boundary downloads
the object and verifies its exact size and SHA-256 digest before crossing the
database RPC. Student downloads use short-lived signed URLs rather than a public
bucket.

Release-capable artifacts use `x509_encrypted`. `test_plaintext` is an explicit
Staging-only escape hatch and is accepted only when both
`SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS=true` and the canonical site hostname is
exactly `staging.korkru.com`. Production never accepts that mode.

## Verification completed on the branch

- The Phase 2 plus Phase 4 migrations apply in a real PGlite database test.
- Tests cover private bucket/ACL/RLS, immutable release rows, canonical object
  binding, duplicate native-build rejection, safe registration responses,
  transactional attempt creation, password rotation to draft and cascading
  assignment cleanup.
- Server tests cover exact object bytes/hash, signed download paths, malformed
  release data, the Staging plaintext gate, CK/BEK non-disclosure and exact
  current-revision reads.
- Session and attempt tests cover release-bound challenges/cookies, stored
  revision enforcement and immutable SEB/Android access mode.

## Deployment boundary

The Phase 4 migration and the matching application version are deployed to the
isolated Korkru Staging database and `staging.korkru.com` only. They are not
applied or deployed to Production. A real assignment remains unpublished until
a native operator/pipeline creates and registers its exact artifact and CK/BEK
evidence. Automated tests are not a substitute for native SEB verification on
every supported exact build.

The temporary, Staging-only two-step operator procedure is documented in
[`SEB_ASSIGNMENT_ARTIFACT_OPERATOR.md`](./SEB_ASSIGNMENT_ARTIFACT_OPERATOR.md).
It defaults to local dry-run, accepts native CK/BEK evidence through stdin only,
and does not publish the assignment.
