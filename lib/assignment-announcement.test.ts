import { describe, expect, it } from 'vitest'
import {
  ASSIGNMENT_ANNOUNCEMENT_IMAGE_MAX_BYTES,
  assignmentAnnouncementImagePath,
  checkAssignmentAnnouncementImage,
} from './assignment-announcement'

describe('checkAssignmentAnnouncementImage', () => {
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ])('accepts %s after the browser has resized it', (type, extension) => {
    expect(checkAssignmentAnnouncementImage({ name: `rules.${extension}`, type, size: 1024 }))
      .toEqual({ ok: true, extension })
  })

  it('rejects non-images and pictures that are still too large', () => {
    expect(checkAssignmentAnnouncementImage({ name: 'rules.pdf', type: 'application/pdf', size: 1024 }))
      .toMatchObject({ ok: false })
    expect(checkAssignmentAnnouncementImage({
      name: 'huge.png',
      type: 'image/png',
      size: ASSIGNMENT_ANNOUNCEMENT_IMAGE_MAX_BYTES + 1,
    })).toMatchObject({ ok: false })
  })
})

describe('assignmentAnnouncementImagePath', () => {
  it('keeps the upload in the authenticated teacher folder with a distinct prefix', () => {
    expect(assignmentAnnouncementImagePath('teacher-1', 'webp', 123, 0.5))
      .toBe('teacher-1/assignment-announcement_123_i.webp')
  })
})
