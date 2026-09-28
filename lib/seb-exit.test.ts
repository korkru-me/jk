import { describe, expect, it } from 'vitest'
import { shouldOfferSebExit } from './seb-exit'

describe('SEB post-submit exit visibility', () => {
  it('offers the native quit link only to the verified student attempt', () => {
    expect(shouldOfferSebExit({
      isOwnSubmission: true,
      secureBrowserMode: 'seb_required',
      secureBrowserVerifiedAt: '2026-09-23T04:00:00.000Z',
    })).toBe(true)

    expect(shouldOfferSebExit({
      isOwnSubmission: false,
      secureBrowserMode: 'seb_required',
      secureBrowserVerifiedAt: '2026-09-23T04:00:00.000Z',
    })).toBe(false)

    expect(shouldOfferSebExit({
      isOwnSubmission: true,
      secureBrowserMode: 'browser',
      secureBrowserVerifiedAt: '2026-09-23T04:00:00.000Z',
    })).toBe(false)

    expect(shouldOfferSebExit({
      isOwnSubmission: true,
      secureBrowserMode: 'seb_required',
      secureBrowserVerifiedAt: null,
    })).toBe(false)
  })
})
