-- Phase 7 production hardening for Android monitored-mode audit data.
--
-- The original table grant intentionally removed browser DML but omitted the
-- non-DML table privileges that Supabase default grants may include. Match the
-- least-privilege boundary used by the proctor and SEB check-in tables.
REVOKE ALL ON public.exam_android_approvals FROM anon;
REVOKE ALL ON public.exam_android_approvals FROM authenticated;
GRANT SELECT ON public.exam_android_approvals TO authenticated;

-- Reviewer IDs use ON DELETE SET NULL. Keep the trusted review timestamp and
-- decision valid when that user is later deleted; pending rows must still have
-- no review metadata and approved rows must still have a bounded expiry.
ALTER TABLE public.exam_android_approvals
  DROP CONSTRAINT exam_android_approvals_review_state_check,
  ADD CONSTRAINT exam_android_approvals_review_state_check CHECK (
    (
      status = 'pending'
      AND reviewed_at IS NULL
      AND reviewed_by IS NULL
      AND expires_at IS NULL
    )
    OR
    (
      status = 'approved'
      AND reviewed_at IS NOT NULL
      AND expires_at IS NOT NULL
      AND expires_at > reviewed_at
    )
    OR
    (
      status = 'denied'
      AND reviewed_at IS NOT NULL
      AND expires_at IS NULL
    )
  );

-- The approving teacher on a submission also uses ON DELETE SET NULL. An
-- approval timestamp may therefore outlive its actor ID, while an actor ID
-- without a corresponding timestamp remains invalid.
ALTER TABLE public.submissions
  DROP CONSTRAINT submissions_android_approval_complete_check,
  ADD CONSTRAINT submissions_android_approval_complete_check CHECK (
    android_approved_at IS NOT NULL OR android_approved_by IS NULL
  );

COMMENT ON COLUMN public.exam_android_approvals.reviewed_by IS
  'Teacher who reviewed this Android request; may become null if that user is deleted while reviewed_at and the decision remain.';
COMMENT ON COLUMN public.submissions.android_approved_by IS
  'Teacher who approved Android monitored access; may become null if that user is deleted while android_approved_at remains.';
