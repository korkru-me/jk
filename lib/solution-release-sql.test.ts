/**
 * Executes the two เฉลยวิธีทำ migrations against a throwaway Postgres.
 *
 * The first only adds a switch, so an assignment that existed before it must
 * come out with the switch off. The second removes the one RLS path that let
 * a student read a whole `questions` row — เฉลยวิธีทำ included — and must take
 * nothing else with it: a teacher's own policies on the table stay, as does
 * the helper the `submission_answers` policy still uses.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const ADD_SWITCH = new URL(
  '../supabase/migrations/20260926020630_assignment_solution_release.sql',
  import.meta.url,
)
const CLOSE_ROW_READS = new URL(
  '../supabase/migrations/20260926022404_close_student_question_row_reads.sql',
  import.meta.url,
)

const EXISTING_ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const NEW_ASSIGNMENT = '30000000-0000-4000-8000-000000000004'

let db: PGlite

const MINIMAL_SCHEMA = `
  CREATE ROLE authenticated NOLOGIN;

  CREATE TABLE public.assignments (
    id uuid PRIMARY KEY,
    title text NOT NULL
  );

  CREATE TABLE public.questions (
    id uuid PRIMARY KEY,
    created_by uuid,
    solution_text text
  );
  ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

  CREATE FUNCTION public.can_current_user_view_submission_answers(p_submission_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

  CREATE FUNCTION public.can_current_user_view_question_solution(p_question_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

  CREATE POLICY "questions_student_results_select" ON public.questions
    FOR SELECT TO authenticated
    USING (public.can_current_user_view_question_solution(id));

  CREATE POLICY "questions_creator_all" ON public.questions
    FOR ALL TO authenticated
    USING (created_by IS NOT NULL);
`

async function questionPolicies(): Promise<string[]> {
  const { rows } = await db.query<{ policyname: string }>(
    `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'questions' ORDER BY policyname`,
  )
  return rows.map(row => row.policyname)
}

async function functionExists(signature: string): Promise<boolean> {
  const { rows } = await db.query<{ oid: string | null }>(`SELECT to_regprocedure($1)::text AS oid`, [signature])
  return rows[0]?.oid != null
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MINIMAL_SCHEMA)
  await db.query(`INSERT INTO public.assignments (id, title) VALUES ($1, 'ก่อนมีการตั้งค่านี้')`, [EXISTING_ASSIGNMENT])
}, 60_000)

afterAll(async () => { await db?.close() })

describe('show_solutions switch', () => {
  beforeAll(async () => {
    await db.exec(readFileSync(ADD_SWITCH, 'utf8'))
  })

  it('leaves every existing assignment with the เฉลย closed', async () => {
    const { rows } = await db.query<{ show_solutions: boolean }>(
      `SELECT show_solutions FROM public.assignments WHERE id = $1`,
      [EXISTING_ASSIGNMENT],
    )
    expect(rows[0].show_solutions).toBe(false)
  })

  it('defaults a new assignment to closed and refuses null', async () => {
    await db.query(`INSERT INTO public.assignments (id, title) VALUES ($1, 'ใหม่')`, [NEW_ASSIGNMENT])
    const { rows } = await db.query<{ show_solutions: boolean }>(
      `SELECT show_solutions FROM public.assignments WHERE id = $1`,
      [NEW_ASSIGNMENT],
    )
    expect(rows[0].show_solutions).toBe(false)
    await expect(db.query(`UPDATE public.assignments SET show_solutions = NULL WHERE id = $1`, [NEW_ASSIGNMENT]))
      .rejects.toThrow()
  })
})

describe('closing students’ direct question-row reads', () => {
  beforeAll(async () => {
    await db.exec(readFileSync(CLOSE_ROW_READS, 'utf8'))
  })

  it('drops only the student results policy on questions', async () => {
    expect(await questionPolicies()).toEqual(['questions_creator_all'])
  })

  it('drops the helper nothing uses any more and keeps the one still in use', async () => {
    expect(await functionExists('public.can_current_user_view_question_solution(uuid)')).toBe(false)
    expect(await functionExists('public.can_current_user_view_submission_answers(uuid)')).toBe(true)
  })

  it('is safe to run again', async () => {
    await expect(db.exec(readFileSync(CLOSE_ROW_READS, 'utf8'))).resolves.toBeDefined()
    expect(await questionPolicies()).toEqual(['questions_creator_all'])
  })
})
