'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SmartTagInput } from '@/components/ui/smart-tag-input'
import type { Difficulty, Visibility } from '@/lib/types'

const difficultyLabels: Record<string, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
  analytical: 'วิเคราะห์',
}

const visibilityLabels: Record<string, string> = {
  private: 'ส่วนตัว',
  school: 'โรงเรียน',
}

export const THAI_SUBJECTS = [
  'ฟิสิกส์',
  'เคมี',
  'ชีววิทยา',
  'วิทยาศาสตร์',
  'โลก ดาราศาสตร์ และอวกาศ',
  'คณิตศาสตร์',
  'คณิตศาสตร์เพิ่มเติม',
  'ภาษาไทย',
  'ภาษาอังกฤษ',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'ประวัติศาสตร์',
  'ภูมิศาสตร์',
  'เศรษฐศาสตร์',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'ดนตรี',
  'นาฏศิลป์',
  'การงานอาชีพ',
  'วิทยาการคำนวณ',
] as const

const RECENT_SUBJECTS_KEY = 'korkru_recent_subjects'
const MAX_RECENT_SUBJECTS = 20

function loadRecentSubjects(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_SUBJECTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecentSubject(subject: string) {
  if (typeof window === 'undefined') return
  const trimmed = subject.trim()
  if (!trimmed) return
  const existing = loadRecentSubjects().filter(s => s !== trimmed)
  const updated = [trimmed, ...existing].slice(0, MAX_RECENT_SUBJECTS)
  try {
    window.localStorage.setItem(RECENT_SUBJECTS_KEY, JSON.stringify(updated))
  } catch {
    // storage full or unavailable — skip silently
  }
}

// ─── SubjectAutocomplete ───────────────────────────────────────────────────────

function SubjectAutocomplete({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  const [inputValue, setInputValue] = useState(value)
  const [open, setOpen] = useState(false)
  const [recentSubjects, setRecentSubjects] = useState<string[]>([])

  useEffect(() => { setRecentSubjects(loadRecentSubjects()) }, [])
  useEffect(() => { setInputValue(value) }, [value])

  const query = inputValue.trim().toLowerCase()
  const suggestions = Array.from(new Set([...recentSubjects, ...THAI_SUBJECTS]))
  const filtered = query
    ? suggestions.filter(s => s.toLowerCase().includes(query))
    : suggestions
  const showDropdown = open && filtered.length > 0

  function commit(v: string) {
    const trimmed = v.trim()
    setInputValue(trimmed)
    onChange(trimmed)
    if (trimmed) {
      saveRecentSubject(trimmed)
      setRecentSubjects(loadRecentSubjects())
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={e => { setInputValue(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => commit(inputValue), 150)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(inputValue) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="พิมพ์ชื่อวิชา เช่น ฟิสิกส์, เคมี"
        className="text-sm"
      />
      {showDropdown && (
        <div className="absolute z-50 top-full mt-1 w-full border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); commit(s) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── GeneralInfoSection ────────────────────────────────────────────────────────

interface GeneralInfoSectionProps {
  allTags: string[]
  title: string
  onTitleChange: (v: string) => void
  subject: string
  onSubjectChange: (v: string) => void
  difficulty: Difficulty
  onDifficultyChange: (v: Difficulty) => void
  visibility: Visibility
  onVisibilityChange: (v: Visibility) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
}

export function GeneralInfoSection({
  allTags,
  title, onTitleChange,
  subject, onSubjectChange,
  difficulty, onDifficultyChange,
  visibility, onVisibilityChange,
  tags, onTagsChange,
}: GeneralInfoSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 border-b pb-2">ข้อมูลทั่วไป</h2>

      <div className="space-y-1.5">
        <Label htmlFor="title">ชื่อโจทย์ *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="เช่น วัตถุมวล m ได้รับแรง F หาความเร่ง"
        />
      </div>

      <div className="space-y-1.5">
        <Label>วิชา *</Label>
        <SubjectAutocomplete value={subject} onChange={onSubjectChange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>ระดับความยาก</Label>
          <Select value={difficulty} onValueChange={(v) => v !== null && onDifficultyChange(v as Difficulty)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกระดับ">
                {difficultyLabels[difficulty] ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">ง่าย</SelectItem>
              <SelectItem value="medium">ปานกลาง</SelectItem>
              <SelectItem value="hard">ยาก</SelectItem>
              <SelectItem value="analytical">วิเคราะห์</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>การมองเห็น</Label>
          <Select value={visibility} onValueChange={(v) => v !== null && onVisibilityChange(v as Visibility)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกการมองเห็น">
                {visibilityLabels[visibility] ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">ส่วนตัว</SelectItem>
              <SelectItem value="school">โรงเรียน</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>แท็ก *</Label>
        <p className="text-xs text-gray-500">ใช้ระบุหัวข้อของโจทย์ เช่น แรง, กฎนิวตัน, พลังงาน — ช่วยให้ค้นหาและกรองโจทย์ได้ง่ายขึ้น</p>
        <SmartTagInput allTags={allTags} tags={tags} onTagsChange={onTagsChange} />
      </div>
    </section>
  )
}
