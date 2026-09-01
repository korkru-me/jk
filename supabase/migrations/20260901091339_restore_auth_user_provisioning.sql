-- Restore the complete signup contract after later profile migrations replaced
-- handle_new_user() and accidentally dropped personal-organization creation.
-- Keep the operation idempotent so orphan recovery in the application can use
-- the same database boundary without creating duplicate personal workspaces.

CREATE OR REPLACE FUNCTION public.ensure_personal_organization(
  p_user_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  personal_org_id uuid;
  resolved_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'cannot provision organization for an unknown user'
      USING ERRCODE = '23503';
  END IF;

  -- Serialize provisioning for one account. Auth callbacks and recovery code
  -- may reach this helper at the same time, while the schema has no direct
  -- owner_id column on organizations that could carry a unique constraint.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT o.id
    INTO personal_org_id
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.org_id
   WHERE om.user_id = p_user_id
     AND o.is_personal = true
   ORDER BY om.joined_at ASC
   LIMIT 1;

  IF personal_org_id IS NOT NULL THEN
    UPDATE public.organizations
       SET deleted_at = NULL
     WHERE id = personal_org_id
       AND deleted_at IS NOT NULL;
    RETURN personal_org_id;
  END IF;

  SELECT COALESCE(
           NULLIF(btrim(p_display_name), ''),
           NULLIF(btrim(u.full_name), ''),
           NULLIF(split_part(u.email, '@', 1), ''),
           'ผู้ใช้ KorKru'
         )
    INTO resolved_name
    FROM public.users u
   WHERE u.id = p_user_id;

  INSERT INTO public.organizations (name, is_personal, subscription_tier)
  VALUES (resolved_name || ' — พื้นที่ส่วนตัว', true, 'free')
  RETURNING id INTO personal_org_id;

  INSERT INTO public.organization_members (org_id, user_id, org_role)
  VALUES (personal_org_id, p_user_id, 'owner');

  RETURN personal_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_organization(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_personal_organization(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role public.user_role;
  survey_r text;
  instructor_r text;
  display_name text;
BEGIN
  survey_r := CASE
    WHEN NEW.raw_user_meta_data->>'survey_role' IN ('teacher', 'tutor', 'student', 'parent', 'other')
      THEN NEW.raw_user_meta_data->>'survey_role'
    ELSE NULL
  END;

  requested_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'teacher'
      OR survey_r IN ('teacher', 'tutor')
      THEN 'teacher'::public.user_role
    ELSE 'student'::public.user_role
  END;

  instructor_r := CASE
    WHEN survey_r IN ('teacher', 'tutor') THEN survey_r
    WHEN requested_role = 'teacher'::public.user_role THEN 'teacher'
    ELSE NULL
  END;

  display_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(NEW.email, '@', 1), ''),
    'ผู้ใช้ KorKru'
  );

  INSERT INTO public.users (
    id,
    email,
    full_name,
    prefix,
    first_name,
    last_name,
    role,
    instructor_type,
    survey_role,
    role_custom,
    subject_group,
    subject_group_other
  )
  VALUES (
    NEW.id,
    NEW.email,
    display_name,
    NEW.raw_user_meta_data->>'prefix',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    requested_role,
    instructor_r,
    survey_r,
    NEW.raw_user_meta_data->>'role_custom',
    NEW.raw_user_meta_data->>'subject_group',
    NEW.raw_user_meta_data->>'subject_group_other'
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.ensure_personal_organization(NEW.id, display_name);
  RETURN NEW;
END;
$$;

-- Accounts created since 20260823081036 have a profile but may have missed the
-- personal organization. Repair only that invariant; existing team/school
-- memberships and resource ownership remain untouched.
DO $$
DECLARE
  account record;
BEGIN
  FOR account IN
    SELECT u.id, u.full_name
      FROM public.users u
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.organization_members om
         JOIN public.organizations o ON o.id = om.org_id
        WHERE om.user_id = u.id
          AND o.is_personal = true
          AND o.deleted_at IS NULL
     )
  LOOP
    PERFORM public.ensure_personal_organization(account.id, account.full_name);
  END LOOP;
END;
$$;
