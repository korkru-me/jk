-- Private account preferences, not classroom/organization resources. This adds
-- only new tables/functions: it does not change assignments, submissions or SEB.
-- Application writes use a session-bound RPC; the owner is always auth.uid().

CREATE FUNCTION public.assignment_setting_preset_settings_valid(p_settings jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_value numeric;
  v_boolean_keys constant text[] := ARRAY[
    'shuffle_questions', 'shuffle_options', 'shared_random_values',
    'show_solutions', 'instant_check', 'instant_check_answer_key',
    'calculator_enabled', 'scratchpad_enabled', 'proctoring_enabled',
    'fullscreen_required', 'block_clipboard', 'exam_watermark_enabled',
    'streak_recycle_pool', 'show_question_sections', 'require_work_image'
  ];
  v_other_keys constant text[] := ARRAY[
    'duration_minutes', 'show_results', 'max_attempts', 'score_strategy',
    'retry_scope', 'questions_per_page', 'secure_browser_mode',
    'android_exam_mode', 'completion_rule', 'streak_target',
    'streak_question_cap', 'passing_type', 'passing_value',
    'random_question_count', 'display_max_score'
  ];
BEGIN
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object'
    OR octet_length(p_settings::text) > 8192 THEN
    RETURN false;
  END IF;

  -- Every v1 key is mandatory, including explicit JSON nulls. No title, IDs,
  -- question content, seed, access/quit password or SEB key can be smuggled in.
  IF NOT (p_settings ?& (v_boolean_keys || v_other_keys)) OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_settings) AS keys(key)
    WHERE NOT (keys.key = ANY (v_boolean_keys || v_other_keys))
  ) THEN
    RETURN false;
  END IF;
  FOREACH v_key IN ARRAY v_boolean_keys LOOP
    IF jsonb_typeof(p_settings -> v_key) <> 'boolean' THEN
      RETURN false;
    END IF;
  END LOOP;

  IF jsonb_typeof(p_settings -> 'show_results') <> 'string'
    OR p_settings ->> 'show_results' NOT IN ('immediate', 'score_only', 'after_due', 'never')
    OR jsonb_typeof(p_settings -> 'score_strategy') <> 'string'
    OR p_settings ->> 'score_strategy' NOT IN ('best', 'average', 'latest')
    OR jsonb_typeof(p_settings -> 'retry_scope') <> 'string'
    OR p_settings ->> 'retry_scope' NOT IN ('all', 'wrong_only')
    OR jsonb_typeof(p_settings -> 'secure_browser_mode') <> 'string'
    OR p_settings ->> 'secure_browser_mode' NOT IN ('browser', 'seb_required')
    OR jsonb_typeof(p_settings -> 'android_exam_mode') <> 'string'
    OR p_settings ->> 'android_exam_mode' NOT IN ('blocked', 'monitored')
    OR jsonb_typeof(p_settings -> 'completion_rule') <> 'string'
    OR p_settings ->> 'completion_rule' NOT IN ('fixed', 'streak') THEN
    RETURN false;
  END IF;

  FOREACH v_key IN ARRAY ARRAY[
    'duration_minutes', 'max_attempts', 'questions_per_page', 'streak_target',
    'streak_question_cap', 'random_question_count'
  ] LOOP
    IF jsonb_typeof(p_settings -> v_key) = 'null'
      AND v_key IN ('duration_minutes', 'max_attempts', 'streak_question_cap', 'random_question_count') THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(p_settings -> v_key) <> 'number' THEN
      RETURN false;
    END IF;
    v_value := (p_settings ->> v_key)::numeric;
    IF v_value <> trunc(v_value) OR v_value < (CASE WHEN v_key = 'streak_target' THEN 2 ELSE 1 END)
      OR v_value > (CASE v_key
        WHEN 'duration_minutes' THEN 525600
        WHEN 'questions_per_page' THEN 50
        WHEN 'streak_target' THEN 20
        WHEN 'streak_question_cap' THEN 200
        ELSE 10000
      END) THEN
      RETURN false;
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['passing_value', 'display_max_score'] LOOP
    IF jsonb_typeof(p_settings -> v_key) = 'null' THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(p_settings -> v_key) <> 'number' THEN
      RETURN false;
    END IF;
    v_value := (p_settings ->> v_key)::numeric;
    IF v_value <= 0 OR v_value > 1000000 THEN
      RETURN false;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_settings -> 'passing_type') = 'null' THEN
    RETURN jsonb_typeof(p_settings -> 'passing_value') = 'null';
  END IF;
  IF jsonb_typeof(p_settings -> 'passing_type') <> 'string'
    OR p_settings ->> 'passing_type' NOT IN ('score', 'percent')
    OR jsonb_typeof(p_settings -> 'passing_value') <> 'number' THEN
    RETURN false;
  END IF;
  RETURN p_settings ->> 'passing_type' <> 'percent'
    OR (p_settings ->> 'passing_value')::numeric <= 100;
END;
$$;
REVOKE ALL ON FUNCTION public.assignment_setting_preset_settings_valid(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.assignment_setting_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('exercise', 'exam')),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
  settings jsonb NOT NULL CHECK (public.assignment_setting_preset_settings_valid(settings)),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  revision integer NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483646),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (owner_id, assignment_type, slot),
  UNIQUE (id, owner_id, assignment_type)
);
CREATE UNIQUE INDEX assignment_setting_presets_name_unique
  ON public.assignment_setting_presets (owner_id, assignment_type, lower(name));

