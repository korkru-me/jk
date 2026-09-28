-- ปิดการอ่าน token ของลิงก์เชิญแบบไม่ต้องรู้ token
--
-- ลิงก์เชิญเป็น bearer secret: ใครถือ token ก็กดรับได้ แต่ policy เดิม
-- `*_token_select` เปิดให้ SELECT คำเชิญที่ยังไม่หมดอายุ "ทุกแถว" รวม token
-- โดยไม่ต้องรู้ token ก่อน แล้วเอาไปกดรับเป็นครูร่วม (สิทธิ์สูงสุด admin) หรือ
-- สมาชิก org (สูงสุด admin) ได้ ของ org_invitations ยังไม่ได้จำกัด role จึงรวม
-- anon ที่มี table grant อยู่ — อ่านได้ด้วย anon key โดยไม่ต้องล็อกอินเลย
-- ส่วน `*_mark_used` ให้ใครก็ได้กดให้คำเชิญทุกใบ "ใช้แล้ว"
--
-- หลัง migration นี้:
-- 1. ตารางคำเชิญเห็นได้เฉพาะผู้จัดการคำเชิญ (classroom_invitations_owner_all,
--    org_invitations_owner_*) ที่มีอยู่แล้ว และ anon ไม่มีสิทธิ์บนตารางเลย
-- 2. ผู้รับเชิญอ่าน/รับคำเชิญผ่านฟังก์ชันที่ต้องได้ token ตรงตัวเท่านั้น
--    ฟังก์ชันรับคำเชิญล็อกแถวคำเชิญ เพิ่มสมาชิก และปิดคำเชิญในธุรกรรมเดียว
--    สองคนกดลิงก์เดียวกันพร้อมกันจึงได้เพียงคนเดียว
-- 3. คนที่สอนห้อง/อยู่ใน org นั้นอยู่แล้วกดลิงก์ได้ผลเหมือนเข้าร่วมสำเร็จ
--    แต่สิทธิ์เดิมไม่เปลี่ยน และคำเชิญไม่ถูกใช้ไป ยังเหลือให้คนที่ตั้งใจเชิญ

-- ── 1. ปิด policy แบบกว้าง ────────────────────────────────────────────────
DROP POLICY IF EXISTS "classroom_invitations_token_select" ON public.classroom_invitations;
DROP POLICY IF EXISTS "classroom_invitations_mark_used" ON public.classroom_invitations;
DROP POLICY IF EXISTS "org_invitations_token_select" ON public.org_invitations;
DROP POLICY IF EXISTS "org_invitations_mark_used" ON public.org_invitations;

REVOKE ALL ON public.classroom_invitations FROM anon;
REVOKE ALL ON public.org_invitations FROM anon;

-- ── 2. คำเชิญครูร่วม ──────────────────────────────────────────────────────
-- ไม่คืน classroom_id: ผู้ถือลิงก์รู้แค่ชื่อห้องกับสิทธิ์ก่อนตัดสินใจรับ
CREATE OR REPLACE FUNCTION public.get_classroom_invitation_preview(p_token text)
RETURNS TABLE (classroom_name text, permission text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.name, ci.permission
  FROM public.classroom_invitations ci
  JOIN public.classrooms c ON c.id = ci.classroom_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND ci.token = p_token
    AND ci.used_at IS NULL
    AND ci.expires_at > now()
    AND c.deleted_at IS NULL
$$;

-- คืน classroom_id เมื่อผู้เรียกสอนห้องนั้นได้แล้ว, NULL เมื่อลิงก์ใช้ไม่ได้
CREATE OR REPLACE FUNCTION public.accept_classroom_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_invite record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- FOR UPDATE: คนที่สองที่กดลิงก์เดียวกันจะรอ แล้วอ่าน used_at ใหม่จนไม่เจอแถว
  SELECT ci.id, ci.classroom_id, ci.permission, ci.created_by, c.teacher_id
  INTO v_invite
  FROM public.classroom_invitations ci
  JOIN public.classrooms c ON c.id = ci.classroom_id
  WHERE ci.token = p_token
    AND ci.used_at IS NULL
    AND ci.expires_at > now()
    AND c.deleted_at IS NULL
  FOR UPDATE OF ci;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_invite.teacher_id = v_user_id OR EXISTS (
    SELECT 1
    FROM public.classroom_co_teachers ct
    WHERE ct.classroom_id = v_invite.classroom_id
      AND ct.user_id = v_user_id
  ) THEN
    RETURN v_invite.classroom_id;
  END IF;

  INSERT INTO public.classroom_co_teachers (classroom_id, user_id, permission, invited_by)
  VALUES (v_invite.classroom_id, v_user_id, v_invite.permission, v_invite.created_by)
  ON CONFLICT (classroom_id, user_id) DO NOTHING;

  UPDATE public.classroom_invitations
  SET used_at = now(), used_by = v_user_id
  WHERE id = v_invite.id;

  RETURN v_invite.classroom_id;
END;
$$;

-- ── 3. คำเชิญเข้า organization ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_org_invitation_preview(p_token text)
RETURNS TABLE (org_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.name, oi.role
  FROM public.org_invitations oi
  JOIN public.organizations o ON o.id = oi.org_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND oi.token = p_token
    AND oi.used_at IS NULL
    AND oi.expires_at > now()
    AND o.deleted_at IS NULL
$$;

-- คืน org_id เมื่อผู้เรียกเป็นสมาชิก org นั้นแล้ว, NULL เมื่อลิงก์ใช้ไม่ได้
CREATE OR REPLACE FUNCTION public.accept_org_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_invite record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT oi.id, oi.org_id, oi.role
  INTO v_invite
  FROM public.org_invitations oi
  JOIN public.organizations o ON o.id = oi.org_id
  WHERE oi.token = p_token
    AND oi.used_at IS NULL
    AND oi.expires_at > now()
    AND o.deleted_at IS NULL
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.org_id = v_invite.org_id
      AND om.user_id = v_user_id
  ) THEN
    RETURN v_invite.org_id;
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, org_role)
  VALUES (v_invite.org_id, v_user_id, v_invite.role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  UPDATE public.org_invitations
  SET used_at = now()
  WHERE id = v_invite.id;

  RETURN v_invite.org_id;
END;
$$;

-- ── 4. สิทธิ์เรียกฟังก์ชัน ────────────────────────────────────────────────
-- Supabase ให้ anon เรียกฟังก์ชันใหม่ใน public ได้ผ่าน default privileges
-- การ revoke จาก PUBLIC อย่างเดียวจึงไม่พอ
REVOKE ALL ON FUNCTION public.get_classroom_invitation_preview(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_classroom_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_org_invitation_preview(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_org_invitation(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_classroom_invitation_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_classroom_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_invitation_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_invitation(text) TO authenticated;
