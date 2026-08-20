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
            ? 'bg-warning/10 border-warning/20'
            : 'bg-card border-border hover:border-warning/20 hover:bg-warning/10',
        )}
      >
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          open ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground group-hover:bg-warning/10 group-hover:text-warning/80',
        )}>
          <Lightbulb className="w-4 h-4" />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">{label}</span>
          {!open && (
            <span className="block text-xs text-muted-foreground truncate">
              {hasContent ? 'มีเนื้อหาแล้ว — กดเพื่อดู/แก้ไข' : 'กดเพื่อเพิ่มเฉลยหรือรูปประกอบ'}
            </span>
          )}
        </span>

        <ChevronDown className={cn(
          'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
          open && 'rotate-180 text-warning',
        )} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-1">
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          <RichTextEditor value={text} onChange={onTextChange} placeholder={placeholder} rows={rows} />
          <QuestionImageUpload value={imageUrls} onChange={onImageUrlsChange} />
        </div>
      )}
    </section>
  )
}
