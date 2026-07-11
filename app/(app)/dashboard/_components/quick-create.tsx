'use client'

import Link from 'next/link'
import { Plus, Library, ChevronRight } from 'lucide-react'

export function QuickCreate() {
  return (
    <div className="bg-white rounded-xl ring-1 ring-black/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900">สร้างด่วน</p>
      <Link
        href="/questions/new"
        className="flex items-center gap-3 w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-4 py-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 group"
      >
        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">สร้างโจทย์ข้อใหม่</p>
          <p className="text-xs text-gray-400">เปิด Question Editor</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
      </Link>
      <Link
        href="/assignments/new"
        className="flex items-center gap-3 w-full bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-xl px-4 py-3 transition-all border border-blue-100 hover:border-blue-200 group"
      >
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
          <Library className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">จัดชุดข้อสอบ</p>
          <p className="text-xs text-blue-500">ดึงจากคลังโจทย์</p>
        </div>
        <ChevronRight className="w-4 h-4 text-blue-300 group-hover:text-blue-600 transition-colors" />
      </Link>
    </div>
  )
}
