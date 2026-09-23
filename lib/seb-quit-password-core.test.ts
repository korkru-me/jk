import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  SEB_QUIT_PASSWORD_MAX_LENGTH,
  SEB_QUIT_PASSWORD_MAX_REVISION,
  SEB_QUIT_PASSWORD_MIN_LENGTH,
  SebQuitPasswordError,
  assertStrongSebQuitPassword,
  parseSebQuitPasswordCommand,
  parseSebQuitPasswordOwnerContext,
  prepareSebQuitPasswordRevision,
  toSafeSebQuitPasswordError,
} from '@/lib/seb-quit-password-core.server'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_ID = '44444444-4444-4444-8444-444444444444'
const PASSWORD = 'KorKru-Quit-2026!Aa9'

function command(overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: ASSIGNMENT_ID,
    expectedRevision: 0,
    password: PASSWORD,
    confirmation: PASSWORD,
    ...overrides,
  }
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    actor: { id: ACTOR_ID, role: 'teacher', status: 'active' },
    memberOrgIds: [ORG_ID],
    assignment: {
      id: ASSIGNMENT_ID,
      orgId: ORG_ID,
      createdBy: ACTOR_ID,
      mode: 'online',
      type: 'exam',
      status: 'draft',
      secureBrowserMode: 'seb_required',
    },
    currentRevision: 0,
    hasActiveAttempt: false,
    ...overrides,
  }
}

function expectCode(run: () => unknown, code: string) {
  try {
    run()
    throw new Error('Expected the operation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(SebQuitPasswordError)
    expect((error as SebQuitPasswordError).code).toBe(code)
  }
}

describe('SEB teacher-owned quit password policy', () => {
  it('prepares an immutable exact-revision record with the standardized lower-case Base16 SHA-256 hash', () => {
    const prepared = prepareSebQuitPasswordRevision(command(), context())

    expect(prepared).toEqual({
      orgId: ORG_ID,
      ownerId: ACTOR_ID,
      assignmentId: ASSIGNMENT_ID,
      revision: 1,
      hashedQuitPassword: 'f2fab67b45f6bc46230a24eb08c58fae8a7cb632293ec6798e461cd2a67b4028',
    })
    expect(Object.isFrozen(prepared)).toBe(true)
    expect(JSON.stringify(prepared)).not.toContain(PASSWORD)
    expect(prepared).not.toHaveProperty('password')
    expect(prepared).not.toHaveProperty('confirmation')
  })

  it('copies and freezes binding values instead of retaining mutable caller objects', () => {
    const mutableContext = context()
    const parsed = parseSebQuitPasswordOwnerContext(mutableContext)
    mutableContext.actor.id = OTHER_ID
    mutableContext.memberOrgIds[0] = OTHER_ID
    mutableContext.assignment.id = OTHER_ID

    expect(parsed.actor.id).toBe(ACTOR_ID)
    expect(parsed.memberOrgIds).toEqual([ORG_ID])
    expect(parsed.assignment.id).toBe(ASSIGNMENT_ID)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.actor)).toBe(true)
    expect(Object.isFrozen(parsed.assignment)).toBe(true)
    expect(Object.isFrozen(parsed.memberOrgIds)).toBe(true)
  })

  it('accepts the exact minimum and maximum printable-ASCII boundaries', () => {
    const minimum = `Aa1!${'x'.repeat(SEB_QUIT_PASSWORD_MIN_LENGTH - 4)}`
    const maximum = `Aa1!${'x'.repeat(SEB_QUIT_PASSWORD_MAX_LENGTH - 4)}`

    expect(() => assertStrongSebQuitPassword(minimum, minimum)).not.toThrow()
    expect(() => assertStrongSebQuitPassword(maximum, maximum)).not.toThrow()
  })

  it.each([
    'Aa1!visible-quote-\'"xx',
    'Aa1!visible-backslash-\\x',
    'Aa1!visible-backtick-`xx',
  ])('accepts visible ASCII symbols without transforming them: %s', value => {
    expect(() => assertStrongSebQuitPassword(value, value)).not.toThrow()
  })

  it.each([
    ['too short', `Aa1!${'x'.repeat(SEB_QUIT_PASSWORD_MIN_LENGTH - 5)}`],
    ['too long', `Aa1!${'x'.repeat(SEB_QUIT_PASSWORD_MAX_LENGTH - 3)}`],
    ['space', 'Strong Password-With1!'],
    ['newline', 'Strong-Password-With1!\n'],
    ['tab', 'Strong-Password-With1!\t'],
    ['NUL', 'Strong-Password-With1!\0'],
    ['DEL', `Strong-Password-With1!${String.fromCharCode(127)}`],
    ['non ASCII', 'Strong-Password-ไทย1!'],
    ['no uppercase', 'lowercase-password-123!'],
    ['no lowercase', 'UPPERCASE-PASSWORD-123!'],
    ['no digit', 'Strong-Password-No-Digit!'],
    ['no symbol', 'StrongPasswordWithoutSymbol123'],
  ])('rejects %s passwords without reflecting them', (_label, value) => {
    expectCode(
      () => prepareSebQuitPasswordRevision(command({ password: value, confirmation: value }), context()),
      'SEB_QUIT_PASSWORD_INVALID',
    )
  })

  it('requires an exact confirmation without trimming either field', () => {
    expectCode(
      () => prepareSebQuitPasswordRevision(command({ confirmation: `${PASSWORD} ` }), context()),
      'SEB_QUIT_PASSWORD_CONFIRMATION_MISMATCH',
    )
  })

  it.each([
    ['student', { actor: { id: ACTOR_ID, role: 'student', status: 'active' } }],
    ['admin', { actor: { id: ACTOR_ID, role: 'admin', status: 'active' } }],
    ['suspended teacher', { actor: { id: ACTOR_ID, role: 'teacher', status: 'suspended' } }],
    ['different owner', { assignment: { ...context().assignment, createdBy: OTHER_ID } }],
    ['missing organization membership', { memberOrgIds: [OTHER_ID] }],
  ])('denies %s before evaluating password strength', (_label, override) => {
    expectCode(
      () => prepareSebQuitPasswordRevision(command({ password: 'short', confirmation: 'short' }), context(override)),
      'SEB_QUIT_PASSWORD_ACCESS_DENIED',
    )
  })

  it.each([
    ['different assignment', { assignment: { ...context().assignment, id: OTHER_ID } }],
    ['exercise', { assignment: { ...context().assignment, type: 'exercise' } }],
    ['ordinary browser exam', { assignment: { ...context().assignment, secureBrowserMode: 'browser' } }],
    ['closed exam', { assignment: { ...context().assignment, status: 'closed' } }],
  ])('refuses an ineligible %s context', (_label, override) => {
    expectCode(
      () => prepareSebQuitPasswordRevision(command(), context(override)),
      'SEB_QUIT_PASSWORD_NOT_ELIGIBLE',
    )
  })

  it('refuses rotation while any attempt is active', () => {
    expectCode(
      () => prepareSebQuitPasswordRevision(command(), context({ hasActiveAttempt: true })),
      'SEB_QUIT_PASSWORD_ACTIVE_ATTEMPT',
    )
  })

  it('uses compare-and-swap revision semantics and refuses exhaustion', () => {
    expectCode(
      () => prepareSebQuitPasswordRevision(command({ expectedRevision: 1 }), context()),
      'SEB_QUIT_PASSWORD_REVISION_CONFLICT',
    )
    expectCode(
      () => prepareSebQuitPasswordRevision(
        command({ expectedRevision: SEB_QUIT_PASSWORD_MAX_REVISION }),
        context({ currentRevision: SEB_QUIT_PASSWORD_MAX_REVISION }),
      ),
      'SEB_QUIT_PASSWORD_REVISION_EXHAUSTED',
    )
  })

  it('hashes deterministically and changes the hash when one password character changes', () => {
    const first = prepareSebQuitPasswordRevision(command(), context())
    const repeated = prepareSebQuitPasswordRevision(command(), context())
    const changedPassword = 'KorKru-Quit-2026!Aa8'
    const changed = prepareSebQuitPasswordRevision(
      command({ password: changedPassword, confirmation: changedPassword }),
      context(),
    )

    expect(first.hashedQuitPassword).toMatch(/^[0-9a-f]{64}$/)
    expect(repeated.hashedQuitPassword).toBe(first.hashedQuitPassword)
    expect(changed.hashedQuitPassword).not.toBe(first.hashedQuitPassword)
  })
})

