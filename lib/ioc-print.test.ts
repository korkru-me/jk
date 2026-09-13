import { describe, expect, it } from 'vitest'
import {
  buildIocPrintRows,
  groupRowsByStandard,
  iocPrintDocAvailability,
  parseIocPrintOptions,
  serializeIocPrintOptions,
  type IocPrintItemInput,
} from '@/lib/ioc-print'

function item(overrides: Partial<IocPrintItemInput> & { id: string }): IocPrintItemInput {
  return {
    item_label: overrides.id,
    section_label: '',
    group_intro: '',
    prompt: 'โจทย์',
    choices: [],
    standard_id: null,
    ...overrides,
  }
}

describe('parseIocPrintOptions', () => {
  it('defaults to the blank form with everything a form normally shows', () => {
    const options = parseIocPrintOptions({})
    expect(options).toMatchObject({
      doc: 'blank',
      expertId: null,
      authorSignature: true,
      showComments: true,
      showCriteria: true,
      watermark: true,
    })
    // Nobody has signed a blank form, so there is no expert signature to place.
    expect(options.expertSignature).toBe(false)
  })

  it('leaves the watermark off the summary, which is an appendix not a copy', () => {
    expect(parseIocPrintOptions({ doc: 'summary' }).watermark).toBe(false)
    expect(parseIocPrintOptions({ doc: 'summary', watermark: '1' }).watermark).toBe(true)
  })

  it('reads the flags a teacher turned off', () => {
    const options = parseIocPrintOptions({
      doc: 'expert',
      expert: 'expert-1',
      author_sig: '0',
      comments: '0',
      criteria: '0',
    })
    expect(options).toMatchObject({
      doc: 'expert',
      expertId: 'expert-1',
      authorSignature: false,
      expertSignature: true,
      showComments: false,
      showCriteria: false,
    })
  })

  it('falls back to the blank form for a document it does not know', () => {
    expect(parseIocPrintOptions({ doc: 'something-else' }).doc).toBe('blank')
  })

  it('survives a round trip through the query string', () => {
    const options = parseIocPrintOptions({ doc: 'book', expert: 'e1', comments: '0' })
    const restored = parseIocPrintOptions(
      Object.fromEntries(new URLSearchParams(serializeIocPrintOptions(options))),
    )
    expect(restored).toEqual(options)
  })
})

describe('buildIocPrintRows', () => {
  it('leaves every box empty on a blank form', () => {
    const rows = buildIocPrintRows([item({ id: 'a' }), item({ id: 'b' })], [])
    expect(rows.map(row => row.tick)).toEqual([null, null])
    expect(rows.map(row => row.comment)).toEqual(['', ''])
  })

  it("carries one expert's ticks and suggestions onto their copy", () => {
    const rows = buildIocPrintRows(
      [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })],
      [
        { item_id: 'a', score: 1, comment: '' },
        { item_id: 'c', score: -1, comment: 'ควรปรับคำถาม' },
      ],
    )
    expect(rows.map(row => row.tick)).toEqual([1, null, -1])
    expect(rows[2].comment).toBe('ควรปรับคำถาม')
  })
})

describe('groupRowsByStandard', () => {
  it('merges consecutive rows that share an indicator', () => {
    const runs = groupRowsByStandard([
      { standardId: 's1' },
      { standardId: 's1' },
      { standardId: 's2' },
      { standardId: 's1' },
    ])
    expect(runs.map(run => [run.standardId, run.rows.length])).toEqual([
      ['s1', 2],
      ['s2', 1],
      ['s1', 1],
    ])
  })

  it('keeps unmatched rows together as their own run', () => {
    const runs = groupRowsByStandard([{ standardId: null }, { standardId: null }])
    expect(runs).toHaveLength(1)
    expect(runs[0].rows).toHaveLength(2)
  })

  it('returns nothing for an empty page', () => {
    expect(groupRowsByStandard([])).toEqual([])
  })
})

describe('iocPrintDocAvailability', () => {
  it('offers only the blank form before anyone has judged', () => {
    const availability = iocPrintDocAvailability({ hasItems: true, submittedExpertCount: 0 })
    expect(availability.blank.available).toBe(true)
    expect(availability.expert.available).toBe(false)
    expect(availability.summary.reason).toBe('ยังไม่มีผลประเมินให้สรุป')
  })

  it('offers everything once one expert has sent theirs', () => {
    const availability = iocPrintDocAvailability({ hasItems: true, submittedExpertCount: 1 })
    expect(Object.values(availability).every(entry => entry.available)).toBe(true)
  })

  it('offers nothing printable when the form has no exam yet', () => {
    const availability = iocPrintDocAvailability({ hasItems: false, submittedExpertCount: 0 })
    expect(availability.blank.reason).toBe('ยังไม่ได้เลือกข้อสอบเข้าฟอร์ม')
    expect(availability.book.available).toBe(false)
  })
})
