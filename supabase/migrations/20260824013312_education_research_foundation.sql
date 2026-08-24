-- Education research phase 2.1: tenant-safe foundation for the first
-- supported design (one group, pretest/posttest). This migration creates no
-- sample projects or scores. Students continue to access exams through the
-- existing classroom assignment flow; the research tables are teacher-only.

CREATE TABLE public.education_research_projects (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  classroom_id               uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_by                 uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                      text NOT NULL CHECK (btrim(title) <> ''),
  topic                      text NOT NULL CHECK (btrim(topic) <> ''),
  research_design            text NOT NULL DEFAULT 'one_group_pretest_posttest'
    CHECK (research_design = 'one_group_pretest_posttest'),
  status                     text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'collecting_pretest',
      'teaching',
      'collecting_posttest',
      'ready_for_analysis',
      'completed',
      'archived'
    )),
  passing_threshold_percent  numeric(5,2) NOT NULL DEFAULT 70
    CHECK (passing_threshold_percent > 0 AND passing_threshold_percent <= 100),
  significance_level         numeric(4,3) NOT NULL DEFAULT 0.05
    CHECK (significance_level > 0 AND significance_level < 1),
  criterion_test_sides       smallint NOT NULL DEFAULT 2
    CHECK (criterion_test_sides = 2),
  completed_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.education_research_projects IS
  'Teacher-owned education research projects; phase 1 supports only one-group pretest/posttest.';
COMMENT ON COLUMN public.education_research_projects.criterion_test_sides IS
  'Locked to a two-sided one-sample t-test in the first release.';

CREATE INDEX idx_education_research_projects_org
  ON public.education_research_projects(org_id);
CREATE INDEX idx_education_research_projects_classroom
  ON public.education_research_projects(classroom_id);
CREATE INDEX idx_education_research_projects_created_by
  ON public.education_research_projects(created_by);
CREATE INDEX idx_education_research_projects_status
  ON public.education_research_projects(status);

CREATE TABLE public.education_research_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  roster_order  integer CHECK (roster_order IS NULL OR roster_order > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, student_id),
  UNIQUE (id, project_id, org_id)
);

COMMENT ON TABLE public.education_research_participants IS
  'Frozen project cohort copied from the linked classroom roster; every participant is a registered KorKru user.';

CREATE INDEX idx_education_research_participants_org
  ON public.education_research_participants(org_id);
CREATE INDEX idx_education_research_participants_project
  ON public.education_research_participants(project_id);
CREATE INDEX idx_education_research_participants_student
  ON public.education_research_participants(student_id);

CREATE TABLE public.education_research_measurements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  measurement_type  text NOT NULL CHECK (measurement_type IN ('pretest', 'posttest')),
  source_type       text CHECK (source_type IN ('korkru_exam', 'manual', 'excel')),
  assignment_id     uuid REFERENCES public.assignments(id) ON DELETE RESTRICT,
  max_score         numeric(10,4) CHECK (max_score IS NULL OR max_score > 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT education_research_measurements_source
    CHECK (
      source_type IS NULL
      OR (source_type = 'korkru_exam' AND assignment_id IS NOT NULL)
      OR (source_type IN ('manual', 'excel') AND assignment_id IS NULL)
    ),
  UNIQUE (project_id, measurement_type),
  UNIQUE (assignment_id),
  UNIQUE (id, project_id, org_id)
);

COMMENT ON TABLE public.education_research_measurements IS
  'The pretest and posttest configuration for a project. An online source links to the existing assignment snapshot.';

CREATE INDEX idx_education_research_measurements_org
  ON public.education_research_measurements(org_id);
CREATE INDEX idx_education_research_measurements_project
  ON public.education_research_measurements(project_id);

CREATE TABLE public.education_research_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  participant_id    uuid NOT NULL,
  measurement_id    uuid NOT NULL,
  raw_score         numeric(10,4) NOT NULL,
  max_score         numeric(10,4) NOT NULL CHECK (max_score > 0),
  score_source      text NOT NULL CHECK (score_source IN ('korkru_exam', 'manual', 'excel')),
  submission_id     uuid REFERENCES public.submissions(id) ON DELETE RESTRICT,
  recorded_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT education_research_scores_bounds
    CHECK (raw_score >= 0 AND raw_score <= max_score),
  CONSTRAINT education_research_scores_participant_scope
    FOREIGN KEY (participant_id, project_id, org_id)
    REFERENCES public.education_research_participants(id, project_id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT education_research_scores_measurement_scope
    FOREIGN KEY (measurement_id, project_id, org_id)
    REFERENCES public.education_research_measurements(id, project_id, org_id)
    ON DELETE CASCADE,
  UNIQUE (participant_id, measurement_id)
);

