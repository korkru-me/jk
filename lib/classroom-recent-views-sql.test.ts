import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20261011025759_classroom_recent_views.sql', import.meta.url),
  'utf8',
)

const OWNER = '10000000-0000-4000-8000-000000000001'
const OTHER = '10000000-0000-4000-8000-000000000002'
const OWNER_ROOM = '20000000-0000-4000-8000-000000000001'
const OTHER_ROOM = '20000000-0000-4000-8000-000000000002'

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    GRANT USAGE ON SCHEMA public TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;

    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.classrooms (
      id uuid PRIMARY KEY,
      teacher_id uuid NOT NULL REFERENCES public.users(id)
    );

    INSERT INTO public.users (id) VALUES ('${OWNER}'), ('${OTHER}');
    INSERT INTO public.classrooms (id, teacher_id) VALUES
      ('${OWNER_ROOM}', '${OWNER}'),
      ('${OTHER_ROOM}', '${OTHER}');
  `)
  await db.exec(migration)
})

afterEach(async () => { await db?.close() })

async function asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result!: T
  await db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId])
    await tx.exec('SET LOCAL ROLE authenticated')
    result = await fn(tx)
  })
  return result
}

describe('classroom recent views migration', () => {
  it('lets an owner upsert the latest visit for their classroom', async () => {
    await asUser(OWNER, tx => tx.exec(`
      INSERT INTO public.classroom_recent_views (user_id, classroom_id, viewed_at)
      VALUES ('${OWNER}', '${OWNER_ROOM}', '2026-10-11T01:00:00Z')
      ON CONFLICT (user_id, classroom_id) DO UPDATE
      SET viewed_at = EXCLUDED.viewed_at;

      INSERT INTO public.classroom_recent_views (user_id, classroom_id, viewed_at)
      VALUES ('${OWNER}', '${OWNER_ROOM}', '2026-10-11T02:00:00Z')
      ON CONFLICT (user_id, classroom_id) DO UPDATE
      SET viewed_at = EXCLUDED.viewed_at;
    `))

    const viewedAt = await asUser(OWNER, async tx => {
      const { rows } = await tx.query<{ viewed_at: Date }>(
        'SELECT viewed_at FROM public.classroom_recent_views',
      )
      return rows[0]?.viewed_at.toISOString()
    })
    expect(viewedAt).toBe('2026-10-11T02:00:00.000Z')
  })

  it('rejects recording a view for a classroom the caller does not own', async () => {
    await expect(asUser(OWNER, tx => tx.exec(`
      INSERT INTO public.classroom_recent_views (user_id, classroom_id)
      VALUES ('${OWNER}', '${OTHER_ROOM}');
    `))).rejects.toThrow()
  })

  it('shows each user only their own recent views', async () => {
    await db.exec(`
      INSERT INTO public.classroom_recent_views (user_id, classroom_id)
      VALUES ('${OWNER}', '${OWNER_ROOM}'), ('${OTHER}', '${OTHER_ROOM}');
    `)

    const visible = await asUser(OWNER, async tx => {
      const { rows } = await tx.query<{ classroom_id: string }>(
        'SELECT classroom_id FROM public.classroom_recent_views',
      )
      return rows.map(row => row.classroom_id)
    })
    expect(visible).toEqual([OWNER_ROOM])
  })
})
