'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Clock, CheckCircle2, CircleDashed, MinusCircle, XCircle, Download, ChevronDown, Info } from 'lucide-react'
import { toast } from 'sonner'
import { notifyNonSubmitters } from '@/lib/actions/notifications'
import { setAssignmentDisplayOrder } from '@/lib/actions/classrooms'
import { computePassed } from '@/lib/grading'
import { officialSubmissionsByStudent } from '@/lib/scoring'
import { downloadTextFile, toCsv, safeFilenamePart } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExtensionDialog } from './extension-dialog'
import type { ClassroomAssignmentRow } from './classroom-assignments-tab'
import type { StudentProfileRow } from './homeroom-overview'
import type { SortKey as StudentTableSortKey, SortDir as StudentTableSortDir } from './student-table'
import { sortStudents, STUDENT_SORT_LABEL, type StudentSortKey } from '@/lib/student-sort'
import { Card } from '@/components/ui/card'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'ส่งแล้ว', graded: 'ส่งแล้ว', in_progress: 'กำลังทำ',
}

type TypeFilter = 'all' | 'exercise' | 'exam'

interface RealStudent { id: string; full_name: string; email: string }

interface SubmissionRow {
  id: string
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  attempt_number: number
}

interface ExtensionRow {
  id: string
  assignment_id: string
  student_id: string
  extended_end_at: string
  note: string | null
}

interface Props {
  classroomId: string
  classroomName: string
  students: RealStudent[]
  assignments: ClassroomAssignmentRow[]
  submissions: SubmissionRow[]
  extensions: ExtensionRow[]
  profiles?: Record<string, StudentProfileRow>
  /** Same sort state driving the "นักเรียน" tab, so both tabs show
   *  students in the same order. Falls back to name when the active sort
   *  is one of that tab's local-only columns (score/status — sample data
   *  with no counterpart here). */
  sortKey: StudentTableSortKey
  sortDir: StudentTableSortDir
  onViewStudents?: () => void
}

function isSyncableSortKey(key: StudentTableSortKey): key is StudentSortKey {
  return key in STUDENT_SORT_LABEL
}

