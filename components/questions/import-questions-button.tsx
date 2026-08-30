'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkImportDuplicates, importQuestionsFromFile, type DuplicateHit } from '@/lib/actions/question-export'
import { exportFileBatches, IMPORT_BATCH_SIZE, parseExportFile, type QuestionExportFile } from '@/lib/question-portable'
import { ImportDuplicateDialog } from './import-duplicate-dialog'

interface Props {
  label?: string
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  onImported: (result: { imported: number; setId?: string }) => void
  /** Draws the control instead of the default button — for the import chooser,
   *  where this sits as a card beside the Word one. The file input, the
   *  duplicate dialog and the batching are the same either way, so the two
   *  entry points cannot drift apart. */
  children?: (control: { open: () => void; isPending: boolean }) => React.ReactNode
}

export function ImportQuestionsButton({ label = 'นำเข้าไฟล์', className, variant = 'outline', size, onImported, children }: Props) {
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

      const batches = exportFileBatches(file)
      for (let index = 0; index < batches.length; index++) {
        const start = index * IMPORT_BATCH_SIZE
        // Duplicate indexes are file-wide; the server sees one batch, so they
        // are rebased onto it.
        const localDuplicates = duplicateIndexes
          .filter(i => i >= start && i < start + IMPORT_BATCH_SIZE)
          .map(i => i - start)

        if (total > IMPORT_BATCH_SIZE) {
          toast.loading(`กำลังนำเข้า ${Math.min(start + IMPORT_BATCH_SIZE, total)} / ${total} ข้อ...`, { id: toastId })
        }

        const result = await importQuestionsFromFile(batches[index], decision, localDuplicates, ids)

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
        (setId ? `นำเข้าแฟ้มโจทย์แล้ว (${imported} ข้อ)` : `นำเข้าโจทย์แล้ว ${imported} ข้อ`)
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
        const batches = exportFileBatches(file)
        for (let index = 0; index < batches.length; index++) {
          const check = await checkImportDuplicates(batches[index])
          if ('error' in check) { toast.error(check.error); return }
          const start = index * IMPORT_BATCH_SIZE
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
      {children
        ? children({ open: () => inputRef.current?.click(), isPending })
        : (
          <Button variant={variant} size={size} disabled={isPending} onClick={() => inputRef.current?.click()} className={className}>
            <Upload className="w-3.5 h-3.5" /> {label}
          </Button>
        )}
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
