'use client'

import Link from 'next/link'
import {
  ClipboardPenLine,
  BookOpenCheck,
  Copy,
  Plus,
  Repeat2,
} from 'lucide-react'
import { assignmentCreationHref, assignmentReuseHref } from '@/lib/assignment-creation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOptionalSidebarContext } from '@/components/layout/sidebar-context'
import { useAppFeatureFlags } from '@/components/layout/app-feature-flags'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AssignmentCreationMenuProps {
  classroomId: string
  label?: string
  variant?: 'default' | 'outline' | 'secondary' | 'navigation' | 'primaryGhost' | 'ghost'
  size?: 'default' | 'xs' | 'sm' | 'lg'
  className?: string
  align?: 'start' | 'center' | 'end'
  active?: boolean
  compactOnDesktop?: boolean
  onNavigate?: () => void
}

/**
 * Shared classroom entry point for assignments and no-score self-practice.
 * Only a terminal action navigates to the destination domain.
 */
export function AssignmentCreationMenu({
  classroomId,
  label = 'มอบหมายงานใหม่',
  variant = 'default',
  size = 'default',
  className,
  align = 'end',
  active = false,
  compactOnDesktop = false,
  onNavigate,
}: AssignmentCreationMenuProps) {
  const sidebar = useOptionalSidebarContext()
  const { practiceLibrary } = useAppFeatureFlags()
  const practiceHref = `/practice/new?${new URLSearchParams({ classroom: classroomId })}`
  function navigate(href: string) {
    sidebar?.prepareSidebarNavigation(href, classroomId)
    onNavigate?.()
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant={variant}
            size={size}
            className={cn('pl-3.5 pr-2.5 transition-colors has-data-[icon=inline-start]:pl-3.5 [&_svg:not([class*="size-"])]:size-4', className)}
            aria-label={label}
            title={compactOnDesktop ? label : undefined}
            aria-current={active ? 'page' : undefined}
          />
        )}
      >
        <Plus data-icon="inline-start" />
        <span className={cn('truncate', compactOnDesktop && 'md:sr-only')}>{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>เลือกสิ่งที่ต้องการสร้าง</DropdownMenuLabel>
          <DropdownMenuItem
            variant="primary"
            className="py-2"
            render={<Link href={assignmentReuseHref(classroomId)} onNavigate={() => navigate(assignmentReuseHref(classroomId))} />}
          >
            <Copy aria-hidden="true" />
            <span>นำงานเดิมมาใช้</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="primary"
            className="py-2"
            render={(
              <Link
                href={assignmentCreationHref(classroomId, 'exercise')}
                onNavigate={() => navigate(assignmentCreationHref(classroomId, 'exercise'))}
              />
            )}
          >
            <Repeat2 aria-hidden="true" />
            <span>แบบฝึกหัด</span>
          </DropdownMenuItem>
          {practiceLibrary && (
            <DropdownMenuItem
              variant="primary"
              className="py-2"
              render={(
                <Link
                  href={practiceHref}
                  onNavigate={() => navigate(practiceHref)}
                />
              )}
            >
              <BookOpenCheck aria-hidden="true" />
              <span>คลังฝึก</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="primary"
            className="py-2"
            render={(
              <Link
                href={assignmentCreationHref(classroomId, 'exam')}
                onNavigate={() => navigate(assignmentCreationHref(classroomId, 'exam'))}
              />
            )}
          >
            <ClipboardPenLine aria-hidden="true" />
            <span>ข้อสอบ</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
