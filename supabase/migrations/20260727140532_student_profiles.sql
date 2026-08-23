-- Student personal-info settings (identity, academic, contact). Deliberately
-- no RLS policies for `authenticated` (RLS enabled, zero policies = default
-- deny), same pattern as student_notes: reads/writes only ever happen via
-- createAdminClient() from lib/actions/student-profile.ts after an explicit
-- self-or-homeroom-advisor check. This keeps the sensitive fields (parent
-- contact, DOB, student number) out of reach of the broad
-- users_select_org_members policy on public.users, which would otherwise
-- expose them to every org member, not just the homeroom advisor.
CREATE TABLE public.student_profiles (
  student_id      uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  nickname        text,
  date_of_birth   date,
  gender          text CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
  grade_level     text,
  school_name     text,
  student_number  text,
  phone           text,
  parent_name     text,
  parent_phone    text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS student_profiles_updated_at ON public.student_profiles;
CREATE TRIGGER student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
