'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import {
  CheckSquare, AlignLeft, ArrowUpDown, ListChecks,
  Plus, X, Check, ChevronUp, ChevronDown, Trash2,
} from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { LabelStyleToggle } from './answer-set-controls'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { acceptedAnswers } from '@/lib/fill-blank'
import { ANSWER_BLANK, splitAnswerBlankHtml } from '@/lib/answer-blank'
import { PART_LABEL_SETS, type PartLabelStyle } from '@/lib/part-labels'
import type {
  Difficulty, Visibility, Question,
  CompositeConfig, CompositePart, CompositePartType,
  FillBlankType, FillBlankItem, OrderingItem, MCQOption,
} from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'

interface CompositeFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

// ─── Draft shape ────────────────────────────────────────────────────────────
// One flat draft per part, holding every type's fields at once (only the
// fields matching `type` are read at submit time) — same trick fill-blank-form
// uses for its per-blank draft, so switching a part's type never loses data
// that was already entered for another type.

interface CompositePartDraft {
  id: string
  type: CompositePartType
  text: string
  imageUrls: string[]

  correctAnswer: boolean            // true_false

  blankType: FillBlankType          // fill_blank
  blankRefAnswer: string
  blankAnswers: string[]
  blankCaseSensitive: boolean
  blankOptions: string[]
  blankCorrectIndexes: number[]

  items: OrderingItem[]             // ordering

  mcqOptions: MCQOption[]           // mcq
}

function newPartId(): string {
  return Math.random().toString(36).slice(2)
}

function newPartDraft(type: CompositePartType): CompositePartDraft {
  return {
    id: newPartId(),
    type,
    text: '',
    imageUrls: [],
    correctAnswer: true,
    blankType: 'fixed',
    blankRefAnswer: '',
    blankAnswers: [''],
    blankCaseSensitive: false,
    blankOptions: ['', ''],
    blankCorrectIndexes: [0],
    items: [{ id: newPartId(), text: '' }, { id: newPartId(), text: '' }],
    mcqOptions: [{ text: '', is_correct: true }, { text: '', is_correct: false }],
  }
}

function draftFromExisting(part: CompositePart): CompositePartDraft {
  const base = newPartDraft(part.type)
  base.id = part.id
  base.text = part.text
  base.imageUrls = part.image_urls ?? []

  if (part.type === 'true_false') {
    base.correctAnswer = part.correct_answer ?? true
  }
  if (part.type === 'fill_blank') {
    const blank = part.blanks?.[0]
    if (blank) {
      base.blankType = blank.type
      const accepted = acceptedAnswers(blank)
      base.blankRefAnswer = blank.type === 'text' ? (blank.answer ?? '') : ''
      base.blankAnswers = blank.type === 'fixed' && accepted.length ? accepted : ['']
      base.blankCaseSensitive = blank.case_sensitive ?? false
      base.blankOptions = blank.options?.length ? blank.options : ['', '']
      let correctIndexes = accepted.map(a => base.blankOptions.indexOf(a)).filter(i => i >= 0)
      base.blankCorrectIndexes = correctIndexes.length ? correctIndexes : [0]
    }
  }
  if (part.type === 'ordering') {
    base.items = part.items?.length ? part.items : base.items
  }
  if (part.type === 'mcq') {
    base.mcqOptions = part.options?.length ? part.options : base.mcqOptions
  }
  return base
}

const PART_TYPES: Array<{ value: CompositePartType; label: string; icon: typeof CheckSquare }> = [
  { value: 'true_false', label: 'ถูก-ผิด', icon: CheckSquare },
  { value: 'fill_blank', label: 'เติมคำ', icon: AlignLeft },
  { value: 'ordering', label: 'เรียงลำดับ', icon: ArrowUpDown },
  { value: 'mcq', label: 'ปรนัย', icon: ListChecks },
]

const PART_ACCENT: Record<CompositePartType, string> = {
  true_false: 'bg-success/10 border-success/20 text-success',
  fill_blank: 'bg-primary/10 border-primary/20 text-primary',
  ordering: 'bg-warning/10 border-warning/20 text-warning',
  mcq: 'bg-tint-1/10 border-tint-1/20 text-tint-1',
}

