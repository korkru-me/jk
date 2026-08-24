-- Education research phase 2.3: real score collection, online-score sync,
-- manual drafts, and an auditable all-or-nothing Excel import workflow.
-- Uploaded workbooks are parsed in memory by the application; the database
-- stores normalized preview rows and audit metadata, never the source file.

CREATE TABLE public.education_research_score_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL,
  measurement_id  uuid NOT NULL,
  raw_score       numeric(10,4) NOT NULL CHECK (raw_score >= 0),
  saved_by        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (participant_id, project_id, org_id)
    REFERENCES public.education_research_participants(id, project_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (measurement_id, project_id, org_id)
    REFERENCES public.education_research_measurements(id, project_id, org_id) ON DELETE CASCADE,
  UNIQUE (project_id, participant_id, measurement_id, saved_by)
);

CREATE INDEX idx_education_research_score_drafts_owner
  ON public.education_research_score_drafts(project_id, saved_by);

CREATE TABLE public.education_research_import_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  version     integer NOT NULL CHECK (version > 0),
  created_by  uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  UNIQUE (id, project_id, org_id)
);

CREATE INDEX idx_education_research_import_templates_project
  ON public.education_research_import_templates(project_id, created_at DESC);

CREATE TABLE public.education_research_import_template_rows (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id             uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  template_id            uuid NOT NULL,
  participant_id         uuid NOT NULL,
  row_token              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  roster_order_snapshot  integer,
  student_code_snapshot  text,
  full_name_snapshot     text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_id, project_id, org_id)
    REFERENCES public.education_research_import_templates(id, project_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id, project_id, org_id)
    REFERENCES public.education_research_participants(id, project_id, org_id) ON DELETE CASCADE,
  UNIQUE (template_id, participant_id)
);

CREATE INDEX idx_education_research_import_template_rows_template
  ON public.education_research_import_template_rows(template_id);

CREATE TABLE public.education_research_import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  template_id    uuid NOT NULL,
  file_name      text NOT NULL CHECK (btrim(file_name) <> ''),
  status         text NOT NULL DEFAULT 'previewed'
    CHECK (status IN ('previewed', 'invalid', 'confirmed', 'cancelled')),
  row_count      integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  ready_count    integer NOT NULL DEFAULT 0 CHECK (ready_count >= 0),
  warning_count  integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_count    integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_by     uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  confirmed_by   uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_id, project_id, org_id)
    REFERENCES public.education_research_import_templates(id, project_id, org_id) ON DELETE RESTRICT,
  UNIQUE (id, project_id, org_id)
);

CREATE INDEX idx_education_research_import_batches_project
  ON public.education_research_import_batches(project_id, created_at DESC);

CREATE TABLE public.education_research_import_batch_rows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  batch_id              uuid NOT NULL,
  participant_id        uuid,
  row_number            integer NOT NULL CHECK (row_number > 0),
  row_token_text        text,
  student_code_file     text,
  full_name_file        text,
  note_file             text CHECK (note_file IS NULL OR char_length(note_file) <= 500),
  incoming_pretest      numeric(10,4),
  incoming_posttest     numeric(10,4),
  current_pretest       numeric(10,4),
  current_posttest      numeric(10,4),
  pretest_action        text CHECK (pretest_action IN ('add', 'update', 'unchanged', 'blank')),
  posttest_action       text CHECK (posttest_action IN ('add', 'update', 'unchanged', 'blank')),
  validation_status     text NOT NULL CHECK (validation_status IN ('ready', 'warning', 'error')),
  messages              text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (batch_id, project_id, org_id)
    REFERENCES public.education_research_import_batches(id, project_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id, project_id, org_id)
    REFERENCES public.education_research_participants(id, project_id, org_id) ON DELETE RESTRICT,
  UNIQUE (batch_id, row_number)
);

CREATE UNIQUE INDEX idx_education_research_import_batch_rows_participant
  ON public.education_research_import_batch_rows(batch_id, participant_id)
  WHERE participant_id IS NOT NULL;

CREATE INDEX idx_education_research_import_batch_rows_batch
  ON public.education_research_import_batch_rows(batch_id, validation_status, row_number);

CREATE TRIGGER education_research_score_drafts_updated_at
  BEFORE UPDATE ON public.education_research_score_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.education_research_score_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_import_template_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_import_batch_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY education_research_score_drafts_select
  ON public.education_research_score_drafts
  FOR SELECT TO authenticated
  USING (
    saved_by = (SELECT auth.uid())
    AND public.can_manage_education_research_project(project_id, org_id)
  );

