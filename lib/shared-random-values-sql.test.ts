/**
 * Executes the "ตัวเลขชุดเดียวกัน" migration against a throwaway Postgres.
 *
 * It only adds a nullable seed, so an assignment that existed before it must
 * come out NULL — still drawing numbers per student, as it always did — and
 * the column must hold every seed createSharedRandomSeed can hand out while
 * refusing the ones the code would not treat as a seed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { SHARED_RANDOM_SEED_MAX } from '@/lib/math/shared-random'

const MIGRATION = new URL(
  '../supabase/migrations/20260926105608_assignment_shared_random_values.sql',
  import.meta.url,
)

const EXISTING_ASSIGNMENT = '40000000-0000-4000-8000-000000000001'
const NEW_ASSIGNMENT = '40000000-0000-4000-8000-000000000002'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE public.assignments (
      id uuid PRIMARY KEY,
      title text NOT NULL
    );
    INSERT INTO public.assignments (id, title) VALUES ('${EXISTING_ASSIGNMENT}', 'งานเดิม');
  `)
  await db.exec(readFileSync(MIGRATION, 'utf8'))
})

afterAll(async () => {
  await db.close()
})

async function seedOf(id: string): Promise<number | null> {
  const { rows } = await db.query<{ shared_random_seed: number | null }>(
    'SELECT shared_random_seed FROM public.assignments WHERE id = $1',
    [id],
  )
  return rows[0].shared_random_seed
}

describe('assignments.shared_random_seed', () => {
  it('leaves every existing งาน drawing per student', async () => {
    expect(await seedOf(EXISTING_ASSIGNMENT)).toBeNull()
  })

  it('holds the whole range createSharedRandomSeed hands out', async () => {
    await db.query(
      'INSERT INTO public.assignments (id, title, shared_random_seed) VALUES ($1, $2, $3)',
      [NEW_ASSIGNMENT, 'งานใหม่', SHARED_RANDOM_SEED_MAX],
    )
    expect(await seedOf(NEW_ASSIGNMENT)).toBe(SHARED_RANDOM_SEED_MAX)
    await db.query('UPDATE public.assignments SET shared_random_seed = 1 WHERE id = $1', [NEW_ASSIGNMENT])
    expect(await seedOf(NEW_ASSIGNMENT)).toBe(1)
  })

  it('refuses zero and below', async () => {
    for (const bad of [0, -1]) {
      await expect(
        db.query('UPDATE public.assignments SET shared_random_seed = $1 WHERE id = $2', [bad, NEW_ASSIGNMENT]),
      ).rejects.toThrow(/assignments_shared_random_seed_positive/)
    }
  })
})
