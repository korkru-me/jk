import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { formatThaiDate, formatThaiDateTime, thaiHour } from './thai-time'

// 16:00 on 3 ต.ค. 2569 in Thailand, which is 09:00 in UTC.
const afternoon = '2026-10-03T09:00:00Z'
// The midnight that starts 3 ต.ค. in Thailand — still 2 ต.ค. in UTC.
const midnight = '2026-10-02T17:00:00Z'

// UTC is what Vercel runs server code in; Los Angeles is behind UTC, so a date
// that leaked the process zone would land on a different day there too.
describe.each(['UTC', 'America/Los_Angeles'])('with the process in %s', zone => {
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.TZ
    process.env.TZ = zone
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  })

  // Without this, a machine in Thailand would pass every case below without
  // the zone switch ever taking effect.
  it('really is running outside Thailand', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone)
    expect(new Date(afternoon).toLocaleString('th-TH')).not.toContain('16:00')
  })

  it('prints a deadline at its Thai clock time', () => {
    expect(formatThaiDateTime(afternoon)).toBe('3 ต.ค. 2569 16:00')
    expect(formatThaiDateTime(new Date(afternoon), { dateStyle: 'long', timeStyle: 'short' }))
      .toBe('3 ตุลาคม 2569 เวลา 16:00')
  })

  it('puts a midnight deadline on its Thai day', () => {
    expect(formatThaiDate(midnight)).toBe('3 ต.ค. 2569')
    expect(formatThaiDate(midnight, { dateStyle: 'short' })).toBe('3/10/69')
    expect(formatThaiDate(midnight, { day: 'numeric', month: 'short', year: '2-digit' })).toBe('3 ต.ค. 69')
  })

  it('keeps a date-only label free of a clock time', () => {
    expect(formatThaiDate(afternoon, { dateStyle: 'long' })).toBe('3 ตุลาคม 2569')
  })

  it('reads the hour off a Thai clock', () => {
    expect(thaiHour(afternoon)).toBe(16)
    expect(thaiHour(midnight)).toBe(0)
  })
})

it('says "Invalid Date" for a bad value rather than throwing', () => {
  expect(formatThaiDate('not a date')).toBe('Invalid Date')
  expect(formatThaiDateTime('not a date')).toBe('Invalid Date')
})
