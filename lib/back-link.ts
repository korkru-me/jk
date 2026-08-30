/**
 * Where a back arrow goes: the page the reader actually came from.
 *
 * "ย้อนกลับ" means the page before this one, not the section above it. A page
 * reachable from more than one place — the Word import is reached from the
 * import chooser and from a button on the คลัง — cannot answer that from its
 * own path, so whoever links to it says where the reader was, and the arrow
 * reads it back.
 *
 * The remembered view travels as a whole URL rather than as a path plus
 * rebuilt query, so a คลัง on page 2 filtered to "นิวตัน" comes back as it was.
 * It arrives from the browser and is therefore not trusted: `resolveBackHref`
 * only ever returns a path inside this app, the same guard
 * `safeQuestionsRedirect` applies to the redirect a form posts.
 */

/** Query param naming the page to return to. */
export const BACK_PARAM = 'back'

/**
 * True for a value that is a path within this app.
 *
 * Rejects anything with a scheme, and `//host` / `/\host`, which browsers read
 * as protocol-relative URLs to somewhere else entirely — that is how a back
 * arrow turns into an open redirect.
 */
function isInternalPath(value: string): boolean {
  if (!value.startsWith('/')) return false
  if (value.startsWith('//') || value.startsWith('/\\')) return false
  return true
}

/**
 * Links to `target`, remembering the page being left.
 *
 * `from` is that page's full path and query — in a client component,
 * `` `${usePathname()}${search ? `?${search}` : ''}` ``.
 */
export function withBackHref(target: string, from: string): string {
  if (!isInternalPath(from)) return target
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}${BACK_PARAM}=${encodeURIComponent(from)}`
}

/**
 * The page a back arrow should go to.
 *
 * `fallback` is used when nothing was remembered — the page was opened from a
 * link that predates this, from a bookmark, or by typing the address. It should
 * be the most likely place to have come from, not necessarily the parent route.
 */
export function resolveBackHref(
  params: URLSearchParams | { get(name: string): string | null },
  fallback: string,
): string {
  const remembered = params.get(BACK_PARAM)
  if (!remembered) return fallback

  // Decoded once: `?back=%2Fquestions%3Ftab%3Dteam` is one param whose value is
  // a whole URL, and reading it with URLSearchParams has already undone that.
  return isInternalPath(remembered) ? remembered : fallback
}

/** Reads a back target out of a server page's `searchParams` object. */
export function backHrefFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: string,
): string {
  const value = searchParams[BACK_PARAM]
  const remembered = Array.isArray(value) ? value[0] : value
  return remembered && isInternalPath(remembered) ? remembered : fallback
}
