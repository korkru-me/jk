-- Drafts only: no SEB session, published config, CK/BEK, or native exit grant.
-- Browser roles cannot access even the ciphertext. All access is through an
-- authenticated server adapter and service-only RPCs which recheck ownership.
CREATE TABLE public.exam_seb_password_drafts (
  assignment_id uuid PRIMARY KEY REFERENCES public.assignments(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL UNIQUE,
  revision integer NOT NULL CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('saved', 'discarded', 'expired')),
  secret jsonb,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz,
  CHECK ((state = 'saved' AND secret IS NOT NULL AND expires_at IS NOT NULL)
    OR (state IN ('discarded', 'expired') AND secret IS NULL)),
  CHECK (expires_at IS NULL OR expires_at = updated_at + interval '30 days')
);
CREATE INDEX exam_seb_password_drafts_org ON public.exam_seb_password_drafts(org_id);
CREATE INDEX exam_seb_password_drafts_teacher ON public.exam_seb_password_drafts(teacher_id);
CREATE INDEX exam_seb_password_drafts_expiry ON public.exam_seb_password_drafts(expires_at)
  WHERE secret IS NOT NULL;

CREATE TABLE public.exam_seb_password_events (
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('saved', 'discarded', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, revision, action)
);
CREATE INDEX exam_seb_password_events_org ON public.exam_seb_password_events(org_id);
CREATE INDEX exam_seb_password_events_teacher ON public.exam_seb_password_events(teacher_id);
CREATE INDEX exam_seb_password_events_retention ON public.exam_seb_password_events(created_at);

ALTER TABLE public.exam_seb_password_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_seb_password_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_seb_password_drafts, public.exam_seb_password_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_seb_password_drafts TO service_role;
GRANT SELECT, INSERT, DELETE ON public.exam_seb_password_events TO service_role;
COMMENT ON TABLE public.exam_seb_password_drafts IS
  'Latest encrypted, unpublished quit-password draft per exact owning teacher/exam. Never a ready/applied config or admission proof. Secret expires after 30 days; replacement discards the previous draft ciphertext.';
COMMENT ON TABLE public.exam_seb_password_events IS
  '90-day metadata-only draft audit, not a record of native password application. No passwords, keys, envelopes, or student data.';

CREATE FUNCTION public.authorize_exam_seb_password_owner(p_assignment_id uuid, p_actor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org_id uuid;
BEGIN
  SELECT a.org_id INTO v_org_id
  FROM public.assignments a
  JOIN public.users u ON u.id = a.created_by
  JOIN public.organization_members m ON m.org_id = a.org_id AND m.user_id = u.id
  WHERE a.id = p_assignment_id AND a.created_by = p_actor_id
    AND u.status = 'active' AND u.role IN ('teacher', 'admin')
    AND a.type = 'exam' AND a.mode = 'online' AND a.secure_browser_mode = 'seb_required';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'SEB_PASSWORD_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN v_org_id;
END;
$$;

CREATE FUNCTION public.read_exam_seb_password_draft(p_assignment_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org_id uuid; v_draft jsonb; v_events jsonb;
BEGIN
  v_org_id := public.authorize_exam_seb_password_owner(p_assignment_id, p_actor_id);
  SELECT jsonb_build_object(
    'revision', d.revision, 'state', CASE WHEN d.state = 'saved' AND d.expires_at <= now()
      THEN 'expired' ELSE d.state END,
    'updatedAt', d.updated_at, 'expiresAt', d.expires_at
  ) INTO v_draft FROM public.exam_seb_password_drafts d
    WHERE d.assignment_id = p_assignment_id AND d.org_id = v_org_id AND d.teacher_id = p_actor_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'revision', e.revision, 'action', e.action, 'createdAt', e.created_at
  ) ORDER BY e.created_at DESC, e.revision DESC), '[]'::jsonb) INTO v_events
  FROM (SELECT revision, action, created_at FROM public.exam_seb_password_events
    WHERE assignment_id = p_assignment_id AND org_id = v_org_id AND teacher_id = p_actor_id
      AND created_at > now() - interval '90 days'
    ORDER BY created_at DESC, revision DESC LIMIT 10) e;
  RETURN jsonb_build_object('draft', v_draft, 'events', v_events);
END;
$$;

