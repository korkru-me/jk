-- "Must the student photograph their working?" moves from the โจทย์ to the งาน.
--
-- It was a per-question column (`questions.requires_work_image`, set while
-- authoring) gated by a per-assignment opt-out (`assignments.require_work_image`,
-- asked only when the picked โจทย์ already carried the flag). Two problems: the
-- answer belongs to how a โจทย์ is being used, not to the โจทย์ — the same
-- numeric question wants no photo in a quick แบบฝึกหัด and a photo in an
-- exam — and the toggle on the assignment's own question rows wrote through to
-- the โจทย์ in the คลัง, silently changing every other งาน that used it.
--
-- From here `assignments.require_work_image` is the whole decision: on means
-- every เติมคำตอบตัวเลข question in that งาน needs a photo, off means none does.
-- `questions.requires_work_image` is left in place, unread — the per-โจทย์
-- grouping is recoverable without a new migration if it is ever wanted back.

-- New งาน are asked, and default to not requiring a photo: enforcement blocks
-- ส่งคำตอบ until every numeric answer carries an image, which is not something
-- a งาน should start out doing on a default nobody chose.
ALTER TABLE public.assignments
  ALTER COLUMN require_work_image SET DEFAULT false;

-- Existing งาน keep exactly the behaviour their students see today.
--
-- Most were never asked at all — the old flow only opened the dialog when a
-- picked โจทย์ carried the flag — so they hold the old default `true` while
-- enforcing nothing, because no โจทย์ in them opted in. Under the new rule that
-- stale `true` would suddenly demand a photo on every numeric question, and a
-- student part-way through would find they can no longer submit.
--
-- So: enforcement survives only where it was already effectively all-or-nothing
-- — every เติมคำตอบตัวเลข question in the งาน was flagged. Any งาน holding a
-- numeric question that was NOT flagged is switched off, because leaving it on
-- would newly block answers that never needed a photo. Erring towards off is
-- the safe direction: a missing photo the teacher wanted is visible to them
-- when they grade, a submission a student cannot send is not recoverable.
--
-- งาน with no numeric questions at all are left alone — the column cannot
-- affect them either way.
UPDATE public.assignments a
SET require_work_image = false
WHERE a.require_work_image
  AND EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.id = ANY (a.question_ids)
      AND q.question_type = 'written'
      AND NOT q.requires_work_image
  );
