'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Users, BookOpen, Copy, Check, Settings,
  GraduationCap, UserPlus, Grid3x3, Mail, GitBranch, Activity, ChevronLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DeleteClassroomButton } from '@/components/classrooms/delete-classroom-button'
import type { Classroom } from '@/lib/types'

import { StudentTable } from './student-table'
import { InvitePanel } from './invite-panel'
import { CoTeachers } from './co-teachers'
import { ParentPortal } from './parent-portal'
import { LearningPaths } from './learning-paths'
import { AuditLog } from './audit-log'
import { BreakoutGroups } from './breakout-groups'

type Tab = 'students' | 'groups' | 'invite' | 'coteachers' | 'parents' | 'paths' | 'log'

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'students',   label: 'นักเรียน',      icon: Users },
  { key: 'groups',     label: 'กลุ่มย่อย',     icon: Grid3x3 },
  { key: 'invite',     label: 'เชิญเข้าร่วม',  icon: UserPlus },
  { key: 'coteachers', label: 'ผู้ช่วยสอน',    icon: GraduationCap },
  { key: 'parents',    label: 'ผู้ปกครอง',     icon: Mail },
  { key: 'paths',      label: 'เส้นทางการเรียน', icon: GitBranch },
  { key: 'log',        label: 'ประวัติ',        icon: Activity },
]

interface RealStudent { id: string; full_name: string; email: string }

interface Props {
  classroom: Classroom
  students: RealStudent[]
  assignmentCount: number
  otherClassrooms: { id: string; name: string }[]
  isOwner: boolean
  ownerName: string
}

export function ClassroomDetailClient({
  classroom, students, assignmentCount, otherClassrooms, isOwner, ownerName,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('students')
  const [codeCopied, setCodeCopied] = useState(false)

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
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
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
                <span className="font-semibold">{assignmentCount}</span>
                <span className="text-gray-400">ชุดข้อสอบ</span>
              </div>
              <Link href={`/assignments/new`} className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors">
                + สร้างชุดข้อสอบ
              </Link>
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
        {TABS.map(tab => {
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
        {activeTab === 'students' && (
          <StudentTable
            classroomId={classroom.id}
            students={students}
            otherClassrooms={otherClassrooms}
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
            <CoTeachers ownerName={ownerName} />
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
