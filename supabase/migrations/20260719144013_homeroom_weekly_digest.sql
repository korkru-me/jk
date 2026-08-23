-- Weekly automated notification to each homeroom advisor summarizing how
-- many overdue-and-unsubmitted assignments their roster has across all the
-- students' subject classrooms (a homeroom has no assignments of its own).

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('assignment_reminder', 'co_teacher_invite', 'extension_granted', 'classroom_post', 'homeroom_weekly_digest'));

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.send_homeroom_weekly_digests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hr RECORD;
  pending_count int;
BEGIN
  FOR hr IN
    SELECT id, org_id, teacher_id, name
    FROM public.classrooms
    WHERE classroom_type = 'homeroom' AND status = 'active'
  LOOP
    SELECT count(*) INTO pending_count
    FROM (
      SELECT DISTINCT cs.student_id, a.id AS assignment_id
      FROM public.classroom_students cs
      JOIN public.classroom_students other_cs
        ON other_cs.student_id = cs.student_id AND other_cs.classroom_id <> hr.id
      JOIN public.classrooms oc
        ON oc.id = other_cs.classroom_id AND oc.classroom_type = 'subject' AND oc.status = 'active'
      JOIN public.assignment_classrooms ac ON ac.classroom_id = oc.id
      JOIN public.assignments a
        ON a.id = ac.assignment_id AND a.status = 'published'
        AND a.end_at IS NOT NULL AND a.end_at <= now()
      WHERE cs.classroom_id = hr.id
        AND NOT EXISTS (
          SELECT 1 FROM public.submissions s
          WHERE s.assignment_id = a.id AND s.student_id = cs.student_id
            AND s.status IN ('submitted', 'graded')
        )
    ) pending;

    IF pending_count > 0 THEN
      INSERT INTO public.notifications (org_id, recipient_id, type, title, body, link, related_classroom_id)
      VALUES (
        hr.org_id, hr.teacher_id, 'homeroom_weekly_digest',
        'สรุปประจำสัปดาห์: ' || hr.name,
        'นักเรียนในห้องมีรายการงานค้างส่งรวม ' || pending_count || ' รายการ (นับทุกวิชา)',
        '/classrooms/' || hr.id,
        hr.id
      );
    END IF;
  END LOOP;
END;
$$;

-- Every Monday 00:00 UTC (07:00 Bangkok time).
SELECT cron.schedule(
  'homeroom-weekly-digest',
  '0 0 * * 1',
  $$SELECT public.send_homeroom_weekly_digests();$$
);
