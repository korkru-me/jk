'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  Copy,
  Plus,
  Repeat2,
} from 'lucide-react'
import { assignmentCreationHref, assignmentReuseHref } from '@/lib/assignment-creation'
import { Button } from '@/components/ui/button'
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
  const [menuLevel, setMenuLevel] = useState<'start' | 'type'>('start')

  return (
    <DropdownMenu onOpenChange={open => !open && setMenuLevel('start')}>
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
        {menuLevel === 'start' ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>เลือกวิธีมอบหมายงาน</DropdownMenuLabel>
            <DropdownMenuItem
              variant="primary"
              className="py-2"
              render={<Link href={assignmentReuseHref(classroomId)} onClick={onNavigate} />}
            >
              <Copy aria-hidden="true" />
              <span>นำงานเดิมมาใช้</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="primary"
              className="py-2"
              closeOnClick={false}
              onClick={() => setMenuLevel('type')}
            >
              <Plus aria-hidden="true" />
              <span>สร้างงานใหม่</span>
              <ChevronRight className="ml-auto" aria-hidden="true" />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel>เลือกประเภทงาน</DropdownMenuLabel>
            <DropdownMenuItem
              variant="primary"
              className="py-2 text-muted-foreground"
              closeOnClick={false}
              onClick={() => setMenuLevel('start')}
            >
              <ChevronLeft aria-hidden="true" />
              <span>กลับไปเลือกวิธี</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="primary"
              className="py-2"
              render={(
                <Link
                  href={assignmentCreationHref(classroomId, 'exercise')}
                  onClick={onNavigate}
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
                  onClick={onNavigate}
                />
              )}
            >
              <ClipboardPenLine aria-hidden="true" />
              <span>ข้อสอบ</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
