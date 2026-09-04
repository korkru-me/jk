import { describe, expect, it } from 'vitest'
import {
  buildStudentWorkUploadPaths,
  buildTeachingBoardUploadPaths,
  CURRENT_WORK_FORMAT_VERSION,
  hasCompleteWorkEvidence,
  hasPngSignature,
  hasPreviewSignature,
  hasWebpSignature,
  isWorkArtifactSource,
  isWorkPartKey,
  MAX_WORK_PREVIEW_BYTES,
  readSceneElementCount,
  validateStoredWorkFile,
  workArtifactPartKey,
} from '@/lib/math-work'

const STUDENT_ID = '11111111-1111-4111-8111-111111111111'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
const ANSWER_ID = '33333333-3333-4333-8333-333333333333'
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'
const QUESTION_ID = '66666666-6666-4666-8666-666666666666'

describe('math work artifact helpers', () => {
  it('maps whole and multi-part answers to stable artifact slots', () => {
    expect(workArtifactPartKey(0, 1)).toBe('answer')
    expect(workArtifactPartKey(0, 3)).toBe('part:0')
    expect(workArtifactPartKey(2, 3)).toBe('part:2')
    expect(() => workArtifactPartKey(1, 1)).toThrow()
    expect(() => workArtifactPartKey(3, 3)).toThrow()
  })

  it('accepts a complete mix of legacy photos and attached artifact slots', () => {
    expect(hasCompleteWorkEvidence({
      submissionAnswerId: ANSWER_ID,
      partCount: 3,
      workImages: ['legacy-photo', null, null],
      artifactSlots: new Set([`${ANSWER_ID}:part:1`, `${ANSWER_ID}:part:2`]),
    })).toBe(true)
    expect(hasCompleteWorkEvidence({
      submissionAnswerId: ANSWER_ID,
      partCount: 3,
      workImages: ['legacy-photo', null, null],
      artifactSlots: new Set([`${ANSWER_ID}:part:1`]),
    })).toBe(false)
  })

  it('builds answer-bound student paths with an optional scene', () => {
    expect(buildStudentWorkUploadPaths({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      submissionAnswerId: ANSWER_ID,
      uploadId: UPLOAD_ID,
      includeScene: true,
      previewFormat: 'webp',
    })).toEqual({
      previewPath: `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/preview.webp`,
      scenePath: `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/scene.json`,
    })
  })

  it('names the preview after the format the browser could actually encode', () => {
    expect(buildStudentWorkUploadPaths({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      submissionAnswerId: ANSWER_ID,
      uploadId: UPLOAD_ID,
      includeScene: true,
      previewFormat: 'png',
    }).previewPath).toBe(`students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/preview.png`)
    expect(buildTeachingBoardUploadPaths({
      teacherId: STUDENT_ID,
      assignmentId: ASSIGNMENT_ID,
      questionId: QUESTION_ID,
      slot: 1,
      uploadId: UPLOAD_ID,
      previewFormat: 'png',
    }).previewPath).toBe(`teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/1/${UPLOAD_ID}/preview.png`)
  })

  it('does not allocate a scene path for an unannotated photo', () => {
    expect(buildStudentWorkUploadPaths({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      submissionAnswerId: ANSWER_ID,
      uploadId: UPLOAD_ID,
      includeScene: false,
      previewFormat: 'webp',
    }).scenePath).toBeNull()
  })

  it('builds assignment/question/slot-bound teaching paths', () => {
    expect(buildTeachingBoardUploadPaths({
      teacherId: STUDENT_ID,
      assignmentId: ASSIGNMENT_ID,
      questionId: QUESTION_ID,
      slot: 5,
      uploadId: UPLOAD_ID,
      previewFormat: 'webp',
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
      previewFormat: 'webp',
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
      previewFormat: 'webp',
      contentType: 'image/webp',
      size: MAX_WORK_PREVIEW_BYTES,
    })).toEqual({ ok: true, size: MAX_WORK_PREVIEW_BYTES })
    expect(validateStoredWorkFile({
      kind: 'preview',
      previewFormat: 'png',
      contentType: 'image/png',
      size: 100,
    })).toEqual({ ok: true, size: 100 })
    // The stored type has to match the format the upload was prepared for.
    expect(validateStoredWorkFile({
      kind: 'preview',
      previewFormat: 'webp',
      contentType: 'image/png',
      size: 100,
    }).ok).toBe(false)
    expect(validateStoredWorkFile({
      kind: 'preview',
      previewFormat: 'webp',
      contentType: 'image/webp',
      size: MAX_WORK_PREVIEW_BYTES + 1,
    }).ok).toBe(false)
  })

  it('checks preview file bytes instead of trusting the MIME label alone', () => {
    const webp = new TextEncoder().encode('RIFF0000WEBPdata')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
    expect(hasWebpSignature(webp)).toBe(true)
    expect(hasWebpSignature(new TextEncoder().encode('RIFF0000PNG data'))).toBe(false)
    expect(hasWebpSignature(new Uint8Array(3))).toBe(false)
    expect(hasPngSignature(png)).toBe(true)
    expect(hasPngSignature(webp)).toBe(false)
    expect(hasPngSignature(new Uint8Array(3))).toBe(false)
    // A PNG uploaded against a WebP-prepared path is still rejected.
    expect(hasPreviewSignature(png, 'png')).toBe(true)
    expect(hasPreviewSignature(png, 'webp')).toBe(false)
    expect(hasPreviewSignature(webp, 'webp')).toBe(true)
  })
})
