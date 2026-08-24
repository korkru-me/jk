-- Education research phase 2.2: atomically create a real project, freeze its
-- selected questions into hidden immutable copies, and reuse the existing
-- assignment/submission runtime for online pretests and posttests.

ALTER TABLE public.questions
  ADD COLUMN is_research_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN research_snapshot_project_id uuid
    REFERENCES public.education_research_projects(id) ON DELETE RESTRICT,
  ADD COLUMN research_snapshot_source_id uuid;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_research_snapshot_scope
  CHECK (
    (is_research_snapshot = true AND research_snapshot_project_id IS NOT NULL)
    OR
    (is_research_snapshot = false AND research_snapshot_project_id IS NULL AND research_snapshot_source_id IS NULL)
  );

CREATE INDEX idx_questions_research_snapshot_project
  ON public.questions(research_snapshot_project_id)
  WHERE is_research_snapshot = true;

ALTER TABLE public.education_research_measurements
  ADD COLUMN selection_mode text
    CHECK (selection_mode IN ('set', 'sections', 'individual', 'same_as_pretest')),
  ADD COLUMN source_set_id uuid REFERENCES public.question_sets(id) ON DELETE SET NULL,
  ADD COLUMN source_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN source_question_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN snapshot_question_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN duration_minutes integer
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600);

ALTER TABLE public.education_research_measurements
  ADD CONSTRAINT education_research_measurements_configuration
  CHECK (
    source_type IS NULL
    OR (
      source_type = 'korkru_exam'
      AND assignment_id IS NOT NULL
      AND max_score IS NOT NULL
      AND selection_mode IS NOT NULL
      AND duration_minutes IS NOT NULL
      AND cardinality(source_question_ids) > 0
      AND cardinality(source_question_ids) = cardinality(snapshot_question_ids)
    )
    OR (
      source_type IN ('manual', 'excel')
      AND assignment_id IS NULL
      AND max_score IS NOT NULL
      AND selection_mode IS NULL
      AND source_set_id IS NULL
      AND source_sections = '[]'::jsonb
      AND cardinality(source_question_ids) = 0
      AND cardinality(snapshot_question_ids) = 0
      AND duration_minutes IS NULL
    )
  );

CREATE FUNCTION public.education_research_question_max_score(p_question public.questions)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item_count integer;
  score_answer numeric := 1;
  explanation_score numeric := 0;
  total numeric;
BEGIN
  IF p_question.question_type = 'true_false' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.extra_data->'statements') = 'array'
        THEN jsonb_array_length(p_question.extra_data->'statements')
      ELSE 0
    END;
    score_answer := COALESCE(NULLIF(p_question.extra_data->>'score_answer', '')::numeric, 1);
    IF COALESCE(p_question.extra_data->>'explanation_mode', 'none') <> 'none' THEN
      explanation_score := COALESCE(NULLIF(p_question.extra_data->>'score_explanation', '')::numeric, 1);
    END IF;
    RETURN score_answer * GREATEST(item_count + 1, 1) + explanation_score;
  END IF;

  IF p_question.question_type = 'fill_blank' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.extra_data->'blanks') = 'array'
        THEN jsonb_array_length(p_question.extra_data->'blanks')
      ELSE 0
    END;
    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'ordering' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.extra_data->'items') = 'array'
        THEN jsonb_array_length(p_question.extra_data->'items')
      ELSE 0
    END;
    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'matching' THEN
    item_count := CASE
      WHEN jsonb_typeof(p_question.mcq_options) = 'array'
        THEN jsonb_array_length(p_question.mcq_options)
      ELSE 0
    END;
    RETURN GREATEST(item_count, 1);
  END IF;

  IF p_question.question_type = 'composite' THEN
    IF jsonb_typeof(p_question.extra_data->'parts') <> 'array'
      OR jsonb_array_length(p_question.extra_data->'parts') = 0
    THEN
      RETURN 1;
    END IF;

    SELECT COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(part->'score') = 'number' AND (part->>'score')::numeric > 0
          THEN (part->>'score')::numeric
        ELSE 1
      END
    ), 1)
    INTO total
    FROM jsonb_array_elements(p_question.extra_data->'parts') AS part;
    RETURN total;
  END IF;

  IF p_question.question_type = 'file_upload' THEN
    RETURN 1;
  END IF;

  item_count := CASE
    WHEN jsonb_typeof(p_question.answer_parts) = 'array'
      THEN jsonb_array_length(p_question.answer_parts)
    ELSE 0
  END;
  RETURN CASE WHEN item_count > 1 THEN item_count ELSE 1 END;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN 1;
