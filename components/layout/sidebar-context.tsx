'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
}

interface SidebarContextValue {
  contextualSidebar: ContextualSidebarEntry | null
  registerContextualSidebar: (ownerId: string, pathname: string, render: ContextualSidebarRenderer) => void
  unregisterContextualSidebar: (ownerId: string) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarContextProvider({ children }: { children: ReactNode }) {
  const [contextualSidebar, setContextualSidebar] = useState<ContextualSidebarEntry | null>(null)

  const registerContextualSidebar = useCallback((ownerId: string, pathname: string, render: ContextualSidebarRenderer) => {
    setContextualSidebar({ ownerId, pathname, render })
  }, [])

  const unregisterContextualSidebar = useCallback((ownerId: string) => {
    setContextualSidebar(current => current?.ownerId === ownerId ? null : current)
  }, [])

  const value = useMemo(() => ({
    contextualSidebar,
    registerContextualSidebar,
    unregisterContextualSidebar,
  }), [contextualSidebar, registerContextualSidebar, unregisterContextualSidebar])

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebarContext must be used inside SidebarContextProvider')
  return context
}

export function useContextualSidebar(pathname: string, render: ContextualSidebarRenderer) {
  const ownerId = useId()
  const { registerContextualSidebar, unregisterContextualSidebar } = useSidebarContext()

  useEffect(() => {
    registerContextualSidebar(ownerId, pathname, render)
  }, [ownerId, pathname, registerContextualSidebar, render])

  useEffect(() => (
    () => unregisterContextualSidebar(ownerId)
  ), [ownerId, unregisterContextualSidebar])
}
