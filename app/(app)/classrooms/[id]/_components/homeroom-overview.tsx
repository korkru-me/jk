'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckCircle2, CircleDashed, MinusCircle, XCircle, AlertTriangle,
  MessageSquare, Trash2, ChevronDown, ChevronUp, Printer, IdCard, Info,
} from 'lucide-react'
import { computePassed } from '@/lib/grading'
import { selectOfficialAttempt } from '@/lib/scoring'
import { addStudentNote, deleteStudentNote } from '@/lib/actions/homeroom-notes'
import { HomeroomCalendar, type HomeroomCalendarEvent } from './homeroom-calendar'
import type { HomeroomAssignmentRow, HomeroomSubmissionRow as SubmissionRow } from '@/lib/homeroom-data'
import { Card } from '@/components/ui/card'

export interface StudentNoteRow {
  id: string
  student_id: string
  author_name: string
  body: string
  created_at: string
}

export interface StudentProfileRow {
  student_id: string
  nickname: string | null
  date_of_birth: string | null
  gender: 'male' | 'female' | null
  food_allergy: string | null
  chronic_disease: string | null
  grade_level: string | null
  section_number: number | null
  school_name: string | null
  student_code: string | null
  class_number: number | null
  address: string | null
  phone: string | null
  guardians: { name: string; phone: string }[]
}

interface RealStudent { id: string; full_name: string; email: string }

interface Props {
  classroomId: string
  students: RealStudent[]
  assignments: HomeroomAssignmentRow[]
  submissions: SubmissionRow[]
  notes: StudentNoteRow[]
  profiles: Record<string, StudentProfileRow>
}

