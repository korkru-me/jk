'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PAGE_EXIT_EVENT, type PageExitConfirmation } from '@/components/layout/confirm-page-exit'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface HistoryTraversal extends Event {
  navigationType: string
  destination: { key: string; url: string; sameDocument: boolean }
}

interface BrowserNavigation extends EventTarget {
  traverseTo: (key: string) => { finished: Promise<unknown> }
}

function browserNavigation() {
  return (window as Window & { navigation?: BrowserNavigation }).navigation
}

export function useAssignmentDraftNavigation(dirty: boolean) {
  const router = useRouter()
  const [confirm, dialog] = useConfirm()
  const confirmationOpen = useRef(false)

  const confirmLeave = useCallback(async () => {
    if (confirmationOpen.current) return false
    confirmationOpen.current = true
    try {
      return await confirm({
        title: 'ออกจากหน้านี้โดยไม่บันทึก?',
        description: 'ข้อมูลที่กรอกและการตั้งค่าที่ยังไม่ได้บันทึกจะหายไปเมื่อออกจากหน้านี้',
        confirmLabel: 'ออกโดยไม่บันทึก',
        cancelLabel: 'กลับไปทำต่อ',
        variant: 'destructive',
      })
    } finally {
      confirmationOpen.current = false
    }
  }, [confirm])

  useEffect(() => {
    if (!dirty) return
    const navigation = browserNavigation()
    let replayKey: string | undefined

    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    function guardLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
        || event.shiftKey || event.altKey || !(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const target = new URL(anchor.href)
      const { origin, pathname, search } = window.location
      if (target.origin !== origin || (target.pathname === pathname && target.search === search)) return

      event.preventDefault()
      event.stopPropagation()
      void confirmLeave().then(leave => {
        if (leave) router.push(`${target.pathname}${target.search}${target.hash}`)
      })
    }

    function guardPageExit(rawEvent: Event) {
      const event = rawEvent as CustomEvent<PageExitConfirmation>
      if (typeof event.detail?.resolve !== 'function') return
      event.preventDefault()
      void confirmLeave().then(event.detail.resolve)
    }

    function guardHistory(rawEvent: Event) {
      const event = rawEvent as HistoryTraversal
      if (event.navigationType !== 'traverse' || !event.destination.sameDocument
        || !event.cancelable || replayKey === event.destination.key) return
      const target = new URL(event.destination.url)
      if (target.pathname === window.location.pathname && target.search === window.location.search) return

      event.preventDefault()
      void confirmLeave().then(async leave => {
        if (!leave || !navigation) return
        replayKey = event.destination.key
        try {
          await navigation.traverseTo(replayKey).finished
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            toast.error('เปิดหน้าที่เลือกไม่ได้ กรุณาลองออกจากหน้านี้อีกครั้ง')
          }
        } finally {
          replayKey = undefined
        }
      })
    }

    document.addEventListener('click', guardLink, true)
    window.addEventListener(PAGE_EXIT_EVENT, guardPageExit)
    window.addEventListener('beforeunload', beforeUnload)
    navigation?.addEventListener('navigate', guardHistory)
    return () => {
      document.removeEventListener('click', guardLink, true)
      window.removeEventListener(PAGE_EXIT_EVENT, guardPageExit)
      window.removeEventListener('beforeunload', beforeUnload)
      navigation?.removeEventListener('navigate', guardHistory)
    }
  }, [dirty, confirmLeave, router])

  async function back() {
    if (dirty && !browserNavigation() && !await confirmLeave()) return
    router.back()
  }

  return { back, dialog }
}
