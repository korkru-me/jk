#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  formatExamReleaseCandidateReport,
  inspectExamReleaseCandidate,
} from './check-exam-release-candidate-core.mjs'

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return {}
  }
}

const [candidate, uat, seb] = await Promise.all([
  readJson(new URL('../config/exam-release-candidate.json', import.meta.url)),
  readJson(new URL('../config/exam-uat-evidence.json', import.meta.url)),
  readJson(new URL('../config/seb-platform-evidence.json', import.meta.url)),
])
const result = inspectExamReleaseCandidate(candidate, {
  uatRunId: uat?.runId,
  sebConfigId: seb?.configId,
})

console.log(formatExamReleaseCandidateReport(result.checks))
if (!result.ready) process.exitCode = 1
