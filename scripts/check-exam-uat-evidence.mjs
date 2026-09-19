#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  formatExamUatEvidenceReport,
  inspectExamUatEvidence,
} from './check-exam-uat-evidence-core.mjs'

const MANIFEST_URL = new URL('../config/exam-uat-evidence.json', import.meta.url)
let manifest = {}
try {
  manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'))
} catch {
  // Missing or malformed evidence must fail closed below.
}

const result = inspectExamUatEvidence(manifest)
console.log(formatExamUatEvidenceReport(result.checks))
if (!result.ready) process.exitCode = 1
