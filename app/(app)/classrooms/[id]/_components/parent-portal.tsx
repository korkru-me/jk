'use client'

import { useState } from 'react'
import { Mail, Key, CheckCircle2, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const MOCK_OBSERVER_CODES = [
  { studentName: 'ธนภัทร สุขใส', code: 'OBS-7K2M' },
  { studentName: 'พิมพ์ชนก รักดี', code: 'OBS-9P4X' },
  { studentName: 'อนุชา วงษ์ศรี', code: 'OBS-3R8N' },
]

export function ParentPortal({ studentCount }: { studentCount: number }) {
  const [weeklyReport, setWeeklyReport] = useState(true)
  const [showCodes, setShowCodes] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code)
      toast.success(`คัดลอก ${code} แล้ว`)
      setTimeout(() => setCopiedCode(null), 2000)
    })
  }

  const successCount = Math.round(studentCount * 0.875)

  return (
    <div className="space-y-4">
      {/* Weekly report toggle */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <Mail className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">รายงานพัฒนาการรายสัปดาห์</p>
              <p className="text-xs text-gray-500 mt-0.5">ส่งอีเมลสรุปคะแนนและกิจกรรมให้ผู้ปกครองทุกวันศุกร์</p>
            </div>
          </div>
          {/* Toggle switch */}
          <button
            onClick={() => { setWeeklyReport(!weeklyReport); toast.success(weeklyReport ? 'ปิดการส่งรายงานแล้ว' : 'เปิดการส่งรายงานแล้ว') }}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${weeklyReport ? 'bg-blue-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${weeklyReport ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {weeklyReport && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">การส่งล่าสุด: วันศุกร์ที่ผ่านมา</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>สำเร็จ {successCount} คน</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>ล้มเหลว {studentCount - successCount} คน</span>
              </div>
              <button onClick={() => toast.success('กำลังส่งใหม่... (ฟีเจอร์กำลังพัฒนา)')} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                <RefreshCw className="w-3 h-3" /> ส่งใหม่
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Observer codes */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
              <Key className="w-4.5 h-4.5 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">รหัสผู้สังเกตการณ์</p>
              <p className="text-xs text-gray-500 mt-0.5">ผู้ปกครองใช้รหัสนี้เพื่อดูพัฒนาการบุตรหลาน</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCodes(!showCodes)}
          >
            {showCodes ? 'ซ่อน' : 'แสดงรหัส'}
          </Button>
        </div>

        {showCodes && (
          <div className="space-y-2">
            {MOCK_OBSERVER_CODES.map(item => (
              <div key={item.code} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                <div>
                  <p className="text-sm text-gray-700">{item.studentName}</p>
                  <p className="font-mono text-xs font-bold text-gray-500 mt-0.5 tracking-widest">{item.code}</p>
                </div>
                <button
                  onClick={() => copyCode(item.code)}
                  className="w-7 h-7 rounded-lg hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {copiedCode === item.code ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => toast.success('สร้างรหัสสำหรับทุกคนแล้ว (ฟีเจอร์กำลังพัฒนา)')}>
              สร้างรหัสสำหรับนักเรียนทุกคน
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
