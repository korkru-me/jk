-- IOC forms — phase 1: schema, tenancy, RLS and the expert-link model.
--
-- What an IOC form is, why it exists and how the arithmetic works is in
-- docs/EDUCATION_RESEARCH_IOC.md. Nothing in this migration is reachable from
-- the app yet: no route, no action and no UI ships with it.
--
-- Named `ioc_*` rather than `education_research_ioc_*` because a form does not
-- need a research project. The document the design came from is an ordinary
-- midterm, and teachers need this for exams that are nothing to do with
-- research, so `project_id` is nullable from the first day.
--
-- Two invariants are enforced below RLS, in triggers, because losing either one
-- would quietly invalidate a document an expert has already signed:
--   * once a form's items are frozen, its items and indicators cannot change;
--   * once an expert has submitted, their ratings cannot change until a
--     teacher deliberately reopens the form for them.

-- ── Forms ───────────────────────────────────────────────────────────────────

CREATE TABLE public.ioc_forms (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by                  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Optional links back to where the exam came from. All nullable: a form
  -- built from a folder of questions has none of them.
  classroom_id                uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  project_id                  uuid REFERENCES public.education_research_projects(id) ON DELETE SET NULL,
  measurement_id              uuid REFERENCES public.education_research_measurements(id) ON DELETE SET NULL,
  assignment_id               uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  source_kind                 text NOT NULL
    CHECK (source_kind IN ('research_measurement', 'assignment', 'question_selection')),

  -- Printed on the header of every page the experts receive.
  exam_title                  text NOT NULL CHECK (btrim(exam_title) <> ''),
  subject_name                text NOT NULL DEFAULT '',
  subject_code                text NOT NULL DEFAULT '',
  grade_level                 text NOT NULL DEFAULT '',
  term_label                  text NOT NULL DEFAULT '',
  academic_year               text NOT NULL DEFAULT '',
  school_name                 text NOT NULL DEFAULT '',
  author_name                 text NOT NULL CHECK (btrim(author_name) <> ''),
  author_position             text NOT NULL DEFAULT '',
  instruction_text            text NOT NULL DEFAULT '',

  -- The teacher's wording of the summary paragraph. The numbers inside it are
  -- always recomputed; this column holds only the prose around them.
  summary_text                text,
  summary_text_updated_at     timestamptz,

  threshold                   numeric(3,2) NOT NULL DEFAULT 0.50
    CHECK (threshold > 0 AND threshold <= 1),
  percent_rule                text NOT NULL DEFAULT 'items_passing'
    CHECK (percent_rule IN ('items_passing', 'mean_index')),
  -- Off by default: the frozen copy carries the answer key, and it must not
  -- reach an expert's browser unless the teacher asks for it.
  show_solutions              boolean NOT NULL DEFAULT false,

  author_signature_mode       text NOT NULL DEFAULT 'none'
    CHECK (author_signature_mode IN ('drawn', 'uploaded', 'typed', 'none')),
  author_signature_path       text,
  author_signature_consent_at timestamptz,

  status                      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'collecting', 'closed')),
  items_frozen_at             timestamptz,
  opened_at                   timestamptz,
  closed_at                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ioc_forms_source_columns CHECK (
    (source_kind = 'research_measurement' AND project_id IS NOT NULL AND measurement_id IS NOT NULL)
    OR (source_kind = 'assignment' AND assignment_id IS NOT NULL)
    OR (source_kind = 'question_selection')
  ),
  CONSTRAINT ioc_forms_signature_file CHECK (
    (author_signature_mode IN ('drawn', 'uploaded') AND author_signature_path IS NOT NULL)
    OR (author_signature_mode IN ('typed', 'none') AND author_signature_path IS NULL)
  ),
  -- A form can only start collecting once its exam copy has been frozen,
  -- so an expert can never be shown items that are still being edited.
  CONSTRAINT ioc_forms_collecting_needs_frozen_items CHECK (
    status = 'draft' OR items_frozen_at IS NOT NULL
  ),
  UNIQUE (id, org_id)
);

COMMENT ON TABLE public.ioc_forms IS
  'One IOC evaluation of one exam. Optionally tied to a research project or an assignment; standalone forms are supported.';
COMMENT ON COLUMN public.ioc_forms.threshold IS
  'Index at or above which an item counts as congruent. Compared with a half-display-step tolerance in lib/ioc.ts.';
COMMENT ON COLUMN public.ioc_forms.show_solutions IS
  'When false the server must not send solutions to an expert browser at all, rather than hiding them client-side.';