CREATE POLICY education_research_import_templates_select
  ON public.education_research_import_templates
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_import_template_rows_select
  ON public.education_research_import_template_rows
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_import_batches_select
  ON public.education_research_import_batches
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_import_batch_rows_select
  ON public.education_research_import_batch_rows
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

-- A submitted/graded KorKru attempt is the source of truth for an online
-- research score. The trigger also propagates a teacher re-grade.
CREATE FUNCTION public.sync_education_research_score_from_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  measurement_row public.education_research_measurements%ROWTYPE;
  participant_row public.education_research_participants%ROWTYPE;
  actor_id uuid := COALESCE((SELECT auth.uid()), NEW.student_id);
BEGIN
  IF NEW.status NOT IN ('submitted', 'graded')
    OR NEW.total_score IS NULL
    OR NEW.max_score IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT * INTO measurement_row
  FROM public.education_research_measurements m
  WHERE m.assignment_id = NEW.assignment_id
    AND m.source_type = 'korkru_exam';

  IF measurement_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO participant_row
  FROM public.education_research_participants p
  WHERE p.project_id = measurement_row.project_id
    AND p.org_id = measurement_row.org_id
    AND p.student_id = NEW.student_id;

  IF participant_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS DISTINCT FROM measurement_row.org_id
    OR NEW.max_score IS DISTINCT FROM measurement_row.max_score
  THEN
    RAISE EXCEPTION 'submitted research attempt does not match the configured project score scale';
  END IF;

  INSERT INTO public.education_research_scores (
    org_id, project_id, participant_id, measurement_id,
    raw_score, max_score, score_source, submission_id,
    recorded_by, updated_by, change_reason
  ) VALUES (
    measurement_row.org_id, measurement_row.project_id,
    participant_row.id, measurement_row.id,
    NEW.total_score, NEW.max_score, 'korkru_exam', NEW.id,
    actor_id, actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'ซิงก์จากการส่งข้อสอบ KorKru' ELSE 'ซิงก์จากผลข้อสอบ KorKru ที่อัปเดต' END
  )
  ON CONFLICT (participant_id, measurement_id) DO UPDATE SET
    raw_score = EXCLUDED.raw_score,
    max_score = EXCLUDED.max_score,
    score_source = EXCLUDED.score_source,
    submission_id = EXCLUDED.submission_id,
    updated_by = EXCLUDED.updated_by,
    change_reason = EXCLUDED.change_reason
  WHERE education_research_scores.raw_score IS DISTINCT FROM EXCLUDED.raw_score
     OR education_research_scores.max_score IS DISTINCT FROM EXCLUDED.max_score
     OR education_research_scores.submission_id IS DISTINCT FROM EXCLUDED.submission_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER submissions_sync_education_research_score
  AFTER INSERT OR UPDATE OF status, total_score, max_score ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_education_research_score_from_submission();

CREATE FUNCTION public.require_education_research_score_change_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.raw_score IS DISTINCT FROM NEW.raw_score
    AND NEW.score_source IN ('manual', 'excel')
    AND btrim(COALESCE(NEW.change_reason, '')) = ''
  THEN
    RAISE EXCEPTION 'a reason is required when changing an existing research score';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER education_research_scores_require_change_reason
  BEFORE UPDATE ON public.education_research_scores
  FOR EACH ROW EXECUTE FUNCTION public.require_education_research_score_change_reason();

-- Backfill attempts that finished before this trigger was installed.
INSERT INTO public.education_research_scores (
  org_id, project_id, participant_id, measurement_id,
  raw_score, max_score, score_source, submission_id,
  recorded_by, updated_by, change_reason
)
SELECT
  m.org_id, m.project_id, p.id, m.id,
  s.total_score, s.max_score, 'korkru_exam', s.id,
  s.student_id, s.student_id, 'ซิงก์คะแนนข้อสอบ KorKru ย้อนหลัง'
FROM public.education_research_measurements m
JOIN public.submissions s
  ON s.assignment_id = m.assignment_id
 AND s.org_id = m.org_id
 AND s.status IN ('submitted', 'graded')
 AND s.total_score IS NOT NULL
 AND s.max_score = m.max_score
JOIN public.education_research_participants p
  ON p.project_id = m.project_id
 AND p.org_id = m.org_id
 AND p.student_id = s.student_id
WHERE m.source_type = 'korkru_exam'
ON CONFLICT (participant_id, measurement_id) DO UPDATE SET
  raw_score = EXCLUDED.raw_score,
  max_score = EXCLUDED.max_score,
  score_source = EXCLUDED.score_source,
  submission_id = EXCLUDED.submission_id,
  updated_by = EXCLUDED.updated_by,
  change_reason = EXCLUDED.change_reason
