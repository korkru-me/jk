import { describe, it, expect } from 'vitest'
import { parseDocx } from './index'
import { preflight } from './preflight'
import { AUTO_PROFILE, PROFILE_BY_TYPE } from './profiles'
import { packSampleDocx } from './sample-docx'
import type { DraftQuestion, DraftResult, NumberingSource } from './draft'

function question(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    id: 'q-1', number: 1, type: 'mcq', title: 'โจทย์', html: '<p>โจทย์</p>',
    choices: [
      { id: 'c1', text: 'ก', isCorrect: true },
      { id: 'c2', text: 'ข', isCorrect: false },
    ],
    parts: [], answers: [], blanks: [], statements: [], orderItems: [], orderChoices: [],
    imageRelIds: [], mentionsPicture: false, warnings: [],
    ...overrides,
  }
}

function result(questions: DraftQuestion[], numbering: NumberingSource = 'list'): DraftResult {
  return { questions, preamble: [], numbering, floatingImageRelIds: [] }
}

const checkFor = (report: ReturnType<typeof preflight>, ruleId: string) =>
  report.checks.find(check => check.ruleId === ruleId)

describe('reading a file against the format the teacher chose', () => {
  it('fails on the numbering rule when nothing could be split apart', () => {
    const report = preflight(result([], 'none'), PROFILE_BY_TYPE.mcq)

    expect(report.readable).toBe(false)
    expect(checkFor(report, 'numbering')?.status).toBe('fail')
    // Nothing else is worth saying about a file no โจทย์ came out of.
    expect(report.checks).toHaveLength(1)
  })

  it('accepts typed numbers but says what will go wrong later', () => {
    const report = preflight(result([question()], 'typed'), PROFILE_BY_TYPE.mcq)

    expect(report.readable).toBe(true)
    expect(checkFor(report, 'numbering')?.status).toBe('warn')
    expect(checkFor(report, 'numbering')?.detail).toContain('แทรกข้อกลางไฟล์')
  })

  it('names the ข้อ that came back without ตัวเลือก when ปรนัย was chosen', () => {
    const report = preflight(result([
      question({ number: 1 }),
      question({ id: 'q-2', number: 2, type: 'essay', choices: [] }),
      question({ id: 'q-3', number: 3, type: 'essay', choices: [] }),
    ]), PROFILE_BY_TYPE.mcq)

    const check = checkFor(report, 'choices')
    expect(check?.status).toBe('fail')
    expect(check?.detail).toContain('ข้อ 2, 3')
  })

  it('treats a mixed file as normal for the automatic reader', () => {
    // The same file, read under the profile made for it: โจทย์ without
    // ตัวเลือก are อัตนัย, not a formatting mistake.
    const report = preflight(result([
      question({ number: 1 }),
      question({ id: 'q-2', number: 2, type: 'essay', choices: [] }),
    ]), AUTO_PROFILE)

    expect(checkFor(report, 'choices')?.status).toBe('pass')
    expect(checkFor(report, 'choices')?.detail).toContain('ข้อเขียน 1 ข้อ')
  })

  it('points at the ข้อ whose เฉลย was never marked', () => {
    const report = preflight(result([
      question({ number: 1 }),
      question({
        id: 'q-2', number: 2,
        choices: [{ id: 'c1', text: 'ก', isCorrect: false }, { id: 'c2', text: 'ข', isCorrect: false }],
      }),
    ]), PROFILE_BY_TYPE.mcq)

    const check = checkFor(report, 'answer-mark')
    expect(check?.status).toBe('warn')
    expect(check?.detail).toContain('ข้อ 2')
    expect(report.needsAttention).toBe(1)
  })

  it('names the ข้อ whose เฉลย bracket was missing', () => {
    const report = preflight(result([
      question({ number: 1, type: 'written', choices: [] }),
      question({ id: 'q-2', number: 2, type: 'essay', choices: [] }),
    ]), PROFILE_BY_TYPE.written)

    const check = checkFor(report, 'answer-position')
    expect(check?.status).toBe('warn')
    expect(check?.detail).toContain('ข้อ 2')
  })

  it('treats a ข้อ with no เฉลย as ordinary for the automatic reader', () => {
    const report = preflight(result([
      question({ number: 1, type: 'written', choices: [] }),
      question({ id: 'q-2', number: 2, type: 'essay', choices: [] }),
    ]), AUTO_PROFILE)

    expect(checkFor(report, 'answer-position')?.status).toBe('pass')
  })

  it('only reports rules the chosen format actually has', () => {
    // บรรยาย has no เฉลย to mark and no ตัวเลือก to find, so a report that
    // graded it on either would be inventing a failure.
    const report = preflight(result([question({ type: 'essay', choices: [] })]), PROFILE_BY_TYPE.essay)

    expect(checkFor(report, 'choices')).toBeUndefined()
    expect(checkFor(report, 'answer-mark')).toBeUndefined()
    expect(checkFor(report, 'numbering')?.status).toBe('pass')
  })

  it('passes every check on the sample file the app hands out', async () => {
    // The example a teacher downloads must not come back with advice on it.
    for (const profile of [PROFILE_BY_TYPE.mcq, PROFILE_BY_TYPE.essay, AUTO_PROFILE]) {
      const parsed = await parseDocx(new Uint8Array(await packSampleDocx(profile)))
      const report = preflight(parsed, profile)

      expect(report.readable, profile.slug).toBe(true)
      expect(report.checks.filter(check => check.status !== 'pass'), profile.slug).toEqual([])
      expect(report.needsAttention, profile.slug).toBe(0)
    }
  })
})

describe('reading a file against the เรียงลำดับ format', () => {
  const ordering = PROFILE_BY_TYPE.ordering

  const item = (overrides: Partial<DraftQuestion> = {}) => question({
    type: 'ordering', choices: [], orderItems: ['ก', 'ข', 'ค'], ...overrides,
  })

  it('names the ข้อ that came back with nothing to arrange', () => {
    const report = preflight(result([
      item(),
      item({ id: 'q-2', number: 2, orderItems: [] }),
    ]), ordering)

    const check = checkFor(report, 'order-items')
    expect(check?.status).toBe('fail')
    expect(check?.detail).toContain('ข้อ 2')
  })

  it('treats a worksheet with no orders offered as already answered', () => {
    const report = preflight(result([item(), item({ id: 'q-2', number: 2 })]), ordering)

    expect(checkFor(report, 'order-items')?.status).toBe('pass')
    expect(checkFor(report, 'order-key')?.status).toBe('pass')
    expect(report.needsAttention).toBe(0)
  })

  it('asks for the order on the ข้อ whose paper offered one and marked none', () => {
    const report = preflight(result([
      item({ orderChoices: [{ order: [2, 1, 3], isCorrect: true }] }),
      item({ id: 'q-2', number: 2, orderChoices: [{ order: [3, 2, 1], isCorrect: false }] }),
    ]), ordering)

    const check = checkFor(report, 'order-key')
    expect(check?.status).toBe('warn')
    expect(check?.detail).toContain('ข้อ 2')
    expect(report.needsAttention).toBe(1)
  })

  it('passes the sample file this profile hands out, with nothing to check', async () => {
    const parsed = await parseDocx(new Uint8Array(await packSampleDocx(ordering)), { expect: 'ordering' })
    const report = preflight(parsed, ordering)

    expect(report.readable).toBe(true)
    expect(report.checks.every(check => check.status === 'pass')).toBe(true)
    expect(report.needsAttention).toBe(0)
  })
})
