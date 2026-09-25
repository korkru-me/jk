'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FileText, Loader2, Paperclip, PenLine, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { downscaleImage } from '@/lib/image-downscale'
import { uploadErrorMessage } from '@/lib/upload-error'
import {
  MAX_DRAWING_SESSION_LIBRARY_ITEMS,
  type DrawingBoardSessionLibraryItem,
} from '@/lib/drawing-board-session-library'
import type { ScratchpadScene } from '@/lib/scratchpad'
import {
  checkSolutionFile,
  SOLUTION_FILE_TYPES,
  SOLUTION_IMAGE_MAX_BYTES,
  SOLUTION_PDF_MAX_BYTES,
  solutionAttachmentKind,
  solutionUploadPath,
  type SolutionUploadKind,
} from '@/lib/solution-attachments'

// Excalidraw is large and most เฉลย are typed. The board loads only when a
// teacher asks for it.
const SolutionBoardEditor = dynamic(() => import('./solution-board-editor'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/20 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm shadow-md">
        <Loader2 className="size-4 animate-spin" /> กำลังเตรียมกระดาน...
      </div>
    </div>
  ),
})

/** Where a เฉลย's files go. The page supplies Storage; the QA lab supplies memory. */
export interface SolutionFileStore {
  upload: (file: Blob, kind: SolutionUploadKind, extension: string) => Promise<{ url: string } | { error: string }>
  /** Deletes a file taken out of the เฉลย, unless a saved โจทย์ still points at it. */
  release: (url: string) => Promise<void>
  read: (url: string) => Promise<Uint8Array>
}

const BUCKET = 'question-images'
/** The bucket's own ceiling, named when Storage refuses a file. */
const BUCKET_MAX_MB = 10

