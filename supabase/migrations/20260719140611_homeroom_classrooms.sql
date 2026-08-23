-- Homeroom classrooms: a classroom_type distinguishes ordinary subject
-- classrooms (own assignments/exams) from homeroom classrooms, which exist
-- purely as a student roster for an advisor teacher (ครูที่ปรึกษา) to
-- monitor assignment/submission activity that actually lives in the
-- students' subject classrooms. No new tables needed — homeroom rosters
-- reuse classroom_students, invites, and class_code exactly like subject
-- classrooms; only the detail-page UI branches on this column.
ALTER TABLE public.classrooms
  ADD COLUMN classroom_type text NOT NULL DEFAULT 'subject'
    CHECK (classroom_type IN ('subject', 'homeroom'));
