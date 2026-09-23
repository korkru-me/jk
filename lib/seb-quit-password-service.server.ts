import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  SebQuitPasswordError,
  prepareSebQuitPasswordRevision,
  type SebQuitPasswordCommand,
  type SebQuitPasswordOwnerContext,
} from '@/lib/seb-quit-password-core.server'
import {
  persistSebQuitPasswordRevision,
  type PersistedSebQuitPasswordRevision,
} from '@/lib/seb-quit-password-persistence.server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SebQuitPasswordBlockReason =
  | 'owner_only'
  | 'inactive_owner'
  | 'not_eligible'
  | 'closed'
  | 'active_attempt'

export type SebQuitPasswordSetupState = Readonly<{
  currentRevision: number | null
  configuredAt: string | null
  canManage: boolean
  blockedReason: SebQuitPasswordBlockReason | null
}>

type AssignmentRow = Readonly<{
  id: string
  org_id: string
  created_by: string
  mode: 'online'
  type: 'exercise' | 'exam'
  status: 'draft' | 'published' | 'closed'
  secure_browser_mode: 'browser' | 'seb_required'
}>

function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_COMMAND')
  }
}

async function loadOwnerContext(
  assignmentId: string,
  actorId: string,
): Promise<{ context: SebQuitPasswordOwnerContext; configuredAt: string | null }> {
  assertUuid(assignmentId)
  assertUuid(actorId)

  const admin = createAdminClient()
  const { data: assignmentData, error: assignmentError } = await admin
    .from('assignments')
    .select('id, org_id, created_by, mode, type, status, secure_browser_mode')
    .eq('id', assignmentId)
    .maybeSingle()

  // Do not reveal whether an assignment exists to a caller who cannot read
  // the exact owner context. The persistence RPC repeats this check from DB
  // truth inside the same transaction that appends the revision.
  if (assignmentError || !assignmentData) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_ACCESS_DENIED')
  }
  const assignment = assignmentData as AssignmentRow

  const [actorResult, membershipResult, revisionResult, activeAttemptResult] = await Promise.all([
    admin
      .from('users')
      .select('id, role, status')
      .eq('id', actorId)
      .maybeSingle(),
    admin
      .from('organization_members')
      .select('org_id')
      .eq('org_id', assignment.org_id)
      .eq('user_id', actorId)
      .maybeSingle(),
    admin
      .from('assignment_seb_config_revisions')
      .select('revision, created_at')
      .eq('assignment_id', assignmentId)
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('status', 'in_progress')
      .limit(1)
      .maybeSingle(),
  ])

  if (
    actorResult.error
    || membershipResult.error
    || revisionResult.error
    || activeAttemptResult.error
    || !actorResult.data
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_CONTEXT')
  }

  const revision = revisionResult.data?.revision ?? 0
  const actor = actorResult.data
  return {
    context: {
      actor: {
        id: actor.id,
        role: actor.role,
        status: actor.status,
      },
      memberOrgIds: membershipResult.data ? [membershipResult.data.org_id] : [],
      assignment: {
        id: assignment.id,
        orgId: assignment.org_id,
        createdBy: assignment.created_by,
        mode: assignment.mode,
        type: assignment.type,
        status: assignment.status,
        secureBrowserMode: assignment.secure_browser_mode,
      },
      currentRevision: revision,
      hasActiveAttempt: !!activeAttemptResult.data,
    },
    configuredAt: revisionResult.data?.created_at ?? null,
  }
}

/**
 * Returns display-safe metadata only. A non-owner never learns whether a
 * password revision exists, while the owner sees only its number and time.
 */
export async function readSebQuitPasswordSetupState(
  assignmentId: string,
  actorId: string,
): Promise<SebQuitPasswordSetupState> {
  let loaded: Awaited<ReturnType<typeof loadOwnerContext>>
  try {
    loaded = await loadOwnerContext(assignmentId, actorId)
  } catch {
    return Object.freeze({
      currentRevision: null,
      configuredAt: null,
      canManage: false,
      blockedReason: 'owner_only',
    })
  }

  const { context, configuredAt } = loaded
  if (context.assignment.createdBy !== context.actor.id || !context.memberOrgIds.includes(context.assignment.orgId)) {
    return Object.freeze({ currentRevision: null, configuredAt: null, canManage: false, blockedReason: 'owner_only' })
  }
  if (context.actor.role !== 'teacher' || context.actor.status !== 'active') {
    return Object.freeze({ currentRevision: context.currentRevision, configuredAt, canManage: false, blockedReason: 'inactive_owner' })
  }
  if (
    context.assignment.mode !== 'online'
    || context.assignment.type !== 'exam'
    || context.assignment.secureBrowserMode !== 'seb_required'
  ) {
    return Object.freeze({ currentRevision: context.currentRevision, configuredAt, canManage: false, blockedReason: 'not_eligible' })
  }
  if (context.assignment.status === 'closed') {
    return Object.freeze({ currentRevision: context.currentRevision, configuredAt, canManage: false, blockedReason: 'closed' })
  }
  if (context.hasActiveAttempt) {
    return Object.freeze({ currentRevision: context.currentRevision, configuredAt, canManage: false, blockedReason: 'active_attempt' })
  }

  return Object.freeze({
    currentRevision: context.currentRevision,
    configuredAt,
    canManage: true,
    blockedReason: null,
  })
}

/** Internal publication gate. Fail closed on malformed ids or database errors. */
export async function hasSebQuitPasswordRevision(assignmentId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(assignmentId)) return false
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('assignment_seb_config_revisions')
    .select('revision')
    .eq('assignment_id', assignmentId)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle()
  return !error && !!data
}

/**
 * Loads current DB truth, authorizes and hashes in the server-only core, then
 * crosses the persistence boundary with the hash only. Plaintext never
 * leaves this call and is never included in its return value.
 */
export async function createSebQuitPasswordRevisionForOwner(
  command: SebQuitPasswordCommand,
  actorId: string,
): Promise<PersistedSebQuitPasswordRevision> {
  const { context } = await loadOwnerContext(command.assignmentId, actorId)
  const prepared = prepareSebQuitPasswordRevision(command, context)
  return persistSebQuitPasswordRevision(prepared)
}