COMMENT ON COLUMN public.ioc_forms.items_frozen_at IS
  'Set when expert links are issued. After this the items and indicators are immutable, so a signed document cannot change underneath its signature.';

CREATE INDEX idx_ioc_forms_org_created ON public.ioc_forms(org_id, created_at DESC);
CREATE INDEX idx_ioc_forms_created_by ON public.ioc_forms(created_by, created_at DESC);
CREATE INDEX idx_ioc_forms_classroom ON public.ioc_forms(classroom_id) WHERE classroom_id IS NOT NULL;
CREATE INDEX idx_ioc_forms_project ON public.ioc_forms(project_id) WHERE project_id IS NOT NULL;

-- ── Indicators ──────────────────────────────────────────────────────────────

-- A single indicator usually covers many items, and the printed table merges
-- those rows into one cell. Holding indicators separately is what lets the
-- document merge them, and stops the same wording being retyped per item.
CREATE TABLE public.ioc_form_standards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id      uuid NOT NULL,
  order_index  integer NOT NULL CHECK (order_index > 0),
  code         text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ioc_form_standards_form_scope
    FOREIGN KEY (form_id, org_id) REFERENCES public.ioc_forms(id, org_id) ON DELETE CASCADE,
  CONSTRAINT ioc_form_standards_not_blank CHECK (btrim(code) <> '' OR btrim(description) <> ''),
  UNIQUE (form_id, order_index),
  UNIQUE (id, form_id, org_id)
);

COMMENT ON TABLE public.ioc_form_standards IS
  'Learning standards/indicators a form evaluates against. Items point at these so one indicator can span many rows of the printed table.';

CREATE INDEX idx_ioc_form_standards_form ON public.ioc_form_standards(form_id, order_index);

-- ── Items ───────────────────────────────────────────────────────────────────

CREATE TABLE public.ioc_form_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id            uuid NOT NULL,
  standard_id        uuid,
  order_index        integer NOT NULL CHECK (order_index > 0),
  -- What is printed in the "ข้อที่" column, which is not always the position:
  -- a form can start at 11, or carry a label the paper already used.
  item_label         text NOT NULL CHECK (btrim(item_label) <> ''),
  section_label      text NOT NULL DEFAULT '',
  -- A stem shared by several consecutive items, printed above the first of them.
  group_intro        text NOT NULL DEFAULT '',
  prompt             text NOT NULL,
  choices            jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_urls         text[] NOT NULL DEFAULT '{}',
  -- Frozen alongside the prompt so an export can include it when the teacher
  -- turned show_solutions on, without going back to a question that may since
  -- have been edited.
  solution           text,
  source_question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ioc_form_items_form_scope
    FOREIGN KEY (form_id, org_id) REFERENCES public.ioc_forms(id, org_id) ON DELETE CASCADE,
  CONSTRAINT ioc_form_items_standard_scope
    FOREIGN KEY (standard_id, form_id, org_id)
    REFERENCES public.ioc_form_standards(id, form_id, org_id) ON DELETE SET NULL,
  CONSTRAINT ioc_form_items_choices_shape CHECK (jsonb_typeof(choices) = 'array'),
  UNIQUE (form_id, order_index),
  UNIQUE (id, form_id, org_id)
);

COMMENT ON TABLE public.ioc_form_items IS
  'The frozen copy of each exam item as the experts judged it. Editing the source question later does not change these rows.';
COMMENT ON COLUMN public.ioc_form_items.standard_id IS
  'Null until the teacher assigns an indicator. A form cannot be opened for experts with any item still null.';

CREATE INDEX idx_ioc_form_items_form ON public.ioc_form_items(form_id, order_index);
CREATE INDEX idx_ioc_form_items_standard ON public.ioc_form_items(standard_id) WHERE standard_id IS NOT NULL;

-- ── Experts and their links ─────────────────────────────────────────────────

