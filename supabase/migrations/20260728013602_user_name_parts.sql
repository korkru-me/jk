-- Split the single full_name field into prefix (คำนำหน้าชื่อ), first_name
-- (ชื่อ), and last_name (สกุล) so the identity fields can be edited and
-- displayed separately. full_name stays as the authoritative combined
-- string (kept in sync by application code) since it's already read
-- throughout homeroom/subject/analytics views.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prefix     text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_prefix_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_prefix_check
    CHECK (prefix IS NULL OR prefix IN ('เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว'));

-- Auto-create user profile on signup: now also carries prefix/first_name/
-- last_name from signup metadata when present (nullable — e.g. Google OAuth
-- sign-in never sets these).
--
-- SET search_path = public is required here: this trigger fires on
-- auth.users insert under the supabase_auth_admin role, whose search_path
-- is just "auth" — without it, the bare `user_role` cast below can't be
-- resolved and signup fails with "type user_role does not exist".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, prefix, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'prefix',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
