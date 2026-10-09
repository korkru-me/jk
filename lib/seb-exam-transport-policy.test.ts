import { describe, expect, it } from 'vitest'
import { createSebExamContextClaims } from './seb-exam-context-core'
import {
  SEB_EXAM_SURFACES,
  evaluateSebExamOperationPolicy,
  evaluateSebExamRequestPolicy,
  parseSebExamRoute,
  sebExamBasePath,
  sebExamRoutePath,
  type SebExamRequestContext,
} from './seb-exam-transport-policy'

const assignmentId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const otherUserId = '33333333-3333-4333-8333-333333333333'
const scope = {
  assignmentId, revision: 7,
  releaseId: 'asr-11111111111141118111111111111111-r7-abcdef0123456789',
}
const context = createSebExamContextClaims(scope, { now: 1_800_000_000_000, userId })
const base = sebExamBasePath(scope)
const path = `${base}/waiting`
const decision = (pathname: string, marker: SebExamRequestContext = context, options: {
  method?: string; search?: string; hasNextAction?: boolean; contentType?: string
} = {}) => evaluateSebExamRequestPolicy({ pathname, method: 'GET', context: marker, ...options })

describe('canonical exam routes', () => {
  it('builds and parses only the explicit surface allowlist', () => {
    expect(base).toBe(`/exam/${assignmentId}/r/7`)
    for (const surface of SEB_EXAM_SURFACES) {
      const pathname = sebExamRoutePath(scope, surface)
      expect(parseSebExamRoute(pathname)).toEqual({ assignmentId, revision: 7, surface })
    }
  })

  it.each([
    base, `${base}/`, `${path}/`, `${path}\n`, `${base}/results`, `${base}/solutions`,
    `${base}/completion.seb`, `${base}/api/start`, `${base}/../waiting`,
    path.replace('/r/7/', '/r/07/'), path.replace('/r/7/', '/r/0/'),
    path.replace('/r/7/', '/r/2147483647/'), path.replace('/waiting', '/%77aiting'),
    path.replace('/r/', '/r%2f'), path.replace('11111111', 'AAAAAAAA'),
    path.replace('/exam/', '/exam%2f'), path.replace('/exam/', '/%65xam/'),
  ])('rejects a noncanonical path %j', pathname => {
    expect(parseSebExamRoute(pathname)).toBeNull()
    expect(decision(pathname).allowed).toBe(false)
    expect(decision(pathname, 'absent').allowed).toBe(false)
  })

  it('refuses invalid scope in route builders', () => {
    expect(() => sebExamBasePath({ assignmentId, revision: 0 })).toThrow()
    expect(() => sebExamBasePath({ assignmentId: `${assignmentId}\n`, revision: 7 })).toThrow()
  })
})

