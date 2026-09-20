import { describe, expect, it } from 'vitest'
import {
  isExamScreenLabEnabled,
  isExamScreenLabPath,
  shouldBypassSessionRefresh,
} from './exam-screen-lab-access'

describe('exam screen lab access', () => {
  const isolatedStaging = {
    NODE_ENV: 'production',
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
    EXAM_QA_PRODUCTION_SITE_URL: 'https://www.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co',
    EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-long-enough-for-staging',
  } satisfies NodeJS.ProcessEnv

  it('enables the lab locally and on an isolated staging preview', () => {
    expect(isExamScreenLabEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isExamScreenLabEnabled({ NODE_ENV: 'test' })).toBe(true)
    expect(isExamScreenLabEnabled(isolatedStaging)).toBe(true)
  })

  it('keeps the lab closed on production and malformed previews', () => {
    expect(isExamScreenLabEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(false)
    expect(isExamScreenLabEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(false)
    expect(isExamScreenLabEnabled({
      ...isolatedStaging,
      NEXT_PUBLIC_SUPABASE_URL: isolatedStaging.EXAM_QA_PRODUCTION_SUPABASE_URL,
    })).toBe(false)
  })

  it('matches only the dedicated lab route', () => {
    expect(isExamScreenLabPath('/exam-screen-lab')).toBe(true)
    expect(isExamScreenLabPath('/exam-screen-lab/check')).toBe(true)
    expect(isExamScreenLabPath('/exam-screen-laboratory')).toBe(false)
    expect(isExamScreenLabPath('/assignments/example/take')).toBe(false)
  })

  it('bypasses session refresh for the synthetic lab but never production', () => {
    expect(shouldBypassSessionRefresh('/exam-screen-lab', { NODE_ENV: 'development' })).toBe(true)
    expect(shouldBypassSessionRefresh('/exam-screen-lab', isolatedStaging)).toBe(true)
    expect(shouldBypassSessionRefresh('/exam-screen-lab', {
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    })).toBe(false)
    expect(shouldBypassSessionRefresh('/dashboard', { NODE_ENV: 'development' })).toBe(false)
  })
})
