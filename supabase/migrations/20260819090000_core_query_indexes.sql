-- Core read-path indexes for the question bank, classroom dashboards, RLS
-- helper functions, assignment lists, and submission detail pages.
--
-- `sprint5_exam_system.sql` is not a valid timestamped Supabase migration, so
-- the remote project never recorded/applied the indexes declared there. Keep
-- this migration self-contained and idempotent rather than editing that file.

-- Teacher question bank and teacher dashboard count/list queries.
CREATE INDEX IF NOT EXISTS idx_questions_creator_created_at
  ON public.questions(created_by, created_at DESC);

-- get_my_teaching_classroom_ids() plus active/archive/trash classroom lists.
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_status_created_at
  ON public.classrooms(teacher_id, status, created_at DESC);

-- Student membership pages and get_my_enrolled_classroom_ids(). The existing
-- UNIQUE (classroom_id, student_id) index cannot accelerate student-first
-- lookups because its leading column is classroom_id.
CREATE INDEX IF NOT EXISTS idx_classroom_students_student_classroom
  ON public.classroom_students(student_id, classroom_id);

-- Teacher dashboard counts and legacy/home-classroom assignment lookups.
CREATE INDEX IF NOT EXISTS idx_assignments_creator_created_at
  ON public.assignments(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_classroom_status_created_at
  ON public.assignments(classroom_id, status, created_at DESC);

-- Student dashboard/history reads and student+assignment attempt reduction.
CREATE INDEX IF NOT EXISTS idx_submissions_student_created_at
  ON public.submissions(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_student_assignment_attempt
  ON public.submissions(student_id, assignment_id, attempt_number DESC);

-- Submission detail/grading pages load every answer by submission_id.
CREATE INDEX IF NOT EXISTS idx_submission_answers_submission
  ON public.submission_answers(submission_id);

-- Composite-question edit/delete flows address children by group and order.
CREATE INDEX IF NOT EXISTS idx_questions_group_order
  ON public.questions(group_id, order_in_group);
