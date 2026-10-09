import type { SebExamContextClaims, SebExamScope } from '@/lib/seb-exam-context-core'

export const SEB_EXAM_SURFACES = [
  'entry', 'login', 'profile', 'waiting', 'system-check', 'take', 'submitted',
  'api', 'resource', 'resource/upload', 'completion',
] as const
export type SebExamSurface = typeof SEB_EXAM_SURFACES[number]
export const SEB_EXAM_TRUSTED_PATHNAME_HEADER = 'x-korkru-seb-exam-pathname'
export interface SebExamRoute {
  assignmentId: string
  revision: number
  surface: SebExamSurface
}
export type SebExamRequestContext = SebExamContextClaims | 'absent' | 'invalid'
export type SebExamRequestDecision =
  | { allowed: true; kind: 'ordinary' | 'bootstrap' | 'exam' | 'auth_callback' | 'static'; route: SebExamRoute | null }
  | { allowed: false; reason: string; status: 403 | 405 | 415 }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const ROUTE = new RegExp(`^/exam/(${UUID})/r/([1-9][0-9]{0,9})/(${SEB_EXAM_SURFACES.join('|')})$`)

export function sebExamBasePath(scope: Pick<SebExamScope, 'assignmentId' | 'revision'>) {
  if (scope.assignmentId.length !== 36 || !new RegExp(`^${UUID}$`).test(scope.assignmentId) || !Number.isInteger(scope.revision)
    || scope.revision < 1 || scope.revision > 2_147_483_646) throw new Error('Invalid SEB exam route scope')
  return `/exam/${scope.assignmentId}/r/${scope.revision}`
}

export function sebExamRoutePath(scope: Pick<SebExamScope, 'assignmentId' | 'revision'>, surface: SebExamSurface) {
  if (!(SEB_EXAM_SURFACES as readonly string[]).includes(surface)) throw new Error('Invalid SEB exam surface')
  return `${sebExamBasePath(scope)}/${surface}`
}

export function parseSebExamRoute(pathname: string): SebExamRoute | null {
  const match = ROUTE.exec(pathname)
  if (!match || match[0] !== pathname) return null
  const revision = Number(match[2])
  if (revision > 2_147_483_646) return null
  return { assignmentId: match[1], revision, surface: match[3] as SebExamSurface }
}

function deny(reason: string, status: 403 | 405 | 415 = 403): SebExamRequestDecision {
  return { allowed: false, reason, status }
}

function safeStaticPath(pathname: string) {
  if (['/favicon.ico', '/icon.png', '/apple-icon.png', '/brand/deer-mark.svg', '/brand/deer-mark.png']
    .includes(pathname)) return true
  if (!pathname.startsWith('/_next/static/')) return false
  // No path normalization or percent-decoding aliases in this narrow resource allowlist.
  return /^\/_next\/static\/[A-Za-z0-9_./-]+$/.exec(pathname)?.[0] === pathname
    && pathname.split('/').slice(3).every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function isExamNamespace(pathname: string) {
  function matches(value: string) {
    const lower = value.toLowerCase()
    return lower === '/exam' || lower.startsWith('/exam/') || lower.startsWith('/exam\\')
      || lower.startsWith('/exam%2f') || lower.startsWith('/exam%5c')
  }
  if (matches(pathname)) return true
  try { return matches(decodeURIComponent(pathname)) } catch { return false }
}

/** Pure transport gate; context must first be signature/expiry verified by the caller. */
export function evaluateSebExamRequestPolicy(input: {
  pathname: string
  search?: string
  method: string
  hasNextAction?: boolean
  contentType?: string | null
  context: SebExamRequestContext
}): SebExamRequestDecision {
  const { pathname, context } = input
  const method = input.method.toUpperCase()
  const route = parseSebExamRoute(pathname)
  const examNamespace = isExamNamespace(pathname)
  const restricted = context !== 'absent' || examNamespace
  if (!restricted) return { allowed: true, kind: 'ordinary', route: null }
  if (input.hasNextAction) return deny('server_action_forbidden')
  if (context === 'invalid') return deny('invalid_context')
  if (examNamespace && !route) return deny('invalid_exam_route')
  if (context === 'absent') {
    return route?.surface === 'entry' && method === 'GET'
      ? { allowed: true, kind: 'bootstrap', route }
      : deny('missing_context')
  }
  if (pathname === '/auth/callback') {
    // Navigation exception only: the callback must also verify signed handoff + nonce.
    return method === 'GET'
      ? { allowed: true, kind: 'auth_callback', route: null }
      : deny('method_forbidden', 405)
  }
  if (safeStaticPath(pathname)) {
    return method === 'GET' || method === 'HEAD'
      ? { allowed: true, kind: 'static', route: null }
      : deny('method_forbidden', 405)
  }
  // Includes /_next/image: arbitrary image URLs must not tunnel around exam scope.
  if (!route) return deny('outside_exam_scope')
  if (route.assignmentId !== context.assignmentId || route.revision !== context.revision) {
    return deny('exam_scope_mismatch')
  }
  if (route.surface === 'completion' && (input.search ?? '') !== '') return deny('completion_query_forbidden')
  if (route.surface === 'resource' || route.surface === 'resource/upload') {
    if (context.userId === null) return deny('account_required')
  }
  if (route.surface === 'resource/upload') {
    if ((input.search ?? '') !== '') return deny('upload_query_forbidden')
    if (method !== 'POST') return deny('method_forbidden', 405)
    // The handler must independently validate signed target, CSRF, size and actual bytes.
    if (!['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      .includes(input.contentType?.trim().toLowerCase() ?? '')) return deny('upload_content_type_forbidden', 415)
  } else if (route.surface === 'api') {
    if (method !== 'POST') return deny('method_forbidden', 405)
    const contentType = input.contentType?.trim().toLowerCase() ?? ''
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/.test(contentType)) {
      return deny('json_required', 415)
    }
  } else if (method !== 'GET' && method !== 'HEAD') {
    // Blocks progressive form Server Action dispatch as well as Next-Action POSTs.
    return deny('method_forbidden', 405)
  }
  return { allowed: true, kind: 'exam', route }
}

/** Closed operation allowlist supplied by the dedicated JSON dispatcher. */
export function evaluateSebExamOperationPolicy(input: {
  operation: unknown
  allowedOperations: readonly string[]
  context: SebExamContextClaims
  scope: SebExamScope
  userId?: string | null
  requiresUser?: boolean
}) {
  if (typeof input.operation !== 'string' || !input.allowedOperations.includes(input.operation)) {
    return { allowed: false as const, reason: 'operation_forbidden' }
  }
  if (input.context.assignmentId !== input.scope.assignmentId
    || input.context.revision !== input.scope.revision
    || input.context.releaseId !== input.scope.releaseId) {
    return { allowed: false as const, reason: 'exam_scope_mismatch' }
  }
  if (input.requiresUser !== false
    && (!input.context.userId || !input.userId || input.context.userId !== input.userId)) {
    return { allowed: false as const, reason: 'account_mismatch' }
  }
  if (input.userId && input.context.userId && input.context.userId !== input.userId) {
    return { allowed: false as const, reason: 'account_mismatch' }
  }
  return { allowed: true as const }
}