END;
$$;

CREATE FUNCTION public.remap_education_research_sections(
  p_sections jsonb,
  p_source_ids uuid[],
  p_snapshot_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  section_row jsonb;
  question_text text;
  source_position integer;
  remapped_ids uuid[];
  result jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_sections) <> 'array' THEN
    RETURN result;
  END IF;

  FOR section_row IN SELECT value FROM jsonb_array_elements(p_sections)
  LOOP
    remapped_ids := '{}';
    IF jsonb_typeof(section_row->'question_ids') = 'array' THEN
      FOR question_text IN SELECT value FROM jsonb_array_elements_text(section_row->'question_ids')
      LOOP
        source_position := array_position(p_source_ids, question_text::uuid);
        IF source_position IS NOT NULL AND p_snapshot_ids[source_position] IS NOT NULL THEN
          remapped_ids := array_append(remapped_ids, p_snapshot_ids[source_position]);
        END IF;
      END LOOP;
    END IF;

    IF cardinality(remapped_ids) > 0 THEN
      result := result || jsonb_build_array(
        section_row || jsonb_build_object('question_ids', to_jsonb(remapped_ids))
      );
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

CREATE FUNCTION public.protect_education_research_snapshot_question()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_research_snapshot AND current_user NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'research snapshots can only be created by the project workflow';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.is_research_snapshot THEN
    RAISE EXCEPTION 'education research snapshot questions are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.is_research_snapshot IS DISTINCT FROM OLD.is_research_snapshot
    OR NEW.research_snapshot_project_id IS DISTINCT FROM OLD.research_snapshot_project_id
    OR NEW.research_snapshot_source_id IS DISTINCT FROM OLD.research_snapshot_source_id
  ) THEN
    RAISE EXCEPTION 'research snapshot identity can only be created by the project workflow';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER questions_protect_research_snapshot
  BEFORE INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.protect_education_research_snapshot_question();

