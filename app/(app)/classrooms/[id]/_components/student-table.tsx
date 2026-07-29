'use client'

import { useState, useTransition } from 'react'
import {
  Search, Filter, ChevronUp, ChevronDown, MoreVertical,
  Mail, ArrowRightLeft, UserMinus, X, SlidersHorizontal, IdCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { removeStudent } from '@/lib/actions/classrooms'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StudentProfilePanel, type StudentProfileRow } from './homeroom-overview'
import { compareStudents, type StudentSortKey, type StudentSortDir } from '@/lib/student-sort'

// 'score'/'status' are extra local-only sort options on top of the shared
// roster keys — they sort by this table's own sample data, which has no
// counterpart on the scores page, so they're never lifted/synced.
export type SortKey = StudentSortKey | 'score' | 'status'
export type SortDir = StudentSortDir
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
  profiles?: Record<string, StudentProfileRow>
  /** Grade/room/number/code columns — any teacher who can manage this
   *  classroom (subject or homeroom), scoped per classroom. */
  showRoster?: boolean
  /** Full personal-info dialog (health/address/guardians) — homeroom
   *  advisor only, a stricter gate than showRoster. */
  showProfiles?: boolean
  /** Sort state lives in the parent so the "คะแนนและการส่งงาน" tab can
   *  mirror the same student order. */
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
}

// The name column uses minmax(0,1fr) rather than a bare 1fr — with a bare
// 1fr, each row's intrinsic width calc lets its own full_name+email length
// push the track wider, so rows (and the header) end up different total
// widths and the fixed columns after it drift out of alignment row to row.
const GRID_COLS_DEFAULT = 'grid-cols-[auto_minmax(160px,1fr)_100px_110px_40px]'
const GRID_COLS_WITH_ROSTER = 'grid-cols-[56px_auto_minmax(160px,1fr)_90px_80px_70px_85px_100px_110px_40px]'

export function StudentTable({
  classroomId, students, otherClassrooms, profiles = {}, showRoster = false, showProfiles = false,
  sortKey, sortDir, onToggleSort,
}: Props) {
  const GRID_COLS = showRoster ? GRID_COLS_WITH_ROSTER : GRID_COLS_DEFAULT
  const augmented: Student[] = students.map((s, i) => ({
    ...s,
    score: MOCK_SCORES[i % MOCK_SCORES.length],
    status: MOCK_STATUSES[i % MOCK_STATUSES.length],
    initials: s.full_name.slice(0, 2),
  }))

  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<StatusType | ''>('')
  const [showFilters, setShowFilters] = useState(false)
  const [viewingProfile, setViewingProfile] = useState<Student | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = augmented
    .filter(s =>
      s.full_name.toLowerCase().includes(query.toLowerCase()) ||
      s.email.toLowerCase().includes(query.toLowerCase())
    )
    .filter(s => activeFilter ? s.status === activeFilter : true)
    .sort((a, b) => {
      if (sortKey === 'score') return sortDir === 'asc' ? a.score - b.score : b.score - a.score
      if (sortKey === 'status') {
        const cmp = a.status.localeCompare(b.status)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return compareStudents(a, b, profiles, sortKey, sortDir)
    })

  function handleRemove(studentId: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจากห้องเรียน?`)) return
    startTransition(async () => {
      const res = await removeStudent(classroomId, studentId)
      if (res?.error) toast.error(res.error)
      else toast.success(`ลบ ${name} ออกแล้ว`)
    })
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />
  }

  function headerBtnClass(col: SortKey) {
    return `flex items-center gap-1 px-2 py-1 -my-1 rounded-lg transition-colors ${
      sortKey === col ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:text-gray-700 hover:bg-gray-100'
    }`
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
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-x-auto">
        {/* Header */}
        <div className={`grid ${GRID_COLS} gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
          {showRoster && (
            <div className="text-center" title="ลำดับตามที่แสดงในตารางนี้ (เรียงคอลัมน์อื่นได้ แต่เลขนี้ไม่เปลี่ยน)">
              ลำดับ
            </div>
          )}
          <div className="w-8" />
          <button className={`text-left ${headerBtnClass('name')}`} onClick={() => onToggleSort('name')}>
            ชื่อ <SortIcon col="name" />
          </button>
          {showRoster && (
            <>
              <button className={headerBtnClass('grade')} onClick={() => onToggleSort('grade')}>
                ระดับชั้น <SortIcon col="grade" />
              </button>
              <button className={headerBtnClass('section')} onClick={() => onToggleSort('section')}>
                ห้อง <SortIcon col="section" />
              </button>
              <button className={headerBtnClass('number')} onClick={() => onToggleSort('number')}>
                เลขที่ <SortIcon col="number" />
              </button>
              <button className={headerBtnClass('code')} onClick={() => onToggleSort('code')}>
                รหัสนักเรียน <SortIcon col="code" />
              </button>
            </>
          )}
          <button className={headerBtnClass('score')} onClick={() => onToggleSort('score')}>
            คะแนน <SortIcon col="score" />
          </button>
          <button className={headerBtnClass('status')} onClick={() => onToggleSort('status')}>
            สถานะ <SortIcon col="status" />
          </button>
          <div />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">ไม่พบนักเรียน</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((student, index) => {
              const cfg = STATUS_CFG[student.status]
              const profile = profiles[student.id]
              return (
                <div
                  key={student.id}
                  className={`grid ${GRID_COLS} gap-3 items-center px-4 py-3 hover:bg-gray-50/50 transition-colors relative`}
                >
                  {showRoster && (
                    <span className="text-sm text-gray-500 text-center">{index + 1}</span>
                  )}
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                    {student.initials}
                  </div>

                  {/* Name + email */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{student.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{student.email}</p>
                    {showProfiles && (
                      <button
                        onClick={() => setViewingProfile(student)}
                        className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-medium mt-0.5"
                      >
                        <IdCard className="w-3 h-3" /> ดูข้อมูลนักเรียน
                      </button>
                    )}
                  </div>

                  {showRoster && (
                    <>
                      <span className="text-sm text-gray-700 truncate">{profile?.grade_level || '—'}</span>
                      <span className="text-sm text-gray-700">{profile?.section_number ? `ห้อง ${profile.section_number}` : '—'}</span>
                      <span className="text-sm text-gray-700">{profile?.class_number ?? '—'}</span>
                      <span className="text-sm text-gray-700 truncate">{profile?.student_code || '—'}</span>
                    </>
                  )}

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
                  <DropdownMenu>
                    <DropdownMenuTrigger className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors outline-none">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.success('ฟีเจอร์กำลังพัฒนา')}>
                        <Mail className="w-3.5 h-3.5 text-gray-400" /> ส่งข้อความ
                      </DropdownMenuItem>
                      {otherClassrooms.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <ArrowRightLeft className="w-3.5 h-3.5 text-gray-400" /> ย้ายห้องเรียน
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {otherClassrooms.map(c => (
                              <DropdownMenuItem
                                key={c.id}
                                onClick={() => toast.success(`ย้ายไป ${c.name} (ฟีเจอร์กำลังพัฒนา)`)}
                              >
                                {c.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleRemove(student.id, student.full_name)}
                        disabled={isPending}
                      >
                        <UserMinus className="w-3.5 h-3.5" /> ลบออกจากห้อง
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Student personal-info dialog (homeroom advisor only) */}
      <Dialog open={!!viewingProfile} onOpenChange={open => !open && setViewingProfile(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ข้อมูลนักเรียน: {viewingProfile?.full_name}</DialogTitle>
          </DialogHeader>
          {viewingProfile && <StudentProfilePanel profile={profiles[viewingProfile.id]} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
