import type { GradingAnswer } from '@/lib/grading-workspace'
import { scoreParts } from '@/lib/grading-workspace'
import type { GradingDraftError, GradingDraftItem, GradingSavedDraft, PublishGradingDraftsInput, PublishGradingDraftsResult, SaveGradingDraftsInput, SaveGradingDraftsResult } from '@/lib/grading-draft-types'
import { createGradingLab, LAB_BASE, LAB_TIME, labId, recomputeLab, type GradingLabData } from './fixture'

interface PrivateLabDraft extends GradingSavedDraft { graderId: string }
interface LabReceipt { payload: string; result: SaveGradingDraftsResult | PublishGradingDraftsResult }
export interface GradingLabState {
  version: 2
  data: GradingLabData
  privateDrafts: PrivateLabDraft[]
  receipts: Record<string, LabReceipt>
  notificationCount: number
}
interface Transition<T> { state: GradingLabState; result: T }

export function projectLabData(state: GradingLabState): GradingLabData {
  return { ...state.data, savedDrafts: state.privateDrafts.filter(draft => draft.graderId === state.data.viewerId)
    .map(({ graderId: _graderId, ...draft }) => draft).sort((a, b) => a.answerId.localeCompare(b.answerId)) }
}

export function createGradingLabState(data = createGradingLab()): GradingLabState {
  const state: GradingLabState = { version: 2, data, privateDrafts: data.savedDrafts.map(draft => ({ ...draft, graderId: data.viewerId })), receipts: {}, notificationCount: 0 }
  return { ...state, data: projectLabData(state) }
}

function isLabData(value: unknown): value is GradingLabData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<GradingLabData>
  return data.baseHref === LAB_BASE && data.assignment?.id === labId(8000, 2)
    && Array.isArray(data.students) && data.students.length === 32 && Array.isArray(data.questions) && data.questions.length === 7
    && Array.isArray(data.answers) && data.answers.length >= 224
}

/** Only the lab's synthetic key is read. This is not a real-score cache. */
export function parseGradingLabState(raw: string | null): GradingLabState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<GradingLabState>
    if (parsed.version !== 2 || !isLabData(parsed.data) || parsed.data.viewerId !== labId(8000, 1)
      || !Array.isArray(parsed.privateDrafts) || !parsed.receipts || typeof parsed.receipts !== 'object'
      || !Number.isInteger(parsed.notificationCount) || parsed.notificationCount! < 0) return null
    const state = parsed as GradingLabState
    return { ...state, data: projectLabData(state) }
  } catch { return null }
}

