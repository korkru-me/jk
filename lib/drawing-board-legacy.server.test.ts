import { describe, expect, it } from 'vitest'
import { upgradeLegacyTeacherScene } from '@/lib/drawing-board-legacy.server'
import { sha256Hex, verifyQuestionImageClaim } from '@/lib/drawing-board-image-claim.server'
import { validateDrawingScene } from '@/lib/drawing-board-policy'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const SVG = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path d="M0 0h1v1z"/></svg>',
).toString('base64')}`
const WEBP = new TextEncoder().encode('RIFF0000WEBPdata')
const SECRET = 'legacy-scene-test-secret-with-enough-entropy'
const CONTEXT = {
  boardId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
  assignmentId: '33333333-3333-4333-8333-333333333333',
  questionId: '44444444-4444-4444-8444-444444444444',
}

function imageElement(id: string, fileId: string) {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    fileId,
    status: 'saved',
    scale: [1, 1],
    crop: null,
  }
}

function mixedLegacyScene(extraFiles: Record<string, unknown> = {}) {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [imageElement('png-element', 'png-file'), imageElement('svg-element', 'svg-file')],
    appState: {},
    files: {
      'png-file': { id: 'png-file', dataURL: PNG, mimeType: 'image/png', created: 1 },
      'svg-file': { id: 'svg-file', dataURL: SVG, mimeType: 'image/svg+xml', created: 1 },
      ...extraFiles,
    },
    background: 'lined',
  }
}

async function upgrade(value: unknown = mixedLegacyScene()) {
  return upgradeLegacyTeacherScene({
    value,
    context: CONTEXT,
    secret: SECRET,
    rasterizeSvg: async () => WEBP,
    now: 1_800_000_000_000,
  })
}

function validateClaimedScene(value: unknown, actorId = CONTEXT.actorId) {
  return validateDrawingScene(value, {
    role: 'teacher',
    verifyTeacherImage: ({ fileId, mimeType, bytes, claim }) => verifyQuestionImageClaim(
      claim,
      {
        actorId,
        assignmentId: CONTEXT.assignmentId,
        questionId: CONTEXT.questionId,
        fileId,
        mimeType,
        dataSha256: sha256Hex(bytes),
      },
      SECRET,
      1_800_000_000_000,
    ),
  })
}

describe('legacy teacher scene upgrade', () => {
  it('re-claims every file in a mixed SVG and unsigned raster scene', async () => {
    const result = await upgrade()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.values(result.scene.files).every(file => (
      typeof file === 'object' && file !== null && 'korkruQuestionImage' in file
    ))).toBe(true)
    expect(validateClaimedScene(result.scene).ok).toBe(true)
  })

  it('binds retained raster bytes, file ids and actor scope into fresh claims', async () => {
    const result = await upgrade()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const tamperedBytes = Buffer.from(PNG.slice(PNG.indexOf(',') + 1), 'base64')
    tamperedBytes[tamperedBytes.length - 1] ^= 1
    const tampered = structuredClone(result.scene) as typeof result.scene
    ;(tampered.files['png-file'] as { dataURL: string }).dataURL = `data:image/png;base64,${tamperedBytes.toString('base64')}`
    expect(validateClaimedScene(tampered).ok).toBe(false)

    const rebound = structuredClone(result.scene) as typeof result.scene
    const raster = rebound.files['png-file'] as Record<string, unknown>
    delete rebound.files['png-file']
    rebound.files['renamed-file'] = { ...raster, id: 'renamed-file' }
    ;(rebound.elements[0] as { fileId: string }).fileId = 'renamed-file'
    expect(validateClaimedScene(rebound).ok).toBe(false)
    expect(validateClaimedScene(result.scene, 'different-actor').ok).toBe(false)
  })

  it('fails the whole upgrade when an unrelated file survives in the map', async () => {
    const result = await upgrade(mixedLegacyScene({
      orphan: { id: 'orphan', dataURL: PNG, mimeType: 'image/png', created: 1 },
    }))
    expect(result).toEqual({ ok: false, reason: 'invalid-scene' })
  })
})
