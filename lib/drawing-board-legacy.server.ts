import {
  QUESTION_IMAGE_CLAIM_KIND,
  QUESTION_IMAGE_CLAIM_VERSION,
} from '@/lib/drawing-board-image-claim'
import {
  sha256Hex,
  signQuestionImageClaim,
  verifyQuestionImageClaim,
} from '@/lib/drawing-board-image-claim.server'
import { validateDrawingScene } from '@/lib/drawing-board-policy'
import { decodeSafeDrawingBoardSvgDataUrl } from '@/lib/drawing-board-svg.server'
import type { ScratchpadScene } from '@/lib/scratchpad'

const CLAIM_LIFETIME_MS = 24 * 60 * 60 * 1_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export interface LegacyTeacherSceneContext {
  boardId: string
  actorId: string
  assignmentId: string
  questionId: string
}

export type LegacyTeacherSceneUpgradeResult =
  | { ok: true; scene: ScratchpadScene }
  | { ok: false; reason: 'invalid-scene' | 'unsafe-svg' | 'rasterize-failed' }

/**
 * Upgrade a stored v1 scene containing legacy SVG without letting raw XML
 * reach the browser. The whole converted scene is validated before any file
 * receives fresh provenance, then every retained raster is re-claimed from
 * its exact decoded bytes. Re-claiming all files is important for mixed
 * SVG+raster boards: their original scene cannot be used as a full legacy
 * snapshot because SVG is intentionally outside the current file policy.
 */
export async function upgradeLegacyTeacherScene(input: {
  value: unknown
  context: LegacyTeacherSceneContext
  secret: string
  rasterizeSvg: (bytes: Uint8Array) => Promise<Uint8Array | null>
  now?: number
}): Promise<LegacyTeacherSceneUpgradeResult> {
  if (!isRecord(input.value) || !isRecord(input.value.files)) {
    return { ok: false, reason: 'invalid-scene' }
  }

  const files = { ...input.value.files }
  const sourceHashes = new Map<string, string>()
  let rasterized = 0

  for (const [fileId, value] of Object.entries(files)) {
    if (!isRecord(value) || value.mimeType !== 'image/svg+xml') continue
    const svgBytes = decodeSafeDrawingBoardSvgDataUrl(value.dataURL)
    if (!svgBytes) return { ok: false, reason: 'unsafe-svg' }
    let raster: Uint8Array | null
    try {
      raster = await input.rasterizeSvg(svgBytes)
    } catch {
      raster = null
    }
    if (!raster) return { ok: false, reason: 'rasterize-failed' }
    const now = input.now ?? Date.now()
    files[fileId] = {
      ...value,
      id: fileId,
      dataURL: `data:image/webp;base64,${Buffer.from(raster).toString('base64')}`,
      mimeType: 'image/webp',
      created: typeof value.created === 'number' ? value.created : now,
    }
    sourceHashes.set(fileId, sha256Hex(svgBytes))
    rasterized += 1
  }

  if (rasterized === 0) return { ok: false, reason: 'invalid-scene' }

  const decodedFiles = new Map<string, { mimeType: string; bytes: Uint8Array }>()
  const converted = validateDrawingScene({ ...input.value, files }, {
    role: 'teacher',
    allowUnsignedTeacherImages: true,
    verifyTeacherImage: ({ fileId, mimeType, bytes }) => {
      decodedFiles.set(fileId, { mimeType, bytes })
      return 'valid'
    },
  })
  if (!converted.ok || decodedFiles.size !== Object.keys(converted.scene.files).length) {
    return { ok: false, reason: 'invalid-scene' }
  }

  const now = input.now ?? Date.now()
  const claimedFiles: Record<string, unknown> = {}
  for (const [fileId, value] of Object.entries(converted.scene.files)) {
    const decoded = decodedFiles.get(fileId)
    if (!decoded || !isRecord(value)) return { ok: false, reason: 'invalid-scene' }
    const dataSha256 = sha256Hex(decoded.bytes)
    const claim = signQuestionImageClaim({
      version: QUESTION_IMAGE_CLAIM_VERSION,
      kind: QUESTION_IMAGE_CLAIM_KIND,
      actorId: input.context.actorId,
      assignmentId: input.context.assignmentId,
      questionId: input.context.questionId,
      sourcePath: `legacy-board/${input.context.boardId}/${fileId}`,
      sourceSha256: sourceHashes.get(fileId) ?? dataSha256,
      fileId,
      mimeType: decoded.mimeType,
      dataSha256,
      issuedAt: now,
      expiresAt: now + CLAIM_LIFETIME_MS,
    }, input.secret)
    claimedFiles[fileId] = {
      ...value,
      korkruQuestionImage: { version: QUESTION_IMAGE_CLAIM_VERSION, claim },
    }
  }

  const final = validateDrawingScene({ ...converted.scene, files: claimedFiles }, {
    role: 'teacher',
    verifyTeacherImage: ({ fileId, mimeType, bytes, claim }) => verifyQuestionImageClaim(
      claim,
      {
        actorId: input.context.actorId,
        assignmentId: input.context.assignmentId,
        questionId: input.context.questionId,
        fileId,
        mimeType,
        dataSha256: sha256Hex(bytes),
      },
      input.secret,
      now,
    ),
  })
  return final.ok
    ? { ok: true, scene: final.scene }
    : { ok: false, reason: 'invalid-scene' }
}