COMMENT ON TABLE public.education_research_scores IS
  'Validated score observations. A missing score is represented by no row, never by a synthetic zero.';

CREATE INDEX idx_education_research_scores_org
  ON public.education_research_scores(org_id);
CREATE INDEX idx_education_research_scores_project
  ON public.education_research_scores(project_id);
CREATE INDEX idx_education_research_scores_participant
  ON public.education_research_scores(participant_id);
CREATE INDEX idx_education_research_scores_measurement
  ON public.education_research_scores(measurement_id);
CREATE INDEX idx_education_research_scores_submission
  ON public.education_research_scores(submission_id)
  WHERE submission_id IS NOT NULL;

CREATE TABLE public.education_research_score_history (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  score_id            uuid,
  participant_id      uuid NOT NULL,
  measurement_id      uuid NOT NULL,
  action              text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_score           numeric(10,4),
  new_score           numeric(10,4),
  old_max_score       numeric(10,4),
  new_max_score       numeric(10,4),
  old_source          text,
  new_source          text,
  reason              text,
  changed_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.education_research_score_history IS
  'Append-only audit rows created by a trigger whenever a research score is inserted, updated, or deleted.';

CREATE INDEX idx_education_research_score_history_project_time
  ON public.education_research_score_history(project_id, changed_at DESC);
CREATE INDEX idx_education_research_score_history_score
  ON public.education_research_score_history(score_id)
  WHERE score_id IS NOT NULL;

-- Permission helpers deliberately derive authority from the exact classroom,
-- not from organization membership alone. A view-only co-teacher may see
-- project metadata, but participant and score tables require manage access.
CREATE FUNCTION public.can_view_education_research_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.classrooms c
    WHERE c.id = p_classroom_id
      AND (
        c.teacher_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.classroom_co_teachers ct
          WHERE ct.classroom_id = c.id
            AND ct.user_id = (SELECT auth.uid())
            AND ct.permission IN ('admin', 'manage', 'view')
        )
      )
  );
$$;

CREATE FUNCTION public.can_manage_education_research_classroom(
  p_classroom_id uuid,
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
    FROM public.classrooms c
    WHERE c.id = p_classroom_id
      AND c.org_id = p_org_id
      AND c.classroom_type = 'subject'
      AND c.status = 'active'
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
  );
$$;

CREATE FUNCTION public.can_view_education_research_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.education_research_projects p
    JOIN public.classrooms c ON c.id = p.classroom_id AND c.org_id = p.org_id
    WHERE p.id = p_project_id
      AND (
        c.teacher_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.classroom_co_teachers ct
          WHERE ct.classroom_id = c.id
            AND ct.user_id = (SELECT auth.uid())
            AND ct.permission IN ('admin', 'manage', 'view')
        )
      )
  );
$$;

