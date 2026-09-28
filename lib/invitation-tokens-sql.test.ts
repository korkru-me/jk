/**
 * Executes the invite-link migrations against a throwaway Postgres, as the
 * roles PostgREST uses.
 *
 * A link's token is the whole secret: whoever holds it joins. The original
 * policies let any signed-in user — and, for org invites, anyone with the
 * public anon key — list every active token, then accept it. The fix drops
 * those policies and routes the invitee through functions that need the exact
 * token. These tests first reproduce the leak on the original migrations, so
 * a later policy that reopens it fails here rather than in production.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'

const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

const CLASSROOM_INVITATIONS = migration('20260713110000_classroom_invitations.sql')
const ORG_INVITATIONS = migration('20260510162108_org_invitations.sql')
const FIX = migration('20260928021309_close_invitation_token_reads.sql')

const OWNER = '10000000-0000-4000-8000-000000000001'
const STUDENT = '10000000-0000-4000-8000-000000000002'
const INVITEE = '10000000-0000-4000-8000-000000000003'
const SECOND_INVITEE = '10000000-0000-4000-8000-000000000004'
const VIEW_CO_TEACHER = '10000000-0000-4000-8000-000000000005'

const CLASSROOM = '20000000-0000-4000-8000-000000000001'
const TRASHED_CLASSROOM = '20000000-0000-4000-8000-000000000002'
const ORG = '30000000-0000-4000-8000-000000000001'

const ADMIN_INVITE = 'a'.repeat(64)
const VIEW_INVITE = 'b'.repeat(64)
const EXPIRED_INVITE = 'c'.repeat(64)
const TRASHED_ROOM_INVITE = 'd'.repeat(64)
const ORG_ADMIN_INVITE = 'e'.repeat(64)
const ORG_TEACHER_INVITE = 'f'.repeat(64)

let db: PGlite

// Only what the invitation migrations reference, shaped like the live
// tables. The helpers are SECURITY DEFINER in production too, so a policy
// that calls them does not recurse into RLS on the tables they read.
const MINIMAL_SCHEMA = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated;

  -- Supabase hands every new table and function in public to both API roles;
  -- only an explicit REVOKE takes that back.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  CREATE TABLE public.users (id uuid PRIMARY KEY);

  CREATE TABLE public.classrooms (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    teacher_id uuid NOT NULL REFERENCES public.users(id),
    deleted_at timestamptz
  );

  CREATE TABLE public.classroom_co_teachers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    permission text NOT NULL DEFAULT 'manage' CHECK (permission IN ('admin', 'manage', 'view')),
    invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    UNIQUE (classroom_id, user_id)
  );
  ALTER TABLE public.classroom_co_teachers ENABLE ROW LEVEL SECURITY;

  CREATE TABLE public.organizations (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    deleted_at timestamptz
  );

  CREATE TABLE public.organization_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    org_role text NOT NULL DEFAULT 'teacher' CHECK (org_role IN ('owner', 'admin', 'teacher', 'student')),
    UNIQUE (org_id, user_id)
  );
  ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

  CREATE FUNCTION public.get_my_teaching_classroom_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(ARRAY(SELECT id FROM public.classrooms WHERE teacher_id = auth.uid()), ARRAY[]::uuid[])
  $$;

  CREATE FUNCTION public.is_classroom_co_teacher(p_classroom_id uuid, p_permissions text[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.classroom_co_teachers
      WHERE classroom_id = p_classroom_id AND user_id = auth.uid() AND permission = ANY(p_permissions)
    )
  $$;

  CREATE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;

  CREATE FUNCTION public.get_user_org_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(ARRAY(SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()), ARRAY[]::uuid[])
  $$;

  CREATE FUNCTION public.get_org_role(p_org_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT org_role FROM public.organization_members WHERE org_id = p_org_id AND user_id = auth.uid()
  $$;
`

const SEED = `
  INSERT INTO public.users (id) VALUES
    ('${OWNER}'), ('${STUDENT}'), ('${INVITEE}'), ('${SECOND_INVITEE}'), ('${VIEW_CO_TEACHER}');

  INSERT INTO public.classrooms (id, name, teacher_id, deleted_at) VALUES
    ('${CLASSROOM}', 'ม.4/1 คณิต', '${OWNER}', NULL),
    ('${TRASHED_CLASSROOM}', 'ห้องในถังขยะ', '${OWNER}', now());

  INSERT INTO public.classroom_co_teachers (classroom_id, user_id, permission, invited_by) VALUES
    ('${CLASSROOM}', '${VIEW_CO_TEACHER}', 'view', '${OWNER}');

  INSERT INTO public.classroom_invitations (classroom_id, token, permission, created_by, expires_at) VALUES
    ('${CLASSROOM}', '${ADMIN_INVITE}', 'admin', '${OWNER}', now() + interval '7 days'),
    ('${CLASSROOM}', '${VIEW_INVITE}', 'view', '${OWNER}', now() + interval '7 days'),
    ('${CLASSROOM}', '${EXPIRED_INVITE}', 'admin', '${OWNER}', now() - interval '1 minute'),
    ('${TRASHED_CLASSROOM}', '${TRASHED_ROOM_INVITE}', 'admin', '${OWNER}', now() + interval '7 days');

  INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'โรงเรียนทดสอบ');
  INSERT INTO public.organization_members (org_id, user_id, org_role) VALUES ('${ORG}', '${OWNER}', 'owner');

  INSERT INTO public.org_invitations (org_id, token, role, created_by) VALUES
    ('${ORG}', '${ORG_ADMIN_INVITE}', 'admin', '${OWNER}'),
    ('${ORG}', '${ORG_TEACHER_INVITE}', 'teacher', '${OWNER}');
`

type Caller = { role: 'anon' } | { role: 'authenticated'; userId: string }

/** Runs `fn` as a PostgREST caller would, then rolls back unless `keep`. */
async function as<T>(caller: Caller, fn: (tx: Transaction) => Promise<T>, keep = false): Promise<T> {
  let result!: T
  await db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
      caller.role === 'authenticated' ? caller.userId : '',
    ])
    await tx.exec(`SET LOCAL ROLE ${caller.role}`)
    result = await fn(tx)
    if (!keep) await tx.rollback()
  })
  return result
}

