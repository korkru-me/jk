import { inspectDeploymentEnvironment } from './deployment-environment.mjs'

export const EXAM_SCREEN_LAB_PATH = '/exam-screen-lab'
export const SEB_QUIT_PATH = '/exam/quit'

/**
 * The synthetic device-QA lab is available locally and on a fully isolated
 * Staging preview. It must never be reachable from Production or an
 * incompletely labelled Preview deployment.
 */
export function isExamScreenLabEnabled(environment: NodeJS.ProcessEnv): boolean {
  if (environment.NODE_ENV !== 'production') return true

  const deployment = inspectDeploymentEnvironment(environment)
  return deployment.ready && deployment.tier === 'staging'
}

export function isExamScreenLabPath(pathname: string): boolean {
  return pathname === EXAM_SCREEN_LAB_PATH || pathname.startsWith(`${EXAM_SCREEN_LAB_PATH}/`)
}

export function isSebQuitPath(pathname: string): boolean {
  return pathname === SEB_QUIT_PATH
}

/**
 * Development lab requests bypass the global Supabase session refresh. The
 * exact native SEB Quit URL is also public: SEB intercepts it before an HTTP
 * request, while the fallback page must remain harmless and renderable when
 * someone opens the URL in a regular browser without an auth environment.
 */
export function shouldBypassSessionRefresh(
  pathname: string,
  environment: NodeJS.ProcessEnv,
): boolean {
  return isSebQuitPath(pathname)
    || (isExamScreenLabPath(pathname) && isExamScreenLabEnabled(environment))
}
