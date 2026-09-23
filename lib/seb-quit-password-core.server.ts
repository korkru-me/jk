import 'server-only'

import { createHash } from 'node:crypto'

export const SEB_QUIT_PASSWORD_MIN_LENGTH = 20
export const SEB_QUIT_PASSWORD_MAX_LENGTH = 64
export const SEB_QUIT_PASSWORD_MAX_REVISION = 2_147_483_646

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRINTABLE_ASCII_PATTERN = /^[\x21-\x7e]+$/
const UPPERCASE_PATTERN = /[A-Z]/
const LOWERCASE_PATTERN = /[a-z]/
const DIGIT_PATTERN = /[0-9]/
const SYMBOL_PATTERN = /[^A-Za-z0-9]/

export type SebQuitPasswordErrorCode =
  | 'SEB_QUIT_PASSWORD_INVALID_COMMAND'
  | 'SEB_QUIT_PASSWORD_INVALID_CONTEXT'
  | 'SEB_QUIT_PASSWORD_ACCESS_DENIED'
  | 'SEB_QUIT_PASSWORD_NOT_ELIGIBLE'
  | 'SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT'
  | 'SEB_QUIT_PASSWORD_REVISION_CONFLICT'
  | 'SEB_QUIT_PASSWORD_REVISION_EXHAUSTED'
  | 'SEB_QUIT_PASSWORD_INVALID'
  | 'SEB_QUIT_PASSWORD_CONFIRMATION_MISMATCH'

export class SebQuitPasswordError extends Error {
  readonly code: SebQuitPasswordErrorCode

  constructor(code: SebQuitPasswordErrorCode) {
    // The error message is deliberately a fixed code. Never interpolate an
    // input value here: Server Actions and platform logs may record errors.
    super(code)
    this.name = 'SebQuitPasswordError'
    this.code = code
  }
}

export type SebQuitPasswordCommand = Readonly<{
  assignmentId: string
  expectedRevision: number
  password: string
  confirmation: string
}>

export type SebQuitPasswordOwnerContext = Readonly<{
  actor: Readonly<{
    id: string
    role: 'teacher' | 'student' | 'admin'
    status: 'active' | 'suspended'
  }>
  memberOrgIds: readonly string[]
  assignment: Readonly<{
    id: string
    orgId: string
    createdBy: string
    mode: 'online'
    type: 'exercise' | 'exam'
    status: 'draft' | 'published' | 'closed'
    secureBrowserMode: 'browser' | 'seb_required'
  }>
  currentRevision: number
  hasActiveAttempt: boolean
}>

/**
 * The only secret-derived value allowed to cross the Phase 1 boundary.
 * `hashedQuitPassword` is the lower-case Base16 SHA-256 representation used by
 * the standardized SEB configuration. The original password and confirmation are not
 * copied into this object and must never be persisted or returned to a client.
 */
export type PreparedSebQuitPasswordRevision = Readonly<{
  orgId: string
  ownerId: string
  assignmentId: string
  revision: number
  hashedQuitPassword: string
}>

type PlainRecord = Record<string, unknown>

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

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= SEB_QUIT_PASSWORD_MAX_REVISION
}

export function parseSebQuitPasswordCommand(input: unknown): SebQuitPasswordCommand {
  if (!isPlainRecord(input) || !hasExactKeys(input, ['assignmentId', 'expectedRevision', 'password', 'confirmation'])) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_COMMAND')
  }
  if (
    !isUuid(input.assignmentId)
    || !isRevision(input.expectedRevision)
    || typeof input.password !== 'string'
    || typeof input.confirmation !== 'string'
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_COMMAND')
  }

  return Object.freeze({
    assignmentId: input.assignmentId,
    expectedRevision: input.expectedRevision,
    password: input.password,
    confirmation: input.confirmation,
  })
}

