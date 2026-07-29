'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Users, BookOpen, Copy, Check, Settings,
  GraduationCap, UserPlus, Grid3x3, Mail, GitBranch, Activity, ChevronLeft,
  ClipboardList, Megaphone, CalendarDays, Home,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DeleteClassroomButton } from '@/components/classrooms/delete-classroom-button'
import type { Classroom, ClassroomPost } from '@/lib/types'

import { ClassroomStream } from './classroom-stream'
import { StudentTable, type SortKey as StudentSortKey, type SortDir as StudentSortDir } from './student-table'
import { InvitePanel } from './invite-panel'
import { CoTeachers, type CoTeacherRow, type InviteRow } from './co-teachers'
import { ClassroomAssignmentsTab, type ClassroomAssignmentRow } from './classroom-assignments-tab'
import { ClassroomScoresMatrix } from './classroom-scores-matrix'
import { HomeroomOverview, type StudentNoteRow, type StudentProfileRow } from './homeroom-overview'
import type { HomeroomAssignmentRow } from '@/lib/homeroom-data'
import { ParentPortal } from './parent-portal'
import { LearningPaths } from './learning-paths'
import { AuditLog } from './audit-log'
import { BreakoutGroups } from './breakout-groups'

type Tab = 'stream' | 'students' | 'assignments' | 'scores' | 'homeroom' | 'groups' | 'invite' | 'coteachers' | 'parents' | 'paths' | 'log'

const SUBJECT_TABS: { key: Tab; label: string; icon: typeof Users; managerOnly?: boolean }[] = [
  { key: 'stream',      label: 'ประกาศ',          icon: Megaphone },
  { key: 'assignments', label: 'งานที่มอบหมาย',    icon: BookOpen, managerOnly: true },
  { key: 'scores',      label: 'คะแนนและการส่งงาน', icon: ClipboardList, managerOnly: true },
  { key: 'students',    label: 'นักเรียน',        icon: Users },
  { key: 'groups',      label: 'กลุ่มย่อย',       icon: Grid3x3 },
  { key: 'invite',      label: 'เชิญเข้าร่วม',    icon: UserPlus },
  { key: 'coteachers',  label: 'ผู้ช่วยสอน',      icon: GraduationCap },
  { key: 'parents',     label: 'ผู้ปกครอง',       icon: Mail },
  { key: 'paths',       label: 'เส้นทางการเรียน', icon: GitBranch },
  { key: 'log',         label: 'ประวัติ',          icon: Activity },
]

const HOMEROOM_TABS: { key: Tab; label: string; icon: typeof Users; managerOnly?: boolean }[] = [
  { key: 'homeroom',    label: 'การบ้านนักเรียน', icon: CalendarDays, managerOnly: true },
  { key: 'stream',      label: 'ประกาศ',          icon: Megaphone },
  { key: 'students',    label: 'นักเรียน',        icon: Users },
  { key: 'invite',      label: 'เชิญเข้าร่วม',    icon: UserPlus },
  { key: 'coteachers',  label: 'ผู้ช่วยสอน',      icon: GraduationCap },
  { key: 'parents',     label: 'ผู้ปกครอง',       icon: Mail },
  { key: 'log',         label: 'ประวัติ',          icon: Activity },
]

interface RealStudent { id: string; full_name: string; email: string }

interface Props {
  classroom: Classroom
  students: RealStudent[]
  assignmentCount: number
  otherClassrooms: { id: string; name: string }[]
  isOwner: boolean
  canManage: boolean
  coTeachers: CoTeacherRow[]
  invites: InviteRow[]
  classroomAssignments: ClassroomAssignmentRow[]
  classroomSubmissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[]
  classroomExtensions: {
    id: string; assignment_id: string; student_id: string; extended_end_at: string; note: string | null
  }[]
  homeroomAssignments: HomeroomAssignmentRow[]
  homeroomSubmissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[]
  studentNotes: StudentNoteRow[]
  studentProfiles: Record<string, StudentProfileRow>
  ownerName: string
  posts: ClassroomPost[]
}

