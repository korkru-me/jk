-- กลุ่มย่อยในห้องเรียน และการมอบหมายงานให้เฉพาะบางกลุ่ม
--
-- ก่อนหน้านี้แท็บ "กลุ่มย่อย" เป็น state ในเบราว์เซอร์ล้วน ๆ (รีเฟรชแล้วหาย
-- และแสดงแค่ 20 คนแรกของห้อง) migration นี้ทำให้กลุ่มถูกบันทึกจริง แล้วให้งาน
-- ที่มอบหมายเลือกได้ว่าจะให้ทั้งห้องหรือเฉพาะบางกลุ่ม
--
-- 1. classroom_groups         — ชื่อ สีธีม และลำดับของกลุ่มในห้อง
-- 2. classroom_group_members  — นักเรียนหนึ่งคนอยู่ได้ไม่เกินหนึ่งกลุ่มต่อห้อง
--                               (ตรงกับหน้าจอที่มีกอง "ยังไม่ได้จัดกลุ่ม")
-- 3. assignment_classrooms.group_ids — NULL = ทั้งห้องเหมือนเดิม
--                               มีค่า = เฉพาะสมาชิกของกลุ่มเหล่านั้น
--                               '{}' = ไม่มีใครในห้องนั้น (กลุ่มที่เลือกถูกลบหมด)
-- 4. get_my_visible_assignment_ids() เคารพ group_ids — RLS ของ assignments และ
--    questions ที่อ้างฟังก์ชันนี้จึงตามไปเอง
--
-- group_ids เป็น array ไม่ใช่ตารางเชื่อมที่มี FK โดยตั้งใจ: ตอนลบกลุ่ม FK แบบ
-- cascade จะลบแถวเป้าหมายทิ้ง แล้วงานที่เคยมอบให้เฉพาะกลุ่มนั้นจะกลายเป็น
-- "ทั้งห้อง" เงียบ ๆ ส่วน id ที่ค้างใน array ไม่ตรงกับสมาชิกคนไหน งานจึงปิด
-- ต่อทุกคนแทน (fail closed) — server action ของการลบกลุ่มถอด id ออกให้ด้วย
-- เพื่อให้หน้าแก้ไขงานแสดงตรงกับความจริง

