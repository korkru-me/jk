'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PAGE_EXIT_EVENT, type PageExitConfirmation } from '@/components/layout/confirm-page-exit'
import { useGradingBatch } from './grading-batch-provider'

// Keep the small Navigation API surface local: older DOM type libraries and
// browsers do not expose this API. Never depend on its presence for link guards.
interface HistoryEntry {
  key: string
  url: string | null
}

interface TraverseEvent extends Event {
  navigationType: string
  destination: { key: string; url: string; sameDocument: boolean }
}

interface BrowserNavigation extends EventTarget {
  currentEntry: HistoryEntry | null
  entries: () => HistoryEntry[]
  traverseTo: (key: string) => { finished: Promise<unknown> }
}

type PendingNavigation = { kind: 'href'; href: string } | { kind: 'traverse'; key: string } | { kind: 'callback'; resolve: (leave: boolean) => void }
type RestoreNavigation = { key: string; destinationKey: string }
type GuardBatch = Pick<ReturnType<typeof useGradingBatch>, 'dirtyCount' | 'busy' | 'awaitingRefresh'>
const LEGACY_DOCUMENT_MARKER = '__korkruGradingDocument'
const LEGACY_DOCUMENT_VERSION = 2
const LEGACY_BOOTSTRAP_PARAMETER = '__gradingDocument'

function activelySaving(batch: GuardBatch) {
  return batch.busy && !batch.awaitingRefresh
}

function needsWarning(batch: GuardBatch) {
  return batch.dirtyCount > 0 || activelySaving(batch)
}

function browserNavigation(): BrowserNavigation | undefined {
  return (window as Window & { navigation?: BrowserNavigation }).navigation
}

function pageIdentity(url: string) {
  const parsed = new URL(url, window.location.href)
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}

function isInsideBoundary(anchor: HTMLAnchorElement, url: URL) {
  const boundary = anchor.closest<HTMLElement>('[data-navigation-boundary]')?.dataset.navigationBoundary
  return !boundary || url.pathname === boundary || url.pathname.startsWith(`${boundary}/`)
}

