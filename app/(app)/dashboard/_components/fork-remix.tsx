'use client'

import { GitFork, Tag } from 'lucide-react'
import { Card } from '@/components/ui/card'

const TEMPLATES = [
  {
    id: 1,
    title: 'ข้อสอบแข่งขันฟิสิกส์โอลิมปิก ระดับชาติ',
    author: 'ครูพัชรีญา',
    subject: 'ฟิสิกส์ ม.ปลาย',
    forks: 120,
    questions: 30,
    gradient: 'from-blue-500 to-violet-500',
    initials: 'พช',
  },
  {
    id: 2,
    title: 'ชุดทบทวน PISA Science ระดับ 5–6',
    author: 'ครูวิชัย',
    subject: 'วิทยาศาสตร์',
    forks: 87,
    questions: 45,
    gradient: 'from-emerald-500 to-teal-500',
    initials: 'วช',
  },
  {
    id: 3,
    title: 'Pre-test ฟิสิกส์ ม.4 บทนำ',
    author: 'ครูสมพร',
    subject: 'ฟิสิกส์ ม.4',
    forks: 54,
    questions: 20,
    gradient: 'from-orange-400 to-red-500',
    initials: 'สพ',
  },
]

export function ForkRemix() {
  return (
    <Card radius="md" edge="ring" className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Fork & Remix</p>
        </div>
        <button className="text-xs text-primary hover:underline">ดูคลัง</button>
      </div>
      <div className="p-3 space-y-2">
        {TEMPLATES.map(tpl => (
          <div
            key={tpl.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/20 hover:bg-primary/10 transition-all group cursor-pointer"
          >
            {/* Cover thumbnail */}
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${tpl.gradient} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {tpl.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground group-hover:text-primary leading-snug truncate transition-colors">
                {tpl.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Tag className="w-2.5 h-2.5" />
                  {tpl.subject}
                </span>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="text-[10px] text-muted-foreground">{tpl.questions} ข้อ</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <GitFork className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">{tpl.forks}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
