/**
 * Remembering where the question bank was when the teacher left it.
 *
 * The bank keeps its search, filters and page in the URL, so going off to edit
 * a question and coming back to a bare `/questions` throws all of it away —
 * a search for "นิวตัน" on page 2 returns as an unfiltered page 1. The edit
 * page therefore carries the bank's own query string along in one param, and
 * hands it back when the form is saved or cancelled.
 */

/** Query param on the edit page holding the bank's encoded query string. */
export const RETURN_PARAM = 'from'

/** Where an edit lands when it has nothing to return to. */
export const QUESTIONS_PATH = '/questions'

/**
 * Reserved key inside the remembered view naming a แฟ้มโจทย์ editor to go back
 * to instead of the คลัง.
 *
 * A แฟ้ม's own editor lists its โจทย์ as full cards, so แก้ไข can now be
 * reached from there as well as from the คลัง — and landing back in the คลัง
 * afterwards would drop the teacher out of the แฟ้ม they were working through.
 * Only the แฟ้ม's id travels, never a path: the destination is rebuilt here, so
 * a hand-edited link cannot name somewhere else to redirect to.
 */
export const RETURN_SET_PARAM = 'set'

/** The แฟ้ม editor a return id points at. */
export const setEditPath = (setId: string) => `${QUESTIONS_PATH}/sets/${setId}/edit`

/** Ids are uuids; anything else is not a แฟ้ม this app ever linked to. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Builds the href of an edit page, tagging on the bank view to come back to.
 * `currentQuery` is the bank's own query string (`useSearchParams().toString()`).
 */
export function questionEditHref(editPath: string, currentQuery: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams(currentQuery)
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value)
  const query = params.toString()
  return query ? `${editPath}?${RETURN_PARAM}=${encodeURIComponent(query)}` : editPath
}

/**
 * The bank URL an edit form should return to, read from the edit page's params.
 *
 * Falls back to the older `?tab=team` links, which only ever remembered which
 * tab the reader was on — those URLs can still be sitting in someone's history.
 */
export function questionsReturnTo(params: URLSearchParams | { get(name: string): string | null }): string {
  const encoded = params.get(RETURN_PARAM)
  if (encoded) {
    const decoded = new URLSearchParams(encoded)
    const setId = decoded.get(RETURN_SET_PARAM)
    if (setId) return UUID.test(setId) ? setEditPath(setId) : QUESTIONS_PATH
    const query = decoded.toString()
    if (query) return `${QUESTIONS_PATH}?${query}`
    return QUESTIONS_PATH
  }
  return params.get('tab') === 'team' ? `${QUESTIONS_PATH}?tab=team` : QUESTIONS_PATH
}

/**
 * Guards the redirect target a form sends to the server: it arrives from the
 * browser, so it is only allowed to be the question bank and its query string.
 */
export function safeQuestionsRedirect(target: string | undefined): string {
  if (!target) return QUESTIONS_PATH
  if (target === QUESTIONS_PATH) return target
  // A แฟ้ม editor, rebuilt from its id rather than trusted as a path.
  const setMatch = /^\/questions\/sets\/([^/?#]+)\/edit$/.exec(target)
  if (setMatch && UUID.test(setMatch[1])) return setEditPath(setMatch[1])
  if (target.startsWith(`${QUESTIONS_PATH}?`)) {
    const query = new URLSearchParams(target.slice(QUESTIONS_PATH.length + 1)).toString()
    return query ? `${QUESTIONS_PATH}?${query}` : QUESTIONS_PATH
  }
  return QUESTIONS_PATH
}
