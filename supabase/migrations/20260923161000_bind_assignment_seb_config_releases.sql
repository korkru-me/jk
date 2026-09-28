-- Bind a teacher-owned quit-password revision to one immutable SEB artifact
-- release, and bind that same revision to every new SEB attempt.
--
-- The release row contains server-only verification material (CK and BEKs).
-- Browser roles receive neither the row nor the Storage object directly; the
-- application issues a short-lived signed download URL only after assignment
-- authorization. A release row is inserted only after the server has checked
-- the uploaded object's exact path, size and SHA-256 digest.

CREATE TABLE public.assignment_seb_config_releases (
  assignment_id uuid NOT NULL,
  revision integer NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  release_id text NOT NULL UNIQUE,
  artifact_storage_path text NOT NULL UNIQUE,
  artifact_sha256 text NOT NULL,
  artifact_size_bytes integer NOT NULL,
  config_key text NOT NULL,
  browser_exam_keys jsonb NOT NULL,
  security_mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, revision),
  FOREIGN KEY (assignment_id, revision)
    REFERENCES public.assignment_seb_config_revisions(assignment_id, revision)
    ON DELETE CASCADE,
  CONSTRAINT assignment_seb_config_releases_revision_check
    CHECK (revision BETWEEN 1 AND 2147483646),
  CONSTRAINT assignment_seb_config_releases_release_id_check
    CHECK (release_id ~ '^asr-[0-9a-f]{32}-r[1-9][0-9]{0,9}-[0-9a-f]{16}$'),
  CONSTRAINT assignment_seb_config_releases_path_check
    CHECK (artifact_storage_path ~ '^assignments/[0-9a-f-]{36}/r[1-9][0-9]{0,9}/[0-9a-f]{64}\.seb$'),
  CONSTRAINT assignment_seb_config_releases_artifact_hash_check
    CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assignment_seb_config_releases_artifact_size_check
    CHECK (artifact_size_bytes BETWEEN 1 AND 2097152),
  CONSTRAINT assignment_seb_config_releases_config_key_check
    CHECK (config_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assignment_seb_config_releases_key_registry_check
    CHECK (jsonb_typeof(browser_exam_keys) = 'array' AND jsonb_array_length(browser_exam_keys) BETWEEN 1 AND 32),
  CONSTRAINT assignment_seb_config_releases_security_mode_check
    CHECK (security_mode IN ('x509_encrypted', 'test_plaintext'))
);

COMMENT ON TABLE public.assignment_seb_config_releases IS
  'Immutable, server-only binding between one teacher quit-password revision, its exact SEB artifact digest, CK and native platform/build BEKs.';
COMMENT ON COLUMN public.assignment_seb_config_releases.config_key IS
  'Raw Config Key used only to verify SEB request hashes on the trusted server boundary.';
COMMENT ON COLUMN public.assignment_seb_config_releases.browser_exam_keys IS
  'Raw platform/version/build Browser Exam Keys used only by the trusted server boundary; never returned to a browser.';
COMMENT ON COLUMN public.assignment_seb_config_releases.security_mode IS
  'x509_encrypted is release-capable. test_plaintext is restricted to explicitly enabled non-production staging.';

CREATE INDEX assignment_seb_config_releases_org_assignment_idx
  ON public.assignment_seb_config_releases(org_id, assignment_id, revision DESC);

ALTER TABLE public.assignment_seb_config_releases ENABLE ROW LEVEL SECURITY;

-- No browser policy is intentional. Even CK/BEK and a password-derived
-- artifact must remain behind the service-role boundary.
REVOKE ALL ON TABLE public.assignment_seb_config_releases
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.assignment_seb_config_releases TO service_role;

CREATE OR REPLACE FUNCTION public.protect_assignment_seb_config_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'SEB configuration releases are immutable'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_assignment_seb_config_release()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER protect_assignment_seb_config_release_before_mutation
  BEFORE UPDATE OR DELETE ON public.assignment_seb_config_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_assignment_seb_config_release();

