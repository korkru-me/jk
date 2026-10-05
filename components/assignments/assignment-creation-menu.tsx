'use client'

import Link from 'next/link'
import {
  ClipboardPenLine,
  Copy,
  Plus,
  Repeat2,
} from 'lucide-react'
import { assignmentCreationHref, assignmentReuseHref } from '@/lib/assignment-creation'
import { Button } from '@/components/ui/button'
import { useOptionalSidebarContext } from '@/components/layout/sidebar-context'
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
  onNavigate?: () => void
}

/**
 * Shared classroom entry point for assigning work. The choice happens in-place;
 * only a terminal action navigates to the reuse tool or the typed creator.
 */
export function AssignmentCreationMenu({
  classroomId,
  label = 'มอบหมายงานใหม่',
  variant = 'default',
  size = 'default',
  className,
  align = 'end',
  active = false,
  onNavigate,
}: AssignmentCreationMenuProps) {
  const sidebar = useOptionalSidebarContext()
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
            className={className}
            aria-current={active ? 'page' : undefined}
          />
        )}
      >
        <Plus data-icon="inline-start" />
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>เลือกงานที่ต้องการมอบหมาย</DropdownMenuLabel>
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
