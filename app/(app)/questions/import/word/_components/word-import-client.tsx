'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileUp, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QuestionSetPicker, SubjectAutocomplete } from '@/components/questions/general-info-section'
import { ImportDuplicateDialog } from '@/components/questions/import-duplicate-dialog'
import type { RandomNumericForm } from '@/components/questions/random-numeric'
import { checkImportDuplicates, importQuestionsFromFile, type DuplicateHit } from '@/lib/actions/question-export'
import { buildExportFile, exportFileBatches, IMPORT_BATCH_SIZE, type QuestionExportFile } from '@/lib/question-portable'
import { parseDocx, isDisplayableImage, DocxImportError } from '@/lib/docx-import'
import {
  draftToEntry, entryToPortable, liveWarnings, validateForImport, type DraftEntry,
} from '@/lib/docx-import/to-question'
import { DraftQuestionCard } from './draft-question-card'

/** Loaded when a teacher actually picks a file: ~220 KB most visits never need. */
async function browserSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

type Stage = 'pick' | 'reading' | 'review' | 'importing'

interface Props {
  allTags: string[]
  presets: React.ComponentProps<typeof RandomNumericForm>['presets']
}

export function WordImportClient({ allTags, presets }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [, startTransition] = useTransition()

  const [stage, setStage] = useState<Stage>('pick')
  const [fileName, setFileName] = useState('')
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [preamble, setPreamble] = useState<string[]>([])
  const [floatingImages, setFloatingImages] = useState<Set<string>>(new Set())
  const [skippedImages, setSkippedImages] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [pendingFile, setPendingFile] = useState<QuestionExportFile | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([])

  // Asked once for the file: every โจทย์ in one worksheet is the same วิชา, and
  // the โจทย์ forms hide their own field in draft mode because of it.
  const [subject, setSubject] = useState('')
  const [existingSetIds, setExistingSetIds] = useState<string[]>([])
  const [setTitle, setSetTitle] = useState('')
  const [makeSet, setMakeSet] = useState(false)

  const warningsFor = useCallback(
    (entry: DraftEntry) => [...entry.warnings, ...liveWarnings(entry, floatingImages)],
    [floatingImages],
  )

  const errors = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of entries) {
      if (!entry.include) continue
      const problem = validateForImport(entry)
      if (problem) map.set(entry.id, problem)
    }
    return map
  }, [entries])

  const missingSubject = entries.some(entry => entry.include) && !subject.trim()
  const includedCount = entries.filter(entry => entry.include).length
  const warningCount = entries.filter(entry => entry.include && warningsFor(entry).length > 0).length

  const reset = useCallback(() => {
    setEntries([])
    setPreamble([])
    setFloatingImages(new Set())
    setSkippedImages(0)
    setEditingId(null)
    setFileName('')
    setProgress('')
    setSubject('')
    setExistingSetIds([])
    setMakeSet(false)
    setStage('pick')
  }, [])

  // A form left open while the โจทย์ under it is replaced would be editing a
  // draft that no longer exists.
  useEffect(() => {
    if (editingId && !entries.some(entry => entry.id === editingId)) setEditingId(null)
  }, [editingId, entries])

  /**
   * Uploads every picture in the file, once, before the teacher starts.
   *
   * Done here rather than at import time so that from this point on a picture
   * is an ordinary URL: the คลัง's own image widget inside the authoring form
   * can show, add and remove them without knowing a .docx was ever involved.
   * The cost is that backing out leaves the uploads behind — they are swept
   * from ตั้งค่า → พื้นที่จัดเก็บไฟล์, the same as any other abandoned upload.
   */
  async function uploadMedia(media: Map<string, { path: string; bytes: Uint8Array; contentType: string }>) {
    const usable = [...media.entries()].filter(([, item]) => isDisplayableImage(item.contentType))
    const urls = new Map<string, string>()
    if (usable.length === 0) return { urls, skipped: media.size }

    const supabase = await browserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('ไม่ได้เข้าสู่ระบบ'); return null }

    const { downscaleImage } = await import('@/lib/image-downscale')

    for (let index = 0; index < usable.length; index++) {
      const [relId, item] = usable[index]
      setProgress(`กำลังเตรียมรูป ${index + 1} / ${usable.length}`)

      const extension = item.path.split('.').pop() ?? 'png'
      const original = new File([item.bytes as BlobPart], `${relId}.${extension}`, { type: item.contentType })
      const shrunk = await downscaleImage(original)
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`

      const { error } = await supabase.storage.from('question-images').upload(path, shrunk, { upsert: false })
      if (error) { toast.error(`อัปโหลดรูปไม่สำเร็จ: ${error.message}`); return null }
      urls.set(relId, supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl)
    }

    return { urls, skipped: media.size - usable.length }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('รองรับเฉพาะไฟล์ .docx — ถ้าเป็น .doc รุ่นเก่าหรือ PDF ให้เปิดใน Word แล้ว Save As เป็น .docx ก่อน')
      return
    }

    setStage('reading')
    setFileName(file.name)
    setProgress('กำลังอ่านไฟล์')
    try {
      const parsed = await parseDocx(new Uint8Array(await file.arrayBuffer()))

      if (parsed.questions.length === 0) {
        toast.error('อ่านไฟล์ได้ แต่ไม่พบข้อไหนเลย — ไฟล์ควรใส่เลขข้อด้วยรายการลำดับเลขของ Word')
        setStage('pick')
        setProgress('')
        return
      }

      const uploaded = await uploadMedia(parsed.media)
      if (!uploaded) { setStage('pick'); setProgress(''); return }

      setEntries(parsed.questions.map(draft => draftToEntry(draft, uploaded.urls)))
      setPreamble(parsed.preamble)
      setSkippedImages(uploaded.skipped)
      setFloatingImages(new Set(
        parsed.floatingImageRelIds
          .map(relId => uploaded.urls.get(relId))
          .filter((url): url is string => !!url),
      ))
      setSetTitle(file.name.replace(/\.docx$/i, ''))
      setProgress('')
      setStage('review')
    } catch (error) {
      toast.error(error instanceof DocxImportError ? error.message : 'อ่านไฟล์นี้ไม่สำเร็จ')
      setStage('pick')
      setProgress('')
    }
  }

  function updateEntry(next: DraftEntry) {
    setEntries(previous => previous.map(entry => entry.id === next.id ? next : entry))
  }

  /** Moves a picture Word anchored to the wrong โจทย์ onto its neighbour. */
  function moveImage(entryId: string, url: string, direction: -1 | 1) {
    setEntries(previous => {
      const index = previous.findIndex(entry => entry.id === entryId)
      const target = index + direction
      if (index === -1 || target < 0 || target >= previous.length) return previous
      return previous.map((entry, at) => {
        if (at === index) {
          return { ...entry, question: { ...entry.question, image_urls: entry.question.image_urls.filter(u => u !== url) } }
        }
        if (at === target) {
          return { ...entry, question: { ...entry.question, image_urls: [...entry.question.image_urls, url] } }
        }
        return entry
      })
    })
  }

  async function sendBatches(file: QuestionExportFile, decision?: 'rename' | 'skip', duplicateIndexes: number[] = []) {
    const batches = exportFileBatches(file)
    const ids: string[] = []
    let imported = 0
    let setId: string | undefined
    let filingError: string | undefined

    for (let index = 0; index < batches.length; index++) {
      const start = index * IMPORT_BATCH_SIZE
      const localDuplicates = duplicateIndexes
        .filter(i => i >= start && i < start + IMPORT_BATCH_SIZE)
        .map(i => i - start)

      setProgress(`กำลังนำเข้า ${Math.min(start + IMPORT_BATCH_SIZE, file.questions.length)} / ${file.questions.length} ข้อ`)
      // แฟ้ม that already exist receive the whole import at once, so the ids
      // only go over on the final call.
      const isLast = index === batches.length - 1
      const result = await importQuestionsFromFile(
        batches[index], decision, localDuplicates, ids, isLast ? existingSetIds : [],
      )

      if ('error' in result && result.error) {
        // Earlier batches already landed; saying "failed" alone would send the
        // teacher back to import the same โจทย์ a second time.
        toast.error(imported > 0 ? `${result.error} (นำเข้าสำเร็จก่อนหน้า ${imported} ข้อ)` : result.error)
        setStage('review')
        setProgress('')
        if (imported > 0) router.refresh()
        return
      }

      imported += result.imported ?? 0
      ids.push(...(result.ids ?? []))
      if (result.setId) setId = result.setId
      if (result.filingError) filingError = result.filingError
    }

    setProgress('')
    if (imported === 0) {
      toast.error('ข้ามโจทย์ที่ซ้ำทั้งหมด ไม่มีโจทย์ใหม่ถูกนำเข้า')
      setStage('review')
      return
    }

    if (filingError) toast.error(filingError)
    toast.success(setId ? `นำเข้าแล้ว ${imported} ข้อ และสร้างแฟ้มโจทย์ให้แล้ว` : `นำเข้าแล้ว ${imported} ข้อ`)
    router.push(setId ? `/questions/sets/${setId}` : '/questions')
    router.refresh()
  }

  function startImport() {
    const included = entries.filter(entry => entry.include)
    if (included.length === 0) { toast.error('ยังไม่ได้เลือกข้อไหนเลย'); return }
    if (errors.size > 0) {
      toast.error(`มี ${errors.size} ข้อที่ยังนำเข้าไม่ได้ — แก้ตามที่แจ้งไว้บนการ์ดก่อน`)
      return
    }
    if (!subject.trim()) { toast.error('กรอกวิชาก่อน — ใช้กับทุกข้อในไฟล์นี้'); return }

    setEditingId(null)
    setStage('importing')
    startTransition(async () => {
      const file = buildExportFile(
        included.map(entry => entryToPortable(entry, subject)),
        makeSet && setTitle.trim() ? { title: setTitle.trim(), description: null, tags: [] } : undefined,
      )

      setProgress('กำลังตรวจโจทย์ซ้ำ')
      const found: DuplicateHit[] = []
      const batches = exportFileBatches(file)
      for (let index = 0; index < batches.length; index++) {
        const check = await checkImportDuplicates(batches[index])
        if ('error' in check) { toast.error(check.error); setStage('review'); setProgress(''); return }
        found.push(...check.duplicates.map(hit => ({ ...hit, index: hit.index + index * IMPORT_BATCH_SIZE })))
      }

      if (found.length === 0) { await sendBatches(file); return }
      setPendingFile(file)
      setDuplicates(found)
    })
  }

  function resolveDuplicates(decision: 'rename' | 'skip') {
    const file = pendingFile
    const indexes = duplicates.map(hit => hit.index)
    setPendingFile(null)
    setDuplicates([])
    if (file) startTransition(async () => { await sendBatches(file, decision, indexes) })
  }

  // ─── Picking a file ────────────────────────────────────────────────────────

  if (stage === 'pick' || stage === 'reading') {
    const busy = stage === 'reading'
    return (
      <Card padding="2xl" edge="dashed">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileUp className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">ลากไฟล์ Word มาวาง หรือเลือกไฟล์</p>
            <p className="mt-1 text-xs text-muted-foreground">
              รองรับ .docx เท่านั้น · ตัวไฟล์อ่านในเครื่องของคุณ มีเฉพาะรูปที่ถูกอัปโหลดขึ้นระบบ
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={event => {
              const picked = event.target.files?.[0]
              if (picked) void handleFile(picked)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy
              ? <><Loader2 className="animate-spin" aria-hidden /> {progress || `กำลังอ่าน ${fileName}`}</>
              : 'เลือกไฟล์ Word'}
          </Button>

          <div
            className="mt-2 w-full rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault()
              const dropped = event.dataTransfer.files?.[0]
              if (dropped) void handleFile(dropped)
            }}
          >
            <p className="font-medium text-foreground">จัดไฟล์แบบนี้แล้วระบบอ่านได้แม่นที่สุด</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>ใส่เลขข้อด้วยปุ่มรายการลำดับเลขของ Word ไม่ต้องพิมพ์เลขเอง</li>
              <li>ทำเครื่องหมายเฉลยปรนัยด้วย <span className="text-destructive">ตัวอักษรสีแดง</span> ปากกาเน้นข้อความ หรือตัวหนา</li>
              <li>ตัวเลือกขึ้นต้นด้วย 1) 2) 3) 4) จะอยู่ในตารางหรือคนละบรรทัดก็ได้</li>
              <li>เลขที่มีรากที่สองหรือเศษส่วน ระบบจะแปลงให้ แต่ควรตรวจอีกครั้ง</li>
            </ul>
          </div>
        </div>
      </Card>
    )
  }

  // ─── Reviewing ─────────────────────────────────────────────────────────────

  const busy = stage === 'importing'

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              อ่านได้ {entries.length} ข้อ จาก {fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {warningCount > 0
                ? `มี ${warningCount} ข้อที่ควรตรวจก่อน · กด "แก้ไข" เพื่อเปิดฟอร์มสร้างโจทย์แบบเต็ม`
                : 'กด "แก้ไข" เพื่อเปิดฟอร์มสร้างโจทย์แบบเต็ม พร้อมข้อมูลที่อ่านมาแล้ว'}
            </p>
            {preamble.length > 0 && (
              <p className="text-xs text-muted-foreground">ข้ามส่วนหัวเอกสาร: {preamble.join(' · ')}</p>
            )}
            {skippedImages > 0 && (
              <p className="text-xs text-warning">
                ข้ามรูป {skippedImages} รูปที่เป็นรูปแบบซึ่งเว็บแสดงไม่ได้ (EMF/WMF) ต้องแนบใหม่เอง
              </p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={busy}>
            <RotateCcw aria-hidden /> เลือกไฟล์ใหม่
          </Button>
        </div>

        <div className="mt-3 space-y-4 border-t border-border pt-3">
          {/* Asked once rather than on every โจทย์: one worksheet is one วิชา,
              and the โจทย์ forms hide their own field because of this one. */}
          <div className="space-y-1.5">
            <Label>วิชา *</Label>
            <p className="text-xs text-muted-foreground">ใช้กับทุกข้อในไฟล์นี้</p>
            <SubjectAutocomplete value={subject} onChange={setSubject} />
          </div>

          <div className="space-y-1.5">
            <Label>แฟ้มโจทย์</Label>
            <p className="text-xs text-muted-foreground">
              เลือกแฟ้มที่มีอยู่แล้ว เลือกได้หลายแฟ้ม · หรือสร้างแฟ้มใหม่จากไฟล์นี้ · ไม่เลือกก็ได้
            </p>
            <QuestionSetPicker selectedIds={existingSetIds} onChange={setExistingSetIds} />

            <div className="flex items-center gap-2 pt-2">
              <input
                id="import-make-set"
                type="checkbox"
                checked={makeSet}
                onChange={event => setMakeSet(event.target.checked)}
                className="size-4 accent-primary"
              />
              <Label htmlFor="import-make-set">สร้างแฟ้มใหม่จากไฟล์นี้ด้วย</Label>
            </div>
            {makeSet && (
              <Input
                value={setTitle}
                onChange={event => setSetTitle(event.target.value)}
                placeholder="ชื่อแฟ้มโจทย์ใหม่"
                aria-label="ชื่อแฟ้มโจทย์ใหม่"
              />
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {entries.map((entry, index) => (
          <DraftQuestionCard
            key={entry.id}
            entry={entry}
            warnings={warningsFor(entry)}
            error={errors.get(entry.id) ?? null}
            allTags={allTags}
            presets={presets}
            editing={editingId === entry.id}
            canMoveImageBack={index > 0}
            canMoveImageForward={index < entries.length - 1}
            onChange={updateEntry}
            onStartEdit={() => setEditingId(entry.id)}
            onCloseEdit={() => setEditingId(null)}
            onMoveImage={(url, direction) => moveImage(entry.id, url, direction)}
          />
        ))}
      </div>

      <Card padding="md" className="sticky bottom-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {busy
              ? progress || 'กำลังนำเข้า...'
              : errors.size > 0
                ? <span className="text-destructive">มี {errors.size} ข้อที่ยังนำเข้าไม่ได้</span>
                : missingSubject
                  ? <span className="text-destructive">กรอกวิชาก่อน</span>
                  : `จะนำเข้า ${includedCount} ข้อ`}
          </div>
          <Button type="button" onClick={startImport} disabled={busy || includedCount === 0 || missingSubject}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            นำเข้า {includedCount} ข้อเข้าคลัง
          </Button>
        </div>
      </Card>

      <ImportDuplicateDialog
        duplicates={duplicates}
        isPending={busy}
        onCancel={() => { setPendingFile(null); setDuplicates([]); setStage('review'); setProgress('') }}
        onSkip={() => resolveDuplicates('skip')}
        onRename={() => resolveDuplicates('rename')}
      />
    </div>
  )
}