export function ClassroomDetailClient({
  classroom, students, assignmentCount, otherClassrooms, isOwner, canManage, coTeachers, invites,
  classroomAssignments, classroomSubmissions, classroomExtensions,
  homeroomAssignments, homeroomSubmissions, studentNotes, studentProfiles, ownerName, posts,
}: Props) {
  const isHomeroom = classroom.classroom_type === 'homeroom'
  const TABS = isHomeroom ? HOMEROOM_TABS : SUBJECT_TABS
  const [activeTab, setActiveTab] = useState<Tab>(isHomeroom && canManage ? 'homeroom' : 'stream')
  const [codeCopied, setCodeCopied] = useState(false)

  // Shared with the "คะแนนและการส่งงาน" tab so both show students in the
  // same order — set here (not inside StudentTable) so it survives
  // switching tabs and both consumers stay in sync.
  const [studentSortKey, setStudentSortKey] = useState<StudentSortKey>('name')
  const [studentSortDir, setStudentSortDir] = useState<StudentSortDir>('asc')

  function toggleStudentSort(key: StudentSortKey) {
    setStudentSortDir(d => (studentSortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc'))
    setStudentSortKey(key)
  }

  function copyCode() {
    navigator.clipboard.writeText(classroom.class_code).then(() => {
      setCodeCopied(true)
      toast.success('คัดลอกรหัสแล้ว')
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Back link */}
      <Link href="/classrooms" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ChevronLeft className="w-4 h-4" /> ห้องเรียนทั้งหมด
      </Link>

      {/* Header card */}
      <div className={`bg-gradient-to-br rounded-2xl p-6 text-white ${isHomeroom ? 'from-slate-800 via-slate-800 to-indigo-900' : 'from-gray-900 to-gray-800'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isHomeroom && (
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-1.5">
                <Home className="w-3 h-3" /> ครูที่ปรึกษาประจำชั้น
              </p>
            )}
            <h1 className="text-2xl font-bold leading-tight">{classroom.name}</h1>
            {classroom.description && (
              <p className="text-gray-400 text-sm mt-1">{classroom.description}</p>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-5 mt-4">
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-semibold">{students.length}</span>
                <span className="text-gray-400">นักเรียน</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4 text-gray-400" />
                <span className="font-semibold">{isHomeroom ? homeroomAssignments.length : assignmentCount}</span>
                <span className="text-gray-400">{isHomeroom ? 'การบ้านที่ติดตาม' : 'ชุดข้อสอบ'}</span>
              </div>
              {!isHomeroom && (
                <Link href={`/assignments/new?classroom=${classroom.id}`} className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  + สร้างชุดข้อสอบ
                </Link>
              )}
            </div>
          </div>

          {/* Class code */}
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-500 mb-1">รหัสห้องเรียน</p>
            <div className="flex items-center gap-2">
              <p className="font-mono font-black text-2xl tracking-[0.3em] text-white">{classroom.class_code}</p>
              <button
                onClick={copyCode}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Owner actions */}
        {isOwner && (
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/10">
            <Button size="sm" variant="outline" className="gap-1.5 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent">
              <Settings className="w-3.5 h-3.5" /> ตั้งค่าห้องเรียน
            </Button>
            <div className="ml-auto">
              <DeleteClassroomButton id={classroom.id} />
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1 overflow-x-auto">
        {TABS.filter(tab => !tab.managerOnly || canManage).map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'students' && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  {students.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'stream' && (
          <div className="max-w-2xl">
            <ClassroomStream classroomId={classroom.id} canPost={canManage} initialPosts={posts} />
          </div>
        )}
        {activeTab === 'students' && (
          <StudentTable
            classroomId={classroom.id}
            students={students}
            otherClassrooms={otherClassrooms}
            profiles={studentProfiles}
            showRoster={canManage}
            showProfiles={isHomeroom && canManage}
            sortKey={studentSortKey}
            sortDir={studentSortDir}
            onToggleSort={toggleStudentSort}
          />
        )}
        {activeTab === 'assignments' && canManage && (
          <ClassroomAssignmentsTab
            classroomId={classroom.id}
            assignments={classroomAssignments}
            submissions={classroomSubmissions}
            studentCount={students.length}
            onViewScores={() => setActiveTab('scores')}
          />
        )}
        {activeTab === 'scores' && canManage && (
          <ClassroomScoresMatrix
            classroomId={classroom.id}
            classroomName={classroom.name}
            students={students}
            assignments={classroomAssignments}
            submissions={classroomSubmissions}
            extensions={classroomExtensions}
            profiles={studentProfiles}
            sortKey={studentSortKey}
            sortDir={studentSortDir}
            onViewStudents={() => setActiveTab('students')}
          />
        )}
        {activeTab === 'homeroom' && canManage && (
          <HomeroomOverview
            classroomId={classroom.id}
            students={students}
            assignments={homeroomAssignments}
            submissions={homeroomSubmissions}
            notes={studentNotes}
            profiles={studentProfiles}
          />
        )}
        {activeTab === 'groups' && (
          <BreakoutGroups students={students} />
        )}
        {activeTab === 'invite' && (
          <div className="max-w-lg">
            <InvitePanel classCode={classroom.class_code} classroomId={classroom.id} />
          </div>
        )}
        {activeTab === 'coteachers' && (
          <div className="max-w-2xl">
            <CoTeachers
              classroomId={classroom.id}
              ownerName={ownerName}
              canManage={canManage}
              coTeachers={coTeachers}
              invites={invites}
            />
          </div>
        )}
        {activeTab === 'parents' && (
          <div className="max-w-xl">
            <ParentPortal studentCount={students.length} />
          </div>
        )}
        {activeTab === 'paths' && (
          <div className="max-w-2xl">
            <LearningPaths />
          </div>
        )}
        {activeTab === 'log' && (
          <div className="max-w-2xl">
            <AuditLog />
          </div>
        )}
      </div>
    </div>
  )
}