CREATE TABLE public.ioc_form_experts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id              uuid NOT NULL,
  -- Prints as "ผู้ประเมินคนที่ N" on the signature page and orders the summary.
  expert_order         integer NOT NULL CHECK (expert_order > 0),
  display_name         text NOT NULL CHECK (btrim(display_name) <> ''),
  position_title       text NOT NULL DEFAULT '',
  affiliation          text NOT NULL DEFAULT '',

  -- Only the SHA-256 of the link token is stored. A database dump therefore
  -- contains no usable link, and lookup hashes what the visitor presents.
  token_hash           text,
  token_issued_at      timestamptz,
  token_expires_at     timestamptz,
  revoked_at           timestamptz,

  status               text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'opened', 'submitted')),
  first_opened_at      timestamptz,
  last_opened_at       timestamptz,
  submitted_at         timestamptz,
  reopened_at          timestamptz,
  overall_comment      text NOT NULL DEFAULT '',

  signature_mode       text NOT NULL DEFAULT 'none'
    CHECK (signature_mode IN ('drawn', 'uploaded', 'typed', 'none')),
  signature_path       text,
  signature_consent_at timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ioc_form_experts_form_scope
    FOREIGN KEY (form_id, org_id) REFERENCES public.ioc_forms(id, org_id) ON DELETE CASCADE,
  CONSTRAINT ioc_form_experts_token_hash_format
    CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  -- A token without an expiry would be a link that never dies.
  CONSTRAINT ioc_form_experts_token_window CHECK (
    (token_hash IS NULL AND token_expires_at IS NULL AND token_issued_at IS NULL)
    OR (token_hash IS NOT NULL AND token_expires_at IS NOT NULL AND token_issued_at IS NOT NULL)
  ),
  -- Submitting stamps a time; reopening does not erase it, so that a form
  -- reopened for one expert still records when they first signed off.
  CONSTRAINT ioc_form_experts_submitted_at CHECK (
    status <> 'submitted' OR submitted_at IS NOT NULL
  ),
  CONSTRAINT ioc_form_experts_signature_file CHECK (
    (signature_mode IN ('drawn', 'uploaded') AND signature_path IS NOT NULL)
    OR (signature_mode IN ('typed', 'none') AND signature_path IS NULL)
  ),
  UNIQUE (form_id, expert_order),
  UNIQUE (id, form_id, org_id)
);

COMMENT ON TABLE public.ioc_form_experts IS
  'One reviewer of one form, with their own link. Experts are not KorKru users and never sign in.';
COMMENT ON COLUMN public.ioc_form_experts.token_hash IS
  'SHA-256 hex of the link token. The token itself exists only in the URL the teacher sends.';

-- A presented token is hashed and looked up here, so the index has to be
-- unique across every form, not only within one.
CREATE UNIQUE INDEX idx_ioc_form_experts_token_hash
  ON public.ioc_form_experts(token_hash)
  WHERE token_hash IS NOT NULL;
CREATE INDEX idx_ioc_form_experts_form ON public.ioc_form_experts(form_id, expert_order);

-- ── Ratings ─────────────────────────────────────────────────────────────────

CREATE TABLE public.ioc_ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id    uuid NOT NULL,
  expert_id  uuid NOT NULL,
  item_id    uuid NOT NULL,
  score      smallint NOT NULL CHECK (score BETWEEN -1 AND 1),
  comment    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ioc_ratings_expert_scope
    FOREIGN KEY (expert_id, form_id, org_id)
    REFERENCES public.ioc_form_experts(id, form_id, org_id) ON DELETE CASCADE,
  CONSTRAINT ioc_ratings_item_scope
    FOREIGN KEY (item_id, form_id, org_id)
    REFERENCES public.ioc_form_items(id, form_id, org_id) ON DELETE CASCADE,
  -- One judgement per expert per item. lib/ioc.ts refuses to average a
  -- duplicate rather than silently counting one opinion twice.
  UNIQUE (expert_id, item_id)
);

COMMENT ON TABLE public.ioc_ratings IS
  'One expert score (+1 / 0 / -1) on one item, with an optional suggestion. A missing judgement is a missing row, never a zero.';

CREATE INDEX idx_ioc_ratings_form ON public.ioc_ratings(form_id);
CREATE INDEX idx_ioc_ratings_item ON public.ioc_ratings(item_id);

-- ── Audit ───────────────────────────────────────────────────────────────────

CREATE TABLE public.ioc_form_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id       uuid NOT NULL REFERENCES public.ioc_forms(id) ON DELETE CASCADE,
  expert_id     uuid REFERENCES public.ioc_form_experts(id) ON DELETE SET NULL,
  event_type    text NOT NULL CHECK (event_type IN (
    'form_opened',
    'form_closed',
    'link_issued',
    'link_reissued',
    'link_revoked',
    'link_extended',
    'expert_opened',
    'expert_submitted',
    'expert_reopened',
    'document_exported'
  )),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ioc_form_events_detail_shape CHECK (jsonb_typeof(detail) = 'object')
);

COMMENT ON TABLE public.ioc_form_events IS
  'Append-only record of who did what to a form and when. Must never contain a link token, a signature, or any student data.';

CREATE INDEX idx_ioc_form_events_form_time ON public.ioc_form_events(form_id, created_at DESC);
CREATE INDEX idx_ioc_form_events_org_time ON public.ioc_form_events(org_id, created_at DESC);

