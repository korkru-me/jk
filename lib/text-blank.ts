// Splits HTML on every occurrence of `marker`, walking the DOM with Ranges so a
// naive string split doesn't cut a tag in half — e.g. "<p>...[x]</p>" would
// otherwise leave a dangling "</p>". Each returned fragment keeps only its own
// (correctly closed) formatting tags. Falls back to a plain string split for
// non-HTML text, or when running server-side (no DOM available).
export function splitHtmlOnMarker(html: string, marker: string): string[] {
  if (!html) return ['']
  if (typeof document === 'undefined' || !/<[a-z][\s\S]*>/i.test(html)) return html.split(marker)

  let container = document.createElement('div')
  container.innerHTML = html
  const parts: string[] = []

  for (;;) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let target: Text | null = null
    let idx = -1
    let node: Node | null
    while ((node = walker.nextNode())) {
      const i = (node as Text).data.indexOf(marker)
      if (i !== -1) { target = node as Text; idx = i; break }
    }
    if (!target) {
      parts.push(container.innerHTML)
      break
    }

    const beforeRange = document.createRange()
    beforeRange.setStart(container, 0)
    beforeRange.setEnd(target, idx)
    const beforeDiv = document.createElement('div')
    beforeDiv.appendChild(beforeRange.cloneContents())
    parts.push(beforeDiv.innerHTML)

    const afterRange = document.createRange()
    afterRange.setStart(target, idx + marker.length)
    afterRange.setEnd(container, container.childNodes.length)
    const afterDiv = document.createElement('div')
    afterDiv.appendChild(afterRange.cloneContents())
    container = afterDiv
  }

  return parts
}

// Same idea as splitHtmlOnMarker, but splits on every match of a regex with a
// single capture group instead of a fixed string — e.g. numbered markers like
// [คำตอบ 1], [คำตอบ 2]. Returns `parts` (N+1 fragments) alongside `captures`
// (the N captured groups, in order), so callers can pair each fragment
// boundary with what was captured there (e.g. the blank's number).
export function splitHtmlOnPattern(html: string, pattern: RegExp): { parts: string[]; captures: string[] } {
  if (!html) return { parts: [''], captures: [] }
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'

  if (typeof document === 'undefined' || !/<[a-z][\s\S]*>/i.test(html)) {
    const re = new RegExp(pattern.source, flags)
    const captures: string[] = []
    const parts: string[] = []
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      parts.push(html.slice(lastIndex, m.index))
      captures.push(m[1] ?? '')
      lastIndex = m.index + m[0].length
      if (m[0].length === 0) re.lastIndex++ // avoid infinite loop on zero-width matches
    }
    parts.push(html.slice(lastIndex))
    return { parts, captures }
  }

  let container = document.createElement('div')
  container.innerHTML = html
  const parts: string[] = []
  const captures: string[] = []

  for (;;) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let target: Text | null = null
    let match: RegExpExecArray | null = null
    let node: Node | null
    while ((node = walker.nextNode())) {
      const re = new RegExp(pattern.source, flags)
      const m = re.exec((node as Text).data)
      if (m) { target = node as Text; match = m; break }
    }
    if (!target || !match) {
      parts.push(container.innerHTML)
      break
    }

    captures.push(match[1] ?? '')

    const beforeRange = document.createRange()
    beforeRange.setStart(container, 0)
    beforeRange.setEnd(target, match.index)
    const beforeDiv = document.createElement('div')
    beforeDiv.appendChild(beforeRange.cloneContents())
    parts.push(beforeDiv.innerHTML)

    const afterRange = document.createRange()
    afterRange.setStart(target, match.index + match[0].length)
    afterRange.setEnd(container, container.childNodes.length)
    const afterDiv = document.createElement('div')
    afterDiv.appendChild(afterRange.cloneContents())
    container = afterDiv
  }

  return { parts, captures }
}
