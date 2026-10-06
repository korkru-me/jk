'use client'

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SidebarDisplayContext = createContext(false)

/** Display only: route registration and permission checks stay unchanged. */
export function SidebarDisplayProvider({ compactOnDesktop, children }: {
  compactOnDesktop: boolean
  children: ReactNode
}) {
  return <SidebarDisplayContext.Provider value={compactOnDesktop}>{children}</SidebarDisplayContext.Provider>
}

export function useSidebarCompact() {
  return useContext(SidebarDisplayContext)
}

export function SidebarLabel({ children }: { children: ReactNode }) {
  const compact = useSidebarCompact()
  return <span className={cn('truncate', compact && 'md:sr-only')}>{children}</span>
}

export function SidebarButton({ label, children, endAdornment, className, ...props }: ComponentProps<typeof Button> & {
  label: string
  endAdornment?: ReactNode
}) {
  const compact = useSidebarCompact()
  return (
    <Button
      {...props}
      aria-label={label}
      title={compact ? label : undefined}
      className={cn('w-full justify-start transition-colors', className, compact && 'md:h-11 md:justify-center md:px-0')}
    >
      {children}
      <SidebarLabel>{label}</SidebarLabel>
      {endAdornment && <span className={cn('ml-auto', compact && 'md:hidden')}>{endAdornment}</span>}
    </Button>
  )
}
