'use client'

import { useState, useTransition } from 'react'
import {
  Search, Filter, ChevronUp, ChevronDown, MoreVertical,
  Mail, ArrowRightLeft, UserMinus, X, SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { removeStudent } from '@/lib/actions/classrooms'

type SortKey = 'name' | 'score' | 'status' | 'joined'
type SortDir = 'asc' | 'desc'
type StatusType = 'ปกติ' | 'ขาดส่งงาน' | 'ออฟไลน์นาน' | 'เสี่ยงสอบตก'

const STATUS_CFG: Record<StatusType, { bg: string; text: string }> = {
  ปกติ: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  ขาดส่งงาน: { bg: 'bg-amber-50', text: 'text-amber-700' },
  ออฟไลน์นาน: { bg: 'bg-gray-100', text: 'text-gray-600' },
  เสี่ยงสอบตก: { bg: 'bg-red-50', text: 'text-red-600' },
}

const MOCK_SCORES = [85, 72, 91, 48, 63, 77, 55, 88, 94, 41, 68, 79, 82, 56, 73, 89, 61, 95, 44, 78]
const MOCK_STATUSES: StatusType[] = [
  'ปกติ', 'ปกติ', 'ปกติ', 'ขาดส่งงาน', 'ปกติ', 'ออฟไลน์นาน', 'ปกติ', 'ปกติ',
  'ปกติ', 'เสี่ยงสอบตก', 'ปกติ', 'ขาดส่งงาน', 'ปกติ', 'ปกติ', 'ปกติ', 'ปกติ',
  'เสี่ยงสอบตก', 'ปกติ', 'ขาดส่งงาน', 'ปกติ',
]

interface RealStudent { id: string; full_name: string; email: string }
interface Student extends RealStudent {
  score: number
  status: StatusType
  initials: string
}

interface Props {
  classroomId: string
  students: RealStudent[]
  otherClassrooms: { id: string; name: string }[]
}

export function StudentTable({ classroomId, students, otherClassrooms }: Props) {
  const augmented: Student[] = students.map((s, i) => ({
    ...s,
    score: MOCK_SCORES[i % MOCK_SCORES.length],
    status: MOCK_STATUSES[i % MOCK_STATUSES.length],
    initials: s.full_name.slice(0, 2),
  }))

  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<StatusType | ''>('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = augmented
    .filter(s =>
      s.full_name.toLowerCase().includes(query.toLowerCase()) ||
      s.email.toLowerCase().includes(query.toLowerCase())
    )
    .filter(s => activeFilter ? s.status === activeFilter : true)
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.full_name.localeCompare(b.full_name, 'th')
      if (sortKey === 'score') cmp = a.score - b.score
      if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })

  function handleRemove(studentId: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจากห้องเรียน?`)) return
    setOpenMenu(null)
    startTransition(async () => {
      const res = await removeStudent(classroomId, studentId)
      if (res?.error) toast.error(res.error)
      else toast.success(`ลบ ${name} ออกแล้ว`)
    })
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-500" />
      : <ChevronDown className="w-3 h-3 text-blue-500" />
  }

  return (
    <div className="space-y-3">
      {/* Search + filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหานักเรียน..."
            className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-xl transition-colors ${
            activeFilter ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>กรอง</span>
          {activeFilter && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </button>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {(['ปกติ', 'ขาดส่งงาน', 'ออฟไลน์นาน', 'เสี่ยงสอบตก'] as StatusType[]).map(s => (
            <button
              key={s}
              onClick={() => setActiveFilter(activeFilter === s ? '' : s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeFilter === s
                  ? `${STATUS_CFG[s].bg} ${STATUS_CFG[s].text} ring-1 ring-current`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
          {activeFilter && (
            <button onClick={() => setActiveFilter('')} className="px-3 py-1 rounded-full text-xs text-gray-500 hover:text-gray-700 underline">
              ล้างตัวกรอง
            </button>
          )}
          <p className="ml-auto text-xs text-gray-400 self-center">แสดง {filtered.length}/{augmented.length} คน</p>
        </div>
      )}

      {/* Active filter reminder */}
      {activeFilter && !showFilters && (
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl">
          <Filter className="w-3 h-3" />
          <span>กรองเฉพาะสถานะ: <strong>{activeFilter}</strong></span>
          <button onClick={() => setActiveFilter('')} className="ml-auto text-blue-400 hover:text-blue-600">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_100px_110px_40px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div className="w-8" />
          <button className="flex items-center gap-1 text-left hover:text-gray-700" onClick={() => toggleSort('name')}>
            ชื่อ <SortIcon col="name" />
          </button>
          <button className="flex items-center gap-1 hover:text-gray-700" onClick={() => toggleSort('score')}>
            คะแนน <SortIcon col="score" />
          </button>
          <button className="flex items-center gap-1 hover:text-gray-700" onClick={() => toggleSort('status')}>
            สถานะ <SortIcon col="status" />
          </button>
          <div />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">ไม่พบนักเรียน</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(student => {
              const cfg = STATUS_CFG[student.status]
              return (
                <div
                  key={student.id}
                  className="grid grid-cols-[auto_1fr_100px_110px_40px] gap-3 items-center px-4 py-3 hover:bg-gray-50/50 transition-colors relative"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                    {student.initials}
                  </div>

                  {/* Name + email */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{student.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{student.email}</p>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${student.score >= 70 ? 'bg-emerald-400' : student.score >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${student.score}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-8 text-right">{student.score}%</span>
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} text-center`}>
                    {student.status}
                  </span>

                  {/* Actions */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === student.id ? null : student.id)}
                      className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {openMenu === student.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg ring-1 ring-black/10 py-1 min-w-[160px]">
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => { toast.success('ฟีเจอร์กำลังพัฒนา'); setOpenMenu(null) }}
                          >
                            <Mail className="w-3.5 h-3.5 text-gray-400" /> ส่งข้อความ
                          </button>
                          {otherClassrooms.length > 0 && (
                            <div className="group relative">
                              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                <ArrowRightLeft className="w-3.5 h-3.5 text-gray-400" /> ย้ายห้องเรียน
                                <span className="ml-auto text-gray-300">›</span>
                              </button>
                              <div className="absolute right-full top-0 bg-white rounded-xl shadow-lg ring-1 ring-black/10 py-1 min-w-[160px] hidden group-hover:block">
                                {otherClassrooms.map(c => (
                                  <button
                                    key={c.id}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                    onClick={() => { toast.success(`ย้ายไป ${c.name} (ฟีเจอร์กำลังพัฒนา)`); setOpenMenu(null) }}
                                  >
                                    {c.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            onClick={() => handleRemove(student.id, student.full_name)}
                            disabled={isPending}
                          >
                            <UserMinus className="w-3.5 h-3.5" /> ลบออกจากห้อง
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
