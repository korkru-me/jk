import { describe, expect, it } from 'vitest'
import { projectSebWaitingRoom, type SebWaitingFacts } from './seb-waiting-room'

const NOW = Date.parse('2026-10-09T14:00:00Z')
const base: SebWaitingFacts = {
  title: 'ข้อสอบทดสอบ', durationMinutes: 30, published: true, authorized: true,
  releaseReady: true, verified: false, opensAt: null, closesAt: null,
  attempt: null, canCreateAttempt: true, now: NOW,
}

describe('question-free SEB waiting projection', () => {
  it('is pure and never serializes an attempt, question or secret payload', () => {
    const input = { ...base, questionText: 'PRIVATE_QUESTION', correct_answer: 'PRIVATE_KEY', access_code: 'PRIVATE_CODE' }
    const result = projectSebWaitingRoom(input)
    expect(result.phase).toBe('ready')
    expect(result.canStart).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|correct_answer|questionText|access_code|startedAt|attempt/)
    expect(input.attempt).toBeNull()
  })
  it('only enables explicit start after verification', () => {
    expect(projectSebWaitingRoom({ ...base, verified: true }).canStart).toBe(true)
  })
  it.each(['published', 'authorized', 'releaseReady'] as const)('denies absent %s', field => {
    expect(projectSebWaitingRoom({ ...base, [field]: false, verified: true }).phase).toBe('unavailable')
  })
  it('does not start before the opening boundary or at the closing boundary', () => {
    expect(projectSebWaitingRoom({ ...base, verified: true, opensAt: new Date(NOW + 1).toISOString() }).phase).toBe('not_open')
    expect(projectSebWaitingRoom({ ...base, verified: true, opensAt: new Date(NOW).toISOString() }).canStart).toBe(true)
    expect(projectSebWaitingRoom({ ...base, verified: true, closesAt: new Date(NOW).toISOString() }).phase).toBe('closed')
  })
  it('recognizes active attempts without resetting time or issuing a new start', () => {
    const result = projectSebWaitingRoom({ ...base, verified: true, attempt: {
      id: 'existing', status: 'in_progress', startedAt: new Date(NOW - 5 * 60_000).toISOString(),
    } })
    expect(result).toMatchObject({ phase: 'active', canStart: false, canResume: true, needsFinalization: false })
  })
  it('an expired timer needs server finalization, not a submitted UI claim', () => {
    const result = projectSebWaitingRoom({ ...base, verified: true, attempt: {
      id: 'existing', status: 'in_progress', startedAt: new Date(NOW - 30 * 60_000).toISOString(),
    } })
    expect(result).toMatchObject({ phase: 'active', canStart: false, needsFinalization: true })
  })
  it.each(['submitted', 'graded'] as const)('projects only a committed %s receipt', status => {
    expect(projectSebWaitingRoom({ ...base, canCreateAttempt: false, attempt: { id: 'done', status, startedAt: new Date(NOW - 60_000).toISOString() } }))
      .toMatchObject({ phase: 'submitted', canStart: false, canResume: false })
  })
  it('permits only an explicitly allowed new generation while retaining its receipt', () => {
    const view = projectSebWaitingRoom({ ...base, verified: true, attempt: { id: 'done', status: 'submitted', startedAt: new Date(NOW - 60_000).toISOString() } })
    expect(view).toMatchObject({ phase: 'ready', canStart: true, canResume: false, hasReceipt: true })
  })
  it('does not treat malformed time or exhausted quota as ready', () => {
    expect(projectSebWaitingRoom({ ...base, opensAt: 'invalid' }).phase).toBe('unavailable')
    expect(projectSebWaitingRoom({ ...base, canCreateAttempt: false, verified: true }).canStart).toBe(false)
  })
})