CREATE FUNCTION public.can_manage_education_research_project(
  p_project_id uuid,
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
    FROM public.education_research_projects p
    JOIN public.classrooms c ON c.id = p.classroom_id AND c.org_id = p.org_id
    WHERE p.id = p_project_id
      AND p.org_id = p_org_id
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
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_education_research_classroom(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_education_research_classroom(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_education_research_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_education_research_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_education_research_classroom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_education_research_classroom(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_education_research_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_education_research_project(uuid, uuid) TO authenticated;

-- Scope and roster invariants are enforced below RLS so privileged server
-- code cannot accidentally connect a project to the wrong tenant or student.
CREATE FUNCTION public.validate_education_research_project_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.classroom_id IS DISTINCT FROM NEW.classroom_id
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.research_design IS DISTINCT FROM NEW.research_design
  ) THEN
    RAISE EXCEPTION 'education research project scope is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classrooms c
    WHERE c.id = NEW.classroom_id
      AND c.org_id = NEW.org_id
      AND c.classroom_type = 'subject'
  ) THEN
    RAISE EXCEPTION 'education research project must use a subject classroom in the same organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_education_research_participant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_org uuid;
  project_classroom uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
  ) THEN
    RAISE EXCEPTION 'education research participant identity and scope are immutable';
  END IF;

  SELECT p.org_id, p.classroom_id
    INTO project_org, project_classroom
  FROM public.education_research_projects p
  WHERE p.id = NEW.project_id;

  IF project_org IS NULL OR project_org IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'education research participant organization does not match project';
  END IF;

  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1
    FROM public.classroom_students cs
    WHERE cs.classroom_id = project_classroom
      AND cs.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'education research participant must be a current member of the project classroom';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_education_research_measurement_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_org uuid;
  project_classroom uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.measurement_type IS DISTINCT FROM NEW.measurement_type
  ) THEN
    RAISE EXCEPTION 'education research measurement identity and scope are immutable';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      OLD.source_type IS DISTINCT FROM NEW.source_type
      OR OLD.assignment_id IS DISTINCT FROM NEW.assignment_id
      OR OLD.max_score IS DISTINCT FROM NEW.max_score
    )
    AND EXISTS (
      SELECT 1
      FROM public.education_research_scores s
      WHERE s.measurement_id = OLD.id
    )
  THEN
    RAISE EXCEPTION 'education research measurement source and score scale are locked after the first score';
  END IF;

  SELECT p.org_id, p.classroom_id
    INTO project_org, project_classroom
  FROM public.education_research_projects p
  WHERE p.id = NEW.project_id;

  IF project_org IS NULL OR project_org IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'education research measurement organization does not match project';
  END IF;

  IF NEW.assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.assignment_classrooms ac ON ac.assignment_id = a.id
    WHERE a.id = NEW.assignment_id
      AND a.org_id = NEW.org_id
      AND ac.classroom_id = project_classroom
  ) THEN
    RAISE EXCEPTION 'education research assignment must belong to the project classroom and organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_education_research_score_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_max_score numeric(10,4);
  configured_source_type text;
  participant_student_id uuid;
  measurement_assignment_id uuid;
  submission_score numeric;
  submission_max_score numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.org_id IS DISTINCT FROM NEW.org_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.participant_id IS DISTINCT FROM NEW.participant_id
    OR OLD.measurement_id IS DISTINCT FROM NEW.measurement_id
  ) THEN
    RAISE EXCEPTION 'education research score identity and scope are immutable';
  END IF;

  SELECT m.max_score, m.source_type, m.assignment_id, p.student_id
    INTO configured_max_score, configured_source_type, measurement_assignment_id, participant_student_id
  FROM public.education_research_measurements m
  JOIN public.education_research_participants p
    ON p.id = NEW.participant_id
   AND p.project_id = m.project_id
   AND p.org_id = m.org_id
  WHERE m.id = NEW.measurement_id
    AND m.project_id = NEW.project_id
    AND m.org_id = NEW.org_id;

  IF participant_student_id IS NULL THEN
    RAISE EXCEPTION 'education research score participant and measurement scope do not match';
  END IF;

  IF configured_max_score IS NOT NULL AND configured_max_score IS DISTINCT FROM NEW.max_score THEN
    RAISE EXCEPTION 'education research score max_score must match the configured measurement max_score';
  END IF;

  IF configured_source_type IS NULL OR configured_source_type IS DISTINCT FROM NEW.score_source THEN
    RAISE EXCEPTION 'education research score source must match the configured measurement source';
  END IF;

  IF NEW.score_source = 'korkru_exam' THEN
    SELECT s.total_score, s.max_score
      INTO submission_score, submission_max_score
    FROM public.submissions s
    WHERE s.id = NEW.submission_id
      AND s.assignment_id = measurement_assignment_id
      AND s.student_id = participant_student_id
      AND s.org_id = NEW.org_id
      AND s.status IN ('submitted', 'graded');

    IF NEW.submission_id IS NULL
      OR measurement_assignment_id IS NULL
      OR submission_score IS NULL
      OR submission_max_score IS NULL
    THEN
      RAISE EXCEPTION 'KorKru research score must reference a submitted attempt for the same student and measurement';
    END IF;

    IF submission_score IS DISTINCT FROM NEW.raw_score
      OR submission_max_score IS DISTINCT FROM NEW.max_score
    THEN
      RAISE EXCEPTION 'KorKru research score must match the referenced submission totals';
    END IF;
  ELSIF NEW.submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'manual or Excel research scores cannot reference a KorKru submission';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.audit_education_research_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.education_research_score_history (
      org_id, project_id, score_id, participant_id, measurement_id, action,
      new_score, new_max_score, new_source, reason, changed_by
    ) VALUES (
      NEW.org_id, NEW.project_id, NEW.id, NEW.participant_id, NEW.measurement_id, 'insert',
      NEW.raw_score, NEW.max_score, NEW.score_source, NEW.change_reason,
      COALESCE((SELECT auth.uid()), NEW.recorded_by, NEW.updated_by)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.education_research_score_history (
      org_id, project_id, score_id, participant_id, measurement_id, action,
      old_score, new_score, old_max_score, new_max_score,
      old_source, new_source, reason, changed_by
    ) VALUES (
      NEW.org_id, NEW.project_id, NEW.id, NEW.participant_id, NEW.measurement_id, 'update',
      OLD.raw_score, NEW.raw_score, OLD.max_score, NEW.max_score,
      OLD.score_source, NEW.score_source, NEW.change_reason,
      COALESCE((SELECT auth.uid()), NEW.updated_by, NEW.recorded_by)
    );
    RETURN NEW;
  ELSE
    INSERT INTO public.education_research_score_history (
      org_id, project_id, score_id, participant_id, measurement_id, action,
      old_score, old_max_score, old_source, reason, changed_by
    ) VALUES (
      OLD.org_id, OLD.project_id, NULL, OLD.participant_id, OLD.measurement_id, 'delete',
      OLD.raw_score, OLD.max_score, OLD.score_source, OLD.change_reason,
      COALESCE((SELECT auth.uid()), OLD.updated_by, OLD.recorded_by)
    );
    RETURN OLD;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_education_research_project_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_education_research_participant_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_education_research_measurement_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_education_research_score_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_education_research_score() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER education_research_projects_scope
  BEFORE INSERT OR UPDATE ON public.education_research_projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_education_research_project_scope();
CREATE TRIGGER education_research_projects_updated_at
  BEFORE UPDATE ON public.education_research_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER education_research_participants_scope
  BEFORE INSERT OR UPDATE ON public.education_research_participants
  FOR EACH ROW EXECUTE FUNCTION public.validate_education_research_participant_scope();

CREATE TRIGGER education_research_measurements_scope
  BEFORE INSERT OR UPDATE ON public.education_research_measurements
  FOR EACH ROW EXECUTE FUNCTION public.validate_education_research_measurement_scope();
CREATE TRIGGER education_research_measurements_updated_at
  BEFORE UPDATE ON public.education_research_measurements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER education_research_scores_updated_at
  BEFORE UPDATE ON public.education_research_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER education_research_scores_scope
  BEFORE INSERT OR UPDATE ON public.education_research_scores
  FOR EACH ROW EXECUTE FUNCTION public.validate_education_research_score_scope();
CREATE TRIGGER education_research_scores_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.education_research_scores
  FOR EACH ROW EXECUTE FUNCTION public.audit_education_research_score();

ALTER TABLE public.education_research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_research_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY education_research_projects_select
  ON public.education_research_projects
  FOR SELECT TO authenticated
  USING (public.can_view_education_research_classroom(classroom_id));

CREATE POLICY education_research_projects_insert
  ON public.education_research_projects
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.can_manage_education_research_classroom(classroom_id, org_id)
  );

