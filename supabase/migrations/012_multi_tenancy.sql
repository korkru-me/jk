-- =============================================================================
-- Migration 012: B2B SaaS Multi-tenancy Architecture
--
-- IMPORTANT: Run each PHASE separately and verify before proceeding.
-- This migration is IRREVERSIBLE after Phase 4 (NOT NULL added).
--
-- Phases:
--   Phase 1 — New tables (organizations, organization_members, super_admins)
--   Phase 2 — Helper functions (SECURITY DEFINER, no recursion)
--   Phase 3 — Add org_id columns (nullable), backfill from existing data
--   Phase 4 — Enforce NOT NULL + immutability trigger
--   Phase 5 — Drop ALL old RLS policies, install new multi-tenant policies
--   Phase 6 — Update handle_new_user() trigger for auto-org creation
-- =============================================================================


-- =============================================================================
-- PHASE 1: New Core Tables
-- =============================================================================

-- 1a. Organizations (สถาบัน)
CREATE TABLE IF NOT EXISTS public.organizations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  slug              text        UNIQUE,                          -- URL-friendly identifier
  subscription_tier text        NOT NULL DEFAULT 'free'
                                CHECK (subscription_tier IN ('free', 'tutor', 'school')),
  is_personal       boolean     NOT NULL DEFAULT false,          -- auto-created personal org
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz                                  -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 1b. Organization Members (ความสัมพันธ์ user ↔ org พร้อม role ภายใน org)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  org_role   text        NOT NULL DEFAULT 'teacher'
                         CHECK (org_role IN ('owner', 'admin', 'teacher', 'student')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org    ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user   ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role   ON public.organization_members(org_role);

-- 1c. Super Admins (แยกออกจาก users.role เพื่อป้องกัน privilege escalation)
--     มีแค่ไม่กี่คน — เพิ่มด้วยมือผ่าน Supabase Dashboard เท่านั้น
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- PHASE 2: Helper Functions (SECURITY DEFINER — ป้องกัน infinite recursion)
-- =============================================================================

-- 2a. ดึง org_ids ทั้งหมดของ user ที่ login อยู่
--     SECURITY DEFINER: รันในฐานะ owner ของ function (postgres) → bypass RLS ของตัวเอง
--     STABLE: Postgres cache ผลลัพธ์ไว้ใน transaction เดียวกัน → เร็วขึ้น
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT org_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    ),
    ARRAY[]::uuid[]
  );
$$;

-- 2b. ดึง org_id หลักของ user (personal org หรือ org ที่เข้าร่วมล่าสุด)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at ASC   -- personal org ถูกสร้างแรก → ลำดับแรกเสมอ
  LIMIT 1;
$$;

-- 2c. ตรวจสอบว่า user เป็น super admin หรือไม่
--     ใช้ในทุก RLS policy เพื่อ bypass isolation
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()
  );
$$;