WHERE education_research_scores.raw_score IS DISTINCT FROM EXCLUDED.raw_score
   OR education_research_scores.max_score IS DISTINCT FROM EXCLUDED.max_score
   OR education_research_scores.submission_id IS DISTINCT FROM EXCLUDED.submission_id;

CREATE FUNCTION public.save_education_research_manual_draft(
  p_project_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  project_org uuid;
  item jsonb;
  participant_id_value uuid;
  measurement_id_value uuid;
  score_value numeric;
  max_value numeric;
  saved_count integer := 0;
BEGIN
  SELECT p.org_id INTO project_org
  FROM public.education_research_projects p
  WHERE p.id = p_project_id;

  IF caller_id IS NULL OR project_org IS NULL
    OR NOT public.can_manage_education_research_project(p_project_id, project_org)
  THEN
    RAISE EXCEPTION 'not allowed to save research score draft';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'invalid research score draft payload';
  END IF;

  -- Validate every row before clearing the previous draft.
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    participant_id_value := (item->>'participant_id')::uuid;
    measurement_id_value := (item->>'measurement_id')::uuid;
    score_value := (item->>'raw_score')::numeric;

    SELECT m.max_score INTO max_value
    FROM public.education_research_measurements m
    JOIN public.education_research_participants p
      ON p.id = participant_id_value
     AND p.project_id = m.project_id
     AND p.org_id = m.org_id
    WHERE m.id = measurement_id_value
      AND m.project_id = p_project_id
      AND m.org_id = project_org
      AND m.source_type = 'manual';

    IF max_value IS NULL OR score_value < 0 OR score_value > max_value THEN
      RAISE EXCEPTION 'manual draft score is outside the configured range';
    END IF;
  END LOOP;

  DELETE FROM public.education_research_score_drafts
  WHERE project_id = p_project_id AND saved_by = caller_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.education_research_score_drafts (
      org_id, project_id, participant_id, measurement_id, raw_score, saved_by
    ) VALUES (
      project_org, p_project_id,
      (item->>'participant_id')::uuid,
      (item->>'measurement_id')::uuid,
      (item->>'raw_score')::numeric,
      caller_id
    );
    saved_count := saved_count + 1;
  END LOOP;

  RETURN saved_count;
END;
$$;

CREATE FUNCTION public.confirm_education_research_manual_scores(
  p_project_id uuid,
  p_rows jsonb,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  project_org uuid;
  item jsonb;
  participant_id_value uuid;
  measurement_id_value uuid;
  score_value numeric;
  max_value numeric;
  saved_count integer := 0;
  existing_score numeric;
BEGIN
  SELECT p.org_id INTO project_org
  FROM public.education_research_projects p
  WHERE p.id = p_project_id;

  IF caller_id IS NULL OR project_org IS NULL
    OR NOT public.can_manage_education_research_project(p_project_id, project_org)
  THEN
    RAISE EXCEPTION 'not allowed to record research scores';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'invalid research score payload';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    participant_id_value := (item->>'participant_id')::uuid;
    measurement_id_value := (item->>'measurement_id')::uuid;
    score_value := (item->>'raw_score')::numeric;

    SELECT m.max_score INTO max_value
    FROM public.education_research_measurements m
    JOIN public.education_research_participants p
      ON p.id = participant_id_value
     AND p.project_id = m.project_id
     AND p.org_id = m.org_id
    WHERE m.id = measurement_id_value
      AND m.project_id = p_project_id
      AND m.org_id = project_org
      AND m.source_type = 'manual';

    SELECT s.raw_score INTO existing_score
    FROM public.education_research_scores s
    WHERE s.participant_id = participant_id_value
      AND s.measurement_id = measurement_id_value;

    IF max_value IS NULL OR score_value < 0 OR score_value > max_value THEN
      RAISE EXCEPTION 'manual research score is outside the configured range';
    END IF;
    IF existing_score IS NOT NULL
      AND existing_score IS DISTINCT FROM score_value
      AND btrim(COALESCE(p_reason, '')) = ''
    THEN
      RAISE EXCEPTION 'a reason is required when overwriting an existing score';
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    participant_id_value := (item->>'participant_id')::uuid;
    measurement_id_value := (item->>'measurement_id')::uuid;
    score_value := (item->>'raw_score')::numeric;
    SELECT m.max_score INTO max_value
    FROM public.education_research_measurements m
    WHERE m.id = measurement_id_value;

    INSERT INTO public.education_research_scores (
      org_id, project_id, participant_id, measurement_id,
      raw_score, max_score, score_source, recorded_by, updated_by, change_reason
    ) VALUES (
      project_org, p_project_id, participant_id_value, measurement_id_value,
      score_value, max_value, 'manual', caller_id, caller_id,
      NULLIF(btrim(COALESCE(p_reason, '')), '')
    )
    ON CONFLICT (participant_id, measurement_id) DO UPDATE SET
      raw_score = EXCLUDED.raw_score,
      max_score = EXCLUDED.max_score,
      updated_by = EXCLUDED.updated_by,
      change_reason = EXCLUDED.change_reason
    WHERE education_research_scores.raw_score IS DISTINCT FROM EXCLUDED.raw_score
       OR education_research_scores.max_score IS DISTINCT FROM EXCLUDED.max_score;
    saved_count := saved_count + 1;
  END LOOP;

  DELETE FROM public.education_research_score_drafts
  WHERE project_id = p_project_id AND saved_by = caller_id;

  RETURN saved_count;
END;
$$;

CREATE FUNCTION public.create_education_research_import_template(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  project_org uuid;
  template_id_value uuid;
  next_version integer;
BEGIN
  SELECT p.org_id INTO project_org
  FROM public.education_research_projects p
  WHERE p.id = p_project_id;

  IF caller_id IS NULL OR project_org IS NULL
    OR NOT public.can_manage_education_research_project(p_project_id, project_org)
  THEN
    RAISE EXCEPTION 'not allowed to create a research import template';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.education_research_measurements m
    WHERE m.project_id = p_project_id AND m.source_type = 'excel'
  ) THEN
    RAISE EXCEPTION 'this project has no Excel score source';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));
  SELECT COALESCE(MAX(t.version), 0) + 1 INTO next_version
  FROM public.education_research_import_templates t
  WHERE t.project_id = p_project_id;

  INSERT INTO public.education_research_import_templates (
    org_id, project_id, version, created_by
  ) VALUES (
    project_org, p_project_id, next_version, caller_id
  ) RETURNING id INTO template_id_value;

  INSERT INTO public.education_research_import_template_rows (
    org_id, project_id, template_id, participant_id,
    roster_order_snapshot, student_code_snapshot, full_name_snapshot
  )
  SELECT
    p.org_id, p.project_id, template_id_value, p.id,
    p.roster_order, sp.student_code, u.full_name
  FROM public.education_research_participants p
  JOIN public.users u ON u.id = p.student_id
  LEFT JOIN public.student_profiles sp ON sp.student_id = p.student_id
  WHERE p.project_id = p_project_id
  ORDER BY p.roster_order NULLS LAST, u.full_name, p.student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'the project has no research participants';
  END IF;

  RETURN template_id_value;
