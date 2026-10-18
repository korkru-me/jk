import { describe, expect, it } from 'vitest'
import type { GradingDraftItem, PublishGradingDraftsInput, SaveGradingDraftsInput } from '@/lib/grading-draft-types'
import { scoreParts } from '@/lib/grading-workspace'
import { LAB_TIME, labId } from '@/app/exam-screen-lab/grading-workspace/fixture'
import { createGradingLabState, migrateLegacyGradingLab, parseGradingLabState, projectLabData, publishLabDrafts, saveLabDrafts, type GradingLabState } from '@/app/exam-screen-lab/grading-workspace/grading-workspace-lab-state'

const at = Date.parse(LAB_TIME) + 100
function item(state: GradingLabState, index: number, patch: Partial<GradingDraftItem> = {}): GradingDraftItem {
  const answer = state.data.answers[index]
  const draft = state.data.savedDrafts.find(row => row.answerId === answer.id)
  return { answerId: answer.id, expectedScoreEditedAt: answer.scoreEditedAt, expectedDraftUpdatedAt: draft?.updatedAt ?? null, answerScore: 0, ...patch }
}
function request(state: GradingLabState, items: GradingDraftItem[], id = 1): SaveGradingDraftsInput {
  return { assignmentId: state.data.assignment.id, requestId: labId(8700, id), items }
}
function publication(input: SaveGradingDraftsInput): PublishGradingDraftsInput { return { ...input, confirmed: true } }

