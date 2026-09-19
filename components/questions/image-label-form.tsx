'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, Trash2, X } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { imageLabelMarkerCount, normalizeImageLabelMode } from '@/lib/image-label'
import { imageLabelMarkerClass } from '@/components/exam/image-label-input'
import { cn } from '@/lib/utils'
import type {
  Difficulty, Visibility, Question,
  ImageLabelConfig, ImageLabelMarker, ImageLabelAnswerMode,
} from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'
import type { QuestionDraftHandoff } from '@/lib/question-draft-handoff'

interface ImageLabelFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
  /** Present when the โจทย์ is being drafted rather than saved — the Word
   *  import fills this form in and takes the payload back.
   *  See lib/question-draft-handoff.ts. */
  draft?: QuestionDraftHandoff
}

function newId(): string {
  return Math.random().toString(36).slice(2)
}

interface MarkerDraft {
  id: string
  label: string
  x: number
  y: number
  answers: string[]
  caseSensitive: boolean
  /** Only meaningful in 'dropdown'; empty means this point offers the shared bank. */
  options: string[]
}

function newMarker(x: number, y: number): MarkerDraft {
  return { id: newId(), label: '', x, y, answers: [''], caseSensitive: false, options: [] }
}

const MODE_LABEL: Record<ImageLabelAnswerMode, { title: string; hint: string }> = {
  drag: { title: 'ลากคำจากคลัง', hint: 'คลังคำอยู่ใต้รูป ใส่คำเกินจำนวนจุดได้ ส่วนที่เกินคือตัวลวง' },
  typed: { title: 'พิมพ์เอง', hint: 'นักเรียนพิมพ์คำตอบเอง ไม่มีรายการให้เลือก' },
  dropdown: { title: 'ดรอปดาวน์', hint: 'แต่ละจุดมีรายการให้เลือก ไม่ใส่รายการของจุดไหนจะใช้คลังคำร่วม' },
}

const clamp = (n: number) => Math.min(100, Math.max(0, n))
const round = (n: number) => Math.round(n * 10) / 10

/**
 * Where the teacher places the points.
 *
 * Clicking empty picture adds a point there; dragging a point moves it. Both
 * are pointer events on the same element, told apart the way the student's
 * renderer tells a tap from a drag — a press that never moved is a click.
 *
 * Positions are percentages, because that is what is stored and what the
 * student's screen will scale: a point placed here at 41.2% of the way across
 * is 41.2% of the way across a phone too. Nothing here works in pixels beyond
 * the moment of reading the pointer.
 */
