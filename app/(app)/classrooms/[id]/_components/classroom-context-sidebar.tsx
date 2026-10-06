'use client'

import { Fragment, useId, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronsUpDown,
  LayoutDashboard,
  School,
} from 'lucide-react'
import type { Classroom } from '@/lib/types'
import type {
  ClassroomNavigationItem,
  ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { coverOf, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarButton, useSidebarCompact } from '@/components/layout/sidebar-display'
import { AssignmentCreationMenu } from '@/components/assignments/assignment-creation-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { CLASSROOM_NAVIGATION_ICONS } from './classroom-navigation-icons'

interface ClassroomContextSidebarProps {
  classroom: Pick<Classroom, 'id' | 'name' | 'description' | 'classroom_type'>
  switchableClassrooms?: Array<Pick<Classroom, 'id' | 'name' | 'description'>>
  backHref: string
  navigationItems: readonly ClassroomNavigationItem[]
  activeItem?: ClassroomNavigationKey
  assignmentCreationActive?: boolean
  studentCount: number
  onNavigate: (item: ClassroomNavigationKey) => void
  onSwitchClassroom?: (classroomId: string) => void
  managementActions?: ReactNode
}

export function ClassroomContextNavigation({
  classroom,
  switchableClassrooms = [],
  backHref,
  navigationItems,
  activeItem,
  assignmentCreationActive = false,
  studentCount,
  onNavigate,
  onSwitchClassroom,
  onClose,
  managementActions,
}: ClassroomContextSidebarProps & { onClose?: () => void }) {
  const navigationHeadingId = useId()
  const compact = useSidebarCompact()
  const managementHeadingId = useId()
  const meta = parseDescription(classroom.description)
  const cover = coverOf(meta)
  const subtitle = [meta.gradeLevel, meta.academicTerm].filter(Boolean).join(' • ')
  const otherClassrooms = switchableClassrooms.filter(option => option.id !== classroom.id)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SidebarButton
        label="ห้องเรียนทั้งหมด"
        variant="ghost"
        className="w-full justify-start"
        render={<Link href={backHref} onClick={onClose} />}
      >
        <ChevronLeft data-icon="inline-start" />
      </SidebarButton>

      <div className={cn(
        'flex items-center gap-3 rounded-2xl border p-3',
        compact && 'md:flex-col md:gap-1 md:p-1',
        cover ? cn(cover.surface, cover.text) : 'border-primary/20 bg-primary/5',
      )} title={classroom.name}>
        <div className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm',
          compact && 'md:size-8',
          cover ? 'bg-current/10' : 'bg-primary text-primary-foreground',
        )}>
          <School aria-hidden="true" className={cn('size-6', compact && 'md:size-5')} />
        </div>
        <div className={cn('min-w-0 flex-1', compact && 'md:sr-only')}>
          <p className={cn('text-xs font-medium', cover ? cover.textMuted : 'text-primary')}>ห้องเรียนปัจจุบัน</p>
          <p className={cn('truncate text-lg font-bold leading-tight', cover ? cover.text : 'text-foreground')}>{classroom.name}</p>
          <p className={cn('truncate text-xs', cover ? cover.textMuted : 'text-muted-foreground')}>
            {subtitle || (classroom.classroom_type === 'homeroom' ? 'ห้องโฮมรูม' : 'ห้องเรียนวิชา')}
          </p>
        </div>
        {onSwitchClassroom && otherClassrooms.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="สลับไปห้องเรียนอื่น"
                  title="สลับไปห้องเรียนอื่น"
                />
              )}
            >
              <ChevronsUpDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>ไปห้องเรียนอื่น</DropdownMenuLabel>
                {otherClassrooms.map(option => {
                  const optionMeta = parseDescription(option.description)
                  const optionCover = coverOf(optionMeta)
                  const optionSubtitle = [optionMeta.gradeLevel, optionMeta.academicTerm]
                    .filter(Boolean)
                    .join(' • ')

                  return (
                    <DropdownMenuItem
                      key={option.id}
                      className="py-2"
                      onClick={() => {
                        onSwitchClassroom(option.id)
                        onClose?.()
                      }}
                    >
                      <span className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                        optionCover ? cn(optionCover.surface, optionCover.text) : 'bg-muted text-muted-foreground',
                      )}>
                        <School aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{option.name}</span>
                        {optionSubtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {optionSubtitle}
                          </span>
                        )}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem render={<Link href={backHref} onClick={onClose} />}>
                  <School />
                  ดูห้องเรียนทั้งหมด
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Separator />

      <div id={navigationHeadingId} className={cn('px-2 text-xs font-medium text-muted-foreground', compact && 'md:sr-only')}>
        เมนูห้องเรียน
      </div>
      <nav aria-labelledby={navigationHeadingId} className="flex flex-col gap-1">
        {navigationItems.map(item => {
          const Icon = CLASSROOM_NAVIGATION_ICONS[item.key]
          const selected = item.key === activeItem

          return (
            <Fragment key={item.key}>
              <SidebarButton
                label={item.label}
                type="button"
                variant={selected ? 'navigation' : 'ghost'}
                className="w-full justify-start"
                aria-current={selected ? 'page' : undefined}
                endAdornment={item.key === 'students' ? <Badge variant="secondary">{studentCount}</Badge> : undefined}
                onClick={() => {
                  onNavigate(item.key)
                  onClose?.()
                }}
              >
                <Icon data-icon="inline-start" />
              </SidebarButton>

              {item.key === 'assignments' && (
                <AssignmentCreationMenu
                  classroomId={classroom.id}
                  label="มอบหมายงาน"
                  variant={assignmentCreationActive ? 'navigation' : 'primaryGhost'}
                  className="w-full justify-start"
                  align="start"
                  active={assignmentCreationActive}
                  onNavigate={onClose}
                  compactOnDesktop={compact}
                />
              )}
            </Fragment>
          )
        })}
      </nav>

      {managementActions && (
        <section aria-labelledby={managementHeadingId} className="flex flex-col gap-2">
          <Separator />
          <div id={managementHeadingId} className={cn('px-2 text-xs font-medium text-muted-foreground', compact && 'md:sr-only')}>
            จัดการห้องเรียน
          </div>
          {managementActions}
        </section>
      )}

      <Separator />
      <SidebarButton
        label="เมนูหลัก"
        variant="ghost"
        className="w-full justify-start"
        render={<Link href="/dashboard" onClick={onClose} />}
      >
        <LayoutDashboard data-icon="inline-start" />
      </SidebarButton>
    </div>
  )
}
