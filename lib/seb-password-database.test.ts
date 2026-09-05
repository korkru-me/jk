import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
vi.mock('server-only', () => ({}))
import { SebPasswordVault } from '@/lib/seb-password-vault'
import { parseSebPasswordSettingsSummary } from '@/lib/seb-password-service'

// Real PostgreSQL engine, in memory, with a MINIMAL synthetic dependency
// schema. Not a replay of Supabase history, a live Supabase/Auth integration,
// a multi-connection concurrency test, or a running cron scheduler.
const teacher = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const assignment = '33333333-3333-4333-8333-333333333333'
const other = '44444444-4444-4444-8444-444444444444'
const otherOrg = '55555555-5555-4555-8555-555555555555'
const otherAssignment = '66666666-6666-4666-8666-666666666666'
const student = '77777777-7777-4777-8777-777777777777'
const vault = new SebPasswordVault('fixture', { fixture: Buffer.alloc(32, 8).toString('base64') })
const password = 'Synthetic-password-123!'
let db: PGlite

async function ownerSQL(sql: string, params: unknown[] = []) {
  await db.exec('RESET ROLE')
  try { return await db.query(sql, params) } finally { await db.exec('SET ROLE service_role') }
}
async function save(expected = 0, actor = teacher, target = assignment, secretOverride?: unknown) {
  const revisionId = randomUUID()
  const secret = secretOverride === undefined
    ? vault.seal(password, { orgId: target === assignment ? org : otherOrg, teacherId: actor, assignmentId: target, revisionId, revision: expected + 1 })
    : secretOverride
  const result = await db.query<{ summary: unknown }>('SELECT public.write_exam_seb_password_draft($1,$2,$3,$4,$5) AS summary',
    [target, actor, expected, revisionId, secret === null ? null : JSON.stringify(secret)])
  return parseSebPasswordSettingsSummary(result.rows[0].summary)
}
async function read(actor = teacher, target = assignment) {
  const result = await db.query<{ summary: unknown }>('SELECT public.read_exam_seb_password_draft($1,$2) AS summary', [target, actor])
  return parseSebPasswordSettingsSummary(result.rows[0].summary)
}
async function ageDraft(interval = '20 seconds') {
  await ownerSQL("UPDATE public.exam_seb_password_drafts SET updated_at = updated_at - $1::interval, expires_at = expires_at - $1::interval", [interval])
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, status text NOT NULL);
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.organization_members (org_id uuid, user_id uuid, PRIMARY KEY (org_id,user_id));
    CREATE TABLE public.assignments (
      id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id),
      created_by uuid NOT NULL REFERENCES public.users(id), type text, mode text, secure_browser_mode text
    );
    CREATE SCHEMA cron;
    CREATE TABLE cron.jobs (name text, schedule text, command text);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO cron.jobs VALUES ($1,$2,$3); RETURN 1; END; $$;
  `)
  const migration = await readFile(new URL('../supabase/migrations/20260905072556_add_exam_seb_password_drafts.sql', import.meta.url), 'utf8')
  await db.exec(migration) // The exact unmodified migration, not an SQL copy.
}, 30_000)

beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE public.exam_seb_password_events, public.exam_seb_password_drafts, public.organization_members,
      public.assignments, public.organizations, public.users CASCADE;
    INSERT INTO public.users VALUES ('${teacher}','teacher','active'), ('${other}','admin','active'), ('${student}','student','active');
    INSERT INTO public.organizations VALUES ('${org}'), ('${otherOrg}');
    INSERT INTO public.organization_members VALUES ('${org}','${teacher}'), ('${otherOrg}','${other}'), ('${org}','${other}'), ('${org}','${student}');
    INSERT INTO public.assignments VALUES ('${assignment}','${org}','${teacher}','exam','online','seb_required'),
      ('${otherAssignment}','${otherOrg}','${other}','exam','online','seb_required');
    SET ROLE service_role;
  `)
})
afterAll(async () => { await db?.close() })

