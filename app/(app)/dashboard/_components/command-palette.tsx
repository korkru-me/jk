'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Search, BookOpen, Users, Zap, ArrowRight,
  FileText, Plus, Settings, X
} from 'lucide-react'

const CATEGORIES = [
  {
    label: 'ค้นหานักเรียน',
    icon: Users,
    color: 'text-blue-500',
    items: [
      { name: 'อนุชา วงษ์ศรี — ม.4/1', sub: 'คะแนนเฉลี่ย 62%' },
      { name: 'พิมพ์ชนก รักดี — ม.5/2', sub: 'คะแนนเฉลี่ย 88%' },
      { name: 'ธนภัทร สุขใส — ม.6/3', sub: 'คะแนนเฉลี่ย 74%' },
    ],
  },
  {
    label: 'คลังข้อสอบฟิสิกส์',
    icon: BookOpen,
    color: 'text-purple-500',
    items: [
      { name: 'กลศาสตร์ของนิวตัน — 120 ข้อ', sub: 'แก้ไขล่าสุด 3 วันที่แล้ว' },
      { name: 'ฟิสิกส์อนุภาค — 45 ข้อ', sub: 'แก้ไขล่าสุด 1 สัปดาห์ที่แล้ว' },
      { name: 'คลื่นและเสียง — 88 ข้อ', sub: 'แก้ไขล่าสุด 2 สัปดาห์ที่แล้ว' },
    ],
  },
  {
    label: 'คำสั่งด่วน',
    icon: Zap,
    color: 'text-amber-500',
    items: [
      { name: 'สร้างโจทย์ข้อใหม่', sub: 'เปิด Question Editor', href: '/questions/new', icon: Plus },
      { name: 'จัดชุดข้อสอบ', sub: 'ดึงจากคลัง', href: '/assignments/new', icon: FileText },
      { name: 'ตั้งค่าบัญชี', sub: 'โปรไฟล์และองค์กร', href: '/settings/organization', icon: Settings },
    ],
  },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  if (!open) return null

  const filtered = query.trim()
    ? CATEGORIES.map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.name.toLowerCase().includes(query.toLowerCase()) ||
            item.sub.toLowerCase().includes(query.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : CATEGORIES

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl ring-1 ring-black/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหานักเรียน, โจทย์, หรือคำสั่ง..."
            className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
          />
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบผลลัพธ์</p>
          ) : (
            filtered.map(cat => (
              <div key={cat.label} className="mb-1">
                <div className="flex items-center gap-2 px-4 py-1.5">
                  <cat.icon className={`w-3.5 h-3.5 ${cat.color}`} />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {cat.label}
                  </span>
                </div>
                {cat.items.map((item, i) => {
                  const ItemIcon = (item as any).icon
                  return (
                    <button
                      key={i}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left group transition-colors"
                      onClick={() => {
                        if ((item as any).href) window.location.href = (item as any).href
                        setOpen(false)
                      }}
                    >
                      {ItemIcon && (
                        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <ItemIcon className="w-3.5 h-3.5 text-gray-600" />
                        </div>
                      )}
                      {!ItemIcon && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center shrink-0 text-xs font-bold text-blue-600">
                          {item.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0" />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded font-mono">↑↓</kbd>
            {' '}เลือก
          </span>
          <span className="text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded font-mono">↵</kbd>
            {' '}เปิด
          </span>
          <span className="text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded font-mono">Esc</kbd>
            {' '}ปิด
          </span>
        </div>
      </div>
    </div>
  )
}
