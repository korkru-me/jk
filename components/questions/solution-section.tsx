'use client'

import { useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { QuestionImageUpload } from './question-image-upload'

interface SolutionSectionProps {
  text: string
  onTextChange: (v: string) => void
  imageUrls: string[]
  onImageUrlsChange: (urls: string[]) => void
  label?: string
  description?: string
  placeholder?: string
  rows?: number
}

// Collapsed by default — most questions don't need a written solution, so it
// stays out of the way until the teacher explicitly opens it.
export function SolutionSection({
  text, onTextChange, imageUrls, onImageUrlsChange,
  label = 'เฉลยวิธีทำ (ไม่บังคับ)',
  description,
  placeholder = 'อธิบายวิธีทำ...',
  rows = 4,
}: SolutionSectionProps) {
  const hasContent = text.replace(/<[^>]*>/g, '').trim().length > 0 || imageUrls.length > 0
  const [open, setOpen] = useState(hasContent)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
          open
            ? 'bg-amber-50/60 border-amber-200'
            : 'bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50/40',
        )}
      >
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          open ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400 group-hover:bg-amber-100 group-hover:text-amber-500',
        )}>
          <Lightbulb className="w-4 h-4" />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          {!open && (
            <span className="block text-xs text-gray-400 truncate">
              {hasContent ? 'มีเนื้อหาแล้ว — กดเพื่อดู/แก้ไข' : 'กดเพื่อเพิ่มเฉลยหรือรูปประกอบ'}
            </span>
          )}
        </span>

        <ChevronDown className={cn(
          'w-4 h-4 shrink-0 text-gray-400 transition-transform duration-200',
          open && 'rotate-180 text-amber-500',
        )} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-1">
          {description && <p className="text-xs text-gray-500">{description}</p>}
          <RichTextEditor value={text} onChange={onTextChange} placeholder={placeholder} rows={rows} />
          <QuestionImageUpload value={imageUrls} onChange={onImageUrlsChange} />
        </div>
      )}
    </section>
  )
}
