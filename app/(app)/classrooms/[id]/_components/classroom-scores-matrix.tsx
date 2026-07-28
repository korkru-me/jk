'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Clock, CheckCircle2, CircleDashed, MinusCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { notifyNonSubmitters } from '@/lib/actions/notifications'
import { setAssignmentDisplayOrder } from '@/lib/actions/classrooms'
import { computePassed } from '@/lib/grading'
import { selectOfficialAttempt } from '@/lib/scoring'
import { ExtensionDialog } from './extension-dialog'
import type { ClassroomAssignmentRow } from './classroom-assignments-tab'

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
  students: RealStudent[]
  assignments: ClassroomAssignmentRow[]
  submissions: SubmissionRow[]
  extensions: ExtensionRow[]
}

export function ClassroomScoresMatrix({ classroomId, students, assignments, submissions, extensions }: Props) {
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
  const attemptsByKey = new Map<string, SubmissionRow[]>()
  for (const s of submissions) {
    const key = subKey(s.assignment_id, s.student_id)
    const arr = attemptsByKey.get(key) ?? []
    arr.push(s)
    attemptsByKey.set(key, arr)
  }
  const bestSubmission = new Map<string, SubmissionRow>()
  for (const [key, attempts] of attemptsByKey) {
    const strategy = strategyByAssignment.get(attempts[0].assignment_id) ?? 'best'
    const official = selectOfficialAttempt(attempts, strategy)
    if (official) {
      bestSubmission.set(key, { ...official.representative, total_score: official.total_score, max_score: official.max_score })
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

  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-2xl ring-1 ring-black/5 py-12 text-center text-sm text-gray-400">
        ยังไม่มีงานที่มอบหมายให้ห้องนี้
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
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
              typeFilter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibleAssignments.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 py-12 text-center text-sm text-gray-400">
          ไม่พบงานที่ตรงกับตัวกรอง
        </div>
      ) : (
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="sticky left-0 bg-white text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[180px]">
                นักเรียน
              </th>
              {visibleAssignments.map(a => {
                const hasNonSubmitter = students.some(s => {
                  const sub = bestSubmission.get(subKey(a.id, s.id))
                  return !sub || (sub.status !== 'submitted' && sub.status !== 'graded')
                })
                return (
                  <th key={a.id} className="px-3 py-3 text-center min-w-[140px]">
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
                      className="w-10 mx-auto mb-1 block text-xs text-center rounded-lg border border-gray-200 py-0.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50"
                    />
                    <Link href={`/assignments/${a.id}`} className="text-xs font-semibold text-gray-700 hover:text-blue-600 line-clamp-2">
                      {a.title}
                    </Link>
                    <button
                      onClick={() => handleRemind(a.id)}
                      disabled={!hasNonSubmitter || reminding === a.id}
                      className={`mt-1.5 mx-auto flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                        hasNonSubmitter
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-gray-50 text-gray-300 cursor-default'
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
            {students.map(student => (
              <tr key={student.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50">
                <td className="sticky left-0 bg-white px-4 py-2.5">
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{student.full_name}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[160px]">{student.email}</p>
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
                    <td key={a.id} className="px-3 py-2.5 text-center group relative">
                      {submitted ? (
                        <div className={`flex items-center justify-center gap-1 ${
                          passed === false ? 'text-red-500' : 'text-emerald-600'
                        }`}>
                          {passed === false ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span className="text-xs font-semibold">
                            {sub!.total_score ?? 0}/{sub!.max_score}
                          </span>
                        </div>
                      ) : inProgress ? (
                        <div className="flex items-center justify-center gap-1 text-blue-500">
                          <CircleDashed className="w-3.5 h-3.5" />
                          <span className="text-xs">กำลังทำ</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-gray-300">
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span className="text-xs">ยังไม่ทำ</span>
                        </div>
                      )}

                      {!submitted && (
                        <button
                          onClick={() => setDialogTarget({ assignmentId: a.id, studentId: student.id })}
                          className={`mt-0.5 flex items-center gap-0.5 mx-auto text-[10px] transition-colors ${
                            extension ? 'text-violet-600 font-medium' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-violet-500'
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
      </div>
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
