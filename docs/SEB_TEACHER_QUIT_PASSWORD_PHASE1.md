# Teacher-owned SEB quit password — Phase 1 security contract

Phase 1 defines the server-only policy and secret-handling boundary. It does
not add UI, a `.seb` generator, CK/BEK registry entry, or deployment setting.
The hash-only database boundary described below was added separately in Phase
2.

## Invariants

- A student-facing `.seb` file has no Settings/Exam Password. The quit password
  is not an entry credential.
- Only the active teacher who owns the exact online exam may prepare a quit
  password revision. Admin, student, suspended, co-teacher and cross-org
  contexts fail closed in this phase.
- The exam must already require SEB, must not be closed, and must have no active
  attempt when a new password revision is prepared.
- Rotation uses compare-and-swap semantics: the browser-provided expected
  revision must equal the server-read current revision. A successful operation
  produces exactly `current + 1`.
- A release password is 20–64 printable ASCII characters, contains uppercase,
  lowercase, number and symbol characters, and matches its confirmation byte
  for byte. Values are never trimmed or normalized.
- The only secret-derived output is the lower-case Base16 SHA-256 value used by
  the standardized SEB `hashedQuitPassword` setting. The plaintext and confirmation are not
  included in the prepared revision, errors, safe responses or metadata.
- Authorization and active-attempt/revision checks occur before password
  validation and hashing. Later persistence must repeat the mutable checks in
  one database transaction.
- All errors exposed to callers are fixed messages. Unknown exception text is
  never reflected because it may contain a password or infrastructure detail.

## Phase boundary

The prepared value is not proof that an exam configuration exists and must not
be displayed as “ready”. Phase 2 persists it behind a service-role-only
boundary and repeats owner, active-attempt and revision checks atomically, but
still does not create or distribute an exam configuration. Phase 4 will create
the immutable `.seb` artifact and its CK/BEK before any revision may be
distributed to students.

The Base16 representation follows the official SEB developer specification:
<https://safeexambrowser.org/developer/seb-config-key.html>.
