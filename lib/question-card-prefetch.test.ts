import { describe, it, expect } from 'vitest'
import { nextCardDataBatch } from './question-card-prefetch'

const ids = (count: number, prefix = 'q') => Array.from({ length: count }, (_, index) => `${prefix}${index}`)

describe('nextCardDataBatch', () => {
  it('asks for nothing before any row is on screen', () => {
    expect(nextCardDataBatch(ids(10), new Set(), new Set())).toEqual([])
  })

  it('asks for the rows on screen first, then fills the batch with the rows after them', () => {
    const list = ids(100)
    const batch = nextCardDataBatch(list, new Set(['q3', 'q4', 'q5']), new Set(), { max: 10 })
    expect(batch).toEqual(['q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12'])
  })

  it('skips what is already asked for', () => {
    const list = ids(30)
    const requested = new Set(['q0', 'q1', 'q3'])
    const batch = nextCardDataBatch(list, new Set(['q0', 'q1', 'q2', 'q3']), requested, { max: 4 })
    expect(batch).toEqual(['q2', 'q4', 'q5', 'q6'])
  })

  it('waits while the screen and the lookahead past it are covered', () => {
    const list = ids(100)
    const requested = new Set(list.slice(0, 30))
    expect(nextCardDataBatch(list, new Set(['q2', 'q3']), requested, { lookahead: 20 })).toEqual([])
  })

  it('reads ahead once an unread row comes within the lookahead', () => {
    const list = ids(100)
    const requested = new Set(list.slice(0, 30))
    const batch = nextCardDataBatch(list, new Set(['q12', 'q13']), requested, { lookahead: 20, max: 5 })
    expect(batch).toEqual(['q30', 'q31', 'q32', 'q33', 'q34'])
  })

  it('fills the rest from the rows above when the list ends below', () => {
    const list = ids(20)
    const requested = new Set(list.slice(10))
    const batch = nextCardDataBatch(list, new Set(['q9']), requested, { max: 4 })
    expect(batch).toEqual(['q9', 'q8', 'q7', 'q6'])
  })

  it('asks for a question once when it is listed twice', () => {
    // The review copy of a pick sits above the same question's bank row.
    const list = ['q2', 'q5', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5']
    const batch = nextCardDataBatch(list, new Set(['q2', 'q5']), new Set(), { max: 60 })
    expect(batch).toEqual(['q2', 'q5', 'q0', 'q1', 'q3', 'q4'])
  })

  it('never returns more than the server will read in one call', () => {
    const batch = nextCardDataBatch(ids(500), new Set(['q0']), new Set())
    expect(batch).toHaveLength(60)
  })
})
