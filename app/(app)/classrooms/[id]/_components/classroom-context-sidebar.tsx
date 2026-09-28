'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, ChevronLeft, Menu } from 'lucide-react'
import type { Classroom } from '@/lib/types'
import type {
  ClassroomNavigationItem,
  ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { CLASSROOM_NAVIGATION_ICONS } from './classroom-navigation-icons'

interface ClassroomContextSidebarProps {
  classroom: Pick<Classroom, 'name' | 'description' | 'classroom_type'>
  backHref: string
  navigationItems: readonly ClassroomNavigationItem[]
  activeItem: ClassroomNavigationKey
  studentCount: number
  onNavigate: (item: ClassroomNavigationKey) => void
}

function ClassroomContextNavigation({
  classroom,
  backHref,
  navigationItems,
  activeItem,
  studentCount,
  onNavigate,
  onClose,
}: ClassroomContextSidebarProps & { onClose?: () => void }) {
  const meta = parseDescription(classroom.description)
  const subtitle = [meta.gradeLevel, meta.academicTerm].filter(Boolean).join(' • ')

  return (
    <div className="flex flex-col gap-3">
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

      <div className="px-2 text-xs font-medium text-muted-foreground">เมนูห้องเรียน</div>
      <nav aria-label="หน้าภายในห้องเรียน" className="flex flex-col gap-1">
        {navigationItems.map(item => {
          const Icon = CLASSROOM_NAVIGATION_ICONS[item.key]
          const selected = item.key === activeItem

          return (
            <Button
              key={item.key}
              type="button"
              variant={selected ? 'secondary' : 'ghost'}
              className="w-full justify-start"
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
          )
        })}
      </nav>
    </div>
  )
}

export function ClassroomContextSidebar(props: ClassroomContextSidebarProps) {
  return (
    <aside
      aria-label="เมนูห้องเรียน"
      className="sticky top-0 hidden max-h-[calc(var(--app-height,100dvh)-7rem)] w-72 shrink-0 overflow-y-auto lg:block"
    >
      <Card padding="sm">
        <ClassroomContextNavigation {...props} />
      </Card>
    </aside>
  )
}

export function ClassroomContextDrawer(props: ClassroomContextSidebarProps) {
  const [open, setOpen] = useState(false)
  const activeLabel = props.navigationItems.find(item => item.key === props.activeItem)?.label ?? 'ภาพรวม'

  return (
    <div className="lg:hidden">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Menu data-icon="inline-start" />
          <span>เมนูห้องเรียน</span>
        </span>
        <span className="truncate text-muted-foreground">{activeLabel}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="inset-y-0 left-0 top-0 h-dvh max-h-none w-[min(22rem,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 content-start rounded-none p-4 sm:max-w-none"
        >
          <DialogHeader>
            <DialogTitle>เมนูห้องเรียน</DialogTitle>
          </DialogHeader>
          <ClassroomContextNavigation {...props} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
