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
import { getBlankType, BLANK_MARKER } from '@/lib/fill-blank'
import type { Difficulty, Visibility, FillBlankConfig, FillBlankItem, FillBlankType, Question } from '@/lib/types'

interface FillBlankFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

function parseBlankCount(text: string): number {
  return (text.match(/\[___\]/g) ?? []).length
}

// Local editable draft for a blank. Dropdown correctness is tracked by
// index (not by matching option text) so editing an option's label can't
// silently desync it from being "the correct one".
interface BlankDraft {
  type: FillBlankType
  answer: string
  case_sensitive: boolean
  options: string[]
  correctIndex: number
}

function newBlankDraft(): BlankDraft {
  return { type: 'text', answer: '', case_sensitive: false, options: ['', ''], correctIndex: 0 }
}

function draftFromExisting(config: FillBlankConfig | undefined, item: FillBlankItem): BlankDraft {
  const type = getBlankType(config, item)
  const options = item.options?.length ? item.options : ['', '']
  const correctIndex = Math.max(0, options.indexOf(item.answer))
  return { type, answer: item.answer ?? '', case_sensitive: item.case_sensitive ?? false, options, correctIndex }
}

const BLANK_TYPES: Array<{ value: FillBlankType; label: string; desc: string; icon: typeof PenLine; activeClass: string }> = [
  { value: 'text', label: 'ช่องว่าง', desc: 'นักเรียนตอบอะไรก็ได้ ครูกลับมาตรวจให้คะแนนเอง', icon: PenLine, activeClass: 'bg-orange-50 border-orange-400 text-orange-700' },
  { value: 'fixed', label: 'ฟิกคำตอบ', desc: 'นักเรียนพิมพ์คำตอบ ระบบตรวจให้อัตโนมัติตามคำตอบที่ครูกำหนด', icon: CheckCircle2, activeClass: 'bg-blue-50 border-blue-400 text-blue-700' },
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

  const blankCount = parseBlankCount(questionText)

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
    syncBlanks(parseBlankCount(val))
  }

  function insertBlank() {
    editorRef.current?.insertText(BLANK_MARKER)
  }

  function updateBlank(i: number, field: 'type' | 'answer' | 'case_sensitive', value: string | boolean) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
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
      let correctIndex = b.correctIndex
      if (oi === b.correctIndex) correctIndex = 0
      else if (oi < b.correctIndex) correctIndex -= 1
      return { ...b, options, correctIndex }
    }))
  }

  function setCorrectOption(i: number, oi: number) {
    setBlanks(prev => prev.map((b, idx) => idx === i ? { ...b, correctIndex: oi } : b))
  }

  const fillBlankConfig: FillBlankConfig = {
    blanks: blanks.map((b, i): FillBlankItem => ({
      id: i + 1,
      type: b.type,
      answer: b.type === 'dropdown' ? (b.options[b.correctIndex] ?? '') : b.answer,
      case_sensitive: b.case_sensitive,
      ...(b.type === 'dropdown' ? { options: b.options } : {}),
    })),
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!questionText.trim()) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (blankCount === 0) { toast.error('ต้องมีช่องกรอกอย่างน้อย 1 ช่อง (ใส่ [___] ในข้อความ)'); return }

    for (let i = 0; i < blanks.length; i++) {
      const b = blanks[i]
      if (b.type === 'fixed' && !b.answer.trim()) {
        toast.error(`กรอกคำตอบที่ถูกต้องของช่องที่ ${i + 1} ด้วย`)
        return
      }
      if (b.type === 'dropdown') {
        const filledOptions = b.options.filter(o => o.trim())
        if (filledOptions.length < 2) {
          toast.error(`ช่องที่ ${i + 1} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก`)
          return
        }
        if (!b.options[b.correctIndex]?.trim()) {
          toast.error(`เลือกคำตอบที่ถูกต้องของช่องที่ ${i + 1} ด้วย`)
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
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เนื้อหาโจทย์</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
          <p className="font-medium">วิธีใส่ช่องกรอก:</p>
          <p>พิมพ์ข้อความ แล้วกดปุ่ม <strong>"แทรกช่องกรอก"</strong> หรือพิมพ์ <code className="bg-blue-100 px-1 rounded">[___]</code> ตรงที่ต้องการให้นักเรียนกรอกคำตอบ</p>
          <p className="text-blue-500">ตัวอย่าง: "แสงเดินทางด้วยความเร็ว [___] m/s ในสุญญากาศ"</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>ข้อความโจทย์ *</Label>
            <Button type="button" variant="outline" size="sm" onClick={insertBlank}>
              + แทรกช่องกรอก [___]
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
            <p className="text-xs text-green-600 font-medium">พบช่องกรอก {blankCount} ช่อง</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      {blankCount > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900 border-b pb-2">
            ตั้งค่าแต่ละช่องกรอก
          </h2>

          <div className="space-y-3">
            {blanks.map((b, i) => (
              <div key={i} className="p-3 rounded-xl border bg-gray-50 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
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
                              active ? t.activeClass : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400">{BLANK_TYPES.find(t => t.value === b.type)?.desc}</p>

                    {/* Type-specific fields */}
                    {b.type === 'text' && (
                      <Input
                        value={b.answer}
                        onChange={(e) => updateBlank(i, 'answer', e.target.value)}
                        placeholder="คำตอบอ้างอิงสำหรับครู (ไม่บังคับ)"
                      />
                    )}

                    {b.type === 'fixed' && (
                      <div className="space-y-1.5">
                        <Input
                          value={b.answer}
                          onChange={(e) => updateBlank(i, 'answer', e.target.value)}
                          placeholder={`คำตอบที่ถูกต้องของช่องที่ ${i + 1}`}
                        />
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={b.case_sensitive}
                            onChange={(e) => updateBlank(i, 'case_sensitive', e.target.checked)}
                            className="w-3.5 h-3.5 rounded"
                          />
                          <span className="text-xs text-gray-600">ตรวจสอบตัวพิมพ์เล็ก-ใหญ่ (Case-sensitive)</span>
                        </label>
                      </div>
                    )}

                    {b.type === 'dropdown' && (
                      <div className="space-y-1.5">
                        {b.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCorrectOption(i, oi)}
                              title="ตั้งเป็นคำตอบที่ถูกต้อง"
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                b.correctIndex === oi ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-green-400'
                              }`}
                            >
                              {b.correctIndex === oi && <Check className="w-3 h-3 text-white" />}
                            </button>
                            <Input
                              value={opt}
                              onChange={(e) => updateOption(i, oi, e.target.value)}
                              placeholder={`ตัวเลือก ${oi + 1}`}
                              className="flex-1 h-8 text-sm"
                            />
                            {b.options.length > 2 && (
                              <button type="button" onClick={() => removeOption(i, oi)} className="flex-shrink-0 text-gray-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addOption(i)}>
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          เพิ่มตัวเลือก
                        </Button>
                        <p className="text-[11px] text-gray-400">กดวงกลมหน้าตัวเลือกเพื่อกำหนดคำตอบที่ถูกต้อง</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
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