END;
$$;

CREATE FUNCTION public.create_education_research_import_batch(
  p_project_id uuid,
  p_template_id uuid,
  p_file_name text,
  p_rows jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  project_org uuid;
  batch_id_value uuid;
  item jsonb;
  template_row public.education_research_import_template_rows%ROWTYPE;
  current_participant record;
  row_number_value integer;
  pretest_value numeric;
  posttest_value numeric;
  current_pretest_value numeric;
  current_posttest_value numeric;
  pretest_max numeric;
  posttest_max numeric;
  pretest_source text;
  posttest_source text;
  pretest_action_value text;
  posttest_action_value text;
  status_value text;
  messages_value text[];
  parse_messages text[];
  seen_tokens text[] := '{}';
  ready_total integer := 0;
  warning_total integer := 0;
  error_total integer := 0;
  row_total integer := 0;
  token_text text;
BEGIN
  SELECT p.org_id INTO project_org
  FROM public.education_research_projects p
  WHERE p.id = p_project_id;

  IF caller_id IS NULL OR project_org IS NULL
    OR NOT public.can_manage_education_research_project(p_project_id, project_org)
  THEN
    RAISE EXCEPTION 'not allowed to preview a research score import';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.education_research_import_templates t
    WHERE t.id = p_template_id
      AND t.project_id = p_project_id
      AND t.org_id = project_org
  ) THEN
    RAISE EXCEPTION 'the workbook template does not belong to this project';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) = 0
    OR jsonb_array_length(p_rows) > 2000
  THEN
    RAISE EXCEPTION 'the workbook contains an invalid number of rows';
  END IF;

  SELECT
    MAX(m.max_score) FILTER (WHERE m.measurement_type = 'pretest'),
    MAX(m.max_score) FILTER (WHERE m.measurement_type = 'posttest'),
    MAX(m.source_type) FILTER (WHERE m.measurement_type = 'pretest'),
    MAX(m.source_type) FILTER (WHERE m.measurement_type = 'posttest')
  INTO pretest_max, posttest_max, pretest_source, posttest_source
  FROM public.education_research_measurements m
  WHERE m.project_id = p_project_id;

  INSERT INTO public.education_research_import_batches (
    org_id, project_id, template_id, file_name, created_by
  ) VALUES (
    project_org, p_project_id, p_template_id,
    left(btrim(COALESCE(p_file_name, 'scores.xlsx')), 255), caller_id
  ) RETURNING id INTO batch_id_value;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    row_total := row_total + 1;
    row_number_value := COALESCE((item->>'row_number')::integer, row_total + 7);
    token_text := NULLIF(btrim(COALESCE(item->>'row_token', '')), '');
    messages_value := '{}';
    parse_messages := ARRAY(
      SELECT value FROM jsonb_array_elements_text(COALESCE(item->'parse_errors', '[]'::jsonb))
    );
    messages_value := messages_value || COALESCE(parse_messages, '{}');

    template_row := NULL;
    IF token_text IS NULL THEN
      messages_value := array_append(messages_value, 'ไม่พบรหัสแถวของแม่แบบ');
    ELSIF token_text = ANY(seen_tokens) THEN
      messages_value := array_append(messages_value, 'รหัสแถวซ้ำในไฟล์');
    ELSE
      seen_tokens := array_append(seen_tokens, token_text);
      SELECT tr.* INTO template_row
      FROM public.education_research_import_template_rows tr
      WHERE tr.template_id = p_template_id
        AND tr.row_token::text = token_text;
      IF template_row.id IS NULL THEN
        messages_value := array_append(messages_value, 'รหัสแถวไม่ใช่ของแม่แบบโครงการนี้');
      END IF;
    END IF;

    IF template_row.id IS NOT NULL THEN
      IF btrim(COALESCE(item->>'full_name', '')) IS DISTINCT FROM template_row.full_name_snapshot THEN
        messages_value := array_append(messages_value, 'ชื่อ–นามสกุลถูกแก้จากแม่แบบ');
      END IF;
      IF btrim(COALESCE(item->>'student_code', '')) IS DISTINCT FROM btrim(COALESCE(template_row.student_code_snapshot, '')) THEN
        messages_value := array_append(messages_value, 'รหัสนักเรียนถูกแก้จากแม่แบบ');
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.education_research_participants p
        WHERE p.id = template_row.participant_id
          AND p.project_id = p_project_id
      ) THEN
        messages_value := array_append(messages_value, 'นักเรียนไม่อยู่ในกลุ่มผู้เข้าร่วมโครงการแล้ว');
      END IF;
    END IF;

    pretest_value := CASE
      WHEN item->'pretest' IS NULL OR jsonb_typeof(item->'pretest') = 'null' THEN NULL
      ELSE (item->>'pretest')::numeric
    END;
    posttest_value := CASE
      WHEN item->'posttest' IS NULL OR jsonb_typeof(item->'posttest') = 'null' THEN NULL
      ELSE (item->>'posttest')::numeric
    END;

    IF pretest_value IS NOT NULL AND pretest_source IS DISTINCT FROM 'excel' THEN
      messages_value := array_append(messages_value, 'รอบก่อนเรียนไม่ได้กำหนดให้รับคะแนนจาก Excel');
    ELSIF pretest_value IS NOT NULL AND (pretest_value < 0 OR pretest_value > pretest_max) THEN
      messages_value := array_append(messages_value, 'คะแนนก่อนเรียนอยู่นอกช่วงที่กำหนด');
    END IF;
    IF posttest_value IS NOT NULL AND posttest_source IS DISTINCT FROM 'excel' THEN
      messages_value := array_append(messages_value, 'รอบหลังเรียนไม่ได้กำหนดให้รับคะแนนจาก Excel');
    ELSIF posttest_value IS NOT NULL AND (posttest_value < 0 OR posttest_value > posttest_max) THEN
      messages_value := array_append(messages_value, 'คะแนนหลังเรียนอยู่นอกช่วงที่กำหนด');
    END IF;

    current_pretest_value := NULL;
    current_posttest_value := NULL;
    IF template_row.id IS NOT NULL THEN
      SELECT
        MAX(s.raw_score) FILTER (WHERE m.measurement_type = 'pretest'),
        MAX(s.raw_score) FILTER (WHERE m.measurement_type = 'posttest')
      INTO current_pretest_value, current_posttest_value
      FROM public.education_research_measurements m
      LEFT JOIN public.education_research_scores s
        ON s.measurement_id = m.id
       AND s.participant_id = template_row.participant_id
      WHERE m.project_id = p_project_id;
    END IF;

    pretest_action_value := CASE
      WHEN pretest_value IS NULL THEN 'blank'
      WHEN current_pretest_value IS NULL THEN 'add'
      WHEN current_pretest_value IS NOT DISTINCT FROM pretest_value THEN 'unchanged'
      ELSE 'update'
    END;
    posttest_action_value := CASE
      WHEN posttest_value IS NULL THEN 'blank'
      WHEN current_posttest_value IS NULL THEN 'add'
      WHEN current_posttest_value IS NOT DISTINCT FROM posttest_value THEN 'unchanged'
      ELSE 'update'
    END;

    IF cardinality(messages_value) > 0 THEN
      status_value := 'error';
      error_total := error_total + 1;
    ELSIF pretest_action_value = 'update' OR posttest_action_value = 'update' THEN
      status_value := 'warning';
      messages_value := array_append(messages_value, 'มีคะแนนเดิมที่จะถูกเขียนทับ');
      warning_total := warning_total + 1;
    ELSE
      status_value := 'ready';
      ready_total := ready_total + 1;
    END IF;

    INSERT INTO public.education_research_import_batch_rows (
      org_id, project_id, batch_id, participant_id, row_number,
      row_token_text, student_code_file, full_name_file, note_file,
      incoming_pretest, incoming_posttest, current_pretest, current_posttest,
      pretest_action, posttest_action, validation_status, messages
    ) VALUES (
      project_org, p_project_id, batch_id_value, template_row.participant_id, row_number_value,
      token_text, item->>'student_code', item->>'full_name',
      NULLIF(btrim(COALESCE(item->>'note', '')), ''),
      pretest_value, posttest_value, current_pretest_value, current_posttest_value,
      pretest_action_value, posttest_action_value, status_value, messages_value
    );
  END LOOP;

  -- Removing a roster row from the workbook must not silently omit that
  -- participant. Add an explicit error row for every missing template token.
  FOR template_row IN
    SELECT tr.*
    FROM public.education_research_import_template_rows tr
    WHERE tr.template_id = p_template_id
      AND NOT (tr.row_token::text = ANY(seen_tokens))
    ORDER BY tr.roster_order_snapshot NULLS LAST, tr.full_name_snapshot
  LOOP
    row_total := row_total + 1;
    SELECT
      MAX(s.raw_score) FILTER (WHERE m.measurement_type = 'pretest'),
      MAX(s.raw_score) FILTER (WHERE m.measurement_type = 'posttest')
    INTO current_pretest_value, current_posttest_value
    FROM public.education_research_measurements m
    LEFT JOIN public.education_research_scores s
      ON s.measurement_id = m.id
     AND s.participant_id = template_row.participant_id
    WHERE m.project_id = p_project_id;

    INSERT INTO public.education_research_import_batch_rows (
      org_id, project_id, batch_id, participant_id, row_number,
      row_token_text, student_code_file, full_name_file,
      current_pretest, current_posttest,
      pretest_action, posttest_action, validation_status, messages
    ) VALUES (
      project_org, p_project_id, batch_id_value, template_row.participant_id, 100000 + row_total,
      template_row.row_token::text, template_row.student_code_snapshot, template_row.full_name_snapshot,
      current_pretest_value, current_posttest_value,
      'blank', 'blank', 'error', ARRAY['ไฟล์ไม่มีแถวของนักเรียนที่อยู่ในแม่แบบ']
    );
    error_total := error_total + 1;
  END LOOP;

  -- A participant added to the frozen project cohort after this template was
  -- created has no safe row/token in the workbook. Surface that mismatch and
  -- require a newly generated template instead of guessing a match.
  FOR current_participant IN
    SELECT p.id, p.roster_order, sp.student_code, u.full_name
    FROM public.education_research_participants p
    JOIN public.users u ON u.id = p.student_id
    LEFT JOIN public.student_profiles sp ON sp.student_id = p.student_id
    WHERE p.project_id = p_project_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.education_research_import_template_rows tr
        WHERE tr.template_id = p_template_id
          AND tr.participant_id = p.id
      )
    ORDER BY p.roster_order NULLS LAST, u.full_name, p.id
  LOOP
    row_total := row_total + 1;
    SELECT
      MAX(s.raw_score) FILTER (WHERE m.measurement_type = 'pretest'),
      MAX(s.raw_score) FILTER (WHERE m.measurement_type = 'posttest')
    INTO current_pretest_value, current_posttest_value
    FROM public.education_research_measurements m
    LEFT JOIN public.education_research_scores s
      ON s.measurement_id = m.id
     AND s.participant_id = current_participant.id
    WHERE m.project_id = p_project_id;

    INSERT INTO public.education_research_import_batch_rows (
      org_id, project_id, batch_id, participant_id, row_number,
      student_code_file, full_name_file,
      current_pretest, current_posttest,
      pretest_action, posttest_action, validation_status, messages
    ) VALUES (
      project_org, p_project_id, batch_id_value, current_participant.id, 200000 + row_total,
      current_participant.student_code, current_participant.full_name,
      current_pretest_value, current_posttest_value,
      'blank', 'blank', 'error', ARRAY['นักเรียนถูกเพิ่มในโครงการหลังสร้างแม่แบบ กรุณาดาวน์โหลดแม่แบบใหม่']
    );
    error_total := error_total + 1;
  END LOOP;

  UPDATE public.education_research_import_batches
  SET row_count = row_total,
      ready_count = ready_total,
      warning_count = warning_total,
      error_count = error_total,
      status = CASE WHEN error_total > 0 THEN 'invalid' ELSE 'previewed' END
  WHERE id = batch_id_value;

  RETURN batch_id_value;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'the workbook contains a value with an invalid type';
