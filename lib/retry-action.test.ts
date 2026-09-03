import { describe, it, expect } from 'vitest'
import { callIdempotentAction } from './retry-action'

// The distinction this file exists to protect: a thrown call is a dropped
// request and gets another go; a call that returned is an answer, even when
// the answer is a refusal. Getting that backwards is what told a student on an
// iPad with a working connection to go check their internet.
const noSleep = async () => {}

describe('callIdempotentAction', () => {
  it('returns the first successful result without retrying', async () => {
    let calls = 0
    const result = await callIdempotentAction(async () => { calls++; return { success: true } }, { sleep: noSleep })
    expect(result).toEqual({ ok: true, data: { success: true } })
    expect(calls).toBe(1)
  })

  it('retries a dropped request and reports the attempt that landed', async () => {
    let calls = 0
    const result = await callIdempotentAction(async () => {
      calls++
      if (calls < 3) throw new TypeError('Load failed')
      return { success: true }
    }, { sleep: noSleep })
    expect(result).toEqual({ ok: true, data: { success: true } })
    expect(calls).toBe(3)
  })

  it('gives up after the configured number of attempts', async () => {
    let calls = 0
    const result = await callIdempotentAction(async () => { calls++; throw new TypeError('Load failed') }, {
      attempts: 2,
      sleep: noSleep,
    })
    expect(result).toEqual({ ok: false })
    expect(calls).toBe(2)
  })

  it('does not retry an action that answered with a refusal', async () => {
    let calls = 0
    const result = await callIdempotentAction(async () => { calls++; return { error: 'ส่งงานแล้ว' } }, { sleep: noSleep })
    expect(result).toEqual({ ok: true, data: { error: 'ส่งงานแล้ว' } })
    expect(calls).toBe(1)
  })

  it('backs off further after each failure', async () => {
    const waited: number[] = []
    await callIdempotentAction(async () => { throw new Error('nope') }, {
      attempts: 3,
      backoffMs: 400,
      sleep: async ms => { waited.push(ms) },
    })
    expect(waited).toEqual([400, 800])
  })
})
