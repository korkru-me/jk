import { describe, expect, it } from 'vitest'
import {
  formatDrawingBoardUatEvidenceReport,
  inspectDrawingBoardUatEvidence,
} from './check-drawing-board-uat-evidence-core.mjs'

const suiteDefinitions = [
  ['iphone-safari', 'iPhone Safari drawing board'],
  ['ipad-safari-pencil', 'iPad Safari and Apple Pencil'],
  ['desktop-browsers', 'Desktop Safari and Chromium'],
  ['student-auth-storage-attachment', 'Student Auth Storage attachment flow'],
  ['teacher-auth-storage-board', 'Teacher Auth Storage board flow'],
  ['cross-account-authorization', 'Cross-account authorization boundaries'],
  ['qa-data-cleanup', 'Drawing board QA data cleanup'],
]

function readyManifest() {
  return {
    schemaVersion: 1,
    candidateId: 'drawing-board-r1',
    sourceRevision: 'a'.repeat(40),
    stagingBuild: 'vercel-drawing-r1',
    migrationVersion: '20260921185046',
    lockedAt: '2026-09-22T01:00:00.000Z',
    suites: suiteDefinitions.map(([id, label], index) => ({
      id,
      label,
      status: 'passed',
      testedAt: `2026-09-22T01:0${index}:00.000Z`,
      testedVersion: 'ios-26-safari',
    })),
  }
}

describe('drawing board phase 8 UAT evidence', () => {
  it('passes one locked candidate after every required suite and cleanup pass', () => {
    expect(inspectDrawingBoardUatEvidence(readyManifest()).ready).toBe(true)
  })

  it('keeps the tracked pending manifest fail closed without leaking values', () => {
    const pending = readyManifest()
    pending.candidateId = 'pending'
    pending.sourceRevision = 'pending'
    pending.stagingBuild = 'pending'
    pending.lockedAt = null
    pending.suites = pending.suites.map(row => ({
      ...row,
      status: 'pending',
      testedAt: null,
      testedVersion: 'record during phase 8 UAT',
    }))
    const result = inspectDrawingBoardUatEvidence(pending)
    expect(result.ready).toBe(false)
    const report = formatDrawingBoardUatEvidenceReport(result.checks)
    expect(report).not.toContain(pending.sourceRevision)
    expect(report).not.toContain(pending.stagingBuild)
  })

  it('rejects unknown fields, unsafe build metadata, and wrong migration linkage', () => {
    const manifest = readyManifest()
    manifest.notes = 'free text does not belong in release evidence'
    manifest.stagingBuild = 'https://staging.example.test'
    manifest.migrationVersion = '20260904023417'
    expect(inspectDrawingBoardUatEvidence(manifest).ready).toBe(false)
  })

  it('rejects missing, duplicate, or malformed suite evidence', () => {
    const missing = readyManifest()
    missing.suites.pop()
    expect(inspectDrawingBoardUatEvidence(missing).ready).toBe(false)

    const duplicate = readyManifest()
    duplicate.suites[1].id = duplicate.suites[0].id
    expect(inspectDrawingBoardUatEvidence(duplicate).ready).toBe(false)

    const malformed = readyManifest()
    malformed.suites[0].testedAt = '22/09/2026'
    expect(inspectDrawingBoardUatEvidence(malformed).ready).toBe(false)
  })

  it('requires cleanup to happen after every other suite passes', () => {
    const manifest = readyManifest()
    manifest.suites.at(-1).testedAt = '2026-09-22T00:00:00.000Z'
    expect(inspectDrawingBoardUatEvidence(manifest).ready).toBe(false)
  })
})
