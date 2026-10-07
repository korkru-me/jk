import { describe, expect, it } from 'vitest'
import {
  completionAttemptLimit,
  completionAttemptSettings,
  findPassingCompletion,
  streakRandomSubsetError,
} from './assignment-completion'

const assignment = { type: 'exercise' as const, completion_rule: 'fixed', passing_type: null, passing_value: null, max_attempts: 1 }
const failed = { status: 'graded', total_score: 6, max_score: 10, streak_reached: false }
const passed = { ...failed, total_score: 8 }
const threshold = { ...assignment, passing_type: 'percent' as const, passing_value: 70 }

describe('assignment completion retry policy', () => {
  it('preserves complete-mode quotas and legacy unlimited exercises', () => {
    expect(completionAttemptLimit(assignment)).toBe(1)
    expect(completionAttemptLimit({ ...assignment, max_attempts: 3 })).toBe(3)
    expect(completionAttemptLimit({ ...assignment, max_attempts: null })).toBeNull()
    expect(completionAttemptLimit({ ...assignment, type: 'exam', max_attempts: null })).toBe(1)
    expect(findPassingCompletion(assignment, [passed])).toBeNull()
  })
  it.each(['exercise', 'exam'] as const)('ignores stale quotas until mastery for %s', type => {
    expect(completionAttemptLimit({ ...threshold, type })).toBeNull()
    expect(completionAttemptLimit({ ...assignment, type, completion_rule: 'streak' })).toBeNull()
  })
  it('only accepts server-scored finished passes, retaining an earlier success', () => {
    expect(findPassingCompletion(threshold, [failed])).toBeNull()
    expect(findPassingCompletion(threshold, [{ ...passed, status: 'in_progress' }])).toBeNull()
    expect(findPassingCompletion(threshold, [{ ...passed, total_score: null }])).toBeNull()
    expect(findPassingCompletion(threshold, [failed, passed, failed])).toBe(passed)
  })
  it('uses the displayed score scale, including rounding and a zero threshold', () => {
    expect(findPassingCompletion({ ...threshold, passing_type: 'score', passing_value: 7, display_max_score: 10 }, [{ ...passed, total_score: 4, max_score: 5 }])).not.toBeNull()
    expect(findPassingCompletion({ ...threshold, passing_value: 0 }, [failed])).toBe(failed)
  })
  it('requires the server streak verdict, not a full numeric score', () => {
    const streak = { ...assignment, completion_rule: 'streak' }
    expect(findPassingCompletion(streak, [{ ...passed, total_score: 10 }])).toBeNull()
    expect(findPassingCompletion(streak, [{ ...failed, streak_reached: true }])).not.toBeNull()
  })
  it('normalizes hidden mastery settings and validates quotas for complete mode', () => {
    expect(completionAttemptSettings(threshold, 'average')).toMatchObject({ max_attempts: null, score_strategy: 'best', error: null })
    expect(completionAttemptSettings(assignment, 'latest').score_strategy).toBe('latest')
    for (const max_attempts of [0, -1, 1.5, NaN]) expect(completionAttemptSettings({ ...assignment, max_attempts }).error).not.toBeNull()
  })
  it('refuses a missing or invalid passing threshold instead of silently saving complete mode', () => {
    for (const passing_value of [null, -1, 101, NaN]) expect(completionAttemptSettings({ ...threshold, passing_value }).error).not.toBeNull()
    expect(completionAttemptSettings({ ...threshold, passing_value: 0 }).error).toBeNull()
  })
  it('offers streak completion only for a random subset', () => {
    expect(streakRandomSubsetError('streak', null)).toContain('สุ่มโจทย์')
    expect(streakRandomSubsetError('streak', 5)).toBeNull()
    expect(streakRandomSubsetError('fixed', null)).toBeNull()
  })
})
