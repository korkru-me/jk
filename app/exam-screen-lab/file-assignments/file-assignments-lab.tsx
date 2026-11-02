'use client'

import { useState } from 'react'
import { FileAssignmentForm } from '@/components/assignments/file-assignment-form'
import { FileAssignmentStudent } from '@/components/assignments/file-assignment-student'
import { fileAssignmentWithdrawalError, type FileAssignmentView } from '@/lib/file-assignment'
import { ShellClient } from '@/components/layout/shell-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'

const CLASSROOM = { id: '10000000-0000-4000-8000-000000000001', name: 'ฟิสิกส์ ม.4/1 (ตัวอย่าง)' }
const ASSIGNMENT = '20000000-0000-4000-8000-000000000001'

/** Every callback is in-memory; neither auth nor Storage is contacted. */
export function FileAssignmentsLab({ serverNow }: { serverNow: string }) {
  const [view, setView] = useState<FileAssignmentView | null>(null)
  const [role, setRole] = useState<'create' | 'teacher' | 'student'>('create')
  const [score, setScore] = useState('10')
  const [expired, setExpired] = useState(false)
  const current = view ? { ...view, withdrawalError: view.submission ? fileAssignmentWithdrawalError({
    assignmentStatus: view.status, submissionStatus: view.submission.status,
    dueAt: expired ? '2020-01-01T00:00:00Z' : view.dueAt, endAt: view.endAt,
    reviewed: view.submission.status === 'graded',
  }, Date.parse(serverNow)) : null } : null

  return <ShellClient user={{ id: 'local-file-teacher', email: 'file-lab@example.invalid', full_name: 'ครูตัวอย่าง', role: 'teacher' }} initialUnreadCount={0} notificationsEnabled={false}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">LOCAL · ข้อมูลจำลอง · ไฟล์อยู่ในเครื่อง ไม่บันทึกข้อมูลขึ้นระบบ</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => {
          setExpired(false)
          setView({ id: ASSIGNMENT, title: 'ใบงานฟิสิกส์ — ตัวอย่างแนบไฟล์', classroomId: CLASSROOM.id,
            instructions: '<p>อ่านใบงาน PDF แล้วแสดงวิธีทำ แนบคำตอบเป็นรูปภาพหรือ PDF</p>',
            attachments: ['/exam-screen-lab/grading-workspace/assets/file-0.pdf'], maxScore: 10,
            status: 'published', startAt: null, dueAt: null, endAt: null, submission: null, withdrawalError: null })
          setRole('student')
        }}>เปิดตัวอย่างงานพร้อม PDF</Button>
        {view && <><Button size="sm" variant="outline" onClick={() => setRole('student')}>มุมมองนักเรียน</Button><Button size="sm" variant="outline" onClick={() => setRole('teacher')}>มุมมองครูตรวจงาน</Button>
          <Button size="sm" variant="outline" aria-pressed={expired} onClick={() => setExpired(value => !value)}>{expired ? 'กลับไปก่อนกำหนดส่ง' : 'จำลองพ้นกำหนดส่ง'}</Button></>}
        <Button size="sm" variant="ghost" onClick={() => { setView(null); setExpired(false); setRole('create') }}>สร้างตัวอย่างใหม่</Button>
      </div>
    </div>
    {role === 'create' ? <FileAssignmentForm classrooms={[CLASSROOM]} preselectedClassroomId={CLASSROOM.id} localOnly onCreate={async input => {
      setView({ id: ASSIGNMENT, title: input.title, classroomId: CLASSROOM.id, instructions: input.instructions,
        attachments: input.attachment_urls, maxScore: input.max_score, status: input.status,
        startAt: input.start_at, dueAt: input.due_at, endAt: input.end_at,
        submission: null, withdrawalError: null })
      setScore(String(input.max_score))
      setRole('student')
      return { success: true }
    }} /> : current && role === 'student' ? <FileAssignmentStudent key={`${current.submission?.id}:${current.submission?.status}`} view={current} localOnly
      onStart={async () => { setView(value => ({ ...value!, submission: { id: '30000000-0000-4000-8000-000000000001', answerId: '40000000-0000-4000-8000-000000000001', status: 'in_progress', files: [], score: null, submittedAt: null } })) }}
      onSave={async files => { setView(value => ({ ...value!, submission: { ...value!.submission!, files } })) }}
      onSubmit={async () => { setView(value => ({ ...value!, submission: { ...value!.submission!, status: 'submitted', submittedAt: serverNow } })) }}
      onWithdraw={async () => { setView(value => ({ ...value!, submission: { ...value!.submission!, status: 'in_progress', submittedAt: null } })) }}
    /> : current ? <Card padding="md" className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">{current.title}</h1><p className="text-sm">คะแนนเต็มทั้งงาน {current.maxScore} คะแนน · {current.submission?.files.length ?? 0} ไฟล์</p>
      {current.submission?.status === 'submitted' ? <>
        <Field><FieldLabel htmlFor="local-file-grade">คะแนนรวมทั้งงาน</FieldLabel><Input id="local-file-grade" type="number" min="0" max={current.maxScore} step="any" value={score} onChange={event => setScore(event.target.value)} /></Field>
        <Button disabled={!score.trim() || !Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > current.maxScore} onClick={() => {
          setView(value => ({ ...value!, submission: { ...value!.submission!, status: 'graded', score: Number(score) } })); setRole('student')
        }}>จำลองบันทึกคะแนน</Button>
      </> : <p className="text-sm text-muted-foreground">{current.submission?.status === 'graded' ? 'ครูตรวจแล้ว' : 'นักเรียนยังไม่ได้ส่งงาน'}</p>}
    </Card> : null}
  </ShellClient>
}
