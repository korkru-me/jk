'use client'

import { Mail, TrendingDown } from 'lucide-react'

const AT_RISK_STUDENTS = [
  {
    id: 1,
    name: 'อนุชา วงษ์ศรี',
    class: 'ม.4/1',
    score: 28,
    maxScore: 100,
    topic: 'อนุภาคมูลฐาน (แบบจำลองมาตรฐาน)',
    drop: 3,
    initials: 'อว',
    color: 'bg-red-100 text-red-600',
  },
  {
    id: 2,
    name: 'ปิยะพงษ์ สมใจ',
    class: 'ม.4/2',
    score: 31,
    maxScore: 100,
    topic: 'แรงและอันตรกิริยาของอนุภาค',
    drop: 2,
    initials: 'ปส',
    color: 'bg-orange-100 text-orange-600',
  },
  {
    id: 3,
    name: 'นภัสสร เจริญสุข',
    class: 'ม.4/3',
    score: 35,
    maxScore: 100,
    topic: 'ควาร์กและเลปตอน',
    drop: 2,
    initials: 'นจ',
    color: 'bg-orange-100 text-orange-600',
  },
]

export function StudentsAtRisk() {
  return (
    <div className="bg-white rounded-xl ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">นักเรียนที่ต้องดูแลพิเศษ</p>
          <p className="text-xs text-gray-400 mt-0.5">คะแนนลดลงติดต่อกัน 2+ ครั้ง</p>
        </div>
        <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-1 rounded-full">
          {AT_RISK_STUDENTS.length} คน
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {AT_RISK_STUDENTS.map(student => (
          <div key={student.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${student.color}`}>
              {student.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{student.name}</p>
                <span className="text-xs text-gray-400">{student.class}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{student.topic}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-1 text-red-500">
                  <TrendingDown className="w-3 h-3" />
                  <span className="text-xs font-semibold">{student.score}%</span>
                </div>
                <p className="text-[10px] text-gray-400">ตกหนัก {student.drop} ครั้ง</p>
              </div>
              <button className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors text-gray-500">
                <Mail className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
