import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20261007151705_late_submission_score_adjustments.sql', import.meta.url),
  'utf8',
)

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const ASSIGNMENT_ID = '20000000-0000-4000-8000-000000000001'
const TEACHER_ID = '30000000-0000-4000-8000-000000000001'
const STUDENT_ID = '40000000-0000-4000-8000-000000000001'
const OTHER_STUDENT_ID = '40000000-0000-4000-8000-000000000002'

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.assignments (
      id uuid PRIMARY KEY,
      org_id uuid NOT NULL REFERENCES public.organizations(id)
    );
    CREATE TABLE public.submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      status text NOT NULL
    );
    INSERT INTO public.organizations VALUES ('${ORG_ID}');
    INSERT INTO public.users VALUES ('${TEACHER_ID}'), ('${STUDENT_ID}'), ('${OTHER_STUDENT_ID}');
    INSERT INTO public.assignments VALUES ('${ASSIGNMENT_ID}', '${ORG_ID}');
  `)
  await db.exec(migrationSql)
})

function applyAdjustment(studentIds: string[], adjustment: number) {
  const array = studentIds.map(id => `'${id}'`).join(',')
  return db.query(`
    SELECT public.apply_assignment_score_adjustment(
      '${ORG_ID}',
      '${ASSIGNMENT_ID}',
      ARRAY[${array}]::uuid[],
      'amber',
      ${adjustment},
      'ส่งหลังช่วงผ่อนผัน',
      '${TEACHER_ID}'
    ) AS batch_id
  `)
}

describe('late-submission score adjustment migration', () => {
  it('keeps the raw score separate and defaults old/new attempts to zero', async () => {
    await db.query(
      `INSERT INTO public.submissions (assignment_id, student_id, status) VALUES ($1, $2, 'submitted')`,
      [ASSIGNMENT_ID, STUDENT_ID],
    )
    const result = await db.query<{ score_adjustment: number }>('SELECT score_adjustment FROM public.submissions')
    expect(Number(result.rows[0].score_adjustment)).toBe(0)
  })

  it('atomically replaces every attempt and records batch and per-student audit rows', async () => {
    await db.exec(`
      INSERT INTO public.submissions (assignment_id, student_id, status)
      VALUES
        ('${ASSIGNMENT_ID}', '${STUDENT_ID}', 'submitted'),
        ('${ASSIGNMENT_ID}', '${STUDENT_ID}', 'graded');
    `)

    const first = await applyAdjustment([STUDENT_ID, STUDENT_ID], -2)
    expect(first.rows[0]).toHaveProperty('batch_id')

    const attempts = await db.query<{ score_adjustment: number }>(
      'SELECT score_adjustment FROM public.submissions ORDER BY id',
    )
    expect(attempts.rows.map(row => Number(row.score_adjustment))).toEqual([-2, -2])

    const batch = await db.query<{ affected_count: number; adjustment: number }>(
      'SELECT affected_count, adjustment FROM public.assignment_score_adjustment_batches',
    )
    expect(Number(batch.rows[0].affected_count)).toBe(1)
    expect(Number(batch.rows[0].adjustment)).toBe(-2)

    const item = await db.query<{ previous_adjustment: number; new_adjustment: number }>(
      'SELECT previous_adjustment, new_adjustment FROM public.assignment_score_adjustment_items',
    )
    expect(Number(item.rows[0].previous_adjustment)).toBe(0)
    expect(Number(item.rows[0].new_adjustment)).toBe(-2)

    await applyAdjustment([STUDENT_ID], -3)
    const history = await db.query<{ previous_adjustment: number; new_adjustment: number }>(
      'SELECT previous_adjustment, new_adjustment FROM public.assignment_score_adjustment_items ORDER BY new_adjustment DESC',
    )
    expect(history.rows.map(row => [Number(row.previous_adjustment), Number(row.new_adjustment)]))
      .toContainEqual([-2, -3])
  })

  it('makes a later retry inherit the current adjustment', async () => {
    await db.exec(`
      INSERT INTO public.submissions (assignment_id, student_id, status)
      VALUES ('${ASSIGNMENT_ID}', '${STUDENT_ID}', 'submitted');
    `)
    await applyAdjustment([STUDENT_ID], -2)
    await db.exec(`
      INSERT INTO public.submissions (assignment_id, student_id, status)
      VALUES ('${ASSIGNMENT_ID}', '${STUDENT_ID}', 'in_progress');
    `)
    const result = await db.query<{ score_adjustment: number }>(
      "SELECT score_adjustment FROM public.submissions WHERE status = 'in_progress'",
    )
    expect(Number(result.rows[0].score_adjustment)).toBe(-2)
  })

  it('rejects targets without a completed submission', async () => {
    await db.exec(`
      INSERT INTO public.submissions (assignment_id, student_id, status)
      VALUES ('${ASSIGNMENT_ID}', '${OTHER_STUDENT_ID}', 'in_progress');
    `)
    await expect(applyAdjustment([OTHER_STUDENT_ID], -2))
      .rejects.toThrow('every selected student must have a completed submission')
  })
})
