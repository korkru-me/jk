-- PostgreSQL 17 added the MAINTAIN table privilege. The earlier explicit
-- DML/TRUNCATE/REFERENCES/TRIGGER revokes predated that privilege, so
-- Supabase's default authenticated grant could still retain MAINTAIN. Keep
-- all proctoring and SEB readiness writes behind their trusted RPCs.
REVOKE ALL ON TABLE
  public.exam_proctor_sessions,
  public.exam_proctor_events,
  public.exam_proctor_connections,
  public.exam_seb_checkins
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.exam_proctor_sessions,
  public.exam_proctor_events,
  public.exam_proctor_connections,
  public.exam_seb_checkins
TO authenticated;
