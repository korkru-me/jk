import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import {
  assertSebDraftPassword, assertSebPasswordOwner, nextSebPasswordRevision,
  parseSebPasswordBinding, type SebPasswordOwnerContext,
} from '@/lib/seb-password-policy'

const TEACHER = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const ASSIGNMENT = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
const REVISION = '55555555-5555-4555-8555-555555555555'
const owner = (): SebPasswordOwnerContext => ({
  actor: { id: TEACHER, role: 'teacher', status: 'active' },
  memberOrgIds: [ORG],
  assignment: {
    id: ASSIGNMENT, org_id: ORG, created_by: TEACHER,
    mode: 'online', type: 'exam', secure_browser_mode: 'seb_required',
  },
})

describe('SEB draft password validation', () => {
  it.each(['Lab-password-12!', 'a'.repeat(12), 'a'.repeat(64)])('accepts the current bounded ASCII subset', password => {
    expect(() => assertSebDraftPassword(password)).not.toThrow()
  })
  it.each([null, undefined, '', 123456789012, 'short', 'a'.repeat(65), ' password-123', 'password-123 ',
    'password\n12345', 'password\u000012345', 'รหัสผ่านทดสอบ123', 'pássword-12345'])('rejects unsupported inputs without coercion/normalization', password => {
    expect(() => assertSebDraftPassword(password)).toThrow('SEB_PASSWORD_INVALID')
  })
})

describe('pure owner policy — not a live auth/RLS test', () => {
  it('allows an active owning teacher with exact organization membership', () => {
    expect(() => assertSebPasswordOwner(owner())).not.toThrow()
  })
  it('allows an admin only for their own exam, not as a global bypass', () => {
    const context = owner()
    context.actor.role = 'admin'
    expect(() => assertSebPasswordOwner(context)).not.toThrow()
    context.assignment.created_by = OTHER
    expect(() => assertSebPasswordOwner(context)).toThrow('SEB_PASSWORD_ACCESS_DENIED')
  })
  it.each([
    (context: SebPasswordOwnerContext) => { context.actor.role = 'student' },
    (context: SebPasswordOwnerContext) => { context.actor.status = 'suspended' },
    (context: SebPasswordOwnerContext) => { context.assignment.created_by = OTHER },
    (context: SebPasswordOwnerContext) => { context.assignment.org_id = OTHER },
    (context: SebPasswordOwnerContext) => { context.assignment.type = 'exercise' },
    (context: SebPasswordOwnerContext) => { context.assignment.mode = 'print' },
    (context: SebPasswordOwnerContext) => { context.assignment.secure_browser_mode = 'browser' },
  ])('rejects nonowners, removed/incorrect tenant and unsupported exams', mutate => {
    const context = owner()
    mutate(context)
    expect(() => assertSebPasswordOwner(context)).toThrow('SEB_PASSWORD_ACCESS_DENIED')
  })
  it('rejects removed membership and does not fall back to personal organization', () => {
    expect(() => assertSebPasswordOwner({ ...owner(), memberOrgIds: [] })).toThrow('SEB_PASSWORD_ACCESS_DENIED')
    expect(() => assertSebPasswordOwner({ ...owner(), memberOrgIds: [OTHER] })).toThrow('SEB_PASSWORD_ACCESS_DENIED')
  })
  it('rejects malformed IDs without using their contents as errors', () => {
    const context = owner()
    context.actor.id = 'SYNTHETIC-SECRET'
    expect(() => assertSebPasswordOwner(context)).toThrow('SEB_PASSWORD_CONTEXT_INVALID')
  })
})

describe('immutable revision planning', () => {
  it('starts at 1 and advances only from the exact expected revision', () => {
    expect(nextSebPasswordRevision(0, 0)).toBe(1)
    expect(nextSebPasswordRevision(1, 1)).toBe(2)
  })
  it.each([[2, 1], [1, 2], [-1, -1], [0.5, 0.5], [NaN, NaN], [Infinity, Infinity], [2147483647, 2147483647]])('rejects stale/out-of-range versions (%s, %s)', (current, expected) => {
    expect(() => nextSebPasswordRevision(current, expected)).toThrow('SEB_PASSWORD_REVISION_CONFLICT')
  })
  it('copies only canonical binding fields and freezes the snapshot', () => {
    const input = { orgId: ORG, teacherId: TEACHER, assignmentId: ASSIGNMENT, revisionId: REVISION, revision: 1, password: 'DO-NOT-COPY' }
    const parsed = parseSebPasswordBinding(input)
    input.revision = 2
    expect(parsed.revision).toBe(1)
    expect(parsed).not.toHaveProperty('password')
    expect(Object.isFrozen(parsed)).toBe(true)
  })
  it.each([undefined, {}, { orgId: ORG }, { orgId: ORG, teacherId: TEACHER, assignmentId: ASSIGNMENT, revisionId: REVISION, revision: 0 }])('rejects incomplete binding', binding => {
    expect(() => parseSebPasswordBinding(binding)).toThrow('SEB_PASSWORD_CONTEXT_INVALID')
  })
})
