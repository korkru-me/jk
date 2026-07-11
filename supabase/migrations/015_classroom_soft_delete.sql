-- =============================================================================
-- Migration 015: Soft delete + archive for classrooms
-- Adds status ('active' | 'archived' | 'deleted') and deleted_at columns
-- =============================================================================

ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS classrooms_status_idx ON public.classrooms(status);
CREATE INDEX IF NOT EXISTS classrooms_deleted_at_idx ON public.classrooms(deleted_at)
  WHERE deleted_at IS NOT NULL;