const signedIn = (userId: string): Caller => ({ role: 'authenticated', userId })
const anon: Caller = { role: 'anon' }

async function visibleTokens(caller: Caller, table: 'classroom_invitations' | 'org_invitations') {
  return as(caller, async tx => {
    const { rows } = await tx.query<{ token: string }>(`SELECT token FROM public.${table} ORDER BY token`)
    return rows.map(row => row.token)
  })
}

/** Rows an unfiltered `UPDATE <table> SET <set>` touches for this caller. */
async function updateEvery(caller: Caller, table: 'classroom_invitations' | 'org_invitations', set: string) {
  return as(caller, async tx => (await tx.query(`UPDATE public.${table} SET ${set}`)).affectedRows ?? 0)
}

const BURN_CLASSROOM_INVITES = `used_at = now(), used_by = auth.uid()`
const UPGRADE_CLASSROOM_INVITES = `permission = 'admin', used_by = auth.uid()`
const BURN_ORG_INVITES = `used_at = now()`
const UPGRADE_ORG_INVITES = `role = 'admin', expires_at = now() + interval '10 years'`

async function superuserRow<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await db.query<T>(sql, params)
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MINIMAL_SCHEMA)
  await db.exec(ORG_INVITATIONS)
  await db.exec(CLASSROOM_INVITATIONS)
  // The one later change to these policies (20260819091000_rls_initplan_performance.sql).
  await db.exec(`
    ALTER POLICY "classroom_invitations_mark_used" ON public.classroom_invitations
      USING (used_at IS NULL AND expires_at > now())
      WITH CHECK (used_by = (SELECT auth.uid()));
  `)
  await db.exec(SEED)
}, 60_000)

afterAll(async () => { await db?.close() })

describe('before the fix', () => {
  it('lets a student who holds no link list every active co-teacher invite', async () => {
    expect(await visibleTokens(signedIn(STUDENT), 'classroom_invitations'))
      .toEqual([ADMIN_INVITE, VIEW_INVITE, TRASHED_ROOM_INVITE])
  })

  it('lets anyone with the anon key list every active org invite, without signing in', async () => {
    expect(await visibleTokens(anon, 'org_invitations')).toEqual([ORG_ADMIN_INVITE, ORG_TEACHER_INVITE])
  })

  it('lets a signed-in stranger burn or upgrade every active co-teacher invite', async () => {
    expect(await updateEvery(signedIn(STUDENT), 'classroom_invitations', BURN_CLASSROOM_INVITES)).toBe(3)
    expect(await updateEvery(signedIn(STUDENT), 'classroom_invitations', UPGRADE_CLASSROOM_INVITES)).toBe(3)
  })

  it('lets anon rewrite every active org invite’s role and expiry', async () => {
    expect(await updateEvery(anon, 'org_invitations', UPGRADE_ORG_INVITES)).toBe(2)
  })

  // org_invitations_mark_used has no WITH CHECK, so Postgres reuses its USING
  // (`used_at IS NULL`) on the new row: setting used_at can never pass, and
  // joinByToken — which ignored that error — never closed an org link.
  it('never lets anyone close an org invite', async () => {
    await expect(updateEvery(signedIn(OWNER), 'org_invitations', BURN_ORG_INVITES))
      .rejects.toThrow(/row-level security/)
  })
})

