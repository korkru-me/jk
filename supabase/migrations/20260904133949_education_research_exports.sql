-- Education research phase 2.5: append-only metadata for individual-data
-- exports. The generated workbook stays in application memory and is never
-- uploaded to Storage. This table deliberately stores no student identity,
-- score, filter, filename, or workbook content.

CREATE TABLE public.education_research_export_events (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES public.education_research_projects(id) ON DELETE CASCADE,
  exported_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  export_mode              text NOT NULL CHECK (export_mode IN ('anonymous', 'identified')),
  file_format              text NOT NULL DEFAULT 'xlsx' CHECK (file_format = 'xlsx'),
  row_count                integer NOT NULL CHECK (row_count BETWEEN 0 AND 2000),
  source_score_updated_at  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.education_research_export_events IS
  'Append-only audit metadata for individual research-data exports. Contains no student identity, score, filename, or workbook content.';
COMMENT ON COLUMN public.education_research_export_events.export_mode IS
  'anonymous omits student names/codes; identified includes them in the transient workbook only.';
COMMENT ON COLUMN public.education_research_export_events.source_score_updated_at IS
  'Latest education_research_scores.updated_at observed by the server when preparing the workbook.';

CREATE INDEX idx_education_research_export_events_project_time
  ON public.education_research_export_events(project_id, created_at DESC);
CREATE INDEX idx_education_research_export_events_org_time
  ON public.education_research_export_events(org_id, created_at DESC);
CREATE INDEX idx_education_research_export_events_actor_time
  ON public.education_research_export_events(exported_by, created_at DESC)
  WHERE exported_by IS NOT NULL;

ALTER TABLE public.education_research_export_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY education_research_export_events_select
  ON public.education_research_export_events
  FOR SELECT TO authenticated
  USING (
    public.can_manage_education_research_project(project_id, org_id)
  );

REVOKE ALL ON TABLE public.education_research_export_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.education_research_export_events FROM authenticated;
GRANT SELECT ON TABLE public.education_research_export_events TO authenticated;

-- Called only after the authenticated route has built a workbook. The
-- service-role-only function repeats the exact project authorization using
-- the passed actor instead of trusting the route's earlier check alone.
CREATE FUNCTION public.record_education_research_export_event(
  p_project_id uuid,
  p_actor_id uuid,
  p_export_mode text,
  p_row_count integer,
  p_source_score_updated_at timestamptz DEFAULT NULL
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
  IF p_project_id IS NULL
    OR p_actor_id IS NULL
    OR p_export_mode IS NULL
    OR p_export_mode NOT IN ('anonymous', 'identified')
    OR p_row_count IS NULL
    OR p_row_count < 0
    OR p_row_count > 2000
    OR p_source_score_updated_at > now() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid education research export event' USING ERRCODE = '22023';
  END IF;

  SELECT project.org_id
    INTO v_org_id
  FROM public.education_research_projects project
  JOIN public.classrooms classroom
    ON classroom.id = project.classroom_id
   AND classroom.org_id = project.org_id
  WHERE project.id = p_project_id
    AND (
      classroom.teacher_id = p_actor_id
      OR EXISTS (
        SELECT 1
        FROM public.classroom_co_teachers co_teacher
        WHERE co_teacher.classroom_id = classroom.id
          AND co_teacher.user_id = p_actor_id
          AND co_teacher.permission IN ('admin', 'manage')
      )
      OR EXISTS (
        SELECT 1
        FROM public.super_admins super_admin
        WHERE super_admin.user_id = p_actor_id
      )
    );

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'actor cannot export this education research project' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.education_research_export_events (
    org_id,
    project_id,
    exported_by,
    export_mode,
    row_count,
    source_score_updated_at
  ) VALUES (
    v_org_id,
    p_project_id,
    p_actor_id,
    p_export_mode,
    p_row_count,
    p_source_score_updated_at
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.record_education_research_export_event(uuid, uuid, text, integer, timestamptz) IS
  'Records metadata for one completed individual research-data export after independently verifying the actor can manage the exact project.';

REVOKE ALL ON FUNCTION public.record_education_research_export_event(uuid, uuid, text, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_education_research_export_event(uuid, uuid, text, integer, timestamptz)
  TO service_role;
