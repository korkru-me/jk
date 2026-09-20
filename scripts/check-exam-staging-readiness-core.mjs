import { inspectDeploymentEnvironment } from '../lib/deployment-environment.mjs'
import { parseEnvFile } from './check-seb-readiness-core.mjs'

/** Merge an optional local QA env file with injected values without requiring secrets on disk. */
export function inspectExamStagingEnvironment(contents = '', environment = {}) {
  const parsed = parseEnvFile(contents, environment)
  const mergedEnvironment = { ...parsed.values, ...environment }
  const inspection = inspectExamStagingReadiness(mergedEnvironment)
  const parseReady = parsed.warnings.length === 0
  return {
    environment: mergedEnvironment,
    parseReady,
    ready: parseReady && inspection.ready,
  }
}

/**
 * Validate isolation before an authenticated exam QA run. The function only
 * compares metadata and never returns configured URLs or credentials.
 */
export function inspectExamStagingReadiness(environment) {
  const result = inspectDeploymentEnvironment(environment)
  const checks = [...result.checks]
  if (result.tier !== 'staging') checks.push({
    status: 'blocker',
    field: 'authenticated QA target',
    message: 'คำสั่ง QA นี้อนุญาตเฉพาะ Staging ที่ระบุชัดเจน',
  })
  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatExamStagingReadinessReport(checks) {
  const labels = { pass: 'PASS', blocker: 'BLOCKER', warning: 'WARNING' }
  const lines = [
    'Exam staging readiness (read-only)',
    'ตรวจเฉพาะ isolation/configuration; ไม่เรียก network และไม่แสดงค่าที่ตั้งไว้',
    '',
  ]
  for (const check of checks) lines.push(`[${labels[check.status]}] ${check.field}: ${check.message}`)
  const blockers = checks.filter(check => check.status === 'blocker').length
  const warnings = checks.filter(check => check.status === 'warning').length
  const passed = checks.filter(check => check.status === 'pass').length
  lines.push('', `Summary: ${passed} passed, ${blockers} blocker(s), ${warnings} warning(s).`)
  lines.push(blockers === 0
    ? 'READY to continue with staging network/data checks.'
    : 'NOT READY: do not create QA accounts, attempts, answers, or uploads yet.')
  return lines.join('\n')
}
