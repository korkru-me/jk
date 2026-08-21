'use client'

import { UserPlus, FileEdit, CheckSquare, LogIn, Bell, Trash2, Upload } from 'lucide-react'
import { Card } from '@/components/ui/card'

type EventType = 'join' | 'submit' | 'edit' | 'login' | 'notify' | 'remove' | 'upload'
interface LogEvent { id: string; type: EventType; message: string; time: string; actor: string }

const ICON_MAP: Record<EventType, { icon: typeof UserPlus; color: string; bg: string }> = {
  join:   { icon: UserPlus,    color: 'text-success', bg: 'bg-success/10' },
  submit: { icon: CheckSquare, color: 'text-primary',    bg: 'bg-primary/10' },
  edit:   { icon: FileEdit,    color: 'text-tint-1',  bg: 'bg-tint-1/10' },
  login:  { icon: LogIn,       color: 'text-muted-foreground',    bg: 'bg-muted' },
  notify: { icon: Bell,        color: 'text-warning',   bg: 'bg-warning/10' },
  remove: { icon: Trash2,      color: 'text-destructive',     bg: 'bg-destructive/10' },
  upload: { icon: Upload,      color: 'text-tint-4',    bg: 'bg-tint-4/10' },
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
    <Card edge="ring" className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold text-foreground">ประวัติกิจกรรม</p>
        <span className="text-xs text-muted-foreground">{MOCK_EVENTS.length} รายการ</span>
      </div>
      <div className="divide-y divide-border">
        {MOCK_EVENTS.map((event, i) => {
          const cfg = ICON_MAP[event.type]
          const Icon = cfg.icon
          return (
            <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
              {/* Icon */}
              <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              {/* Timeline line */}
              <div className="relative flex-1 min-w-0">
                {i < MOCK_EVENTS.length - 1 && (
                  <div className="absolute -left-[22px] top-7 w-px h-full bg-muted" />
                )}
                <p className="text-sm text-foreground leading-snug">
                  <span className="font-semibold">{event.actor}</span>{' '}
                  {event.message}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{event.time}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
