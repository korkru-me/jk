-- หมวดงานต่อห้องเรียน
--
-- งานเดียวกันอาจถูกมอบหมายหลายห้อง แต่ครูอาจจัดหมวดต่างกันในแต่ละห้อง
-- หมวดจึงผูกกับ assignment_classrooms ไม่ใช่ assignments โดยตรง
-- นักเรียนอ่านชื่อ/สี/ลำดับหมวดของห้องที่ตนเรียนได้เพื่อให้หน้ารายการงานจัด
-- กลุ่มเหมือนฝั่งครู แต่แก้ไขได้เฉพาะเจ้าของห้องและครูร่วม admin/manage

CREATE TABLE public.classroom_assignment_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  color        text NOT NULL DEFAULT 'purple'
               CHECK (color IN ('blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate')),
  position     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, classroom_id)
);

CREATE INDEX idx_classroom_assignment_categories_classroom
  ON public.classroom_assignment_categories(classroom_id, position, created_at);

CREATE UNIQUE INDEX idx_classroom_assignment_categories_unique_name
  ON public.classroom_assignment_categories(classroom_id, lower(btrim(name)));

CREATE TRIGGER classroom_assignment_categories_updated_at
  BEFORE UPDATE ON public.classroom_assignment_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.classroom_assignment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom_assignment_categories_select"
  ON public.classroom_assignment_categories
  FOR SELECT TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR classroom_id = ANY(get_my_enrolled_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage', 'view'])
  );

CREATE POLICY "classroom_assignment_categories_manage"
  ON public.classroom_assignment_categories
  FOR ALL TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  )
  WITH CHECK (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  );

REVOKE ALL ON public.classroom_assignment_categories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_assignment_categories TO authenticated;

ALTER TABLE public.assignment_classrooms
  ADD COLUMN category_id uuid REFERENCES public.classroom_assignment_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_assignment_classrooms_category
  ON public.assignment_classrooms(category_id)
  WHERE category_id IS NOT NULL;

COMMENT ON COLUMN public.assignment_classrooms.category_id IS
  'หมวดงานของลิงก์นี้ภายในห้องเดียวกัน; NULL = ยังไม่จัดหมวด';

-- FK ด้านบนทำให้ลบหมวดแล้วงานยังอยู่และกลับเป็นยังไม่จัดหมวด ส่วน trigger นี้
-- ป้องกันการนำ category_id ของห้องหนึ่งไปใส่ลิงก์งานของอีกห้อง
CREATE FUNCTION public.enforce_assignment_category_classroom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.classroom_assignment_categories category
    WHERE category.id = NEW.category_id
      AND category.classroom_id = NEW.classroom_id
  ) THEN
    RAISE EXCEPTION 'assignment category must belong to the linked classroom'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assignment_classrooms_category_same_classroom
  BEFORE INSERT OR UPDATE OF classroom_id, category_id ON public.assignment_classrooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_category_classroom();

