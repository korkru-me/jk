-- Phase 1 Safe Exam Browser enforcement. The browser supplies Config Key and
-- Browser Exam Key request hashes; the application verifies them server-side
-- before creating or mutating an attempt. Raw SEB keys and request hashes are
-- deliberately not persisted.

ALTER TABLE public.assignments
  ADD COLUMN secure_browser_mode text NOT NULL DEFAULT 'browser';

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_secure_browser_mode_check
  CHECK (secure_browser_mode IN ('browser', 'seb_required'));

COMMENT ON COLUMN public.assignments.secure_browser_mode IS
  'browser allows the normal web exam UI; seb_required requires a server-verified Safe Exam Browser session before attempt access.';

ALTER TABLE public.submissions
  ADD COLUMN secure_browser_verified_at timestamptz,
  ADD COLUMN secure_browser_platform text,
  ADD COLUMN secure_browser_version text;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_secure_browser_platform_check
  CHECK (secure_browser_platform IS NULL OR secure_browser_platform IN ('windows', 'macos', 'ios')),
  ADD CONSTRAINT submissions_secure_browser_verification_complete_check
  CHECK (
    (secure_browser_verified_at IS NULL AND secure_browser_platform IS NULL AND secure_browser_version IS NULL)
    OR
    (secure_browser_verified_at IS NOT NULL AND secure_browser_platform IS NOT NULL AND secure_browser_version IS NOT NULL)
  );

COMMENT ON COLUMN public.submissions.secure_browser_verified_at IS
  'Server timestamp of the most recent successful SEB Config Key and Browser Exam Key verification for this attempt.';
COMMENT ON COLUMN public.submissions.secure_browser_platform IS
  'Coarse SEB platform reported by the verified JavaScript API: windows, macos, or ios. No device fingerprint is stored.';
COMMENT ON COLUMN public.submissions.secure_browser_version IS
  'Validated SafeExamBrowser.version string retained as an audit aid; raw verification keys and request hashes are never stored.';

ALTER TABLE public.exam_proctor_sessions
  ADD COLUMN secure_browser_verified_at timestamptz,
  ADD COLUMN secure_browser_platform text,
  ADD COLUMN secure_browser_version text;

ALTER TABLE public.exam_proctor_sessions
  ADD CONSTRAINT exam_proctor_sessions_secure_browser_platform_check
  CHECK (secure_browser_platform IS NULL OR secure_browser_platform IN ('windows', 'macos', 'ios')),
  ADD CONSTRAINT exam_proctor_sessions_secure_browser_verification_complete_check
  CHECK (
    (secure_browser_verified_at IS NULL AND secure_browser_platform IS NULL AND secure_browser_version IS NULL)
    OR
    (secure_browser_verified_at IS NOT NULL AND secure_browser_platform IS NOT NULL AND secure_browser_version IS NOT NULL)
  );

COMMENT ON COLUMN public.exam_proctor_sessions.secure_browser_verified_at IS
  'Read-optimized copy of the attempt SEB verification timestamp for the live proctor room.';

-- All proctor writes go through SECURITY DEFINER RPCs. Copy the authoritative
-- audit fields from submissions inside the database so no browser can forge a
-- green SEB status and all existing/upcoming RPC overloads stay compatible.
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
    submission.secure_browser_version
  INTO
    NEW.secure_browser_verified_at,
    NEW.secure_browser_platform,
    NEW.secure_browser_version
  FROM public.submissions submission
  WHERE submission.id = NEW.submission_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_exam_proctor_session_secure_browser()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_exam_proctor_session_secure_browser_before_write
  BEFORE INSERT OR UPDATE ON public.exam_proctor_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_exam_proctor_session_secure_browser();

-- Existing live session rows may belong to attempts verified during a rolling
-- deployment. Backfill once; the trigger keeps later heartbeats in sync.
UPDATE public.exam_proctor_sessions session
SET
  secure_browser_verified_at = submission.secure_browser_verified_at,
  secure_browser_platform = submission.secure_browser_platform,
  secure_browser_version = submission.secure_browser_version
FROM public.submissions submission
WHERE submission.id = session.submission_id;
