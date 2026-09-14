-- Judge an ioc_forms row by its own columns, not by looking it up again.
--
-- The phase 1 policies asked `can_manage_ioc_form(id, org_id)`, which selects
-- the form out of `public.ioc_forms` to read `created_by`. That works for a row
-- that already exists, and fails for the row being written: the helper is
-- STABLE, so it sees the snapshot from the start of the statement, and the row
-- an INSERT is creating is not in it. Creating a form therefore failed on its
-- own RETURNING clause with "new row violates row-level security policy",
-- which reads like a permission problem and is really a visibility one.
--
-- Found by creating a form through the UI after the phase 1 migration was
-- applied. Nothing had exercised these policies before that.
--
-- The rule itself does not change. It moves into a function that takes the
-- three columns it needs, so it can be applied to a row in flight, and the
-- lookup version is kept for the child tables, where the parent form always
-- exists by the time they are written.

CREATE FUNCTION public.can_manage_ioc_form_row(
  p_created_by uuid,
  p_classroom_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR p_created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.classrooms c
      WHERE c.id = p_classroom_id
        AND c.org_id = p_org_id
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

COMMENT ON FUNCTION public.can_manage_ioc_form_row(uuid, uuid, uuid) IS
  'The manage rule for one IOC form, taking the row''s own columns so it can also judge a row being inserted.';

REVOKE ALL ON FUNCTION public.can_manage_ioc_form_row(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ioc_form_row(uuid, uuid, uuid) TO authenticated;

-- One rule in one place: the lookup version now answers by reading the row and
-- asking the row version.
CREATE OR REPLACE FUNCTION public.can_manage_ioc_form(
  p_form_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ioc_forms f
    WHERE f.id = p_form_id
      AND f.org_id = p_org_id
      AND public.can_manage_ioc_form_row(f.created_by, f.classroom_id, f.org_id)
  );
$$;

DROP POLICY ioc_forms_select ON public.ioc_forms;
DROP POLICY ioc_forms_update ON public.ioc_forms;
DROP POLICY ioc_forms_delete ON public.ioc_forms;

CREATE POLICY ioc_forms_select ON public.ioc_forms
  FOR SELECT TO authenticated
  USING (public.can_manage_ioc_form_row(created_by, classroom_id, org_id));

CREATE POLICY ioc_forms_update ON public.ioc_forms
  FOR UPDATE TO authenticated
  USING (public.can_manage_ioc_form_row(created_by, classroom_id, org_id))
  -- The updated row must still belong to someone who may manage it, so a form
  -- cannot be handed to a classroom the editor has no rights in.
  WITH CHECK (
    public.can_manage_ioc_form_row(created_by, classroom_id, org_id)
    AND org_id = ANY (public.get_user_org_ids())
  );

CREATE POLICY ioc_forms_delete ON public.ioc_forms
  FOR DELETE TO authenticated
  USING (public.can_manage_ioc_form_row(created_by, classroom_id, org_id));
