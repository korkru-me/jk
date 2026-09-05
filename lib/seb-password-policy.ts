import 'server-only'

import type { Assignment, User } from '@/lib/types'

// Phase 3 foundation only: no route, database adapter, SEB session or release.
export const SEB_PASSWORD_MIN_LENGTH = 12
export const SEB_PASSWORD_MAX_LENGTH = 64
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_REVISION = 2_147_483_647

export type SebPasswordErrorCode =
  | 'SEB_PASSWORD_INVALID'
  | 'SEB_PASSWORD_CONTEXT_INVALID'
  | 'SEB_PASSWORD_ACCESS_DENIED'
  | 'SEB_PASSWORD_REVISION_CONFLICT'
  | 'SEB_PASSWORD_KEYRING_INVALID'
  | 'SEB_PASSWORD_SECRET_UNAVAILABLE'

export class SebPasswordError extends Error {
  constructor(readonly code: SebPasswordErrorCode) {
    super(code)
    this.name = 'SebPasswordError'
  }
}

export interface SebPasswordBinding {
  readonly orgId: string
  readonly teacherId: string
  readonly assignmentId: string
  readonly revisionId: string
  readonly revision: number
}

/** This context MUST be freshly resolved from auth/session + RLS-protected
 * records by a future server adapter. Never accept this object from a client.
 * This pure policy check does not authenticate anyone or query membership. */
export interface SebPasswordOwnerContext {
  readonly actor: Pick<User, 'id' | 'role' | 'status'>
  readonly assignment: Pick<Assignment,
    'id' | 'org_id' | 'created_by' | 'mode' | 'type' | 'secure_browser_mode'>
  readonly memberOrgIds: readonly string[]
}

export function assertSebDraftPassword(value: unknown): asserts value is string {
  // Conservative compatibility subset pending native Mac/iPad/Windows tests.
  // Never trim, normalize, silently truncate or fall back to a shared password.
  if (typeof value !== 'string' || value.length < SEB_PASSWORD_MIN_LENGTH ||
      value.length > SEB_PASSWORD_MAX_LENGTH || !/^[\x21-\x7e]+$/.test(value)) {
    throw new SebPasswordError('SEB_PASSWORD_INVALID')
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseSebPasswordBinding(value: unknown): SebPasswordBinding {
  if (!record(value) ||
      !['orgId', 'teacherId', 'assignmentId', 'revisionId'].every(
        name => typeof value[name] === 'string' && UUID.test(value[name]),
      ) || !Number.isSafeInteger(value.revision) ||
      (value.revision as number) < 1 || (value.revision as number) > MAX_REVISION) {
    throw new SebPasswordError('SEB_PASSWORD_CONTEXT_INVALID')
  }
  return Object.freeze({
    orgId: value.orgId as string, teacherId: value.teacherId as string,
    assignmentId: value.assignmentId as string, revisionId: value.revisionId as string,
    revision: value.revision as number,
  })
}

export function assertSebPasswordOwner(context: SebPasswordOwnerContext): void {
  const { actor, assignment, memberOrgIds } = context
  if (!actor || !assignment || !Array.isArray(memberOrgIds) || memberOrgIds.length > 100 ||
      ![actor.id, assignment.id, assignment.org_id, assignment.created_by].every(
        value => typeof value === 'string' && UUID.test(value),
      ) || !memberOrgIds.every(id => typeof id === 'string' && UUID.test(id))) {
    throw new SebPasswordError('SEB_PASSWORD_CONTEXT_INVALID')
  }
  // No global admin/co-teacher bypass for another teacher's quit password.
  if (actor.status !== 'active' || !['teacher', 'admin'].includes(actor.role) ||
      actor.id !== assignment.created_by || !memberOrgIds.includes(assignment.org_id) ||
      assignment.type !== 'exam' || assignment.mode !== 'online' ||
      assignment.secure_browser_mode !== 'seb_required') {
    throw new SebPasswordError('SEB_PASSWORD_ACCESS_DENIED')
  }
}

/** Planning only. A future repository MUST atomically compare this version
 * again when persisting; two parallel calls here are not a database lock. */
export function nextSebPasswordRevision(current: number, expected: number): number {
  if (!Number.isSafeInteger(current) || current < 0 || current >= MAX_REVISION ||
      current !== expected) throw new SebPasswordError('SEB_PASSWORD_REVISION_CONFLICT')
  return current + 1
}
