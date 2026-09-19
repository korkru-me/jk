#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { parseEnvFile } from './check-seb-readiness-core.mjs'
import { inspectExamStagingReadiness } from './check-exam-staging-readiness-core.mjs'
import { inspectSebPlatformEvidence } from './check-seb-platform-evidence-core.mjs'
import {
  formatExamReleaseReadinessReport,
  inspectExamReleaseReadiness,
} from './check-exam-release-core.mjs'

const QA_ENV_URL = new URL('../.env.qa.local', import.meta.url)
const PLATFORM_MANIFEST_URL = new URL('../config/seb-platform-evidence.json', import.meta.url)

async function readQaEnvironment() {
  try {
    const parsed = parseEnvFile(await readFile(QA_ENV_URL, 'utf8'), process.env)
    return { environment: { ...parsed.values, ...process.env }, parseReady: parsed.warnings.length === 0 }
  } catch {
    return { environment: process.env, parseReady: false }
  }
}

async function readPlatformManifest() {
  try {
    return JSON.parse(await readFile(PLATFORM_MANIFEST_URL, 'utf8'))
  } catch {
    return {}
  }
}

const [{ environment, parseReady }, platformManifest] = await Promise.all([
  readQaEnvironment(),
  readPlatformManifest(),
])
const staging = inspectExamStagingReadiness(environment)
const platforms = inspectSebPlatformEvidence(platformManifest)
const result = inspectExamReleaseReadiness({
  stagingReady: parseReady && staging.ready,
  sebPlatformsReady: platforms.ready,
})

console.log(formatExamReleaseReadinessReport(result.checks))
if (!result.ready) process.exitCode = 1
