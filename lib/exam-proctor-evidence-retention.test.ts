import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../supabase/migrations/20261015132234_retain_proctor_evidence_until_assignment_deletion.sql', import.meta.url), 'utf8')
const tables = ['exam_proctor_events', 'exam_proctor_sessions', 'exam_proctor_connections', 'exam_seb_checkins', 'exam_android_approvals']

describe('assignment-lifetime proctor evidence', () => {
  it('removes both retention jobs and purge RPCs, preserves old evidence and existing deletion cascades', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE SCHEMA cron;
        CREATE TABLE cron.job (jobid bigint PRIMARY KEY, jobname text);
        CREATE FUNCTION cron.unschedule(p_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
          BEGIN DELETE FROM cron.job WHERE jobid = p_id; RETURN true; END;
        $$;
        INSERT INTO cron.job VALUES (1, 'exam-proctor-retention-daily'),
          (2, 'exam-android-approval-retention-daily'), (3, 'unrelated-job');
        CREATE TABLE public.assignments (id integer PRIMARY KEY, status text);
        INSERT INTO public.assignments VALUES (1, 'closed'), (2, 'published');
        CREATE FUNCTION public.purge_expired_exam_proctor_data(timestamptz) RETURNS void LANGUAGE sql AS 'SELECT';
        CREATE FUNCTION public.purge_exam_proctor_data_for_assignment(uuid, uuid) RETURNS void LANGUAGE sql AS 'SELECT';
        CREATE FUNCTION public.purge_expired_exam_android_approvals(timestamptz) RETURNS void LANGUAGE sql AS 'SELECT';
      `)
      for (const table of tables) {
        await db.exec(`CREATE TABLE public.${table} (assignment_id integer REFERENCES public.assignments(id) ON DELETE CASCADE, recorded_at timestamptz);
          INSERT INTO public.${table} VALUES (1, now() - interval '365 days'), (2, now());`)
      }
      await db.exec(migration)
      await db.exec(migration) // safe to re-run without recreating purge paths
      expect((await db.query<{ jobname: string }>('SELECT jobname FROM cron.job')).rows).toEqual([{ jobname: 'unrelated-job' }])
      expect((await db.query(`SELECT proname FROM pg_proc WHERE proname IN ('purge_expired_exam_proctor_data', 'purge_exam_proctor_data_for_assignment', 'purge_expired_exam_android_approvals')`)).rows).toEqual([])
      for (const table of tables) expect((await db.query(`SELECT * FROM public.${table}`)).rows).toHaveLength(2)
      await db.exec('DELETE FROM public.assignments WHERE id = 1')
      for (const table of tables) expect((await db.query(`SELECT assignment_id FROM public.${table}`)).rows).toEqual([{ assignment_id: 2 }])
    } finally { await db.close() }
  })
})