-- Application checks provide the teacher-facing error, but publication is a
-- database invariant too. This prevents an older deployment or a direct RLS-
-- authorized update from publishing an SEB assignment whose current password
-- revision has no registered artifact yet.
CREATE OR REPLACE FUNCTION public.enforce_assignment_seb_release_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_revision integer;
BEGIN
  IF NEW.status::text = 'published'
    AND NEW.secure_browser_mode = 'seb_required'
  THEN
    SELECT COALESCE(MAX(config_revision.revision), 0)
    INTO v_current_revision
    FROM public.assignment_seb_config_revisions config_revision
    WHERE config_revision.assignment_id = NEW.id;

    IF v_current_revision < 1
      OR NOT EXISTS (
        SELECT 1
        FROM public.assignment_seb_config_releases config_release
        WHERE config_release.assignment_id = NEW.id
          AND config_release.revision = v_current_revision
          AND config_release.org_id = NEW.org_id
          AND config_release.owner_id = NEW.created_by
      )
    THEN
      RAISE EXCEPTION 'current SEB configuration release is required before publication'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_assignment_seb_release_on_publish()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_assignment_seb_release_before_publish
  BEFORE INSERT OR UPDATE OF status, secure_browser_mode
  ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignment_seb_release_on_publish();

-- Existing published SEB rows predate assignment-specific releases. Leaving
-- them visible would strand students on a configuration-missing page after
-- the new application is deployed, so fail closed until each exact release is
-- enrolled and deliberately republished.
UPDATE public.assignments assignment
SET status = 'draft'
WHERE assignment.status::text = 'published'
  AND assignment.secure_browser_mode = 'seb_required'
  AND NOT EXISTS (
    SELECT 1
    FROM public.assignment_seb_config_releases config_release
    WHERE config_release.assignment_id = assignment.id
      AND config_release.revision = (
        SELECT MAX(config_revision.revision)
        FROM public.assignment_seb_config_revisions config_revision
        WHERE config_revision.assignment_id = assignment.id
      )
      AND config_release.org_id = assignment.org_id
      AND config_release.owner_id = assignment.created_by
  );

