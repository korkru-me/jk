#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { parseEnvFile } from './check-seb-readiness-core.mjs'
import { inspectExamStagingReadiness } from './check-exam-staging-readiness-core.mjs'
import { inspectSebPlatformEvidence } from './check-seb-platform-evidence-core.mjs'
import { inspectExamUatEvidence } from './check-exam-uat-evidence-core.mjs'
import { inspectExamReleaseCandidate } from './check-exam-release-candidate-core.mjs'
import {
  formatExamReleaseReadinessReport,
  inspectExamReleaseReadiness,
} from './check-exam-release-core.mjs'

const QA_ENV_URL = new URL('../.env.qa.local', import.meta.url)
const PLATFORM_MANIFEST_URL = new URL('../config/seb-platform-evidence.json', import.meta.url)
const UAT_MANIFEST_URL = new URL('../config/exam-uat-evidence.json', import.meta.url)
const CANDIDATE_MANIFEST_URL = new URL('../config/exam-release-candidate.json', import.meta.url)

async function readQaEnvironment() {
  try {
    const parsed = parseEnvFile(await readFile(QA_ENV_URL, 'utf8'), process.env)
    return { environment: { ...parsed.values, ...process.env }, parseReady: parsed.warnings.length === 0 }
  } catch {
    return { environment: process.env, parseReady: false }
  }
}

async function readJsonManifest(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return {}
  }
}

const [{ environment, parseReady }, platformManifest, uatManifest, candidateManifest] = await Promise.all([
  readQaEnvironment(),
  readJsonManifest(PLATFORM_MANIFEST_URL),
  readJsonManifest(UAT_MANIFEST_URL),
  readJsonManifest(CANDIDATE_MANIFEST_URL),
])
const staging = inspectExamStagingReadiness(environment)
const platforms = inspectSebPlatformEvidence(platformManifest)
const externalUat = inspectExamUatEvidence(uatManifest)
const candidate = inspectExamReleaseCandidate(candidateManifest, {
  uatRunId: uatManifest?.runId,
  sebConfigId: platformManifest?.configId,
})
const result = inspectExamReleaseReadiness({
  stagingReady: parseReady && staging.ready,
  releaseCandidateReady: candidate.ready,
  sebPlatformsReady: platforms.ready,
  externalUatReady: externalUat.ready,
})

console.log(formatExamReleaseReadinessReport(result.checks))
if (!result.ready) process.exitCode = 1
