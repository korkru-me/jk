'use client'

import { UserPlus, FileEdit, CheckSquare, LogIn, Bell, Trash2, Upload } from 'lucide-react'

type EventType = 'join' | 'submit' | 'edit' | 'login' | 'notify' | 'remove' | 'upload'
interface LogEvent { id: string; type: EventType; message: string; time: string; actor: string }

const ICON_MAP: Record<EventType, { icon: typeof UserPlus; color: string; bg: string }> = {
  join:   { icon: UserPlus,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  submit: { icon: CheckSquare, color: 'text-blue-600',    bg: 'bg-blue-50' },
  edit:   { icon: FileEdit,    color: 'text-violet-600',  bg: 'bg-violet-50' },
  login:  { icon: LogIn,       color: 'text-gray-500',    bg: 'bg-gray-100' },
  notify: { icon: Bell,        color: 'text-amber-600',   bg: 'bg-amber-50' },
  remove: { icon: Trash2,      color: 'text-red-500',     bg: 'bg-red-50' },
  upload: { icon: Upload,      color: 'text-teal-600',    bg: 'bg-teal-50' },
}

const MOCK_EVENTS: LogEvent[] = [
  { id: '1', type: 'join',   actor: 'ธนภัทร สุขใส',      message: 'เข้าร่วมห้องเรียนผ่านลิงก์เชิญ',            time: '2 ชั่วโมงที่แล้ว' },
  { id: '2', type: 'submit', actor: 'พิมพ์ชนก รักดี',    message: 'ส่งแบบทดสอบ: กลศาสตร์อนุภาค ครั้งที่ 2',   time: '3 ชั่วโมงที่แล้ว' },
  { id: '3', type: 'edit',   actor: 'ครูพัชรีญา',        message: 'อัปเดตข้อสอบกลางภาค (เพิ่ม 5 ข้อ)',         time: 'เมื่อวาน 14:30' },
  { id: '4', type: 'join',   actor: 'อนุชา วงษ์ศรี',     message: 'เข้าร่วมห้องเรียนผ่านรหัส PHY-401',          time: 'เมื่อวาน 11:05' },
  { id: '5', type: 'notify', actor: 'ระบบ',              message: 'ส่งรายงานรายสัปดาห์ให้ผู้ปกครอง 35/40 คน', time: '2 วันที่แล้ว' },
  { id: '6', type: 'upload', actor: 'ครูวิชัย',          message: 'อัปโหลดไฟล์ PDF: สไลด์บทที่ 8',             time: '3 วันที่แล้ว' },
  { id: '7', type: 'submit', actor: 'นักเรียน 38 คน',   message: 'ส่งแบบทดสอบ: ฟิสิกส์อนุภาค ครั้งที่ 1',    time: '4 วันที่แล้ว' },
  { id: '8', type: 'remove', actor: 'ครูหลัก',           message: 'ลบนักเรียน 1 คนออกจากห้องเรียน',             time: '5 วันที่แล้ว' },
]

export function AuditLog() {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">ประวัติกิจกรรม</p>
        <span className="text-xs text-gray-400">{MOCK_EVENTS.length} รายการ</span>
      </div>
      <div className="divide-y divide-gray-50">
        {MOCK_EVENTS.map((event, i) => {
          const cfg = ICON_MAP[event.type]
          const Icon = cfg.icon
          return (
            <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
              {/* Icon */}
              <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              {/* Timeline line */}
              <div className="relative flex-1 min-w-0">
                {i < MOCK_EVENTS.length - 1 && (
                  <div className="absolute -left-[22px] top-7 w-px h-full bg-gray-100" />
                )}
                <p className="text-sm text-gray-800 leading-snug">
                  <span className="font-semibold">{event.actor}</span>{' '}
                  {event.message}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{event.time}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
