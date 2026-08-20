'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Button } from '@/components/ui/button'
import { PenLine, CheckCircle2, ChevronDownSquare, Plus, X, Check } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { getBlankType, numberedBlankMarker, countBlanks, extractBlankNumbers, nextBlankNumber, acceptedAnswers } from '@/lib/fill-blank'
import type { Difficulty, Visibility, FillBlankConfig, FillBlankItem, FillBlankType, Question } from '@/lib/types'

interface FillBlankFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

// Local editable draft for a blank. Dropdown correctness is tracked by
// option index (not by matching option text) so editing an option's label
// can't silently desync it from being "one of the correct ones" — and more
// than one index may be marked correct.
interface BlankDraft {
  type: FillBlankType
  refAnswer: string        // 'text' type only: optional reference answer for the teacher (ungraded)
  answers: string[]        // 'fixed' type only: accepted correct answers, one or more
  case_sensitive: boolean
  options: string[]        // 'dropdown' type only
  correctIndexes: number[] // 'dropdown' type only: option indexes marked correct, one or more
}

function newBlankDraft(): BlankDraft {
  return { type: 'text', refAnswer: '', answers: [''], case_sensitive: false, options: ['', ''], correctIndexes: [0] }
}

function draftFromExisting(config: FillBlankConfig | undefined, item: FillBlankItem): BlankDraft {
  const type = getBlankType(config, item)
  const options = item.options?.length ? item.options : ['', '']
  const accepted = acceptedAnswers(item)
  let correctIndexes = accepted.map(a => options.indexOf(a)).filter(idx => idx >= 0)
  if (correctIndexes.length === 0) correctIndexes = [0]
  return {
    type,
    refAnswer: type === 'text' ? (item.answer ?? '') : '',
    answers: type === 'fixed' && accepted.length ? accepted : [''],
    case_sensitive: item.case_sensitive ?? false,
    options,
    correctIndexes,
  }
}

const BLANK_TYPES: Array<{ value: FillBlankType; label: string; desc: string; icon: typeof PenLine; activeClass: string }> = [
  { value: 'text', label: 'ช่องว่าง', desc: 'นักเรียนตอบอะไรก็ได้ ครูกลับมาตรวจให้คะแนนเอง', icon: PenLine, activeClass: 'bg-orange-50 border-orange-400 text-orange-700' },
  { value: 'fixed', label: 'ฟิกคำตอบ', desc: 'นักเรียนพิมพ์คำตอบ ระบบตรวจให้อัตโนมัติตามคำตอบที่ครูกำหนด', icon: CheckCircle2, activeClass: 'bg-primary/10 border-primary text-primary' },
  { value: 'dropdown', label: 'ดรอปดาวน์', desc: 'นักเรียนเลือกคำตอบจากตัวเลือกที่ครูกำหนด ระบบตรวจให้อัตโนมัติ', icon: ChevronDownSquare, activeClass: 'bg-purple-50 border-purple-400 text-purple-700' },
]

