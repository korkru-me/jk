/** Automatic notices wait until the learner leaves an answer-taking route.
 * This includes waiting/secure launch states sharing an assignment's take URL. */
export function isStudentNoticeSuspendedPath(value: string | null | undefined): boolean {
  if (!value) return true
  const pathname = value.split(/[?#]/, 1)[0]
  return /^\/assignments\/[^/]+\/take(?:\/|$)/.test(pathname)
    || /^\/practice\/[^/]+\/exercises\/[^/]+\/take(?:\/|$)/.test(pathname)
    || /^\/practice\/[^/]+\/questions\/[^/]+(?:\/|$)/.test(pathname)
}
