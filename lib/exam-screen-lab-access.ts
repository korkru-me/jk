import { inspectDeploymentEnvironment } from './deployment-environment.mjs'

export const EXAM_SCREEN_LAB_PATH = '/exam-screen-lab'

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

/**
 * Development lab requests bypass the global Supabase session refresh. This
 * is what lets a physical device exercise the synthetic screen without the
 * production-linked local environment reading or refreshing an auth cookie.
 */
export function shouldBypassSessionRefresh(
  pathname: string,
  environment: NodeJS.ProcessEnv,
): boolean {
  return isExamScreenLabPath(pathname) && isExamScreenLabEnabled(environment)
}
