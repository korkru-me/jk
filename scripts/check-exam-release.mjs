#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inspectExamStagingEnvironment } from './check-exam-staging-readiness-core.mjs'
import { inspectSebPlatformEvidence } from './check-seb-platform-evidence-core.mjs'
import { inspectExamUatEvidence } from './check-exam-uat-evidence-core.mjs'
import { inspectExamReleaseCandidate } from './check-exam-release-candidate-core.mjs'
import { inspectSebReleaseRegistry } from './check-seb-release-registry-core.mjs'
import {
  formatExamReleaseReadinessReport,
  inspectExamReleaseReadiness,
} from './check-exam-release-core.mjs'

const QA_ENV_URL = new URL('../.env.qa.local', import.meta.url)
const PLATFORM_MANIFEST_URL = new URL('../config/seb-platform-evidence.json', import.meta.url)
const UAT_MANIFEST_URL = new URL('../config/exam-uat-evidence.json', import.meta.url)
const CANDIDATE_MANIFEST_URL = new URL('../config/exam-release-candidate.json', import.meta.url)
const SEB_REGISTRY_URL = new URL('../config/seb-release-registry.json', import.meta.url)

async function readQaEnvironment() {
  let contents = ''
  try {
    contents = await readFile(QA_ENV_URL, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') return { ready: false }
  }
  return inspectExamStagingEnvironment(contents, process.env)
}

async function readJsonManifest(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return {}
  }
}

const [staging, platformManifest, uatManifest, candidateManifest, sebRegistryManifest] = await Promise.all([
  readQaEnvironment(),
  readJsonManifest(PLATFORM_MANIFEST_URL),
  readJsonManifest(UAT_MANIFEST_URL),
  readJsonManifest(CANDIDATE_MANIFEST_URL),
  readJsonManifest(SEB_REGISTRY_URL),
])
let candidateArtifactSha256 = null
const registryCandidate = Array.isArray(sebRegistryManifest?.revisions)
  ? sebRegistryManifest.revisions.find(row => row?.revision === sebRegistryManifest?.candidateRevision)
  : null
if (typeof registryCandidate?.artifactPath === 'string' && /^\/exam\/[A-Za-z0-9._-]+\.seb$/.test(registryCandidate.artifactPath)) {
  try {
    const artifact = await readFile(new URL(`../public${registryCandidate.artifactPath}`, import.meta.url))
    candidateArtifactSha256 = createHash('sha256').update(artifact).digest('hex')
  } catch {
    candidateArtifactSha256 = null
  }
}
const sebRegistry = inspectSebReleaseRegistry(sebRegistryManifest, { candidateArtifactSha256 })
const platforms = inspectSebPlatformEvidence(platformManifest, { releaseRegistry: sebRegistryManifest })
const externalUat = inspectExamUatEvidence(uatManifest)
const candidate = inspectExamReleaseCandidate(candidateManifest, {
  uatRunId: uatManifest?.runId,
  sebConfigId: platformManifest?.configId,
  sebConfigRevision: platformManifest?.configRevision,
})
const result = inspectExamReleaseReadiness({
  stagingReady: staging.ready,
  sebRegistryReady: sebRegistry.ready,
  releaseCandidateReady: candidate.ready,
  sebPlatformsReady: platforms.ready,
  externalUatReady: externalUat.ready,
})

console.log(formatExamReleaseReadinessReport(result.checks))
if (!result.ready) process.exitCode = 1
