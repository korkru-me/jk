-- Expected optimistic-lock conflicts are application HTTP409 responses,
-- not PostgreSQL serialization failures (40001 -> HTTP500). PostgREST supports
-- PTxyz custom HTTP status SQLSTATEs; locks, RLS, grants and writes are unchanged.
-- https://docs.postgrest.org/en/v16/references/errors.html#custom-errors

CREATE OR REPLACE FUNCTION public.mutate_assignment_setting_preset(
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
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'preset_stale_revision';
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
