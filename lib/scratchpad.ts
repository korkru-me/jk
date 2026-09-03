import { CURRENT_WORK_FORMAT_VERSION, MAX_WORK_ELEMENTS, MAX_WORK_SCENE_BYTES } from '@/lib/math-work'

export const SCRATCHPAD_TTL_MS = 7 * 24 * 60 * 60 * 1_000

export type ScratchpadBackground = 'blank' | 'lined' | 'grid' | 'dots'

export interface ScratchpadScope {
  ownerId: string
  submissionId: string
  answerId: string
  partKey: string
}

/** Versioned shape that Phase 5 can upload without converting the scene model. */
export interface ScratchpadScene {
  formatVersion: typeof CURRENT_WORK_FORMAT_VERSION
  elements: readonly unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
  background: ScratchpadBackground
}

const BACKGROUNDS = new Set<ScratchpadBackground>(['blank', 'lined', 'grid', 'dots'])

function requiredScopeValue(name: keyof ScratchpadScope, value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 200) throw new Error(`Invalid scratchpad ${name}`)
  return normalized
}

export function scratchpadStorageKey(scope: ScratchpadScope): string {
  return JSON.stringify([
    requiredScopeValue('ownerId', scope.ownerId),
    requiredScopeValue('submissionId', scope.submissionId),
    requiredScopeValue('answerId', scope.answerId),
    requiredScopeValue('partKey', scope.partKey),
  ])
}

export function scratchpadSubmissionKey(ownerId: string, submissionId: string): string {
  return JSON.stringify([
    requiredScopeValue('ownerId', ownerId),
    requiredScopeValue('submissionId', submissionId),
  ])
}

export function emptyScratchpadScene(background: ScratchpadBackground = 'lined'): ScratchpadScene {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [],
    appState: {},
    files: {},
    background,
  }
}

export function sanitizeScratchpadScene(value: unknown): ScratchpadScene | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const scene = value as Record<string, unknown>
  if (scene.formatVersion !== CURRENT_WORK_FORMAT_VERSION) return null
  if (!Array.isArray(scene.elements) || scene.elements.length > MAX_WORK_ELEMENTS) return null
  if (!scene.appState || typeof scene.appState !== 'object' || Array.isArray(scene.appState)) return null
  if (!scene.files || typeof scene.files !== 'object' || Array.isArray(scene.files)) return null
  if (!BACKGROUNDS.has(scene.background as ScratchpadBackground)) return null
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: scene.elements,
    appState: scene.appState as Record<string, unknown>,
    files: scene.files as Record<string, unknown>,
    background: scene.background as ScratchpadBackground,
  }
}

export function scratchpadSceneBytes(scene: ScratchpadScene): number {
  return new TextEncoder().encode(JSON.stringify(scene)).byteLength
}

export function isScratchpadSceneWithinLimits(scene: ScratchpadScene): boolean {
  return scene.elements.length <= MAX_WORK_ELEMENTS && scratchpadSceneBytes(scene) <= MAX_WORK_SCENE_BYTES
}

export function isScratchpadExpired(updatedAt: number, now = Date.now()): boolean {
  return !Number.isFinite(updatedAt) || updatedAt <= now - SCRATCHPAD_TTL_MS
}