-- 2d. ตรวจสอบ org_role ของ user ใน org ที่กำหนด
CREATE OR REPLACE FUNCTION public.get_org_role(p_org_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_role
  FROM public.organization_members
  WHERE user_id = auth.uid() AND org_id = p_org_id
  LIMIT 1;
$$;


-- =============================================================================
-- PHASE 3: Add org_id to Resource Tables (nullable first for safe backfill)
-- =============================================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.submission_answers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Indexes for all org_id columns (critical for RLS performance)
CREATE INDEX IF NOT EXISTS idx_questions_org         ON public.questions(org_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_org        ON public.classrooms(org_id);
CREATE INDEX IF NOT EXISTS idx_assignments_org       ON public.assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_submissions_org       ON public.submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_org ON public.submission_answers(org_id);


-- =============================================================================
-- PHASE 3b: Backfill — สร้าง personal org สำหรับ user ที่มีอยู่แล้ว
-- =============================================================================

DO $$
DECLARE
  u       RECORD;
  new_org uuid;
BEGIN
  FOR u IN
    -- user ที่ยังไม่มี org
    SELECT id, full_name, email
    FROM public.users
    WHERE id NOT IN (SELECT user_id FROM public.organization_members)
  LOOP
    -- สร้าง personal org
    INSERT INTO public.organizations (name, is_personal, subscription_tier)
    VALUES (u.full_name || '''s Workspace', true, 'free')
    RETURNING id INTO new_org;

    -- เพิ่ม user เป็น owner
    INSERT INTO public.organization_members (org_id, user_id, org_role)
    VALUES (new_org, u.id, 'owner');
  END LOOP;
END $$;

-- Backfill org_id บน resource tables จาก owner ของ resource
UPDATE public.questions q
SET org_id = (
  SELECT om.org_id
  FROM public.organization_members om
  WHERE om.user_id = q.created_by AND om.org_role = 'owner'
  LIMIT 1
)
WHERE q.org_id IS NULL;

UPDATE public.classrooms c
SET org_id = (
  SELECT om.org_id
  FROM public.organization_members om
  WHERE om.user_id = c.teacher_id AND om.org_role = 'owner'
  LIMIT 1
)
WHERE c.org_id IS NULL;

-- assignments ← ดึงจาก classroom
UPDATE public.assignments a
SET org_id = (
  SELECT c.org_id FROM public.classrooms c WHERE c.id = a.classroom_id
)
WHERE a.org_id IS NULL;

-- submissions ← ดึงจาก assignment
UPDATE public.submissions s
SET org_id = (
  SELECT a.org_id FROM public.assignments a WHERE a.id = s.assignment_id
)
WHERE s.org_id IS NULL;

-- submission_answers ← ดึงจาก submission
UPDATE public.submission_answers sa
SET org_id = (
  SELECT s.org_id FROM public.submissions s WHERE s.id = sa.submission_id
)
WHERE sa.org_id IS NULL;


-- =============================================================================
-- PHASE 4: Enforce NOT NULL + Immutability Trigger
-- =============================================================================

-- ตรวจสอบว่า backfill เสร็จก่อน (จะ error ถ้ายังมี NULL)
ALTER TABLE public.questions           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.classrooms          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.assignments         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.submissions         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.submission_answers  ALTER COLUMN org_id SET NOT NULL;

-- ป้องกันการเปลี่ยน org_id หลังสร้าง (ห้ามย้ายโจทย์ข้ามสถาบัน)
CREATE OR REPLACE FUNCTION public.prevent_org_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION
      'org_id is immutable — cannot move resource across organizations (table: %, id: %)',
      TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['questions','classrooms','assignments','submissions','submission_answers']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS prevent_org_id_change ON public.%I;
      CREATE TRIGGER prevent_org_id_change
        BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_change();
    ', tbl, tbl);
  END LOOP;
END $$;


-- =============================================================================
-- PHASE 5: Drop ALL Old Policies → Install Multi-tenant RLS Policies
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- ORGANIZATIONS
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_member_select" ON public.organizations;
CREATE POLICY "org_member_select" ON public.organizations
  FOR SELECT USING (
    is_super_admin()
    OR id = ANY(get_user_org_ids())
  );

DROP POLICY IF EXISTS "org_owner_update" ON public.organizations;
CREATE POLICY "org_owner_update" ON public.organizations
  FOR UPDATE USING (
    is_super_admin()
    OR get_org_role(id) IN ('owner', 'admin')
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- ORGANIZATION MEMBERS
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT USING (
    is_super_admin()
    OR org_id = ANY(get_user_org_ids())
  );

DROP POLICY IF EXISTS "org_members_insert" ON public.organization_members;
CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR get_org_role(org_id) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "org_members_delete" ON public.organization_members;
CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE USING (
    is_super_admin()
    OR get_org_role(org_id) IN ('owner', 'admin')
    OR user_id = auth.uid()
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- USERS
-- ──────────────────────────────────────────────────────────────────────────────
-- ลบ policy เก่าที่ทำให้เกิด infinite recursion
DROP POLICY IF EXISTS "users_select_own"        ON public.users;
DROP POLICY IF EXISTS "users_update_own"        ON public.users;
DROP POLICY IF EXISTS "admins_read_all_users"   ON public.users;
DROP POLICY IF EXISTS "admins_update_users"     ON public.users;

-- อ่านตัวเอง
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- อ่านสมาชิกใน org เดียวกัน (ครูดู roster นักเรียนได้)
DROP POLICY IF EXISTS "users_select_org_members" ON public.users;
CREATE POLICY "users_select_org_members" ON public.users
  FOR SELECT USING (
    is_super_admin()
    OR id IN (
      SELECT user_id FROM public.organization_members
      WHERE org_id = ANY(get_user_org_ids())
    )
  );

-- แก้ไขตัวเอง
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- super admin แก้ไข user ใดก็ได้
DROP POLICY IF EXISTS "users_super_admin_all" ON public.users;
CREATE POLICY "users_super_admin_all" ON public.users
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- QUESTIONS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "questions_creator_all"       ON public.questions;
DROP POLICY IF EXISTS "questions_public_select"     ON public.questions;
DROP POLICY IF EXISTS "questions_student_assigned"  ON public.questions;
DROP POLICY IF EXISTS "admins_read_all_questions"   ON public.questions;
DROP POLICY IF EXISTS "admins_update_questions"     ON public.questions;
DROP POLICY IF EXISTS "admins_delete_questions"     ON public.questions;

-- Creator จัดการโจทย์ของตัวเอง (ต้องอยู่ใน org เดียวกัน)
DROP POLICY IF EXISTS "questions_creator_all" ON public.questions;
CREATE POLICY "questions_creator_all" ON public.questions
  FOR ALL USING (
    created_by = auth.uid()
    AND org_id = ANY(get_user_org_ids())
  );

-- สมาชิกใน org อ่านโจทย์ visibility='school' ได้
DROP POLICY IF EXISTS "questions_org_school_select" ON public.questions;
CREATE POLICY "questions_org_school_select" ON public.questions
  FOR SELECT USING (
    visibility = 'school'
    AND org_id = ANY(get_user_org_ids())
  );

-- โจทย์ public ทุกคนอ่านได้ (Fork & Remix ข้ามสถาบัน)
DROP POLICY IF EXISTS "questions_public_select" ON public.questions;
CREATE POLICY "questions_public_select" ON public.questions
  FOR SELECT USING (visibility = 'public');

-- นักเรียนอ่านโจทย์ที่ถูก assign ให้ตัวเอง (แม้ visibility=private)
DROP POLICY IF EXISTS "questions_student_assigned" ON public.questions;
CREATE POLICY "questions_student_assigned" ON public.questions
  FOR SELECT USING (
    id = ANY(
      SELECT UNNEST(a.question_ids)
      FROM public.assignments a
      JOIN public.classroom_students cs ON cs.classroom_id = a.classroom_id
      WHERE cs.student_id = auth.uid()
        AND a.status = 'published'
    )
  );

-- Super admin อ่าน/แก้/ลบ ทุกโจทย์ได้
DROP POLICY IF EXISTS "questions_super_admin_all" ON public.questions;
CREATE POLICY "questions_super_admin_all" ON public.questions
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- CLASSROOMS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "classrooms_teacher_all"    ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_student_select" ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_org_teacher_all" ON public.classrooms;
CREATE POLICY "classrooms_org_teacher_all" ON public.classrooms
  FOR ALL USING (
    teacher_id = auth.uid()
    AND org_id = ANY(get_user_org_ids())
  );

DROP POLICY IF EXISTS "classrooms_org_admin_select" ON public.classrooms;
CREATE POLICY "classrooms_org_admin_select" ON public.classrooms
  FOR SELECT USING (
    org_id = ANY(get_user_org_ids())
    AND get_org_role(org_id) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "classrooms_student_select" ON public.classrooms;
CREATE POLICY "classrooms_student_select" ON public.classrooms
  FOR SELECT USING (
    id IN (
      SELECT classroom_id FROM public.classroom_students WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "classrooms_super_admin_all" ON public.classrooms;
CREATE POLICY "classrooms_super_admin_all" ON public.classrooms
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- CLASSROOM STUDENTS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "classroom_students_teacher_select" ON public.classroom_students;
DROP POLICY IF EXISTS "classroom_students_join"           ON public.classroom_students;
DROP POLICY IF EXISTS "classroom_students_own_select"     ON public.classroom_students;

DROP POLICY IF EXISTS "classroom_students_teacher_select" ON public.classroom_students;
CREATE POLICY "classroom_students_teacher_select" ON public.classroom_students
  FOR SELECT USING (
    classroom_id IN (
      SELECT id FROM public.classrooms WHERE teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "classroom_students_join" ON public.classroom_students;
CREATE POLICY "classroom_students_join" ON public.classroom_students
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "classroom_students_own_select" ON public.classroom_students;
CREATE POLICY "classroom_students_own_select" ON public.classroom_students
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "classroom_students_super_admin_all" ON public.classroom_students;
CREATE POLICY "classroom_students_super_admin_all" ON public.classroom_students
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- ASSIGNMENTS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "assignments_teacher_all"   ON public.assignments;
DROP POLICY IF EXISTS "assignments_student_view"  ON public.assignments;
DROP POLICY IF EXISTS "assignments_student_select" ON public.assignments;

DROP POLICY IF EXISTS "assignments_org_teacher_all" ON public.assignments;
CREATE POLICY "assignments_org_teacher_all" ON public.assignments
  FOR ALL USING (
    created_by = auth.uid()
    AND org_id = ANY(get_user_org_ids())
  );

DROP POLICY IF EXISTS "assignments_student_select" ON public.assignments;
CREATE POLICY "assignments_student_select" ON public.assignments
  FOR SELECT USING (
    status = 'published'
    AND classroom_id IN (
      SELECT classroom_id FROM public.classroom_students WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assignments_super_admin_all" ON public.assignments;
CREATE POLICY "assignments_super_admin_all" ON public.assignments
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- SUBMISSIONS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "submissions_student_all"     ON public.submissions;
DROP POLICY IF EXISTS "submissions_teacher_select"  ON public.submissions;
DROP POLICY IF EXISTS "submissions_student_own"     ON public.submissions;
DROP POLICY IF EXISTS "submissions_teacher_view"    ON public.submissions;

DROP POLICY IF EXISTS "submissions_student_own" ON public.submissions;
CREATE POLICY "submissions_student_own" ON public.submissions
  FOR ALL USING (student_id = auth.uid());

DROP POLICY IF EXISTS "submissions_org_teacher_select" ON public.submissions;
CREATE POLICY "submissions_org_teacher_select" ON public.submissions
  FOR SELECT USING (
    org_id = ANY(get_user_org_ids())
    AND assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "submissions_super_admin_all" ON public.submissions;
CREATE POLICY "submissions_super_admin_all" ON public.submissions
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- SUBMISSION ANSWERS
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "submission_answers_student_all"    ON public.submission_answers;
DROP POLICY IF EXISTS "submission_answers_teacher_select" ON public.submission_answers;
DROP POLICY IF EXISTS "submission_answers_student_own"    ON public.submission_answers;
DROP POLICY IF EXISTS "submission_answers_teacher_view"   ON public.submission_answers;

DROP POLICY IF EXISTS "submission_answers_student_own" ON public.submission_answers;
CREATE POLICY "submission_answers_student_own" ON public.submission_answers
  FOR ALL USING (
    submission_id IN (
      SELECT id FROM public.submissions WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "submission_answers_org_teacher_select" ON public.submission_answers;
CREATE POLICY "submission_answers_org_teacher_select" ON public.submission_answers
  FOR SELECT USING (
    org_id = ANY(get_user_org_ids())
    AND submission_id IN (
      SELECT s.id FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE a.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "submission_answers_super_admin_all" ON public.submission_answers;
CREATE POLICY "submission_answers_super_admin_all" ON public.submission_answers
  FOR ALL USING (is_super_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- QUESTION CATEGORIES & FORMULA PRESETS (Global — ไม่ต้องการ org isolation)
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "categories_select_all"      ON public.question_categories;
DROP POLICY IF EXISTS "formula_presets_select_all" ON public.formula_presets;

DROP POLICY IF EXISTS "categories_select_all" ON public.question_categories;
CREATE POLICY "categories_select_all" ON public.question_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "formula_presets_select_all" ON public.formula_presets;
CREATE POLICY "formula_presets_select_all" ON public.formula_presets
  FOR SELECT USING (true);


-- =============================================================================
-- PHASE 6: Update handle_new_user() — Auto-create personal org on signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  user_role  text;
  survey_r   text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  survey_r  := NEW.raw_user_meta_data->>'survey_role';

  -- 1. Insert user profile
  INSERT INTO public.users (id, email, full_name, role, survey_role, role_custom)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN user_role IN ('teacher','student','admin') THEN user_role::user_role ELSE 'student' END,
    CASE WHEN survey_r IN ('teacher','tutor','student','parent','other') THEN survey_r ELSE NULL END,
    NEW.raw_user_meta_data->>'role_custom'
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create personal workspace organization
  INSERT INTO public.organizations (name, is_personal, subscription_tier)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Workspace',
    true,
    'free'
  )
  RETURNING id INTO new_org_id;

  -- 3. Add user as owner of their personal org
  INSERT INTO public.organization_members (org_id, user_id, org_role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- VERIFICATION QUERIES (Run after migration to confirm correctness)
-- =============================================================================
-- Uncomment to verify:

-- -- ตรวจสอบว่าทุก resource มี org_id
-- SELECT 'questions'  as tbl, count(*) FILTER (WHERE org_id IS NULL) as nulls FROM public.questions
-- UNION ALL SELECT 'classrooms', count(*) FILTER (WHERE org_id IS NULL) FROM public.classrooms
-- UNION ALL SELECT 'assignments', count(*) FILTER (WHERE org_id IS NULL) FROM public.assignments;

-- -- ตรวจสอบ users ที่ไม่มี org (ต้องได้ 0)
-- SELECT count(*) FROM public.users u
-- WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = u.id);
