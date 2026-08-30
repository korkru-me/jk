import { describe, it, expect } from 'vitest'
import {
  normalizeQuestionText,
  questionFingerprint,
  type QuestionContent,
} from './question-content-match'

function q(id: string, patch: Partial<QuestionContent> = {}): QuestionContent {
  return {
    id,
    question_text: '<p>แรง F ขนาด 10 นิวตัน กระทำกับวัตถุ</p>',
    question_type: 'written',
    answer_formula: 'F*s',
    answer_unit: 'จูล',
    answer_tolerance: 0.05,
    ...patch,
  }
}

describe('normalizeQuestionText', () => {
  it('ignores markup, spacing and case', () => {
    expect(normalizeQuestionText('<p>Work  <b>Done</b></p>\n')).toBe('work done')
  })
})

describe('questionFingerprint', () => {
  it('ignores the title and the tags — they are not part of the content', () => {
    const a = { ...q('a'), title: 'งาน ง่าย', tags: ['งาน'] } as QuestionContent
    const b = { ...q('b'), title: 'งานติดลบ', tags: ['กลศาสตร์ 2'] } as QuestionContent
    expect(questionFingerprint(a)).toBe(questionFingerprint(b))
  })

  it('ignores how the same wording was marked up', () => {
    expect(questionFingerprint(q('a', { question_text: '<p>แรง F ขนาด 10 นิวตัน กระทำกับวัตถุ</p>' })))
      .toBe(questionFingerprint(q('b', { question_text: 'แรง F ขนาด 10 นิวตัน  กระทำกับวัตถุ' })))
  })

  it('treats a different answer as a different question', () => {
    expect(questionFingerprint(q('a', { answer_formula: 'F*s' })))
      .not.toBe(questionFingerprint(q('b', { answer_formula: 'F*s*2' })))
  })

  it('treats different choices as a different question', () => {
    const opts = (text: string) => [{ text, is_correct: true }, { text: 'ข', is_correct: false }]
    expect(questionFingerprint(q('a', { question_type: 'mcq', mcq_options: opts('ก') })))
      .not.toBe(questionFingerprint(q('b', { question_type: 'mcq', mcq_options: opts('ค') })))
  })

  it('sees through the random ids the browser mints for choices and items', () => {
    const items = (id: string) => ({ items: [{ id, text: 'ขั้นที่ 1' }] })
    expect(questionFingerprint(q('a', { extra_data: items('k3f9x') })))
      .toBe(questionFingerprint(q('b', { extra_data: items('zz11q') })))
  })

  it('does not care whether "not set" was stored as null, empty string or empty array', () => {
    expect(questionFingerprint(q('a', { answer_unit: '', mcq_options: [] })))
      .toBe(questionFingerprint(q('b', { answer_unit: null, mcq_options: null })))
  })

  it('does not care what order Postgres hands back jsonb keys in', () => {
    expect(questionFingerprint(q('a', { extra_data: { mode: 'all', label_style: 'thai' } })))
      .toBe(questionFingerprint(q('b', { extra_data: { label_style: 'thai', mode: 'all' } })))
  })

  it('keeps image addresses byte for byte', () => {
    expect(questionFingerprint(q('a', { image_urls: ['https://x/Ab.png'] })))
      .not.toBe(questionFingerprint(q('b', { image_urls: ['https://x/ab.png'] })))
  })
})
