import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20260929063102_classroom_trash_30_day_retention.sql', import.meta.url),
  'utf8',
)
const stagingBootstrap = readFileSync(
  new URL('../supabase/bootstrap/900_disable_staging_cron.sql', import.meta.url),
  'utf8',
)
const functionSql = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.purge_expired_classrooms'),
  migration.indexOf('COMMENT ON FUNCTION public.purge_expired_classrooms'),
)

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE public.classrooms (
      id uuid PRIMARY KEY,
      status text NOT NULL,
      deleted_at timestamptz
    );
  `)
  await db.exec(functionSql)
})

afterEach(async () => { await db?.close() })

describe('classroom trash retention', () => {
  it('permanently deletes only trashed classrooms older than 30 days', async () => {
    await db.exec(`
      INSERT INTO public.classrooms (id, status, deleted_at) VALUES
        ('10000000-0000-4000-8000-000000000001', 'deleted', now() - interval '31 days'),
        ('10000000-0000-4000-8000-000000000002', 'deleted', now() - interval '29 days'),
        ('10000000-0000-4000-8000-000000000003', 'active', now() - interval '31 days'),
        ('10000000-0000-4000-8000-000000000004', 'deleted', null);
    `)

    const { rows } = await db.query<{ purge_expired_classrooms: bigint }>(
      'SELECT public.purge_expired_classrooms()',
    )
    expect(Number(rows[0]?.purge_expired_classrooms)).toBe(1)

    const remaining = await db.query<{ id: string }>('SELECT id FROM public.classrooms ORDER BY id')
    expect(remaining.rows.map(row => row.id)).toEqual([
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
    ])
  })

  it('keeps the purge function private and schedules one daily production job', () => {
    expect(migration).toContain("DEFAULT now() - interval '30 days'")
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain("'classroom-trash-retention-daily'")
    expect(migration).toContain("'15 19 * * *'")
    expect(stagingBootstrap).toContain("'classroom-trash-retention-daily'")
  })
})
