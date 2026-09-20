#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  formatNextExamUatStep,
  inspectNextExamUatStagingEnvironment,
  nextExamUatStep,
} from './next-exam-uat-step-core.mjs'

const QA_ENV_URL = new URL('../.env.qa.local', import.meta.url)
const UAT_MANIFEST_URL = new URL('../config/exam-uat-evidence.json', import.meta.url)
const SEB_MANIFEST_URL = new URL('../config/seb-platform-evidence.json', import.meta.url)
const CANDIDATE_MANIFEST_URL = new URL('../config/exam-release-candidate.json', import.meta.url)

async function readQaEnvironment() {
  let contents = ''
  try {
    contents = await readFile(QA_ENV_URL, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') return { ready: false }
  }
  return inspectNextExamUatStagingEnvironment(contents, process.env)
}

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return {}
  }
}

const [staging, candidateManifest, uatManifest, sebManifest] = await Promise.all([
  readQaEnvironment(),
  readJson(CANDIDATE_MANIFEST_URL),
  readJson(UAT_MANIFEST_URL),
  readJson(SEB_MANIFEST_URL),
])

console.log(formatNextExamUatStep(nextExamUatStep({
  stagingReady: staging.ready,
  candidateManifest,
  uatManifest,
  sebManifest,
})))
