'use client'

import { useState, useTransition } from 'react'
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, X, IdCard, ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { removeStudent, removeStudents } from '@/lib/actions/classrooms'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StudentProfilePanel, type StudentProfileRow } from './homeroom-overview'
import { compareStudentsByRules, type StudentSortKey, type StudentSortRule } from '@/lib/student-sort'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

export type SortKey = StudentSortKey
export type SortRule = StudentSortRule

interface RealStudent { id: string; full_name: string; email: string }
interface Student extends RealStudent {
  initials: string
}

interface Props {
  classroomId: string
  students: RealStudent[]
  profiles?: Record<string, StudentProfileRow>
  canManage?: boolean
  /** Grade/room/number/code columns — any teacher who can manage this
   *  classroom (subject or homeroom), scoped per classroom. */
  showRoster?: boolean
  /** Full personal-info dialog (health/address/guardians) — homeroom
   *  advisor only, a stricter gate than showRoster. */
  showProfiles?: boolean
  /** Sort state lives in the parent so it survives switching tabs. */
  sortRules: SortRule[]
  onToggleSort: (key: SortKey) => void
}

// The name column uses minmax(0,1fr) rather than a bare 1fr — with a bare
// 1fr, each row's intrinsic width calc lets its own full_name+email length
// push the track wider, so rows (and the header) end up different total
// widths and the fixed columns after it drift out of alignment row to row.
const GRID_COLS_READ_ONLY = 'grid-cols-[auto_minmax(160px,1fr)]'
const GRID_COLS_MANAGE = 'grid-cols-[32px_auto_minmax(160px,1fr)_40px]'
const GRID_COLS_WITH_ROSTER = 'grid-cols-[32px_56px_auto_minmax(160px,1fr)_90px_80px_70px_85px_40px]'