CREATE TABLE public.assignment_setting_preset_preferences (
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('exercise', 'exam')),
  default_preset_id uuid NOT NULL,
  PRIMARY KEY (owner_id, assignment_type),
  FOREIGN KEY (default_preset_id, owner_id, assignment_type)
    REFERENCES public.assignment_setting_presets(id, owner_id, assignment_type)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.assignment_setting_presets IS
  'Private account creation presets: three slots per exercise/exam type; no assignment content or credentials.';
COMMENT ON TABLE public.assignment_setting_preset_preferences IS
  'One default per account and type, constrained to a preset with the exact same owner/type.';

CREATE FUNCTION public.can_use_assignment_setting_presets()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.role IN ('teacher', 'admin') AND u.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.can_use_assignment_setting_presets() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_assignment_setting_presets() TO authenticated;

ALTER TABLE public.assignment_setting_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_setting_preset_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assignment_setting_presets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.assignment_setting_preset_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.assignment_setting_presets TO authenticated;
GRANT SELECT ON public.assignment_setting_preset_preferences TO authenticated;

CREATE POLICY assignment_setting_presets_read_own ON public.assignment_setting_presets
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND (SELECT public.can_use_assignment_setting_presets()));
CREATE POLICY assignment_setting_preset_preferences_read_own ON public.assignment_setting_preset_preferences
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND (SELECT public.can_use_assignment_setting_presets()));

CREATE FUNCTION public.mutate_assignment_setting_preset(
  p_type text,
  p_action text,
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_settings jsonb DEFAULT NULL,
  p_expected_revision integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_preset public.assignment_setting_presets%ROWTYPE;
  v_slot smallint;
  v_id uuid;
  v_name text;
BEGIN
  -- No owner/organization/role parameter. An admin manages only their own
  -- presets too. Lock the exact actor profile against a mid-write suspension.
  PERFORM 1 FROM public.users u
    WHERE u.id = v_owner AND u.role IN ('teacher', 'admin') AND u.status = 'active'
    FOR SHARE;
  IF v_owner IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'preset_access_denied';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('exercise', 'exam')
    OR p_action IS NULL OR p_action NOT IN ('create', 'update', 'rename', 'delete', 'default', 'clear_default') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
  END IF;

  -- All mutations, including allocation/default/delete, share this lock.
  -- The unique 1..3 slots also make a fourth row structurally impossible.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text || ':' || p_type, 7131));

  IF p_action = 'clear_default' THEN
    IF p_id IS NOT NULL OR p_name IS NOT NULL OR p_settings IS NOT NULL OR p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
    END IF;
    DELETE FROM public.assignment_setting_preset_preferences
      WHERE owner_id = v_owner AND assignment_type = p_type;
    RETURN NULL;
  END IF;

  IF p_action IN ('create', 'update', 'rename') THEN
    v_name := btrim(p_name);
    IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
    END IF;
  ELSIF p_name IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
  END IF;
  IF p_action IN ('create', 'update') THEN
    IF NOT public.assignment_setting_preset_settings_valid(p_settings) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_settings';
    END IF;
  ELSIF p_settings IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
  END IF;

  IF p_action = 'create' THEN
    IF p_id IS NOT NULL OR p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
    END IF;
    SELECT min(slots.slot)::smallint INTO v_slot
      FROM generate_series(1, 3) AS slots(slot)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.assignment_setting_presets p
        WHERE p.owner_id = v_owner AND p.assignment_type = p_type AND p.slot = slots.slot
      );
    IF v_slot IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'preset_quota';
    END IF;
    INSERT INTO public.assignment_setting_presets (owner_id, assignment_type, slot, name, settings)
      VALUES (v_owner, p_type, v_slot, v_name, p_settings)
      RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO v_preset FROM public.assignment_setting_presets p
    WHERE p.id = p_id AND p.owner_id = v_owner AND p.assignment_type = p_type
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'preset_access_denied';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preset_invalid_input';
  END IF;
  IF v_preset.revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'preset_stale_revision';
  END IF;

  IF p_action = 'update' THEN
    UPDATE public.assignment_setting_presets SET
      name = v_name, settings = p_settings,
      revision = revision + 1, updated_at = clock_timestamp()
      WHERE id = v_preset.id AND owner_id = v_owner AND assignment_type = p_type;
  ELSIF p_action = 'rename' THEN
    UPDATE public.assignment_setting_presets SET
      name = v_name, revision = revision + 1, updated_at = clock_timestamp()
      WHERE id = v_preset.id AND owner_id = v_owner AND assignment_type = p_type;
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.assignment_setting_presets
      WHERE id = v_preset.id AND owner_id = v_owner AND assignment_type = p_type;
  ELSIF p_action = 'default' THEN
    INSERT INTO public.assignment_setting_preset_preferences (owner_id, assignment_type, default_preset_id)
      VALUES (v_owner, p_type, v_preset.id)
      ON CONFLICT (owner_id, assignment_type) DO UPDATE
        SET default_preset_id = EXCLUDED.default_preset_id;
  END IF;
  RETURN v_preset.id;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_assignment_setting_preset(text, text, uuid, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_assignment_setting_preset(text, text, uuid, text, jsonb, integer)
  TO authenticated;