CREATE POLICY education_research_projects_update
  ON public.education_research_projects
  FOR UPDATE TO authenticated
  USING (public.can_manage_education_research_project(id, org_id))
  WITH CHECK (
    public.can_manage_education_research_project(id, org_id)
    AND public.can_manage_education_research_classroom(classroom_id, org_id)
  );

CREATE POLICY education_research_projects_delete
  ON public.education_research_projects
  FOR DELETE TO authenticated
  USING (public.can_manage_education_research_project(id, org_id));

CREATE POLICY education_research_participants_select
  ON public.education_research_participants
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_participants_insert
  ON public.education_research_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_participants_update
  ON public.education_research_participants
  FOR UPDATE TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id))
  WITH CHECK (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_participants_delete
  ON public.education_research_participants
  FOR DELETE TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_measurements_select
  ON public.education_research_measurements
  FOR SELECT TO authenticated
  USING (public.can_view_education_research_project(project_id));

CREATE POLICY education_research_measurements_insert
  ON public.education_research_measurements
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_measurements_update
  ON public.education_research_measurements
  FOR UPDATE TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id))
  WITH CHECK (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_measurements_delete
  ON public.education_research_measurements
  FOR DELETE TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_scores_select
  ON public.education_research_scores
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_scores_insert
  ON public.education_research_scores
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_scores_update
  ON public.education_research_scores
  FOR UPDATE TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id))
  WITH CHECK (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_scores_delete
  ON public.education_research_scores
  FOR DELETE TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

CREATE POLICY education_research_score_history_select
  ON public.education_research_score_history
  FOR SELECT TO authenticated
  USING (public.can_manage_education_research_project(project_id, org_id));

-- Prevent browser clients from bypassing the audit trigger by editing history.
REVOKE INSERT, UPDATE, DELETE ON public.education_research_score_history FROM authenticated;
