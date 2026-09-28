import { describe, expect, it } from 'vitest'
import {
  announcementLinks,
  appendAnnouncementLink,
  normalizeAnnouncementUrl,
  youtubeVideoId,
} from './announcement-links'

describe('normalizeAnnouncementUrl', () => {
  it('adds https to a bare web address', () => {
    expect(normalizeAnnouncementUrl('youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  it('rejects non-web schemes and malformed values', () => {
    expect(normalizeAnnouncementUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeAnnouncementUrl('not a url')).toBeNull()
  })
})

describe('youtubeVideoId', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])('recognizes %s', url => {
    expect(youtubeVideoId(url)).toBe('dQw4w9WgXcQ')
  })

  it('does not embed a lookalike host or malformed id', () => {
    expect(youtubeVideoId('https://youtube.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeVideoId('https://youtube.com/watch?v=short')).toBeNull()
  })
})

describe('announcementLinks', () => {
  it('deduplicates links while preserving their order', () => {
    expect(announcementLinks('ดู https://example.com แล้วดู https://example.com อีกครั้ง')).toEqual([
      { href: 'https://example.com/', host: 'example.com', youtubeVideoId: null },
    ])
  })

  it('appends a normalized link once', () => {
    const first = appendAnnouncementLink('เปิดเอกสาร', 'example.com/doc')
    expect(first).toBe('เปิดเอกสาร\nhttps://example.com/doc')
    expect(appendAnnouncementLink(first, 'https://example.com/doc')).toBe(first)
  })
})
