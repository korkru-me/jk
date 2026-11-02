'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsUpDown, LayoutGrid, Plus, School, Trash2 } from 'lucide-react'
import type { Classroom } from '@/lib/types'
import { cn } from '@/lib/utils'
import { coverOf, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useContextualSidebar } from './sidebar-context'
import { SidebarLabel, SidebarSectionLabel, useSidebarCompact } from './sidebar-display'

type ClassroomOption = Pick<Classroom, 'id' | 'name' | 'description'>

export function ClassroomSectionSidebar({ classrooms }: { classrooms: ClassroomOption[] }) {
  const pathname = usePathname()
  const render = useCallback((onNavigate?: () => void) => (
    <ClassroomSectionNavigation pathname={pathname} classrooms={classrooms} onNavigate={onNavigate} />
  ), [pathname, classrooms])
  useContextualSidebar(pathname, render)
  return null
}

export function ClassroomSectionNavigation({ pathname, classrooms, onNavigate }: {
  pathname: string
  classrooms?: ClassroomOption[]
  onNavigate?: () => void
}) {
  const compact = useSidebarCompact()
  const items = [
    { href: '/classrooms', label: 'ห้องเรียนทั้งหมด', Icon: LayoutGrid },
    { href: '/classrooms/new', label: 'สร้างห้องเรียน', Icon: Plus },
    { href: '/classrooms/trash', label: 'ถังขยะ', Icon: Trash2 },
  ]
  const heading = <>
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <School aria-hidden="true" className="size-5" />
    </span>
    <span className={cn('min-w-0 flex-1', compact && 'md:hidden')}>
      <span className="block font-semibold text-foreground">ห้องเรียน</span>
      <span className="block text-xs font-normal text-muted-foreground">จัดการพื้นที่การเรียนรู้</span>
    </span>
  </>

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {classrooms ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={(
            <Button variant="ghost" aria-label="เปิดรายชื่อห้องเรียนทั้งหมด" title="เปิดรายชื่อห้องเรียนทั้งหมด"
              className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-1 text-left" />
          )}>
            {heading}
            <ChevronsUpDown aria-hidden="true" className={cn('ml-auto size-4 shrink-0 text-muted-foreground', compact && 'md:hidden')} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80 min-w-0 max-w-[calc(100vw-2rem)]">
            <DropdownMenuGroup>
              <DropdownMenuLabel>ไปห้องเรียน</DropdownMenuLabel>
              {classrooms.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">ยังไม่มีห้องเรียน</p>
              ) : classrooms.map(classroom => {
                const meta = parseDescription(classroom.description)
                const cover = coverOf(meta)
                const subtitle = [meta.gradeLevel, meta.academicTerm].filter(Boolean).join(' • ')
                return (
                  <DropdownMenuItem key={classroom.id} className="min-h-11 gap-2.5 py-2"
                    render={<Link href={`/classrooms/${classroom.id}`} onClick={onNavigate} />}>
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full border',
                      cover ? cn(cover.surface, cover.text) : 'bg-muted text-muted-foreground')}>
                      <ClassroomIcon iconKey={meta.iconKey} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" title={classroom.name}>{classroom.name}</span>
                      {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" render={<Link href="/classrooms" onClick={onNavigate} />}>
              <School /> ดูห้องเรียนทั้งหมด
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : <div className="flex items-start gap-3 px-2 py-1" title="ห้องเรียน">{heading}</div>}

      <Separator />
      <SidebarSectionLabel className="px-2 text-xs font-medium text-muted-foreground">เมนูห้องเรียน</SidebarSectionLabel>
      <nav aria-label="เมนูจัดการห้องเรียน" className="flex flex-col gap-1">
        {items.map(({ href, label, Icon }) => (
          <Link key={href} href={href} onClick={onNavigate}
            aria-current={pathname === href ? 'page' : undefined} title={compact ? label : undefined}
            className={cn('flex items-center gap-3 rounded-lg py-2.5 pl-3.5 pr-3 text-sm font-medium transition-colors',
              pathname === href ? 'bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-muted hover:text-foreground')}>
            <Icon aria-hidden="true" className="size-4" />
            <SidebarLabel>{label}</SidebarLabel>
          </Link>
        ))}
      </nav>
    </div>
  )
}
