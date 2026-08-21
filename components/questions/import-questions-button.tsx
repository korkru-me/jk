'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkImportDuplicates, importQuestionsFromFile, type DuplicateHit } from '@/lib/actions/question-export'
import { EXPORT_FORMAT, EXPORT_VERSION, parseExportFile, type QuestionExportFile } from '@/lib/question-portable'
import { ImportDuplicateDialog } from './import-duplicate-dialog'

interface Props {
  label?: string
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  onImported: (result: { imported: number; setId?: string }) => void
}

// A whole question bank is a couple of megabytes, and a Server Action body is
// capped at 1 MB — so the file goes over in batches rather than in one piece.
// Batches also keep each request short: the server inserts one batch per round
// trip, so the work is visible as it goes instead of hanging on one long call.
const BATCH_SIZE = 50

/** One batch as a self-contained export file the server can parse and validate. */
function batchFile(
  file: QuestionExportFile,
  start: number,
  isLast: boolean,
): string {
  const questions = file.questions.slice(start, start + BATCH_SIZE)
  // The set descriptor rides on the final batch only, so the set is created
  // once, after every question it lists exists.
  const carriesSet = isLast && file.kind === 'question_set' && !!file.set
  return JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: file.exported_at,
    kind: carriesSet ? 'question_set' : 'questions',
    ...(carriesSet ? { set: file.set } : {}),
    questions,
  })
}

export function ImportQuestionsButton({ label = 'นำเข้าไฟล์', className, variant = 'outline', size, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingFile, setPendingFile] = useState<QuestionExportFile | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([])

  function runImport(file: QuestionExportFile, decision?: 'rename' | 'skip', duplicateIndexes: number[] = []) {
    startTransition(async () => {
      const total = file.questions.length
      const dupSet = new Set(duplicateIndexes)
      const toastId = 'import-questions'
      let imported = 0
      let setId: string | undefined
      const ids: string[] = []

      for (let start = 0; start < total; start += BATCH_SIZE) {
        const isLast = start + BATCH_SIZE >= total
        // Duplicate indexes are file-wide; the server sees one batch, so they
        // are rebased onto it.
        const localDuplicates = duplicateIndexes
          .filter(i => i >= start && i < start + BATCH_SIZE)
          .map(i => i - start)

        if (total > BATCH_SIZE) {
          toast.loading(`กำลังนำเข้า ${Math.min(start + BATCH_SIZE, total)} / ${total} ข้อ...`, { id: toastId })
        }

        const result = await importQuestionsFromFile(batchFile(file, start, isLast), decision, localDuplicates, ids)

        if ('error' in result && result.error) {
          toast.dismiss(toastId)
          // Earlier batches already landed, so say so rather than implying
          // nothing was imported.
          toast.error(imported > 0
            ? `${result.error} (นำเข้าสำเร็จก่อนหน้า ${imported} ข้อ)`
            : result.error)
          if (imported > 0) onImported({ imported, setId })
          return
        }

        imported += result.imported ?? 0
        ids.push(...(result.ids ?? []))
        if (result.setId) setId = result.setId
      }

      toast.dismiss(toastId)
      if (imported === 0) {
        toast.error('ข้ามโจทย์ที่ซ้ำทั้งหมด ไม่มีโจทย์ใหม่ถูกนำเข้า')
        return
      }
      const skipped = decision === 'skip' ? dupSet.size : 0
      toast.success(
        (setId ? `นำเข้าชุดโจทย์แล้ว (${imported} ข้อ)` : `นำเข้าโจทย์แล้ว ${imported} ข้อ`)
        + (skipped > 0 ? ` · ข้ามที่ซ้ำ ${skipped} ข้อ` : '')
      )
      onImported({ imported, setId })
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return

    picked.text().then(text => {
      // Parsed here rather than server-side so the file crosses the wire in
      // batches from the very first request — the duplicate check used to send
      // the whole thing too.
      const parsed = parseExportFile(text)
      if ('error' in parsed) { toast.error(parsed.error); return }
      const file = parsed.data

      startTransition(async () => {
        const found: DuplicateHit[] = []
        for (let start = 0; start < file.questions.length; start += BATCH_SIZE) {
          const check = await checkImportDuplicates(batchFile(file, start, false))
          if ('error' in check) { toast.error(check.error); return }
          found.push(...check.duplicates.map(d => ({ ...d, index: d.index + start })))
        }

        if (found.length === 0) runImport(file)
        else { setPendingFile(file); setDuplicates(found) }
      })
    })

    if (inputRef.current) inputRef.current.value = ''
  }

  function resolveDuplicates(decision: 'rename' | 'skip') {
    const file = pendingFile
    const indexes = duplicates.map(d => d.index)
    setPendingFile(null)
    setDuplicates([])
    if (file) runImport(file, decision, indexes)
  }

  function cancelDuplicates() {
    setPendingFile(null)
    setDuplicates([])
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFileChange} />
      <Button variant={variant} size={size} disabled={isPending} onClick={() => inputRef.current?.click()} className={className}>
        <Upload className="w-3.5 h-3.5" /> {label}
      </Button>
      <ImportDuplicateDialog
        duplicates={duplicates}
        isPending={isPending}
        onCancel={cancelDuplicates}
        onSkip={() => resolveDuplicates('skip')}
        onRename={() => resolveDuplicates('rename')}
      />
    </>
  )
}