export function FillBlankForm({ allTags, mode = 'create', question, isOwner = true }: FillBlankFormProps) {
  const router = useRouter()
  const returnTo = useSearchParams().get('tab') === 'team' ? '/questions?tab=team' : '/questions'
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const existingConfig = question?.extra_data as FillBlankConfig | undefined

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(question?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(question?.shared_org_ids ?? [])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(question?.team_edit_allowed ?? true)
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])

  const [blanks, setBlanks] = useState<BlankDraft[]>(
    (existingConfig?.blanks ?? []).map(b => draftFromExisting(existingConfig, b))
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('fill_blank')
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

    const config = (seed.extra_data ?? {}) as FillBlankConfig
    setBlanks((config.blanks ?? []).map(b => draftFromExisting(config, b)))
  })

  const blankCount = countBlanks(questionText)
  const blankNumbers = extractBlankNumbers(questionText)

  // Sync blanks length with blankCount
  function syncBlanks(count: number) {
    setBlanks(prev => {
      if (prev.length === count) return prev
      if (count > prev.length) {
        return [...prev, ...Array.from({ length: count - prev.length }, newBlankDraft)]
      }
      return prev.slice(0, count)
    })
  }

  function handleQuestionTextChange(val: string) {
    setQuestionText(val)
    syncBlanks(countBlanks(val))
  }

  function insertBlank() {
    editorRef.current?.insertText(numberedBlankMarker(nextBlankNumber(questionText)))
  }

  function updateBlank(i: number, field: 'type' | 'refAnswer' | 'case_sensitive', value: string | boolean) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
  }

  function updateFixedAnswer(i: number, ai: number, value: string) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, answers: b.answers.map((a, j) => j === ai ? value : a) } : b))
  }

  function addFixedAnswer(i: number) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, answers: [...b.answers, ''] } : b))
  }

  function removeFixedAnswer(i: number, ai: number) {
    setBlanks(prev => prev.map((b, idx) => {
      if (idx !== i || b.answers.length <= 1) return b
      return { ...b, answers: b.answers.filter((_, j) => j !== ai) }
    }))
  }

  function updateOption(i: number, oi: number, value: string) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, options: b.options.map((o, j) => j === oi ? value : o) } : b))
  }

  function addOption(i: number) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, options: [...b.options, ''] } : b))
  }

  function removeOption(i: number, oi: number) {
    setBlanks(prev => prev.map((b, idx) => {
      if (idx !== i || b.options.length <= 2) return b
      const options = b.options.filter((_, j) => j !== oi)
      const correctIndexes = b.correctIndexes.filter(ci => ci !== oi).map(ci => ci > oi ? ci - 1 : ci)
      return { ...b, options, correctIndexes: correctIndexes.length ? correctIndexes : [0] }
    }))
  }

  // Toggles whether an option counts as correct — more than one option may
  // be marked correct, but at least one must remain.
  function toggleCorrectOption(i: number, oi: number) {
    setBlanks(prev => prev.map((b, idx) => {
      if (idx !== i) return b
      const has = b.correctIndexes.includes(oi)
      if (has) {
        if (b.correctIndexes.length <= 1) return b
        return { ...b, correctIndexes: b.correctIndexes.filter(ci => ci !== oi) }
      }
      return { ...b, correctIndexes: [...b.correctIndexes, oi].sort((a, c) => a - c) }
    }))
  }

  const fillBlankConfig: FillBlankConfig = {
    blanks: blanks.map((b, i): FillBlankItem => {
      const accepted = b.type === 'dropdown'
        ? b.correctIndexes.map(ci => b.options[ci]).filter((v): v is string => !!v?.trim())
        : b.type === 'fixed'
          ? b.answers.map(a => a.trim()).filter(Boolean)
          : []
      return {
        id: i + 1,
        type: b.type,
        answer: b.type === 'text' ? b.refAnswer : (accepted[0] ?? ''),
        ...(accepted.length ? { answers: accepted } : {}),
        case_sensitive: b.case_sensitive,
        ...(b.type === 'dropdown' ? { options: b.options } : {}),
      }
    }),
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!questionText.trim()) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (blankCount === 0) { toast.error('ต้องมีช่องกรอกอย่างน้อย 1 ช่อง (ใส่ [___] ในข้อความ)'); return }

    for (let i = 0; i < blanks.length; i++) {
      const b = blanks[i]
      const num = blankNumbers[i] ?? i + 1
      if (b.type === 'fixed' && !b.answers.some(a => a.trim())) {
        toast.error(`กรอกคำตอบที่ถูกต้องของช่องที่ ${num} อย่างน้อย 1 คำตอบ`)
        return
      }
      if (b.type === 'dropdown') {
        const filledOptions = b.options.filter(o => o.trim())
        if (filledOptions.length < 2) {
          toast.error(`ช่องที่ ${num} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก`)
          return
        }
        if (!b.correctIndexes.some(ci => b.options[ci]?.trim())) {
          toast.error(`เลือกคำตอบที่ถูกต้องของช่องที่ ${num} อย่างน้อย 1 ตัวเลือก`)
          return
        }
      }
    }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'fill_blank' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: fillBlankConfig,
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, image_urls: imageUrls,
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

  const autoCount = blanks.filter(b => b.type !== 'text').length
  const manualCount = blanks.length - autoCount

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
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">เนื้อหาโจทย์</h2>
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-xs text-primary space-y-1">
          <p className="font-medium">วิธีใส่ช่องกรอก:</p>
          <p>กดปุ่ม <strong>"+ แทรกช่องกรอก"</strong> ตรงที่ต้องการให้นักเรียนกรอกคำตอบ — แทรกได้หลายช่อง แต่ละช่องจะมีเลขกำกับ (เช่น <code className="bg-primary/10 px-1 rounded">[___1]</code>) ตรงกับการ์ดตั้งค่าคำตอบเลขเดียวกันด้านล่าง</p>
          <p className="text-primary">ตัวอย่าง: "แสงเดินทางด้วยความเร็ว [___1] m/s ในสุญญากาศ"</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>ข้อความโจทย์ *</Label>
            <Button type="button" variant="outline" size="sm" onClick={insertBlank}>
              + แทรกช่องกรอก
            </Button>
          </div>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={handleQuestionTextChange}
            placeholder="พิมพ์ข้อความที่นี่ แล้วกดปุ่มแทรกช่องกรอก..."
            rows={5}
          />
          {blankCount > 0 && (
            <p className="text-xs text-success font-medium">พบช่องกรอก {blankCount} ช่อง</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      {blankCount > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground border-b pb-2">
            ตั้งค่าแต่ละช่องกรอก
          </h2>

          <div className="space-y-3">
            {blanks.map((b, i) => {
              const num = blankNumbers[i] ?? i + 1
              return (
              <div key={i} className="p-3 rounded-xl border bg-muted space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                    {num}
                  </div>
                  <div className="flex-1 space-y-2">
                    {/* Type selector */}
                    <div className="flex gap-1.5 flex-wrap">
                      {BLANK_TYPES.map(t => {
                        const Icon = t.icon
                        const active = b.type === t.value
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => updateBlank(i, 'type', t.value)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 text-xs font-medium transition-all ${
                              active ? t.activeClass : 'bg-card border-border text-muted-foreground hover:border-ring'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{BLANK_TYPES.find(t => t.value === b.type)?.desc}</p>

                    {/* Type-specific fields */}
                    {b.type === 'text' && (
                      <Input
                        value={b.refAnswer}
                        onChange={(e) => updateBlank(i, 'refAnswer', e.target.value)}
                        placeholder="คำตอบอ้างอิงสำหรับครู (ไม่บังคับ)"
                      />
                    )}

                    {b.type === 'fixed' && (
                      <div className="space-y-1.5">
                        {b.answers.map((ans, ai) => (
                          <div key={ai} className="flex items-center gap-2">
                            <Input
                              value={ans}
                              onChange={(e) => updateFixedAnswer(i, ai, e.target.value)}
                              placeholder={ai === 0 ? `คำตอบที่ถูกต้องของช่องที่ ${num}` : `คำตอบที่ถูกต้องอีกแบบของช่องที่ ${num}`}
                              className="flex-1 h-8 text-sm"
                            />
                            {b.answers.length > 1 && (
                              <button type="button" onClick={() => removeFixedAnswer(i, ai)} className="flex-shrink-0 text-muted-foreground hover:text-destructive">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addFixedAnswer(i)}>
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          เพิ่มคำตอบที่ถูกต้อง
                        </Button>
                        <p className="text-[11px] text-muted-foreground">นักเรียนตอบตรงกับคำตอบใดคำตอบหนึ่งในนี้ ถือว่าถูกต้อง</p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={b.case_sensitive}
                            onChange={(e) => updateBlank(i, 'case_sensitive', e.target.checked)}
                            className="w-3.5 h-3.5 rounded"
                          />
                          <span className="text-xs text-muted-foreground">ตรวจสอบตัวพิมพ์เล็ก-ใหญ่ (Case-sensitive)</span>
                        </label>
                      </div>
                    )}

                    {b.type === 'dropdown' && (
                      <div className="space-y-1.5">
                        {b.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleCorrectOption(i, oi)}
                              title="ติ๊กเพื่อกำหนดเป็นคำตอบที่ถูกต้อง (เลือกได้มากกว่า 1)"
                              className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                b.correctIndexes.includes(oi) ? 'border-success bg-success' : 'border-border hover:border-success/50'
                              }`}
                            >
                              {b.correctIndexes.includes(oi) && <Check className="w-3 h-3 text-white" />}
                            </button>
                            <Input
                              value={opt}
                              onChange={(e) => updateOption(i, oi, e.target.value)}
                              placeholder={`ตัวเลือก ${oi + 1}`}
                              className="flex-1 h-8 text-sm"
                            />
                            {b.options.length > 2 && (
                              <button type="button" onClick={() => removeOption(i, oi)} className="flex-shrink-0 text-muted-foreground hover:text-destructive">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addOption(i)}>
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          เพิ่มตัวเลือก
                        </Button>
                        <p className="text-[11px] text-muted-foreground">ติ๊กช่องหน้าตัวเลือกเพื่อกำหนดคำตอบที่ถูกต้อง (เลือกได้มากกว่า 1 ตัวเลือก)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {manualCount === 0
              ? `คะแนนรวม: ${blankCount} คะแนน (ตรวจอัตโนมัติทุกช่อง)`
              : autoCount === 0
                ? `คะแนนรวม: ${blankCount} คะแนน (ครูให้คะแนนเองทุกช่อง)`
                : `คะแนนรวม: ${blankCount} คะแนน (ตรวจอัตโนมัติ ${autoCount} ช่อง, ครูให้คะแนนเอง ${manualCount} ช่อง)`}
          </p>
        </section>
      )}

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        label="เฉลยอ้างอิงสำหรับครู (ไม่บังคับ)"
        placeholder="อธิบายเพิ่มเติม..."
        rows={3}
      />

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="fill_blank"
          imageUrls={imageUrls}
          fillBlankConfig={fillBlankConfig}
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
