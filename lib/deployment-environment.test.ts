import { describe, expect, it } from 'vitest'
import {
  assertDeploymentEnvironment,
  inspectDeploymentEnvironment,
} from './deployment-environment.mjs'

function stagingEnvironment(overrides: Record<string, string> = {}) {
  return {
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-staging',
    ...overrides,
  }
}

describe('deployment environment contract', () => {
  it('allows local development without adding deployment metadata', () => {
    const result = inspectDeploymentEnvironment({})
    expect(result.tier).toBe('local')
    expect(result.ready).toBe(true)
  })

  it('allows the existing production deployment to infer its tier safely', () => {
    const result = inspectDeploymentEnvironment({ VERCEL_ENV: 'production' })
    expect(result.tier).toBe('production')
    expect(result.ready).toBe(true)
  })

  it('allows an explicitly isolated staging preview', () => {
    const result = inspectDeploymentEnvironment(stagingEnvironment())
    expect(result.tier).toBe('staging')
    expect(result.ready).toBe(true)
  })

  it('blocks an unlabelled preview before it can reuse production values', () => {
    const result = inspectDeploymentEnvironment({ VERCEL_ENV: 'preview' })
    expect(result.tier).toBe('unknown')
    expect(result.ready).toBe(false)
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: 'preview' })).toThrow(
      /KORKRU_DEPLOYMENT_ENV/,
    )
  })

  it('blocks staging when either site or Supabase matches production', () => {
    const result = inspectDeploymentEnvironment(stagingEnvironment({
      NEXT_PUBLIC_SITE_URL: 'https://www.example.test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co',
    }))
    expect(result.ready).toBe(false)
    expect(result.checks.filter(check => check.status === 'blocker')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'site isolation' }),
        expect.objectContaining({ field: 'Supabase isolation' }),
      ]),
    )
  })

  it('does not include configured URLs or credentials in thrown errors', () => {
    const environment = stagingEnvironment({
      NEXT_PUBLIC_SITE_URL: 'https://www.example.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sensitive-anon-value-that-must-not-leak',
    })
    try {
      assertDeploymentEnvironment(environment)
      throw new Error('expected deployment guard to block')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const value of Object.values(environment)) expect(message).not.toContain(value)
    }
  })
})