describe('SEB quit-password input and error boundaries', () => {
  it.each([
    null,
    {},
    command({ assignmentId: 'not-a-uuid' }),
    command({ expectedRevision: '0' }),
    command({ expectedRevision: -1 }),
    command({ expectedRevision: 0.5 }),
    command({ expectedRevision: Number.NaN }),
    command({ expectedRevision: Number.POSITIVE_INFINITY }),
    command({ actorId: ACTOR_ID }),
    command({ hashedQuitPassword: '0'.repeat(64) }),
  ])('rejects malformed or authority-injecting commands', input => {
    expectCode(() => parseSebQuitPasswordCommand(input), 'SEB_QUIT_PASSWORD_INVALID_COMMAND')
  })

  it.each([
    null,
    {},
    context({ currentRevision: -1 }),
    context({ hasActiveAttempt: 'false' }),
    context({ actor: { id: 'not-a-uuid', role: 'teacher', status: 'active' } }),
    context({ memberOrgIds: ['not-a-uuid'] }),
    { ...context(), password: PASSWORD },
  ])('rejects malformed contexts and secret-bearing context fields', input => {
    expectCode(() => parseSebQuitPasswordOwnerContext(input), 'SEB_QUIT_PASSWORD_INVALID_CONTEXT')
  })

  it('returns only fixed safe errors, even when an unknown error contains the secret', () => {
    const safeKnown = toSafeSebQuitPasswordError(new SebQuitPasswordError('SEB_QUIT_PASSWORD_INVALID'))
    const safeUnknown = toSafeSebQuitPasswordError(new Error(PASSWORD))

    expect(safeKnown.message).not.toContain(PASSWORD)
    expect(safeUnknown.message).not.toContain(PASSWORD)
    expect(JSON.stringify(safeKnown)).not.toContain(PASSWORD)
    expect(JSON.stringify(safeUnknown)).not.toContain(PASSWORD)
    expect(safeUnknown).toEqual({
      code: 'SEB_QUIT_PASSWORD_UNKNOWN',
      message: 'บันทึกรหัสออกไม่สำเร็จ กรุณาโหลดหน้าแล้วลองอีกครั้ง',
      reloadRequired: true,
    })
  })

  it('keeps error objects free of password, confirmation and caller input', () => {
    try {
      prepareSebQuitPasswordRevision(command({ confirmation: `${PASSWORD}-different` }), context())
      throw new Error('Expected the operation to fail')
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(PASSWORD)
      expect(String(error)).toBe('SebQuitPasswordError: SEB_QUIT_PASSWORD_CONFIRMATION_MISMATCH')
    }
  })

  it('does not write password material to console output', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
    try {
      prepareSebQuitPasswordRevision(command(), context())
      expect(spies.every(spy => spy.mock.calls.length === 0)).toBe(true)
    } finally {
      spies.forEach(spy => spy.mockRestore())
    }
  })
})
