import { parseRandomValues, type RandomValues } from './fresh-random-values'

export function visibleRandomValueStorage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}

function storageKey(identity: string) {
  let hash = 2166136261
  for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619)
  return `korkru:numeric-preview:${hash >>> 0}`
}

export function readVisibleRandomValues(storage: Pick<Storage, 'getItem'> | undefined, identity: string): RandomValues | undefined {
  try { return parseRandomValues(JSON.parse(storage?.getItem(storageKey(identity)) || 'null')) ?? undefined } catch { return undefined }
}

export function rememberVisibleRandomValues(storage: Pick<Storage, 'setItem'> | undefined, identity: string, values: RandomValues): void {
  try { storage?.setItem(storageKey(identity), JSON.stringify(values)) } catch { /* Optional visible-value history only. */ }
}