const PART_BADGE: Record<CompositePartType, string> = {
  true_false: 'bg-success/10 text-success',
  fill_blank: 'bg-primary/10 text-primary',
  ordering: 'bg-warning/10 text-warning',
  mcq: 'bg-tint-1/10 text-tint-1',
}

// ─── Per-type field blocks ──────────────────────────────────────────────────

function TrueFalsePartFields({ part, update }: { part: CompositePartDraft; update: (patch: Partial<CompositePartDraft>) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">ข้อความนี้ <strong>ถูกหรือผิด?</strong></p>
      <div className="flex gap-3">
        {[
          { val: true, label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' },
          { val: false, label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' },
        ].map(({ val, label, cls }) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => update({ correctAnswer: val })}
            className={`flex-1 py-2.5 rounded-xl border-2 font-semibold transition-colors ${
              part.correctAnswer === val ? cls : 'border-border text-muted-foreground hover:border-ring'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

const BLANK_TYPE_OPTIONS: Array<{ value: FillBlankType; label: string }> = [
  { value: 'text', label: 'ช่องว่าง (ครูตรวจเอง)' },
  { value: 'fixed', label: 'ฟิกคำตอบ' },
  { value: 'dropdown', label: 'ดรอปดาวน์' },
]

function FillBlankPartFields({ part, update, editorRef }: {
  part: CompositePartDraft; update: (patch: Partial<CompositePartDraft>) => void
  editorRef: React.RefObject<RichTextEditorHandle | null>
}) {
  function updateFixedAnswer(ai: number, value: string) {
    update({ blankAnswers: part.blankAnswers.map((a, j) => j === ai ? value : a) })
  }
  function addFixedAnswer() {
    update({ blankAnswers: [...part.blankAnswers, ''] })
  }
  function removeFixedAnswer(ai: number) {
    if (part.blankAnswers.length <= 1) return
    update({ blankAnswers: part.blankAnswers.filter((_, j) => j !== ai) })
  }
  function updateOption(oi: number, value: string) {
    update({ blankOptions: part.blankOptions.map((o, j) => j === oi ? value : o) })
  }
  function addOption() {
    update({ blankOptions: [...part.blankOptions, ''] })
  }
  function removeOption(oi: number) {
    if (part.blankOptions.length <= 2) return
    const blankOptions = part.blankOptions.filter((_, j) => j !== oi)
    const blankCorrectIndexes = part.blankCorrectIndexes.filter(ci => ci !== oi).map(ci => ci > oi ? ci - 1 : ci)
    update({ blankOptions, blankCorrectIndexes: blankCorrectIndexes.length ? blankCorrectIndexes : [0] })
  }
  function toggleCorrectOption(oi: number) {
    const has = part.blankCorrectIndexes.includes(oi)
    if (has) {
      if (part.blankCorrectIndexes.length <= 1) return
      update({ blankCorrectIndexes: part.blankCorrectIndexes.filter(ci => ci !== oi) })
    } else {
      update({ blankCorrectIndexes: [...part.blankCorrectIndexes, oi].sort((a, b) => a - b) })
    }
  }

  const hasMarker = part.text.includes(ANSWER_BLANK)

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">โจทย์ของข้อนี้ *</Label>
        <Button type="button" variant="outline" size="sm" className="text-xs h-7"
          onClick={() => editorRef.current?.insertText(ANSWER_BLANK)}>
          + [คำตอบ]
        </Button>
      </div>
      <RichTextEditor
        ref={editorRef}
        value={part.text}
        onChange={v => update({ text: v })}
        placeholder="เช่น แสงเดินทางด้วยความเร็ว [คำตอบ] m/s"
        rows={2}
      />
      {!hasMarker && <p className="text-[11px] text-warning">ต้องกดปุ่ม "+ [คำตอบ]" แทรกช่องคำตอบในข้อความก่อน</p>}

      <div className="flex gap-1.5 flex-wrap pt-1">
        {BLANK_TYPE_OPTIONS.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => update({ blankType: t.value })}
            className={`px-2.5 py-1.5 rounded-lg border-2 text-xs font-medium transition-all ${
              part.blankType === t.value ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-ring'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {part.blankType === 'text' && (
        <Input
          value={part.blankRefAnswer}
          onChange={e => update({ blankRefAnswer: e.target.value })}
          placeholder="คำตอบอ้างอิงสำหรับครู (ไม่บังคับ)"
        />
      )}

      {part.blankType === 'fixed' && (
        <div className="space-y-1.5">
          {part.blankAnswers.map((ans, ai) => (
            <div key={ai} className="flex items-center gap-2">
              <Input
                value={ans}
                onChange={e => updateFixedAnswer(ai, e.target.value)}
                placeholder={ai === 0 ? 'คำตอบที่ถูกต้อง' : 'คำตอบที่ถูกต้องอีกแบบ'}
                className="flex-1 h-8 text-sm"
              />
              {part.blankAnswers.length > 1 && (
                <button type="button" onClick={() => removeFixedAnswer(ai)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addFixedAnswer}>
            <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มคำตอบที่ถูกต้อง
          </Button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={part.blankCaseSensitive}
              onChange={e => update({ blankCaseSensitive: e.target.checked })}
              className="w-3.5 h-3.5 rounded" />
            <span className="text-xs text-muted-foreground">ตรวจสอบตัวพิมพ์เล็ก-ใหญ่ (Case-sensitive)</span>
          </label>
        </div>
      )}

      {part.blankType === 'dropdown' && (
        <div className="space-y-1.5">
          {part.blankOptions.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleCorrectOption(oi)}
                title="ติ๊กเพื่อกำหนดเป็นคำตอบที่ถูกต้อง (เลือกได้มากกว่า 1)"
                className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  part.blankCorrectIndexes.includes(oi) ? 'border-success bg-success' : 'border-border hover:border-success/50'
                }`}
              >
                {part.blankCorrectIndexes.includes(oi) && <Check className="w-3 h-3 text-white" />}
              </button>
              <Input value={opt} onChange={e => updateOption(oi, e.target.value)} placeholder={`ตัวเลือก ${oi + 1}`} className="flex-1 h-8 text-sm" />
              {part.blankOptions.length > 2 && (
                <button type="button" onClick={() => removeOption(oi)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มตัวเลือก
          </Button>
        </div>
      )}
    </div>
  )
}

function OrderingPartFields({ part, update }: { part: CompositePartDraft; update: (patch: Partial<CompositePartDraft>) => void }) {
  function updateItem(id: string, text: string) {
    update({ items: part.items.map(it => it.id === id ? { ...it, text } : it) })
  }
  function addItem() {
    if (part.items.length >= 8) return
    update({ items: [...part.items, { id: newPartId(), text: '' }] })
  }
  function removeItem(id: string) {
    if (part.items.length <= 2) return
    update({ items: part.items.filter(it => it.id !== id) })
  }
  function moveUp(idx: number) {
    if (idx === 0) return
    const a = [...part.items]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; update({ items: a })
  }
  function moveDown(idx: number) {
    if (idx === part.items.length - 1) return
    const a = [...part.items]; [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; update({ items: a })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">คำสั่ง / บริบท *</Label>
      </div>
      <RichTextEditor value={part.text} onChange={v => update({ text: v })} placeholder="เช่น จงเรียงขั้นตอนต่อไปนี้จากก่อนไปหลัง" rows={2} />
      <p className="text-[11px] text-muted-foreground">ลำดับด้านล่างคือลำดับที่ถูกต้อง นักเรียนจะเห็นรายการสลับแล้ว</p>
      <div className="space-y-1.5">
        {part.items.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-2">
            <div className="flex flex-col gap-0.5 flex-shrink-0 pt-1.5">
              <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 rounded text-muted-foreground hover:text-muted-foreground disabled:opacity-30">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => moveDown(idx)} disabled={idx === part.items.length - 1} className="p-0.5 rounded text-muted-foreground hover:text-muted-foreground disabled:opacity-30">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="flex-shrink-0 w-6 h-6 mt-1 rounded-full bg-warning/10 text-warning text-xs font-bold flex items-center justify-center">{idx + 1}</span>
            <div className="flex-1">
              <RichTextEditor value={item.text} onChange={v => updateItem(item.id, v)} placeholder={`รายการที่ ${idx + 1}`} rows={1} />
            </div>
            {part.items.length > 2 && (
              <button type="button" onClick={() => removeItem(item.id)} className="flex-shrink-0 mt-1.5 text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {part.items.length < 8 && (
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มรายการ ({part.items.length}/8)
        </Button>
      )}
    </div>
  )
}

function McqPartFields({ part, update }: { part: CompositePartDraft; update: (patch: Partial<CompositePartDraft>) => void }) {
  function updateOption(oi: number, text: string) {
    update({ mcqOptions: part.mcqOptions.map((o, j) => j === oi ? { ...o, text } : o) })
  }
  function setCorrect(oi: number) {
    update({ mcqOptions: part.mcqOptions.map((o, j) => ({ ...o, is_correct: j === oi })) })
  }
  function addOption() {
    if (part.mcqOptions.length >= 6) return
    update({ mcqOptions: [...part.mcqOptions, { text: '', is_correct: false }] })
  }
  function removeOption(oi: number) {
    if (part.mcqOptions.length <= 2) return
    const removed = part.mcqOptions[oi]
    let mcqOptions = part.mcqOptions.filter((_, j) => j !== oi)
    if (removed.is_correct && !mcqOptions.some(o => o.is_correct)) mcqOptions = mcqOptions.map((o, j) => ({ ...o, is_correct: j === 0 }))
    update({ mcqOptions })
  }

  return (
    <div className="space-y-2.5">
      <Label className="text-xs text-muted-foreground">โจทย์ของข้อนี้ *</Label>
      <RichTextEditor value={part.text} onChange={v => update({ text: v })} placeholder="พิมพ์คำถามปรนัยของข้อนี้..." rows={2} />
      <div className="space-y-1.5">
        {part.mcqOptions.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(oi)}
              title="ตั้งเป็นคำตอบที่ถูกต้อง"
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                opt.is_correct ? 'border-tint-1 bg-tint-1' : 'border-border hover:border-tint-1'
              }`}
            >
              {opt.is_correct && <Check className="w-3 h-3 text-white" />}
            </button>
            <Input value={opt.text} onChange={e => updateOption(oi, e.target.value)} placeholder={`ตัวเลือก ${oi + 1}`} className="flex-1 h-8 text-sm" />
            {part.mcqOptions.length > 2 && (
              <button type="button" onClick={() => removeOption(oi)} className="text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {part.mcqOptions.length < 6 && (
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มตัวเลือก
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">กดวงกลมหน้าตัวเลือกเพื่อกำหนดคำตอบที่ถูกต้อง</p>
      </div>
    </div>
  )
}

// ─── Part card ───────────────────────────────────────────────────────────────

function CompositePartCard({ part, label, update, onRemove, onMoveUp, onMoveDown, canRemove }: {
  part: CompositePartDraft; label: string
  update: (patch: Partial<CompositePartDraft>) => void
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void
  canRemove: boolean
}) {
  const fillBlankEditorRef = useRef<RichTextEditorHandle>(null)

  return (
    <div className="border rounded-xl overflow-hidden bg-muted">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b bg-card">
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button type="button" onClick={onMoveUp} className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${PART_BADGE[part.type]}`}>
          {label}
        </span>
        <div className="flex gap-1.5 flex-wrap flex-1">
          {PART_TYPES.map(t => {
            const Icon = t.icon
            const active = part.type === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => update({ type: t.value })}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border-2 text-xs font-medium transition-all ${
                  active ? PART_ACCENT[t.value] : 'bg-card border-border text-muted-foreground hover:border-ring'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            )
          })}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="flex-shrink-0 flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> ลบ
          </button>
        )}
      </div>

      <div className="p-3.5">
        {part.type === 'true_false' && (
          <div className="space-y-2.5">
            <Label className="text-xs text-muted-foreground">ข้อความ *</Label>
            <RichTextEditor value={part.text} onChange={v => update({ text: v })} placeholder="พิมพ์ข้อความที่ต้องตัดสินถูก-ผิด..." rows={2} />
            <TrueFalsePartFields part={part} update={update} />
          </div>
        )}
        {part.type === 'fill_blank' && <FillBlankPartFields part={part} update={update} editorRef={fillBlankEditorRef} />}
        {part.type === 'ordering' && <OrderingPartFields part={part} update={update} />}
        {part.type === 'mcq' && <McqPartFields part={part} update={update} />}

        <div className="pt-3 mt-3 border-t">
          <Label className="text-xs text-muted-foreground mb-1.5 block">รูปภาพประกอบข้อนี้ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={part.imageUrls} onChange={v => update({ imageUrls: v })} />
        </div>
      </div>
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function CompositeForm({ allTags, mode = 'create', question, isOwner = true }: CompositeFormProps) {
  const router = useRouter()
  // Back to exactly the bank view the teacher edited from — search, filters, page and tab.
  const returnTo = questionsReturnTo(useSearchParams())
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const existingConfig = question?.extra_data as CompositeConfig | undefined

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(question?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(question?.shared_org_ids ?? [])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(question?.team_edit_allowed ?? true)
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])
  // Which แฟ้ม the โจทย์ is filed into on save. Create only: the แฟ้ม holding an
  // existing โจทย์ are changed from the แฟ้ม itself, where it can also be taken
  // back out — a picker here could only ever add.
  const [setIds, setSetIds] = useState<string[]>([])
  const setPicker = mode === 'create' ? { setIds, onSetIdsChange: setSetIds } : {}

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])
  const [labelStyle, setLabelStyle] = useState<PartLabelStyle>(existingConfig?.part_label_style ?? 'thai')
  const [parts, setParts] = useState<CompositePartDraft[]>(
    existingConfig?.parts?.length ? existingConfig.parts.map(draftFromExisting) : [newPartDraft('true_false')]
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('composite')
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

    const config = (seed.extra_data ?? {}) as CompositeConfig
    setParts(config.parts?.length ? config.parts.map(draftFromExisting) : [newPartDraft('true_false')])
    setLabelStyle(config.part_label_style ?? 'thai')
  })

  const labels = PART_LABEL_SETS[labelStyle]

  function addPart() {
    setParts(prev => [...prev, newPartDraft('true_false')])
  }
  function updatePart(i: number, patch: Partial<CompositePartDraft>) {
    setParts(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }
  function removePart(i: number) {
    if (parts.length <= 1) return
    setParts(prev => prev.filter((_, idx) => idx !== i))
  }
  function movePartUp(i: number) {
    if (i === 0) return
    setParts(prev => { const a = [...prev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })
  }
  function movePartDown(i: number) {
    if (i === parts.length - 1) return
    setParts(prev => { const a = [...prev]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a })
  }

  const compositeConfig: CompositeConfig = {
    parts: parts.map((p): CompositePart => {
      const base = {
        id: p.id, type: p.type, text: p.text,
        image_urls: p.imageUrls.length ? p.imageUrls : undefined,
        score: 1,
      }
      if (p.type === 'true_false') return { ...base, correct_answer: p.correctAnswer }
      if (p.type === 'fill_blank') {
        const accepted = p.blankType === 'dropdown'
          ? p.blankCorrectIndexes.map(ci => p.blankOptions[ci]).filter((v): v is string => !!v?.trim())
          : p.blankType === 'fixed'
            ? p.blankAnswers.map(a => a.trim()).filter(Boolean)
            : []
        const blank: FillBlankItem = {
          id: 1,
          type: p.blankType,
          answer: p.blankType === 'text' ? p.blankRefAnswer : (accepted[0] ?? ''),
          ...(accepted.length ? { answers: accepted } : {}),
          case_sensitive: p.blankCaseSensitive,
          ...(p.blankType === 'dropdown' ? { options: p.blankOptions } : {}),
        }
        return { ...base, blanks: [blank] }
      }
      if (p.type === 'ordering') return { ...base, items: p.items }
      if (p.type === 'mcq') return { ...base, options: p.mcqOptions }
      return base
    }),
    part_label_style: labelStyle !== 'thai' ? labelStyle : undefined,
  }

  function plain(html: string) {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!plain(questionText)) { toast.error('กรอกโจทย์หลัก/บทนำด้วย'); return }

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      const num = labels[i] ?? String(i + 1)
      if (p.type === 'true_false' && !plain(p.text)) {
        toast.error(`กรอกข้อความของข้อ ${num} ด้วย`); return
      }
      if (p.type === 'fill_blank') {
        if (!plain(p.text)) { toast.error(`กรอกโจทย์ของข้อ ${num} ด้วย`); return }
        if (!splitAnswerBlankHtml(p.text)) { toast.error(`ข้อ ${num}: ต้องแทรก [คำตอบ] ในข้อความให้ครบ 1 จุด`); return }
        if (p.blankType === 'fixed' && !p.blankAnswers.some(a => a.trim())) {
          toast.error(`ข้อ ${num}: กรอกคำตอบที่ถูกต้องอย่างน้อย 1 คำตอบ`); return
        }
        if (p.blankType === 'dropdown') {
          const filled = p.blankOptions.filter(o => plain(o))
          if (filled.length < 2) { toast.error(`ข้อ ${num}: ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก`); return }
          if (!p.blankCorrectIndexes.some(ci => plain(p.blankOptions[ci] ?? ''))) {
            toast.error(`ข้อ ${num}: เลือกคำตอบที่ถูกต้องอย่างน้อย 1 ตัวเลือก`); return
          }
        }
      }
      if (p.type === 'ordering') {
        if (!plain(p.text)) { toast.error(`กรอกคำสั่ง/บริบทของข้อ ${num} ด้วย`); return }
        if (p.items.length < 2) { toast.error(`ข้อ ${num}: ต้องมีรายการอย่างน้อย 2 รายการ`); return }
        const emptyIdx = p.items.findIndex(it => !plain(it.text))
        if (emptyIdx !== -1) { toast.error(`ข้อ ${num}: กรอกข้อความรายการที่ ${emptyIdx + 1} ด้วย`); return }
      }
      if (p.type === 'mcq') {
        if (!plain(p.text)) { toast.error(`กรอกโจทย์ของข้อ ${num} ด้วย`); return }
        const filled = p.mcqOptions.filter(o => plain(o.text))
        if (filled.length < 2) { toast.error(`ข้อ ${num}: ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก`); return }
        if (!p.mcqOptions.some(o => o.is_correct && plain(o.text))) {
          toast.error(`ข้อ ${num}: เลือกคำตอบที่ถูกต้อง`); return
        }
      }
    }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'composite' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: compositeConfig,
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
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
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
        <h2 className="text-base font-semibold text-foreground border-b pb-2">โจทย์หลัก / บทนำ</h2>
        <div className="space-y-1.5">
          <Label>ข้อความโจทย์หลัก *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="เช่น วัตถุมวล 2 kg ถูกลากด้วยแรง 10 N บนพื้นราบไม่มีความเสียดทาน จงพิจารณาข้อความต่อไปนี้ แล้วตอบคำถามแต่ละข้อ"
            rows={4}
          />
          <p className="text-[11px] text-muted-foreground">บริบทร่วมที่นักเรียนเห็นก่อนคำถามย่อยทุกข้อด้านล่าง</p>
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">รายการคำถามย่อย</h2>
          {parts.length > 1 && <LabelStyleToggle value={labelStyle} onChange={setLabelStyle} />}
        </div>
        <p className="text-xs text-muted-foreground">แต่ละข้อเลือกได้เองว่าเป็นคำถามประเภทไหน — ถูก-ผิด เติมคำ เรียงลำดับ หรือปรนัย</p>

        <div className="space-y-3">
          {parts.map((part, i) => (
            <CompositePartCard
              key={part.id}
              part={part}
              label={labels[i] ?? String(i + 1)}
              update={patch => updatePart(i, patch)}
              onRemove={() => removePart(i)}
              onMoveUp={() => movePartUp(i)}
              onMoveDown={() => movePartDown(i)}
              canRemove={parts.length > 1}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addPart}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary border-2 border-dashed border-primary/20 rounded-xl hover:border-primary hover:bg-primary/10 transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" /> เพิ่มคำถามย่อย
        </button>

        <p className="text-xs text-muted-foreground">คะแนนรวม: {parts.length} คะแนน (ข้อละ 1 คะแนน — ข้อที่ตั้งเป็นช่องว่างให้ครูตรวจเองจะรอผลจนกว่าครูจะให้คะแนน)</p>
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        label="เฉลยรวมสำหรับครู (ไม่บังคับ)"
        placeholder="อธิบายวิธีทำโดยรวม..."
        rows={3}
      />

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="composite"
          imageUrls={imageUrls}
          compositeConfig={compositeConfig}
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
