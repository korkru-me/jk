'use client'

import { useState } from 'react'
import { Lightbulb, X, ChevronRight } from 'lucide-react'

const TIPS = [
  {
    id: 1,
    text: 'เทคนิค: การแนบรูปภาพกราฟลงในโจทย์ฟิสิกส์ ระบบของเราสามารถใช้ AI สกัดค่าตัวเลขจากแกน X และ Y ออกมาเพื่อทำเฉลยอัตโนมัติได้',
    cta: 'ลองเลย',
  },
  {
    id: 2,
    text: 'คุณรู้ไหม? การตั้งค่า "น้ำหนักโจทย์" ในชุดข้อสอบช่วยให้ระบบเลือกโจทย์ที่สมดุลระหว่างระดับ Bloom\'s Taxonomy ได้อัตโนมัติ',
    cta: 'อ่านเพิ่ม',
  },
]

export function DailyTips() {
  const [dismissed, setDismissed] = useState<number[]>([])
  const visible = TIPS.filter(t => !dismissed.includes(t.id))

  if (visible.length === 0) return null

  const tip = visible[0]

  return (
    <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 relative">
      <button
        onClick={() => setDismissed(prev => [...prev, tip.id])}
        className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-warning hover:bg-warning/10 hover:text-warning/80 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-start gap-2.5 pr-4">
        <div className="w-7 h-7 bg-warning/10 rounded-full flex items-center justify-center shrink-0">
          <Lightbulb className="w-3.5 h-3.5 text-warning" />
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-800 mb-1">เทคนิคของวันนี้</p>
          <p className="text-xs text-warning leading-relaxed">{tip.text}</p>
          <button className="flex items-center gap-1 text-xs font-semibold text-warning hover:text-amber-900 mt-2 transition-colors">
            {tip.cta} <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
