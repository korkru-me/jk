#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises'
import { parseEnvFile } from './check-seb-readiness-core.mjs'
import {
  formatStagingBootstrapReport,
  inspectStagingBootstrapReadiness,
} from './check-staging-bootstrap-core.mjs'

const ENV_FILE_URL = new URL('../.env.qa.local', import.meta.url)
const MANIFEST_URL = new URL('../supabase/bootstrap/manifest.json', import.meta.url)

async function loadEnvironment() {
  try {
    const contents = await readFile(ENV_FILE_URL, 'utf8')
    return parseEnvFile(contents, process.env)
  } catch (error) {
    if (error?.code === 'ENOENT') return { values: {}, warnings: [] }
    return { values: {}, warnings: [{ line: 0, reason: 'read failure' }] }
  }
}

const parsed = await loadEnvironment()
let manifest = null
try {
  manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'))
} catch {
  manifest = null
}

const paths = Array.isArray(manifest?.orderedSteps)
  ? manifest.orderedSteps.map(step => step?.path).filter(path => typeof path === 'string')
  : []
const fileInventory = {}
for (const path of paths) {
  try {
    await access(new URL(`../${path}`, import.meta.url))
    fileInventory[path] = true
  } catch {
    fileInventory[path] = false
  }
}

try {
  const migrations = (await readdir(new URL('../supabase/migrations', import.meta.url)))
    .filter(name => name.endsWith('.sql'))
    .sort()
  fileInventory.migrationStartsAt002 = migrations[0]?.startsWith('002_') === true
} catch {
  fileInventory.migrationStartsAt002 = false
}

const readiness = inspectStagingBootstrapReadiness(
  { ...parsed.values, ...process.env },
  manifest,
  fileInventory,
)
const parseChecks = parsed.warnings.map(warning => ({
  status: 'blocker',
  field: warning.line > 0 ? `.env.qa.local line ${warning.line}` : '.env.qa.local',
  message: `อ่านค่าไม่ได้เนื่องจาก ${warning.reason}`,
}))
const checks = [...readiness.checks, ...parseChecks]

console.log(formatStagingBootstrapReport(checks))
if (checks.some(check => check.status === 'blocker')) process.exitCode = 1
