import { describe, expect, it } from 'vitest'
import {
  buildStudentWorkUploadPaths,
  buildTeachingBoardUploadPaths,
  CURRENT_WORK_FORMAT_VERSION,
  hasWebpSignature,
  isWorkArtifactSource,
  isWorkPartKey,
  MAX_WORK_PREVIEW_BYTES,
  readSceneElementCount,
  validateStoredWorkFile,
} from '@/lib/math-work'

const STUDENT_ID = '11111111-1111-4111-8111-111111111111'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
const ANSWER_ID = '33333333-3333-4333-8333-333333333333'
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'
const QUESTION_ID = '66666666-6666-4666-8666-666666666666'

describe('math work artifact helpers', () => {
  it('builds answer-bound student paths with an optional scene', () => {
    expect(buildStudentWorkUploadPaths({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      submissionAnswerId: ANSWER_ID,
      uploadId: UPLOAD_ID,
      includeScene: true,
    })).toEqual({
      previewPath: `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/preview.webp`,
      scenePath: `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/scene.json`,
    })
  })

  it('does not allocate a scene path for an unannotated photo', () => {
    expect(buildStudentWorkUploadPaths({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      submissionAnswerId: ANSWER_ID,
      uploadId: UPLOAD_ID,
      includeScene: false,
    }).scenePath).toBeNull()
  })

  it('builds assignment/question/slot-bound teaching paths', () => {
    expect(buildTeachingBoardUploadPaths({
      teacherId: STUDENT_ID,
      assignmentId: ASSIGNMENT_ID,
      questionId: QUESTION_ID,
      slot: 5,
      uploadId: UPLOAD_ID,
    })).toEqual({
      previewPath: `teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/5/${UPLOAD_ID}/preview.webp`,
      scenePath: `teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/5/${UPLOAD_ID}/scene.json`,
    })
  })

  it('rejects a teaching-board slot outside the database range', () => {
    expect(() => buildTeachingBoardUploadPaths({
      teacherId: STUDENT_ID,
      assignmentId: ASSIGNMENT_ID,
      questionId: QUESTION_ID,
      slot: 6,
      uploadId: UPLOAD_ID,
    })).toThrow('slot must be an integer from 1 to 5')
  })

  it('accepts only storage-safe logical part keys and known sources', () => {
    expect(isWorkPartKey('answer')).toBe(true)
    expect(isWorkPartKey('part:0')).toBe(true)
    expect(isWorkPartKey('../answer')).toBe(false)
    expect(isWorkPartKey('Part 1')).toBe(false)
    expect(isWorkArtifactSource('scratchpad')).toBe(true)
    expect(isWorkArtifactSource('photo')).toBe(true)
    expect(isWorkArtifactSource('file')).toBe(false)
  })

  it('reads only a supported, bounded scene envelope', () => {
    expect(readSceneElementCount({ formatVersion: CURRENT_WORK_FORMAT_VERSION, elements: [{ id: 1 }] })).toBe(1)
    expect(readSceneElementCount({ formatVersion: 99, elements: [] })).toBeNull()
    expect(readSceneElementCount({ formatVersion: CURRENT_WORK_FORMAT_VERSION })).toBeNull()
  })

  it('checks the actual stored MIME and byte size', () => {
    expect(validateStoredWorkFile({
      kind: 'preview',
      contentType: 'image/webp',
      size: MAX_WORK_PREVIEW_BYTES,
    })).toEqual({ ok: true, size: MAX_WORK_PREVIEW_BYTES })
    expect(validateStoredWorkFile({
      kind: 'preview',
      contentType: 'image/png',
      size: 100,
    }).ok).toBe(false)
    expect(validateStoredWorkFile({
      kind: 'preview',
      contentType: 'image/webp',
      size: MAX_WORK_PREVIEW_BYTES + 1,
    }).ok).toBe(false)
  })

  it('checks WebP file bytes instead of trusting the MIME label alone', () => {
    expect(hasWebpSignature(new TextEncoder().encode('RIFF0000WEBPdata'))).toBe(true)
    expect(hasWebpSignature(new TextEncoder().encode('RIFF0000PNG data'))).toBe(false)
    expect(hasWebpSignature(new Uint8Array(3))).toBe(false)
  })
})
