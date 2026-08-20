'use client'

import { useState } from 'react'
import { Printer, CalendarClock } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'

const INITIAL_TASKS = [
  {
    id: 1,
    text: 'จัดพิมพ์ชุดแบบทดสอบย่อย ฟิสิกส์อนุภาค จำนวน 40 ชุด สำหรับคาบเรียนเช้าพรุ่งนี้',
    time: 'พรุ่งนี้ 08:00',
    urgent: true,
  },
  {
    id: 2,
    text: 'ตรวจกระดาษคำตอบ เรื่องเครื่องเร่งอนุภาค (15 ชุดที่เหลือ)',
    time: 'พรุ่งนี้ 15:00',
    urgent: false,
  },
  {
    id: 3,
    text: 'เตรียมสไลด์บรรยาย บทที่ 8: สนามแม่เหล็กและกระแสไฟฟ้า',
    time: 'อีก 2 วัน',
    urgent: false,
  },
  {
    id: 4,
    text: 'อัปโหลดเฉลยแบบทดสอบกลางภาค ม.4 ขึ้นระบบ',
    time: 'อีก 3 วัน',
    urgent: false,
  },
]

export function UpcomingTasks() {
  const [done, setDone] = useState<number[]>([])

  const toggle = (id: number) =>
    setDone(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="bg-card rounded-xl ring-1 ring-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">เตรียมสอนพรุ่งนี้</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {done.length}/{INITIAL_TASKS.length} เสร็จ
        </span>
      </div>
      <div className="divide-y divide-border">
        {INITIAL_TASKS.map(task => {
          const isDone = done.includes(task.id)
          return (
            <div key={task.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group">
              <button
                onClick={() => toggle(task.id)}
                className={`mt-0.5 w-4.5 h-4.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                  isDone
                    ? 'bg-success border-success text-white'
                    : 'border-border hover:border-success'
                }`}
              >
                {isDone && (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug transition-all ${
                  isDone ? 'line-through text-muted-foreground' : 'text-muted-foreground'
                }`}>
                  {task.text}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {task.urgent && (
                    <span className="text-[10px] bg-destructive/10 text-destructive font-semibold px-1.5 py-0.5 rounded">
                      เร่งด่วน
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{task.time}</span>
                </div>
              </div>
              <IconButton label="พิมพ์" size="sm" className="bg-muted hover:bg-primary/10 hover:text-primary">
                <Printer />
              </IconButton>
            </div>
          )
        })}
      </div>
    </div>
  )
}
