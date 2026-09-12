/**
 * Taking an assignment needs the whole visible viewport. In particular, an
 * iPhone in landscape can cross Tailwind's `md` breakpoint and would otherwise
 * receive both the 256px app sidebar and the exam's own navigator.
 */
export function isAssignmentTakingPath(pathname: string): boolean {
  return /^\/assignments\/[^/]+\/take\/?$/.test(pathname)
}
