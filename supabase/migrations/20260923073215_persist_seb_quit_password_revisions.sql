-- Teacher-owned SEB quit-password revisions.
--
-- The browser sends plaintext only to the trusted Server Action. Application
-- code hashes it before this boundary, and this table stores only the exact
-- lower-case Base16 SHA-256 value required by SEB's hashedQuitPassword
-- setting. Browser roles cannot read or mutate the table.

CREATE TABLE public.assignment_seb_config_revisions (
  assignment_id uuid NOT NULL
    REFERENCES public.assignments(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  org_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  hashed_quit_password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, revision),
  CONSTRAINT assignment_seb_config_revisions_revision_check
    CHECK (revision BETWEEN 1 AND 2147483646),
  CONSTRAINT assignment_seb_config_revisions_quit_hash_check
    CHECK (hashed_quit_password ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE public.assignment_seb_config_revisions IS
  'Immutable teacher-owned SEB configuration revisions. Stores the required SHA-256 quit-password hash, never the plaintext password.';
COMMENT ON COLUMN public.assignment_seb_config_revisions.revision IS
  'Monotonic per-assignment configuration revision allocated atomically by create_assignment_seb_quit_password_revision().';
COMMENT ON COLUMN public.assignment_seb_config_revisions.hashed_quit_password IS
  'Lower-case Base16 SHA-256 for SEB hashedQuitPassword. This is secret-derived and service-role-only.';

CREATE INDEX assignment_seb_config_revisions_org_assignment_idx
  ON public.assignment_seb_config_revisions(org_id, assignment_id, revision DESC);

ALTER TABLE public.assignment_seb_config_revisions ENABLE ROW LEVEL SECURITY;

-- No browser policy is intentional. Even the hash and historical owner
-- binding remain behind the trusted server boundary.
REVOKE ALL ON TABLE public.assignment_seb_config_revisions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.assignment_seb_config_revisions TO service_role;

-- Revisions are append-only. Cascading deletion with the parent assignment is
-- still allowed so the existing assignment lifecycle remains compatible.
CREATE OR REPLACE FUNCTION public.protect_assignment_seb_config_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'SEB configuration revisions are immutable'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_assignment_seb_config_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER protect_assignment_seb_config_revision_before_mutation
  BEFORE UPDATE OR DELETE ON public.assignment_seb_config_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_assignment_seb_config_revision();

-- The Server Action authenticates the caller and hashes the password before
-- invoking this service-role-only RPC. The function repeats all mutable
-- authorization and assignment checks from database truth, locks the exact
-- assignment row to serialize against attempt creation, applies revision CAS,
-- and returns metadata only (never the stored hash).
CREATE OR REPLACE FUNCTION public.create_assignment_seb_quit_password_revision(
  p_assignment_id uuid,
  p_actor_id uuid,
  p_expected_revision integer,
  p_hashed_quit_password text
)
RETURNS TABLE (
  assignment_id uuid,
  org_id uuid,
  owner_id uuid,
  revision integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_owner_id uuid;
  v_mode text;
  v_type text;
  v_status text;
  v_secure_browser_mode text;
  v_current_revision integer;
  v_next_revision integer;
  v_created_at timestamptz;
BEGIN
  IF p_assignment_id IS NULL
    OR p_actor_id IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 0
    OR p_expected_revision > 2147483646
  THEN
    RAISE EXCEPTION 'invalid SEB quit-password revision input'
      USING ERRCODE = '22023';
  END IF;

  -- The row lock coordinates with the submissions.assignment_id foreign-key
  -- check, which takes a key-share lock. A concurrent attempt either commits
  -- first and is observed below, or waits until this revision is committed.
  SELECT
    assignment.org_id,
    assignment.created_by,
    assignment.mode::text,
    assignment.type::text,
    assignment.status::text,
    assignment.secure_browser_mode
  INTO
    v_org_id,
    v_owner_id,
    v_mode,
    v_type,
    v_status,
    v_secure_browser_mode
  FROM public.assignments assignment
  WHERE assignment.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_owner_id IS DISTINCT FROM p_actor_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.users actor
      WHERE actor.id = p_actor_id
        AND actor.role::text = 'teacher'
        AND actor.status::text = 'active'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.org_id = v_org_id
        AND member.user_id = p_actor_id
    )
  THEN
    RAISE EXCEPTION 'actor cannot rotate this SEB quit password'
      USING ERRCODE = '42501';
  END IF;

  IF v_mode <> 'online'
    OR v_type <> 'exam'
    OR v_status = 'closed'
    OR v_secure_browser_mode <> 'seb_required'
  THEN
    RAISE EXCEPTION 'assignment is not eligible for an SEB quit password'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.submissions submission
    WHERE submission.assignment_id = p_assignment_id
      AND submission.status::text = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'an active attempt prevents SEB quit-password rotation'
      USING ERRCODE = '55006';
  END IF;

  SELECT COALESCE(MAX(config_revision.revision), 0)
  INTO v_current_revision
  FROM public.assignment_seb_config_revisions config_revision
  WHERE config_revision.assignment_id = p_assignment_id;

  IF v_current_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'SEB quit-password revision conflict'
      USING ERRCODE = '40001';
  END IF;

  IF v_current_revision >= 2147483646 THEN
    RAISE EXCEPTION 'SEB quit-password revision exhausted'
      USING ERRCODE = '22003';
  END IF;

  -- Validate secret-derived material only after all authorization,
  -- eligibility, active-attempt and revision checks have succeeded.
  IF p_hashed_quit_password IS NULL
    OR p_hashed_quit_password !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid SEB quit-password revision input'
      USING ERRCODE = '22023';
  END IF;

  v_next_revision := v_current_revision + 1;

  INSERT INTO public.assignment_seb_config_revisions (
    assignment_id,
    revision,
    org_id,
    owner_id,
    hashed_quit_password
  ) VALUES (
    p_assignment_id,
    v_next_revision,
    v_org_id,
    v_owner_id,
    p_hashed_quit_password
  )
  RETURNING assignment_seb_config_revisions.created_at
  INTO v_created_at;

  RETURN QUERY
  SELECT
    p_assignment_id,
    v_org_id,
    v_owner_id,
    v_next_revision,
    v_created_at;
END;
$$;

COMMENT ON FUNCTION public.create_assignment_seb_quit_password_revision(uuid, uuid, integer, text) IS
  'Atomically creates the next teacher-owned SEB quit-password revision after exact authorization, assignment, active-attempt, and CAS checks.';

REVOKE ALL ON FUNCTION public.create_assignment_seb_quit_password_revision(uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_assignment_seb_quit_password_revision(uuid, uuid, integer, text)
  TO service_role;
