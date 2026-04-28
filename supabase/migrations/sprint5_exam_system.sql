-- Sprint 5: Online Exam System
-- Run this in Supabase SQL Editor

-- ============================
-- ENUMS
-- ============================
CREATE TYPE IF NOT EXISTS assignment_status AS ENUM ('draft', 'published', 'closed');
CREATE TYPE IF NOT EXISTS assignment_mode AS ENUM ('online', 'print');
CREATE TYPE IF NOT EXISTS submission_status AS ENUM ('in_progress', 'submitted', 'graded');

-- ============================
-- assignments
-- ============================
CREATE TABLE IF NOT EXISTS assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  question_ids     uuid[] NOT NULL DEFAULT '{}',
  start_at         timestamptz,
  end_at           timestamptz,
  duration_minutes integer,
  status           assignment_status NOT NULL DEFAULT 'draft',
  mode             assignment_mode NOT NULL DEFAULT 'online',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================
-- submissions
-- ============================
CREATE TABLE IF NOT EXISTS submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz,
  total_score    decimal,
  max_score      decimal NOT NULL DEFAULT 0,
  status         submission_status NOT NULL DEFAULT 'in_progress',
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

-- ============================
-- submission_answers
-- ============================
CREATE TABLE IF NOT EXISTS submission_answers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id      uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  random_values    jsonb NOT NULL DEFAULT '{}',
  correct_answer   text NOT NULL,
  student_answer   text,
  is_correct       boolean,
  score            decimal NOT NULL DEFAULT 0,
  max_score        decimal NOT NULL DEFAULT 1,
  teacher_feedback text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

-- ============================
-- INDEXES
-- ============================
CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_submission ON submission_answers(submission_id);

-- ============================
-- updated_at trigger
-- ============================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================
-- RLS
-- ============================
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_answers ENABLE ROW LEVEL SECURITY;

-- assignments: teacher full access to own assignments
CREATE POLICY "assignments_teacher_all" ON assignments
  FOR ALL USING (created_by = auth.uid());

-- assignments: students in classroom can view published assignments
CREATE POLICY "assignments_student_view" ON assignments
  FOR SELECT USING (
    status = 'published'
    AND classroom_id IN (
      SELECT classroom_id FROM classroom_students WHERE student_id = auth.uid()
    )
  );

-- submissions: student owns their submission
CREATE POLICY "submissions_student_own" ON submissions
  FOR ALL USING (student_id = auth.uid());

-- submissions: teacher can view submissions for their assignments
CREATE POLICY "submissions_teacher_view" ON submissions
  FOR SELECT USING (
    assignment_id IN (SELECT id FROM assignments WHERE created_by = auth.uid())
  );

-- submission_answers: student owns their answers
CREATE POLICY "submission_answers_student_own" ON submission_answers
  FOR ALL USING (
    submission_id IN (SELECT id FROM submissions WHERE student_id = auth.uid())
  );

-- submission_answers: teacher can view answers for their assignments
CREATE POLICY "submission_answers_teacher_view" ON submission_answers
  FOR SELECT USING (
    submission_id IN (
      SELECT s.id FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE a.created_by = auth.uid()
    )
  );
