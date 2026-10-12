'use client'

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ContextualSidebarRenderer = (onNavigate?: () => void) => ReactNode

interface ContextualSidebarEntry {
  ownerId: string
  pathname: string
  render: ContextualSidebarRenderer
  classroomId?: string
}

interface PendingSidebarEntry {
  entry: ContextualSidebarEntry
  sourcePathname: string
  pathname: string
  search: string
}

export function sidebarSearchKey(search: string): string {
  const params = new URLSearchParams(search)
  params.sort()
  return params.toString()
}

interface SidebarContextValue {
  contextualSidebar: ContextualSidebarEntry | null
  pendingSidebar: PendingSidebarEntry | null
  registerContextualSidebar: (ownerId: string, pathname: string, render: ContextualSidebarRenderer, classroomId?: string) => void
  unregisterContextualSidebar: (ownerId: string) => void
  prepareSidebarNavigation: (href: string, classroomId: string) => void
  clearPendingSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarContextProvider({ children }: { children: ReactNode }) {
  const [contextualSidebar, setContextualSidebar] = useState<ContextualSidebarEntry | null>(null)
  const [pendingSidebar, setPendingSidebar] = useState<PendingSidebarEntry | null>(null)

  const registerContextualSidebar = useCallback((ownerId: string, pathname: string, render: ContextualSidebarRenderer, classroomId?: string) => {
    setContextualSidebar({ ownerId, pathname, render, classroomId })
    setPendingSidebar(current => (
      current?.entry.ownerId === ownerId && current.pathname !== pathname ? current : null
    ))
  }, [])

  const unregisterContextualSidebar = useCallback((ownerId: string) => {
    setContextualSidebar(current => current?.ownerId === ownerId ? null : current)
  }, [])

  const clearPendingSidebar = useCallback(() => setPendingSidebar(null), [])
  const prepareSidebarNavigation = useCallback((href: string, classroomId: string) => {
    // Carry only the already-rendered classroom context, never data inferred
    // from an arbitrary destination URL. The destination still authorizes it.
    if (!contextualSidebar || contextualSidebar.classroomId !== classroomId
      || contextualSidebar.pathname !== window.location.pathname) return
    const target = new URL(href, window.location.origin)
    if (target.origin !== window.location.origin
      || target.searchParams.get('classroom') !== classroomId) return
    setPendingSidebar({
      entry: contextualSidebar,
      sourcePathname: window.location.pathname,
      pathname: target.pathname,
      search: sidebarSearchKey(target.search),
    })
  }, [contextualSidebar])

  const value = useMemo(() => ({
    contextualSidebar,
    pendingSidebar,
    registerContextualSidebar,
    unregisterContextualSidebar,
    prepareSidebarNavigation,
    clearPendingSidebar,
  }), [contextualSidebar, pendingSidebar, registerContextualSidebar, unregisterContextualSidebar, prepareSidebarNavigation, clearPendingSidebar])

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebarContext must be used inside SidebarContextProvider')
  return context
}

export function useOptionalSidebarContext() {
  return useContext(SidebarContext)
}

/** Resolved pages without an authorized classroom must discard the carry-over. */
export function ClearPendingSidebar() {
  const { clearPendingSidebar } = useSidebarContext()
  useLayoutEffect(clearPendingSidebar, [clearPendingSidebar])
  return null
}

export function useContextualSidebar(pathname: string, render: ContextualSidebarRenderer, classroomId?: string) {
  const ownerId = useId()
  const { registerContextualSidebar, unregisterContextualSidebar } = useSidebarContext()

  useLayoutEffect(() => {
    registerContextualSidebar(ownerId, pathname, render, classroomId)
  }, [ownerId, pathname, registerContextualSidebar, render, classroomId])

  useLayoutEffect(() => (
    () => unregisterContextualSidebar(ownerId)
  ), [ownerId, unregisterContextualSidebar])
}
