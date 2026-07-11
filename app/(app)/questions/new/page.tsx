import Link from 'next/link'
import { Shuffle, ListChecks, ArrowLeftRight, FileText, CheckSquare, AlignLeft, ArrowUpDown, ChevronRight, Zap } from 'lucide-react'

const QUESTION_TYPES = [
  {
    href: '/questions/new/random',
    icon: Shuffle,
    title: 'เติมคำตอบตัวเลข',
    desc: 'สร้างจากสมการ เขียนสมการเอง หรือกำหนดคำตอบตายตัว — เลือกได้ในหน้าเดียว',
    color: 'bg-violet-50 border-violet-200 text-violet-700',
    iconColor: 'text-violet-500',
  },
  {
    href: '/questions/new/mcq',
    icon: ListChecks,
    title: 'ปรนัย (เลือกตอบ)',
    desc: 'ตัวเลือก 2–6 ข้อ นักเรียนเลือกคำตอบที่ถูกต้องจากรายการ',
    color: 'bg-green-50 border-green-200 text-green-700',
    iconColor: 'text-green-500',
  },
  {
    href: '/questions/new/true-false',
    icon: CheckSquare,
    title: 'ถูก-ผิด',
    desc: 'นักเรียนตัดสินว่าข้อความแต่ละข้อถูกหรือผิด',
    color: 'bg-teal-50 border-teal-200 text-teal-700',
    iconColor: 'text-teal-500',
  },
  {
    href: '/questions/new/fill-blank',
    icon: AlignLeft,
    title: 'เติมคำในช่องว่าง',
    desc: 'ข้อความพร้อมช่องว่าง นักเรียนพิมพ์คำหรือวลีที่ขาดหายไป',
    color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    iconColor: 'text-cyan-500',
  },
  {
    href: '/questions/new/ordering',
    icon: ArrowUpDown,
    title: 'เรียงลำดับ',
    desc: 'นักเรียนเรียงรายการ ขั้นตอน หรือเหตุการณ์ให้ถูกลำดับ',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    iconColor: 'text-amber-500',
  },
  {
    href: '/questions/new/matching',
    icon: ArrowLeftRight,
    title: 'จับคู่',
    desc: 'นักเรียนจับคู่รายการสองชุดที่สัมพันธ์กัน',
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    iconColor: 'text-orange-500',
  },
  {
    href: '/questions/new/essay',
    icon: FileText,
    title: 'อัตนัย (บรรยาย)',
    desc: 'นักเรียนเขียนคำตอบอิสระ ครูตรวจและให้คะแนนเอง',
    color: 'bg-rose-50 border-rose-200 text-rose-700',
    iconColor: 'text-rose-500',
  },
]

export default function NewQuestionTypePage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ใหม่</h1>
        <p className="text-sm text-gray-500 mt-1">เลือกประเภทโจทย์ที่ต้องการสร้าง</p>
      </div>

      {/* Advanced Editor Banner */}
      <Link
        href="/questions/advanced/new"
        className="flex items-center gap-4 p-4 rounded-xl border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-violet-50 hover:shadow-lg hover:border-indigo-400 transition-all group"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-indigo-800">Advanced Question Editor</p>
          <p className="text-xs mt-0.5 text-indigo-600 leading-relaxed">
            Split-screen LaTeX · ตัวแปรสุ่ม · กราฟเวกเตอร์ · โจทย์สถานการณ์ PISA · บันทึกอัตโนมัติ
          </p>
        </div>
        <span className="text-xs font-bold text-white bg-indigo-600 px-2.5 py-1 rounded-full shrink-0">ใหม่</span>
        <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUESTION_TYPES.map((type) => {
          const Icon = type.icon
          return (
            <Link
              key={type.href}
              href={type.href}
              className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md ${type.color}`}
            >
              <div className={`mt-0.5 ${type.iconColor}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{type.title}</p>
                <p className="text-xs mt-0.5 opacity-75 leading-relaxed">{type.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0 mt-0.5" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
