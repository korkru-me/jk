/**
 * Finding the web links inside a plain-text announcement.
 *
 * Announcements are stored and edited as plain text — a teacher types or pastes
 * into a textarea, and what they typed is what every student reads. That is
 * worth keeping: there is no markup to learn and nothing to strip on the way
 * out. But a pasted Google Form URL that cannot be clicked is a link only in
 * name, so the text is split into runs at render time instead.
 *
 * The output is deliberately just segments. Nothing here builds HTML, so a body
 * containing `<script>` stays text that React escapes on its own — the reason
 * this is a splitter rather than a "turn text into HTML" helper.
 */

export interface TextSegment {
  type: 'text'
  value: string
}

export interface LinkSegment {
  type: 'link'
  /** What the teacher typed, shown as-is (possibly shortened by the UI). */
  value: string
  /** Where it actually goes. Always carries a scheme. */
  href: string
}

export type LinkedSegment = TextSegment | LinkSegment

/**
 * `http(s)://…` or a bare `www.…`. Bare domains (`school.ac.th`) are left
 * alone on purpose: "ส่งงานที่ห้อง 4.1" would otherwise become a link, and a
 * false link in an announcement is worse than a missing one.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi

/** Trailing characters that end a Thai/English sentence rather than a URL. */
const TRAILING = /[.,!?;:)\]}"'…]+$/

/**
 * Trims punctuation that belongs to the sentence, not the address — but keeps a
 * closing bracket that the URL itself opened, as Wikipedia links do.
 */
function trimTrailing(raw: string): string {
  let url = raw
  for (;;) {
    const trimmed = url.replace(TRAILING, '')
    if (trimmed === url) return url
    const cut = url.slice(trimmed.length)
    // A ) that closes a ( from inside the URL stays part of it.
    if (cut[0] === ')' && (trimmed.match(/\(/g) ?? []).length > (trimmed.match(/\)/g) ?? []).length) {
      return trimmed + ')'
    }
    url = trimmed
  }
}

export function hrefOf(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/** Splits `body` into plain runs and link runs, in order. Never loses text. */
export function linkify(body: string): LinkedSegment[] {
  const segments: LinkedSegment[] = []
  let cursor = 0

  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index
    const url = trimTrailing(match[0])
    if (!url) continue

    if (start > cursor) segments.push({ type: 'text', value: body.slice(cursor, start) })
    segments.push({ type: 'link', value: url, href: hrefOf(url) })
    cursor = start + url.length
  }

  if (cursor < body.length) segments.push({ type: 'text', value: body.slice(cursor) })
  return segments
}

/** A long URL shown in full breaks the layout; the middle is what matters least. */
export function shortenUrl(url: string, max = 48): string {
  const bare = url.replace(/^https?:\/\//i, '')
  if (bare.length <= max) return bare
  return `${bare.slice(0, max - 12)}…${bare.slice(-8)}`
}
