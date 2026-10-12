type MarkerMatch = { index: number; length: number; capture: string }

type OpenTag = { name: string; raw: string }

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])

// Unlike DOM Range, this tokenizer runs identically during SSR and hydration.
// It never examines marker-looking text inside attributes, and every fragment
// closes/reopens the formatting stack around an inline input boundary.
const HTML_TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</g

function closingTags(stack: readonly OpenTag[]): string {
  return [...stack].reverse().map(tag => `</${tag.name}>`).join('')
}

function openingTags(stack: readonly OpenTag[]): string {
  return stack.map(tag => tag.raw).join('')
}

function updateStack(stack: OpenTag[], token: string): void {
  const closing = /^<\/\s*([A-Za-z][\w:-]*)[^>]*>$/.exec(token)
  if (closing) {
    const name = closing[1].toLowerCase()
    const index = stack.map(tag => tag.name).lastIndexOf(name)
    if (index >= 0) stack.splice(index, 1)
    return
  }
  const opening = /^<\s*([A-Za-z][\w:-]*)\b[^>]*>$/.exec(token)
  if (!opening || /\/\s*>$/.test(token)) return
  const name = opening[1].toLowerCase()
  if (!VOID_TAGS.has(name)) stack.push({ name, raw: token })
}

function splitBalancedHtml(
  html: string,
  matchesInText: (text: string) => MarkerMatch[],
): { parts: string[]; captures: string[] } {
  if (!html) return { parts: [''], captures: [] }
  const parts: string[] = []
  const captures: string[] = []
  const stack: OpenTag[] = []
  let current = ''

  for (const token of html.match(HTML_TOKEN) ?? []) {
    if (token.startsWith('<')) {
      current += token
      updateStack(stack, token)
      continue
    }

    const matches = matchesInText(token)
    if (matches.length === 0) {
      current += token
      continue
    }
    let cursor = 0
    for (const match of matches) {
      current += token.slice(cursor, match.index)
      current += closingTags(stack)
      parts.push(current)
      captures.push(match.capture)
      current = openingTags(stack)
      cursor = match.index + match.length
    }
    current += token.slice(cursor)
  }

  current += closingTags(stack)
  parts.push(current)
  return { parts, captures }
}

// Splits on visible text only. Rich-text tags remain balanced in every piece,
// preventing server/client markup divergence around the inserted control.
export function splitHtmlOnMarker(html: string, marker: string): string[] {
  if (!marker) return [html]
  return splitBalancedHtml(html, text => {
    const matches: MarkerMatch[] = []
    let from = 0
    for (;;) {
      const index = text.indexOf(marker, from)
      if (index < 0) return matches
      matches.push({ index, length: marker.length, capture: '' })
      from = index + marker.length
    }
  }).parts
}

// Same operation for a regex with one capture group (the optional visible
// blank number). A fresh global regex per text token prevents lastIndex state
// from making SSR and hydration disagree.
export function splitHtmlOnPattern(
  html: string,
  pattern: RegExp,
): { parts: string[]; captures: string[] } {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return splitBalancedHtml(html, text => {
    const re = new RegExp(pattern.source, flags)
    const matches: MarkerMatch[] = []
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      matches.push({
        index: match.index,
        length: match[0].length,
        capture: match[1] ?? '',
      })
      if (match[0].length === 0) re.lastIndex += 1
    }
    return matches
  })
}
