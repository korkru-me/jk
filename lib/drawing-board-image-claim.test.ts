import { describe, expect, it } from 'vitest'
import {
  QUESTION_IMAGE_CLAIM_KIND,
  QUESTION_IMAGE_CLAIM_VERSION,
  type QuestionImageClaimPayload,
} from '@/lib/drawing-board-image-claim'
import {
  sha256Hex,
  signQuestionImageClaim,
  verifyQuestionImageClaim,
} from '@/lib/drawing-board-image-claim.server'

const secret = 'test-service-role-secret-that-is-never-used-in-production'
const now = 1_900_000_000_000
const bytes = new TextEncoder().encode('trusted image bytes')

function payload(overrides: Partial<QuestionImageClaimPayload> = {}): QuestionImageClaimPayload {
  return {
    version: QUESTION_IMAGE_CLAIM_VERSION,
    kind: QUESTION_IMAGE_CLAIM_KIND,
    actorId: 'actor-1',
    assignmentId: 'assignment-1',
    questionId: 'question-1',
    sourcePath: 'actor-1/question.webp',
    sourceSha256: sha256Hex(new TextEncoder().encode('source')),
    fileId: 'file-1',
    mimeType: 'image/webp',
    dataSha256: sha256Hex(bytes),
    issuedAt: now - 1_000,
    expiresAt: now + 60_000,
    ...overrides,
  }
}

function expected(overrides: Record<string, string> = {}) {
  return {
    actorId: 'actor-1',
    assignmentId: 'assignment-1',
    questionId: 'question-1',
    fileId: 'file-1',
    mimeType: 'image/webp',
    dataSha256: sha256Hex(bytes),
    ...overrides,
  }
}

describe('question image provenance claim', () => {
  it('accepts a current claim bound to actor, assignment, question, file, MIME and bytes', () => {
    const token = signQuestionImageClaim(payload(), secret)
    expect(verifyQuestionImageClaim(token, expected(), secret, now)).toBe('valid')
  })

  it.each([
    ['actorId', 'actor-2'],
    ['assignmentId', 'assignment-2'],
    ['questionId', 'question-2'],
    ['fileId', 'file-2'],
    ['mimeType', 'image/png'],
    ['dataSha256', sha256Hex(new TextEncoder().encode('arbitrary bytes'))],
  ])('rejects a claim reused with another %s', (field, value) => {
    const token = signQuestionImageClaim(payload(), secret)
    expect(verifyQuestionImageClaim(token, expected({ [field]: value }), secret, now)).toBe('invalid')
  })

  it('distinguishes an authentic expired claim for exact legacy fallback', () => {
    const token = signQuestionImageClaim(payload({ expiresAt: now - 1 }), secret)
    expect(verifyQuestionImageClaim(token, expected(), secret, now)).toBe('expired-authentic')
  })

  it('rejects tampering and a token signed with another secret', () => {
    const token = signQuestionImageClaim(payload(), secret)
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    expect(verifyQuestionImageClaim(tampered, expected(), secret, now)).toBe('invalid')
    expect(verifyQuestionImageClaim(token, expected(), 'another-secret', now)).toBe('invalid')
  })
})