describe('after the fix', () => {
  beforeAll(async () => {
    await db.exec(FIX)
  })

  describe('direct table access', () => {
    it('shows a signed-in stranger no invites at all', async () => {
      expect(await visibleTokens(signedIn(STUDENT), 'classroom_invitations')).toEqual([])
      expect(await visibleTokens(signedIn(STUDENT), 'org_invitations')).toEqual([])
    })

    it('shows a view-only co-teacher none of the room’s invites', async () => {
      expect(await visibleTokens(signedIn(VIEW_CO_TEACHER), 'classroom_invitations')).toEqual([])
    })

    it('refuses the anon role outright', async () => {
      await expect(visibleTokens(anon, 'org_invitations')).rejects.toThrow(/permission denied/)
      await expect(visibleTokens(anon, 'classroom_invitations')).rejects.toThrow(/permission denied/)
    })

    it('no longer lets a stranger burn or upgrade invites', async () => {
      for (const set of [BURN_CLASSROOM_INVITES, UPGRADE_CLASSROOM_INVITES]) {
        expect(await updateEvery(signedIn(STUDENT), 'classroom_invitations', set)).toBe(0)
        expect(await updateEvery(signedIn(VIEW_CO_TEACHER), 'classroom_invitations', set)).toBe(0)
      }
      for (const set of [BURN_ORG_INVITES, UPGRADE_ORG_INVITES]) {
        expect(await updateEvery(signedIn(STUDENT), 'org_invitations', set)).toBe(0)
      }
      await expect(updateEvery(anon, 'org_invitations', UPGRADE_ORG_INVITES)).rejects.toThrow(/permission denied/)
    })

    it('still shows the people who manage invites their own', async () => {
      expect(await visibleTokens(signedIn(OWNER), 'classroom_invitations'))
        .toEqual([ADMIN_INVITE, VIEW_INVITE, EXPIRED_INVITE, TRASHED_ROOM_INVITE])
      expect(await visibleTokens(signedIn(OWNER), 'org_invitations')).toEqual([ORG_ADMIN_INVITE, ORG_TEACHER_INVITE])
    })
  })

  describe('get_classroom_invitation_preview', () => {
    const preview = (caller: Caller, token: string) =>
      as(caller, async tx => (await tx.query(
        `SELECT * FROM public.get_classroom_invitation_preview($1)`,
        [token],
      )).rows)

    it('describes the invite to whoever holds the exact token', async () => {
      expect(await preview(signedIn(INVITEE), ADMIN_INVITE))
        .toEqual([{ classroom_name: 'ม.4/1 คณิต', permission: 'admin' }])
    })

    it('finds nothing for a wrong, partial, expired or trashed-room token', async () => {
      for (const token of ['0'.repeat(64), ADMIN_INVITE.slice(0, 63), '%', EXPIRED_INVITE, TRASHED_ROOM_INVITE]) {
        expect(await preview(signedIn(INVITEE), token)).toEqual([])
      }
    })

    it('cannot be called by anon', async () => {
      await expect(preview(anon, ADMIN_INVITE)).rejects.toThrow(/permission denied/)
    })
  })

  describe('accept_classroom_invitation', () => {
    const accept = (caller: Caller, token: string, keep = false) =>
      as(caller, async tx => (await tx.query<{ id: string | null }>(
        `SELECT public.accept_classroom_invitation($1) AS id`,
        [token],
      )).rows[0].id, keep)

    it('makes the holder a co-teacher with the invite’s permission and closes the invite', async () => {
      expect(await accept(signedIn(INVITEE), ADMIN_INVITE, true)).toBe(CLASSROOM)

      expect(await superuserRow(
        `SELECT permission, invited_by FROM public.classroom_co_teachers WHERE classroom_id = $1 AND user_id = $2`,
        [CLASSROOM, INVITEE],
      )).toEqual({ permission: 'admin', invited_by: OWNER })
      const invite = await superuserRow<{ used_at: Date | null; used_by: string | null }>(
        `SELECT used_at, used_by FROM public.classroom_invitations WHERE token = $1`,
        [ADMIN_INVITE],
      )
      expect(invite?.used_at).not.toBeNull()
      expect(invite?.used_by).toBe(INVITEE)
    })

    it('lets a link be used once only', async () => {
      expect(await accept(signedIn(SECOND_INVITEE), ADMIN_INVITE)).toBeNull()
    })

    it('neither consumes the link nor changes the permission of someone already teaching the room', async () => {
      expect(await accept(signedIn(VIEW_CO_TEACHER), VIEW_INVITE, true)).toBe(CLASSROOM)
      expect(await accept(signedIn(OWNER), VIEW_INVITE, true)).toBe(CLASSROOM)

      expect(await superuserRow(
        `SELECT used_at FROM public.classroom_invitations WHERE token = $1`,
        [VIEW_INVITE],
      )).toEqual({ used_at: null })
      expect(await superuserRow(
        `SELECT count(*)::int AS n FROM public.classroom_co_teachers WHERE classroom_id = $1 AND user_id = $2`,
        [CLASSROOM, OWNER],
      )).toEqual({ n: 0 })
    })

    it('refuses an expired link, a trashed room’s link and a missing session', async () => {
      expect(await accept(signedIn(SECOND_INVITEE), EXPIRED_INVITE)).toBeNull()
      expect(await accept(signedIn(SECOND_INVITEE), TRASHED_ROOM_INVITE)).toBeNull()
      expect(await accept(signedIn(''), VIEW_INVITE)).toBeNull()
    })

    it('cannot be called by anon', async () => {
      await expect(accept(anon, VIEW_INVITE)).rejects.toThrow(/permission denied/)
    })
  })

  describe('org invitations', () => {
    const preview = (caller: Caller, token: string) =>
      as(caller, async tx => (await tx.query(`SELECT * FROM public.get_org_invitation_preview($1)`, [token])).rows)
    const accept = (caller: Caller, token: string, keep = false) =>
      as(caller, async tx => (await tx.query<{ id: string | null }>(
        `SELECT public.accept_org_invitation($1) AS id`,
        [token],
      )).rows[0].id, keep)

    it('describes the invite only for the exact token', async () => {
      expect(await preview(signedIn(STUDENT), ORG_ADMIN_INVITE)).toEqual([{ org_name: 'โรงเรียนทดสอบ', role: 'admin' }])
      expect(await preview(signedIn(STUDENT), ORG_ADMIN_INVITE.slice(0, 63))).toEqual([])
      await expect(preview(anon, ORG_ADMIN_INVITE)).rejects.toThrow(/permission denied/)
    })

    it('adds the holder with the invite’s role, once', async () => {
      expect(await accept(signedIn(INVITEE), ORG_TEACHER_INVITE, true)).toBe(ORG)
      expect(await superuserRow(
        `SELECT org_role FROM public.organization_members WHERE org_id = $1 AND user_id = $2`,
        [ORG, INVITEE],
      )).toEqual({ org_role: 'teacher' })
      expect(await accept(signedIn(SECOND_INVITEE), ORG_TEACHER_INVITE)).toBeNull()
    })

    it('leaves the link and the role alone for an existing member', async () => {
      expect(await accept(signedIn(OWNER), ORG_ADMIN_INVITE, true)).toBe(ORG)
      expect(await superuserRow(
        `SELECT used_at FROM public.org_invitations WHERE token = $1`,
        [ORG_ADMIN_INVITE],
      )).toEqual({ used_at: null })
      expect(await superuserRow(
        `SELECT org_role FROM public.organization_members WHERE org_id = $1 AND user_id = $2`,
        [ORG, OWNER],
      )).toEqual({ org_role: 'owner' })
    })

    it('cannot be called by anon', async () => {
      await expect(accept(anon, ORG_ADMIN_INVITE)).rejects.toThrow(/permission denied/)
    })
  })

  it('pins every new function to SECURITY DEFINER with an empty search_path', async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(`
      SELECT proname, prosecdef, proconfig FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname LIKE '%invitation%'
      ORDER BY proname
    `)
    expect(rows).toEqual([
      { proname: 'accept_classroom_invitation', prosecdef: true, proconfig: ['search_path=""'] },
      { proname: 'accept_org_invitation', prosecdef: true, proconfig: ['search_path=""'] },
      { proname: 'get_classroom_invitation_preview', prosecdef: true, proconfig: ['search_path=""'] },
      { proname: 'get_org_invitation_preview', prosecdef: true, proconfig: ['search_path=""'] },
    ])
  })

  it('is safe to run again', async () => {
    await expect(db.exec(FIX)).resolves.toBeDefined()
    expect(await visibleTokens(signedIn(STUDENT), 'classroom_invitations')).toEqual([])
  })
})
