import { describe, it, expect } from 'vitest'
import {
  CLASSIFY_PREFIX, CLASSIFY_UNSET,
  classifyCellCount, classifyCorrectAnswer, classifyCorrectGrid, parseClassifyGrid,
} from './classify'
import type { ClassifyConfig } from '@/lib/types'

/** The worksheet this type was built for: three items, two ways of classifying each. */
const polymers: ClassifyConfig = {
  columns: [
    { id: 'origin', title: 'จำแนกตามแหล่งกำเนิด', options: ['พอลิเมอร์ธรรมชาติ', 'พอลิเมอร์สังเคราะห์'] },
    { id: 'monomer', title: 'จำแนกตามชนิดของมอนอเมอร์', options: ['โฮโมพอลิเมอร์', 'โคพอลิเมอร์'] },
  ],
  rows: [
    { id: 'r1', text: 'เนื้อหมู', answers: { origin: 0, monomer: 1 } },
    { id: 'r2', text: 'ยางรัดของ', answers: { origin: 1, monomer: 0 } },
    { id: 'r3', text: 'เชือกป่าน', answers: { origin: 0, monomer: 0 } },
  ],
}

describe('classifyCorrectGrid', () => {
  it('lays the teacher key out row-major, one entry per cell', () => {
    expect(classifyCorrectGrid(polymers)).toEqual([[0, 1], [1, 0], [0, 0]])
  })

  it('reads answers by column id, not by column position', () => {
    // A row that names its columns out of order still keys the right cells —
    // this is what makes reordering the columns safe.
    const reordered: ClassifyConfig = {
      ...polymers,
      rows: [{ id: 'r1', text: 'เนื้อหมู', answers: { monomer: 1, origin: 0 } }],
    }
    expect(classifyCorrectGrid(reordered)).toEqual([[0, 1]])
  })

  it('follows a column that moved rather than the cell that sat there', () => {
    const swapped: ClassifyConfig = { ...polymers, columns: [polymers.columns[1], polymers.columns[0]] }
    expect(classifyCorrectGrid(swapped)).toEqual([[1, 0], [0, 1], [0, 0]])
  })

  it('leaves a cell the teacher never keyed unset', () => {
    const partial: ClassifyConfig = {
      ...polymers,
      rows: [{ id: 'r1', text: 'เนื้อหมู', answers: { origin: 0 } }],
    }
    expect(classifyCorrectGrid(partial)).toEqual([[0, CLASSIFY_UNSET]])
  })

  it('unsets a key pointing past the end of its column', () => {
    // What a shortened option list, or a file import written by hand, leaves
    // behind. Grading it would credit nobody and cost the student a point.
    const stale: ClassifyConfig = {
      ...polymers,
      rows: [{ id: 'r1', text: 'เนื้อหมู', answers: { origin: 7, monomer: 1 } }],
    }
    expect(classifyCorrectGrid(stale)).toEqual([[CLASSIFY_UNSET, 1]])
  })

  it('refuses a key that is not a whole position', () => {
    const junk = {
      ...polymers,
      rows: [{ id: 'r1', text: 'เนื้อหมู', answers: { origin: 1.5, monomer: -3 } }],
    } as unknown as ClassifyConfig
    expect(classifyCorrectGrid(junk)).toEqual([[CLASSIFY_UNSET, CLASSIFY_UNSET]])
  })

  it('survives config shapes that never came from the form', () => {
    expect(classifyCorrectGrid(null)).toEqual([])
    expect(classifyCorrectGrid({})).toEqual([])
    expect(classifyCorrectGrid({ columns: [], rows: [] })).toEqual([])
    expect(classifyCorrectGrid({ columns: polymers.columns, rows: [{ id: 'r1', text: 'x' }] }))
      .toEqual([[CLASSIFY_UNSET, CLASSIFY_UNSET]])
  })
})

describe('classifyCellCount', () => {
  it('counts cells, not rows — that is what a point is worth', () => {
    expect(classifyCellCount(polymers)).toBe(6)
  })

  it('does not charge for a cell the teacher left unkeyed', () => {
    // The composite เติมคำ mistake in one line: a part counted toward the
    // maximum that the student was never given a way to answer.
    const partial: ClassifyConfig = {
      ...polymers,
      rows: [...polymers.rows, { id: 'r4', text: 'ถุงพลาสติก', answers: { origin: 1 } }],
    }
    expect(classifyCellCount(partial)).toBe(7)
  })

  it('is zero for a config with nothing keyed', () => {
    expect(classifyCellCount({ columns: polymers.columns, rows: [] })).toBe(0)
    expect(classifyCellCount(undefined)).toBe(0)
  })
})

describe('parseClassifyGrid', () => {
  it('reads back what the browser sent', () => {
    expect(parseClassifyGrid('[[0,1],[1,0]]')).toEqual([[0, 1], [1, 0]])
  })

  it('treats an empty or missing answer as an empty grid', () => {
    expect(parseClassifyGrid('')).toEqual([])
    expect(parseClassifyGrid('[]')).toEqual([])
  })

  it('degrades anything unreadable instead of throwing', () => {
    // One malformed answer must not take down the whole submission's grading pass.
    expect(parseClassifyGrid('[[0,1],')).toEqual([])
    expect(parseClassifyGrid('{"r1":0}')).toEqual([])
    expect(parseClassifyGrid('[[0,"1",null,2.5,-4]]')).toEqual([
      [0, CLASSIFY_UNSET, CLASSIFY_UNSET, CLASSIFY_UNSET, CLASSIFY_UNSET],
    ])
    expect(parseClassifyGrid('[0,1]')).toEqual([[], []])
  })
})

describe('classifyCorrectAnswer', () => {
  it('carries a prefix no other question type uses', () => {
    expect(classifyCorrectAnswer(polymers)).toBe('CLS:[[0,1],[1,0],[0,0]]')
    expect(CLASSIFY_PREFIX).toBe('CLS:')
    for (const other of ['TF:', 'FILL:', 'ORDER:', 'MATCH:', 'COMP:', 'MCQ:']) {
      expect(CLASSIFY_PREFIX.startsWith(other)).toBe(false)
      expect(other.startsWith(CLASSIFY_PREFIX)).toBe(false)
    }
  })

  it('round-trips through the parser it will be graded with', () => {
    const key = classifyCorrectAnswer(polymers)
    expect(parseClassifyGrid(key.slice(CLASSIFY_PREFIX.length))).toEqual(classifyCorrectGrid(polymers))
  })
})