describe('synthetic grading lab private drafts and atomic publication', () => {
  it('saves a whole private batch without touching published answers, scores, average, or notification count', () => {
    const before = createGradingLabState()
    const result = saveLabDrafts(before, request(before, [item(before, 7), item(before, 8, { workScore: 1 })]), at)
    expect(result.result).toMatchObject({ success: true, drafts: [{ answerScore: 0 }, { answerScore: 0, workScore: 1 }] })
    expect(result.state.data.answers).toBe(before.data.answers)
    expect(result.state.data.students).toBe(before.data.students)
    expect(result.state.data.savedDrafts).toHaveLength(2)
    expect(result.state.notificationCount).toBe(0)
    expect(before.data.savedDrafts).toHaveLength(0)
  })

  it('rejects an invalid row before any row or receipt is changed', () => {
    const before = createGradingLabState()
    const result = saveLabDrafts(before, request(before, [item(before, 7), item(before, 8, { answerScore: 99 })]), at)
    expect(result.state).toBe(before)
    expect(result.result).toMatchObject({ code: 'validation' })
    expect(Object.keys(before.receipts)).toHaveLength(0)
  })

  it('rejects stale published and private revisions atomically', () => {
    const before = createGradingLabState()
    expect(saveLabDrafts(before, request(before, [item(before, 7, { expectedScoreEditedAt: LAB_TIME })]), at).result).toMatchObject({ code: 'conflict' })
    const saved = saveLabDrafts(before, request(before, [item(before, 7)]), at).state
    const stale = saveLabDrafts(saved, request(saved, [item(saved, 7, { expectedDraftUpdatedAt: null })], 2), at + 1)
    expect(stale.result).toMatchObject({ code: 'conflict' })
    expect(stale.state).toBe(saved)
  })

  it('reuses identical sorted payload receipts and rejects changed-payload request ID reuse', () => {
    const before = createGradingLabState()
    const input = request(before, [item(before, 8), item(before, 7)])
    const saved = saveLabDrafts(before, input, at)
    const retried = saveLabDrafts(saved.state, { ...input, items: [...input.items].reverse() }, at + 10)
    expect(retried.result).toBe(saved.result)
    expect(retried.state).toBe(saved.state)
    const changed = saveLabDrafts(saved.state, { ...input, items: [item(before, 7, { answerScore: 0.5 })] }, at + 20)
    expect(changed.result).toMatchObject({ code: 'conflict' })
    expect(changed.state).toBe(saved.state)
  })

  it('publishes all rows, clears only own drafts, and produces one fake notification per affected student', () => {
    const before = createGradingLabState()
    before.privateDrafts.push({ ...item(before, 8), updatedAt: LAB_TIME, graderId: labId(8000, 99) })
    const saved = saveLabDrafts(before, request(before, [item(before, 7), item(before, 8, { workScore: 1.25 })]), at).state
    const input = publication(request(saved, [item(saved, 7), item(saved, 8, { workScore: 1.25 })], 2))
    const published = publishLabDrafts(saved, input, at + 10)
    expect(published.result).toMatchObject({ success: true, published: [{ answerId: input.items[0].answerId }, { answerId: input.items[1].answerId }], notificationCount: 1 })
    expect(published.state.data.savedDrafts).toHaveLength(0)
    expect(published.state.privateDrafts).toHaveLength(1)
    expect(published.state.privateDrafts[0].graderId).toBe(labId(8000, 99))
    expect(published.state.notificationCount).toBe(1)
    expect(published.state.data.answers[8]).toMatchObject({ answerScore: 0, workScore: 1.25, score: 1.25 })
    expect(published.state.data.students[1].score).not.toBe(before.data.students[1].score)
    const retry = publishLabDrafts(published.state, input, at + 30)
    expect(retry.state).toBe(published.state)
    expect(retry.result).toBe(published.result)
    expect(retry.state.notificationCount).toBe(1)
  })

  it('keeps publication atomic on a conflict in any row and requires confirmation', () => {
    const before = createGradingLabState()
    const input = publication(request(before, [item(before, 7), item(before, 8, { expectedScoreEditedAt: LAB_TIME })]))
    const result = publishLabDrafts(before, input, at)
    expect(result.result).toMatchObject({ code: 'conflict' })
    expect(result.state).toBe(before)
    expect(before.notificationCount).toBe(0)
    expect(publishLabDrafts(before, { ...input, confirmed: false } as unknown as PublishGradingDraftsInput, at).result).toMatchObject({ code: 'validation' })
  })

  it('rounds published components to two decimals and notifies different students separately', () => {
    const before = createGradingLabState()
    const first = item(before, 8, { workScore: 1.234567 })
    const second = item(before, 15, { workScore: 2.345678 })
    const published = publishLabDrafts(before, publication(request(before, [first, second])), at)
    expect(published.result).toMatchObject({ success: true, notificationCount: 2 })
    expect(published.state.data.answers[8].workScore).toBe(1.23)
    expect(published.state.data.answers[15].workScore).toBe(2.35)
    expect(published.state.notificationCount).toBe(2)
  })

  it('explicitly reviews a pending file answer at zero while leaving other pending parts alone', () => {
    const before = createGradingLabState()
    const result = publishLabDrafts(before, publication(request(before, [item(before, 10)])), at)
    expect(result.result).toMatchObject({ success: true })
    expect(result.state.data.answers[10]).toMatchObject({ answerScore: 0, isCorrect: false, answerReviewedAt: new Date(at).toISOString() })
    expect(scoreParts(result.state.data.answers[10], result.state.data.questions[3]).pending).toBe(false)
    expect(result.state.data.answers[8].workReviewedAt).toBeNull()
  })

  it('removes an exact stale draft even after published scores change, without changing that score', () => {
    const before = createGradingLabState()
    const saved = saveLabDrafts(before, request(before, [item(before, 7)]), at).state
    const changed = { ...saved, data: { ...saved.data, answers: saved.data.answers.map((answer, index) => index === 7 ? { ...answer, scoreEditedAt: new Date(at + 1).toISOString() } : answer) } }
    const originalItem = item(saved, 7)
    const { answerScore: _answerScore, ...remove } = originalItem
    const result = saveLabDrafts(changed, request(changed, [{ ...remove, remove: true }], 2), at + 2)
    expect(result.result).toMatchObject({ success: true, deletedDraftIds: [originalItem.answerId] })
    expect(result.state.data.savedDrafts).toHaveLength(0)
    expect(result.state.data.answers).toBe(changed.data.answers)
  })

  it('restores private drafts and idempotency receipts from durable synthetic JSON', () => {
    const before = createGradingLabState()
    const input = request(before, [item(before, 7)])
    const saved = saveLabDrafts(before, input, at)
    const restored = parseGradingLabState(JSON.stringify(saved.state))!
    expect(restored.data.savedDrafts).toEqual(saved.state.data.savedDrafts)
    expect(saveLabDrafts(restored, input, at + 100).result).toEqual(saved.result)
    expect(parseGradingLabState('{broken')).toBeNull()
    expect(parseGradingLabState(JSON.stringify({ ...saved.state, data: { ...saved.state.data, baseHref: '/real-results' } }))).toBeNull()
    expect(migrateLegacyGradingLab(JSON.stringify(before.data))?.data).toMatchObject({ draftsAvailable: true, savedDrafts: [], assignment: { showResults: 'immediate' } })
  })

  it('never projects another synthetic grader private draft into the current teacher view', () => {
    const before = createGradingLabState()
    const saved = saveLabDrafts(before, request(before, [item(before, 7)]), at).state
    const other = { ...saved, data: { ...saved.data, viewerId: labId(8000, 99) } }
    expect(projectLabData(other).savedDrafts).toEqual([])
    expect(projectLabData(saved).savedDrafts).toHaveLength(1)
  })

  it.each([null, '', NaN, Infinity, -1])('never converts invalid score %s into a stored zero', value => {
    const before = createGradingLabState()
    const result = saveLabDrafts(before, request(before, [item(before, 7, { answerScore: value as number })]), at)
    expect(result.result).toMatchObject({ code: 'validation' })
    expect(result.state).toBe(before)
  })

  it('blocks unavailable drafts and duplicate IDs with no state changes', () => {
    const before = createGradingLabState()
    const input = request(before, [item(before, 7), item(before, 7)])
    expect(saveLabDrafts(before, input, at).result).toMatchObject({ code: 'validation' })
    const unavailable = { ...before, data: { ...before.data, draftsAvailable: false } }
    expect(saveLabDrafts(unavailable, request(unavailable, [item(unavailable, 7)]), at)).toMatchObject({ state: unavailable, result: { code: 'unavailable' } })
  })
})
