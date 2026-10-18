import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = readFileSync(new URL('../supabase/migrations/20261018154826_resend_quota_alert_delivery_ledger.sql', import.meta.url), 'utf8')
const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)
const DAILY = '2026-10-18'
const MONTHLY = '2026-11-09T15:12:34.000Z'
type Claim = { status: string; delivery_key: string | null }
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  `)
  await db.exec(sql)
})
afterAll(async () => { await db.close() })
beforeEach(async () => { await db.exec('TRUNCATE public.resend_quota_alert_deliveries') })

async function claim(level = 80, period = 'daily', window = DAILY, scope = 'staging', hash = HASH) {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE service_role')
    return (await tx.query<Claim>(
      'SELECT * FROM public.claim_resend_quota_alert($1, $2, $3, $4, $5)',
      [scope, period, window, level, hash],
    )).rows[0]
  })
}

async function complete(key: string | null) {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE service_role')
    return (await tx.query<{ result: boolean }>(
      'SELECT public.complete_resend_quota_alert($1::uuid) AS result', [key],
    )).rows[0].result
  })
}

async function age(hours: number) {
  await db.query("UPDATE public.resend_quota_alert_deliveries SET created_at = clock_timestamp() - $1 * interval '1 hour'", [hours])
}

describe('durable Resend aggregate alert ledger', () => {
  it('reserves one stable random delivery key across pending retries', async () => {
    const first = await claim()
    expect(first.status).toBe('ready')
    expect(first.delivery_key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    expect(await claim()).toEqual(first)
    expect((await db.query('SELECT * FROM public.resend_quota_alert_deliveries')).rows).toHaveLength(1)
  })

  it('completes idempotently and never sends the completed level again', async () => {
    const first = await claim()
    expect(await complete(first.delivery_key)).toBe(true)
    const sent = (await db.query<{ sent_at: Date }>('SELECT sent_at FROM public.resend_quota_alert_deliveries')).rows[0].sent_at
    expect(await complete(first.delivery_key)).toBe(true)
    expect((await db.query<{ sent_at: Date }>('SELECT sent_at FROM public.resend_quota_alert_deliveries')).rows[0].sent_at).toEqual(sent)
    expect(await claim()).toEqual({ status: 'already_sent', delivery_key: null })
  })

  it('retains completed monthly receipts beyond provider idempotency expiry', async () => {
    const first = await claim(80, 'monthly', MONTHLY)
    await complete(first.delivery_key)
    await age(24 * 40)
    expect((await claim(80, 'monthly', MONTHLY)).status).toBe('already_sent')
  })

  it.each([23, 24, 24 * 40])('never issues a new delivery key for uncertain pending claims after %s hours', async (hours) => {
    const first = await claim(80, 'monthly', MONTHLY)
    await age(hours)
    expect(await claim(80, 'monthly', MONTHLY)).toEqual({ status: 'delivery_uncertain', delivery_key: null })
    const rows = (await db.query<{ delivery_key: string }>('SELECT delivery_key FROM public.resend_quota_alert_deliveries')).rows
    expect(rows).toEqual([{ delivery_key: first.delivery_key }])
  })

  it('reuses the original key while still inside the conservative 23-hour boundary', async () => {
    const first = await claim()
    await age(22.99)
    expect(await claim()).toEqual(first)
  })

  it('accepts a late signed delivery confirmation without reopening an uncertain claim', async () => {
    const first = await claim()
    await age(25)
    expect((await claim()).status).toBe('delivery_uncertain')
    expect(await complete(first.delivery_key)).toBe(true)
    expect((await claim()).status).toBe('already_sent')
  })

  it('rejects changed payloads rather than sending different content under the same key', async () => {
    const first = await claim()
    expect(await claim(80, 'daily', DAILY, 'staging', OTHER_HASH)).toEqual({ status: 'payload_mismatch', delivery_key: null })
    expect(await claim()).toEqual(first)
    await complete(first.delivery_key)
    expect((await claim(80, 'daily', DAILY, 'staging', OTHER_HASH)).status).toBe('already_sent')
  })

  it('keeps completed high-water deduplication even if lower pending payload changed', async () => {
    await claim(80)
    await complete((await claim(95)).delivery_key)
    expect((await claim(80, 'daily', DAILY, 'staging', OTHER_HASH)).status).toBe('already_sent')
  })

  it('allows upward thresholds and suppresses lower sent levels on counter decrease', async () => {
    await complete((await claim(80)).delivery_key)
    await complete((await claim(90)).delivery_key)
    expect((await claim(80)).status).toBe('already_sent')
    expect((await claim(95)).status).toBe('ready')
  })

  it('suppresses previously unclaimed lower levels when a higher level is sent', async () => {
    await complete((await claim(95)).delivery_key)
    expect((await claim(80)).status).toBe('already_sent')
    expect((await claim(90)).status).toBe('already_sent')
    expect((await db.query('SELECT * FROM public.resend_quota_alert_deliveries')).rows).toHaveLength(1)
  })

  it('suppresses all lower levels while a higher claim is pending or uncertain', async () => {
    await claim(95)
    expect((await claim(80)).status).toBe('ignored_higher')
    await age(25)
    expect((await claim(90)).status).toBe('ignored_higher')
    expect((await db.query('SELECT * FROM public.resend_quota_alert_deliveries')).rows).toHaveLength(1)
  })

  it('suppresses a pending lower reservation after a higher reservation appears', async () => {
    await claim(80)
    await claim(90)
    expect((await claim(80)).status).toBe('ignored_higher')
  })

  it('isolates periods, next windows and environment scopes', async () => {
    const results = [
      await claim(), await claim(80, 'monthly', MONTHLY),
      await claim(80, 'daily', '2026-10-19'),
      await claim(80, 'daily', DAILY, 'production'),
      await claim(80, 'daily', DAILY, 'local'),
      await claim(80, 'monthly', '2026-12-09T15:12:34.000Z'),
    ]
    expect(results.every((result) => result.status === 'ready')).toBe(true)
    expect(new Set(results.map((result) => result.delivery_key)).size).toBe(6)
  })

  it('accepts real leap dates and non-calendar monthly reset instants', async () => {
    expect((await claim(80, 'daily', '2028-02-29')).status).toBe('ready')
    expect((await claim(80, 'monthly', '2028-02-29T21:17:43.123Z')).status).toBe('ready')
  })

  it.each([
    [80, 'daily', '2026-02-29', 'staging', HASH],
    [80, 'daily', '2026-10-18T00:00:00.000Z', 'staging', HASH],
    [80, 'monthly', '2026-11', 'staging', HASH],
    [80, 'monthly', '2026-02-29T00:00:00.000Z', 'staging', HASH],
    [80, 'monthly', '2026-11-09T25:00:00.000Z', 'staging', HASH],
    [80, 'monthly', '2026-11-09T00:00:00.000+00:00', 'staging', HASH],
    [80, 'weekly', DAILY, 'staging', HASH],
    [97, 'daily', DAILY, 'staging', HASH],
    [80, 'daily', DAILY, 'preview', HASH],
    [80, 'daily', DAILY, 'staging', 'someone@example.invalid'],
  ])('rejects malformed claims without creating a receipt (%s / %s / %s / %s)', async (level, period, window, scope, hash) => {
    await expect(claim(level as number, period as string, window as string, scope as string, hash as string)).rejects.toThrow(/Invalid quota alert/)
    expect((await db.query('SELECT * FROM public.resend_quota_alert_deliveries')).rows).toHaveLength(0)
  })

  it('does not create a receipt when completion key is absent or unknown', async () => {
    expect(await complete(null)).toBe(false)
    expect(await complete('11111111-1111-4111-8111-111111111111')).toBe(false)
    expect((await db.query('SELECT * FROM public.resend_quota_alert_deliveries')).rows).toHaveLength(0)
  })

  it('rejects null claim fields before allocating a delivery key', async () => {
    const valid: (string | number | null)[] = ['staging', 'daily', DAILY, 80, HASH]
    for (let index = 0; index < valid.length; index++) {
      const values = [...valid]
      values[index] = null
      await expect(db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE service_role')
        return tx.query('SELECT * FROM public.claim_resend_quota_alert($1, $2, $3, $4, $5)', values)
      })).rejects.toThrow('Invalid quota alert claim')
    }
    expect((await db.query('SELECT * FROM public.resend_quota_alert_deliveries')).rows).toHaveLength(0)
  })

  for (const role of ['anon', 'authenticated']) {
    it(`denies ${role} table reads/writes and both RPCs despite inherited defaults`, async () => {
      const { delivery_key: key } = await claim()
      for (const query of [
        'SELECT * FROM public.resend_quota_alert_deliveries',
        "INSERT INTO public.resend_quota_alert_deliveries(scope, period, window_key, level, payload_hash) VALUES ('staging', 'daily', '2026-10-19', 80, '" + HASH + "')",
        'UPDATE public.resend_quota_alert_deliveries SET sent_at = now()',
        'DELETE FROM public.resend_quota_alert_deliveries',
        `SELECT * FROM public.claim_resend_quota_alert('staging', 'daily', '${DAILY}', 80, '${HASH}')`,
        `SELECT public.complete_resend_quota_alert('${key}'::uuid)`,
      ]) {
        await expect(db.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${role}`)
          return tx.query(query)
        })).rejects.toThrow(/permission denied/)
      }
    })
  }

  it('keeps RLS, no browser policies, invoker mode and an empty search path', async () => {
    const functions = await db.query<{ prosecdef: boolean; proconfig: string[]; proacl: string[] }>(
      "SELECT prosecdef, proconfig, proacl FROM pg_proc WHERE proname IN ('claim_resend_quota_alert', 'complete_resend_quota_alert')",
    )
    expect(functions.rows).toHaveLength(2)
    expect(functions.rows.every((row) => !row.prosecdef && row.proconfig[0] === 'search_path=""')).toBe(true)
    expect(functions.rows.every((row) => row.proacl.every((acl) => !acl.startsWith('=') && !acl.startsWith('anon=') && !acl.startsWith('authenticated=')))).toBe(true)
    expect((await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.resend_quota_alert_deliveries'::regclass",
    )).rows[0].relrowsecurity).toBe(true)
    expect((await db.query("SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'resend_quota_alert_deliveries'")).rows).toHaveLength(0)
    const permissions = (await db.query<{ role: string; can_read: boolean; can_insert: boolean; can_update: boolean }>(`
      SELECT role,
        has_table_privilege(role, 'public.resend_quota_alert_deliveries', 'SELECT') AS can_read,
        has_table_privilege(role, 'public.resend_quota_alert_deliveries', 'INSERT') AS can_insert,
        has_table_privilege(role, 'public.resend_quota_alert_deliveries', 'UPDATE') AS can_update
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role
    `)).rows
    expect(permissions).toEqual([
      { role: 'anon', can_read: false, can_insert: false, can_update: false },
      { role: 'authenticated', can_read: false, can_insert: false, can_update: false },
      { role: 'service_role', can_read: true, can_insert: true, can_update: true },
    ])
    const columns = (await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'resend_quota_alert_deliveries' ORDER BY ordinal_position",
    )).rows.map((row) => row.column_name)
    expect(columns).toEqual(['delivery_key', 'scope', 'period', 'window_key', 'level', 'payload_hash', 'created_at', 'sent_at'])
  })
})
