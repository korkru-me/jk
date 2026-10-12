import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { formatThaiDate, formatThaiDateTime, startOfThaiDay, thaiDateStamp, thaiHour } from './thai-time'

// 16:00 on 3 ต.ค. 2569 in Thailand, which is 09:00 in UTC.
const afternoon = '2026-10-03T09:00:00Z'
// The midnight that starts 3 ต.ค. in Thailand — still 2 ต.ค. in UTC.
const midnight = '2026-10-02T17:00:00Z'
// 03:00 on 3 ต.ค. in Thailand, which is 20:00 on 2 ต.ค. in UTC.
const earlyMorning = '2026-10-02T20:00:00Z'

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

  it('stamps a file made at 03:00 with its Thai date, not the day before', () => {
    // What the IOC filenames used: the UTC day, whatever zone the code runs in.
    expect(new Date(earlyMorning).toISOString().slice(0, 10)).toBe('2026-10-02')
    expect(thaiDateStamp(earlyMorning)).toBe('2026-10-03')
    expect(thaiDateStamp(new Date(afternoon))).toBe('2026-10-03')
  })

  it('turns the stamp over at Thai midnight', () => {
    expect(thaiDateStamp('2026-10-02T16:59:59.999Z')).toBe('2026-10-02')
    expect(thaiDateStamp(midnight)).toBe('2026-10-03')
    // A Gregorian year for the filename, not 2570, even across New Year.
    expect(thaiDateStamp('2026-12-31T17:00:00Z')).toBe('2027-01-01')
  })

  it('starts today at Thai midnight, not the server’s', () => {
    // What the admin dashboard used: at 03:00 in Thailand, "today" began on the day before.
    const serverMidnight = new Date(new Date(earlyMorning).setHours(0, 0, 0, 0))
    expect(thaiDateStamp(serverMidnight)).toBe('2026-10-02')

    expect(startOfThaiDay(earlyMorning).toISOString()).toBe('2026-10-02T17:00:00.000Z')
    expect(startOfThaiDay(new Date(afternoon)).toISOString()).toBe('2026-10-02T17:00:00.000Z')
    expect(thaiHour(startOfThaiDay(afternoon))).toBe(0)
  })

  it('puts midnight itself in the day it starts', () => {
    expect(startOfThaiDay(midnight).toISOString()).toBe('2026-10-02T17:00:00.000Z')
    expect(startOfThaiDay('2026-10-02T16:59:59.999Z').toISOString()).toBe('2026-10-01T17:00:00.000Z')
  })
})

it('says "Invalid Date" for a bad value rather than throwing', () => {
  expect(formatThaiDate('not a date')).toBe('Invalid Date')
  expect(formatThaiDateTime('not a date')).toBe('Invalid Date')
})

it('throws on a bad value for a filename or a query, as toISOString did', () => {
  expect(() => thaiDateStamp('not a date')).toThrow(RangeError)
  expect(() => startOfThaiDay('not a date')).toThrow(RangeError)
})
