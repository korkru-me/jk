import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { contentFingerprint, withContentFingerprint } from './question-fingerprint'
import { questionFingerprint } from './question-content-match'

const question = {
  question_text: '<p>แรง F ขนาด 10 นิวตัน กระทำกับวัตถุ</p>',
  question_type: 'written',
  answer_formula: 'F*s',
  answer_unit: 'จูล',
  answer_tolerance: 0.05,
}

describe('contentFingerprint', () => {
  it('is stable for the same content', () => {
    expect(contentFingerprint(question)).toBe(contentFingerprint({ ...question }))
  })

  it('carries the rules of questionFingerprint — labels do not change it', () => {
    const a = { ...question, title: 'งาน ง่าย', tags: ['งาน'], difficulty: 'easy' }
    const b = { ...question, title: 'งานติดลบ', tags: ['กลศาสตร์ 2'], difficulty: 'hard' }
    expect(contentFingerprint(a)).toBe(contentFingerprint(b))
  })

  it('separates questions that ask for a different answer', () => {
    expect(contentFingerprint(question))
      .not.toBe(contentFingerprint({ ...question, answer_formula: 'F*s*2' }))
  })

  it('is the hash the backfill script computes inline', () => {
    // scripts/backfill-content-fingerprint.mjs cannot import this module (it
    // resolves '@/...' paths), so it repeats this one line. If the algorithm
    // here ever changes, the backfill would quietly write fingerprints that no
    // saved question could ever match.
    const expected = createHash('sha256').update(questionFingerprint(question)).digest('hex')
    expect(contentFingerprint(question)).toBe(expected)
  })
})

describe('withContentFingerprint', () => {
  it('keeps the payload intact and adds the column', () => {
    const payload = { ...question, title: 'งาน', org_id: 'org-1' }
    const stamped = withContentFingerprint(payload)

    expect(stamped).toMatchObject(payload)
    expect(stamped.content_fingerprint).toBe(contentFingerprint(payload))
  })

  it('accepts a partial payload — a group parent sets only some content columns', () => {
    const parent = {
      question_text: '<p>ใช้ข้อมูลต่อไปนี้ตอบข้อ 1–3</p>',
      question_type: 'written' as const,
      is_random: false,
      variables: [],
      answer_formula: '',
      answer_unit: null,
      answer_tolerance: 0.01,
    }
    expect(withContentFingerprint(parent).content_fingerprint).toHaveLength(64)
  })

  it('agrees with the fingerprint read back off the stored row', () => {
    // The write paths fingerprint the payload they are about to send; the
    // backfill fingerprints the row Postgres hands back. Absent columns and
    // columns stored as NULL have to reach the same answer, or a saved question
    // and a backfilled one would never recognise each other as twins.
    const written = withContentFingerprint(question).content_fingerprint
    const readBack = contentFingerprint({
      ...question,
      image_urls: null,
      mcq_options: null,
      answer_parts: null,
      variables: null,
      logic_rules: null,
      extra_data: {},
    })
    expect(readBack).toBe(written)
  })
})
