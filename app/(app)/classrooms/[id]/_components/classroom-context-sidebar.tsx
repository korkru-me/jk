'use client'

import { Fragment, useId, type ReactNode } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ClipboardPenLine,
  LayoutDashboard,
  Plus,
  Repeat2,
} from 'lucide-react'
import type { Classroom } from '@/lib/types'
import { assignmentCreationHref } from '@/lib/assignment-creation'
import type {
  ClassroomNavigationItem,
  ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { CLASSROOM_NAVIGATION_ICONS } from './classroom-navigation-icons'

interface ClassroomContextSidebarProps {
  classroom: Pick<Classroom, 'id' | 'name' | 'description' | 'classroom_type'>
  backHref: string
  navigationItems: readonly ClassroomNavigationItem[]
  activeItem?: ClassroomNavigationKey
  assignmentCreationActive?: boolean
  studentCount: number
  onNavigate: (item: ClassroomNavigationKey) => void
  managementActions?: ReactNode
}

export function ClassroomContextNavigation({
  classroom,
  backHref,
  navigationItems,
  activeItem,
  assignmentCreationActive = false,
  studentCount,
  onNavigate,
  onClose,
  managementActions,
}: ClassroomContextSidebarProps & { onClose?: () => void }) {
  const navigationHeadingId = useId()
  const managementHeadingId = useId()
  const meta = parseDescription(classroom.description)
  const subtitle = [meta.gradeLevel, meta.academicTerm].filter(Boolean).join(' • ')

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button
        variant="ghost"
        className="w-full justify-start"
        render={<Link href={backHref} onClick={onClose} />}
      >
        <ChevronLeft data-icon="inline-start" />
        ห้องเรียนทั้งหมด
      </Button>

      <div className="flex items-start gap-3 px-2 py-1">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{classroom.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {subtitle || (classroom.classroom_type === 'homeroom' ? 'ห้องโฮมรูม' : 'ห้องเรียนวิชา')}
          </p>
        </div>
      </div>

      <Separator />

      <div id={navigationHeadingId} className="px-2 text-xs font-medium text-muted-foreground">
        เมนูห้องเรียน
      </div>
      <nav aria-labelledby={navigationHeadingId} className="flex flex-col gap-1">
        {navigationItems.map(item => {
          const Icon = CLASSROOM_NAVIGATION_ICONS[item.key]
          const selected = item.key === activeItem

          return (
            <Fragment key={item.key}>
              <Button
                type="button"
                variant={selected ? 'navigation' : item.key === 'invite' ? 'outline' : 'ghost'}
                className={item.key === 'invite' ? 'mt-2 w-full justify-start' : 'w-full justify-start'}
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  onNavigate(item.key)
                  onClose?.()
                }}
              >
                <Icon data-icon="inline-start" />
                <span className="truncate">{item.label}</span>
                {item.key === 'students' && (
                  <Badge variant="secondary" className="ml-auto">
                    {studentCount}
                  </Badge>
                )}
              </Button>

              {item.key === 'assignments' && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(
                      <Button
                        type="button"
                        variant={assignmentCreationActive ? 'navigation' : 'ghost'}
                        className="w-full justify-start data-popup-open:bg-primary/10 data-popup-open:text-primary"
                        aria-current={assignmentCreationActive ? 'page' : undefined}
                      />
                    )}
                  >
                    <Plus data-icon="inline-start" />
                    <span className="truncate">มอบหมายงาน</span>
                    <ChevronDown data-icon="inline-end" className="ml-auto" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        render={(
                          <Link
                            href={assignmentCreationHref(classroom.id, 'exercise')}
                            onClick={onClose}
                          />
                        )}
                      >
                        <Repeat2 />
                        แบบฝึกหัด
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        render={(
                          <Link
                            href={assignmentCreationHref(classroom.id, 'exam')}
                            onClick={onClose}
                          />
                        )}
                      >
                        <ClipboardPenLine />
                        ข้อสอบ
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Fragment>
          )
        })}
      </nav>

      {managementActions && (
        <section aria-labelledby={managementHeadingId} className="flex flex-col gap-2">
          <Separator />
          <div id={managementHeadingId} className="px-2 text-xs font-medium text-muted-foreground">
            จัดการห้องเรียน
          </div>
          {managementActions}
        </section>
      )}

      <Separator />
      <Button
        variant="ghost"
        className="w-full justify-start"
        render={<Link href="/dashboard" onClick={onClose} />}
      >
        <LayoutDashboard data-icon="inline-start" />
        เมนูหลัก
      </Button>
    </div>
  )
}
