#!/usr/bin/env node
/**
 * Read-only SEB pre-deployment check.
 *
 * It loads .env.local without changing process.env, never prints configured
 * values, and performs no network or database requests.
 */
import { readFile, stat } from 'node:fs/promises'
import {
  formatSebReadinessReport,
  inspectEnvFilePermission,
  inspectSebDeploymentReadiness,
  parseEnvFile,
} from './check-seb-readiness-core.mjs'

const ENV_FILE_URL = new URL('../.env.local', import.meta.url)

async function loadLocalEnvironment() {
  try {
    const [contents, metadata] = await Promise.all([
      readFile(ENV_FILE_URL, 'utf8'),
      stat(ENV_FILE_URL),
    ])
    const parsed = parseEnvFile(contents, process.env)
    return {
      values: parsed.values,
      parseWarnings: parsed.warnings,
      permission: inspectEnvFilePermission({
        exists: true,
        mode: metadata.mode,
        platform: process.platform,
      }),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        values: {},
        parseWarnings: [],
        permission: inspectEnvFilePermission({
          exists: false,
          mode: 0,
          platform: process.platform,
        }),
      }
    }
    return {
      values: {},
      parseWarnings: [],
      permission: inspectEnvFilePermission({
        exists: true,
        mode: 0,
        platform: process.platform,
        readError: true,
      }),
    }
  }
}

const localEnvironment = await loadLocalEnvironment()
const environment = { ...localEnvironment.values, ...process.env }
const readiness = inspectSebDeploymentReadiness(environment)
const parseChecks = localEnvironment.parseWarnings.map(warning => ({
  status: 'warning',
  field: `.env.local line ${warning.line}`,
  message: `ข้ามบรรทัดเนื่องจาก ${warning.reason}`,
}))
const checks = [localEnvironment.permission, ...readiness.checks, ...parseChecks]

console.log(formatSebReadinessReport(checks))
if (checks.some(check => check.status === 'blocker')) process.exitCode = 1
