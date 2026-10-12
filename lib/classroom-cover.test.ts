import { describe, expect, it } from 'vitest'
import {
  CLASSROOM_COVER_MAX_BYTES,
  checkClassroomCoverFile,
  classroomCoverUploadPath,
  isClassroomCoverUrl,
} from './classroom-cover'

const ORIGIN = 'https://school.supabase.co'
const OWNER = 'teacher-123'
const publicUrl = (path: string) => `${ORIGIN}/storage/v1/object/public/question-images/${path}`

describe('classroom cover uploads', () => {
  it('accepts only supported images within the limit', () => {
    expect(checkClassroomCoverFile({ name: 'cover.webp', type: 'image/webp', size: CLASSROOM_COVER_MAX_BYTES }))
      .toEqual({ ok: true, extension: 'webp' })
    expect(checkClassroomCoverFile({ name: 'cover.svg', type: 'image/svg+xml', size: 100 })).toMatchObject({ ok: false })
    expect(checkClassroomCoverFile({ name: 'cover.png', type: 'image/png', size: CLASSROOM_COVER_MAX_BYTES + 1 })).toMatchObject({ ok: false })
  })

  it('creates an owner-scoped path reserved for classroom covers', () => {
    expect(classroomCoverUploadPath(OWNER, 'jpg', 1234, 0.25))
      .toMatch(/^teacher-123\/classroom-cover_1234_[a-z0-9]+\.jpg$/)
  })

  it('accepts the exact public bucket, owner and generated filename', () => {
    expect(isClassroomCoverUrl(publicUrl(`${OWNER}/classroom-cover_1234_abcd.webp`), {
      ownerId: OWNER,
      storageOrigin: ORIGIN,
    })).toBe(true)
  })

  it.each([
    'https://attacker.example/storage/v1/object/public/question-images/teacher-123/classroom-cover_1_a.webp',
    publicUrl('another-teacher/classroom-cover_1_a.webp'),
    publicUrl(`${OWNER}/ordinary-question.webp`),
    `${publicUrl(`${OWNER}/classroom-cover_1_a.webp`)}?download=1`,
    `${ORIGIN}/storage/v1/object/public/work-images/${OWNER}/classroom-cover_1_a.webp`,
  ])('rejects an unsafe or unrelated URL: %s', url => {
    expect(isClassroomCoverUrl(url, { ownerId: OWNER, storageOrigin: ORIGIN })).toBe(false)
  })

  it('allows blob previews only when the caller explicitly opts into local preview mode', () => {
    const blob = 'blob:http://localhost:3001/preview-id'
    expect(isClassroomCoverUrl(blob, { allowBlob: true })).toBe(true)
    expect(isClassroomCoverUrl(blob, { allowBlob: false })).toBe(false)
  })
})
