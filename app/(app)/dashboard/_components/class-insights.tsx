'use client'

import { AlertTriangle, ChevronRight } from 'lucide-react'

export function ClassInsights() {
  return (
    <div className="bg-warning/10 border border-warning/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warning mb-0.5">วิเคราะห์ผลการเรียน</p>
          <p className="text-sm text-warning leading-relaxed">
            นักเรียนชั้น <span className="font-semibold">ม.4/1</span> มีคะแนนเฉลี่ยด้านทักษะ
            การเขียนกราฟผลการทดลองต่ำกว่าเกณฑ์มาตรฐาน PISA (เฉลี่ย 48 คะแนน จากคะแนนเต็ม 100)
            แนะนำให้มอบหมายแบบฝึกหัดเสริม
          </p>
        </div>
        <button className="flex items-center gap-1 text-xs font-semibold text-warning bg-warning/10 hover:bg-warning/10 px-3 py-1.5 rounded-lg shrink-0 transition-colors whitespace-nowrap">
          มอบหมายงาน
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
