-- Keep the pre-settings editor callable while database and website releases
-- roll forward. Preserve the saved settings instead of supplying new defaults.
CREATE FUNCTION public.update_practice_library_draft(
  p_library_id uuid,
  p_title text,
  p_description text,
  p_reveal_answer_key boolean,
  p_question_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_settings record;
BEGIN
  SELECT library.access_code, library.calculator_enabled,
    library.scratchpad_enabled, library.shuffle_questions, library.shuffle_options
  INTO v_settings
  FROM public.practice_libraries library
  WHERE library.id = p_library_id
    AND public.current_user_can_manage_practice_classroom(library.classroom_id)
  FOR UPDATE OF library;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice draft update is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN public.update_practice_library_draft(
    p_library_id, p_title, p_description, p_reveal_answer_key,
    v_settings.access_code, v_settings.calculator_enabled,
    v_settings.scratchpad_enabled, v_settings.shuffle_questions,
    v_settings.shuffle_options, p_question_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_practice_library_draft(uuid, text, text, boolean, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_practice_library_draft(uuid, text, text, boolean, uuid[])
  TO authenticated;