export function parseSebQuitPasswordOwnerContext(input: unknown): SebQuitPasswordOwnerContext {
  if (
    !isPlainRecord(input)
    || !hasExactKeys(input, ['actor', 'memberOrgIds', 'assignment', 'currentRevision', 'hasActiveAttempt'])
    || !isPlainRecord(input.actor)
    || !hasExactKeys(input.actor, ['id', 'role', 'status'])
    || !isPlainRecord(input.assignment)
    || !hasExactKeys(input.assignment, ['id', 'orgId', 'createdBy', 'mode', 'type', 'status', 'secureBrowserMode'])
    || !Array.isArray(input.memberOrgIds)
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_CONTEXT')
  }

  const actor = input.actor
  const assignment = input.assignment
  const memberOrgIds = input.memberOrgIds
  if (
    !isUuid(actor.id)
    || !['teacher', 'student', 'admin'].includes(actor.role as string)
    || !['active', 'suspended'].includes(actor.status as string)
    || memberOrgIds.some(orgId => !isUuid(orgId))
    || !isUuid(assignment.id)
    || !isUuid(assignment.orgId)
    || !isUuid(assignment.createdBy)
    || assignment.mode !== 'online'
    || !['exercise', 'exam'].includes(assignment.type as string)
    || !['draft', 'published', 'closed'].includes(assignment.status as string)
    || !['browser', 'seb_required'].includes(assignment.secureBrowserMode as string)
    || !isRevision(input.currentRevision)
    || typeof input.hasActiveAttempt !== 'boolean'
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID_CONTEXT')
  }

  return Object.freeze({
    actor: Object.freeze({
      id: actor.id,
      role: actor.role as SebQuitPasswordOwnerContext['actor']['role'],
      status: actor.status as SebQuitPasswordOwnerContext['actor']['status'],
    }),
    memberOrgIds: Object.freeze([...memberOrgIds]) as readonly string[],
    assignment: Object.freeze({
      id: assignment.id,
      orgId: assignment.orgId,
      createdBy: assignment.createdBy,
      mode: 'online' as const,
      type: assignment.type as SebQuitPasswordOwnerContext['assignment']['type'],
      status: assignment.status as SebQuitPasswordOwnerContext['assignment']['status'],
      secureBrowserMode: assignment.secureBrowserMode as SebQuitPasswordOwnerContext['assignment']['secureBrowserMode'],
    }),
    currentRevision: input.currentRevision,
    hasActiveAttempt: input.hasActiveAttempt,
  })
}

export function assertStrongSebQuitPassword(password: string, confirmation: string): void {
  if (typeof password !== 'string' || typeof confirmation !== 'string') {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID')
  }
  if (password !== confirmation) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_CONFIRMATION_MISMATCH')
  }
  if (
    password.length < SEB_QUIT_PASSWORD_MIN_LENGTH
    || password.length > SEB_QUIT_PASSWORD_MAX_LENGTH
    || !PRINTABLE_ASCII_PATTERN.test(password)
    || !UPPERCASE_PATTERN.test(password)
    || !LOWERCASE_PATTERN.test(password)
    || !DIGIT_PATTERN.test(password)
    || !SYMBOL_PATTERN.test(password)
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID')
  }
}

function assertOwnerMayRotate(
  command: SebQuitPasswordCommand,
  context: SebQuitPasswordOwnerContext,
): void {
  if (
    context.actor.role !== 'teacher'
    || context.actor.status !== 'active'
    || context.assignment.createdBy !== context.actor.id
    || !context.memberOrgIds.includes(context.assignment.orgId)
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_ACCESS_DENIED')
  }
  if (
    context.assignment.id !== command.assignmentId
    || context.assignment.type !== 'exam'
    || context.assignment.secureBrowserMode !== 'seb_required'
    || context.assignment.status === 'closed'
  ) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_NOT_ELIGIBLE')
  }
  if (context.hasActiveAttempt) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT')
  }
  if (context.currentRevision !== command.expectedRevision) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_REVISION_CONFLICT')
  }
  if (context.currentRevision >= SEB_QUIT_PASSWORD_MAX_REVISION) {
    throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_REVISION_EXHAUSTED')
  }
}

