'use client'

import Link from 'next/link'
import { BookOpen, ChevronLeft } from 'lucide-react'
import type { Classroom } from '@/lib/types'
import type {
  ClassroomNavigationItem,
  ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CLASSROOM_NAVIGATION_ICONS } from './classroom-navigation-icons'

interface ClassroomContextSidebarProps {
  classroom: Pick<Classroom, 'name' | 'description' | 'classroom_type'>
  navigationItems: readonly ClassroomNavigationItem[]
  activeItem: ClassroomNavigationKey
  studentCount: number
  onNavigate: (item: ClassroomNavigationKey) => void
}

export function ClassroomContextSidebar({
  classroom,
  navigationItems,
  activeItem,
  studentCount,
  onNavigate,
}: ClassroomContextSidebarProps) {
  const meta = parseDescription(classroom.description)
  const subtitle = [meta.gradeLevel, meta.academicTerm].filter(Boolean).join(' • ')

  return (
    <aside
      aria-label="เมนูห้องเรียน"
      className="sticky top-0 hidden max-h-[calc(var(--app-height,100dvh)-7rem)] w-72 shrink-0 overflow-y-auto lg:block"
    >
      <Card padding="sm" className="flex flex-col gap-3">
        <Button
          variant="ghost"
          className="w-full justify-start"
          render={<Link href="/classrooms" />}
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
                onClick={() => onNavigate(item.key)}
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
      </Card>
    </aside>
  )
}
