import { describe, expect, it } from 'vitest'
import {
  attemptItemHasSolution,
  buildAttemptSolutionItems,
  fillRandomValues,
  type AttemptSolutionQuestion,
  type AttemptSolutionRow,
} from './attempt-solutions'

function question(over: Partial<AttemptSolutionQuestion> = {}): AttemptSolutionQuestion {
  return {
    title: 'โปรเจกไทล์',
    question_text: '<p>ขว้างลูกบอลด้วยความเร็ว {u} m/s</p>',
    image_urls: null,
    solution_text: '<p>t = {u} / g</p>',
    solution_image_urls: [],
    ...over,
  }
}

function row(id: string, orderIndex: number | null, over: Partial<AttemptSolutionRow> = {}): AttemptSolutionRow {
  return { id, order_index: orderIndex, random_values: { u: 12 }, questions: question(), ...over }
}

describe('fillRandomValues', () => {
  it('writes the attempt’s numbers in and leaves unknown names alone', () => {
    expect(fillRandomValues('{u} และ {g}', { u: 12 })).toBe('12 และ {g}')
    expect(fillRandomValues('{u}', null)).toBe('{u}')
  })

  it('does not treat inherited object keys as variables', () => {
    expect(fillRandomValues('{constructor}', { u: 1 })).toBe('{constructor}')
  })
})

describe('buildAttemptSolutionItems', () => {
  it('numbers the ข้อ in the order the summary page lists them', () => {
    const items = buildAttemptSolutionItems([row('c', 2), row('a', 0), row('none', null), row('b', 1)])
    expect(items.map(item => [item.answerId, item.number])).toEqual([
      ['a', 1], ['b', 2], ['c', 3], ['none', 4],
    ])
  })

  it('fills this attempt’s numbers into both the โจทย์ and the เฉลย', () => {
    const [item] = buildAttemptSolutionItems([row('a', 0)])
    expect(item.questionText).toBe('<p>ขว้างลูกบอลด้วยความเร็ว 12 m/s</p>')
    expect(item.solutionText).toBe('<p>t = 12 / g</p>')
  })

  it('counts a ข้อ with only files as having a เฉลย, and an emptied box as not', () => {
    const [filesOnly, emptied] = buildAttemptSolutionItems([
      row('files', 0, { questions: question({ solution_text: null, solution_image_urls: ['https://x.test/a.pdf'] }) }),
      row('empty', 1, { questions: question({ solution_text: '<p></p><p> </p>' }) }),
    ])
    expect(attemptItemHasSolution(filesOnly)).toBe(true)
    expect(filesOnly.solutionText).toBeNull()
    expect(attemptItemHasSolution(emptied)).toBe(false)
  })

  it('reads a to-one embed that came back as a list', () => {
    const [item] = buildAttemptSolutionItems([row('a', 0, { questions: [question({ title: 'ลิสต์' })] })])
    expect(item.title).toBe('ลิสต์')
  })

  it('keeps the numbering when a โจทย์ has since been deleted', () => {
    const items = buildAttemptSolutionItems([row('gone', 0, { questions: null }), row('b', 1)])
    expect(items[0]).toMatchObject({ number: 1, questionText: null, solutionText: null, solutionFiles: [] })
    expect(attemptItemHasSolution(items[0])).toBe(false)
    expect(items[1].number).toBe(2)
  })
})
