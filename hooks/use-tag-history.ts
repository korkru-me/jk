'use client'

import { useCallback, useEffect, useState } from 'react'
import { normalizeTag, tagKey } from '@/lib/tag-suggest'

const STORAGE_KEY = 'korkru:tag-history'
/** Enough to cover a teacher's own vocabulary without growing without bound. */
const LIMIT = 200

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    return []
  }
}

function write(tags: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags))
  } catch {
    /* private mode or a full quota — suggestions simply do not persist */
  }
}

/**
 * Tags typed in this browser, most recent first.
 *
 * A tag only reaches `getAllTags()` once the question it belongs to is saved,
 * so without this the second question of a session gets no suggestion from the
 * first. Read after mount, never during render, so the server and the client
 * agree on the first paint.
 */
export function useTagHistory() {
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => setHistory(read()), [])

  const remember = useCallback((raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    setHistory(prev => {
      const key = tagKey(tag)
      const next = [tag, ...prev.filter(t => tagKey(t) !== key)].slice(0, LIMIT)
      write(next)
      return next
    })
  }, [])

  const forget = useCallback((raw: string) => {
    const key = tagKey(raw)
    setHistory(prev => {
      const next = prev.filter(t => tagKey(t) !== key)
      write(next)
      return next
    })
  }, [])

  return { history, remember, forget }
}