-- ── 1. classroom_groups ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  -- id ของสีหน้าปกห้องเรียน (COVER_PRESETS ใน classroom-meta.ts) ใช้ชุดเดียวกัน
  -- เพื่อให้สีตาม token ของธีมและโหมดมืด ไม่ใช่เลขสีตายตัว
  color        text NOT NULL DEFAULT 'purple'
               CHECK (color IN ('blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate')),
  position     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- ให้ classroom_group_members อ้าง (id, classroom_id) คู่กันได้ ฐานข้อมูลจึง
  -- รับประกันว่านักเรียนถูกจัดเข้ากลุ่มของห้องเดียวกับที่ตัวเองเรียนอยู่
  UNIQUE (id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_groups_classroom
  ON public.classroom_groups(classroom_id, position);

DROP TRIGGER IF EXISTS classroom_groups_updated_at ON public.classroom_groups;
CREATE TRIGGER classroom_groups_updated_at
  BEFORE UPDATE ON public.classroom_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 2. classroom_group_members ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_group_members (
  classroom_id uuid NOT NULL,
  student_id   uuid NOT NULL,
  group_id     uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- หนึ่งคนหนึ่งกลุ่มต่อห้อง: ย้ายกลุ่มคือ upsert แถวเดิม ไม่ใช่เพิ่มแถว
  PRIMARY KEY (classroom_id, student_id),
  FOREIGN KEY (group_id, classroom_id)
    REFERENCES public.classroom_groups(id, classroom_id) ON DELETE CASCADE,
  -- ออกจากห้อง (หรือถูกครูลบออก) = หลุดจากกลุ่มไปด้วย
  FOREIGN KEY (classroom_id, student_id)
    REFERENCES public.classroom_students(classroom_id, student_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classroom_group_members_group
  ON public.classroom_group_members(group_id);
-- get_my_visible_assignment_ids() ถามจากฝั่งนักเรียน
CREATE INDEX IF NOT EXISTS idx_classroom_group_members_student
  ON public.classroom_group_members(student_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- ครูเจ้าของห้องและผู้ช่วยสอน admin/manage จัดการได้ ผู้ช่วยสอน view ดูได้
-- นักเรียนไม่อ่านตารางเหล่านี้ตรง ๆ — การมองเห็นงานผ่าน SECURITY DEFINER ด้านล่าง
ALTER TABLE public.classroom_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classroom_groups_select" ON public.classroom_groups;
CREATE POLICY "classroom_groups_select" ON public.classroom_groups
  FOR SELECT TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage', 'view'])
  );

DROP POLICY IF EXISTS "classroom_groups_manage" ON public.classroom_groups;
CREATE POLICY "classroom_groups_manage" ON public.classroom_groups
  FOR ALL TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  )
  WITH CHECK (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  );

DROP POLICY IF EXISTS "classroom_group_members_select" ON public.classroom_group_members;
CREATE POLICY "classroom_group_members_select" ON public.classroom_group_members
  FOR SELECT TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage', 'view'])
  );

DROP POLICY IF EXISTS "classroom_group_members_manage" ON public.classroom_group_members;
CREATE POLICY "classroom_group_members_manage" ON public.classroom_group_members
  FOR ALL TO authenticated
  USING (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  )
  WITH CHECK (
    classroom_id = ANY(get_my_teaching_classroom_ids())
    OR is_classroom_co_teacher(classroom_id, ARRAY['admin', 'manage'])
  );

REVOKE ALL ON public.classroom_groups FROM anon;
REVOKE ALL ON public.classroom_group_members FROM anon;

-- ── 3. assignment_classrooms.group_ids ─────────────────────────────────────
ALTER TABLE public.assignment_classrooms
  ADD COLUMN IF NOT EXISTS group_ids uuid[];

COMMENT ON COLUMN public.assignment_classrooms.group_ids IS
  'NULL = ทั้งห้อง; มีค่า = เฉพาะสมาชิกของ classroom_groups เหล่านี้ในห้องนั้น; ว่าง = ไม่มีใคร';

-- ── 4. การมองเห็นงานของนักเรียน ───────────────────────────────────────────
-- เดิม: งานที่เผยแพร่แล้วและผูกกับห้องที่นักเรียนอยู่
-- ใหม่: เหมือนเดิม แต่ลิงก์ที่มี group_ids ต้องมีนักเรียนอยู่ในกลุ่มใดกลุ่มหนึ่ง
--       — ยกเว้นคนที่มี submission ของงานนั้นแล้ว ครูย้ายกลุ่มทีหลังจึงไม่ทำให้
--       งานที่นักเรียนทำไปแล้วหายไปจากหน้าของเขา
CREATE OR REPLACE FUNCTION public.get_my_visible_assignment_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT a.id
    FROM public.assignments a
    WHERE a.status = 'published'
      AND EXISTS (
        SELECT 1 FROM public.assignment_classrooms ac
        WHERE ac.assignment_id = a.id
          AND ac.classroom_id = ANY(get_my_enrolled_classroom_ids())
          AND (
            ac.group_ids IS NULL
            OR EXISTS (
              SELECT 1 FROM public.classroom_group_members m
              WHERE m.classroom_id = ac.classroom_id
                AND m.student_id = auth.uid()
                AND m.group_id = ANY(ac.group_ids)
            )
            OR EXISTS (
              SELECT 1 FROM public.submissions s
              WHERE s.assignment_id = a.id
                AND s.student_id = auth.uid()
            )
          )
      )
  ), ARRAY[]::uuid[]);
$$;
