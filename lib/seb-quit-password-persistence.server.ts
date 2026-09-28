import 'server-only'

import {
  SEB_QUIT_PASSWORD_MAX_REVISION,
  SebQuitPasswordError,
  type PreparedSebQuitPasswordRevision,
  type SebQuitPasswordErrorCode,
} from '@/lib/seb-quit-password-core.server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_BASE16_PATTERN = /^[0-9a-f]{64}$/
const PERSISTENCE_FAILURE = 'SEB_QUIT_PASSWORD_PERSISTENCE_FAILED'

type PlainRecord = Record<string, unknown>

export type PersistedSebQuitPasswordRevision = Readonly<{
  assignmentId: string
  orgId: string
  ownerId: string
  revision: number
  createdAt: string
}>

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: PlainRecord, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some(key => typeof key !== 'string')) return false
  const actual = (ownKeys as string[]).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function parsePreparedRevision(input: unknown): PreparedSebQuitPasswordRevision {
  if (!isPlainRecord(input) || !hasExactKeys(input, [
    'orgId',
    'ownerId',
    'assignmentId',
    'revision',
    'hashedQuitPassword',
  ])) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_CONTEXT')
  }

  if (
    !isUuid(input.orgId)
    || !isUuid(input.ownerId)
    || !isUuid(input.assignmentId)
    || !Number.isInteger(input.revision)
    || (input.revision as number) < 1
    || (input.revision as number) > SEB_QUIT_PASSWORD_MAX_REVISION
    || typeof input.hashedQuitPassword !== 'string'
    || !SHA256_BASE16_PATTERN.test(input.hashedQuitPassword)
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_CONTEXT')
  }

  return Object.freeze({
    orgId: input.orgId,
    ownerId: input.ownerId,
    assignmentId: input.assignmentId,
    revision: input.revision as number,
    hashedQuitPassword: input.hashedQuitPassword,
  })
}

function persistenceError(code: unknown): Error {
  const mapping: Readonly<Record<string, SebQuitPasswordErrorCode>> = {
    '22023': 'SEB_QUIT_PASSWORD_INVALID_CONTEXT',
    '42501': 'SEB_QUIT_PASSWORD_ACCESS_DENIED',
    '55000': 'SEB_QUIT_PASSWORD_NOT_ELIGIBLE',
    '55006': 'SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT',
    '40001': 'SEB_QUIT_PASSWORD_REVISION_CONFLICT',
    '23505': 'SEB_QUIT_PASSWORD_REVISION_CONFLICT',
    '22003': 'SEB_QUIT_PASSWORD_REVISION_EXHAUSTED',
  }
  return typeof code === 'string' && mapping[code]
    ? new SebQuitPasswordError(mapping[code])
    : new Error(PERSISTENCE_FAILURE)
}

function parsePersistedRevision(
  rawData: unknown,
  prepared: PreparedSebQuitPasswordRevision,
): PersistedSebQuitPasswordRevision {
  if (!Array.isArray(rawData) || rawData.length !== 1 || !isPlainRecord(rawData[0])) {
    throw new Error(PERSISTENCE_FAILURE)
  }

  const row = rawData[0]
  if (!hasExactKeys(row, ['assignment_id', 'org_id', 'owner_id', 'revision', 'created_at'])) {
    throw new Error(PERSISTENCE_FAILURE)
  }
  if (
    row.assignment_id !== prepared.assignmentId
    || row.org_id !== prepared.orgId
    || row.owner_id !== prepared.ownerId
    || row.revision !== prepared.revision
    || typeof row.created_at !== 'string'
    || !Number.isFinite(Date.parse(row.created_at))
  ) {
    throw new Error(PERSISTENCE_FAILURE)
  }

  return Object.freeze({
    assignmentId: row.assignment_id,
    orgId: row.org_id,
    ownerId: row.owner_id,
    revision: row.revision,
    createdAt: row.created_at,
  })
}

/**
 * Persists an already-authorized, already-hashed revision through the sole
 * service-role RPC. Plaintext and confirmation are intentionally absent from
 * this boundary, and the returned value contains no secret-derived material.
 */
export async function persistSebQuitPasswordRevision(
  input: unknown,
): Promise<PersistedSebQuitPasswordRevision> {
  const prepared = parsePreparedRevision(input)
  const admin = createAdminClient()

  let response: Awaited<ReturnType<typeof admin.rpc>>
  try {
    response = await admin.rpc('create_assignment_seb_quit_password_revision', {
      p_assignment_id: prepared.assignmentId,
      p_actor_id: prepared.ownerId,
      p_expected_revision: prepared.revision - 1,
      p_hashed_quit_password: prepared.hashedQuitPassword,
    })
  } catch {
    throw new Error(PERSISTENCE_FAILURE)
  }

  if (response.error) throw persistenceError(response.error.code)
  return parsePersistedRevision(response.data, prepared)
}