export function StudentTable({
  classroomId, students, profiles = {}, canManage = false, showRoster = false, showProfiles = false,
  sortRules, onToggleSort,
}: Props) {
  const [confirm, confirmDialog] = useConfirm()
  const GRID_COLS = showRoster && canManage
    ? GRID_COLS_WITH_ROSTER
    : canManage ? GRID_COLS_MANAGE : GRID_COLS_READ_ONLY
  const augmented: Student[] = students.map(s => ({
    ...s,
    initials: s.full_name.slice(0, 2),
  }))

  const [query, setQuery] = useState('')
  const [viewingProfile, setViewingProfile] = useState<Student | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [isPending, startTransition] = useTransition()

  const filtered = augmented
    .filter(s =>
      s.full_name.toLowerCase().includes(query.toLowerCase()) ||
      s.email.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => compareStudentsByRules(a, b, profiles, sortRules))

  const selectedStudents = augmented.filter(student => selectedIds.has(student.id))
  const allStudentsSelected = students.length > 0 && students.every(student => selectedIds.has(student.id))
  const allFilteredSelected = filtered.length > 0 && filtered.every(student => selectedIds.has(student.id))
  const someFilteredSelected = filtered.some(student => selectedIds.has(student.id))

  function toggleStudent(studentId: string) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  function toggleFilteredStudents() {
    setSelectedIds(current => {
      const next = new Set(current)
      for (const student of filtered) {
        if (allFilteredSelected) next.delete(student.id)
        else next.add(student.id)
      }
      return next
    })
  }

  async function handleRemove(studentId: string, name: string) {
    const ok = await confirm({
      title: `นำ “${name}” ออกจากห้องเรียน?`,
      description: 'นักเรียนจะไม่เห็นห้องเรียนนี้อีก และเพิ่มกลับเข้ามาใหม่ได้ภายหลัง',
      confirmLabel: 'นำออก',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeStudent(classroomId, studentId)
      if (res?.error) toast.error(res.error)
      else {
        setSelectedIds(current => {
          const next = new Set(current)
          next.delete(studentId)
          return next
        })
        toast.success(`ลบ ${name} ออกแล้ว`)
      }
    })
  }

  async function handleBulkRemove() {
    const count = selectedStudents.length
    if (count === 0) return
    const previewNames = selectedStudents.slice(0, 3).map(student => student.full_name).join(', ')
    const remainder = count - 3
    const ok = await confirm({
      title: `นำนักเรียน ${count} คนออกจากห้องเรียน?`,
      description: (
        <>
          <span className="font-medium text-foreground">{previewNames}</span>
          {remainder > 0 && ` และอีก ${remainder} คน`}
          <span className="mt-1 block">นักเรียนจะไม่เห็นห้องเรียนนี้อีก และเพิ่มกลับเข้ามาใหม่ได้ภายหลัง</span>
        </>
      ),
      confirmLabel: `นำออก ${count} คน`,
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeStudents(classroomId, selectedStudents.map(student => student.id))
      if (res?.error) toast.error(res.error)
      else {
        setSelectedIds(new Set())
        toast.success(`นำนักเรียนออกแล้ว ${count} คน`)
      }
    })
  }

  function SortIcon({ col }: { col: SortKey }) {
    const ruleIndex = sortRules.findIndex(rule => rule.key === col)
    if (ruleIndex < 0) return <ChevronsUpDown className="size-3 text-muted-foreground/40" />
    const rule = sortRules[ruleIndex]
    return rule.dir === 'asc'
      ? <ChevronUp className="size-3 text-primary" />
      : <ChevronDown className="size-3 text-primary" />
  }

  function headerBtnClass(col: SortKey) {
    const ruleIndex = sortRules.findIndex(rule => rule.key === col)
    return cn(
      'flex items-center gap-1 rounded-lg px-2 py-1 -my-1 transition-colors',
      ruleIndex === 0 && 'bg-primary/10 font-semibold text-primary',
      ruleIndex > 0 && 'bg-background text-foreground',
      ruleIndex < 0 && 'hover:bg-muted hover:text-muted-foreground',
    )
  }

  function sortButtonTitle(col: SortKey) {
    const ruleIndex = sortRules.findIndex(rule => rule.key === col)
    if (ruleIndex < 0) return 'กดเพื่อใช้เป็นลำดับหลัก โดยคงการเรียงเดิมเป็นลำดับรอง'
    const rule = sortRules[ruleIndex]
    if (ruleIndex === 0) return `ลำดับหลัก: ${rule.dir === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'} · กดอีกครั้งเพื่อกลับทิศ`
    return 'ลำดับรอง · กดเพื่อเลื่อนเป็นลำดับหลัก'
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหานักเรียน..." className="w-full pl-8 pr-4 transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedStudents.length > 0 && (
              <Badge variant="secondary">เลือกแล้ว {selectedStudents.length} คน</Badge>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedIds(allStudentsSelected ? new Set() : new Set(students.map(student => student.id)))}
              disabled={students.length === 0 || isPending}
            >
              <ListChecks data-icon="inline-start" />
              {allStudentsSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </Button>
            {selectedStudents.length > 0 && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleBulkRemove}
                disabled={isPending}
              >
                <Trash2 data-icon="inline-start" />
                ลบนักเรียน {selectedStudents.length} คน
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <Card edge="ring" className="overflow-x-auto">
        {/* Header */}
        <div className={`grid ${GRID_COLS} gap-3 px-4 py-2.5 bg-muted border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide`}>
          {canManage && (
            <label className="flex items-center justify-center" title="เลือกนักเรียนที่แสดงทั้งหมด">
              <input
                type="checkbox"
                className="size-4 cursor-pointer accent-primary"
                checked={allFilteredSelected}
                ref={element => {
                  if (element) element.indeterminate = someFilteredSelected && !allFilteredSelected
                }}
                onChange={toggleFilteredStudents}
                aria-label="เลือกนักเรียนที่แสดงทั้งหมด"
              />
            </label>
          )}
          {showRoster && (
            <div className="text-center" title="ลำดับตามที่แสดงในตารางนี้ (เรียงคอลัมน์อื่นได้ แต่เลขนี้ไม่เปลี่ยน)">
              ลำดับ
            </div>
          )}
          <div className="w-8" />
          <button className={cn('text-left', headerBtnClass('name'))} onClick={() => onToggleSort('name')} title={sortButtonTitle('name')}>
            ชื่อ <SortIcon col="name" />
          </button>
          {showRoster && (
            <>
              <button className={headerBtnClass('grade')} onClick={() => onToggleSort('grade')} title={sortButtonTitle('grade')}>
                ระดับชั้น <SortIcon col="grade" />
              </button>
              <button className={headerBtnClass('section')} onClick={() => onToggleSort('section')} title={sortButtonTitle('section')}>
                ห้อง <SortIcon col="section" />
              </button>
              <button className={headerBtnClass('number')} onClick={() => onToggleSort('number')} title={sortButtonTitle('number')}>
                เลขที่ <SortIcon col="number" />
              </button>
              <button className={headerBtnClass('code')} onClick={() => onToggleSort('code')} title={sortButtonTitle('code')}>
                รหัสนักเรียน <SortIcon col="code" />
              </button>
            </>
          )}
          {canManage && <div />}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบนักเรียน</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((student, index) => {
              const profile = profiles[student.id]
              return (
                <div
                  key={student.id}
                  className={`grid ${GRID_COLS} gap-3 items-center px-4 py-3 hover:bg-muted/50 transition-colors relative`}
                >
                  {canManage && (
                    <label className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-primary"
                        checked={selectedIds.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        aria-label={`เลือก ${student.full_name}`}
                      />
                    </label>
                  )}
                  {showRoster && (
                    <span className="text-sm text-muted-foreground text-center">{index + 1}</span>
                  )}
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {student.initials}
                  </div>

                  {/* Name + email */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{student.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                    {showProfiles && (
                      <Button variant="link" size="sm"
                        onClick={() => setViewingProfile(student)} className="flex items-center gap-1 text-[11px] mt-0.5">
                        <IdCard className="w-3 h-3" /> ดูข้อมูลนักเรียน
                      </Button>
                    )}
                  </div>

                  {showRoster && (
                    <>
                      <span className="text-sm text-muted-foreground truncate">{profile?.grade_level || '—'}</span>
                      <span className="text-sm text-muted-foreground">{profile?.section_number ? `ห้อง ${profile.section_number}` : '—'}</span>
                      <span className="text-sm text-muted-foreground">{profile?.class_number ?? '—'}</span>
                      <span className="text-sm text-muted-foreground truncate">{profile?.student_code || '—'}</span>
                    </>
                  )}

                  {/* Destructive row action stays visible instead of hiding in a menu. */}
                  {canManage && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      onClick={() => handleRemove(student.id, student.full_name)}
                      disabled={isPending}
                      aria-label={`ลบ ${student.full_name} ออกจากห้องเรียน`}
                      title="ลบนักเรียนออก"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Student personal-info dialog (homeroom advisor only) */}
      <Dialog open={!!viewingProfile} onOpenChange={open => !open && setViewingProfile(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ข้อมูลนักเรียน: {viewingProfile?.full_name}</DialogTitle>
          </DialogHeader>
          {viewingProfile && <StudentProfilePanel profile={profiles[viewingProfile.id]} />}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}
