import { describe, expect, it } from 'vitest'
import {
  parseAnswerBackup,
  sameAnswerPayload,
  selectRestorableAnswerBackup,
  serializeAnswerBackup,
} from './answer-backup'

describe('answer autosave backup', () => {
  it('round-trips answer text and DEG/RAD metadata together', () => {
    const raw = serializeAnswerBackup(new Map([
      ['answer-1', { value: 'sin(pi/6)', mathInputModes: { main: 'rad' as const } }],
    ]))
    expect(parseAnswerBackup(raw)).toEqual({
      'answer-1': { value: 'sin(pi/6)', mathInputModes: { main: 'rad' } },
    })
  })

  it('restores legacy text-only backups as DEG-compatible empty metadata', () => {
    expect(parseAnswerBackup(JSON.stringify({ a: '30', b: '' }))).toEqual({
      a: { value: '30', mathInputModes: {} },
      b: { value: '', mathInputModes: {} },
    })
  })

  it('drops malformed mode metadata without dropping the answer', () => {
    expect(parseAnswerBackup(JSON.stringify({
      version: 2,
      entries: { a: { value: 'sin(30)', mathInputModes: { main: 'degrees' } } },
    }))).toEqual({ a: { value: 'sin(30)', mathInputModes: {} } })
  })

  it('compares both text and mode metadata', () => {
    const value = { value: 'sin(30)', mathInputModes: { main: 'deg' as const } }
    expect(sameAnswerPayload(value, value)).toBe(true)
    expect(sameAnswerPayload(value, { ...value, mathInputModes: { main: 'rad' } })).toBe(false)
  })

  it('restores only changed rows that still belong to the current attempt', () => {
    const restored = selectRestorableAnswerBackup({
      current: { value: '42', mathInputModes: { main: 'rad' } },
      unchanged: { value: '7', mathInputModes: {} },
      stale: { value: 'answer from an older attempt', mathInputModes: {} },
    }, {
      current: '',
      unchanged: '7',
    }, {
      current: { main: 'deg' },
      unchanged: {},
    })

    expect(restored).toEqual({
      current: { value: '42', mathInputModes: { main: 'rad' } },
    })
  })
})

it('rejects stale or legacy random-question drafts after a number set changes', () => {
  const entries = {
    a: { value: '10', mathInputModes: {}, randomValues: { x: 5 } },
    b: { value: '10', mathInputModes: {} },
    c: { value: '14', mathInputModes: {}, randomValues: { x: 7 } },
  }
  expect(selectRestorableAnswerBackup(entries, { a: '', b: '', c: '' }, {}, { a: { x: 7 }, b: { x: 7 }, c: { x: 7 } })).toEqual({ c: entries.c })
  expect(parseAnswerBackup(serializeAnswerBackup(Object.entries(entries))).c.randomValues).toEqual({ x: 7 })
})
