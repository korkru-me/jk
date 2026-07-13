'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, FileText, Repeat, Clock, MoreVertical, Copy, BarChart3, Monitor, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { duplicateAssignment } from '@/lib/actions/assignments'

export interface ClassroomAssignmentRow {
  id: string
  title: string
  type: string
  mode: string
  status: string
  start_at: string | null
  end_at: string | null
  question_ids: string[]
  created_at: string
}

type TypeFilter = 'all' | 'exercise' | 'exam'

const STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  draft:     { label: 'ฉบับร่าง',    bg: 'bg-gray-100',    text: 'text-gray-600' },
  published: { label: 'เผยแพร่แล้ว', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  closed:    { label: 'ปิดแล้ว',     bg: 'bg-red-50',       text: 'text-red-600' },
}

const TYPE_CFG: Record<string, { label: string; bg: string; text: string; icon: typeof FileText }> = {
  exam:     { label: 'ข้อสอบ',     bg: 'bg-blue-50',   text: 'text-blue-700',   icon: FileText },
  exercise: { label: 'แบบฝึกหัด', bg: 'bg-violet-50', text: 'text-violet-700', icon: Repeat },
}

interface Props {
  classroomId: string
  assignments: ClassroomAssignmentRow[]
  onViewScores?: () => void
}

export function ClassroomAssignmentsTab({ classroomId, assignments, onViewScores }: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = assignments.filter(a => typeFilter === 'all' ? true : a.type === typeFilter)

  function handleDuplicate(id: string) {
    setOpenMenu(null)
    startTransition(async () => {
      const res = await duplicateAssignment(id, { targetClassroomIds: [classroomId] })
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-3">
      {/* Filter chips + create button */}
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
        <Link
          href={`/assignments/new?classroom=${classroomId}`}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> มอบหมายงานใหม่
        </Link>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {assignments.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้ห้องนี้' : 'ไม่พบงานที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(a => {
              const statusCfg = STATUS_CFG[a.status] ?? STATUS_CFG.draft
              const typeCfg = TYPE_CFG[a.type] ?? TYPE_CFG.exam
              const TypeIcon = typeCfg.icon
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                  <Link href={`/assignments/${a.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeCfg.bg}`}>
                      <TypeIcon className={`w-4 h-4 ${typeCfg.text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{a.question_ids.length} ข้อ</span>
                        {a.mode === 'online' ? (
                          <Monitor className="w-3 h-3 text-gray-300" />
                        ) : (
                          <Printer className="w-3 h-3 text-gray-300" />
                        )}
                        {a.end_at && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <Clock className="w-3 h-3" /> {new Date(a.end_at).toLocaleDateString('th-TH')}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${typeCfg.bg} ${typeCfg.text}`}>
                    {typeCfg.label}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCfg.bg} ${statusCfg.text}`}>
                    {statusCfg.label}
                  </span>
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                      className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {openMenu === a.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg ring-1 ring-black/10 py-1 min-w-[170px]">
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            onClick={() => handleDuplicate(a.id)}
                            disabled={isPending}
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-400" /> ทำสำเนามาห้องนี้
                          </button>
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => { setOpenMenu(null); onViewScores?.() }}
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-gray-400" /> ดูคะแนน
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
