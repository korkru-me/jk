#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inspectExamStagingEnvironment } from './check-exam-staging-readiness-core.mjs'
import {
  formatNextExamUatStep,
  nextExamUatStep,
} from './next-exam-uat-step-core.mjs'

const QA_ENV_URL = new URL('../.env.qa.local', import.meta.url)
const UAT_MANIFEST_URL = new URL('../config/exam-uat-evidence.json', import.meta.url)
const SEB_MANIFEST_URL = new URL('../config/seb-platform-evidence.json', import.meta.url)
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

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return {}
  }
}

const [staging, candidateManifest, uatManifest, sebManifest, sebRegistryManifest] = await Promise.all([
  readQaEnvironment(),
  readJson(CANDIDATE_MANIFEST_URL),
  readJson(UAT_MANIFEST_URL),
  readJson(SEB_MANIFEST_URL),
  readJson(SEB_REGISTRY_URL),
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

console.log(formatNextExamUatStep(nextExamUatStep({
  stagingReady: staging.ready,
  candidateManifest,
  uatManifest,
  sebManifest,
  sebRegistryManifest,
  candidateArtifactSha256,
})))
