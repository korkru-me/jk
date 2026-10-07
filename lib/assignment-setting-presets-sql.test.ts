/**
 * Executes ONLY the new preset migration in throwaway PostgreSQL. These are
 * synthetic accounts and no external Auth/database/Storage requests occur.
 * PGlite serializes connection work; the overlapping-dispatch test is not a
 * substitute for the separate-connection Staging race test before rollout.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { assignmentPresetDefaults, assignmentPresetSettingsSchema } from './assignment-setting-presets'

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261006082912_assignment_setting_presets.sql', import.meta.url), 'utf8')
const CONFLICT_FIX = readFileSync(new URL('../supabase/migrations/20261006102054_assignment_preset_conflict_http_status.sql', import.meta.url), 'utf8')
const ORIGINAL_MUTATOR = MIGRATION.slice(MIGRATION.indexOf('CREATE FUNCTION public.mutate_assignment_setting_preset('))
const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'
const ADMIN = '10000000-0000-4000-8000-000000000003'
const STUDENT = '10000000-0000-4000-8000-000000000004'
const INACTIVE = '10000000-0000-4000-8000-000000000005'
const UNKNOWN = '10000000-0000-4000-8000-000000000006'
const PRESET_A = '20000000-0000-4000-8000-000000000001'
const PRESET_B = '20000000-0000-4000-8000-000000000002'
const PRESET_INACTIVE = '20000000-0000-4000-8000-000000000003'
const SETTINGS = assignmentPresetDefaults('exercise')

let db: PGlite
type Caller = { role: 'anon' } | { role: 'authenticated'; userId: string }
const caller = (userId: string): Caller => ({ role: 'authenticated', userId })
const anon: Caller = { role: 'anon' }

async function as<T>(user: Caller, fn: (tx: Transaction) => Promise<T>, keep = false): Promise<T> {
  let result!: T
  await db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user.role === 'authenticated' ? user.userId : ''])
    await tx.exec(`SET LOCAL ROLE ${user.role}`)
    result = await fn(tx)
    if (!keep) await tx.rollback()
  })
  return result
}

type Mutation = {
  type?: 'exercise' | 'exam' | string
  action: string
  id?: string | null
  name?: string | null
  settings?: unknown
  revision?: number | null
}
async function rpc(tx: Transaction, input: Mutation): Promise<string | null> {
  const { rows } = await tx.query<{ id: string | null }>(
    'SELECT public.mutate_assignment_setting_preset($1, $2, $3, $4, $5::jsonb, $6) AS id',
    [input.type ?? 'exercise', input.action, input.id ?? null, input.name ?? null,
      input.settings === undefined ? null : JSON.stringify(input.settings), input.revision ?? null],
  )
  return rows[0].id
}
const create = (name: string, type = 'exercise', settings: unknown = SETTINGS): Mutation => ({ action: 'create', name, type, settings })
const ids = async (tx: Transaction, table = 'assignment_setting_presets') =>
  (await tx.query<{ id: string }>(`SELECT ${table === 'assignment_setting_presets' ? 'id' : 'default_preset_id AS id'} FROM public.${table} ORDER BY 1`)).rows.map(row => row.id)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    -- Supabase public-schema defaults are deliberately broad. The migration
    -- must explicitly remove them, rather than relying on this harness.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, status text NOT NULL, org_id text NOT NULL);
    INSERT INTO public.users VALUES
      ('${A}', 'teacher', 'active', 'synthetic-org-a'),
      ('${B}', 'teacher', 'active', 'synthetic-org-b'),
      ('${ADMIN}', 'admin', 'active', 'synthetic-admin-org'),
      ('${STUDENT}', 'student', 'active', 'synthetic-org-a'),
      ('${INACTIVE}', 'teacher', 'suspended', 'synthetic-org-a');
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY users_read_own ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
    REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
    CREATE TABLE public.assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), settings_snapshot jsonb NOT NULL);
    INSERT INTO public.assignments(settings_snapshot) VALUES ('{"duration_minutes":30,"question_ids":["synthetic-question"]}');
  `)
  await db.exec(MIGRATION)
  await db.exec(CONFLICT_FIX)
  await db.query(`INSERT INTO public.assignment_setting_presets(id, owner_id, assignment_type, slot, name, settings)
    VALUES ($1, $2, 'exercise', 1, 'A original', $7::jsonb),
      ($3, $4, 'exercise', 1, 'B original', $7::jsonb),
      ($5, $6, 'exercise', 1, 'inactive original', $7::jsonb)`,
  [PRESET_A, A, PRESET_B, B, PRESET_INACTIVE, INACTIVE, JSON.stringify(SETTINGS)])
  await db.exec(`INSERT INTO public.assignment_setting_preset_preferences VALUES
    ('${A}', 'exercise', '${PRESET_A}'), ('${B}', 'exercise', '${PRESET_B}');`)
}, 60_000)
afterAll(async () => { await db?.close() })

describe('preset table and RPC authorization', () => {
  it('reads only the exact account, including different-org teachers and admins', async () => {
    expect(await as(caller(A), ids)).toEqual([PRESET_A])
    expect(await as(caller(B), ids)).toEqual([PRESET_B])
    expect(await as(caller(ADMIN), ids)).toEqual([])
    expect(await as(caller(A), tx => ids(tx, 'assignment_setting_preset_preferences'))).toEqual([PRESET_A])
    expect(await as(caller(B), tx => ids(tx, 'assignment_setting_preset_preferences'))).toEqual([PRESET_B])
    expect(await as(caller(ADMIN), tx => ids(tx, 'assignment_setting_preset_preferences'))).toEqual([])
  })
  it('shows students, suspended teachers and unknown accounts no private presets/defaults', async () => {
    for (const user of [STUDENT, INACTIVE, UNKNOWN]) {
      expect(await as(caller(user), ids)).toEqual([])
      expect(await as(caller(user), tx => ids(tx, 'assignment_setting_preset_preferences'))).toEqual([])
      await expect(as(caller(user), tx => rpc(tx, create('not allowed'))))
        .rejects.toMatchObject({ code: '42501', message: 'preset_access_denied' })
    }
  })
  it('refuses anon table reads and function execution outright', async () => {
    await expect(as(anon, ids)).rejects.toMatchObject({ code: '42501' })
    await expect(as(anon, tx => ids(tx, 'assignment_setting_preset_preferences'))).rejects.toMatchObject({ code: '42501' })
    await expect(as(anon, tx => rpc(tx, create('not allowed')))).rejects.toMatchObject({ code: '42501' })
  })
  it('fixes definer search paths and grants mutation only to the session role', async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
      `SELECT proname, prosecdef, proconfig FROM pg_proc
       WHERE oid IN ('public.mutate_assignment_setting_preset(text,text,uuid,text,jsonb,integer)'::regprocedure,
         'public.can_use_assignment_setting_presets()'::regprocedure) ORDER BY proname`)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.prosecdef).toBe(true)
      expect(row.proconfig).toEqual(['search_path=""'])
    }
    const privileges = (await db.query<{ anon_can: boolean; session_can: boolean; service_can: boolean }>(
      `SELECT has_function_privilege('anon', 'public.mutate_assignment_setting_preset(text,text,uuid,text,jsonb,integer)', 'EXECUTE') AS anon_can,
        has_function_privilege('authenticated', 'public.mutate_assignment_setting_preset(text,text,uuid,text,jsonb,integer)', 'EXECUTE') AS session_can,
        has_function_privilege('service_role', 'public.mutate_assignment_setting_preset(text,text,uuid,text,jsonb,integer)', 'EXECUTE') AS service_can`)).rows[0]
    expect(privileges).toEqual({ anon_can: false, session_can: true, service_can: false })
  })
  it('denies direct inserts, updates, deletes and TRUNCATE, even to the owner', async () => {
    const attempts = [
      `INSERT INTO public.assignment_setting_presets(owner_id, assignment_type, slot, name, settings) VALUES ('${A}', 'exam', 1, 'direct', $1::jsonb)`,
      `UPDATE public.assignment_setting_presets SET name = 'direct' WHERE id = '${PRESET_A}'`,
      `DELETE FROM public.assignment_setting_presets WHERE id = '${PRESET_A}'`,
      'TRUNCATE public.assignment_setting_presets CASCADE',
      `INSERT INTO public.assignment_setting_preset_preferences VALUES ('${A}', 'exercise', '${PRESET_A}')`,
      `UPDATE public.assignment_setting_preset_preferences SET default_preset_id = '${PRESET_B}' WHERE owner_id = '${A}'`,
      `DELETE FROM public.assignment_setting_preset_preferences WHERE owner_id = '${A}'`,
      'TRUNCATE public.assignment_setting_preset_preferences',
    ]
    for (const sql of attempts) {
      await expect(as(caller(A), tx => tx.query(sql, sql.includes('$1') ? [JSON.stringify(SETTINGS)] : [])))
        .rejects.toMatchObject({ code: '42501' })
    }
  })
  it('requires exact owner and type for all existing-row mutations, without an admin bypass', async () => {
    for (const user of [B, ADMIN]) {
      for (const action of ['update', 'rename', 'delete', 'default']) {
        const input: Mutation = { action, id: PRESET_A, revision: 1 }
        if (action === 'update' || action === 'rename') input.name = 'attack'
        if (action === 'update') input.settings = SETTINGS
        await expect(as(caller(user), tx => rpc(tx, input)))
          .rejects.toMatchObject({ code: '42501', message: 'preset_access_denied' })
      }
    }
    await expect(as(caller(A), tx => rpc(tx, { action: 'default', type: 'exam', id: PRESET_A, revision: 1 })))
      .rejects.toMatchObject({ code: '42501' })
    await expect(as(caller(A), tx => rpc(tx, { action: 'delete', id: '20000000-0000-4000-8000-999999999999', revision: 1 })))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('allows an active admin to manage their own private presets only', async () => {
    await as(caller(ADMIN), async tx => {
      const id = await rpc(tx, create('Admin own'))
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
      expect(await ids(tx)).toEqual([id])
      await rpc(tx, { action: 'default', id, revision: 1 })
      expect(await ids(tx, 'assignment_setting_preset_preferences')).toEqual([id])
    })
  })
})

describe('preset persistence, quota and concurrent revisions', () => {
  it('round-trips all intended settings without touching old assignment snapshots', async () => {
    const before = (await db.query('SELECT settings_snapshot FROM public.assignments')).rows
    await as(caller(A), async tx => {
      const settings = { ...SETTINGS, duration_minutes: 45, completion_rule: 'streak' as const,
        instant_check: false, max_attempts: 8, questions_per_page: 5, passing_type: 'score' as const,
        passing_value: 8.5, random_question_count: 100, shared_random_values: true,
        secure_browser_mode: 'seb_required' as const, android_exam_mode: 'monitored' as const }
      const id = await rpc(tx, create('  reusable intended settings  ', 'exercise', settings))
      const first = (await tx.query<{ owner_id: string; slot: number; name: string; settings: unknown; schema_version: number; revision: number; updated_at: Date }>(
        'SELECT * FROM public.assignment_setting_presets WHERE id = $1', [id])).rows[0]
      expect(first).toMatchObject({ owner_id: A, slot: 2, name: 'reusable intended settings', settings, schema_version: 1, revision: 1 })
      expect(first.updated_at).toBeTruthy()
      await rpc(tx, { action: 'update', id, name: 'updated', settings: { ...settings, duration_minutes: 60 }, revision: 1 })
      const updated = (await tx.query<{ settings: typeof settings; revision: number }>('SELECT settings, revision FROM public.assignment_setting_presets WHERE id = $1', [id])).rows[0]
      expect(updated.revision).toBe(2)
      expect(updated.settings.duration_minutes).toBe(60)
      await rpc(tx, { action: 'rename', id, name: 'renamed', revision: 2 })
      expect((await tx.query<{ revision: number }>('SELECT revision FROM public.assignment_setting_presets WHERE id = $1', [id])).rows[0].revision).toBe(3)
      await rpc(tx, { action: 'delete', id, revision: 3 })
      expect(await ids(tx)).toEqual([PRESET_A])
    })
    expect((await db.query('SELECT settings_snapshot FROM public.assignments')).rows).toEqual(before)
  })
  it('allows exactly three presets per type, with the default counted in those three', async () => {
    await as(caller(A), async tx => {
      await rpc(tx, create('exercise 2'))
      await rpc(tx, create('exercise 3'))
      for (let n = 1; n <= 3; n++) await rpc(tx, create(`exam ${n}`, 'exam'))
      const counts = (await tx.query<{ assignment_type: string; count: number }>(
        'SELECT assignment_type, count(*)::int AS count FROM public.assignment_setting_presets GROUP BY assignment_type ORDER BY assignment_type')).rows
      expect(counts).toEqual([{ assignment_type: 'exam', count: 3 }, { assignment_type: 'exercise', count: 3 }])
      expect(await ids(tx, 'assignment_setting_preset_preferences')).toEqual([PRESET_A])
    })
    await expect(as(caller(A), async tx => {
      await rpc(tx, create('exercise 2'))
      await rpc(tx, create('exercise 3'))
      await rpc(tx, create('fourth'))
    })).rejects.toMatchObject({ code: 'P0001', message: 'preset_quota' })
  })
  it('rejects name collisions case-insensitively but permits the same name in another type/account', async () => {
    await expect(as(caller(A), tx => rpc(tx, create('a ORIGINAL')))).rejects.toMatchObject({ code: '23505' })
    await as(caller(A), async tx => { expect(await rpc(tx, create('A original', 'exam'))).toBeTruthy() })
    await as(caller(B), async tx => { expect(await rpc(tx, create('A original'))).toBeTruthy() })
    await expect(as(caller(A), tx => rpc(tx, create('   ')))).rejects.toMatchObject({ code: '22023' })
    await expect(as(caller(A), tx => rpc(tx, create('a'.repeat(61))))).rejects.toMatchObject({ code: '22023' })
  })
  it('requires CAS revisions for update/rename/delete/default and rejects stale changes', async () => {
    for (const action of ['update', 'rename', 'delete', 'default']) {
      const input: Mutation = { action, id: PRESET_A, revision: 99 }
      if (action === 'update' || action === 'rename') input.name = 'new'
      if (action === 'update') input.settings = SETTINGS
      await expect(as(caller(A), tx => rpc(tx, input))).rejects.toMatchObject({ code: 'PT409', message: 'preset_stale_revision' })
      delete input.revision
      await expect(as(caller(A), tx => rpc(tx, input))).rejects.toMatchObject({ code: '22023' })
    }
    await expect(as(caller(A), async tx => {
      await rpc(tx, { action: 'rename', id: PRESET_A, name: 'first writer', revision: 1 })
      await rpc(tx, { action: 'rename', id: PRESET_A, name: 'stale writer', revision: 1 })
    })).rejects.toMatchObject({ code: 'PT409' })
  })
  it('atomically replaces/clears defaults and deletion clears only the deleted preset default', async () => {
    await as(caller(A), async tx => {
      const id = await rpc(tx, create('second preset'))
      await rpc(tx, { action: 'default', id, revision: 1 })
      expect(await ids(tx, 'assignment_setting_preset_preferences')).toEqual([id])
      expect((await tx.query<{ revision: number }>('SELECT revision FROM public.assignment_setting_presets WHERE id = $1', [id])).rows[0].revision).toBe(1)
      await rpc(tx, { action: 'delete', id: PRESET_A, revision: 1 })
      expect(await ids(tx, 'assignment_setting_preset_preferences')).toEqual([id])
      await rpc(tx, { action: 'clear_default' })
      expect(await ids(tx, 'assignment_setting_preset_preferences')).toEqual([])
      await rpc(tx, { action: 'default', id, revision: 1 })
      await rpc(tx, { action: 'delete', id, revision: 1 })
      expect(await ids(tx, 'assignment_setting_preset_preferences')).toEqual([])
      const reusedId = await rpc(tx, create('reused slot'))
      expect((await tx.query<{ slot: number }>('SELECT slot FROM public.assignment_setting_presets WHERE id = $1', [reusedId])).rows[0].slot).toBe(1)
    })
    expect(await as(caller(B), tx => ids(tx, 'assignment_setting_preset_preferences'))).toEqual([PRESET_B])
  })
  it('uses a shared transactional advisory lock and structural fixed-slot cap', async () => {
    const definition = (await db.query<{ body: string }>(`SELECT pg_get_functiondef('public.mutate_assignment_setting_preset(text,text,uuid,text,jsonb,integer)'::regprocedure) AS body`)).rows[0].body
    expect(definition).toContain('pg_advisory_xact_lock')
    expect(definition.indexOf('pg_advisory_xact_lock')).toBeLessThan(definition.indexOf("IF p_action = 'clear_default'"))
    await expect(db.transaction(async tx => {
      await tx.query(`INSERT INTO public.assignment_setting_presets(owner_id, assignment_type, slot, name, settings) VALUES ($1, 'exam', 4, 'cannot allocate fourth slot', $2::jsonb)`, [A, JSON.stringify(SETTINGS)])
    })).rejects.toMatchObject({ code: '23514' })
    await expect(db.transaction(async tx => {
      await tx.query(`INSERT INTO public.assignment_setting_presets(owner_id, assignment_type, slot, name, settings) VALUES ($1, 'exercise', 1, 'cannot reuse occupied slot', $2::jsonb)`, [A, JSON.stringify(SETTINGS)])
    })).rejects.toMatchObject({ code: '23505' })
  })
  it('overlapping RPC dispatch allocates only three exam slots (single PGlite connection)', async () => {
    const results = await Promise.allSettled([1, 2, 3, 4].map(n =>
      as(caller(A), tx => rpc(tx, create(`dispatch ${n}`, 'exam')), true)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3)
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(failures).toHaveLength(1)
    expect(failures[0].reason).toMatchObject({ code: 'P0001', message: 'preset_quota' })
    expect((await db.query<{ slot: number }>(`SELECT slot FROM public.assignment_setting_presets WHERE owner_id = $1 AND assignment_type = 'exam' ORDER BY slot`, [A])).rows).toEqual([{ slot: 1 }, { slot: 2 }, { slot: 3 }])
    await db.query(`DELETE FROM public.assignment_setting_presets WHERE owner_id = $1 AND assignment_type = 'exam'`, [A])
  })
  it('cannot point a default at another owner or type even with privileged table access', async () => {
    for (const ownerAndType of [[A, 'exam', PRESET_A], [B, 'exam', PRESET_A], [ADMIN, 'exercise', PRESET_A]]) {
      await expect(db.transaction(tx => tx.query(`INSERT INTO public.assignment_setting_preset_preferences(owner_id, assignment_type, default_preset_id) VALUES ($1, $2, $3)`, ownerAndType)))
        .rejects.toMatchObject({ code: '23503' })
    }
  })
})

describe('expected conflict HTTP status migration', () => {
  it('changes only the expected conflict code, preserving the original mutation and grant contract', () => {
    const replacement = CONFLICT_FIX.slice(CONFLICT_FIX.indexOf('CREATE OR REPLACE FUNCTION public.mutate_assignment_setting_preset('))
      .replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION')
      .replace("ERRCODE = 'PT409', MESSAGE = 'preset_stale_revision'", "ERRCODE = '40001', MESSAGE = 'preset_stale_revision'")
    expect(replacement.trim()).toBe(ORIGINAL_MUTATOR.trim())
    expect(CONFLICT_FIX.match(/ERRCODE = 'PT409'/g)).toHaveLength(1)
  })
  it('upgrades an already-installed 40001 function without changing the underlying stale-write rejection', async () => {
    // A transactional replay of ONLY the old function, never the old tables.
    // Raising the old conflict rolls it back, restoring the installed fix.
    await expect(db.transaction(async tx => {
      await tx.exec(ORIGINAL_MUTATOR.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'))
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [A])
      await tx.exec('SET LOCAL ROLE authenticated')
      await rpc(tx, { action: 'rename', id: PRESET_A, name: 'stale old wire code', revision: 99 })
    })).rejects.toMatchObject({ code: '40001', message: 'preset_stale_revision' })
    await expect(as(caller(A), tx => rpc(tx, { action: 'rename', id: PRESET_A, name: 'stale new wire code', revision: 99 })))
      .rejects.toMatchObject({ code: 'PT409', message: 'preset_stale_revision' })
  })
  it('two overlapping rename requests persist one revision bump and return one PT409 (single connection)', async () => {
    const before = (await db.query<{ revision: number }>('SELECT revision FROM public.assignment_setting_presets WHERE id = $1', [PRESET_A])).rows[0]
    expect(before.revision).toBe(1)
    const names = ['Wire editor A', 'Wire editor B']
    const results = await Promise.allSettled(names.map(name =>
      as(caller(A), tx => rpc(tx, { action: 'rename', id: PRESET_A, name, revision: before.revision }), true)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(failures).toHaveLength(1)
    expect(failures[0].reason).toMatchObject({ code: 'PT409', message: 'preset_stale_revision' })
    const persisted = (await db.query<{ revision: number; name: string }>('SELECT revision, name FROM public.assignment_setting_presets WHERE id = $1', [PRESET_A])).rows[0]
    expect(persisted.revision).toBe(2)
    expect(names).toContain(persisted.name)
  })
})

describe('strict SQL settings and input boundary', () => {
  it('matches the version-one TypeScript schema on valid optional bounds and enums', async () => {
    const cases: unknown[] = [SETTINGS, assignmentPresetDefaults('exam'),
      { ...SETTINGS, duration_minutes: 525600, max_attempts: 10000, questions_per_page: 50,
        streak_target: 20, streak_question_cap: 200, random_question_count: 10000,
        display_max_score: 1000000, passing_type: 'percent', passing_value: 100 },
      { ...SETTINGS, max_attempts: null, streak_question_cap: null, passing_type: 'score', passing_value: 0.25,
        score_strategy: 'latest', retry_scope: 'wrong_only', show_results: 'never' }]
    for (const settings of cases) {
      expect(assignmentPresetSettingsSchema.safeParse(settings).success).toBe(true)
      expect((await db.query<{ valid: boolean }>('SELECT public.assignment_setting_preset_settings_valid($1::jsonb) AS valid', [JSON.stringify(settings)])).rows[0].valid).toBe(true)
    }
    expect(Object.keys(SETTINGS)).toHaveLength(30)
  })
  it('rejects missing keys, wrong JSON types, out-of-range settings and secret/content keys', async () => {
    const missing = { ...SETTINGS } as Record<string, unknown>
    delete missing.duration_minutes
    const invalid: unknown[] = [null, [], 'object', {}, missing,
      ...['access_code', 'seb_quit_password', 'config_key', 'browser_exam_key', 'question_ids', 'owner_id', 'shared_random_seed', 'revision', 'schema_version', 'title']
        .map(key => ({ ...SETTINGS, [key]: 'not allowed' })),
      ...['true', 1, null, []].map(shuffle_questions => ({ ...SETTINGS, shuffle_questions })),
      ...[0, 1.5, 525601, '30'].map(duration_minutes => ({ ...SETTINGS, duration_minutes })),
      { ...SETTINGS, questions_per_page: 51 }, { ...SETTINGS, questions_per_page: null },
      { ...SETTINGS, max_attempts: 10001 }, { ...SETTINGS, random_question_count: 10001 },
      { ...SETTINGS, streak_target: 1 }, { ...SETTINGS, streak_target: 21 },
      { ...SETTINGS, streak_question_cap: 201 }, { ...SETTINGS, display_max_score: 0 },
      { ...SETTINGS, display_max_score: 1000001 }, { ...SETTINGS, passing_value: 8 },
      { ...SETTINGS, passing_type: 'score' }, { ...SETTINGS, passing_type: 'percent', passing_value: 101 },
      { ...SETTINGS, passing_type: 'score', passing_value: -1 },
      { ...SETTINGS, show_results: 'all' }, { ...SETTINGS, score_strategy: 'max' },
      { ...SETTINGS, retry_scope: 'wrong' }, { ...SETTINGS, secure_browser_mode: 'none' },
      { ...SETTINGS, android_exam_mode: 'allow' }, { ...SETTINGS, completion_rule: 'complete' }]
    for (const settings of invalid) {
      expect(assignmentPresetSettingsSchema.safeParse(settings).success).toBe(false)
      expect((await db.query<{ valid: boolean }>('SELECT public.assignment_setting_preset_settings_valid($1::jsonb) AS valid', [JSON.stringify(settings)])).rows[0].valid).toBe(false)
      await expect(as(caller(A), tx => rpc(tx, create('invalid', 'exercise', settings))))
        .rejects.toMatchObject({ code: '22023', message: 'preset_invalid_settings' })
    }
  })
  it('keeps version, ID, slot, owner, revision and timestamps server-controlled', async () => {
    for (const input of [
      { ...create('invalid'), id: PRESET_A }, { ...create('invalid'), revision: 1 },
      { action: 'unknown' }, { ...create('invalid'), type: 'homeroom' },
      { action: 'clear_default', id: PRESET_A },
      { action: 'default', id: PRESET_A, revision: 1, settings: SETTINGS },
      { action: 'delete', id: PRESET_A, revision: 1, name: 'unexpected' },
    ]) {
      await expect(as(caller(A), tx => rpc(tx, input))).rejects.toMatchObject({ code: '22023' })
    }
    await expect(db.transaction(tx => tx.query(`INSERT INTO public.assignment_setting_presets(owner_id, assignment_type, slot, name, settings, schema_version) VALUES ($1, 'exam', 1, 'unsupported version', $2::jsonb, 2)`, [A, JSON.stringify(SETTINGS)])))
      .rejects.toMatchObject({ code: '23514' })
    await expect(db.transaction(tx => tx.query(`UPDATE public.assignment_setting_presets SET revision = 0 WHERE id = $1`, [PRESET_A])))
      .rejects.toMatchObject({ code: '23514' })
    await expect(db.transaction(tx => tx.query(`UPDATE public.assignment_setting_presets SET revision = 2147483647 WHERE id = $1`, [PRESET_A])))
      .rejects.toMatchObject({ code: '23514' })
  })
})
