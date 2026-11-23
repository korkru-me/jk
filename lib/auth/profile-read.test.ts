import { describe, expect, it } from 'vitest'
import { isProfileRowMissing } from './profile-read'

describe('profile auto-create guard', () => {
  it.each([null, undefined, { code: 'PGRST116' }])('allows recovery when the row is absent: %j', error => {
    expect(isProfileRowMissing(error)).toBe(true)
  })

  it.each([{ code: '' }, { code: '57014' }, { code: '53300' }, { code: 'PGRST000' }, { code: '42501' }, {}])(
    'never treats a failed read as a missing profile: %j',
    error => expect(isProfileRowMissing(error)).toBe(false),
  )
})