-- The fail-closed SEB S5 cleanup RPC verifies the exact classroom dependency
-- graph. Add this reviewed child table to that graph so later QA cleanup keeps
-- working, while still requiring a synthetic classroom to own zero categories
-- before it may be deleted.
DO $$
DECLARE
  v_definition text;
  v_lock_old text := $old$    lock table public.assignment_classrooms, public.assignments,
      public.classroom_groups, public.classroom_co_teachers, public.classroom_invitations,$old$;
  v_lock_new text := $new$    lock table public.assignment_classrooms, public.assignments,
      public.classroom_assignment_categories, public.classroom_groups,
      public.classroom_co_teachers, public.classroom_invitations,$new$;
  v_signature_old text := $old$      'assignments:classroom_id.eq',
      'classroom_groups:classroom_id.eq',
      'classroom_co_teachers:classroom_id.eq',$old$;
  v_signature_new text := $new$      'assignments:classroom_id.eq',
      'classroom_assignment_categories:classroom_id.eq',
      'classroom_groups:classroom_id.eq',
      'classroom_co_teachers:classroom_id.eq',$new$;
  v_fk_old text := $old$      'assignments(classroom_id)->classrooms(id):c',
      'classroom_groups(classroom_id)->classrooms(id):c',
      'classroom_co_teachers(classroom_id)->classrooms(id):c',$old$;
  v_fk_new text := $new$      'assignments(classroom_id)->classrooms(id):c',
      'classroom_assignment_categories(classroom_id)->classrooms(id):c',
      'classroom_groups(classroom_id)->classrooms(id):c',
      'classroom_co_teachers(classroom_id)->classrooms(id):c',$new$;
  v_field_old text := $old$          ('classrooms','org_id'),('classroom_groups','classroom_id'),('classroom_co_teachers','classroom_id'),('classroom_invitations','classroom_id'),('classroom_posts','classroom_id'),('classroom_students','classroom_id'),$old$;
  v_field_new text := $new$          ('classrooms','org_id'),('classroom_assignment_categories','classroom_id'),('classroom_groups','classroom_id'),('classroom_co_teachers','classroom_id'),('classroom_invitations','classroom_id'),('classroom_posts','classroom_id'),('classroom_students','classroom_id'),$new$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(proc.oid)
    INTO STRICT v_definition
  FROM pg_catalog.pg_proc proc
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'seb_s5_delete_exact_cleanup_target'
    AND pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  IF length(v_definition) - length(replace(v_definition, v_lock_old, '')) <> length(v_lock_old)
    OR position(v_lock_new IN v_definition) <> 0
  THEN RAISE EXCEPTION 'unexpected assignment-category cleanup source: lock' USING ERRCODE = '55000'; END IF;
  IF length(v_definition) - length(replace(v_definition, v_signature_old, '')) <> length(v_signature_old)
    OR position(v_signature_new IN v_definition) <> 0
  THEN RAISE EXCEPTION 'unexpected assignment-category cleanup source: signature' USING ERRCODE = '55000'; END IF;
  IF length(v_definition) - length(replace(v_definition, v_fk_old, '')) <> length(v_fk_old)
    OR position(v_fk_new IN v_definition) <> 0
  THEN RAISE EXCEPTION 'unexpected assignment-category cleanup source: foreign-key' USING ERRCODE = '55000'; END IF;
  IF length(v_definition) - length(replace(v_definition, v_field_old, '')) <> length(v_field_old)
    OR position(v_field_new IN v_definition) <> 0
  THEN RAISE EXCEPTION 'unexpected assignment-category cleanup source: field' USING ERRCODE = '55000'; END IF;

  v_definition := replace(v_definition, v_lock_old, v_lock_new);
  v_definition := replace(v_definition, v_signature_old, v_signature_new);
  v_definition := replace(v_definition, v_fk_old, v_fk_new);
  v_definition := replace(v_definition, v_field_old, v_field_new);
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(proc.oid)
    INTO STRICT v_definition
  FROM pg_catalog.pg_proc proc
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'seb_s5_delete_exact_cleanup_target'
    AND pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_qa_namespace text, p_request jsonb';

  IF length(v_definition) - length(replace(v_definition, v_lock_new, '')) <> length(v_lock_new)
    OR length(v_definition) - length(replace(v_definition, v_signature_new, '')) <> length(v_signature_new)
    OR length(v_definition) - length(replace(v_definition, v_fk_new, '')) <> length(v_fk_new)
    OR length(v_definition) - length(replace(v_definition, v_field_new, '')) <> length(v_field_new)
    OR position(v_lock_old IN v_definition) <> 0
    OR position(v_signature_old IN v_definition) <> 0
    OR position(v_fk_old IN v_definition) <> 0
    OR position(v_field_old IN v_definition) <> 0
  THEN
    RAISE EXCEPTION 'assignment-category cleanup patch verification failed' USING ERRCODE = '55000';
  END IF;
END
$$;