describe('exam-only request policy', () => {
  it('leaves normal browser routing and actions alone without a marker', () => {
    expect(decision('/dashboard', 'absent', { method: 'POST', hasNextAction: true })).toEqual({ allowed: true, kind: 'ordinary', route: null })
    expect(decision('/auth/callback', 'absent').allowed).toBe(true)
  })

  it('allows only GET entry to bootstrap a missing context', () => {
    expect(decision(`${base}/entry`, 'absent')).toMatchObject({ allowed: true, kind: 'bootstrap' })
    for (const surface of SEB_EXAM_SURFACES.filter(value => value !== 'entry')) {
      expect(decision(`${base}/${surface}`, 'absent').allowed).toBe(false)
    }
    expect(decision(`${base}/entry`, 'absent', { method: 'POST' }).allowed).toBe(false)
    expect(decision(`${base}/entry`, 'absent', { method: 'HEAD' }).allowed).toBe(false)
  })

  it.each(['/dashboard', '/login', '/assignments', '/api/foo', '/auth/callback', `${base}/entry`, path, '/_next/static/chunks/app.js'])('fails closed with an invalid marker at %j', pathname => {
    expect(decision(pathname, 'invalid')).toMatchObject({ allowed: false, reason: 'invalid_context' })
  })

  it('restricts valid pending and bound contexts to their exact scope', () => {
    expect(decision(path)).toMatchObject({ allowed: true, kind: 'exam' })
    expect(decision(path, { ...context, userId: null })).toMatchObject({ allowed: true, kind: 'exam' })
    expect(decision(`${base.replace('/r/7', '/r/8')}/entry`)).toMatchObject({ allowed: false, reason: 'exam_scope_mismatch' })
    expect(decision(path.replace(assignmentId, otherUserId))).toMatchObject({ allowed: false, reason: 'exam_scope_mismatch' })
    for (const pathname of ['/dashboard', '/login', '/assignments', '/assignments/x/results', '/api/foo', '/_next/image']) {
      expect(decision(pathname)).toMatchObject({ allowed: false, reason: 'outside_exam_scope' })
    }
  })

  it('rejects every general Server Action and form POST under restriction', () => {
    for (const pathname of [path, `${base}/entry`, `${base}/api`, '/auth/callback', '/_next/static/chunks/app.js']) {
      expect(decision(pathname, context, { hasNextAction: true })).toMatchObject({ allowed: false, reason: 'server_action_forbidden' })
    }
    for (const surface of SEB_EXAM_SURFACES.filter(value => value !== 'api' && value !== 'resource/upload')) {
      expect(decision(`${base}/${surface}`, context, { method: 'POST', contentType: 'application/x-www-form-urlencoded' })).toMatchObject({ allowed: false, status: 405 })
    }
  })

  it('permits only JSON POST to the scoped dispatcher', () => {
    expect(decision(`${base}/api`, context, { method: 'POST', contentType: 'application/json' }).allowed).toBe(true)
    expect(decision(`${base}/api`, context, { method: 'POST', contentType: 'Application/JSON; charset=UTF-8' }).allowed).toBe(true)
    expect(decision(`${base}/api`)).toMatchObject({ allowed: false, status: 405 })
    for (const contentType of ['', 'text/plain', 'multipart/form-data', 'application/json; charset=latin1', 'application/json; boundary=a']) {
      expect(decision(`${base}/api`, context, { method: 'POST', contentType })).toMatchObject({ allowed: false, status: 415 })
    }
  })

  it('allows OAuth handoff navigation but not callback actions or aliases', () => {
    expect(decision('/auth/callback')).toEqual({ allowed: true, kind: 'auth_callback', route: null })
    expect(decision('/auth/callback', { ...context, userId: null }).allowed).toBe(true)
    expect(decision('/auth/callback', context, { method: 'POST' })).toMatchObject({ allowed: false, status: 405 })
    expect(decision('/auth/callback/').allowed).toBe(false)
  })

  it('allows RSC query navigation on scoped pages but never queries on completion', () => {
    expect(decision(path, context, { search: '?_rsc=abc' }).allowed).toBe(true)
    expect(decision(`${base}/completion`).allowed).toBe(true)
    expect(decision(`${base}/completion`, context, { method: 'HEAD' }).allowed).toBe(true)
    expect(decision(`${base}/completion`, context, { search: '?' }).allowed).toBe(false)
    expect(decision(`${base}/completion`, context, { search: '?submitted=true' }).allowed).toBe(false)
  })

  it('requires bound scope for snapshot resources and only bounded binary upload transport', () => {
    expect(decision(`${base}/profile`).allowed).toBe(true)
    expect(decision(`${base}/resource`, context, { search: '?src=approved-by-handler' }).allowed).toBe(true)
    expect(decision(`${base}/resource`, { ...context, userId: null }).allowed).toBe(false)
    expect(decision(`${base}/resource`, context, { method: 'POST' }).allowed).toBe(false)
    expect(decision(`${base}/resource/upload`, context, { method: 'POST', contentType: 'application/octet-stream' }).allowed).toBe(true)
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(decision(`${base}/resource/upload`, context, { method: 'POST', contentType }).allowed).toBe(true)
    }
    for (const contentType of ['', 'multipart/form-data', 'application/x-www-form-urlencoded', 'text/html', 'application/json']) {
      expect(decision(`${base}/resource/upload`, context, { method: 'POST', contentType })).toMatchObject({ allowed: false, status: 415 })
    }
    expect(decision(`${base}/resource/upload`).allowed).toBe(false)
    expect(decision(`${base}/resource/upload`, context, { method: 'POST', contentType: 'image/png', search: '?target=other' }).allowed).toBe(false)
    expect(decision(`${base}/resource/upload`, { ...context, userId: null }, { method: 'POST', contentType: 'image/png' }).allowed).toBe(false)
    expect(decision(`${base}/resource/upload`, context, { method: 'POST', contentType: 'image/png', hasNextAction: true }).allowed).toBe(false)
  })

  it('allows only narrow static GET/HEAD paths and rejects image tunneling or traversal', () => {
    for (const pathname of ['/favicon.ico', '/icon.png', '/apple-icon.png', '/brand/deer-mark.svg', '/brand/deer-mark.png', '/_next/static/chunks/app.js', '/_next/static/media/font.woff2']) {
      expect(decision(pathname)).toMatchObject({ allowed: true, kind: 'static' })
      expect(decision(pathname, context, { method: 'HEAD' }).allowed).toBe(true)
      expect(decision(pathname, context, { method: 'POST' }).allowed).toBe(false)
    }
    for (const pathname of ['/brand/deer-mark-source.png', '/brand/legacy-icon.png', '/questions/leaked.png', '/classrooms/private.svg', '/_next/static/', '/_next/static/chunks/../app.js', '/_next/static/%2e%2e/app.js', '/_next/static//app.js', '/_next/static/chunks/app.js\n', '/_next/data/xxx.json', '/_next/image']) {
      expect(decision(pathname, context, { search: '?url=https://evil.test/image' }).allowed).toBe(false)
    }
  })
})

describe('closed scoped JSON operation policy', () => {
  const input = { operation: 'save', allowedOperations: ['save', 'start'], context, scope, userId }

  it('requires an explicit operation and exact scope/account', () => {
    expect(evaluateSebExamOperationPolicy(input)).toEqual({ allowed: true })
    for (const operation of ['getAttemptSolutions', 'admin', null, {}, '__proto__']) {
      expect(evaluateSebExamOperationPolicy({ ...input, operation }).allowed).toBe(false)
    }
    expect(evaluateSebExamOperationPolicy({ ...input, allowedOperations: [] }).allowed).toBe(false)
    expect(evaluateSebExamOperationPolicy({ ...input, scope: { ...scope, releaseId: `${scope.releaseId}0` } }).allowed).toBe(false)
    expect(evaluateSebExamOperationPolicy({ ...input, scope: { ...scope, revision: 8 } }).allowed).toBe(false)
    expect(evaluateSebExamOperationPolicy({ ...input, userId: otherUserId }).allowed).toBe(false)
    expect(evaluateSebExamOperationPolicy({ ...input, userId: null }).allowed).toBe(false)
  })

  it('lets the dispatcher explicitly allow only selected pending-auth operations', () => {
    const pending = { ...context, userId: null }
    expect(evaluateSebExamOperationPolicy({ ...input, context: pending }).allowed).toBe(false)
    expect(evaluateSebExamOperationPolicy({ ...input, operation: 'login', allowedOperations: ['login'], context: pending, userId: null, requiresUser: false })).toEqual({ allowed: true })
    expect(evaluateSebExamOperationPolicy({ ...input, userId: otherUserId, requiresUser: false }).allowed).toBe(false)
  })
})
