'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { AnswerPartCard, LabelStyleToggle, AddSubItemButton } from './answer-set-controls'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { PART_LABEL_SETS, type PartLabelStyle } from '@/lib/part-labels'
import type { Difficulty, Visibility, TrueFalseExplanationMode, TrueFalseConfig, TrueFalseStatement, TrueFalseAnswerMode, TrueFalseSelectTarget, Question } from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'

interface TrueFalseFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

const EXPLANATION_MODES: { value: TrueFalseExplanationMode; label: string; desc: string }[] = [
  { value: 'none',       label: 'ไม่ต้องให้เหตุผล',               desc: 'นักเรียนแค่เลือกถูกหรือผิด' },
  { value: 'wrong_only', label: 'ให้เหตุผลเฉพาะกรณีตอบผิด',       desc: 'ครูตรวจเหตุผลด้วยมือ' },
  { value: 'always',     label: 'ให้เหตุผลทั้งถูกและผิด',          desc: 'ครูตรวจเหตุผลด้วยมือ' },
]

function newStatement(): TrueFalseStatement {
  return { id: Math.random().toString(36).slice(2), text: '', correct_answer: true }
}

// The main statement — always item ก. Shown bare (no card) until a sub-statement
// is added, then wrapped in AnswerPartCard by the caller.
function TrueFalseMainItem({
  editorRef, questionText, onQuestionTextChange,
  imageUrls, onImageUrlsChange,
  correctAnswer, onCorrectAnswerChange,
}: {
  editorRef: React.RefObject<RichTextEditorHandle | null>
  questionText: string; onQuestionTextChange: (v: string) => void
  imageUrls: string[]; onImageUrlsChange: (v: string[]) => void
  correctAnswer: boolean; onCorrectAnswerChange: (v: boolean) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>ข้อความ *</Label>
        <RichTextEditor
          ref={editorRef}
          value={questionText}
          onChange={onQuestionTextChange}
          placeholder="เช่น แสงเดินทางได้เร็วกว่าเสียงในอากาศ"
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
        <QuestionImageUpload value={imageUrls} onChange={onImageUrlsChange} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">ข้อความนี้ <strong>ถูกหรือผิด?</strong></p>
        <div className="flex gap-3">
          {[
            { val: true,  label: '✓ ถูก',  cls: 'border-success bg-success/10 text-success' },
            { val: false, label: '✗ ผิด',  cls: 'border-destructive bg-destructive/10 text-destructive' },
          ].map(({ val, label, cls }) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => onCorrectAnswerChange(val)}
              className={`flex-1 py-4 rounded-xl border-2 font-semibold text-lg transition-colors ${
                correctAnswer === val ? cls : 'border-border text-muted-foreground hover:border-ring'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">เลือกว่าข้อความนี้จริงๆ แล้วถูกหรือผิด — ใช้เป็นเฉลยสำหรับให้คะแนน ไม่ว่าจะเลือกโหมดการตอบแบบไหนก็ตาม</p>
      </div>
    </>
  )
}

export function TrueFalseForm({ allTags, mode = 'create', question, isOwner = true }: TrueFalseFormProps) {
  const router = useRouter()
  // Back to exactly the bank view the teacher edited from — search, filters, page and tab.
  const returnTo = questionsReturnTo(useSearchParams())
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const existingConfig = question?.extra_data as TrueFalseConfig | undefined

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
  const [correctAnswer, setCorrectAnswer] = useState<boolean>(existingConfig?.correct_answer ?? true)
  const [statements, setStatements] = useState<TrueFalseStatement[]>(existingConfig?.statements ?? [])
  const [answerMode, setAnswerMode] = useState<TrueFalseAnswerMode>(existingConfig?.answer_mode ?? 'judge_each')
  const [selectTarget, setSelectTarget] = useState<TrueFalseSelectTarget>(existingConfig?.select_target ?? 'correct')
  const [labelStyle, setLabelStyle] = useState<PartLabelStyle>(existingConfig?.part_label_style ?? 'thai')
  const [explanationMode, setExplanationMode] = useState<TrueFalseExplanationMode>(existingConfig?.explanation_mode ?? 'none')
  const [scoreAnswer, setScoreAnswer] = useState(existingConfig?.score_answer ?? 1)
  const [scoreExplanation, setScoreExplanation] = useState(existingConfig?.score_explanation ?? 1)
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('true_false')
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

    const config = (seed.extra_data ?? {}) as TrueFalseConfig
    setCorrectAnswer(config.correct_answer ?? true)
    setStatements(config.statements ?? [])
    setExplanationMode(config.explanation_mode ?? 'none')
    setScoreAnswer(config.score_answer ?? 1)
    setScoreExplanation(config.score_explanation ?? 1)
    setLabelStyle(config.part_label_style ?? 'thai')
    setAnswerMode(config.answer_mode ?? 'judge_each')
    setSelectTarget(config.select_target ?? 'correct')
  })

  const labels = PART_LABEL_SETS[labelStyle]

  function addStatement() {
    setStatements(s => [...s, newStatement()])
  }
  function updateStatement(i: number, patch: Partial<TrueFalseStatement>) {
    setStatements(s => s.map((st, idx) => idx === i ? { ...st, ...patch } : st))
  }
  function removeStatement(i: number) {
    setStatements(s => s.filter((_, idx) => idx !== i))
  }

  const trueFalseConfig: TrueFalseConfig = {
    correct_answer: correctAnswer,
    explanation_mode: explanationMode,
    score_answer: scoreAnswer,
    score_explanation: scoreExplanation,
    statements: statements.length > 0 ? statements : undefined,
    part_label_style: labelStyle !== 'thai' ? labelStyle : undefined,
    answer_mode: answerMode === 'select_matching' ? 'select_matching' : undefined,
    select_target: answerMode === 'select_matching' && selectTarget === 'wrong' ? 'wrong' : undefined,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาข้อความด้วย'); return }
    const emptyIdx = statements.findIndex(s => !s.text.replace(/<[^>]*>/g, '').trim())
    if (emptyIdx !== -1) {
      toast.error(`กรอกข้อความข้อย่อย ${labels[emptyIdx + 1] ?? emptyIdx + 2} ด้วย`); return
    }
    if (scoreAnswer <= 0) { toast.error('คะแนนส่วนถูก/ผิดต้องมากกว่า 0'); return }
    if (explanationMode !== 'none' && scoreExplanation <= 0) {
      toast.error('คะแนนส่วนเหตุผลต้องมากกว่า 0'); return
    }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'true_false' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: trueFalseConfig,
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
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">ชุดข้อความถูก-ผิด</h2>
          {statements.length > 0 && <LabelStyleToggle value={labelStyle} onChange={setLabelStyle} />}
        </div>
        <p className="text-xs text-muted-foreground">พิมพ์ข้อความที่นักเรียนจะต้องตัดสินว่าถูกหรือผิด — กดเพิ่มข้อย่อยได้ถ้าอยากให้มีหลายข้อความในโจทย์เดียว</p>

        <div className="space-y-2 bg-muted border border-border rounded-xl p-3">
          <Label className="text-xs text-muted-foreground">โหมดการตอบ</Label>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: 'judge_each' as const, label: 'ตัดสินทีละข้อ (แบบเดิม)' },
              { value: 'select_matching' as const, label: 'เลือกข้อที่ถูก/ผิดจากรายการ' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnswerMode(opt.value)}
                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-colors ${
                  answerMode === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-ring'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {answerMode === 'select_matching' && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">ถามหา:</span>
              {([
                { value: 'correct' as const, label: '✓ ข้อที่ถูก' },
                { value: 'wrong' as const, label: '✗ ข้อที่ผิด' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectTarget(opt.value)}
                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-colors ${
                    selectTarget === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-ring'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground">นักเรียนจะเห็นรายการทั้งหมด แล้วติ๊กเฉพาะข้อที่ตรงกับที่เลือกไว้ (เลือกได้มากกว่า 1 ข้อ)</span>
            </div>
          )}
        </div>

        {statements.length > 0 ? (
          <AnswerPartCard label={labels[0]} locked>
            <TrueFalseMainItem
              editorRef={editorRef}
              questionText={questionText} onQuestionTextChange={setQuestionText}
              imageUrls={imageUrls} onImageUrlsChange={setImageUrls}
              correctAnswer={correctAnswer} onCorrectAnswerChange={setCorrectAnswer}
            />
          </AnswerPartCard>
        ) : (
          <TrueFalseMainItem
            editorRef={editorRef}
            questionText={questionText} onQuestionTextChange={setQuestionText}
            imageUrls={imageUrls} onImageUrlsChange={setImageUrls}
            correctAnswer={correctAnswer} onCorrectAnswerChange={setCorrectAnswer}
          />
        )}

        {statements.map((st, i) => (
          <AnswerPartCard key={st.id} label={labels[i + 1] ?? String(i + 2)} onRemove={() => removeStatement(i)}>
            <div className="space-y-1.5">
              <Label>ข้อความย่อย *</Label>
              <RichTextEditor
                value={st.text}
                onChange={v => updateStatement(i, { text: v })}
                placeholder="พิมพ์ข้อความที่ต้องตัดสินถูก-ผิด..."
                rows={2}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">ข้อความนี้ <strong>ถูกหรือผิด?</strong></p>
              <div className="flex gap-3">
                {[
                  { val: true,  label: '✓ ถูก',  cls: 'border-success bg-success/10 text-success' },
                  { val: false, label: '✗ ผิด',  cls: 'border-destructive bg-destructive/10 text-destructive' },
                ].map(({ val, label, cls }) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => updateStatement(i, { correct_answer: val })}
                    className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-colors ${
                      st.correct_answer === val ? cls : 'border-border text-muted-foreground hover:border-ring'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </AnswerPartCard>
        ))}

        <AddSubItemButton onClick={addStatement} label="เพิ่มข้อย่อย" />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">การให้เหตุผล</h2>
        <div className="space-y-2">
          {EXPLANATION_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                explanationMode === mode.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-ring'
              }`}
            >
              <input
                type="radio"
                name="explanation_mode"
                value={mode.value}
                checked={explanationMode === mode.value}
                onChange={() => setExplanationMode(mode.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{mode.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className={`grid gap-4 pt-2 ${explanationMode !== 'none' ? 'grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
          <div className="space-y-1.5">
            <Label>คะแนนส่วนถูก/ผิด</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={scoreAnswer}
                onChange={(e) => setScoreAnswer(parseFloat(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">คะแนน</span>
            </div>
          </div>
          {explanationMode !== 'none' && (
            <div className="space-y-1.5">
              <Label>คะแนนส่วนเหตุผล</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={scoreExplanation}
                  onChange={(e) => setScoreExplanation(parseFloat(e.target.value) || 1)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">คะแนน (ครูตรวจเอง)</span>
              </div>
            </div>
          )}
        </div>

        {explanationMode !== 'none' && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg px-4 py-3">
            <p className="text-xs text-warning">
              คะแนนรวม <strong>{scoreAnswer + scoreExplanation}</strong> คะแนน
              — ระบบตรวจถูก/ผิดอัตโนมัติ ({scoreAnswer} คะแนน)
              ส่วนเหตุผล ({scoreExplanation} คะแนน) ครูต้องตรวจและให้คะแนนเอง
            </p>
          </div>
        )}
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        label="เฉลยอ้างอิงสำหรับครู (ไม่บังคับ)"
        placeholder="อธิบายว่าทำไมถึงถูกหรือผิด..."
        rows={3}
      />

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="true_false"
          imageUrls={imageUrls}
          trueFalseConfig={trueFalseConfig}
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