END;
$$;

CREATE FUNCTION public.confirm_education_research_import_batch(
  p_batch_id uuid,
  p_confirm_overwrites boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  batch_row public.education_research_import_batches%ROWTYPE;
  import_row public.education_research_import_batch_rows%ROWTYPE;
  pretest_measurement public.education_research_measurements%ROWTYPE;
  posttest_measurement public.education_research_measurements%ROWTYPE;
  live_pretest numeric;
  live_posttest numeric;
  saved_count integer := 0;
BEGIN
  SELECT * INTO batch_row
  FROM public.education_research_import_batches b
  WHERE b.id = p_batch_id
  FOR UPDATE;

  IF caller_id IS NULL OR batch_row.id IS NULL
    OR NOT public.can_manage_education_research_project(batch_row.project_id, batch_row.org_id)
  THEN
    RAISE EXCEPTION 'not allowed to confirm this research score import';
  END IF;
  IF batch_row.status = 'confirmed' THEN
    -- A retry after a lost response must not apply the same batch twice.
    RETURN 0;
  END IF;
  IF batch_row.status <> 'previewed' OR batch_row.error_count > 0 THEN
    RAISE EXCEPTION 'this import batch is not ready to confirm';
  END IF;
  IF batch_row.warning_count > 0 AND NOT p_confirm_overwrites THEN
    RAISE EXCEPTION 'overwriting existing scores requires explicit confirmation';
  END IF;

  SELECT * INTO pretest_measurement
  FROM public.education_research_measurements m
  WHERE m.project_id = batch_row.project_id AND m.measurement_type = 'pretest';
  SELECT * INTO posttest_measurement
  FROM public.education_research_measurements m
  WHERE m.project_id = batch_row.project_id AND m.measurement_type = 'posttest';

  -- Re-check every current value before changing any score. A concurrent edit
  -- invalidates the whole batch and the teacher must preview again.
  FOR import_row IN
    SELECT * FROM public.education_research_import_batch_rows r
    WHERE r.batch_id = batch_row.id
    ORDER BY r.row_number
  LOOP
    IF import_row.validation_status = 'error' OR import_row.participant_id IS NULL THEN
      RAISE EXCEPTION 'an invalid row remains in this import batch';
    END IF;

    SELECT MAX(s.raw_score) FILTER (WHERE s.measurement_id = pretest_measurement.id),
           MAX(s.raw_score) FILTER (WHERE s.measurement_id = posttest_measurement.id)
      INTO live_pretest, live_posttest
    FROM public.education_research_scores s
    WHERE s.participant_id = import_row.participant_id
      AND s.measurement_id IN (pretest_measurement.id, posttest_measurement.id);

    IF live_pretest IS DISTINCT FROM import_row.current_pretest
      OR live_posttest IS DISTINCT FROM import_row.current_posttest
    THEN
      RAISE EXCEPTION 'research scores changed after preview; upload and check the workbook again';
    END IF;
  END LOOP;

  FOR import_row IN
    SELECT * FROM public.education_research_import_batch_rows r
    WHERE r.batch_id = batch_row.id
    ORDER BY r.row_number
  LOOP
    IF import_row.incoming_pretest IS NOT NULL THEN
      IF pretest_measurement.source_type <> 'excel' THEN
        RAISE EXCEPTION 'pretest is not configured for Excel import';
      END IF;
      INSERT INTO public.education_research_scores (
        org_id, project_id, participant_id, measurement_id,
        raw_score, max_score, score_source, recorded_by, updated_by, change_reason
      ) VALUES (
        batch_row.org_id, batch_row.project_id, import_row.participant_id, pretest_measurement.id,
        import_row.incoming_pretest, pretest_measurement.max_score, 'excel',
        caller_id, caller_id, 'นำเข้าจาก Excel ชุด ' || batch_row.id::text
      )
      ON CONFLICT (participant_id, measurement_id) DO UPDATE SET
        raw_score = EXCLUDED.raw_score,
        max_score = EXCLUDED.max_score,
        score_source = EXCLUDED.score_source,
        updated_by = EXCLUDED.updated_by,
        change_reason = EXCLUDED.change_reason
      WHERE education_research_scores.raw_score IS DISTINCT FROM EXCLUDED.raw_score
         OR education_research_scores.max_score IS DISTINCT FROM EXCLUDED.max_score;
      saved_count := saved_count + 1;
    END IF;

    IF import_row.incoming_posttest IS NOT NULL THEN
      IF posttest_measurement.source_type <> 'excel' THEN
        RAISE EXCEPTION 'posttest is not configured for Excel import';
      END IF;
      INSERT INTO public.education_research_scores (
        org_id, project_id, participant_id, measurement_id,
        raw_score, max_score, score_source, recorded_by, updated_by, change_reason
      ) VALUES (
        batch_row.org_id, batch_row.project_id, import_row.participant_id, posttest_measurement.id,
        import_row.incoming_posttest, posttest_measurement.max_score, 'excel',
        caller_id, caller_id, 'นำเข้าจาก Excel ชุด ' || batch_row.id::text
      )
      ON CONFLICT (participant_id, measurement_id) DO UPDATE SET
        raw_score = EXCLUDED.raw_score,
        max_score = EXCLUDED.max_score,
        score_source = EXCLUDED.score_source,
        updated_by = EXCLUDED.updated_by,
        change_reason = EXCLUDED.change_reason
      WHERE education_research_scores.raw_score IS DISTINCT FROM EXCLUDED.raw_score
         OR education_research_scores.max_score IS DISTINCT FROM EXCLUDED.max_score;
      saved_count := saved_count + 1;
    END IF;
  END LOOP;

  UPDATE public.education_research_import_batches
  SET status = 'confirmed', confirmed_by = caller_id, confirmed_at = now()
  WHERE id = batch_row.id;

  RETURN saved_count;
END;
$$;

CREATE FUNCTION public.refresh_education_research_project_status_from_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_project_id uuid;
  paired_count integer;
  pretest_count integer;
  posttest_count integer;
  current_status text;
BEGIN
  target_project_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  SELECT p.status INTO current_status
  FROM public.education_research_projects p
  WHERE p.id = target_project_id;

  IF current_status IN ('completed', 'archived') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE pre.raw_score IS NOT NULL),
    COUNT(*) FILTER (WHERE post.raw_score IS NOT NULL),
    COUNT(*) FILTER (WHERE pre.raw_score IS NOT NULL AND post.raw_score IS NOT NULL)
  INTO pretest_count, posttest_count, paired_count
  FROM public.education_research_participants participant
  LEFT JOIN public.education_research_measurements pre_m
    ON pre_m.project_id = participant.project_id AND pre_m.measurement_type = 'pretest'
  LEFT JOIN public.education_research_measurements post_m
    ON post_m.project_id = participant.project_id AND post_m.measurement_type = 'posttest'
  LEFT JOIN public.education_research_scores pre
    ON pre.participant_id = participant.id AND pre.measurement_id = pre_m.id
  LEFT JOIN public.education_research_scores post
    ON post.participant_id = participant.id AND post.measurement_id = post_m.id
  WHERE participant.project_id = target_project_id;

  UPDATE public.education_research_projects
  SET status = CASE
    WHEN paired_count > 0 THEN 'ready_for_analysis'
    WHEN posttest_count > 0 THEN 'collecting_posttest'
    WHEN pretest_count > 0 THEN 'teaching'
    ELSE status
  END
  WHERE id = target_project_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER education_research_scores_refresh_project_status
  AFTER INSERT OR UPDATE OR DELETE ON public.education_research_scores
  FOR EACH ROW EXECUTE FUNCTION public.refresh_education_research_project_status_from_scores();

REVOKE ALL ON FUNCTION public.sync_education_research_score_from_submission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_education_research_score_change_reason() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_education_research_project_status_from_scores() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_education_research_manual_draft(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_education_research_manual_scores(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_education_research_import_template(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_education_research_import_batch(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_education_research_import_batch(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_education_research_manual_draft(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_education_research_manual_scores(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_education_research_import_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_education_research_import_batch(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_education_research_import_batch(uuid, boolean) TO authenticated;

-- Browser clients may read their authorized previews/drafts, but every score,
-- draft, template, and batch mutation must pass through the validated RPCs or
-- the trusted submission trigger above.
REVOKE INSERT, UPDATE, DELETE ON public.education_research_scores FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.education_research_score_drafts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.education_research_import_templates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.education_research_import_template_rows FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.education_research_import_batches FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.education_research_import_batch_rows FROM authenticated;
