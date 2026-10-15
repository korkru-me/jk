import { parseRandomValues, type RandomValues } from './math/fresh-random-values'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const key = (owner: string, library: string) => `korkru:practice-visible-variants:${owner}:${library}`

/** Only already-visible variable values, never answers, feedback, receipts or permissions. */
export function readPracticeVisibleValues(storage: Storage | undefined, owner: string, library: string, question: string): RandomValues | undefined {
  try { return parseRandomValues(JSON.parse(storage?.getItem(key(owner, library)) || '{}')[question]) ?? undefined } catch { return undefined }
}

export function rememberPracticeVisibleValues(storage: Storage | undefined, owner: string, library: string, question: string, values: RandomValues): void {
  try {
    if (!storage) return
    const raw: unknown = JSON.parse(storage.getItem(key(owner, library)) || '{}')
    const entries = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw).filter(([id, value]) => id !== question && parseRandomValues(value)).slice(-499) : []
    storage.setItem(key(owner, library), JSON.stringify(Object.fromEntries([...entries, [question, values]])))
  } catch { /* Fresh server draws still work when session storage is unavailable. */ }
}
