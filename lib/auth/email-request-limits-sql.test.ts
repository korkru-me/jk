import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = readFileSync(new URL('../../supabase/migrations/20261017111034_auth_email_request_limits.sql', import.meta.url), 'utf8')
const EMAIL = 'a'.repeat(64)
const IP = 'b'.repeat(64)
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
beforeEach(async () => { await db.exec('TRUNCATE public.auth_email_request_limits') })

async function reserve(email = EMAIL, ip: string | null = IP) {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE service_role')
    return (await tx.query<{ allowed: boolean; retry_after_seconds: number }>(
      'SELECT * FROM public.reserve_auth_email_request($1, $2)', [email, ip],
    )).rows[0]
  })
}

describe('database auth-email reservations', () => {
  it('permits a first send and enforces rolling cooldown across requests', async () => {
    expect(await reserve()).toEqual({ allowed: true, retry_after_seconds: 0 })
    const repeated = await reserve()
    expect(repeated.allowed).toBe(false)
    expect(repeated.retry_after_seconds).toBeGreaterThan(55)
    const { rows } = await db.query<{ requests: number }>('SELECT requests FROM public.auth_email_request_limits')
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.requests === 1)).toBe(true)
  })

  it('allows another send after cooldown without resetting hourly/daily caps', async () => {
    await reserve()
    await db.query("UPDATE public.auth_email_request_limits SET window_started_at = now() - interval '61 seconds' WHERE bucket_key LIKE '%:c'")
    expect((await reserve()).allowed).toBe(true)
    const { rows } = await db.query<{ requests: number }>("SELECT requests FROM public.auth_email_request_limits WHERE bucket_key = $1", [`email:${EMAIL}:h`])
    expect(rows[0].requests).toBe(2)
  })

  it('blocks a sixth hourly send, even after the one-minute cooldown', async () => {
    await reserve()
    await db.exec("UPDATE public.auth_email_request_limits SET requests = 5, window_started_at = now() - interval '61 seconds'")
    const result = await reserve()
    expect(result.allowed).toBe(false)
    expect(result.retry_after_seconds).toBeGreaterThan(3500)
  })

  it('keeps the daily cap when the hourly window has expired', async () => {
    await reserve()
    await db.exec("UPDATE public.auth_email_request_limits SET requests = 10, window_started_at = now() - interval '2 hours'")
    const result = await reserve()
    expect(result.allowed).toBe(false)
    expect(result.retry_after_seconds).toBeGreaterThan(79000)
  })

  it('shares the IP cap across distinct email addresses', async () => {
    await reserve()
    await db.query('UPDATE public.auth_email_request_limits SET requests = 119 WHERE bucket_key = $1', [`ip:${IP}:h`])
    expect((await reserve('c'.repeat(64))).allowed).toBe(true)
    expect((await reserve('d'.repeat(64))).allowed).toBe(false)
    expect((await db.query('SELECT * FROM public.auth_email_request_limits')).rows).toHaveLength(7)
  })

  it('allows local recipient-only fixtures without accepting malformed keys', async () => {
    expect((await reserve(EMAIL, null)).allowed).toBe(true)
    expect((await db.query('SELECT * FROM public.auth_email_request_limits')).rows).toHaveLength(3)
    await expect(reserve('someone@example.com')).rejects.toThrow('Invalid request key')
    await expect(reserve(EMAIL, '127.0.0.1')).rejects.toThrow('Invalid request key')
  })

  for (const role of ['anon', 'authenticated']) {
    it(`denies ${role} direct table and RPC access despite default grants`, async () => {
      for (const query of [
        'SELECT * FROM public.auth_email_request_limits',
        `SELECT * FROM public.reserve_auth_email_request('${EMAIL}', null)`,
        'SELECT public.purge_auth_email_request_limits()',
      ]) {
        await expect(db.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${role}`)
          return tx.query(query)
        })).rejects.toThrow(/permission denied/)
      }
    })
  }

  it('uses invoker functions with a fixed search path and RLS', async () => {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] }>("SELECT prosecdef, proconfig FROM pg_proc WHERE proname IN ('reserve_auth_email_request', 'purge_auth_email_request_limits')")
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => !row.prosecdef && row.proconfig[0] === 'search_path=""')).toBe(true)
    const tables = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.auth_email_request_limits'::regclass")
    expect(tables.rows[0].relrowsecurity).toBe(true)
  })

  it('cleans only expired anonymous counters', async () => {
    await reserve()
    await db.query('UPDATE public.auth_email_request_limits SET expires_at = now() - interval \'1 second\' WHERE bucket_key = $1', [`email:${EMAIL}:c`])
    const result = await db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE service_role')
      return tx.query<{ count: number }>('SELECT public.purge_auth_email_request_limits()::int AS count')
    })
    expect(result.rows[0].count).toBe(1)
    expect((await db.query('SELECT * FROM public.auth_email_request_limits')).rows).toHaveLength(3)
  })
})
