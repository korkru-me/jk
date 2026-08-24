'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, Trash2, X } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { LabelStyleToggle } from './answer-set-controls'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { isTrueFalseGroupQuestion } from '@/lib/true-false-group'
import { PART_LABEL_SETS, type PartLabelStyle } from '@/lib/part-labels'
import { Card } from '@/components/ui/card'
import type {
  Difficulty, Visibility, Question,
  CompositeConfig, CompositePart, TrueFalseStatement, TrueFalseSelectTarget,
} from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'

interface TrueFalseGroupFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

function newId(): string {
  return Math.random().toString(36).slice(2)
}

function newChoice(): TrueFalseStatement {
  return { id: newId(), text: '', correct_answer: true }
}

interface SubQuestionDraft {
  id: string
  text: string
  imageUrls: string[]
  selectTarget: TrueFalseSelectTarget
  choices: TrueFalseStatement[]
  score: number
}

function newSubQuestion(): SubQuestionDraft {
  return { id: newId(), text: '', imageUrls: [], selectTarget: 'correct', choices: [newChoice(), newChoice()], score: 1 }
}

function draftFromPart(part: CompositePart): SubQuestionDraft {
  return {
    id: part.id,
    text: part.text,
    imageUrls: part.image_urls ?? [],
    selectTarget: part.select_target ?? 'correct',
    choices: part.choices?.length ? part.choices : [newChoice(), newChoice()],
    score: part.score ?? 1,
  }
}

// ─── Sub-question card ──────────────────────────────────────────────────────

