'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'

export function SmartTagInput({ allTags, tags, onTagsChange }: {
  allTags: string[]
  tags: string[]
  onTagsChange: (tags: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)

  const trimmed = inputValue.trim()
  const filtered = allTags.filter(
    t => t.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(t)
  )
  const canCreate = !!trimmed && !tags.includes(trimmed) && !allTags.includes(trimmed)
  const showDropdown = open && (filtered.length > 0 || canCreate)

  function addTag(tag: string) {
    const t = tag.trim()
    if (t && !tags.includes(t)) onTagsChange([...tags, t])
    setInputValue('')
    setOpen(false)
  }

  function removeTag(i: number) {
    onTagsChange(tags.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (trimmed) addTag(trimmed) }
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="พิมพ์แท็ก แล้วกด Enter หรือเลือกจากรายการ"
          className="text-sm"
        />
        {showDropdown && (
          <div className="absolute z-50 top-full mt-1 w-full border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            {filtered.map(t => (
              <button
                key={t}
                type="button"
                onMouseDown={e => { e.preventDefault(); addTag(t) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {t}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); addTag(trimmed) }}
                className="w-full text-left px-3 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 border-t border-gray-100"
              >
                + สร้างแท็กใหม่ &ldquo;{trimmed}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
              {tag}
              <button type="button" onClick={() => removeTag(i)} className="hover:text-blue-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
