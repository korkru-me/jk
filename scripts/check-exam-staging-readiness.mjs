#!/usr/bin/env node
/**
 * Read-only guard for authenticated exam QA.
 *
 * Loads .env.qa.local (never .env.local), does not mutate process.env, does
 * not call the network, and never prints configured values.
 */
import { readFile } from 'node:fs/promises'
import { parseEnvFile } from './check-seb-readiness-core.mjs'
import {
  formatExamStagingReadinessReport,
  inspectExamStagingReadiness,
} from './check-exam-staging-readiness-core.mjs'

const ENV_FILE_URL = new URL('../.env.qa.local', import.meta.url)

async function loadQaEnvironment() {
  try {
    const contents = await readFile(ENV_FILE_URL, 'utf8')
    return parseEnvFile(contents, process.env)
  } catch (error) {
    if (error?.code === 'ENOENT') return { values: {}, warnings: [] }
    return { values: {}, warnings: [{ line: 0, reason: 'read failure' }] }
  }
}

const parsed = await loadQaEnvironment()
const readiness = inspectExamStagingReadiness({ ...parsed.values, ...process.env })
const parseChecks = parsed.warnings.map(warning => ({
  status: 'blocker',
  field: warning.line > 0 ? `.env.qa.local line ${warning.line}` : '.env.qa.local',
  message: `อ่านค่าไม่ได้เนื่องจาก ${warning.reason}`,
}))
const checks = [...readiness.checks, ...parseChecks]

console.log(formatExamStagingReadinessReport(checks))
if (checks.some(check => check.status === 'blocker')) process.exitCode = 1