function SubQuestionCard({
  subQuestion, label, onUpdate, onRemove, canRemove, onAddChoice, onUpdateChoice, onRemoveChoice,
}: {
  subQuestion: SubQuestionDraft
  label: string
  onUpdate: (patch: Partial<SubQuestionDraft>) => void
  onRemove: () => void
  canRemove: boolean
  onAddChoice: () => void
  onUpdateChoice: (ci: number, patch: Partial<TrueFalseStatement>) => void
  onRemoveChoice: (ci: number) => void
}) {
  return (
    <div className="border rounded-xl overflow-hidden bg-muted">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b bg-card">
        <span className="flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center bg-success/10 text-success">
          {label}
        </span>
        <span className="text-sm font-medium text-muted-foreground flex-1">คำถามย่อย</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="flex-shrink-0 flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> ลบ
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">คำถามย่อย *</Label>
          <RichTextEditor
            value={subQuestion.text}
            onChange={v => onUpdate({ text: v })}
            placeholder="เช่น จากสถานการณ์ข้างต้น ข้อใดกล่าวถูกต้อง"
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">รูปภาพประกอบคำถามย่อยนี้ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={subQuestion.imageUrls} onChange={v => onUpdate({ imageUrls: v })} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">ถามหา:</span>
          {([
            { value: 'correct' as const, label: '✓ ข้อที่ถูก' },
            { value: 'wrong' as const, label: '✗ ข้อที่ผิด' },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate({ selectTarget: opt.value })}
              className={`px-2.5 py-1.5 rounded-lg border-2 text-xs font-medium transition-colors ${
                subQuestion.selectTarget === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-ring'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="text-[11px] text-muted-foreground">นักเรียนติ๊กได้ตั้งแต่ 1 ข้อขึ้นไป</span>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">ตัวเลือก</Label>
          {subQuestion.choices.map((choice, ci) => (
            <Card radius="sm" className="flex items-start gap-2 p-2.5" key={choice.id}>
              <span className="text-xs font-bold text-muted-foreground mt-2.5 w-4 flex-shrink-0">{ci + 1}.</span>
              <div className="flex-1 space-y-1.5 min-w-0">
                <RichTextEditor
                  value={choice.text}
                  onChange={v => onUpdateChoice(ci, { text: v })}
                  placeholder={`ตัวเลือกที่ ${ci + 1}`}
                  rows={1}
                />
                <div className="flex gap-2">
                  {[
                    { val: true, label: '✓ ถูก', cls: 'border-success bg-success/10 text-success' },
                    { val: false, label: '✗ ผิด', cls: 'border-destructive bg-destructive/10 text-destructive' },
                  ].map(({ val, label, cls }) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => onUpdateChoice(ci, { correct_answer: val })}
                      className={`px-3 py-1 rounded-lg border-2 text-xs font-semibold transition-colors ${
                        choice.correct_answer === val ? cls : 'border-border text-muted-foreground hover:border-ring'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {subQuestion.choices.length > 2 && (
                <button type="button" onClick={() => onRemoveChoice(ci)} className="flex-shrink-0 mt-2.5 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={onAddChoice}>
            <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มตัวเลือก
          </Button>
        </div>

        <div className="space-y-1.5 pt-2 border-t">
          <Label className="text-xs text-muted-foreground">คะแนนของคำถามย่อยนี้</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={subQuestion.score}
              onChange={e => onUpdate({ score: parseFloat(e.target.value) || 1 })}
              className="w-24 h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">คะแนน</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function TrueFalseGroupForm({ allTags, mode = 'create', question, isOwner = true }: TrueFalseGroupFormProps) {
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

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])
  const [labelStyle, setLabelStyle] = useState<PartLabelStyle>(existingConfig?.part_label_style ?? 'thai')
  const [subQuestions, setSubQuestions] = useState<SubQuestionDraft[]>(
    existingConfig?.parts?.length ? existingConfig.parts.map(draftFromPart) : [newSubQuestion()]
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('composite')
    if (!seed || !isTrueFalseGroupQuestion(seed)) return
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
    setSubQuestions(config.parts?.length ? config.parts.map(draftFromPart) : [newSubQuestion()])
    setLabelStyle(config.part_label_style ?? 'thai')
  })

  const labels = PART_LABEL_SETS[labelStyle]

  function addSubQuestion() {
    setSubQuestions(prev => [...prev, newSubQuestion()])
  }
  function updateSubQuestion(i: number, patch: Partial<SubQuestionDraft>) {
    setSubQuestions(prev => prev.map((sq, idx) => idx === i ? { ...sq, ...patch } : sq))
  }
  function removeSubQuestion(i: number) {
    if (subQuestions.length <= 1) return
    setSubQuestions(prev => prev.filter((_, idx) => idx !== i))
  }
  function addChoice(si: number) {
    setSubQuestions(prev => prev.map((sq, idx) => idx === si ? { ...sq, choices: [...sq.choices, newChoice()] } : sq))
  }
  function updateChoice(si: number, ci: number, patch: Partial<TrueFalseStatement>) {
    setSubQuestions(prev => prev.map((sq, idx) => idx === si
      ? { ...sq, choices: sq.choices.map((c, cidx) => cidx === ci ? { ...c, ...patch } : c) }
      : sq))
  }
  function removeChoice(si: number, ci: number) {
    setSubQuestions(prev => prev.map((sq, idx) => {
      if (idx !== si || sq.choices.length <= 2) return sq
      return { ...sq, choices: sq.choices.filter((_, cidx) => cidx !== ci) }
    }))
  }

  const compositeConfig: CompositeConfig = {
    parts: subQuestions.map((sq): CompositePart => ({
      id: sq.id,
      type: 'true_false',
      text: sq.text,
      image_urls: sq.imageUrls.length ? sq.imageUrls : undefined,
      score: sq.score,
      choices: sq.choices,
      select_target: sq.selectTarget === 'wrong' ? 'wrong' : undefined,
    })),
    part_label_style: labelStyle !== 'thai' ? labelStyle : undefined,
  }

  function plain(html: string) {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!plain(questionText)) { toast.error('กรอกโจทย์หลักด้วย'); return }

    for (let i = 0; i < subQuestions.length; i++) {
      const sq = subQuestions[i]
      const num = labels[i] ?? String(i + 1)
      if (!plain(sq.text)) { toast.error(`กรอกคำถามย่อยที่ ${num} ด้วย`); return }
      if (sq.choices.length < 2) { toast.error(`คำถามย่อยที่ ${num}: ต้องมีตัวเลือกอย่างน้อย 2 ข้อ`); return }
      const emptyIdx = sq.choices.findIndex(c => !plain(c.text))
      if (emptyIdx !== -1) { toast.error(`คำถามย่อยที่ ${num}: กรอกข้อความตัวเลือกที่ ${emptyIdx + 1} ด้วย`); return }
      if (sq.score <= 0) { toast.error(`คำถามย่อยที่ ${num}: คะแนนต้องมากกว่า 0`); return }
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
        <h2 className="text-base font-semibold text-foreground border-b pb-2">โจทย์หลัก / สถานการณ์</h2>
        <div className="space-y-1.5">
          <Label>ข้อความโจทย์หลัก *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="เช่น พิจารณาข้อความต่อไปนี้เกี่ยวกับระบบสุริยะ แล้วตอบคำถามแต่ละข้อด้านล่าง"
            rows={4}
          />
          <p className="text-[11px] text-muted-foreground">บริบทร่วมที่นักเรียนเห็นก่อนคำถามย่อยทุกข้อด้านล่าง — ไม่ใช่ข้อความที่ต้องตัดสินถูก-ผิด</p>
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">คำถามย่อย</h2>
          {subQuestions.length > 1 && <LabelStyleToggle value={labelStyle} onChange={setLabelStyle} />}
        </div>
        <p className="text-xs text-muted-foreground">แต่ละคำถามย่อยมีตัวเลือกของตัวเอง ครูตั้งได้ว่าจะถามหาข้อที่ถูกหรือข้อที่ผิด นักเรียนติ๊กได้ตั้งแต่ 1 ข้อขึ้นไป</p>

        <div className="space-y-3">
          {subQuestions.map((sq, si) => (
            <SubQuestionCard
              key={sq.id}
              subQuestion={sq}
              label={labels[si] ?? String(si + 1)}
              onUpdate={patch => updateSubQuestion(si, patch)}
              onRemove={() => removeSubQuestion(si)}
              canRemove={subQuestions.length > 1}
              onAddChoice={() => addChoice(si)}
              onUpdateChoice={(ci, patch) => updateChoice(si, ci, patch)}
              onRemoveChoice={ci => removeChoice(si, ci)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addSubQuestion}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary border-2 border-dashed border-primary/20 rounded-xl hover:border-primary hover:bg-primary/10 transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" /> เพิ่มคำถามย่อย
        </button>

        <p className="text-xs text-muted-foreground">คะแนนรวม: {subQuestions.reduce((sum, sq) => sum + sq.score, 0)} คะแนน</p>
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
        <Button type="button" variant="outline" onClick={() => router.push(mode === 'edit' ? returnTo : '/questions/new/true-false')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