CREATE FUNCTION public.write_exam_seb_password_draft(
  p_assignment_id uuid, p_actor_id uuid, p_expected_revision integer,
  p_revision_id uuid, p_secret jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org_id uuid; v_revision integer; v_updated_at timestamptz;
  v_action text := CASE WHEN p_secret IS NULL THEN 'discarded' ELSE 'saved' END;
BEGIN
  -- The assignment row exists before the first draft; it is the shared lock
  -- for first-write races, replacements, and assignment edits/deletion.
  PERFORM 1 FROM public.assignments WHERE id = p_assignment_id FOR UPDATE;
  v_org_id := public.authorize_exam_seb_password_owner(p_assignment_id, p_actor_id);
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR p_expected_revision >= 2147483647
    OR p_revision_id IS NULL OR p_revision_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'SEB_PASSWORD_CONTEXT_INVALID' USING ERRCODE = '22023'; END IF;

  SELECT revision, updated_at INTO v_revision, v_updated_at
    FROM public.exam_seb_password_drafts WHERE assignment_id = p_assignment_id FOR UPDATE;
  IF coalesce(v_revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'SEB_PASSWORD_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF p_secret IS NOT NULL AND v_updated_at > now() - interval '10 seconds' THEN
    RAISE EXCEPTION 'SEB_PASSWORD_RATE_LIMITED' USING ERRCODE = 'P0001';
  END IF;
  IF p_secret IS NULL AND v_revision IS NULL THEN
    RAISE EXCEPTION 'SEB_PASSWORD_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  -- Strict bounded envelope; no caller-provided plaintext/extra fields.
  IF p_secret IS NOT NULL AND (
    jsonb_typeof(p_secret) <> 'object' OR octet_length(p_secret::text) > 512
    OR NOT p_secret ?& ARRAY['version','algorithm','keyId','iv','tag','ciphertext']
    OR p_secret - ARRAY['version','algorithm','keyId','iv','tag','ciphertext'] <> '{}'::jsonb
    OR p_secret->'version' IS DISTINCT FROM '1'::jsonb
    OR p_secret->'algorithm' IS DISTINCT FROM '"AES-256-GCM"'::jsonb
    OR jsonb_typeof(p_secret->'keyId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_secret->'iv') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_secret->'tag') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_secret->'ciphertext') IS DISTINCT FROM 'string'
    OR p_secret->>'keyId' !~ '^[A-Za-z0-9_-]{1,32}$'
    OR p_secret->>'iv' !~ '^[A-Za-z0-9+/]{16}$'
    OR p_secret->>'tag' !~ '^[A-Za-z0-9+/]{22}==$'
    OR p_secret->>'ciphertext' !~ '^[A-Za-z0-9+/]{16,86}={0,2}$'
  ) THEN RAISE EXCEPTION 'SEB_PASSWORD_CONTEXT_INVALID' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.exam_seb_password_drafts (
    assignment_id, org_id, teacher_id, revision_id, revision, state, secret, updated_at, expires_at
  ) VALUES (
    p_assignment_id, v_org_id, p_actor_id, p_revision_id, p_expected_revision + 1,
    v_action, p_secret, now(), CASE WHEN p_secret IS NOT NULL THEN now() + interval '30 days' END
  ) ON CONFLICT (assignment_id) DO UPDATE SET
    org_id = EXCLUDED.org_id, teacher_id = EXCLUDED.teacher_id,
    revision_id = EXCLUDED.revision_id, revision = EXCLUDED.revision,
    state = EXCLUDED.state, secret = EXCLUDED.secret,
    updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at;
  INSERT INTO public.exam_seb_password_events (assignment_id, org_id, teacher_id, revision_id, revision, action)
    VALUES (p_assignment_id, v_org_id, p_actor_id, p_revision_id, p_expected_revision + 1, v_action);
  RETURN public.read_exam_seb_password_draft(p_assignment_id, p_actor_id);
END;
$$;

CREATE FUNCTION public.purge_expired_exam_seb_password_drafts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  WITH expired AS (
    UPDATE public.exam_seb_password_drafts SET secret = NULL, state = 'expired'
    WHERE state = 'saved' AND expires_at <= now()
    RETURNING assignment_id, org_id, teacher_id, revision_id, revision
  ) INSERT INTO public.exam_seb_password_events (assignment_id, org_id, teacher_id, revision_id, revision, action)
    SELECT assignment_id, org_id, teacher_id, revision_id, revision, 'expired' FROM expired;
  DELETE FROM public.exam_seb_password_events WHERE created_at <= now() - interval '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_exam_seb_password_owner(uuid, uuid),
  public.read_exam_seb_password_draft(uuid, uuid),
  public.write_exam_seb_password_draft(uuid, uuid, integer, uuid, jsonb),
  public.purge_expired_exam_seb_password_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_exam_seb_password_owner(uuid, uuid),
  public.read_exam_seb_password_draft(uuid, uuid),
  public.write_exam_seb_password_draft(uuid, uuid, integer, uuid, jsonb),
  public.purge_expired_exam_seb_password_drafts() TO service_role;

-- pg_cron is already a prerequisite in the existing proctor migrations.
SELECT cron.schedule('purge-expired-exam-seb-password-drafts', '37 3 * * *',
  'SELECT public.purge_expired_exam_seb_password_drafts();');
