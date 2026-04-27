-- KorKru Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==================== ENUMS ====================

create type user_role as enum ('teacher', 'student', 'admin');
create type question_type as enum ('mcq', 'written');
create type difficulty as enum ('easy', 'medium', 'hard', 'analytical');
create type visibility as enum ('private', 'school', 'public');
create type assignment_status as enum ('draft', 'published', 'closed');
create type assignment_mode as enum ('online', 'print');
create type submission_status as enum ('in_progress', 'submitted', 'graded');

-- ==================== TABLES ====================

-- 4.1 Users (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  avatar_url text,
  role user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.2 Classrooms
create table public.classrooms (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  class_code text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.3 Classroom Students
create table public.classroom_students (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(classroom_id, student_id)
);

-- 4.4 Question Categories
create table public.question_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  parent_id uuid references public.question_categories(id) on delete set null,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

-- 4.5 Questions
create table public.questions (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references public.users(id) on delete cascade,
  category_id uuid references public.question_categories(id) on delete set null,
  title text not null,
  question_text text not null,
  question_type question_type not null default 'written',
  difficulty difficulty not null default 'medium',
  visibility visibility not null default 'private',
  is_random boolean not null default false,
  variables jsonb not null default '[]',
  answer_formula text not null default '',
  answer_unit text,
  answer_tolerance decimal not null default 0.01,
  mcq_options jsonb,
  solution_text text,
  image_urls text[] not null default '{}',
  parent_question_id uuid references public.questions(id) on delete set null,
  group_id uuid,
  order_in_group integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.6 Assignments
create table public.assignments (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  question_ids uuid[] not null default '{}',
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes integer,
  status assignment_status not null default 'draft',
  mode assignment_mode not null default 'online',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.7 Submissions
create table public.submissions (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total_score decimal,
  max_score decimal not null default 0,
  status submission_status not null default 'in_progress',
  created_at timestamptz not null default now(),
  unique(assignment_id, student_id)
);

-- 4.8 Submission Answers
create table public.submission_answers (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  random_values jsonb not null default '{}',
  correct_answer text not null,
  student_answer text,
  is_correct boolean,
  score decimal not null default 0,
  max_score decimal not null default 1,
  teacher_feedback text,
  created_at timestamptz not null default now()
);

-- 4.9 Formula Presets
create table public.formula_presets (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.question_categories(id) on delete set null,
  formula_name text not null,
  equation text not null,
  variables jsonb not null default '[]',
  target_variable text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ==================== FUNCTIONS ====================

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Generate unique 6-char class code
create or replace function generate_class_code()
returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  for i in 1..6 loop
    code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return code;
end;
$$ language plpgsql;

-- ==================== TRIGGERS ====================

create trigger users_updated_at before update on public.users
  for each row execute function update_updated_at();

create trigger classrooms_updated_at before update on public.classrooms
  for each row execute function update_updated_at();

create trigger questions_updated_at before update on public.questions
  for each row execute function update_updated_at();

create trigger assignments_updated_at before update on public.assignments
  for each row execute function update_updated_at();

-- Auto-create user profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ==================== ROW LEVEL SECURITY ====================

alter table public.users enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_students enable row level security;
alter table public.question_categories enable row level security;
alter table public.questions enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.formula_presets enable row level security;

-- Users: read own profile, update own profile
create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- Classrooms: teachers manage their own, students view joined
create policy "classrooms_teacher_all" on public.classrooms for all using (teacher_id = auth.uid());
create policy "classrooms_student_select" on public.classrooms for select
  using (id in (select classroom_id from public.classroom_students where student_id = auth.uid()));

-- Classroom students
create policy "classroom_students_teacher_select" on public.classroom_students for select
  using (classroom_id in (select id from public.classrooms where teacher_id = auth.uid()));
create policy "classroom_students_join" on public.classroom_students for insert
  with check (student_id = auth.uid());
create policy "classroom_students_own_select" on public.classroom_students for select
  using (student_id = auth.uid());

-- Question categories: everyone can read
create policy "categories_select_all" on public.question_categories for select using (true);

-- Questions: creator manages, visibility controls read
create policy "questions_creator_all" on public.questions for all using (created_by = auth.uid());
create policy "questions_public_select" on public.questions for select using (visibility = 'public');

-- Assignments: teacher manages, students view published assigned to their classroom
create policy "assignments_teacher_all" on public.assignments for all using (created_by = auth.uid());
create policy "assignments_student_select" on public.assignments for select
  using (
    status = 'published'
    and classroom_id in (
      select classroom_id from public.classroom_students where student_id = auth.uid()
    )
  );

-- Submissions: student owns, teacher views in their classroom
create policy "submissions_student_all" on public.submissions for all using (student_id = auth.uid());
create policy "submissions_teacher_select" on public.submissions for select
  using (
    assignment_id in (
      select id from public.assignments where created_by = auth.uid()
    )
  );

-- Submission answers
create policy "submission_answers_student_all" on public.submission_answers for all
  using (submission_id in (select id from public.submissions where student_id = auth.uid()));
create policy "submission_answers_teacher_select" on public.submission_answers for select
  using (
    submission_id in (
      select s.id from public.submissions s
      join public.assignments a on s.assignment_id = a.id
      where a.created_by = auth.uid()
    )
  );

-- Formula presets: everyone can read
create policy "formula_presets_select_all" on public.formula_presets for select using (true);

-- ==================== SEED DATA ====================

-- Question categories
insert into public.question_categories (name, "order") values
  ('การเคลื่อนที่แนวตรง', 1),
  ('กฎการเคลื่อนที่ของนิวตัน', 2),
  ('งาน พลังงาน กำลัง', 3),
  ('โมเมนตัม', 4),
  ('การเคลื่อนที่แบบหมุน', 5),
  ('คลื่น', 6),
  ('ไฟฟ้า', 7),
  ('ความร้อน', 8),
  ('ฟิสิกส์อะตอม', 9);

-- Formula presets (30 สูตร)
insert into public.formula_presets (formula_name, equation, variables, target_variable, description) values
  ('ความเร็วปลาย', 'v = u + a*t', '[{"name":"v","min":0,"max":100,"unit":"m/s","decimals":1},{"name":"u","min":0,"max":50,"unit":"m/s","decimals":1},{"name":"a","min":0,"max":20,"unit":"m/s²","decimals":1},{"name":"t","min":1,"max":30,"unit":"s","decimals":0}]', 'v', 'ความเร็วปลายเมื่อมีความเร่งคงที่'),
  ('ระยะทางที่เคลื่อนที่ได้', 's = u*t + (1/2)*a*t^2', '[{"name":"s","min":0,"max":1000,"unit":"m","decimals":1},{"name":"u","min":0,"max":50,"unit":"m/s","decimals":1},{"name":"a","min":0,"max":20,"unit":"m/s²","decimals":1},{"name":"t","min":1,"max":30,"unit":"s","decimals":0}]', 's', 'ระยะทางที่เคลื่อนที่ได้ในเวลา t'),
  ('ความสัมพันธ์ของความเร็วและระยะทาง', 'v^2 = u^2 + 2*a*s', '[{"name":"v","min":0,"max":100,"unit":"m/s","decimals":1},{"name":"u","min":0,"max":50,"unit":"m/s","decimals":1},{"name":"a","min":0,"max":20,"unit":"m/s²","decimals":1},{"name":"s","min":1,"max":500,"unit":"m","decimals":0}]', 'v', 'ความสัมพันธ์ของความเร็วและระยะทาง'),
  ('ระยะทางเฉลี่ย', 's = (1/2)*(u+v)*t', '[{"name":"s","min":0,"max":1000,"unit":"m","decimals":1},{"name":"u","min":0,"max":50,"unit":"m/s","decimals":1},{"name":"v","min":0,"max":100,"unit":"m/s","decimals":1},{"name":"t","min":1,"max":30,"unit":"s","decimals":0}]', 's', 'ระยะทางโดยใช้ความเร็วเฉลี่ย'),
  ('กฎข้อที่สองของนิวตัน', 'F = m*a', '[{"name":"F","min":1,"max":1000,"unit":"N","decimals":0},{"name":"m","min":1,"max":100,"unit":"kg","decimals":0},{"name":"a","min":0,"max":20,"unit":"m/s²","decimals":1}]', 'F', 'แรงลัพธ์เท่ากับมวลคูณความเร่ง'),
  ('น้ำหนัก', 'W = m*g', '[{"name":"W","min":0,"max":1000,"unit":"N","decimals":1},{"name":"m","min":1,"max":100,"unit":"kg","decimals":0},{"name":"g","min":9.8,"max":9.8,"unit":"m/s²","decimals":1}]', 'W', 'น้ำหนักของวัตถุ'),
  ('แรงเสียดทาน', 'f = mu*N', '[{"name":"f","min":0,"max":500,"unit":"N","decimals":1},{"name":"mu","min":0.1,"max":0.9,"unit":"","decimals":2},{"name":"N","min":1,"max":1000,"unit":"N","decimals":0}]', 'f', 'แรงเสียดทาน'),
  ('งาน', 'W = F*s*cos(theta)', '[{"name":"W","min":0,"max":10000,"unit":"J","decimals":0},{"name":"F","min":1,"max":1000,"unit":"N","decimals":0},{"name":"s","min":1,"max":100,"unit":"m","decimals":0},{"name":"theta","min":0,"max":0,"unit":"°","decimals":0}]', 'W', 'งานที่แรงกระทำต่อวัตถุ'),
  ('พลังงานจลน์', 'KE = (1/2)*m*v^2', '[{"name":"KE","min":0,"max":10000,"unit":"J","decimals":0},{"name":"m","min":1,"max":100,"unit":"kg","decimals":0},{"name":"v","min":1,"max":50,"unit":"m/s","decimals":0}]', 'KE', 'พลังงานจลน์ของวัตถุที่เคลื่อนที่'),
  ('พลังงานศักย์', 'PE = m*g*h', '[{"name":"PE","min":0,"max":10000,"unit":"J","decimals":0},{"name":"m","min":1,"max":100,"unit":"kg","decimals":0},{"name":"g","min":9.8,"max":9.8,"unit":"m/s²","decimals":1},{"name":"h","min":1,"max":100,"unit":"m","decimals":0}]', 'PE', 'พลังงานศักย์โน้มถ่วง'),
  ('กำลัง', 'P = W/t', '[{"name":"P","min":0,"max":1000,"unit":"W","decimals":0},{"name":"W","min":1,"max":10000,"unit":"J","decimals":0},{"name":"t","min":1,"max":100,"unit":"s","decimals":0}]', 'P', 'กำลังจากงานต่อเวลา'),
  ('กำลังจากแรงและความเร็ว', 'P = F*v', '[{"name":"P","min":0,"max":1000,"unit":"W","decimals":0},{"name":"F","min":1,"max":1000,"unit":"N","decimals":0},{"name":"v","min":1,"max":50,"unit":"m/s","decimals":0}]', 'P', 'กำลังจากแรงและความเร็ว'),
  ('โมเมนตัม', 'p = m*v', '[{"name":"p","min":0,"max":10000,"unit":"kg·m/s","decimals":1},{"name":"m","min":1,"max":100,"unit":"kg","decimals":0},{"name":"v","min":1,"max":50,"unit":"m/s","decimals":0}]', 'p', 'โมเมนตัมของวัตถุ'),
  ('แรงกระตุ้น', 'F*t = m*v - m*u', '[{"name":"F","min":1,"max":1000,"unit":"N","decimals":0},{"name":"t","min":0.1,"max":10,"unit":"s","decimals":1},{"name":"m","min":1,"max":100,"unit":"kg","decimals":0},{"name":"v","min":0,"max":50,"unit":"m/s","decimals":0},{"name":"u","min":0,"max":50,"unit":"m/s","decimals":0}]', 'F', 'แรงกระตุ้นเท่ากับการเปลี่ยนแปลงโมเมนตัม'),
  ('ความเร็วเชิงมุม', 'omega = 2*pi/T', '[{"name":"omega","min":0,"max":100,"unit":"rad/s","decimals":2},{"name":"T","min":0.1,"max":60,"unit":"s","decimals":1}]', 'omega', 'ความเร็วเชิงมุมจากคาบ'),
  ('ความเร็วเชิงเส้นในวงกลม', 'v = omega*r', '[{"name":"v","min":0,"max":100,"unit":"m/s","decimals":1},{"name":"omega","min":0,"max":50,"unit":"rad/s","decimals":1},{"name":"r","min":0.1,"max":100,"unit":"m","decimals":1}]', 'v', 'ความเร็วเชิงเส้นในการเคลื่อนที่วงกลม'),
  ('ความเร่งสู่ศูนย์กลาง', 'a = v^2/r', '[{"name":"a","min":0,"max":100,"unit":"m/s²","decimals":1},{"name":"v","min":1,"max":50,"unit":"m/s","decimals":0},{"name":"r","min":0.1,"max":100,"unit":"m","decimals":1}]', 'a', 'ความเร่งสู่ศูนย์กลาง'),
  ('ความเร็วคลื่น', 'v = f*lambda', '[{"name":"v","min":0,"max":400,"unit":"m/s","decimals":0},{"name":"f","min":1,"max":1000,"unit":"Hz","decimals":0},{"name":"lambda","min":0.01,"max":100,"unit":"m","decimals":2}]', 'v', 'ความเร็วคลื่นจากความถี่และความยาวคลื่น'),
  ('คาบ', 'T = 1/f', '[{"name":"T","min":0.001,"max":10,"unit":"s","decimals":3},{"name":"f","min":0.1,"max":1000,"unit":"Hz","decimals":1}]', 'T', 'คาบจากความถี่'),
  ('กฎของโอห์ม', 'V = I*R', '[{"name":"V","min":1,"max":240,"unit":"V","decimals":0},{"name":"I","min":0.1,"max":20,"unit":"A","decimals":1},{"name":"R","min":1,"max":1000,"unit":"Ω","decimals":0}]', 'V', 'กฎของโอห์ม'),
  ('กำลังไฟฟ้า', 'P = V*I', '[{"name":"P","min":0,"max":5000,"unit":"W","decimals":0},{"name":"V","min":1,"max":240,"unit":"V","decimals":0},{"name":"I","min":0.1,"max":20,"unit":"A","decimals":1}]', 'P', 'กำลังไฟฟ้า'),
  ('กำลังไฟฟ้าจากความต้านทาน', 'P = I^2*R', '[{"name":"P","min":0,"max":5000,"unit":"W","decimals":0},{"name":"I","min":0.1,"max":20,"unit":"A","decimals":1},{"name":"R","min":1,"max":1000,"unit":"Ω","decimals":0}]', 'P', 'กำลังไฟฟ้าจากกระแสและความต้านทาน'),
  ('ประจุไฟฟ้า', 'Q = I*t', '[{"name":"Q","min":0,"max":1000,"unit":"C","decimals":0},{"name":"I","min":0.1,"max":20,"unit":"A","decimals":1},{"name":"t","min":1,"max":3600,"unit":"s","decimals":0}]', 'Q', 'ประจุไฟฟ้าจากกระแสและเวลา'),
  ('แรงคูลอมบ์', 'F = k*q1*q2/r^2', '[{"name":"F","min":0,"max":1000,"unit":"N","decimals":2},{"name":"k","min":9e9,"max":9e9,"unit":"N·m²/C²","decimals":0},{"name":"q1","min":1e-6,"max":1e-4,"unit":"C","decimals":6},{"name":"q2","min":1e-6,"max":1e-4,"unit":"C","decimals":6},{"name":"r","min":0.01,"max":10,"unit":"m","decimals":2}]', 'F', 'แรงระหว่างประจุ'),
  ('สนามไฟฟ้า', 'E = F/q', '[{"name":"E","min":0,"max":10000,"unit":"N/C","decimals":0},{"name":"F","min":0.001,"max":100,"unit":"N","decimals":3},{"name":"q","min":1e-6,"max":1e-3,"unit":"C","decimals":6}]', 'E', 'ความเข้มสนามไฟฟ้า'),
  ('ความร้อนที่ดูดซับ', 'Q = m*c*delta_T', '[{"name":"Q","min":0,"max":100000,"unit":"J","decimals":0},{"name":"m","min":0.1,"max":10,"unit":"kg","decimals":1},{"name":"c","min":100,"max":4200,"unit":"J/kg·°C","decimals":0},{"name":"delta_T","min":1,"max":100,"unit":"°C","decimals":0}]', 'Q', 'ความร้อนที่วัตถุดูดซับหรือคายออก'),
  ('ความร้อนแฝง', 'Q = m*L', '[{"name":"Q","min":0,"max":1000000,"unit":"J","decimals":0},{"name":"m","min":0.1,"max":10,"unit":"kg","decimals":1},{"name":"L","min":1000,"max":2260000,"unit":"J/kg","decimals":0}]', 'Q', 'ความร้อนในการเปลี่ยนสถานะ'),
  ('พลังงานโฟตอน', 'E = h*f', '[{"name":"E","min":0,"max":1e-15,"unit":"J","decimals":20},{"name":"h","min":6.626e-34,"max":6.626e-34,"unit":"J·s","decimals":34},{"name":"f","min":1e14,"max":1e17,"unit":"Hz","decimals":0}]', 'E', 'พลังงานโฟตอน'),
  ('มวล-พลังงาน', 'E = m*c^2', '[{"name":"E","min":0,"max":1e20,"unit":"J","decimals":0},{"name":"m","min":1e-30,"max":1e-25,"unit":"kg","decimals":30},{"name":"c","min":3e8,"max":3e8,"unit":"m/s","decimals":0}]', 'E', 'สมการมวล-พลังงานของไอน์สไตน์'),
  ('ความยาวคลื่นเดอบรอยล์', 'lambda = h/(m*v)', '[{"name":"lambda","min":0,"max":1e-9,"unit":"m","decimals":12},{"name":"h","min":6.626e-34,"max":6.626e-34,"unit":"J·s","decimals":34},{"name":"m","min":9.1e-31,"max":1e-25,"unit":"kg","decimals":31},{"name":"v","min":1e5,"max":1e7,"unit":"m/s","decimals":0}]', 'lambda', 'ความยาวคลื่นเดอบรอยล์');