-- ── Freshness ───────────────────────────────────────────────────────────────

CREATE TRIGGER ioc_forms_updated_at
  BEFORE UPDATE ON public.ioc_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ioc_form_standards_updated_at
  BEFORE UPDATE ON public.ioc_form_standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ioc_form_items_updated_at
  BEFORE UPDATE ON public.ioc_form_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ioc_form_experts_updated_at
  BEFORE UPDATE ON public.ioc_form_experts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ioc_ratings_updated_at
  BEFORE UPDATE ON public.ioc_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Immutability ────────────────────────────────────────────────────────────

-- Items and indicators stop being editable the moment expert links exist.
-- Enforced here rather than in the application because the expert-facing
-- write path runs with the service role, which RLS does not constrain.
CREATE FUNCTION public.protect_frozen_ioc_form_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_id uuid;
  v_frozen_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_form_id := OLD.form_id;
  ELSE
    v_form_id := NEW.form_id;
  END IF;

  SELECT items_frozen_at INTO v_frozen_at
  FROM public.ioc_forms
  WHERE id = v_form_id;

  -- No parent row means the form itself is being deleted and this is the
  -- cascade: the referential action runs after the parent is gone, so the
  -- lookup finds nothing. Deleting a whole form must stay possible; it is
  -- changing a frozen one in place that must not be.
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF v_frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'ioc form % is frozen: its items and indicators cannot change', v_form_id
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ioc_form_items_protect_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.ioc_form_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_frozen_ioc_form_content();

CREATE TRIGGER ioc_form_standards_protect_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.ioc_form_standards
  FOR EACH ROW EXECUTE FUNCTION public.protect_frozen_ioc_form_content();

-- A submitted expert's ratings are the evidence behind their signature.
-- Changing them requires the teacher to reopen the form for that expert
-- first, which moves them back to 'opened' and is recorded as an event.
CREATE FUNCTION public.protect_submitted_ioc_ratings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expert_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_expert_id := OLD.expert_id;
  ELSE
    v_expert_id := NEW.expert_id;
  END IF;

  SELECT status INTO v_status
  FROM public.ioc_form_experts
  WHERE id = v_expert_id;

  -- Same cascade rule as the frozen-content guard: if the expert row is
  -- already gone, this delete is the referential action behind removing the
  -- expert or the whole form, and has to be allowed through.
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF v_status = 'submitted' THEN
    RAISE EXCEPTION 'expert % has submitted: reopen the form for them before changing ratings', v_expert_id
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ioc_ratings_protect_submitted
  BEFORE INSERT OR UPDATE OR DELETE ON public.ioc_ratings
  FOR EACH ROW EXECUTE FUNCTION public.protect_submitted_ioc_ratings();

-- ── Authorization ───────────────────────────────────────────────────────────

