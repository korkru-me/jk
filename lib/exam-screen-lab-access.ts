export const EXAM_SCREEN_LAB_PATH = '/exam-screen-lab'

/** The device-QA lab must never be reachable from a production build. */
export function isExamScreenLabEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production'
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
  nodeEnv: string | undefined,
): boolean {
  return isExamScreenLabEnabled(nodeEnv) && isExamScreenLabPath(pathname)
}
