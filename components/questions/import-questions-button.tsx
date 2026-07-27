'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkImportDuplicates, importQuestionsFromFile, type DuplicateHit } from '@/lib/actions/question-export'
import { ImportDuplicateDialog } from './import-duplicate-dialog'

interface Props {
  label?: string
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  onImported: (result: { imported: number; setId?: string }) => void
}

export function ImportQuestionsButton({ label = 'นำเข้าไฟล์', className, variant = 'outline', size, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([])

  function runImport(text: string, decision?: 'rename' | 'skip', duplicateIndexes?: number[]) {
    startTransition(async () => {
      const result = await importQuestionsFromFile(text, decision, duplicateIndexes)
      if ('error' in result) { toast.error(result.error); return }
      toast.success(result.setId ? `นำเข้าชุดโจทย์แล้ว (${result.imported} ข้อ)` : `นำเข้าโจทย์แล้ว ${result.imported} ข้อ`)
      onImported(result)
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    file.text().then(text => {
      startTransition(async () => {
        const check = await checkImportDuplicates(text)
        if ('error' in check) { toast.error(check.error); return }
        if (check.duplicates.length === 0) {
          runImport(text)
        } else {
          setPendingText(text)
          setDuplicates(check.duplicates)
        }
      })
    })

    if (inputRef.current) inputRef.current.value = ''
  }

  function resolveDuplicates(decision: 'rename' | 'skip') {
    const text = pendingText
    const indexes = duplicates.map(d => d.index)
    setPendingText(null)
    setDuplicates([])
    if (text) runImport(text, decision, indexes)
  }

  function cancelDuplicates() {
    setPendingText(null)
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
