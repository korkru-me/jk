import { describe, expect, it } from 'vitest'

import {
  inspectSebPhysicalUatEvidence,
  nextSebPhysicalUatStep,
  sebPhysicalUatCaseIds,
} from './check-seb-physical-uat-core.mjs'

const platformMetadata = {
  windows: ['Windows', 'Windows 11 x64', '3.10.2', '920'],
  macos: ['macOS', 'macOS 26.0', '3.7', '100'],
  ipados: ['iPadOS', 'iPadOS 26.0', '3.7', '100'],
  ios: ['iPhone / iOS', 'iOS 26.0', '3.7', '100'],
}

function manifest({ locked = true, passed = true } = {}) {
  const testedAt = '2026-09-27T10:30:00.000Z'
  return {
    schemaVersion: 1,
    candidate: {
      candidateId: locked ? 'seb-s6-assignment-r1' : 'pending',
      sourceRevision: locked ? 'a'.repeat(40) : 'pending',
      stagingDeploymentId: locked ? 'dpl_1234567890abcdef' : 'pending',
      releaseCommitmentSha256: locked ? 'b'.repeat(64) : 'pending',
      lockedAt: locked ? '2026-09-27T10:00:00.000Z' : null,
    },
    platforms: ['windows', 'macos', 'ipados', 'ios'].map(id => ({
      id,
      label: platformMetadata[id][0],
      osVersion: locked ? platformMetadata[id][1] : 'pending',
      sebVersion: locked ? platformMetadata[id][2] : 'pending',
      buildNumber: locked ? platformMetadata[id][3] : 'pending',
      cases: sebPhysicalUatCaseIds.map(caseId => ({
        id: caseId,
        status: passed ? 'passed' : 'pending',
        testedAt: passed ? testedAt : null,
      })),
    })),
  }
}

describe('SEB Phase S6 physical UAT evidence', () => {
  it('passes only a locked candidate with all four exact platforms and cases', () => {
    expect(inspectSebPhysicalUatEvidence(manifest()).ready).toBe(true)
  })

  it('keeps a valid pending manifest fail closed', () => {
    const result = inspectSebPhysicalUatEvidence(manifest({ locked: false, passed: false }))
    expect(result.ready).toBe(false)
    expect(result.checks.some(check => check.field === 'candidate lock release gate')).toBe(true)
  })

  it('rejects extra fields that could become an evidence or secret dumping area', () => {
    const value = manifest()
    value.platforms[0].cases[0].note = 'do not store free text here'
    expect(inspectSebPhysicalUatEvidence(value).ready).toBe(false)
  })

  it('rejects results recorded before the candidate lock', () => {
    const value = manifest()
    value.platforms[0].cases[0].testedAt = '2026-09-27T09:59:59.000Z'
    expect(inspectSebPhysicalUatEvidence(value).ready).toBe(false)
  })

  it('returns one candidate-lock action before device actions', () => {
    const next = nextSebPhysicalUatStep(manifest({ locked: false, passed: false }))
    expect(next.id).toBe('lock-assignment-artifact-candidate')
    expect(next.complete).toBe(false)
  })

  it('binds physical evidence to the aggregate release candidate', () => {
    const value = manifest()
    const releaseCandidate = {
      candidateId: value.candidate.candidateId,
      sourceRevision: value.candidate.sourceRevision,
      stagingBuild: value.candidate.stagingDeploymentId,
    }
    expect(inspectSebPhysicalUatEvidence(value, { releaseCandidate }).ready).toBe(true)
    releaseCandidate.stagingBuild = 'dpl_otherdeployment0'
    expect(inspectSebPhysicalUatEvidence(value, { releaseCandidate }).ready).toBe(false)
  })

  it('rejects a platform label that does not match its fixed id', () => {
    const value = manifest()
    value.platforms[0].label = 'macOS'
    expect(inspectSebPhysicalUatEvidence(value).ready).toBe(false)
  })

  it('rejects accessor-backed or hostile manifest records without evaluating them', () => {
    let evaluated = false
    const candidate = {}
    Object.defineProperty(candidate, 'candidateId', {
      enumerable: true,
      get() {
        evaluated = true
        throw new Error('must not run')
      },
    })
    expect(inspectSebPhysicalUatEvidence({
      schemaVersion: 1,
      candidate,
      platforms: [],
    }).ready).toBe(false)
    expect(evaluated).toBe(false)
  })
})
