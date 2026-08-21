'use client'

import Link from 'next/link'
import { Plus, Library, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function QuickCreate() {
  return (
    <Card radius="md" edge="ring" padding="md" className="space-y-3">
      <p className="text-sm font-semibold text-foreground">สร้างด่วน</p>
      <Link
        href="/questions/new"
        className="flex items-center gap-3 w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-4 py-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 group"
      >
        <div className="w-8 h-8 bg-card/10 rounded-lg flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">สร้างโจทย์ข้อใหม่</p>
          <p className="text-xs text-muted-foreground">เปิด Question Editor</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
      </Link>
      <Link
        href="/assignments/new"
        className="flex items-center gap-3 w-full bg-primary/10 hover:bg-primary/10 text-primary rounded-xl px-4 py-3 transition-all border border-primary/20 hover:border-primary/20 group"
      >
        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
          <Library className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">จัดชุดข้อสอบ</p>
          <p className="text-xs text-primary">ดึงจากคลังโจทย์</p>
        </div>
        <ChevronRight className="w-4 h-4 text-primary group-hover:text-primary transition-colors" />
      </Link>
    </Card>
  )
}