function PointCanvas({ imageUrl, markers, selected, onAdd, onMove, onSelect }: {
  imageUrl: string
  markers: MarkerDraft[]
  selected: string | null
  onAdd: (x: number, y: number) => void
  onMove: (id: string, x: number, y: number) => void
  onSelect: (id: string | null) => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)

  function pointAt(event: { clientX: number; clientY: number }) {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: round(clamp(((event.clientX - rect.left) / rect.width) * 100)),
      y: round(clamp(((event.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function startMarkerDrag(event: React.PointerEvent, id: string) {
    event.stopPropagation()
    event.preventDefault()
    dragRef.current = { id, moved: false }
    onSelect(id)

    const move = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      const at = pointAt(moveEvent)
      if (!drag || !at) return
      drag.moved = true
      onMove(drag.id, at.x, at.y)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      dragRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div
      ref={boxRef}
      onClick={event => {
        const at = pointAt(event)
        if (at) onAdd(at.x, at.y)
      }}
      className="relative cursor-crosshair overflow-hidden rounded-lg border-2 border-dashed border-primary/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="รูปของโจทย์" className="block w-full select-none object-contain" draggable={false} />
      {markers.map((marker, index) => (
        <Button
          key={marker.id}
          type="button"
          size="icon"
          onPointerDown={event => startMarkerDrag(event, marker.id)}
          onClick={event => event.stopPropagation()}
          aria-label={`จุดที่ ${index + 1}${marker.label ? ` — ${marker.label}` : ''}`}
          style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          className={cn(
            // Same badge the student will see (imageLabelMarkerClass), so what
            // a point looks like over the drawing is not something the teacher
            // finds out afterwards. One step wider than the student's, because
            // this one is dragged: a grab target, not only a label.
            'absolute size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none border-0 p-0 active:cursor-grabbing',
            imageLabelMarkerClass(selected === marker.id ? 'active' : 'idle'),
            // The picked point is the one the card below is editing, so it is
            // filled in and ringed a second time in primary — the ring the rest
            // of this form marks a selection with.
            selected === marker.id && 'outline-2 outline-offset-1 outline-primary/50',
          )}
        >
          {index + 1}
        </Button>
      ))}
    </div>
  )
}

function MarkerCard({ marker, index, mode, bank, onUpdate, onRemove, selected, onSelect }: {
  marker: MarkerDraft
  index: number
  mode: ImageLabelAnswerMode
  bank: string[]
  onUpdate: (patch: Partial<MarkerDraft>) => void
  onRemove: () => void
  selected: boolean
  onSelect: () => void
}) {
  // What this point offers, if its mode offers anything. An answer outside the
  // list can never be picked, so the card says so where the teacher can see it
  // rather than letting the point quietly stop being worth a mark.
  const choices = mode === 'drag' ? bank : (marker.options.length > 0 ? marker.options : bank)
  const unreachable = mode === 'typed'
    ? []
    : marker.answers.map(a => a.trim()).filter(a => a && !choices.map(c => c.trim()).includes(a))

  return (
    <Card
      radius="md"
      padding="sm"
      onClick={onSelect}
      className={cn('space-y-2.5', selected && 'ring-2 ring-primary/40')}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tint-1 text-xs font-bold text-primary-foreground">
          {index + 1}
        </span>
        <Input
          value={marker.label}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="ชื่อเรียกจุดนี้ เช่น หลอดลม (ไม่บังคับ)"
          className="h-9 min-w-0 flex-1 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`ลบจุดที่ ${index + 1}`}
          className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <p className="pl-8 text-[11px] text-muted-foreground">
        ชื่อเรียกใช้บนหน้าตรวจของครูเท่านั้น นักเรียนไม่เห็น · ตำแหน่ง {marker.x}% , {marker.y}%
      </p>

      <div className="space-y-1.5 pl-8">
        <Label className="text-xs text-muted-foreground">เฉลยที่ยอมรับ</Label>
        {marker.answers.map((answer, ai) => (
          <div key={ai} className="flex items-center gap-2">
            <Input
              value={answer}
              onChange={e => onUpdate({ answers: marker.answers.map((a, i) => (i === ai ? e.target.value : a)) })}
              placeholder={ai === 0 ? 'คำตอบที่ถูก' : 'คำตอบอื่นที่ยอมรับด้วย'}
              className="h-9 min-w-0 flex-1 text-sm"
            />
            {marker.answers.length > 1 && (
              <Button
                type="button" variant="ghost" size="icon"
                onClick={() => onUpdate({ answers: marker.answers.filter((_, i) => i !== ai) })}
                aria-label={`ลบเฉลยที่ ${ai + 1} ของจุดที่ ${index + 1}`}
                className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button" variant="outline" size="sm"
          onClick={() => onUpdate({ answers: [...marker.answers, ''] })}
        >
          <Plus className="size-3.5" /> เพิ่มคำตอบที่ยอมรับ
        </Button>

        {unreachable.length > 0 && (
          <p className="text-[11px] text-warning">
            &ldquo;{unreachable.join('&rdquo;, &ldquo;')}&rdquo; ไม่มีใน{mode === 'drag' ? 'คลังคำ' : 'รายการที่จุดนี้ให้เลือก'} — นักเรียนตอบแบบนี้ไม่ได้
          </p>
        )}

        {mode === 'typed' && (
          <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={marker.caseSensitive}
              onChange={e => onUpdate({ caseSensitive: e.target.checked })}
            />
            ตัวพิมพ์ใหญ่-เล็กต้องตรงกัน
          </label>
        )}

        {mode === 'dropdown' && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-muted-foreground">
              รายการให้เลือกเฉพาะจุดนี้ (ไม่ใส่ = ใช้คลังคำร่วม)
            </Label>
            {marker.options.map((option, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <Input
                  value={option}
                  onChange={e => onUpdate({ options: marker.options.map((o, i) => (i === oi ? e.target.value : o)) })}
                  placeholder={`ตัวเลือกที่ ${oi + 1}`}
                  className="h-9 min-w-0 flex-1 text-sm"
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => onUpdate({ options: marker.options.filter((_, i) => i !== oi) })}
                  aria-label={`ลบตัวเลือกที่ ${oi + 1} ของจุดที่ ${index + 1}`}
                  className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => onUpdate({ options: [...marker.options, ''] })}
            >
              <Plus className="size-3.5" /> เพิ่มตัวเลือกของจุดนี้
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

export function ImageLabelForm({ allTags, mode = 'create', question, isOwner = true, draft }: ImageLabelFormProps) {
  const router = useRouter()
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [saving, setSaving] = useState(false)
  const returnTo = questionsReturnTo(useSearchParams())

  const existingConfig = question?.extra_data as ImageLabelConfig | undefined

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(question?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(question?.shared_org_ids ?? [])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(question?.team_edit_allowed ?? true)
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])
  const [setIds, setSetIds] = useState<string[]>([])
  // A แฟ้ม is chosen once for the whole file on the import screen.
  const setPicker = mode === 'create' && !draft ? { setIds, onSetIdsChange: setSetIds } : {}

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  // The diagram is its own field, not questions.image_urls: every renderer
  // prints those above the answer area without looking at the question type, so
  // a diagram stored there would appear twice.
  const [diagram, setDiagram] = useState<string[]>(existingConfig?.image_url ? [existingConfig.image_url] : [])
  // A fresh question starts on ลากคำ, the worksheet this type exists for. An
  // existing one is read the way the grader reads it, so the form never shows a
  // mode the frozen key was not built from.
  const [answerMode, setAnswerMode] = useState<ImageLabelAnswerMode>(
    existingConfig ? normalizeImageLabelMode(existingConfig.answer_mode) : 'drag',
  )
  const [bank, setBank] = useState<string[]>(existingConfig?.bank?.length ? existingConfig.bank : [''])
  const [markers, setMarkers] = useState<MarkerDraft[]>(
    existingConfig?.markers?.map(marker => ({
      id: marker.id || newId(),
      label: marker.label ?? '',
      x: marker.point?.x ?? 50,
      y: marker.point?.y ?? 50,
      answers: marker.answers?.length ? [...marker.answers] : [''],
      caseSensitive: marker.case_sensitive === true,
      options: marker.options ? [...marker.options] : [],
    })) ?? [],
  )
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'create' || question) return
    // A draft arrives with its own content; a duplicate seed would overwrite it.
    if (draft) return
    const seed = readDuplicateSeed('image_label')
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

    const config = (seed.extra_data ?? {}) as ImageLabelConfig
    if (config.image_url) setDiagram([config.image_url])
    setAnswerMode(normalizeImageLabelMode(config.answer_mode))
    if (config.bank?.length) setBank([...config.bank])
    if (config.markers?.length) {
      setMarkers(config.markers.map(marker => ({
        id: marker.id || newId(),
        label: marker.label ?? '',
        x: marker.point?.x ?? 50,
        y: marker.point?.y ?? 50,
        answers: marker.answers?.length ? [...marker.answers] : [''],
        caseSensitive: marker.case_sensitive === true,
        options: marker.options ? [...marker.options] : [],
      })))
    }
  })

  const imageUrl = diagram[0] ?? ''
  const cleanBank = bank.map(word => word.trim()).filter(Boolean)

  /**
   * Taking a word out of the bank takes it out of every answer that named it.
   *
   * Left behind, those answers reach the database as keys nobody can satisfy,
   * and imageLabelKey quietly drops the point from the question's point value —
   * the teacher loses a mark without anything saying so. The same reasoning as
   * ตารางจำแนก clearing a row's key when its column's options shorten.
   */
  function updateBank(next: string[]) {
    const gone = cleanBank.filter(word => !next.map(w => w.trim()).includes(word))
    setBank(next)
    if (gone.length === 0) return
    setMarkers(prev => prev.map(marker => {
      const kept = marker.answers.filter(answer => !gone.includes(answer.trim()))
      return { ...marker, answers: kept.length ? kept : [''] }
    }))
  }

  const config: ImageLabelConfig = {
    image_url: imageUrl,
    answer_mode: answerMode,
    ...(cleanBank.length ? { bank: cleanBank } : {}),
    markers: markers.map((marker): ImageLabelMarker => ({
      id: marker.id,
      ...(marker.label.trim() ? { label: marker.label.trim() } : {}),
      point: { x: marker.x, y: marker.y },
      answers: marker.answers.map(a => a.trim()).filter(Boolean),
      case_sensitive: marker.caseSensitive,
      ...(answerMode === 'dropdown' && marker.options.some(o => o.trim())
        ? { options: marker.options.map(o => o.trim()).filter(Boolean) }
        : {}),
    })),
  }

  // Counted through the same module the attempt freezes its key from, so what
  // this line promises and what a งาน scores cannot drift apart.
  const keyedCount = imageLabelMarkerCount(config)
  const unkeyed = markers.length - keyedCount

  function plain(html: string) {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    // วิชา is asked once for the whole file on the import screen.
    if (!draft && !subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!plain(questionText)) { toast.error('กรอกคำสั่งของโจทย์ด้วย'); return }
    if (!imageUrl) { toast.error('อัปโหลดรูปของโจทย์ก่อน'); return }
    if (markers.length === 0) { toast.error('คลิกบนรูปเพื่อวางจุดอย่างน้อย 1 จุด'); return }
    if (answerMode === 'drag' && cleanBank.length === 0) {
      toast.error('โหมดลากคำต้องมีคลังคำอย่างน้อย 1 คำ'); return
    }

    // Every point must be answerable, even though the grading rules tolerate one
    // that is not. An unkeyed point silently costs the question a mark, and a
    // teacher who meant to leave one blank has no way to say so — so the form
    // refuses rather than letting the mark quietly disappear.
    if (unkeyed > 0) {
      toast.error(`ยังมี ${unkeyed} จุดที่นักเรียนตอบถูกไม่ได้ — ตรวจเฉลยของทุกจุด`)
      return
    }

    const payload = {
      title, subject, question_text: questionText, question_type: 'image_label' as const,
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

    // Draft mode hands the payload back instead of writing it.
    if (draft) { draft.onSubmit(payload); return }

    setSaving(true)
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
        showSharing={!draft}
        showSubject={!draft}
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
            placeholder="เช่น พิจารณาภาพต่อไปนี้ แล้วลากชื่ออวัยวะไปใส่ในช่องที่ชี้ไปยังอวัยวะนั้น"
            rows={3}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold text-foreground">รูปและจุดที่ให้ตอบ</h2>

        <div className="space-y-1.5">
          <Label>รูปของโจทย์ *</Label>
          <QuestionImageUpload value={diagram} onChange={next => setDiagram(next.slice(-1))} />
          <p className="text-[11px] text-muted-foreground">
            ใช้รูปเดียว — รูปนี้คือพื้นที่ที่นักเรียนตอบ ไม่ใช่ภาพประกอบ
          </p>
        </div>

        {imageUrl ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              คลิกบนรูปเพื่อวางจุด · ลากจุดเพื่อย้ายตำแหน่ง
            </p>
            <PointCanvas
              imageUrl={imageUrl}
              markers={markers}
              selected={selected}
              onSelect={setSelected}
              onAdd={(x, y) => {
                const marker = newMarker(x, y)
                setMarkers(prev => [...prev, marker])
                setSelected(marker.id)
              }}
              onMove={(id, x, y) => setMarkers(prev => prev.map(m => (m.id === id ? { ...m, x, y } : m)))}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            อัปโหลดรูปก่อน แล้วจะคลิกวางจุดบนรูปได้
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold text-foreground">วิธีตอบ</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['drag', 'dropdown', 'typed'] as const).map(option => (
            <Button
              key={option}
              type="button"
              variant="outline"
              aria-pressed={answerMode === option}
              onClick={() => setAnswerMode(option)}
              className={cn(
                'h-auto min-h-11 flex-col items-start gap-0 whitespace-normal border-2 px-3 py-2 text-left font-normal',
                answerMode === option && 'border-primary bg-primary/10',
              )}
            >
              <span className="block text-sm font-medium">{MODE_LABEL[option].title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{MODE_LABEL[option].hint}</span>
            </Button>
          ))}
        </div>

        {answerMode !== 'typed' && (
          <div className="space-y-1.5">
            <Label className="text-sm">
              {answerMode === 'drag' ? 'คลังคำ *' : 'คลังคำร่วม (จุดที่ไม่ได้ใส่รายการของตัวเองจะใช้อันนี้)'}
            </Label>
            <div className="space-y-1.5">
              {bank.map((word, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={word}
                    onChange={e => updateBank(bank.map((w, idx) => (idx === i ? e.target.value : w)))}
                    placeholder={`คำที่ ${i + 1}`}
                    className="h-9 min-w-0 flex-1 text-sm"
                  />
                  {bank.length > 1 && (
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => updateBank(bank.filter((_, idx) => idx !== i))}
                      aria-label={`ลบคำที่ ${i + 1} ออกจากคลังคำ`}
                      className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setBank(prev => [...prev, ''])}>
              <Plus className="size-3.5" /> เพิ่มคำ
            </Button>
            {answerMode === 'drag' && cleanBank.length > markers.length && (
              <p className="text-[11px] text-muted-foreground">
                มีคำเกินจำนวนจุดอยู่ {cleanBank.length - markers.length} คำ — เป็นตัวลวง
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold text-foreground">เฉลยของแต่ละจุด</h2>
        {markers.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีจุด — คลิกบนรูปด้านบนเพื่อวางจุดแรก</p>
        ) : (
          <div className="space-y-3">
            {markers.map((marker, i) => (
              <MarkerCard
                key={marker.id}
                marker={marker}
                index={i}
                mode={answerMode}
                bank={cleanBank}
                selected={selected === marker.id}
                onSelect={() => setSelected(marker.id)}
                onUpdate={patch => setMarkers(prev => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))}
                onRemove={() => setMarkers(prev => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {markers.length} จุด = {markers.length} คะแนน (จุดละ 1 คะแนน)
          {unkeyed > 0 && (
            <span className="text-warning"> · ยังมี {unkeyed} จุดที่ตอบถูกไม่ได้</span>
          )}
        </p>
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        label="เฉลยอธิบายสำหรับครู (ไม่บังคับ)"
        placeholder="อธิบายภาพรวมของส่วนประกอบในรูป..."
        rows={3}
      />

      <div className="flex items-center gap-3 border-t pt-2">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="image_label"
          imageUrls={imageUrls}
          imageLabelConfig={config}
        />
        <Button type="submit" disabled={saving}>
          {draft ? draft.submitLabel : saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'อัปเดตโจทย์' : 'บันทึกโจทย์'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => draft ? draft.onCancel() : router.push(mode === 'edit' ? returnTo : '/questions/new')}
          disabled={saving}
        >
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
