import { describe, expect, it } from 'vitest'
import { exerciseWaitingDetails } from './exam-waiting-room'

const exercise: Parameters<typeof exerciseWaitingDetails>[0] = {
  type: 'exercise', completion_rule: 'fixed', max_attempts: 3, passing_type: null, passing_value: null,
  score_strategy: 'best', streak_target: null, streak_question_cap: null, retry_scope: 'all',
  instant_check: false, instant_check_answer_key: false, require_work_image: false,
}
describe('public exercise waiting details', () => {
  it('allowlists only public configuration, never code/answers/student scores', () => {
    const row = { ...exercise, access_code: 'PRIVATE', total_score: 10, correct_answer: 'SECRET', question_ids: ['secret-question'] }
    const details = exerciseWaitingDetails(row)!
    expect(Object.keys(details).sort()).toEqual(['completion', 'maxAttempts', 'scoreStrategy', 'passingType',
      'passingValue', 'streakTarget', 'streakQuestionCap', 'retryWrongOnly', 'instantCheck', 'revealCheckAnswer', 'requireWorkImage'].sort())
    expect(JSON.stringify(details)).not.toMatch(/PRIVATE|SECRET|secret-question|total_score|access_code|correct_answer/)
  })
  it('does not add exercise metadata to an exam', () => {
    expect(exerciseWaitingDetails({ ...exercise, type: 'exam' })).toBeUndefined()
  })
  it.each([1, 3, null])('preserves the effective complete-mode quota %j', max_attempts => {
    expect(exerciseWaitingDetails({ ...exercise, max_attempts })?.maxAttempts).toBe(max_attempts)
  })
  it.each(['best', 'average', 'latest'] as const)('preserves the configured score policy %s', score_strategy => {
    expect(exerciseWaitingDetails({ ...exercise, score_strategy })?.scoreStrategy).toBe(score_strategy)
  })
  it('threshold/streak ignore legacy quotas and expose only their relevant completion settings', () => {
    expect(exerciseWaitingDetails({ ...exercise, passing_type: 'percent', passing_value: 70 })).toMatchObject({
      completion: 'threshold', maxAttempts: null, passingType: 'percent', passingValue: 70, streakTarget: null })
    expect(exerciseWaitingDetails({ ...exercise, completion_rule: 'streak', streak_target: 3, streak_question_cap: 10 })).toMatchObject({
      completion: 'streak', maxAttempts: null, passingType: null, passingValue: null, streakTarget: 3, streakQuestionCap: 10 })
  })
  it('does not promise answer reveal when instant checking is off', () => {
    expect(exerciseWaitingDetails({ ...exercise, instant_check_answer_key: true })?.revealCheckAnswer).toBe(false)
    expect(exerciseWaitingDetails({ ...exercise, instant_check: true, instant_check_answer_key: true,
      retry_scope: 'wrong_only', require_work_image: true })).toMatchObject({
      instantCheck: true, revealCheckAnswer: true, retryWrongOnly: true, requireWorkImage: true })
  })
})
