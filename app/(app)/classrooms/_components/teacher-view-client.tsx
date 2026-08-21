'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, CheckSquare, X, Archive, Trash2, BookOpen, Users, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { bulkDeleteClassrooms, bulkArchiveClassrooms, togglePinClassroom } from '@/lib/actions/classrooms'
import { ClassroomCard } from './classroom-card'
import { HomeroomBanner } from './homeroom-banner'
import type { Classroom } from '@/lib/types'
import { Card } from '@/components/ui/card'

interface Props {
  classrooms: Classroom[]
  studentCountMap: Record<string, number>
  assignmentCountMap: Record<string, number>
  totalStudents: number
  totalAssignments: number
  archivedCount: number
  trashedCount: number
}

export function TeacherViewClient({
  classrooms, studentCountMap, assignmentCountMap,
  totalStudents, totalAssignments, archivedCount, trashedCount,
}: Props) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [, startPinTransition] = useTransition()

  const homeroomClassrooms = classrooms.filter(c => c.classroom_type === 'homeroom')
  const subjectClassrooms = classrooms.filter(c => c.classroom_type !== 'homeroom')

  function handleTogglePin(id: string, currentlyPinned: boolean) {
    startPinTransition(async () => {
      const res = await togglePinClassroom(id, !currentlyPinned)
      if (res?.error) toast.error(res.error)
      else toast.success(currentlyPinned ? 'เลิกปักหมุดแล้ว' : 'ปักหมุดห้องเรียนแล้ว')
    })
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(classrooms.map(c => c.id)))
  }

  function exitSelection() {
    setIsSelecting(false)
    setSelected(new Set())
  }

  function handleBulkArchive() {
    startTransition(async () => {
      const res = await bulkArchiveClassrooms([...selected])
      if (res?.error) { toast.error(res.error); return }
      toast.success(`เก็บถาวร ${selected.size} ห้องเรียนแล้ว`)
      exitSelection()
    })
  }

  function handleBulkDelete() {
    startTransition(async () => {
      const res = await bulkDeleteClassrooms([...selected])
      if (res?.error) { toast.error(res.error); return }
      toast.success(`ย้าย ${selected.size} ห้องเรียนไปถังขยะแล้ว`)
      exitSelection()
    })
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">ห้องเรียนของฉัน</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{classrooms.length} ห้องเรียน</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Archive / Trash links */}
          {archivedCount > 0 && (
            <Link
              href="/classrooms/archived"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <Archive className="w-4 h-4" />
              เก็บถาวร
              <span className="bg-muted text-muted-foreground text-xs font-semibold px-1.5 py-0.5 rounded-full">{archivedCount}</span>
            </Link>
          )}
          {trashedCount > 0 && (
            <Link
              href="/classrooms/trash"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              ถังขยะ
              <span className="bg-muted text-muted-foreground text-xs font-semibold px-1.5 py-0.5 rounded-full">{trashedCount}</span>
            </Link>
          )}
          {!isSelecting ? (
            <>
              {classrooms.length > 0 && (
                <button
                  onClick={() => setIsSelecting(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  เลือก
                </button>
              )}
              <Link href="/classrooms/new" className={cn(buttonVariants(), 'gap-2 shadow-sm')}>
                <Plus className="w-4 h-4" />
                สร้างห้องเรียน
              </Link>
            </>
          ) : (
            <button
              onClick={exitSelection}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
            >
              <X className="w-4 h-4" />
              ยกเลิก
            </button>
          )}
        </div>
      </div>

      {/* Selection mode sub-bar */}
      {isSelecting && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-primary">
            เลือกแล้ว {selected.size} ห้องเรียน
          </span>
          <button
            onClick={selected.size === classrooms.length ? () => setSelected(new Set()) : selectAll}
            className="text-xs text-primary underline hover:text-primary"
          >
            {selected.size === classrooms.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
          </button>
        </div>
      )}

      {/* Summary stats */}
      {classrooms.length > 0 && !isSelecting && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'ห้องเรียน', value: classrooms.length, icon: BookOpen, color: 'bg-primary/10 text-primary' },
            { label: 'นักเรียนรวม', value: totalStudents, icon: Users, color: 'bg-tint-1/10 text-tint-1' },
            { label: 'ชุดข้อสอบรวม', value: totalAssignments, icon: BookOpen, color: 'bg-warning/10 text-warning' },
          ].map(s => {
            const Icon = s.icon
            return (
              <Card edge="ring" padding="md" className="flex items-center gap-3" key={s.label}>
                <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground leading-none">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {classrooms.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl bg-muted/50">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีห้องเรียน</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">สร้างห้องเรียนแรกของคุณเพื่อเริ่มมอบหมายข้อสอบให้นักเรียน</p>
          <Link href="/classrooms/new" className={cn(buttonVariants(), 'gap-2')}>
            <Plus className="w-4 h-4" />
            สร้างห้องเรียน
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {homeroomClassrooms.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <GraduationCap className="w-3.5 h-3.5" /> ห้อง Homeroom
              </div>
              <div className="space-y-3">
                {homeroomClassrooms.map((c) => (
                  <HomeroomBanner
                    key={c.id}
                    classroom={c}
                    studentCount={studentCountMap[c.id] ?? 0}
                    isSelecting={isSelecting}
                    isSelected={selected.has(c.id)}
                    onToggle={() => toggleSelect(c.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {homeroomClassrooms.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <BookOpen className="w-3.5 h-3.5" /> ห้องเรียนวิชา
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {subjectClassrooms.map((c, i) => (
                <ClassroomCard
                  key={c.id}
                  classroom={c}
                  studentCount={studentCountMap[c.id] ?? 0}
                  assignmentCount={assignmentCountMap[c.id] ?? 0}
                  index={i}
                  isSelecting={isSelecting}
                  isSelected={selected.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onTogglePin={() => handleTogglePin(c.id, !!c.pinned_at)}
                />
              ))}
              {!isSelecting && (
                <Link
                  href="/classrooms/new"
                  className="border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-3 p-8 hover:border-primary/20 hover:bg-primary/10 transition-colors group min-h-[200px]"
                >
                  <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm text-muted-foreground group-hover:text-primary font-medium transition-colors">สร้างห้องเรียนใหม่</p>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar — sticky bottom */}
      {isSelecting && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-foreground text-background px-5 py-3 rounded-2xl shadow-2xl">
            <span className="text-sm font-medium">{selected.size} ห้องเรียน</span>
            <div className="w-px h-4 bg-card/20" />
            <button
              onClick={handleBulkArchive}
              disabled={isPending}
              className="flex items-center gap-1.5 text-sm hover:text-warning transition-colors disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              เก็บถาวร
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="flex items-center gap-1.5 text-sm hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              ย้ายไปถังขยะ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
