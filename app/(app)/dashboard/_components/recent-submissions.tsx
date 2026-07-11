'use client'

import { Clock, CheckCircle2, AlertCircle, FileText } from 'lucide-react'

const SUBMISSIONS = [
  {
    id: 1,
    title: 'กระดาษคำตอบ: เครื่องเร่งอนุภาคที่ CERN',
    type: 'เขียนตอบ',
    count: 15,
    status: 'pending',
    time: '25 นาทีที่แล้ว',
  },
  {
    id: 2,
    title: 'แบบทดสอบย่อย: กลศาสตร์ควอนตัม ครั้งที่ 3',
    type: 'ปรนัย',
    count: 38,
    status: 'graded',
    time: '2 ชั่วโมงที่แล้ว',
  },
  {
    id: 3,
    title: 'รายงาน: การทดลองแรงเสียดทาน Lab 4',
    type: 'เขียนตอบ',
    count: 5,
    status: 'late',
    time: '1 วันที่แล้ว',
  },
  {
    id: 4,
    title: 'แบบทดสอบ: คลื่นแม่เหล็กไฟฟ้า บทที่ 7',
    type: 'ปรนัย',
    count: 40,
    status: 'graded',
    time: '2 วันที่แล้ว',
  },
]

const STATUS_CONFIG = {
  pending: {
    label: 'รอตรวจ',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: Clock,
    dot: 'bg-amber-400',
  },
  graded: {
    label: 'ตรวจแล้ว',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: CheckCircle2,
    dot: 'bg-emerald-400',
  },
  late: {
    label: 'ส่งช้า',
    bg: 'bg-red-50',
    text: 'text-red-600',
    icon: AlertCircle,
    dot: 'bg-red-400',
  },
}

export function RecentSubmissions() {
  return (
    <div className="bg-white rounded-xl ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">การส่งงานล่าสุด</p>
        <button className="text-xs text-blue-600 hover:underline">ดูทั้งหมด</button>
      </div>
      <div className="divide-y divide-gray-50">
        {SUBMISSIONS.map(sub => {
          const cfg = STATUS_CONFIG[sub.status as keyof typeof STATUS_CONFIG]
          const StatusIcon = cfg.icon
          return (
            <div key={sub.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors group">
              {/* Timeline dot */}
              <div className="relative mt-1 shrink-0">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {sub.id !== SUBMISSIONS[SUBMISSIONS.length - 1].id && (
                  <div className="absolute top-2.5 left-0.5 w-px h-6 -translate-x-1/2 bg-gray-100" style={{ left: '3px' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium leading-snug group-hover:text-blue-600 truncate transition-colors">
                      {sub.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <FileText className="w-3 h-3" />
                        {sub.type} · {sub.count} คน
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{sub.time}</span>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${cfg.bg} ${cfg.text}`}>
                    <StatusIcon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
