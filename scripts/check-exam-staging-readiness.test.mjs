import { describe, expect, it } from 'vitest'
import {
  formatExamStagingReadinessReport,
  inspectExamStagingReadiness,
} from './check-exam-staging-readiness-core.mjs'

function validEnvironment(overrides = {}) {
  return {
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-qa',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-qa',
    ...overrides,
  }
}

describe('exam staging readiness', () => {
  it('accepts an isolated preview deployment', () => {
    const result = inspectExamStagingReadiness(validEnvironment())
    expect(result.ready).toBe(true)
    expect(result.checks).not.toContainEqual(expect.objectContaining({ status: 'blocker' }))
  })

  it('blocks production deployment and reused production origins', () => {
    const result = inspectExamStagingReadiness(validEnvironment({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://www.example.test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
    }))
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toHaveLength(3)
  })

  it('blocks localhost, non-Supabase hosts, credentials, and missing keys', () => {
    const result = inspectExamStagingReadiness(validEnvironment({
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'https://user:secret@example.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    }))
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toHaveLength(4)
  })

  it('never includes configured values in its report', () => {
    const environment = validEnvironment()
    const report = formatExamStagingReadinessReport(
      inspectExamStagingReadiness(environment).checks,
    )
    for (const field of [
      'NEXT_PUBLIC_SITE_URL',
      'EXAM_QA_PRODUCTION_SITE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'EXAM_QA_PRODUCTION_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]) expect(report).not.toContain(environment[field])
  })
})
