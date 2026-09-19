import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  formatStagingBootstrapReport,
  inspectStagingBootstrapReadiness,
} from './check-staging-bootstrap-core.mjs'

const manifest = JSON.parse(readFileSync(
  new URL('../supabase/bootstrap/manifest.json', import.meta.url),
  'utf8',
))

function validEnvironment(overrides = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging-ref.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-ref.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-staging',
    EXAM_QA_STAGING_DATABASE_URL: 'postgresql://postgres:secret@db.staging-ref.supabase.co:5432/postgres',
    ...overrides,
  }
}

function validInventory() {
  return {
    ...Object.fromEntries(manifest.orderedSteps.map(step => [step.path, true])),
    migrationStartsAt002: true,
  }
}

describe('staging bootstrap readiness', () => {
  it('accepts an isolated fresh-project plan', () => {
    const result = inspectStagingBootstrapReadiness(validEnvironment(), manifest, validInventory())
    expect(result.ready).toBe(true)
  })

  it('blocks a database URL that targets production', () => {
    const result = inspectStagingBootstrapReadiness(validEnvironment({
      EXAM_QA_STAGING_DATABASE_URL: 'postgresql://postgres:secret@db.production-ref.supabase.co:5432/postgres',
    }), manifest, validInventory())
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      status: 'blocker',
      field: 'database target',
    }))
  })

  it('blocks incomplete bootstrap files or a changed migration baseline', () => {
    const inventory = validInventory()
    inventory['supabase/schema.sql'] = false
    inventory.migrationStartsAt002 = false
    const result = inspectStagingBootstrapReadiness(validEnvironment(), manifest, inventory)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      status: 'blocker',
      field: 'bootstrap files',
    }))
  })

  it('never prints configured URLs, project refs, or secrets', () => {
    const environment = validEnvironment()
    const report = formatStagingBootstrapReport(
      inspectStagingBootstrapReadiness(environment, manifest, validInventory()).checks,
    )
    for (const field of [
      'NEXT_PUBLIC_SITE_URL',
      'EXAM_QA_PRODUCTION_SITE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'EXAM_QA_PRODUCTION_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'EXAM_QA_STAGING_DATABASE_URL',
    ]) expect(report).not.toContain(environment[field])
  })
})