/** Protect the grading batch without adding or replacing browser history entries. */
export function useGradingNavigationGuard(): { navigate: (href: string) => void; dialog: ReactNode } {
  const router = useRouter()
  const batch = useGradingBatch()
  const navigationRisk = needsWarning(batch)
  const batchRef = useRef(batch)
  batchRef.current = batch
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const pendingRef = useRef<PendingNavigation | null>(null)
  const leavingRef = useRef(false)
  const acceptedEntryRef = useRef<HistoryEntry | null>(null)
  const restoringRef = useRef<RestoreNavigation | null>(null)
  const replayKeyRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (browserNavigation() || needsWarning(batchRef.current) || window.history.state?.[LEGACY_DOCUMENT_MARKER] === LEGACY_DOCUMENT_VERSION) return
    // Reloading (or replacing the identical URL) can retain a shared SPA
    // Document in history. A distinct temporary query forces a fresh Document
    // for this entry; remove only that parameter once it has loaded. No extra
    // history entry, guessed traversal, student data cache, or global patch.
    const url = new URL(window.location.href)
    if (url.searchParams.has(LEGACY_BOOTSTRAP_PARAMETER)) {
      url.searchParams.delete(LEGACY_BOOTSTRAP_PARAMETER)
      window.history.replaceState({ ...window.history.state, [LEGACY_DOCUMENT_MARKER]: LEGACY_DOCUMENT_VERSION }, '', url.href)
      return
    }
    url.searchParams.set(LEGACY_BOOTSTRAP_PARAMETER, crypto.randomUUID())
    window.location.replace(url.href)
  }, [navigationRisk])

  const warnBusy = useCallback(() => {
    toast.info('กำลังบันทึกคะแนน กรุณารอสักครู่', { id: 'grading-navigation-busy' })
  }, [])

  const queue = useCallback((destination: PendingNavigation) => {
    if (activelySaving(batchRef.current)) {
      if (destination.kind === 'callback') destination.resolve(false)
      warnBusy()
      return
    }
    if (pendingRef.current) {
      if (destination.kind === 'callback') destination.resolve(false)
      return
    }
    pendingRef.current = destination
    setPending(destination)
  }, [warnBusy])

  const navigate = useCallback((href: string) => {
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return
    if (pageIdentity(url.href) === pageIdentity(window.location.href)) return
    if (activelySaving(batchRef.current)) { warnBusy(); return }
    const destination = `${url.pathname}${url.search}${url.hash}`
    if (batchRef.current.dirtyCount > 0 && !leavingRef.current) queue({ kind: 'href', href: destination })
    else if (browserNavigation()) router.push(destination)
    else window.location.assign(destination)
  }, [queue, router, warnBusy])

  useEffect(() => {
    if (!navigationRisk) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leavingRef.current || !needsWarning(batchRef.current)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [navigationRisk])

  useEffect(() => {
    const navigation = browserNavigation()
    acceptedEntryRef.current = navigation?.currentEntry ?? null
    let disposed = false

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || !isInsideBoundary(anchor, url) || pageIdentity(url.href) === pageIdentity(window.location.href)) return
      if (!needsWarning(batchRef.current) && navigation) return
      event.preventDefault()
      event.stopImmediatePropagation()
      navigate(url.href)
    }

    function onConfirmPageExit(rawEvent: Event) {
      const event = rawEvent as CustomEvent<PageExitConfirmation>
      if (typeof event.detail?.resolve !== 'function' || leavingRef.current || !needsWarning(batchRef.current)) return
      event.preventDefault()
      queue({ kind: 'callback', resolve: event.detail.resolve })
    }

    function onEntryChange() {
      const entry = navigation?.currentEntry
      if (!entry || restoringRef.current) return
      // A fragment change keeps the current grading screen and its draft alive.
      if (!needsWarning(batchRef.current) ||
          (entry.url && acceptedEntryRef.current?.url && pageIdentity(entry.url) === pageIdentity(acceptedEntryRef.current.url))) {
        acceptedEntryRef.current = entry
      }
    }

    function onNavigate(rawEvent: Event) {
      const event = rawEvent as TraverseEvent
      if (event.navigationType !== 'traverse' || !event.destination.sameDocument) return
      if (restoringRef.current?.key === event.destination.key) return
      if (replayKeyRef.current === event.destination.key) { replayKeyRef.current = null; return }
      if (leavingRef.current || !needsWarning(batchRef.current)) return
      if (pageIdentity(event.destination.url) === pageIdentity(window.location.href)) return
      // Some traversals (e.g. rapid browser retries) cannot be canceled. Their
      // popstate is handled below by returning to the exact saved entry key.
      if (!event.cancelable) return
      event.preventDefault()
      if (restoringRef.current) return
      queue({ kind: 'traverse', key: event.destination.key })
    }

    function restoreEntry(key: string) {
      if (!navigation) return
      void navigation.traverseTo(key).finished.catch((error: unknown) => {
        if (disposed || error instanceof DOMException && error.name === 'AbortError') return
        restoringRef.current = null
        toast.error('ไม่สามารถกลับมาที่หน้าตรวจคะแนนได้ กรุณาตรวจสอบคะแนนที่ยังไม่ได้บันทึก')
      })
    }

    function onPopState(event: PopStateEvent) {
      if (!navigation) {
        // Legacy exits load separate Documents instead (see initialization).
        // Never guess history.forward(), overwrite a destination, or add an
        // extra sentinel entry to attempt to cancel a non-cancelable popstate.
        return
      }
      const current = navigation.currentEntry
      const restoring = restoringRef.current
      if (restoring) {
        event.stopImmediatePropagation()
        if (current?.key !== restoring.key) { restoreEntry(restoring.key); return }
        restoringRef.current = null
        acceptedEntryRef.current = current
        if (activelySaving(batchRef.current)) warnBusy()
        else queue({ kind: 'traverse', key: restoring.destinationKey })
        return
      }
      if (leavingRef.current || !needsWarning(batchRef.current)) {
        acceptedEntryRef.current = current ?? null
        return
      }
      const accepted = acceptedEntryRef.current
      if (!current || !accepted || current.key === accepted.key || !navigation.entries().some(entry => entry.key === accepted.key)) return
      event.stopImmediatePropagation()
      restoringRef.current = { key: accepted.key, destinationKey: current.key }
      restoreEntry(accepted.key)
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener(PAGE_EXIT_EVENT, onConfirmPageExit)
    window.addEventListener('popstate', onPopState, true)
    navigation?.addEventListener('navigate', onNavigate)
    navigation?.addEventListener('currententrychange', onEntryChange)
    return () => {
      disposed = true
      document.removeEventListener('click', onClick, true)
      window.removeEventListener(PAGE_EXIT_EVENT, onConfirmPageExit)
      window.removeEventListener('popstate', onPopState, true)
      navigation?.removeEventListener('navigate', onNavigate)
      navigation?.removeEventListener('currententrychange', onEntryChange)
      if (pendingRef.current?.kind === 'callback') pendingRef.current.resolve(false)
      pendingRef.current = null
    }
  }, [navigate, queue, warnBusy])

  function cancel() {
    if (pendingRef.current?.kind === 'callback') pendingRef.current.resolve(false)
    pendingRef.current = null
    setPending(null)
  }

  function leave() {
    const destination = pendingRef.current
    if (!destination) return
    if (activelySaving(batchRef.current)) { warnBusy(); return }
    const navigation = browserNavigation()
    if (destination.kind === 'traverse' && (!navigation || !navigation.entries().some(entry => entry.key === destination.key))) {
      toast.error('ไม่พบหน้าที่ต้องการย้อนกลับ กรุณาเลือกหน้าอีกครั้ง')
      cancel()
      return
    }
    batchRef.current.discardChanges()
    leavingRef.current = true
    pendingRef.current = null
    setPending(null)
    if (destination.kind === 'callback') destination.resolve(true)
    else if (destination.kind === 'href') {
      if (navigation) router.push(destination.href)
      else window.location.assign(destination.href)
    } else {
      replayKeyRef.current = destination.key
      void navigation!.traverseTo(destination.key).finished.catch((error: unknown) => {
        leavingRef.current = false
        replayKeyRef.current = null
        if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('ไม่สามารถเปลี่ยนหน้าได้ กรุณาลองอีกครั้ง')
      })
    }
  }

  const dialog = <Dialog open={pending !== null} onOpenChange={() => {}}>
    <DialogContent showCloseButton={false} className="gap-3 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>ยังมีคะแนนที่ไม่ได้บันทึก</DialogTitle>
        <DialogDescription>มีคะแนนที่แก้ไข {batch.dirtyCount} รายการที่ยังไม่ได้บันทึก หากออกจากหน้า การแก้ไขคะแนนเหล่านี้จะถูกยกเลิก</DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-row flex-wrap py-3">
        <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={cancel}>กลับไปตรวจต่อ</Button>
        <Button type="button" variant="destructive" className="pointer-coarse:min-h-11" disabled={activelySaving(batch)} onClick={leave}>ออกโดยไม่บันทึก</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  return { navigate, dialog }
}