-- Deliberately not reusing can_manage_education_research_classroom: that one
-- also requires an active subject classroom, which an IOC form for a plain
-- midterm may not have at all.
CREATE FUNCTION public.can_manage_ioc_form(
  p_form_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.ioc_forms f
    WHERE f.id = p_form_id
      AND f.org_id = p_org_id
      AND (
        f.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.classrooms c
          WHERE c.id = f.classroom_id
            AND c.org_id = f.org_id
            AND (
              c.teacher_id = (SELECT auth.uid())
              OR EXISTS (
                SELECT 1
                FROM public.classroom_co_teachers ct
                WHERE ct.classroom_id = c.id
                  AND ct.user_id = (SELECT auth.uid())
                  AND ct.permission IN ('admin', 'manage')
              )
            )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_ioc_form(uuid, uuid) IS
  'A form is managed by its creator, by the teacher or managing co-teachers of a linked classroom, or by a super admin.';

REVOKE ALL ON FUNCTION public.can_manage_ioc_form(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ioc_form(uuid, uuid) TO authenticated;

ALTER TABLE public.ioc_forms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ioc_form_standards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ioc_form_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ioc_form_experts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ioc_ratings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ioc_form_events     ENABLE ROW LEVEL SECURITY;

CREATE POLICY ioc_forms_select ON public.ioc_forms
  FOR SELECT TO authenticated
  USING (public.can_manage_ioc_form(id, org_id));

CREATE POLICY ioc_forms_insert ON public.ioc_forms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND org_id = ANY (public.get_user_org_ids())
  );

CREATE POLICY ioc_forms_update ON public.ioc_forms
  FOR UPDATE TO authenticated
  USING (public.can_manage_ioc_form(id, org_id))
  WITH CHECK (public.can_manage_ioc_form(id, org_id));

CREATE POLICY ioc_forms_delete ON public.ioc_forms
  FOR DELETE TO authenticated
  USING (public.can_manage_ioc_form(id, org_id));

CREATE POLICY ioc_form_standards_all ON public.ioc_form_standards
  FOR ALL TO authenticated
  USING (public.can_manage_ioc_form(form_id, org_id))
  WITH CHECK (public.can_manage_ioc_form(form_id, org_id));

CREATE POLICY ioc_form_items_all ON public.ioc_form_items
  FOR ALL TO authenticated
  USING (public.can_manage_ioc_form(form_id, org_id))
  WITH CHECK (public.can_manage_ioc_form(form_id, org_id));

CREATE POLICY ioc_form_experts_all ON public.ioc_form_experts
  FOR ALL TO authenticated
  USING (public.can_manage_ioc_form(form_id, org_id))
  WITH CHECK (public.can_manage_ioc_form(form_id, org_id));

-- Teachers read ratings; the writes come from the expert link, which runs as
-- the service role after the server has checked the token.
CREATE POLICY ioc_ratings_select ON public.ioc_ratings
  FOR SELECT TO authenticated
  USING (public.can_manage_ioc_form(form_id, org_id));

CREATE POLICY ioc_form_events_select ON public.ioc_form_events
  FOR SELECT TO authenticated
  USING (public.can_manage_ioc_form(form_id, org_id));

-- ── Privileges ──────────────────────────────────────────────────────────────

-- No IOC table is reachable by an unauthenticated session. The expert link
-- works through the service role behind a token check, exactly like the
-- classroom invitation flow, so there is no anon policy anywhere here.
REVOKE ALL ON TABLE public.ioc_forms          FROM anon;
REVOKE ALL ON TABLE public.ioc_form_standards FROM anon;
REVOKE ALL ON TABLE public.ioc_form_items     FROM anon;
REVOKE ALL ON TABLE public.ioc_form_experts   FROM anon;
REVOKE ALL ON TABLE public.ioc_ratings        FROM anon;
REVOKE ALL ON TABLE public.ioc_form_events    FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ioc_forms          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ioc_form_standards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ioc_form_items     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ioc_form_experts   TO authenticated;
GRANT SELECT ON TABLE public.ioc_ratings     TO authenticated;
GRANT SELECT ON TABLE public.ioc_form_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.ioc_form_events FROM authenticated;

-- ── Audit writer ────────────────────────────────────────────────────────────

-- Called only after a route has already authorized the action. It repeats the
-- form lookup with the passed actor instead of trusting that check alone.
CREATE FUNCTION public.record_ioc_form_event(
  p_form_id uuid,
  p_event_type text,
  p_actor_id uuid DEFAULT NULL,
  p_expert_id uuid DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_event_id bigint;
BEGIN
  IF p_form_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'invalid ioc form event' USING ERRCODE = '22023';
  END IF;

  IF p_detail IS NULL OR jsonb_typeof(p_detail) <> 'object' THEN
    RAISE EXCEPTION 'ioc form event detail must be a json object' USING ERRCODE = '22023';
  END IF;

  -- A token or a signature in the audit trail would defeat the point of
  -- hashing one and keeping the other in a private bucket.
  IF p_detail ? 'token' OR p_detail ? 'token_hash' OR p_detail ? 'signature' THEN
    RAISE EXCEPTION 'ioc form event detail must not carry a token or signature' USING ERRCODE = '22023';
  END IF;

  SELECT org_id INTO v_org_id FROM public.ioc_forms WHERE id = p_form_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ioc form % does not exist', p_form_id USING ERRCODE = '23503';
  END IF;

  IF p_expert_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ioc_form_experts
    WHERE id = p_expert_id AND form_id = p_form_id
  ) THEN
    RAISE EXCEPTION 'expert % does not belong to ioc form %', p_expert_id, p_form_id
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.ioc_form_events (org_id, form_id, expert_id, event_type, actor_user_id, detail)
  VALUES (v_org_id, p_form_id, p_expert_id, p_event_type, p_actor_id, p_detail)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ioc_form_event(uuid, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ioc_form_event(uuid, text, uuid, uuid, jsonb) TO service_role;

-- ── Signature storage ───────────────────────────────────────────────────────

-- Private bucket with no policies for anon or authenticated: signatures are
-- written by the server after a token or session check, and read back through
-- a signed URL when a document is rendered.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ioc-signatures', 'ioc-signatures', false, 262144, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
