'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, Trash2, X, Check } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { classifyCellCount } from '@/lib/classify'
import { Card } from '@/components/ui/card'
import type { Difficulty, Visibility, Question, ClassifyConfig, ClassifyColumn, ClassifyRow } from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'

interface ClassifyFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

function newId(): string {
  return Math.random().toString(36).slice(2)
}

interface ColumnDraft {
  id: string
  title: string
  options: string[]
}

interface RowDraft {
  id: string
  text: string
  imageUrls: string[]
  /** column id -> chosen option position. A cell the teacher has not picked has no entry. */
  answers: Record<string, number>
}

function newColumn(): ColumnDraft {
  return { id: newId(), title: '', options: ['', ''] }
}

function newRow(): RowDraft {
  return { id: newId(), text: '', imageUrls: [], answers: {} }
}

// ─── Columns ────────────────────────────────────────────────────────────────
// The teacher writes a dimension's options once here, and every row reuses
// them. That is the whole reason this question type exists rather than being a
// โจทย์ผสม of one ปรนัย per cell, so the options editor is deliberately the
// first thing on the page: the grid below has nothing to offer until a column
// has something to choose between.

function ColumnCard({ column, index, onUpdate, onRemove, canRemove }: {
  column: ColumnDraft
  index: number
  onUpdate: (patch: Partial<ColumnDraft>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  function updateOption(oi: number, value: string) {
    onUpdate({ options: column.options.map((option, i) => (i === oi ? value : option)) })
  }

  return (
    <Card radius="md" padding="sm" className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {index + 1}
        </span>
        <Input
          value={column.title}
          onChange={e => onUpdate({ title: e.target.value })}
          placeholder="เช่น จำแนกตามแหล่งกำเนิด"
          className="h-9 flex-1 text-sm"
        />
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`ลบมิติที่ ${index + 1}`}
            className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5 pl-8">
        <Label className="text-xs text-muted-foreground">ตัวเลือกของมิตินี้ (ใช้ร่วมกันทุกแถว)</Label>
        {column.options.map((option, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <Input
              value={option}
              onChange={e => updateOption(oi, e.target.value)}
              placeholder={`ตัวเลือกที่ ${oi + 1}`}
              className="h-9 flex-1 text-sm"
            />
            {column.options.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onUpdate({ options: column.options.filter((_, i) => i !== oi) })}
                aria-label={`ลบตัวเลือกที่ ${oi + 1}`}
                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {column.options.length < 6 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate({ options: [...column.options, ''] })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่มตัวเลือก
          </Button>
        )}
      </div>
    </Card>
  )
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function RowCard({ row, index, columns, onUpdate, onRemove, canRemove }: {
  row: RowDraft
  index: number
  columns: ColumnDraft[]
  onUpdate: (patch: Partial<RowDraft>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <Card radius="md" padding="sm" className="space-y-3">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <RichTextEditor
            value={row.text}
            onChange={value => onUpdate({ text: value })}
            placeholder="สิ่งที่ให้นักเรียนจำแนก เช่น เนื้อหมู"
            rows={1}
          />
          <QuestionImageUpload value={row.imageUrls} onChange={value => onUpdate({ imageUrls: value })} />
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`ลบแถวที่ ${index + 1}`}
            className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* The key, one dimension at a time. A cell left unanswered is allowed to
          reach save — it simply is not worth a point and is not graded (see
          classifyCellCount) — but the summary below the grid says how many are
          still blank, because a teacher almost never means to leave one. */}
      <div className="grid gap-2 pl-8 sm:grid-cols-2">
        {columns.map(column => (
          <fieldset key={column.id} className="space-y-1.5">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">
              {column.title.trim() || 'มิติที่ยังไม่ได้ตั้งชื่อ'}
            </legend>
            {column.options.map((option, oi) => (
              <label
                key={oi}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  row.answers[column.id] === oi ? 'border-success bg-success/10' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  className="shrink-0"
                  name={`row-${row.id}-col-${column.id}`}
                  checked={row.answers[column.id] === oi}
                  onChange={() => onUpdate({ answers: { ...row.answers, [column.id]: oi } })}
                />
                <span className="min-w-0">{option.trim() || <span className="text-muted-foreground">(ตัวเลือกที่ {oi + 1} ยังว่าง)</span>}</span>
                {row.answers[column.id] === oi && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-success" />}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Card>
  )
}

// ─── Main form ──────────────────────────────────────────────────────────────

export function ClassifyForm({ allTags, mode = 'create', question, isOwner = true }: ClassifyFormProps) {
  const router = useRouter()
  const returnTo = questionsReturnTo(useSearchParams())
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const existingConfig = question?.extra_data as ClassifyConfig | undefined

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(question?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(question?.shared_org_ids ?? [])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(question?.team_edit_allowed ?? true)
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])
  const [setIds, setSetIds] = useState<string[]>([])
  const setPicker = mode === 'create' ? { setIds, onSetIdsChange: setSetIds } : {}

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])
  const [columns, setColumns] = useState<ColumnDraft[]>(
    existingConfig?.columns?.length
      ? existingConfig.columns.map(column => ({ id: column.id, title: column.title, options: column.options?.length ? column.options : ['', ''] }))
      : [newColumn()],
  )
  const [rows, setRows] = useState<RowDraft[]>(
    existingConfig?.rows?.length
      ? existingConfig.rows.map(row => ({ id: row.id, text: row.text, imageUrls: row.image_urls ?? [], answers: { ...row.answers } }))
      : [newRow(), newRow()],
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('classify')
    if (!seed) return
    setTitle(seed.title)
    setSubject(seed.subject ?? '')
    setDifficulty(seed.difficulty)
    setVisibility(seed.visibility)
    setTags(seed.tags ?? [])
    setQuestionText(seed.question_text)
    setImageUrls(seed.image_urls ?? [])
    setSolutionText(seed.solution_text ?? '')
    setSolutionImageUrls(seed.solution_image_urls ?? [])

    const config = (seed.extra_data ?? {}) as ClassifyConfig
    if (config.columns?.length) {
      setColumns(config.columns.map(column => ({ id: column.id, title: column.title, options: column.options?.length ? column.options : ['', ''] })))
    }
    if (config.rows?.length) {
      setRows(config.rows.map(row => ({ id: row.id, text: row.text, imageUrls: row.image_urls ?? [], answers: { ...row.answers } })))
    }
  })

  function removeColumn(index: number) {
    if (columns.length <= 1) return
    const removed = columns[index]
    setColumns(prev => prev.filter((_, i) => i !== index))
    // Drop that dimension's key from every row too. Leaving it behind would
    // keep a stale answer alive that nothing renders and nothing grades, and it
    // would come back if a later column happened to reuse the id.
    setRows(prev => prev.map(row => {
      const { [removed.id]: _dropped, ...rest } = row.answers
      return { ...row, answers: rest }
    }))
  }

  function updateColumn(index: number, patch: Partial<ColumnDraft>) {
    const before = columns[index]
    setColumns(prev => prev.map((column, i) => (i === index ? { ...column, ...patch } : column)))
    // Shortening the option list can strand a key past the end of it. Clear
    // those now rather than letting them reach the database, where
    // classifyCorrectGrid would treat them as unkeyed and quietly shrink the
    // question's point value.
    if (patch.options && patch.options.length < before.options.length) {
      setRows(prev => prev.map(row => {
        const picked = row.answers[before.id]
        if (picked === undefined || picked < patch.options!.length) return row
        const { [before.id]: _stale, ...rest } = row.answers
        return { ...row, answers: rest }
      }))
    }
  }

  const config: ClassifyConfig = {
    columns: columns.map((column): ClassifyColumn => ({
      id: column.id,
      title: column.title.trim(),
      options: column.options.map(option => option.trim()),
    })),
    rows: rows.map((row): ClassifyRow => ({
      id: row.id,
      text: row.text,
      ...(row.imageUrls.length ? { image_urls: row.imageUrls } : {}),
      answers: row.answers,
    })),
  }

  const cellCount = columns.length * rows.length
  const keyedCount = classifyCellCount(config)

  function plain(html: string) {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!plain(questionText)) { toast.error('กรอกคำสั่งของโจทย์ด้วย'); return }

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i]
      if (!column.title.trim()) { toast.error(`มิติที่ ${i + 1}: ตั้งชื่อหัวคอลัมน์ด้วย`); return }
      const emptyOption = column.options.findIndex(option => !option.trim())
      if (emptyOption !== -1) { toast.error(`มิติที่ ${i + 1}: กรอกตัวเลือกที่ ${emptyOption + 1} ด้วย`); return }
      const trimmed = column.options.map(option => option.trim())
      if (new Set(trimmed).size !== trimmed.length) { toast.error(`มิติที่ ${i + 1}: มีตัวเลือกซ้ำกัน`); return }
    }

    for (let i = 0; i < rows.length; i++) {
      if (!plain(rows[i].text)) { toast.error(`แถวที่ ${i + 1}: กรอกสิ่งที่ให้จำแนกด้วย`); return }
    }

    // Every cell must carry a key, even though the grading rules tolerate a
    // missing one. A blank cell silently costs the question a point, and a
    // teacher who meant to leave one blank has no way to say so — so the form
    // refuses rather than letting the point quietly disappear.
    if (keyedCount < cellCount) {
      toast.error(`ยังไม่ได้เลือกเฉลย ${cellCount - keyedCount} ช่อง — ทุกช่องต้องมีเฉลย`)
      return
    }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'classify' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed,
      category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: config,
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, set_ids: setIds, image_urls: imageUrls,
      redirect_to: returnTo,
    }
    const result = mode === 'edit' && question
      ? await updateQuestion(question.id, payload)
      : await createQuestion(payload)

    if (result?.error) {
      toast.error(result.error)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      <GeneralInfoSection
        allTags={allTags}
        title={title} onTitleChange={setTitle}
        subject={subject} onSubjectChange={setSubject}
        difficulty={difficulty} onDifficultyChange={setDifficulty}
        visibility={visibility} onVisibilityChange={setVisibility}
        teamOrgId={teamOrgId} onTeamOrgIdChange={setTeamOrgId}
        sharedOrgIds={sharedOrgIds} onSharedOrgIdsChange={setSharedOrgIds}
        teamEditAllowed={teamEditAllowed} onTeamEditAllowedChange={setTeamEditAllowed}
        canEditSharing={isOwner}
        tags={tags} onTagsChange={setTags}
        {...setPicker}
      />

      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold text-foreground">คำสั่งของโจทย์</h2>
        <div className="space-y-1.5">
          <Label>ข้อความคำสั่ง *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="เช่น พิจารณาสิ่งของต่อไปนี้ แล้วจำแนกประเภทของพอลิเมอร์ที่เป็นองค์ประกอบ"
            rows={3}
          />
          <p className="text-[11px] text-muted-foreground">คำสั่งร่วมที่นักเรียนเห็นเหนือตาราง</p>
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบคำสั่ง (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold text-foreground">มิติการจำแนก (คอลัมน์)</h2>
        <p className="text-xs text-muted-foreground">
          ตัวเลือกเป็นของคอลัมน์ พิมพ์ครั้งเดียวแล้วทุกแถวใช้ร่วมกัน — นักเรียนเลือกได้ 1 ตัวเลือกต่อ 1 ช่อง
        </p>
        <div className="space-y-3">
          {columns.map((column, i) => (
            <ColumnCard
              key={column.id}
              column={column}
              index={i}
              onUpdate={patch => updateColumn(i, patch)}
              onRemove={() => removeColumn(i)}
              canRemove={columns.length > 1}
            />
          ))}
        </div>
        {columns.length < 4 && (
          <Button type="button" variant="outline" onClick={() => setColumns(prev => [...prev, newColumn()])} className="min-h-11 w-full justify-center border-2 border-dashed border-primary/20 text-primary hover:border-primary hover:bg-primary/10">
            <Plus className="h-4 w-4" /> เพิ่มมิติการจำแนก
          </Button>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold text-foreground">รายการที่ให้จำแนก (แถว) และเฉลย</h2>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <RowCard
              key={row.id}
              row={row}
              index={i}
              columns={columns}
              onUpdate={patch => setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))}
              onRemove={() => rows.length > 1 && setRows(prev => prev.filter((_, idx) => idx !== i))}
              canRemove={rows.length > 1}
            />
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => setRows(prev => [...prev, newRow()])} className="min-h-11 w-full justify-center border-2 border-dashed border-primary/20 text-primary hover:border-primary hover:bg-primary/10">
          <Plus className="h-4 w-4" /> เพิ่มแถว
        </Button>
        <p className="text-xs text-muted-foreground">
          {cellCount} ช่อง = {cellCount} คะแนน (ช่องละ 1 คะแนน)
          {keyedCount < cellCount && (
            <span className="text-warning"> · ยังไม่ได้เลือกเฉลย {cellCount - keyedCount} ช่อง</span>
          )}
        </p>
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        label="เฉลยอธิบายสำหรับครู (ไม่บังคับ)"
        placeholder="อธิบายหลักการจำแนกโดยรวม..."
        rows={3}
      />

      <div className="flex items-center gap-3 border-t pt-2">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="classify"
          imageUrls={imageUrls}
          classifyConfig={config}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'อัปเดตโจทย์' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(mode === 'edit' ? returnTo : '/questions/new')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