async function browserSupabase() {
  // On demand, as in every question upload widget: supabase-js is ~220 KB.
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

export const storageSolutionFiles: SolutionFileStore = {
  async upload(file, kind, extension) {
    const supabase = await browserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    const path = solutionUploadPath(user.id, kind, extension)
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type })
    if (error) return { error: error.message }
    return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
  },
  async release(url) {
    const match = url.match(/\/object\/public\/question-images\/([^?#]+)/)
    if (!match?.[1]) return
    const path = decodeURIComponent(match[1])
    const supabase = await browserSupabase()
    // Until the teacher saves again, the saved โจทย์ — or a copy of it — may
    // still point here. Only a file nothing points at is removed; the rest is
    // left for the sweep in ตั้งค่า.
    const { data, error } = await supabase.rpc('storage_paths_still_referenced', { paths: [path] })
    if (error || ((data ?? []) as string[]).includes(path)) return
    await supabase.storage.from(BUCKET).remove([path])
  },
  async read(url) {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('เปิดภาพจากกระดานไม่สำเร็จ กรุณาลองใหม่')
    return new Uint8Array(await response.arrayBuffer())
  },
}

function megabytes(bytes: number) {
  return `${bytes / (1024 * 1024)} MB`
}

/**
 * Puts one picture up for the เฉลย's typed text: shrunk and checked exactly
 * like a picture attached to the เฉลย, but stored as the text's own and
 * handed back only as a URL for the text box to show.
 */
export async function uploadSolutionTextImage(store: SolutionFileStore, original: File): Promise<string | null> {
  const file = await downscaleImage(original)
  const check = checkSolutionFile({ name: original.name, type: file.type, size: file.size })
  if (!check.ok) {
    toast.error(check.message)
    return null
  }
  if (check.kind !== 'image') {
    toast.error(`“${original.name}” วางในช่องพิมพ์ไม่ได้ — ช่องพิมพ์รับเฉพาะรูป ส่วน PDF ให้ใช้ปุ่มแนบรูปหรือ PDF`)
    return null
  }
  const result = await store.upload(file, 'inline', check.extension)
  if ('error' in result) {
    toast.error(uploadErrorMessage(result.error, original.name, BUCKET_MAX_MB))
    return null
  }
  return result.url
}

/**
 * The files of a เฉลย: pictures, PDFs and board pictures, all kept in the
 * one list the question saves as `solution_image_urls`.
 */
export function SolutionAttachmentsField({ value, onChange, store = storageSolutionFiles, leadingActions, children }: {
  value: string[]
  onChange: (urls: string[]) => void
  store?: SolutionFileStore
  /** Buttons that sit first in the row — the section's พิมพ์ข้อความ. */
  leadingActions?: ReactNode
  /** Shown between the buttons and the files — the typed text, when open. */
  children?: ReactNode
}) {
  const [uploading, setUploading] = useState(false)
  const [openingUrl, setOpeningUrl] = useState<string | null>(null)
  // undefined: no board open · null: a new board · otherwise the board being edited
  const [board, setBoard] = useState<{ url: string; scene: ScratchpadScene } | null | undefined>(undefined)
  const [libraryItems, setLibraryItems] = useState<DrawingBoardSessionLibraryItem[]>([])
  const [confirm, confirmDialog] = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const boardButtonRef = useRef<HTMLButtonElement>(null)
  // Uploads finish after other edits; each one adds to the list as it is
  // then, not as it was when the upload started.
  const listRef = useRef(value)
  listRef.current = value

  const commit = (next: string[]) => {
    listRef.current = next
    onChange(next)
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    const added: string[] = []
    for (const original of files) {
      // Pictures are shrunk before anything is checked or sent; PDFs pass
      // through untouched.
      const file = await downscaleImage(original)
      const check = checkSolutionFile({ name: original.name, type: file.type, size: file.size })
      if (!check.ok) {
        toast.error(check.message)
        continue
      }
      const result = await store.upload(file, 'file', check.extension)
      if ('error' in result) {
        toast.error(uploadErrorMessage(result.error, original.name, BUCKET_MAX_MB))
        continue
      }
      added.push(result.url)
    }
    if (added.length > 0) commit([...listRef.current, ...added])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function remove(url: string) {
    if (solutionAttachmentKind(url) === 'board') {
      const ok = await confirm({
        title: 'นำภาพจากกระดานออกจากเฉลย?',
        description: 'ภาพและงานเขียนบนกระดานนี้จะถูกนำออก ถ้ายังไม่เคยบันทึกโจทย์พร้อมภาพนี้ จะเปิดกลับมาแก้ไม่ได้อีก',
        confirmLabel: 'นำออก',
        variant: 'destructive',
      })
      if (!ok) return
    }
    commit(listRef.current.filter(item => item !== url))
    void store.release(url).catch(() => undefined)
  }

  async function openBoard(url: string | null) {
    if (url === null) {
      setBoard(null)
      return
    }
    setOpeningUrl(url)
    try {
      const bytes = await store.read(url)
      const { extractSolutionBoardScene, validateSolutionBoardScene } = await import('@/lib/solution-board-png')
      const validated = validateSolutionBoardScene(await extractSolutionBoardScene(bytes))
      if (!validated.ok) throw new Error('ภาพนี้ไม่มีงานเขียนบนกระดานที่เปิดแก้ได้')
      setBoard({ url, scene: validated.scene })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เปิดภาพจากกระดานไม่สำเร็จ')
    } finally {
      setOpeningUrl(null)
    }
  }

  async function saveBoard(png: Blob, replacing: string | null): Promise<string> {
    const result = await store.upload(png, 'board', 'png')
    if ('error' in result) throw new Error(uploadErrorMessage(result.error, 'ภาพจากกระดาน', BUCKET_MAX_MB))
    const current = listRef.current
    const index = replacing ? current.indexOf(replacing) : -1
    commit(index >= 0 ? current.map((item, position) => position === index ? result.url : item) : [...current, result.url])
    if (replacing && index >= 0) void store.release(replacing).catch(() => undefined)
    toast.success(index >= 0 ? 'อัปเดตภาพเฉลยจากกระดานแล้ว' : 'เพิ่มภาพเฉลยจากกระดานแล้ว', {
      description: 'กดบันทึกโจทย์เพื่อเก็บเฉลยนี้ไว้กับโจทย์',
    })
    return result.url
  }

  let pdfNumber = 0
  const items = value.map(url => {
    const kind = solutionAttachmentKind(url)
    const label = kind === 'pdf' ? `ไฟล์ PDF ${++pdfNumber}` : kind === 'board' ? 'ภาพจากกระดาน' : 'รูป'
    return { url, kind, label }
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {leadingActions}
        <input
          ref={inputRef}
          type="file"
          accept={SOLUTION_FILE_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={event => void addFiles(Array.from(event.target.files ?? []))}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบรูปหรือ PDF'}
        </Button>
        <Button
          ref={boardButtonRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void openBoard(null)}
          disabled={openingUrl !== null || board !== undefined}
        >
          <PenLine /> เขียนบนกระดาน
        </Button>
        <span className="text-xs text-muted-foreground">
          รูปย่อให้อัตโนมัติ (ไม่เกิน {megabytes(SOLUTION_IMAGE_MAX_BYTES)}) · PDF ไม่เกิน {megabytes(SOLUTION_PDF_MAX_BYTES)}
        </span>
      </div>

      {children}

      {items.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {items.map(({ url, kind, label }) => (
            <li key={url} className="relative w-28">
              {kind === 'pdf' ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-28 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted px-2 text-center transition-colors hover:bg-accent"
                >
                  <FileText className="size-7 text-muted-foreground" aria-hidden="true" />
                  <span className="text-[11px] font-medium">{label}</span>
                  <span className="text-[10px] text-muted-foreground">กดเพื่อเปิดดู</span>
                </a>
              ) : (
                <div className="size-28 overflow-hidden rounded-lg border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={label === 'รูป' ? 'รูปเฉลย' : label} className="size-full object-cover" />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="absolute -right-2 -top-2 rounded-full bg-card shadow-sm"
                aria-label={`นำออกจากเฉลย: ${label}`}
                onClick={() => void remove(url)}
              >
                <X />
              </Button>
              {kind === 'board' && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="mt-1.5 w-full"
                  disabled={openingUrl !== null || board !== undefined}
                  onClick={() => void openBoard(url)}
                >
                  {openingUrl === url ? <Loader2 className="animate-spin" /> : <Pencil />} แก้บนกระดาน
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {board !== undefined && (
        <SolutionBoardEditor
          initial={board}
          onSave={saveBoard}
          onClose={() => {
            setBoard(undefined)
            // The button is disabled while a board is open, so focus has to
            // wait for the render that closes it.
            requestAnimationFrame(() => boardButtonRef.current?.focus())
          }}
          sessionLibraryItems={libraryItems}
          onSessionLibraryItemAdd={item => setLibraryItems(current => [
            ...current.slice(-(MAX_DRAWING_SESSION_LIBRARY_ITEMS - 1)),
            item,
          ])}
          onSessionLibraryItemRemove={itemId => setLibraryItems(current => current.filter(item => item.id !== itemId))}
        />
      )}
      {confirmDialog}
    </div>
  )
}