const GENDER_LABEL: Record<string, string> = { male: 'ชาย', female: 'หญิง' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function StudentProfilePanel({ profile }: { profile?: StudentProfileRow }) {
  const rows: [string, string | null | undefined][] = [
    ['ชื่อเล่น', profile?.nickname],
    ['วันเกิด', profile?.date_of_birth ? formatDate(profile.date_of_birth) : null],
    ['เพศสภาพ', profile?.gender ? GENDER_LABEL[profile.gender] : null],
    ['แพ้อาหาร', profile?.food_allergy],
    ['โรคประจำตัว', profile?.chronic_disease],
    ['ระดับชั้น', profile?.grade_level],
    ['ห้อง', profile?.section_number ? `ห้อง ${profile.section_number}` : null],
    ['โรงเรียน', profile?.school_name],
    ['รหัสนักเรียน', profile?.student_code],
    ['เลขที่', profile?.class_number != null ? String(profile.class_number) : null],
    ['ที่อยู่', profile?.address],
    ['เบอร์โทรนักเรียน', profile?.phone],
    ...(profile?.guardians ?? [])
      .filter(g => g.name || g.phone)
      .map((g, i): [string, string] => [
        (profile?.guardians?.length ?? 0) > 1 ? `ผู้ปกครองคนที่ ${i + 1}` : 'ผู้ปกครอง',
        [g.name, g.phone].filter(Boolean).join(' · '),
      ]),
  ]
  const hasAny = rows.some(([, v]) => !!v)

  return (
    <div className="bg-primary/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">
        <IdCard className="w-3 h-3" /> ข้อมูลส่วนตัว (จากหน้าตั้งค่าของนักเรียน)
      </div>
      {hasAny ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {rows.filter(([, v]) => !!v).map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className="text-sm text-foreground truncate">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">นักเรียนยังไม่ได้กรอกข้อมูลส่วนตัว</p>
      )}
    </div>
  )
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function StudentNotesPanel({
  classroomId, studentId, notes,
}: {
  classroomId: string
  studentId: string
  notes: StudentNoteRow[]
}) {
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!draft.trim()) return
    startTransition(async () => {
      const res = await addStudentNote(classroomId, studentId, draft)
      if (res?.error) toast.error(res.error)
      else { setDraft(''); toast.success('บันทึกแล้ว') }
    })
  }

  function handleDelete(noteId: string) {
    startTransition(async () => {
      const res = await deleteStudentNote(noteId, classroomId)
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <div className="bg-muted rounded-xl p-3 space-y-2.5">
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">ยังไม่มีบันทึกสำหรับนักเรียนคนนี้</p>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <Card radius="sm" edge="ring" className="flex items-start justify-between gap-2 px-3 py-2" key={n.id}>
              <div className="min-w-0">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{n.body}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{n.author_name} · {formatDateTime(n.created_at)}</p>
              </div>
              <button
                onClick={() => handleDelete(n.id)}
                disabled={isPending}
                className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-50"
                title="ลบบันทึก"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Card>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="บันทึกส่วนตัว เช่น สุขภาพ ครอบครัว พฤติกรรม — เห็นเฉพาะครูที่ปรึกษาและผู้ช่วยสอน"
          rows={2}
          className="flex-1 text-sm rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={isPending || !draft.trim()}
          className="shrink-0 text-xs font-medium px-3 py-2 rounded-lg bg-foreground text-background hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          บันทึก
        </button>
      </div>
    </div>
  )
}

export function HomeroomOverview({ classroomId, students, assignments, submissions, notes, profiles }: Props) {
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)

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

  const notesByStudent = new Map<string, StudentNoteRow[]>()
  for (const n of notes) {
    const arr = notesByStudent.get(n.student_id) ?? []
    arr.push(n)
    notesByStudent.set(n.student_id, arr)
  }

  const now = Date.now()
  const isDone = (s?: SubmissionRow) => s?.status === 'submitted' || s?.status === 'graded'
  const isDue = (a: HomeroomAssignmentRow) => !a.end_at || new Date(a.end_at).getTime() <= now

  const dueAssignments = assignments.filter(isDue)

  const calendarEvents: HomeroomCalendarEvent[] = assignments
    .filter((a): a is HomeroomAssignmentRow & { end_at: string } => !!a.end_at)
    .map(a => ({
      id: a.id,
      title: a.title,
      classroomName: a.classroomName,
      endAt: a.end_at,
      doneCount: students.filter(s => isDone(bestSubmission.get(subKey(a.id, s.id)))).length,
      totalStudents: students.length,
    }))

  const compliance = students.map(student => {
    const submitted = dueAssignments.filter(a => isDone(bestSubmission.get(subKey(a.id, student.id)))).length
    const rate = dueAssignments.length > 0 ? Math.round((submitted / dueAssignments.length) * 100) : 100
    return { student, submitted, total: dueAssignments.length, rate }
  }).sort((a, b) => a.rate - b.rate)

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link
          href={`/classrooms/${classroomId}/report`}
          target="_blank"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
        >
          <Printer className="w-3.5 h-3.5" /> พิมพ์รายงานผู้ปกครอง
        </Link>
      </div>

      {assignments.length === 0 ? (
        <Card edge="ring" className="py-10 text-center text-sm text-muted-foreground">
          ยังไม่มีการบ้านจากห้องเรียนวิชาของนักเรียนกลุ่มนี้
        </Card>
      ) : (
        <>
          <HomeroomCalendar events={calendarEvents} />

          {/* Matrix */}
          <Card edge="ring" className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-card text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[180px]">
                    นักเรียน
                  </th>
                  {assignments.map(a => (
                    <th key={a.id} className="px-3 py-3 text-center min-w-[140px]">
                      <Link href={`/assignments/${a.id}`} className="text-xs font-semibold text-muted-foreground hover:text-primary line-clamp-2">
                        {a.title}
                      </Link>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{a.classroomName}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                    <td className="sticky left-0 bg-card px-4 py-2.5">
                      <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{student.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{student.email}</p>
                    </td>
                    {assignments.map(a => {
                      const sub = bestSubmission.get(subKey(a.id, student.id))
                      const submitted = isDone(sub)
                      const inProgress = sub?.status === 'in_progress'
                      const overdue = !submitted && !inProgress && isDue(a)
                      const passed = submitted
                        ? computePassed(sub!.total_score, sub!.max_score, a.passing_type, a.passing_value)
                        : null

                      return (
                        <td key={a.id} className="px-3 py-2.5 text-center">
                          {submitted ? (
                            <div className={`flex items-center justify-center gap-1 ${
                              passed === false ? 'text-destructive' : 'text-success'
                            }`}>
                              {passed === false ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              <span className="text-xs font-semibold">{sub!.total_score ?? 0}/{sub!.max_score}</span>
                            </div>
                          ) : inProgress ? (
                            <div className="flex items-center justify-center gap-1 text-primary">
                              <CircleDashed className="w-3.5 h-3.5" />
                              <span className="text-xs">กำลังทำ</span>
                            </div>
                          ) : overdue ? (
                            <div className="flex items-center justify-center gap-1 text-destructive">
                              <MinusCircle className="w-3.5 h-3.5" />
                              <span className="text-xs">เลยกำหนด</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 text-muted-foreground/40">
                              <MinusCircle className="w-3.5 h-3.5" />
                              <span className="text-xs">ยังไม่ทำ</span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Compliance + private notes */}
      <Card edge="ring" padding="md">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          <AlertTriangle className="w-3.5 h-3.5" /> ความรับผิดชอบในการส่งงาน, ข้อมูลส่วนตัว และบันทึกครูที่ปรึกษา
        </div>
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mb-3">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>ข้อมูลส่วนตัวที่นักเรียนกรอกไว้ และบันทึกด้านล่าง เห็นเฉพาะครูที่ปรึกษาและผู้ช่วยสอนของห้องนี้เท่านั้น</span>
        </div>
        <div className="space-y-1.5">
          {compliance.map(({ student, submitted, total, rate }) => {
            const studentNotes = notesByStudent.get(student.id) ?? []
            const isExpanded = expandedStudent === student.id
            return (
              <div key={student.id}>
                <div className="flex items-center gap-3 text-sm py-1">
                  <p className="w-40 truncate text-foreground">{student.full_name}</p>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${rate >= 80 ? 'bg-success' : rate >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{submitted}/{total} ({rate}%)</span>
                  <button
                    onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                    className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                      studentNotes.length > 0 ? 'text-primary bg-primary/10 hover:bg-primary/10' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    {studentNotes.length > 0 ? studentNotes.length : ''}
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
                {isExpanded && (
                  <div className="pl-0 pb-2 pt-1 space-y-2">
                    <StudentProfilePanel profile={profiles[student.id]} />
                    <StudentNotesPanel
                      classroomId={classroomId}
                      studentId={student.id}
                      notes={studentNotes}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
