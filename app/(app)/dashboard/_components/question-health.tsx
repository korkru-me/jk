'use client'

import { AlertOctagon, ExternalLink } from 'lucide-react'

export function QuestionHealth() {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <AlertOctagon className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-destructive">ตรวจพบข้อสอบมีปัญหา</p>
            <span className="text-[10px] bg-destructive/10 text-destructive font-bold px-1.5 py-0.5 rounded-full">
              ด่วน
            </span>
          </div>
          <p className="text-sm text-destructive leading-relaxed">
            ข้อสอบรหัส <span className="font-mono font-semibold bg-destructive/10 px-1 rounded">PYS-402</span>{' '}
            (เรื่องแรงเสียดทาน) มีค่าอำนาจจำแนกติดลบ นักเรียนกลุ่มเก่งตอบผิด{' '}
            <span className="font-semibold">95%</span> กรุณาตรวจสอบความถูกต้องของเฉลย
          </p>
          <button className="flex items-center gap-1.5 text-xs font-semibold text-destructive hover:text-destructive mt-2 transition-colors">
            <ExternalLink className="w-3 h-3" />
            เปิดแก้ไขโจทย์
          </button>
        </div>
      </div>
    </div>
  )
}
