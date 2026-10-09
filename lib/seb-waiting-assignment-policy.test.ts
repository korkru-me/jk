import { describe, expect, it } from 'vitest'
import { WAITING_SEB_RELEASE_PROFILE_ID } from '@/lib/seb-waiting-release-policy'
import {
  inspectWaitingSebAssignmentPolicy,
  WAITING_SEB_ASSIGNMENT_UNAVAILABLE_MESSAGE,
  WAITING_SEB_LEGACY_CODE_UNAVAILABLE_MESSAGE,
  WAITING_SEB_STREAK_UNAVAILABLE_MESSAGE,
  type WaitingSebAssignmentFacts,
} from '@/lib/seb-waiting-assignment-policy'

const assignment: WaitingSebAssignmentFacts = Object.freeze({
  type: 'exam', mode: 'online', secure_browser_mode: 'seb_required', completion_rule: 'fixed',
})
const pilot = Object.freeze({ profileId: WAITING_SEB_RELEASE_PROFILE_ID, assignment, passwordless: true })

describe('waiting-profile assignment compatibility, not general exam authority', () => {
  it('supports only fixed, online, SEB-required, independently passwordless exams', () => {
    expect(inspectWaitingSebAssignmentPolicy(pilot)).toEqual({ applies: true, supported: true })
  })

  it.each([true, false])('fails closed for streak even when passwordless=%s', passwordless => {
    const result = inspectWaitingSebAssignmentPolicy({
      ...pilot, assignment: { ...assignment, completion_rule: 'streak' }, passwordless,
    })
    expect(result).toEqual({
      applies: true, supported: false, reason: 'streak', message: WAITING_SEB_STREAK_UNAVAILABLE_MESSAGE,
    })
    expect(result).not.toHaveProperty('canStart')
    expect(result).not.toHaveProperty('startIntent')
    expect(result).not.toHaveProperty('submissionId')
    expect(result).not.toHaveProperty('questions')
  })

  it('gives a clear unavailable reason without downgrading to fixed or another profile', () => {
    const streak = Object.freeze({ ...assignment, completion_rule: 'streak' as const })
    const facts = Object.freeze({ ...pilot, assignment: streak })
    expect(inspectWaitingSebAssignmentPolicy(facts)).toMatchObject({ supported: false, reason: 'streak' })
    expect(facts.assignment.completion_rule).toBe('streak')
    expect(facts.profileId).toBe(WAITING_SEB_RELEASE_PROFILE_ID)
    expect(WAITING_SEB_STREAK_UNAVAILABLE_MESSAGE).toContain('ยังไม่รองรับ')
  })

  it.each([null, undefined, '', 'legacy-r2', 'ordinary-seb-exam'])('does not change non-waiting profile %s', profileId => {
    // Non-pilot compatibility is still decided by its existing authorization
    // path; this result deliberately contains no supported/allowed claim.
    expect(inspectWaitingSebAssignmentPolicy({
      ...pilot, profileId, assignment: { ...assignment, completion_rule: 'streak' }, passwordless: false,
    })).toEqual({ applies: false })
  })

  it.each([
    null,
    undefined,
    { ...assignment, type: 'exercise' },
    { ...assignment, mode: 'print' },
    { ...assignment, secure_browser_mode: 'browser' },
    { ...assignment, completion_rule: null },
    { ...assignment, completion_rule: undefined },
    { ...assignment, completion_rule: 'future_rule' },
  ])('rejects unsupported or incomplete current assignment metadata: %j', candidate => {
    // Model corrupted/historical database boundary values without weakening
    // the domain type accepted by real callers.
    expect(inspectWaitingSebAssignmentPolicy({
      ...pilot, assignment: candidate as WaitingSebAssignmentFacts | null | undefined,
    })).toEqual({
      applies: true, supported: false, reason: 'assignment', message: WAITING_SEB_ASSIGNMENT_UNAVAILABLE_MESSAGE,
    })
  })

  it('rejects a legacy access code rather than returning it or silently bypassing it', () => {
    expect(inspectWaitingSebAssignmentPolicy({ ...pilot, passwordless: false })).toEqual({
      applies: true, supported: false, reason: 'legacy_access_code', message: WAITING_SEB_LEGACY_CODE_UNAVAILABLE_MESSAGE,
    })
  })

  it.each(['data', 'object', 'start', 'resume'] as const)('has the same fail-closed decision for the %s guard', () => {
    // This tests the shared policy contract only, not framework integration.
    // The server route/action tests must additionally assert that the guarded
    // read, RPC, question draw, or write was never invoked.
    const result = inspectWaitingSebAssignmentPolicy({
      ...pilot, assignment: { ...assignment, completion_rule: 'streak' },
    })
    expect(result.applies && result.supported).toBe(false)
  })
})
