'use client'

import { useState } from 'react'
import { ChevronDown, Lightbulb, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { isSolutionTextImageSrc } from '@/lib/solution-attachments'
import { hasSolutionText } from '@/lib/question-solution'
import {
  SolutionAttachmentsField,
  storageSolutionFiles,
  uploadSolutionTextImage,
  type SolutionFileStore,
} from './solution-attachments-field'

interface SolutionSectionProps {
  text: string
  onTextChange: (v: string) => void
  imageUrls: string[]
  onImageUrlsChange: (urls: string[]) => void
  label?: string
  description?: string
  placeholder?: string
  rows?: number
  /** Where the files go — Storage unless a QA lab swaps it for memory. */
  fileStore?: SolutionFileStore
}

// Collapsed by default — most questions don't need a written solution, so it
// stays out of the way until the teacher explicitly opens it. Every question
// type renders this one section, so a เฉลย can be typed, attached as pictures
// or PDFs, or written on the board, whatever the type. Each of the three sits
// behind its own button; typing opens the text box in place.
export function SolutionSection({
  text, onTextChange, imageUrls, onImageUrlsChange,
  label = 'เฉลยวิธีทำ (ไม่บังคับ)',
  description,
  placeholder = 'อธิบายวิธีทำ...',
  rows = 4,
  fileStore,
}: SolutionSectionProps) {
  // The same test the คลัง's ดูเฉลย button uses, so "มีเนื้อหาแล้ว" here and
  // a greyed-out button there never disagree about one โจทย์.
  const hasText = hasSolutionText(text)
  const hasContent = hasText || imageUrls.length > 0
  const [open, setOpen] = useState(hasContent)
  // A เฉลย that already has text opens with it showing; otherwise the box
  // waits for พิมพ์ข้อความ and takes the cursor when it appears.
  const [typing, setTyping] = useState(hasText)
  const [typingFromButton, setTypingFromButton] = useState(false)
  const store = fileStore ?? storageSolutionFiles

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
              {hasContent ? 'มีเนื้อหาแล้ว — กดเพื่อดู/แก้ไข' : 'กดเพื่อพิมพ์ข้อความ แนบรูปหรือ PDF หรือเขียนบนกระดาน'}
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
          <SolutionAttachmentsField
            value={imageUrls}
            onChange={onImageUrlsChange}
            store={fileStore}
            leadingActions={
              <Button
                type="button"
                variant={typing ? 'secondary' : 'outline'}
                size="sm"
                aria-expanded={typing}
                onClick={() => {
                  setTyping(value => !value)
                  setTypingFromButton(true)
                }}
              >
                <Type /> พิมพ์ข้อความ
              </Button>
            }
          >
            {typing ? (
              // Pictures placed here belong to the text and are saved inside
              // it; they never join the เฉลย's files below.
              <RichTextEditor
                value={text}
                onChange={onTextChange}
                placeholder={placeholder}
                rows={rows}
                autoFocus={typingFromButton}
                images={{ upload: file => uploadSolutionTextImage(store, file), accepts: isSolutionTextImageSrc }}
              />
            ) : hasText ? (
              <p className="text-xs text-muted-foreground">มีข้อความเฉลยแล้ว — กด “พิมพ์ข้อความ” เพื่อดูหรือแก้</p>
            ) : null}
          </SolutionAttachmentsField>
        </div>
      )}
    </section>
  )
}