-- Replace the phase 2.1 validator to cover the new online snapshot metadata.
CREATE OR REPLACE FUNCTION public.validate_education_research_measurement_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_org uuid;
  project_classroom uuid;
  calculated_max numeric;
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
      OR OLD.source_question_ids IS DISTINCT FROM NEW.source_question_ids
      OR OLD.snapshot_question_ids IS DISTINCT FROM NEW.snapshot_question_ids
    )
    AND EXISTS (
      SELECT 1 FROM public.education_research_scores s WHERE s.measurement_id = OLD.id
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
      AND a.question_ids = NEW.snapshot_question_ids
      AND a.type = 'exam'
      AND a.mode = 'online'
      AND COALESCE(a.max_attempts, 1) = 1
      AND ac.classroom_id = project_classroom
  ) THEN
    RAISE EXCEPTION 'education research assignment must be a one-attempt online exam in the project classroom';
  END IF;

  IF NEW.source_type = 'korkru_exam' THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(NEW.snapshot_question_ids) snapshot_id
      LEFT JOIN public.questions q ON q.id = snapshot_id
      WHERE q.id IS NULL
        OR q.is_research_snapshot = false
        OR q.research_snapshot_project_id IS DISTINCT FROM NEW.project_id
    ) THEN
      RAISE EXCEPTION 'education research measurement contains a question outside its immutable snapshot';
    END IF;

    SELECT SUM(public.education_research_question_max_score(q))
      INTO calculated_max
    FROM public.questions q
    WHERE q.id = ANY(NEW.snapshot_question_ids);

    IF calculated_max IS NULL OR calculated_max IS DISTINCT FROM NEW.max_score THEN
      RAISE EXCEPTION 'education research measurement max_score does not match its snapshot questions';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.create_education_research_project(
  p_title text,
  p_topic text,
  p_classroom_id uuid,
  p_passing_threshold_percent numeric,
  p_pretest jsonb,
  p_posttest jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  project_id uuid;
  project_org uuid;
  participant_count integer;
  measurement_type text;
  config jsonb;
  source_type text;
  selection_mode text;
  source_set_id uuid;
  source_sections jsonb;
  source_ids uuid[];
  snapshot_ids uuid[];
  source_id uuid;
  snapshot_id uuid;
  configured_max numeric;
  pretest_max numeric;
  duration_value integer;
  assignment_id uuid;
  assignment_status_value public.assignment_status;
  publish_mode text;
  start_value timestamptz;
  end_value timestamptz;
  access_code_value text;
  remapped_sections jsonb;
  pre_source_ids uuid[];
  pre_snapshot_ids uuid[];
  pre_source_sections jsonb;
  pre_source_set_id uuid;
  pre_assignment_published boolean := false;
  post_assignment_published boolean := false;
  set_question_ids uuid[];
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF btrim(COALESCE(p_title, '')) = '' OR char_length(btrim(p_title)) > 200 THEN
    RAISE EXCEPTION 'project title is required and must not exceed 200 characters';
  END IF;
  IF btrim(COALESCE(p_topic, '')) = '' OR char_length(btrim(p_topic)) > 200 THEN
    RAISE EXCEPTION 'project topic is required and must not exceed 200 characters';
  END IF;
  IF p_passing_threshold_percent <= 0 OR p_passing_threshold_percent > 100 THEN
    RAISE EXCEPTION 'passing threshold must be between 0 and 100';
  END IF;

  SELECT c.org_id INTO project_org
  FROM public.classrooms c
  WHERE c.id = p_classroom_id
    AND c.classroom_type = 'subject'
    AND c.status = 'active';

  IF project_org IS NULL
    OR NOT public.can_manage_education_research_classroom(p_classroom_id, project_org)
  THEN
    RAISE EXCEPTION 'you cannot create research in this classroom';
  END IF;

  INSERT INTO public.education_research_projects (
    org_id, classroom_id, created_by, title, topic, passing_threshold_percent
  ) VALUES (
    project_org, p_classroom_id, caller_id, btrim(p_title), btrim(p_topic), p_passing_threshold_percent
  ) RETURNING id INTO project_id;

  INSERT INTO public.education_research_participants (
    org_id, project_id, student_id, roster_order
  )
  SELECT project_org, project_id, cs.student_id, cs.roster_order
  FROM public.classroom_students cs
  WHERE cs.classroom_id = p_classroom_id
  ORDER BY cs.roster_order NULLS LAST, cs.joined_at, cs.student_id;

  GET DIAGNOSTICS participant_count = ROW_COUNT;
  IF participant_count = 0 THEN
    RAISE EXCEPTION 'the classroom must contain at least one registered student';
  END IF;

  FOREACH measurement_type IN ARRAY ARRAY['pretest', 'posttest']
  LOOP
    config := CASE WHEN measurement_type = 'pretest' THEN p_pretest ELSE p_posttest END;
    source_type := config->>'source_type';

    IF source_type NOT IN ('korkru_exam', 'manual', 'excel') THEN
      RAISE EXCEPTION 'unsupported research score source';
    END IF;

    IF source_type = 'korkru_exam' THEN
      IF measurement_type = 'posttest'
        AND COALESCE((config->>'reuse_pretest_snapshot')::boolean, false)
      THEN
        IF pre_snapshot_ids IS NULL THEN
          RAISE EXCEPTION 'the pretest must be a KorKru exam before its snapshot can be reused';
        END IF;
        source_ids := pre_source_ids;
        snapshot_ids := pre_snapshot_ids;
        source_sections := pre_source_sections;
        source_set_id := pre_source_set_id;
        selection_mode := 'same_as_pretest';
      ELSE
        SELECT COALESCE(array_agg(value::uuid ORDER BY ordinal), '{}')
          INTO source_ids
        FROM jsonb_array_elements_text(COALESCE(config->'question_ids', '[]'::jsonb))
          WITH ORDINALITY AS selected(value, ordinal);

        IF cardinality(source_ids) = 0
          OR cardinality(source_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(source_ids)))
        THEN
          RAISE EXCEPTION 'select at least one unique research question';
        END IF;

        selection_mode := config->>'selection_mode';
        IF selection_mode NOT IN ('set', 'sections', 'individual') THEN
          RAISE EXCEPTION 'invalid research question selection mode';
        END IF;

        source_set_id := NULLIF(config->>'source_set_id', '')::uuid;
        source_sections := COALESCE(config->'source_sections', '[]'::jsonb);
        IF selection_mode IN ('set', 'sections') THEN
          SELECT qs.question_ids INTO set_question_ids
          FROM public.question_sets qs
          WHERE qs.id = source_set_id AND qs.created_by = caller_id;

          IF set_question_ids IS NULL OR NOT (source_ids <@ set_question_ids) THEN
            RAISE EXCEPTION 'the selected folder does not contain every chosen question';
          END IF;
        ELSE
          source_set_id := NULL;
          source_sections := '[]'::jsonb;
        END IF;

        snapshot_ids := '{}';
        FOREACH source_id IN ARRAY source_ids
        LOOP
          INSERT INTO public.questions (
            org_id, created_by, category_id, grade_level, subject,
            title, question_text, question_type, difficulty, visibility,
            is_random, variables, logic_rules, answer_formula, answer_unit,
            answer_tolerance, answer_parts, mcq_options, solution_text,
            solution_image_urls, tags, image_urls, requires_work_image,
            extra_data, parent_question_id, group_id, order_in_group,
            rejected_reason, team_edit_allowed, is_research_snapshot,
            research_snapshot_project_id, research_snapshot_source_id
          )
          SELECT
            project_org, caller_id, NULL, q.grade_level, q.subject,
            q.title, q.question_text, q.question_type, q.difficulty, 'private',
            q.is_random, q.variables, q.logic_rules, q.answer_formula, q.answer_unit,
            q.answer_tolerance, q.answer_parts, q.mcq_options, q.solution_text,
            q.solution_image_urls, q.tags, q.image_urls, q.requires_work_image,
            q.extra_data, NULL, NULL, NULL,
            NULL, false, true, project_id, q.id
          FROM public.questions q
          WHERE q.id = source_id
            AND q.is_research_snapshot = false
            AND (
              q.created_by = caller_id
              OR q.visibility = 'public'
              OR (
                q.visibility IN ('organization', 'school')
                AND q.org_id = ANY(public.get_user_org_ids())
              )
              OR public.question_shared_with_my_orgs(q.id)
              OR public.is_super_admin()
            )
          RETURNING id INTO snapshot_id;

          IF snapshot_id IS NULL THEN
            RAISE EXCEPTION 'a selected question is missing or not available to this teacher';
          END IF;
          snapshot_ids := array_append(snapshot_ids, snapshot_id);
        END LOOP;
      END IF;

      SELECT SUM(public.education_research_question_max_score(q))
        INTO configured_max
      FROM public.questions q
      WHERE q.id = ANY(snapshot_ids);

      duration_value := COALESCE((config->>'duration_minutes')::integer, 30);
      IF duration_value NOT BETWEEN 1 AND 600 THEN
        RAISE EXCEPTION 'exam duration must be between 1 and 600 minutes';
      END IF;

      publish_mode := COALESCE(config->>'publish_mode', 'draft');
      IF publish_mode NOT IN ('draft', 'immediate', 'scheduled') THEN
        RAISE EXCEPTION 'invalid research exam publication mode';
      END IF;
      assignment_status_value := CASE
        WHEN publish_mode = 'draft' THEN 'draft'::public.assignment_status
        ELSE 'published'::public.assignment_status
      END;
      start_value := CASE
        WHEN publish_mode = 'scheduled' THEN NULLIF(config->>'start_at', '')::timestamptz
        ELSE NULL
      END;
      end_value := CASE
        WHEN publish_mode IN ('scheduled', 'immediate') THEN NULLIF(config->>'end_at', '')::timestamptz
        ELSE NULL
      END;
      IF publish_mode = 'scheduled' AND (start_value IS NULL OR end_value IS NULL OR start_value >= end_value) THEN
        RAISE EXCEPTION 'scheduled exams require a valid opening and closing time';
      END IF;

      access_code_value := upper(btrim(COALESCE(config->>'access_code', '')));
      IF access_code_value = '' THEN access_code_value := NULL; END IF;
      IF access_code_value IS NOT NULL AND access_code_value !~ '^[A-Z0-9-]{4,12}$' THEN
        RAISE EXCEPTION 'access code must contain 4-12 letters, numbers, or hyphens';
      END IF;

      remapped_sections := public.remap_education_research_sections(
        source_sections, source_ids, snapshot_ids
      );

      INSERT INTO public.assignments (
        org_id, classroom_id, created_by, title, description,
        question_ids, question_points, display_max_score, set_id,
        sections, show_sections, start_at, end_at, duration_minutes,
        status, mode, type, shuffle_questions, shuffle_options,
        show_results, max_attempts, score_strategy, access_code,
        passing_type, passing_value, require_work_image
      ) VALUES (
        project_org, p_classroom_id, caller_id,
        CASE measurement_type
          WHEN 'pretest' THEN 'แบบทดสอบก่อนเรียน: ' || btrim(p_topic)
          ELSE 'แบบทดสอบหลังเรียน: ' || btrim(p_topic)
        END,
        'สร้างจากโครงการวิจัย “' || btrim(p_title) || '” และควบคุมการเผยแพร่จากหน้าโครงการวิจัย',
        snapshot_ids, NULL, NULL, NULL,
        NULLIF(remapped_sections, '[]'::jsonb), true,
        start_value, end_value, duration_value,
        assignment_status_value, 'online', 'exam', false, true,
        'never', 1, 'latest', access_code_value,
        NULL, NULL,
        true
      ) RETURNING id INTO assignment_id;

      INSERT INTO public.assignment_classrooms (assignment_id, classroom_id)
      VALUES (assignment_id, p_classroom_id);

      INSERT INTO public.education_research_measurements (
        org_id, project_id, measurement_type, source_type, assignment_id,
        max_score, selection_mode, source_set_id, source_sections,
        source_question_ids, snapshot_question_ids, duration_minutes
      ) VALUES (
        project_org, project_id, measurement_type, source_type, assignment_id,
        configured_max, selection_mode, source_set_id, source_sections,
        source_ids, snapshot_ids, duration_value
      );

      IF measurement_type = 'pretest' THEN
        pre_source_ids := source_ids;
        pre_snapshot_ids := snapshot_ids;
        pre_source_sections := source_sections;
        pre_source_set_id := source_set_id;
        pre_assignment_published := assignment_status_value = 'published';
      ELSE
        post_assignment_published := assignment_status_value = 'published';
      END IF;
    ELSE
      configured_max := NULLIF(config->>'max_score', '')::numeric;
      IF configured_max IS NULL OR configured_max <= 0 OR configured_max > 100000 THEN
        RAISE EXCEPTION 'manual and Excel sources require a valid max score';
      END IF;

      INSERT INTO public.education_research_measurements (
        org_id, project_id, measurement_type, source_type, max_score
      ) VALUES (
        project_org, project_id, measurement_type, source_type, configured_max
      );
    END IF;

    IF measurement_type = 'pretest' THEN
      pretest_max := configured_max;
    ELSIF configured_max IS DISTINCT FROM pretest_max THEN
      RAISE EXCEPTION 'pretest and posttest max scores must be equal for paired analysis';
    END IF;
  END LOOP;

  IF post_assignment_published THEN
    UPDATE public.education_research_projects
    SET status = 'collecting_posttest'
    WHERE id = project_id;
  ELSIF pre_assignment_published THEN
    UPDATE public.education_research_projects
    SET status = 'collecting_pretest'
    WHERE id = project_id;
  END IF;

  RETURN project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.education_research_question_max_score(public.questions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remap_education_research_sections(jsonb, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_education_research_snapshot_question() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_education_research_project(text, text, uuid, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_education_research_project(text, text, uuid, numeric, jsonb, jsonb) TO authenticated;