export function migrateLegacyGradingLab(raw: string | null): GradingLabState | null {
  if (!raw) return null
  try {
    const old = JSON.parse(raw)
    if (!isLabData(old)) return null
    return createGradingLabState({ ...old, assignment: { ...old.assignment, showResults: 'immediate' },
      viewerId: labId(8000, 1), draftsAvailable: old.reviewAvailable !== false, savedDrafts: [] })
  } catch { return null }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const revision = (value: unknown) => value === null || typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const sameRevision = (left: string | null, right: string | null) => left === null || right === null ? left === right : Date.parse(left) === Date.parse(right)
const score = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000
const error = (message: string, code: GradingDraftError['code'] = 'validation'): GradingDraftError => ({ error: message, code })

function normalize(input: SaveGradingDraftsInput, publish: boolean): GradingDraftItem[] | GradingDraftError {
  if (!input || !uuid.test(input.assignmentId) || !uuid.test(input.requestId) || !Array.isArray(input.items) || !input.items.length || input.items.length > 5000) return error('ข้อมูลร่างคะแนนไม่ถูกต้อง')
  const ids = new Set<string>()
  const items: GradingDraftItem[] = []
  for (const item of input.items) {
    if (!item || !uuid.test(item.answerId) || ids.has(item.answerId) || !revision(item.expectedScoreEditedAt) || !revision(item.expectedDraftUpdatedAt)) return error('ข้อมูลคะแนนหรือรุ่นร่างไม่ถูกต้อง')
    ids.add(item.answerId)
    const answer = Object.hasOwn(item, 'answerScore'), work = Object.hasOwn(item, 'workScore'), remove = item.remove === true
    if (Object.hasOwn(item, 'remove') && !remove || remove && (publish || answer || work) || !remove && !answer && !work
      || answer && !score(item.answerScore) || work && !score(item.workScore)) return error('กรุณาตรวจคะแนนก่อนบันทึก')
    items.push({ answerId: item.answerId, expectedScoreEditedAt: item.expectedScoreEditedAt, expectedDraftUpdatedAt: item.expectedDraftUpdatedAt,
      ...(remove ? { remove: true as const } : {}), ...(answer ? { answerScore: item.answerScore } : {}), ...(work ? { workScore: item.workScore } : {}) })
  }
  return items.sort((a, b) => a.answerId.localeCompare(b.answerId))
}

function validate(state: GradingLabState, input: SaveGradingDraftsInput, items: GradingDraftItem[]): GradingDraftError | undefined {
  if (input.assignmentId !== state.data.assignment.id) return error('ไม่พบงานจำลองนี้', 'permission')
  for (const item of items) {
    const answer = state.data.answers.find(row => row.id === item.answerId)
    if (!answer) return error('ไม่พบคำตอบในงานจำลองนี้', 'permission')
    const draft = state.privateDrafts.find(row => row.graderId === state.data.viewerId && row.answerId === item.answerId)
    if (!sameRevision(draft?.updatedAt ?? null, item.expectedDraftUpdatedAt)) return error('ร่างคะแนนเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด', 'conflict')
    // Removing an exact saved draft must also work after its published base
    // changed; otherwise a stale draft could never be discarded.
    if (item.remove) continue
    if (!sameRevision(answer.scoreEditedAt, item.expectedScoreEditedAt)) return error('คะแนนเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด', 'conflict')
    const student = state.data.students.find(row => row.id === answer.studentId)
    const question = state.data.questions.find(row => row.id === answer.questionId)
    if (!question || answer.isVoid || answer.maxScore <= 0 || !student || !['submitted', 'graded'].includes(student.status ?? '')) return error('ไม่สามารถแก้คะแนนคำตอบนี้ได้')
    const parts = scoreParts(answer, question)
    for (const [key, part] of [['answerScore', parts.answer], ['workScore', parts.work]] as const) {
      if (Object.hasOwn(item, key) && (!part.enabled || !score(item[key]) || item[key]! > part.maxScore)) return error('คะแนนไม่อยู่ในช่วงคะแนนเต็มของส่วนนี้')
    }
  }
}

function receiptKey(state: GradingLabState, input: SaveGradingDraftsInput) { return [state.data.viewerId, input.assignmentId, input.requestId].join(':') }
function timestamp(state: GradingLabState, now: number) {
  return new Date(Math.max(now, Date.parse(LAB_TIME), ...state.data.answers.map(row => Date.parse(row.scoreEditedAt ?? LAB_TIME) + 1), ...state.privateDrafts.map(row => Date.parse(row.updatedAt) + 1))).toISOString()
}
function publishAnswer(answer: GradingAnswer, item: GradingDraftItem, time: string, viewerId: string): GradingAnswer {
  const next = { ...answer, scoreEditedAt: time, scoreEditedBy: viewerId }
  if (item.answerScore !== undefined) {
    const max = answer.answerMaxScore ?? answer.maxScore
    next.answerScore = Math.min(max, Math.round(item.answerScore * 100) / 100)
    next.answerReviewedAt = time
    next.isCorrect = Math.round(item.answerScore * 100) / 100 >= max
  }
  if (item.workScore !== undefined) {
    next.workScore = Math.min(answer.workMaxScore ?? 0, Math.round(item.workScore * 100) / 100)
    next.workReviewedAt = time
  }
  next.score = Math.min(next.maxScore, Math.round(((next.answerScore ?? next.score) + (next.workScore ?? 0)) * 100) / 100)
  return next
}

function transition(state: GradingLabState, input: SaveGradingDraftsInput, publish: boolean, now: number): Transition<SaveGradingDraftsResult | PublishGradingDraftsResult> {
  if (state.data.reviewAvailable === false || !state.data.draftsAvailable) return { state, result: error('ระบบบันทึกร่างและเผยแพร่คะแนนยังไม่พร้อม', 'unavailable') }
  const items = normalize(input, publish)
  if (!Array.isArray(items)) return { state, result: items }
  const key = receiptKey(state, input), payload = JSON.stringify({ publish, assignmentId: input.assignmentId, items })
  const receipt = state.receipts[key]
  if (receipt) return { state, result: receipt.payload === payload ? receipt.result : error('รหัสการบันทึกนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาลองใหม่', 'conflict') }
  const invalid = validate(state, input, items)
  if (invalid) return { state, result: invalid }
  const time = timestamp(state, now)
  const ids = new Set(items.map(item => item.answerId))
  const otherDrafts = state.privateDrafts.filter(row => row.graderId !== state.data.viewerId || !ids.has(row.answerId))
  let next: GradingLabState
  let result: SaveGradingDraftsResult | PublishGradingDraftsResult
  if (publish) {
    const inputById = new Map(items.map(item => [item.answerId, item]))
    const answers = state.data.answers.map(answer => { const item = inputById.get(answer.id); return item ? publishAnswer(answer, item, time, state.data.viewerId) : answer })
    const changed = answers.filter(answer => ids.has(answer.id))
    const notificationCount = new Set(changed.map(answer => answer.studentId)).size
    result = { success: true, requestId: input.requestId, published: changed.map(answer => ({ answerId: answer.id, submissionId: answer.submissionId, scoreEditedAt: time })), deletedDraftIds: [...ids], notificationCount }
    next = { ...state, data: recomputeLab({ ...state.data, answers }), privateDrafts: otherDrafts, notificationCount: state.notificationCount + notificationCount }
  } else {
    const drafts: GradingSavedDraft[] = items.filter(item => !item.remove).map(item => ({ answerId: item.answerId, expectedScoreEditedAt: item.expectedScoreEditedAt, updatedAt: time,
      ...(item.answerScore !== undefined ? { answerScore: item.answerScore } : {}), ...(item.workScore !== undefined ? { workScore: item.workScore } : {}) }))
    result = { success: true, requestId: input.requestId, drafts, deletedDraftIds: items.filter(item => item.remove).map(item => item.answerId) }
    next = { ...state, privateDrafts: [...otherDrafts, ...drafts.map(draft => ({ ...draft, graderId: state.data.viewerId }))] }
  }
  next = { ...next, receipts: { ...next.receipts, [key]: { payload, result } } }
  next.data = projectLabData(next)
  return { state: next, result }
}

export function saveLabDrafts(state: GradingLabState, input: SaveGradingDraftsInput, now = Date.now()): Transition<SaveGradingDraftsResult> {
  return transition(state, input, false, now) as Transition<SaveGradingDraftsResult>
}
export function publishLabDrafts(state: GradingLabState, input: PublishGradingDraftsInput, now = Date.now()): Transition<PublishGradingDraftsResult> {
  if (input.confirmed !== true) return { state, result: error('กรุณายืนยันเผยแพร่คะแนนก่อน') }
  return transition(state, input, true, now) as Transition<PublishGradingDraftsResult>
}