describe('password migration and RPCs on isolated PostgreSQL', () => {
  it('creates a metadata-only acknowledgement and stores a decryptable context-bound envelope', async () => {
    expect(await read()).toEqual({ draft: null, events: [] })
    const result = await save()
    expect(result.draft?.revision).toBe(1)
    expect(result.draft?.state).toBe('saved')
    expect(result.events).toHaveLength(1)
    expect(JSON.stringify(result)).not.toMatch(/ciphertext|password|secret|keyId/)
    const stored = await db.query<{ secret: unknown; revision_id: string }>('SELECT secret,revision_id FROM public.exam_seb_password_drafts')
    expect(vault.open(stored.rows[0].secret, { orgId: org, teacherId: teacher, assignmentId: assignment, revisionId: stored.rows[0].revision_id, revision: 1 })).toBe(password)
    expect(JSON.stringify(stored.rows[0])).not.toContain(password)
  })
  it('CAS accepts only one request with the same expected initial revision', async () => {
    // PGlite serializes these calls. This tests SQL CAS, not contention between
    // two live PostgreSQL connections (still required before rollout).
    const results = await Promise.allSettled([save(), save()])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason.code).toBe('40001')
    expect((await read()).events).toHaveLength(1)
  })
  it('rejects stale replacement without losing the saved secret', async () => {
    await save()
    await ageDraft()
    const replaced = await save(1)
    expect(replaced.draft?.revision).toBe(2)
    await expect(save(1)).rejects.toMatchObject({ code: '40001' })
    expect((await read()).draft?.revision).toBe(2)
    expect((await db.query('SELECT * FROM public.exam_seb_password_drafts')).rows).toHaveLength(1)
  })
  it('rate limits repeated saves after checking the revision', async () => {
    await save()
    await expect(save(1)).rejects.toMatchObject({ code: 'P0001', message: 'SEB_PASSWORD_RATE_LIMITED' })
    expect((await read()).events).toHaveLength(1)
  })
  it.each([other, student])('rejects another actor even with organization membership', async actor => {
    await save()
    await expect(read(actor)).rejects.toMatchObject({ code: '42501' })
    await expect(save(1, actor)).rejects.toMatchObject({ code: '42501' })
  })
  it('keeps owning teachers in separate organizations independent', async () => {
    await save()
    await save(0, other, otherAssignment)
    await expect(read(teacher, otherAssignment)).rejects.toMatchObject({ code: '42501' })
    expect((await read(other, otherAssignment)).draft?.revision).toBe(1)
  })
  it.each([
    `UPDATE public.users SET status='suspended' WHERE id='${teacher}'`,
    `UPDATE public.users SET role='student' WHERE id='${teacher}'`,
    `DELETE FROM public.organization_members WHERE user_id='${teacher}'`,
    `UPDATE public.assignments SET type='exercise' WHERE id='${assignment}'`,
    `UPDATE public.assignments SET mode='print' WHERE id='${assignment}'`,
    `UPDATE public.assignments SET secure_browser_mode='browser' WHERE id='${assignment}'`,
  ])('rechecks eligibility at the SQL boundary', async sql => {
    await ownerSQL(sql)
    await expect(save()).rejects.toMatchObject({ code: '42501' })
    await expect(read()).rejects.toMatchObject({ code: '42501' })
  })
  it.each([{}, { password }, { version: 1 }, [], 'plaintext', { version: 1, algorithm: 'AES-256-GCM', keyId: 'test', iv: 'invalid', tag: 'invalid', ciphertext: 'invalid' }])('refuses malformed or plaintext storage payloads', async secret => {
    await expect(save(0, teacher, assignment, secret)).rejects.toBeDefined()
    expect((await read()).draft).toBeNull()
  })
  it('does not allow an extra plaintext field alongside a valid envelope', async () => {
    const secret = vault.seal(password, { orgId: org, teacherId: teacher, assignmentId: assignment, revisionId: randomUUID(), revision: 1 })
    await expect(save(0, teacher, assignment, { ...secret, password })).rejects.toMatchObject({ code: '22023' })
  })
  it('replaces a draft with a secret-free discard revision and retains the audit', async () => {
    await save()
    const result = await save(1, teacher, assignment, null)
    expect(result.draft?.state).toBe('discarded')
    expect(result.draft?.revision).toBe(2)
    expect(result.events.map(event => event.action)).toEqual(['discarded', 'saved'])
    expect((await db.query<{ secret: unknown }>('SELECT secret FROM public.exam_seb_password_drafts')).rows[0].secret).toBeNull()
  })
  it('expires reads immediately, purges only expired secrets, and retains revision monotonicity', async () => {
    await save()
    await ageDraft('31 days')
    expect((await read()).draft?.state).toBe('expired')
    await db.query('SELECT public.purge_expired_exam_seb_password_drafts()')
    expect((await db.query<{ secret: unknown }>('SELECT secret FROM public.exam_seb_password_drafts')).rows[0].secret).toBeNull()
    expect((await read()).events[0].action).toBe('expired')
    await db.query('SELECT public.purge_expired_exam_seb_password_drafts()')
    expect((await read()).events.filter(event => event.action === 'expired')).toHaveLength(1)
    expect((await save(1)).draft?.revision).toBe(2)
  })
  it('deletes audit older than 90 days without deleting a current draft', async () => {
    await save()
    await ownerSQL("UPDATE public.exam_seb_password_events SET created_at = now() - interval '91 days'")
    expect((await read()).events).toEqual([])
    await db.query('SELECT public.purge_expired_exam_seb_password_drafts()')
    expect((await db.query('SELECT * FROM public.exam_seb_password_events')).rows).toHaveLength(0)
    expect((await read()).draft?.state).toBe('saved')
  })
  it('cascades only draft/audit data when the parent exam is deleted', async () => {
    await save()
    await save(0, other, otherAssignment)
    await ownerSQL('DELETE FROM public.assignments WHERE id=$1', [assignment])
    expect((await db.query('SELECT * FROM public.exam_seb_password_drafts')).rows).toHaveLength(1)
    expect((await read(other, otherAssignment)).draft?.state).toBe('saved')
  })
  it.each(['anon', 'authenticated'])('denies all browser table privileges and RPC execution to %s', async role => {
    await save()
    const privileges = await db.query<{ allowed: boolean }>(`SELECT
      has_table_privilege($1, 'public.exam_seb_password_drafts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege($1, 'public.exam_seb_password_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed`, [role])
    expect(privileges.rows[0].allowed).toBe(false)
    await db.exec(`SET ROLE ${role}`) // Role is the fixed test allowlist above.
    try {
      await expect(db.query('SELECT * FROM public.exam_seb_password_drafts')).rejects.toMatchObject({ code: '42501' })
      await expect(read()).rejects.toMatchObject({ code: '42501' })
      await expect(save()).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('SELECT public.purge_expired_exam_seb_password_drafts()')).rejects.toMatchObject({ code: '42501' })
    } finally { await db.exec('RESET ROLE; SET ROLE service_role') }
  })
  it('enables RLS and pins security-definer search paths', async () => {
    const tables = await ownerSQL("SELECT relrowsecurity FROM pg_class WHERE relname IN ('exam_seb_password_drafts','exam_seb_password_events')")
    expect(tables.rows).toEqual([{ relrowsecurity: true }, { relrowsecurity: true }])
    const funcs = await ownerSQL("SELECT prosecdef,proconfig FROM pg_proc WHERE proname IN ('read_exam_seb_password_draft','write_exam_seb_password_draft','authorize_exam_seb_password_owner','purge_expired_exam_seb_password_drafts')")
    expect(funcs.rows).toHaveLength(4)
    for (const row of funcs.rows) expect(row).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] })
    const cron = await ownerSQL('SELECT name,command FROM cron.jobs')
    expect(cron.rows).toEqual([{ name: 'purge-expired-exam-seb-password-drafts', command: 'SELECT public.purge_expired_exam_seb_password_drafts();' }])
  })
})
