import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ runCleanup: vi.fn() }))
vi.mock('@/lib/math-work-cleanup-server', () => ({
  MathWorkCleanupFailure: class MathWorkCleanupFailure extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  runMathWorkOrphanCleanup: mocks.runCleanup,
}))

import { GET } from '@/app/api/internal/math-work-cleanup/route'

const secret = '0123456789abcdef0123456789abcdef'
const previousSecret = process.env.CRON_SECRET

function request({ authorization, dryRun = false }: { authorization?: string; dryRun?: boolean } = {}) {
  return new NextRequest(`http://localhost/api/internal/math-work-cleanup${dryRun ? '?dryRun=1' : ''}`, {
    headers: authorization ? { authorization } : undefined,
  })
}

describe('math-work cleanup cron route', () => {
  beforeEach(() => {
    mocks.runCleanup.mockReset()
    process.env.CRON_SECRET = secret
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousSecret
  })

  it('fails closed before cleanup when the secret is missing or invalid', async () => {
    delete process.env.CRON_SECRET
    const unconfigured = await GET(request())
    expect(unconfigured.status).toBe(503)

    process.env.CRON_SECRET = secret
    const unauthorized = await GET(request({ authorization: 'Bearer wrong' }))
    expect(unauthorized.status).toBe(401)
    expect(mocks.runCleanup).not.toHaveBeenCalled()
  })

  it('runs an authorized dry-run without caching the response', async () => {
    mocks.runCleanup.mockResolvedValue({ dryRun: true, scannedObjects: 2, deleted: 0 })
    const response = await GET(request({ authorization: `Bearer ${secret}`, dryRun: true }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(mocks.runCleanup).toHaveBeenCalledWith({ dryRun: true })
    await expect(response.json()).resolves.toMatchObject({ success: true, dryRun: true, deleted: 0 })
  })
})
