'use client'

import { QRCodeSVG } from 'qrcode.react'

interface Props {
  questionCount: number
  assignmentId: string
  studentName?: string
  examId?: string
  showExamId: boolean
}

const CHOICES = ['ก', 'ข', 'ค', 'ง']

export function OMRSheetPreview({ questionCount, assignmentId, studentName, examId, showExamId }: Props) {
  const qrValue = `https://korkru.com/omr/${assignmentId}`
  const displayCount = Math.max(questionCount, 10)
  const col1 = Math.ceil(displayCount / 2)
  const questions = Array.from({ length: displayCount }, (_, i) => i + 1)

  return (
    <div className="text-[11px] font-sans">
      {/* OMR Header */}
      <div className="border-2 border-gray-800 rounded-sm mb-3 p-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-black text-[13px]">กระดาษคำตอบ — OMR</p>
            <p className="text-gray-500 text-[10px]">Optical Mark Recognition Sheet</p>
          </div>
          {showExamId && examId && (
            <div className="text-right">
              <p className="text-[9px] text-gray-400">Exam ID</p>
              <p className="font-mono font-bold text-[11px]">{examId}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <p className="text-gray-500">ชื่อ-นามสกุล</p>
            <p className="font-medium border-b border-gray-400 pb-0.5 mt-0.5 min-h-[14px]">
              {studentName ?? ''}
            </p>
          </div>
          <div>
            <p className="text-gray-500">เลขที่</p>
            <div className="flex gap-1 mt-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-5 h-5 border border-gray-400 rounded-sm" />
              ))}
            </div>
          </div>
          <div>
            <p className="text-gray-500">ห้อง</p>
            <p className="font-medium border-b border-gray-400 pb-0.5 mt-0.5 min-h-[14px]" />
          </div>
          <div>
            <p className="text-gray-500">วันที่สอบ</p>
            <p className="font-medium border-b border-gray-400 pb-0.5 mt-0.5 min-h-[14px]" />
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-sm px-2 py-1.5 mb-3 text-[9px] text-gray-600">
        <span className="font-bold">คำชี้แจง:</span> ระบายวงกลมให้เต็มและมิดชิด ใช้ดินสอ 2B เท่านั้น
        หากต้องการแก้ไขให้ลบให้สะอาดก่อนระบายใหม่
      </div>

      {/* Bubble grid — 2 columns */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {questions.map(qNum => (
          <div key={qNum} className="flex items-center gap-2 py-[3px] border-b border-gray-100">
            <span className="w-6 text-right text-[10px] font-bold text-gray-700 shrink-0">{qNum}.</span>
            <div className="flex gap-2">
              {CHOICES.map((c, ci) => (
                <label key={c} className="flex items-center gap-0.5 cursor-default">
                  <div className="w-4 h-4 rounded-full border border-gray-500 flex items-center justify-center bg-white hover:bg-gray-100">
                    <span className="text-[7px] text-gray-400">{c}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: QR + Barcode */}
      <div className="flex items-end justify-between mt-4 pt-3 border-t border-dashed border-gray-300">
        <div>
          <p className="text-[9px] text-gray-400 mb-1">Barcode ประจำตัวนักเรียน</p>
          {/* Mock barcode visual */}
          <div className="flex gap-px h-8 items-end">
            {Array.from({ length: 28 }, (_, i) => {
              const h = 60 + ((i * 37 + 13) % 40)
              const w = (i % 5 === 0) ? 2 : 1
              return (
                <div
                  key={i}
                  className="bg-gray-900"
                  style={{ width: `${w * 2}px`, height: `${h}%` }}
                />
              )
            })}
          </div>
          <p className="text-[8px] text-gray-400 mt-0.5 font-mono tracking-widest">
            {assignmentId.slice(0, 12).toUpperCase()}
          </p>
        </div>

        <div className="text-center">
          <QRCodeSVG value={qrValue} size={56} level="M" />
          <p className="text-[8px] text-gray-400 mt-0.5">สแกนส่งคำตอบ</p>
        </div>
      </div>
    </div>
  )
}
