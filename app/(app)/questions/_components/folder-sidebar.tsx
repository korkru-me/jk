'use client'

import { useState } from 'react'
import { Plus, Flag, History, Clock } from 'lucide-react'
import { toast } from 'sonner'

export interface Folder { id: string; name: string; emoji: string }

interface Props {
  folders: Folder[]
  selectedFolder: string
  onSelectFolder: (id: string) => void
  totalCount: number
  flaggedCount: number
  typeBreakdown: Record<string, number>
}

const MOCK_COUNTS: Record<string, number> = { f1: 12, f2: 8, f3: 5, f4: 20 }

export function FolderSidebar({ folders, selectedFolder, onSelectFolder, totalCount, flaggedCount, typeBreakdown }: Props) {
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')

  function createFolder() {
    if (!newName.trim()) return
    toast.success(`สร้างแฟ้ม "${newName.trim()}" แล้ว`)
    setNewName('')
    setShowInput(false)
  }

  return (
    <aside className="w-56 shrink-0 self-start sticky top-0 space-y-3">

      {/* Folder tree */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">แฟ้มข้อสอบ</p>
        </div>

        <nav className="pb-1">
          {folders.map(f => {
            const isActive = selectedFolder === f.id
            const count = f.id === 'all' ? totalCount : (MOCK_COUNTS[f.id] ?? 0)
            return (
              <button
                key={f.id}
                onClick={() => onSelectFolder(f.id)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-all text-left ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base leading-none">{f.emoji}</span>
                <span className="flex-1 truncate">{f.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                }`}>{count}</span>
              </button>
            )
          })}
        </nav>

        {/* New folder */}
        {showInput ? (
          <div className="px-3 pb-3 space-y-1.5 border-t border-gray-50 pt-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createFolder()
                if (e.key === 'Escape') { setShowInput(false); setNewName('') }
              }}
              placeholder="ชื่อแฟ้มใหม่..."
              autoFocus
              className="w-full text-sm px-2.5 py-1.5 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-1.5">
              <button onClick={createFolder} className="flex-1 text-xs bg-blue-500 hover:bg-blue-600 text-white py-1 rounded-lg transition-colors">สร้าง</button>
              <button onClick={() => { setShowInput(false); setNewName('') }} className="flex-1 text-xs border border-gray-200 text-gray-500 py-1 rounded-lg hover:bg-gray-50 transition-colors">ยกเลิก</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all border-t border-gray-50"
          >
            <Plus className="w-3.5 h-3.5" /> สร้างแฟ้มใหม่
          </button>
        )}
      </div>

      {/* Shortcuts */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">ทางลัด</p>
        </div>
        <nav className="pb-2">
          {[
            { label: 'ถูกรายงาน',   icon: Flag,    count: flaggedCount, color: 'text-orange-500', hover: 'hover:bg-orange-50' },
            { label: 'แก้ไขล่าสุด', icon: Clock,   count: 5,           color: 'text-blue-500',   hover: 'hover:bg-blue-50' },
            { label: 'ประวัติทั้งหมด', icon: History, count: 0,        color: 'text-gray-500',   hover: 'hover:bg-gray-50' },
          ].map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={() => toast.info(`กำลังแสดง: ${item.label}`)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-600 ${item.hover} transition-colors`}
              >
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.count > 0 && (
                  <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-bold">{item.count}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 space-y-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">สรุปคลัง</p>
        {[
          { label: 'ปรนัย (MCQ)',     value: typeBreakdown['mcq'] ?? 0,     color: 'bg-blue-50 text-blue-600' },
          { label: 'อัตนัย',          value: typeBreakdown['written'] ?? 0,  color: 'bg-purple-50 text-purple-600' },
          { label: 'บรรยาย',          value: typeBreakdown['essay'] ?? 0,    color: 'bg-amber-50 text-amber-600' },
          { label: 'แบบสุ่มตัวแปร',   value: typeBreakdown['random_numeric'] ?? 0, color: 'bg-green-50 text-green-600' },
        ].map(s => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{s.label}</span>
            <span className={`px-1.5 py-0.5 rounded-md font-semibold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