-- The application verifies the actual private Storage object before calling
-- this service-role-only function. The database repeats assignment/revision,
-- tenant, active-attempt and registry-shape checks under an assignment lock,
-- then derives the public-safe release id rather than accepting one.
CREATE OR REPLACE FUNCTION public.register_assignment_seb_config_release(
  p_assignment_id uuid,
  p_revision integer,
  p_artifact_storage_path text,
  p_artifact_sha256 text,
  p_artifact_size_bytes integer,
  p_config_key text,
  p_browser_exam_keys jsonb,
  p_security_mode text
)
RETURNS TABLE (
  assignment_id uuid,
  org_id uuid,
  owner_id uuid,
  revision integer,
  release_id text,
  artifact_storage_path text,
  artifact_sha256 text,
  artifact_size_bytes integer,
  security_mode text,
  browser_exam_key_count integer,
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
  v_expected_path text;
  v_release_id text;
  v_entry jsonb;
  v_key_count integer;
  v_distinct_key_count integer;
  v_created_at timestamptz;
BEGIN
  IF p_assignment_id IS NULL
    OR p_revision IS NULL
    OR p_revision < 1
    OR p_revision > 2147483646
    OR p_artifact_sha256 IS NULL
    OR p_artifact_sha256 !~ '^[0-9a-f]{64}$'
    OR p_artifact_size_bytes IS NULL
    OR p_artifact_size_bytes < 1
    OR p_artifact_size_bytes > 2097152
    OR p_config_key IS NULL
    OR p_config_key !~ '^[0-9a-f]{64}$'
    OR p_security_mode NOT IN ('x509_encrypted', 'test_plaintext')
    OR p_browser_exam_keys IS NULL
    OR jsonb_typeof(p_browser_exam_keys) <> 'array'
    OR jsonb_array_length(p_browser_exam_keys) NOT BETWEEN 1 AND 32
  THEN
    RAISE EXCEPTION 'invalid SEB configuration release input'
      USING ERRCODE = '22023';
  END IF;

  v_expected_path := format(
    'assignments/%s/r%s/%s.seb',
    p_assignment_id::text,
    p_revision::text,
    p_artifact_sha256
  );
  IF p_artifact_storage_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'invalid SEB configuration artifact path'
      USING ERRCODE = '22023';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_browser_exam_keys)
  LOOP
    IF jsonb_typeof(v_entry) <> 'object'
      OR NOT (v_entry ?& ARRAY['platform', 'versionString', 'buildNumber', 'key'])
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(v_entry) field_name
        WHERE field_name NOT IN ('platform', 'versionString', 'buildNumber', 'key')
      )
      OR v_entry->>'platform' NOT IN ('windows', 'macos', 'ios')
      OR COALESCE(v_entry->>'versionString', '') !~ '^[A-Za-z0-9.+-]{1,40}$'
      OR COALESCE(v_entry->>'buildNumber', '') !~ '^[A-Za-z0-9.+-]{1,40}$'
      OR COALESCE(v_entry->>'key', '') !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION 'invalid SEB Browser Exam Key registry'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT
    COUNT(*)::integer,
    COUNT(DISTINCT (
      value->>'platform',
      value->>'versionString',
      value->>'buildNumber'
    ))::integer
  INTO v_key_count, v_distinct_key_count
  FROM jsonb_array_elements(p_browser_exam_keys);

  IF v_key_count IS DISTINCT FROM v_distinct_key_count THEN
    RAISE EXCEPTION 'duplicate SEB Browser Exam Key identity'
      USING ERRCODE = '22023';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found for SEB configuration release'
      USING ERRCODE = '42501';
  END IF;

  IF v_mode <> 'online'
    OR v_type <> 'exam'
    OR v_status = 'closed'
    OR v_secure_browser_mode <> 'seb_required'
  THEN
    RAISE EXCEPTION 'assignment is not eligible for an SEB configuration release'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.submissions submission
    WHERE submission.assignment_id = p_assignment_id
      AND submission.status::text = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'an active attempt prevents SEB configuration release registration'
      USING ERRCODE = '55006';
  END IF;

  SELECT COALESCE(MAX(config_revision.revision), 0)
  INTO v_current_revision
  FROM public.assignment_seb_config_revisions config_revision
  WHERE config_revision.assignment_id = p_assignment_id;

  IF v_current_revision IS DISTINCT FROM p_revision
    OR NOT EXISTS (
      SELECT 1
      FROM public.assignment_seb_config_revisions config_revision
      WHERE config_revision.assignment_id = p_assignment_id
        AND config_revision.revision = p_revision
        AND config_revision.org_id = v_org_id
        AND config_revision.owner_id = v_owner_id
    )
  THEN
    RAISE EXCEPTION 'SEB configuration revision conflict'
      USING ERRCODE = '40001';
  END IF;

  v_release_id := format(
    'asr-%s-r%s-%s',
    replace(p_assignment_id::text, '-', ''),
    p_revision::text,
    left(p_artifact_sha256, 16)
  );

  INSERT INTO public.assignment_seb_config_releases (
    assignment_id,
    revision,
    org_id,
    owner_id,
    release_id,
    artifact_storage_path,
    artifact_sha256,
    artifact_size_bytes,
    config_key,
    browser_exam_keys,
    security_mode
  ) VALUES (
    p_assignment_id,
    p_revision,
    v_org_id,
    v_owner_id,
    v_release_id,
    p_artifact_storage_path,
    p_artifact_sha256,
    p_artifact_size_bytes,
    p_config_key,
    p_browser_exam_keys,
    p_security_mode
  )
  RETURNING assignment_seb_config_releases.created_at
  INTO v_created_at;

  RETURN QUERY SELECT
    p_assignment_id,
    v_org_id,
    v_owner_id,
    p_revision,
    v_release_id,
    p_artifact_storage_path,
    p_artifact_sha256,
    p_artifact_size_bytes,
    p_security_mode,
    v_key_count,
    v_created_at;