export function prepareSebQuitPasswordRevision(
  rawCommand: unknown,
  rawContext: unknown,
): PreparedSebQuitPasswordRevision {
  const command = parseSebQuitPasswordCommand(rawCommand)
  const context = parseSebQuitPasswordOwnerContext(rawContext)

  // Authorization, assignment eligibility, active-attempt protection and CAS
  // happen before validating or hashing the secret. Unauthorized requests must
  // not reach secret-derived work or persistence in later phases.
  assertOwnerMayRotate(command, context)
  assertStrongSebQuitPassword(command.password, command.confirmation)

  const hashedQuitPassword = createHash('sha256')
    .update(command.password, 'utf8')
    .digest('hex')

  return Object.freeze({
    orgId: context.assignment.orgId,
    ownerId: context.actor.id,
    assignmentId: context.assignment.id,
    revision: context.currentRevision + 1,
    hashedQuitPassword,
  })
}

export type SafeSebQuitPasswordError = Readonly<{
  code: SebQuitPasswordErrorCode | 'SEB_QUIT_PASSWORD_UNKNOWN'
  message: string
  reloadRequired: boolean
}>

const SAFE_ERROR_MESSAGES: Record<SebQuitPasswordErrorCode, string> = {
  SEB_QUIT_PASSWORD_INVALID_COMMAND: 'ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณากรอกใหม่',
  SEB_QUIT_PASSWORD_INVALID_CONTEXT: 'ตรวจสอบบริบทของข้อสอบไม่สำเร็จ กรุณาโหลดหน้าใหม่',
  SEB_QUIT_PASSWORD_ACCESS_DENIED: 'เฉพาะครูเจ้าของข้อสอบเท่านั้นที่ตั้งรหัสออกได้',
  SEB_QUIT_PASSWORD_NOT_ELIGIBLE: 'ตั้งรหัสออกได้เฉพาะข้อสอบที่บังคับใช้ Safe Exam Browser',
  SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT: 'เปลี่ยนรหัสไม่ได้ขณะที่มีนักเรียนกำลังทำข้อสอบ',
  SEB_QUIT_PASSWORD_REVISION_CONFLICT: 'การตั้งค่าถูกเปลี่ยนจากอีกหน้าหนึ่ง กรุณาโหลดข้อมูลล่าสุด',
  SEB_QUIT_PASSWORD_REVISION_EXHAUSTED: 'สร้าง revision เพิ่มไม่ได้ กรุณาติดต่อผู้ดูแลระบบ',
  SEB_QUIT_PASSWORD_INVALID: 'รหัสต้องยาว 20–64 ตัว และมีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และสัญลักษณ์',
  SEB_QUIT_PASSWORD_CONFIRMATION_MISMATCH: 'รหัสออกและช่องยืนยันไม่ตรงกัน',
}

export function toSafeSebQuitPasswordError(error: unknown): SafeSebQuitPasswordError {
  if (error instanceof SebQuitPasswordError) {
    return Object.freeze({
      code: error.code,
      message: SAFE_ERROR_MESSAGES[error.code],
      reloadRequired: [
        'SEB_QUIT_PASSWORD_INVALID_CONTEXT',
        'SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT',
        'SEB_QUIT_PASSWORD_REVISION_CONFLICT',
        'SEB_QUIT_PASSWORD_REVISION_EXHAUSTED',
      ].includes(error.code),
    })
  }
  return Object.freeze({
    code: 'SEB_QUIT_PASSWORD_UNKNOWN',
    message: 'บันทึกรหัสออกไม่สำเร็จ กรุณาโหลดหน้าแล้วลองอีกครั้ง',
    reloadRequired: true,
  })
}
