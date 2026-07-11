'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BookOpen, Plus, Search, Clock, Users, CheckCircle2, FileText,
  Globe, ChevronRight, Loader2, Play, Square, Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateAssignmentStatus } from '@/lib/actions/assignments'
import type { AssignmentRow } from '../page'

type StudentSub = { id: string; status: string; total_score: number | null; max_score: number }

interface Props {
  assignments: AssignmentRow[]
  subCountMap: Record<string, number>
  isStudent: boolean
  mySubMap?: Record<string, StudentSub>
}

const STATUS_META = {
  draft:     { label: 'ร่าง',         color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400',  strip: 'from-gray-200 to-gray-300' },
  published: { label: 'เผยแพร่แล้ว',  color: 'bg-green-100 text-green-700', dot: 'bg-green-500', strip: 'from-green-400 to-emerald-400' },
  closed:    { label: 'ปิดแล้ว',      color: 'bg-red-100 text-red-600',     dot: 'bg-red-400',   strip: 'from-red-400 to-rose-400' },
} as const

type FilterTab = 'all' | 'draft' | 'published' | 'closed'

export function ExamDashboard({ assignments, subCountMap, isStudent, mySubMap = {} }: Props) {
  const [tab, setTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')

  const counts = {
    all:       assignments.length,
    draft:     assignments.filter(a => a.status === 'draft').length,
    published: assignments.filter(a => a.status === 'published').length,
    closed:    assignments.filter(a => a.status === 'closed').length,
  }

  const filtered = assignments.filter(a => {
    if (tab !== 'all' && a.status !== tab) return false
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (isStudent) return <StudentView assignments={filtered} search={search} setSearch={setSearch} mySubMap={mySubMap} totalCount={assignments.length} />

  return <TeacherView assignments={filtered} allAssignments={assignments} subCountMap={subCountMap} tab={tab} setTab={setTab} search={search} setSearch={setSearch} counts={counts} />
}

// ─── Teacher View ─────────────────────────────────────────────────────────────

function TeacherView({
  assignments, allAssignments, subCountMap, tab, setTab, search, setSearch, counts,
}: {
  assignments: AssignmentRow[]
  allAssignments: AssignmentRow[]
  subCountMap: Record<string, number>
  tab: FilterTab
  setTab: (t: FilterTab) => void
  search: string
  setSearch: (v: string) => void
  counts: Record<FilterTab, number>
}) {
  const router = useRouter()

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ชุดข้อสอบของฉัน</h1>
          <p className="text-sm text-gray-500 mt-0.5">{allAssignments.length} ชุดข้อสอบ</p>
        </div>
        <Link href="/assignments/new">
          <Button className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> สร้างชุดข้อสอบ
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      {allAssignments.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { key: 'all'       as FilterTab, label: 'ทั้งหมด',      icon: FileText,       color: 'bg-blue-50 text-blue-500' },
            { key: 'draft'     as FilterTab, label: 'ร่าง',          icon: Clock,          color: 'bg-gray-50 text-gray-500' },
            { key: 'published' as FilterTab, label: 'เผยแพร่แล้ว',  icon: Globe,          color: 'bg-green-50 text-green-500' },
            { key: 'closed'    as FilterTab, label: 'ปิดแล้ว',      icon: CheckCircle2,   color: 'bg-red-50 text-red-500' },
          ].map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.key}
                onClick={() => setTab(s.key)}
                className={`bg-white rounded-2xl ring-1 ring-black/5 p-4 flex items-center gap-3 text-left transition-all hover:ring-blue-200 ${
                  tab === s.key ? 'ring-2 ring-blue-400' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 leading-none">{counts[s.key]}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Search + filter tabs */}
      {allAssignments.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="ค้นหาชุดข้อสอบ..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['all', 'draft', 'published', 'closed'] as FilterTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'all' ? 'ทั้งหมด' : STATUS_META[t].label}
                <span className={`ml-1.5 text-xs ${tab === t ? 'text-gray-500' : 'text-gray-400'}`}>{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {allAssignments.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">ยังไม่มีชุดข้อสอบ</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">สร้างชุดข้อสอบแรกเพื่อมอบหมายให้นักเรียน</p>
          <Link href="/assignments/new">
            <Button className="gap-2"><Plus className="w-4 h-4" /> สร้างชุดข้อสอบ</Button>
          </Link>
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">ไม่พบชุดข้อสอบที่ตรงกัน</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {assignments.map(a => (
            <AssignmentCard key={a.id} assignment={a} subCount={subCountMap[a.id] ?? 0} onRefresh={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Assignment Card ──────────────────────────────────────────────────────────

function AssignmentCard({ assignment: a, subCount, onRefresh }: {
  assignment: AssignmentRow
  subCount: number
  onRefresh: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const meta = STATUS_META[a.status]

  function publish() {
    startTransition(async () => {
      const res = await updateAssignmentStatus(a.id, 'published')
      if (res?.error) toast.error(res.error)
      else { toast.success('เผยแพร่ชุดข้อสอบแล้ว'); onRefresh() }
    })
  }

  function close() {
    startTransition(async () => {
      const res = await updateAssignmentStatus(a.id, 'closed')
      if (res?.error) toast.error(res.error)
      else { toast.success('ปิดชุดข้อสอบแล้ว'); onRefresh() }
    })
  }

  return (
    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden hover:ring-blue-200 hover:shadow-sm transition-all group flex flex-col">
      <div className={`h-1.5 bg-gradient-to-r ${meta.strip}`} />

      <div className="p-5 flex flex-col flex-1">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
            {a.mode === 'online' ? '💻 ออนไลน์' : '🖨️ พิมพ์'}
          </span>
        </div>

        {/* Title */}
        <Link href={`/assignments/${a.id}`} className="block group-hover:text-blue-600 transition-colors mb-1">
          <h3 className="font-semibold text-gray-900 line-clamp-2 leading-snug">{a.title}</h3>
        </Link>
        {a.classrooms?.name && <p className="text-xs text-gray-400">{a.classrooms.name}</p>}

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />{a.question_ids.length} ข้อ
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />{subCount} ส่งแล้ว
          </span>
          {a.duration_minutes && (
            <span className="flex items-center gap-1">
              <Timer className="w-3.5 h-3.5" />{a.duration_minutes} นาที
            </span>
          )}
          {a.end_at && (
            <span className="flex items-center gap-1 ml-auto">
              <Clock className="w-3.5 h-3.5" />
              {new Date(a.end_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          {a.status === 'draft' && (
            <button
              onClick={publish}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              เผยแพร่
            </button>
          )}
          {a.status === 'published' && (
            <button
              onClick={close}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              ปิดการสอบ
            </button>
          )}
          <Link
            href={`/assignments/${a.id}`}
            className="flex items-center gap-1 py-1.5 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors ml-auto"
          >
            รายละเอียด <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Student View ─────────────────────────────────────────────────────────────

function StudentView({
  assignments, search, setSearch, mySubMap, totalCount,
}: {
  assignments: AssignmentRow[]
  search: string
  setSearch: (v: string) => void
  mySubMap: Record<string, StudentSub>
  totalCount: number
}) {
  const doneCount = Object.values(mySubMap).filter(s => s.status === 'submitted' || s.status === 'graded').length
  const pendingCount = totalCount - doneCount

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ชุดข้อสอบที่ได้รับ</h1>
        <p className="text-sm text-gray-500 mt-0.5">{totalCount} ชุดข้อสอบ</p>
      </div>

      {totalCount > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{pendingCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">รอทำ</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{doneCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">ส่งแล้ว</p>
            </div>
          </div>
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="ค้นหา..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-gray-500 font-medium">ยังไม่มีชุดข้อสอบ</p>
          <p className="text-sm text-gray-400 mt-1">ครูจะมอบหมายข้อสอบให้ผ่านห้องเรียน</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">ไม่พบชุดข้อสอบที่ตรงกัน</div>
      ) : (
        <div className="space-y-3">
          {assignments.map(a => {
            const sub = mySubMap[a.id]
            const isDone = sub?.status === 'submitted' || sub?.status === 'graded'
            return (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.classrooms?.name}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{a.question_ids.length} ข้อ</span>
                      {a.duration_minutes && <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{a.duration_minutes} นาที</span>}
                      {a.end_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />ถึง {new Date(a.end_at).toLocaleDateString('th-TH', { dateStyle: 'short' })}</span>}
                    </div>
                  </div>
                  {isDone ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-green-600 font-medium">ส่งแล้ว ✓</p>
                      {sub.total_score != null && (
                        <p className="text-lg font-bold text-gray-900">{sub.total_score}/{sub.max_score}</p>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/assignments/${a.id}/take`}
                      className="shrink-0 flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" /> เริ่มทำ
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