END;
$$;

COMMENT ON FUNCTION public.register_assignment_seb_config_release(uuid, integer, text, text, integer, text, jsonb, text) IS
  'Registers one already-verified immutable SEB artifact/CK/BEK release for the current teacher-owned revision and returns metadata only.';

REVOKE ALL ON FUNCTION public.register_assignment_seb_config_release(uuid, integer, text, text, integer, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_assignment_seb_config_release(uuid, integer, text, text, integer, text, jsonb, text)
  TO service_role;

-- Existing rows predate assignment-specific releases and remain NULL. Every
-- new server-verified SEB attempt is created only through the RPC below and
-- records the exact immutable teacher revision that its signed session used.
ALTER TABLE public.submissions
  ADD COLUMN seb_config_revision integer;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_seb_config_revision_check
  CHECK (seb_config_revision IS NULL OR seb_config_revision BETWEEN 1 AND 2147483646);

COMMENT ON COLUMN public.submissions.seb_config_revision IS
  'Exact teacher-owned SEB config revision bound to the signed session and rechecked transactionally when this attempt was created. NULL denotes a legacy/non-SEB/Android attempt.';

ALTER TABLE public.exam_proctor_sessions
  ADD COLUMN seb_config_revision integer;

ALTER TABLE public.exam_proctor_sessions
  ADD CONSTRAINT exam_proctor_sessions_seb_config_revision_check
  CHECK (seb_config_revision IS NULL OR seb_config_revision BETWEEN 1 AND 2147483646);

-- Replace the proctor sync function so the browser cannot forge the config
-- revision badge any more than it can forge the existing SEB audit fields.
CREATE OR REPLACE FUNCTION public.sync_exam_proctor_session_secure_browser()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT
    submission.secure_browser_verified_at,
    submission.secure_browser_platform,
    submission.secure_browser_version,
    submission.exam_access_mode,
    submission.android_approved_at,
    submission.android_approved_by,
    submission.seb_config_revision
  INTO
    NEW.secure_browser_verified_at,
    NEW.secure_browser_platform,
    NEW.secure_browser_version,
    NEW.exam_access_mode,
    NEW.android_approved_at,
    NEW.android_approved_by,
    NEW.seb_config_revision
  FROM public.submissions submission
  WHERE submission.id = NEW.submission_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_exam_proctor_session_secure_browser()
  FROM PUBLIC, anon, authenticated;

UPDATE public.exam_proctor_sessions session
SET seb_config_revision = submission.seb_config_revision
FROM public.submissions submission
WHERE submission.id = session.submission_id;

-- This is the sole creation path for a new SEB attempt after this migration.
-- The assignment row lock conflicts with quit-password rotation's FOR UPDATE:
-- either rotation commits first and this exact revision check fails, or this
-- insert commits first and rotation observes the new in-progress attempt.
CREATE OR REPLACE FUNCTION public.create_seb_submission_with_revision(
  p_org_id uuid,
  p_assignment_id uuid,
  p_student_id uuid,
  p_max_score numeric,
  p_attempt_number integer,
  p_verified_at timestamptz,
  p_platform text,
  p_version text,
  p_config_revision integer
)
RETURNS TABLE (
  submission_id uuid,
  seb_config_revision integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assignment_org_id uuid;
  v_assignment_status text;
  v_assignment_mode text;
  v_assignment_type text;
  v_secure_browser_mode text;
  v_current_revision integer;
  v_submission_id uuid;
BEGIN
  IF p_org_id IS NULL
    OR p_assignment_id IS NULL
    OR p_student_id IS NULL
    OR p_max_score IS NULL
    OR p_max_score < 0
    OR p_attempt_number IS NULL
    OR p_attempt_number < 1
    OR p_verified_at IS NULL
    OR p_verified_at > clock_timestamp() + interval '1 minute'
    OR p_verified_at < clock_timestamp() - interval '13 hours'
    OR p_platform NOT IN ('windows', 'macos', 'ios')
    OR p_version IS NULL
    OR length(p_version) NOT BETWEEN 5 AND 240
    OR p_version ~ '[\x00-\x1f\x7f]'
    OR p_config_revision IS NULL
    OR p_config_revision < 1
    OR p_config_revision > 2147483646
  THEN
    RAISE EXCEPTION 'invalid SEB submission input'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    assignment.org_id,
    assignment.status::text,
    assignment.mode::text,
    assignment.type::text,
    assignment.secure_browser_mode
  INTO
    v_assignment_org_id,
    v_assignment_status,
    v_assignment_mode,
    v_assignment_type,
    v_secure_browser_mode
  FROM public.assignments assignment
  WHERE assignment.id = p_assignment_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_assignment_org_id IS DISTINCT FROM p_org_id
    OR v_assignment_status <> 'published'
    OR v_assignment_mode <> 'online'
    OR v_assignment_type <> 'exam'
    OR v_secure_browser_mode <> 'seb_required'
  THEN
    RAISE EXCEPTION 'assignment is not eligible for an SEB attempt'
      USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(MAX(config_revision.revision), 0)
  INTO v_current_revision
  FROM public.assignment_seb_config_revisions config_revision
  WHERE config_revision.assignment_id = p_assignment_id;

  IF v_current_revision IS DISTINCT FROM p_config_revision
    OR NOT EXISTS (
      SELECT 1
      FROM public.assignment_seb_config_releases config_release
      WHERE config_release.assignment_id = p_assignment_id
        AND config_release.revision = p_config_revision
        AND config_release.org_id = p_org_id
    )
  THEN
    RAISE EXCEPTION 'SEB configuration revision conflict'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.submissions (
    org_id,
    assignment_id,
    student_id,
    max_score,
    status,
    attempt_number,
    exam_access_mode,
    secure_browser_verified_at,
    secure_browser_platform,
    secure_browser_version,
    seb_config_revision
  ) VALUES (
    p_org_id,
    p_assignment_id,
    p_student_id,
    p_max_score,
    'in_progress',
    p_attempt_number,
    'seb',
    p_verified_at,
    p_platform,
    p_version,
    p_config_revision
  )
  RETURNING submissions.id INTO v_submission_id;

  RETURN QUERY SELECT v_submission_id, p_config_revision;
END;
$$;

COMMENT ON FUNCTION public.create_seb_submission_with_revision(uuid, uuid, uuid, numeric, integer, timestamptz, text, text, integer) IS
  'Creates one SEB attempt only after locking the assignment and rechecking the current immutable artifact revision in the same transaction.';

REVOKE ALL ON FUNCTION public.create_seb_submission_with_revision(uuid, uuid, uuid, numeric, integer, timestamptz, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_seb_submission_with_revision(uuid, uuid, uuid, numeric, integer, timestamptz, text, text, integer)
  TO service_role;

-- Rotating the teacher-owned quit password invalidates the previous artifact.
-- Make the assignment private in the same transaction as the new revision so
-- no student is sent to a published exam while its current artifact is stale.
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

  UPDATE public.assignments
  SET status = 'draft'
  WHERE id = p_assignment_id
    AND status::text = 'published';

  -- A successful check-in proves only the artifact revision that produced
  -- its verified session. Rotation invalidates that revision, so clear the
  -- short-lived roster signal in the same transaction instead of showing a
  -- stale "ready" badge while the replacement artifact is pending.
  DELETE FROM public.exam_seb_checkins checkin
  WHERE checkin.assignment_id = p_assignment_id;

  RETURN QUERY SELECT
    p_assignment_id,
    v_org_id,
    v_owner_id,
    v_next_revision,
    v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_assignment_seb_quit_password_revision(uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_assignment_seb_quit_password_revision(uuid, uuid, integer, text)
  TO service_role;

-- Private artifact bucket. No storage.objects policy is created: only the
-- service role may upload/list/read, and authorized browsers receive a short
-- lived signed URL for one exact object.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assignment-seb-configs',
  'assignment-seb-configs',
  false,
  2097152,
  ARRAY['application/seb', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