export function ClassroomScoresMatrix({
  classroomId, classroomName, students, assignments, submissions, extensions, profiles = {},
  sortKey, sortDir, onViewStudents,
}: Props) {
  const [reminding, setReminding] = useState<string | null>(null)
  const [dialogTarget, setDialogTarget] = useState<{ assignmentId: string; studentId: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({})
  const [isOrderPending, startOrderTransition] = useTransition()

  function commitOrder(assignmentId: string, raw: string) {
    const trimmed = raw.trim()
    const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      toast.error('ลำดับต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป')
      setOrderDrafts(d => { const next = { ...d }; delete next[assignmentId]; return next })
      return
    }
    startOrderTransition(async () => {
      const res = await setAssignmentDisplayOrder(classroomId, assignmentId, parsed)
      if (res?.error) toast.error(res.error)
      setOrderDrafts(d => { const next = { ...d }; delete next[assignmentId]; return next })
    })
  }

  // Mirror the same student order as the "นักเรียน" tab. If that tab is
  // currently sorted by one of its local-only columns (score/status —
  // sample data with no counterpart here), fall back to name.
  const effectiveSortKey: StudentSortKey = isSyncableSortKey(sortKey) ? sortKey : 'name'
  const orderedStudents = sortStudents(students, profiles, effectiveSortKey, sortDir)
  const sortLabel = STUDENT_SORT_LABEL[effectiveSortKey]

  // Default order (no manual display_order set) is oldest-assigned-first —
  // whichever assignment the teacher gave to students first leads the table.
  // A teacher-set display_order always wins over that default.
  const visibleAssignments = assignments
    .filter(a => typeFilter === 'all' ? true : a.type === typeFilter)
    .slice()
    .sort((x, y) => {
      const ox = x.display_order ?? Infinity
      const oy = y.display_order ?? Infinity
      if (ox !== oy) return ox - oy
      return new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
    })

  // (assignmentId, studentId) -> official submission per that assignment's score_strategy
  const subKey = (aId: string, sId: string) => `${aId}::${sId}`
  const strategyByAssignment = new Map(assignments.map(a => [a.id, a.score_strategy]))
  const submissionsByAssignment = new Map<string, SubmissionRow[]>()
  for (const s of submissions) {
    const arr = submissionsByAssignment.get(s.assignment_id) ?? []
    arr.push(s)
    submissionsByAssignment.set(s.assignment_id, arr)
  }
  const bestSubmission = new Map<string, SubmissionRow>()
  for (const [assignmentId, subs] of submissionsByAssignment) {
    const strategy = strategyByAssignment.get(assignmentId) ?? 'best'
    const officialByStudent = officialSubmissionsByStudent(subs, strategy)
    for (const [studentId, official] of officialByStudent) {
      bestSubmission.set(subKey(assignmentId, studentId), { ...official.representative, total_score: official.total_score, max_score: official.max_score })
    }
  }

  const extensionMap = new Map<string, ExtensionRow>()
  for (const e of extensions) extensionMap.set(subKey(e.assignment_id, e.student_id), e)

  function handleRemind(assignmentId: string) {
    setReminding(assignmentId)
    startTransition(async () => {
      const res = await notifyNonSubmitters(assignmentId, classroomId)
      setReminding(null)
      if (res?.error) toast.error(res.error)
      else if ((res?.notified ?? 0) === 0) toast.info('ไม่มีนักเรียนที่ต้องเตือนเพิ่ม')
      else toast.success(`เตือนนักเรียนที่ยังไม่ส่งแล้ว ${res.notified} คน`)
    })
  }

  function cellText(assignmentId: string, studentId: string) {
    const sub = bestSubmission.get(subKey(assignmentId, studentId))
    if (!sub || (sub.status !== 'submitted' && sub.status !== 'graded')) {
      return ''
    }
    return sub.total_score ?? 0
  }

  function exportAll() {
    // Mirrors exactly what's on screen: same columns, same order, same filter.
    const header = ['ลำดับ', 'นักเรียน', 'อีเมล', ...visibleAssignments.map(a => a.title)]
    const rows = orderedStudents.map((s, i) => [
      i + 1, s.full_name, s.email,
      ...visibleAssignments.map(a => cellText(a.id, s.id)),
    ])
    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-')
    downloadTextFile(
      `คะแนน-${safeFilenamePart(classroomName)}-${dateStr}.csv`,
      toCsv([header, ...rows]),
      'text/csv;charset=utf-8;'
    )
    toast.success('ส่งออกข้อมูลคะแนนแล้ว')
  }

  function exportAssignment(assignment: ClassroomAssignmentRow) {
    const header = ['ลำดับ', 'นักเรียน', 'อีเมล', 'สถานะ', 'คะแนน', 'คะแนนเต็ม', 'ผลการประเมิน', 'ส่งเมื่อ', 'ครั้งที่', 'ขยายเวลาถึง']
    const rows = orderedStudents.map((s, i) => {
      const sub = bestSubmission.get(subKey(assignment.id, s.id))
      const submitted = sub?.status === 'submitted' || sub?.status === 'graded'
      const passed = submitted
        ? computePassed(sub!.total_score, sub!.max_score, assignment.passing_type, assignment.passing_value)
        : null
      const extension = extensionMap.get(subKey(assignment.id, s.id))
      return [
        i + 1, s.full_name, s.email,
        sub ? (STATUS_LABEL[sub.status] ?? sub.status) : 'ยังไม่ทำ',
        submitted ? sub!.total_score ?? 0 : '',
        submitted ? sub!.max_score : '',
        passed === null ? '' : (passed ? 'ผ่าน' : 'ไม่ผ่าน'),
        sub?.submitted_at ? new Date(sub.submitted_at).toLocaleString('th-TH') : '',
        sub?.attempt_number ?? '',
        extension ? new Date(extension.extended_end_at).toLocaleString('th-TH') : '',
      ]
    })
    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-')
    downloadTextFile(
      `คะแนน-${safeFilenamePart(assignment.title)}-${dateStr}.csv`,
      toCsv([header, ...rows]),
      'text/csv;charset=utf-8;'
    )
    toast.success('ส่งออกข้อมูลงานนี้แล้ว')
  }

  if (assignments.length === 0) {
    return (
      <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
        ยังไม่มีงานที่มอบหมายให้ห้องนี้
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter chips + export */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'exercise', label: 'แบบฝึกหัด' },
            { key: 'exam', label: 'ข้อสอบ' },
          ] as { key: TypeFilter; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                typeFilter === f.key ? 'bg-gray-900 text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visibleAssignments.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-all outline-none">
              <Download className="w-3.5 h-3.5" /> ส่งออกข้อมูล <ChevronDown className="w-3 h-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuItem onClick={exportAll}>
                <Download className="w-3.5 h-3.5 text-muted-foreground" /> ส่งออกทั้งหมด (ตามตารางนี้)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>ส่งออกเฉพาะงาน</DropdownMenuLabel>
                {visibleAssignments.map(a => (
                  <DropdownMenuItem key={a.id} onClick={() => exportAssignment(a)}>
                    <span className="truncate">{a.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0" />
        รายชื่อเรียงตาม<strong className="font-semibold text-muted-foreground">{sortLabel}</strong> ({sortDir === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'}) ตามที่ตั้งไว้ที่แท็บ
        {onViewStudents ? (
          <button onClick={onViewStudents} className="text-primary hover:underline font-medium">
            &ldquo;นักเรียน&rdquo;
          </button>
        ) : (
          <span className="font-medium text-muted-foreground">&ldquo;นักเรียน&rdquo;</span>
        )}
        — ไปเปลี่ยนได้ที่นั่น
      </p>

      {visibleAssignments.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          ไม่พบงานที่ตรงกับตัวกรอง
        </Card>
      ) : (
      <Card edge="ring" className="overflow-x-auto">
        {/* border-separate (not -collapse): sticky positioning on table
            cells doesn't reliably paint over a collapsed border seam, which
            let scrolled-under content show through the gap between the
            sticky ลำดับ/นักเรียน columns. */}
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            {/* Row-divider borders live on the cells, not the <tr> — the
                separated-borders table model (needed above) doesn't render
                borders set directly on rows. */}
            <tr>
              <th className="sticky left-0 z-20 bg-card text-center px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16 min-w-16 max-w-16 border-b border-border">
                ลำดับ
              </th>
              <th className="sticky left-16 z-20 bg-card text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[180px] border-b border-border">
                นักเรียน
              </th>
              {visibleAssignments.map(a => {
                const hasNonSubmitter = orderedStudents.some(s => {
                  const sub = bestSubmission.get(subKey(a.id, s.id))
                  return !sub || (sub.status !== 'submitted' && sub.status !== 'graded')
                })
                return (
                  <th key={a.id} className="px-3 py-3 text-center min-w-[140px] border-b border-border">
                    <input
                      type="number"
                      min={1}
                      value={orderDrafts[a.id] ?? a.display_order ?? ''}
                      onChange={e => setOrderDrafts(d => ({ ...d, [a.id]: e.target.value }))}
                      onBlur={e => commitOrder(a.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      disabled={isOrderPending}
                      placeholder="-"
                      title="ลำดับคอลัมน์ (ยิ่งน้อยยิ่งอยู่ซ้าย)"
                      className="w-10 mx-auto mb-1 block text-xs text-center rounded-lg border border-border py-0.5 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50"
                    />
                    <Link href={`/assignments/${a.id}`} className="text-xs font-semibold text-muted-foreground hover:text-primary line-clamp-2">
                      {a.title}
                    </Link>
                    <button
                      onClick={() => handleRemind(a.id)}
                      disabled={!hasNonSubmitter || reminding === a.id}
                      className={`mt-1.5 mx-auto flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                        hasNonSubmitter
                          ? 'bg-warning/10 text-warning hover:bg-warning/10'
                          : 'bg-muted text-muted-foreground/40 cursor-default'
                      }`}
                    >
                      <Bell className="w-2.5 h-2.5" />
                      {reminding === a.id ? 'กำลังเตือน...' : 'เตือน'}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {orderedStudents.map((student, index) => (
              <tr key={student.id} className="hover:bg-muted/50">
                <td className="sticky left-0 z-10 bg-card px-2 py-2.5 text-center text-sm text-muted-foreground w-16 min-w-16 max-w-16 border-b border-border">
                  {index + 1}
                </td>
                <td className="sticky left-16 z-10 bg-card px-4 py-2.5 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{student.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[160px]">{student.email}</p>
                </td>
                {visibleAssignments.map(a => {
                  const sub = bestSubmission.get(subKey(a.id, student.id))
                  const extension = extensionMap.get(subKey(a.id, student.id))
                  const submitted = sub?.status === 'submitted' || sub?.status === 'graded'
                  const inProgress = sub?.status === 'in_progress'
                  const passed = submitted
                    ? computePassed(sub!.total_score, sub!.max_score, a.passing_type, a.passing_value)
                    : null

                  return (
                    <td key={a.id} className="px-3 py-2.5 text-center group relative border-b border-border">
                      {submitted ? (
                        <Link
                          href={`/submissions/${sub!.id}`}
                          className={`flex items-center justify-center gap-1 hover:underline ${
                            passed === false ? 'text-destructive' : 'text-success'
                          }`}
                        >
                          {passed === false ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span className="text-xs font-semibold">
                            {sub!.total_score ?? 0}/{sub!.max_score}
                          </span>
                        </Link>
                      ) : inProgress ? (
                        <div className="flex items-center justify-center gap-1 text-primary">
                          <CircleDashed className="w-3.5 h-3.5" />
                          <span className="text-xs">กำลังทำ</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-muted-foreground/40">
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span className="text-xs">ยังไม่ทำ</span>
                        </div>
                      )}

                      {!submitted && (
                        <button
                          onClick={() => setDialogTarget({ assignmentId: a.id, studentId: student.id })}
                          className={`mt-0.5 flex items-center gap-0.5 mx-auto text-[10px] transition-colors ${
                            extension ? 'text-tint-1 font-medium' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-tint-1'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {extension ? 'ขยายเวลาแล้ว' : 'ขยายเวลา'}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}

      {dialogTarget && (() => {
        const assignment = assignments.find(a => a.id === dialogTarget.assignmentId)
        const student = students.find(s => s.id === dialogTarget.studentId)
        const existing = extensionMap.get(subKey(dialogTarget.assignmentId, dialogTarget.studentId))
        if (!assignment || !student) return null
        return (
          <ExtensionDialog
            assignmentId={assignment.id}
            assignmentTitle={assignment.title}
            studentId={student.id}
            studentName={student.full_name}
            currentExtension={existing ? { extended_end_at: existing.extended_end_at, note: existing.note } : undefined}
            onClose={() => setDialogTarget(null)}
          />
        )
      })()}
    </div>
  )
}
