'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, X, Image as ImageIcon, ListChecks, Calculator } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { SpecialCharInput } from './special-char-input'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { McqAutoForm } from './mcq-auto-form'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import type { Difficulty, Visibility, MCQOption, FormulaPreset, Question } from '@/lib/types'

const OPTION_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ']

type McqMode = 'manual' | 'auto'
type PresetWithCat = FormulaPreset & { question_categories: { name: string } | null }

interface McqFormProps {
  allTags: string[]
  presets?: PresetWithCat[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

function newOption(): MCQOption {
  return { text: '', is_correct: false }
}

function SingleImageUpload({ value, onChange }: { value?: string; onChange: (url?: string) => void }) {
  return (
    <QuestionImageUpload
      value={value ? [value] : []}
      onChange={(urls) => {
        if (urls.length === 0) onChange(undefined)
        else onChange(urls[urls.length - 1])
      }}
    />
  )
}

export function McqForm({ allTags, presets = [], mode = 'create', question, isOwner = true }: McqFormProps) {
  const [entryMode, setEntryMode] = useState<McqMode>('manual')

  if (mode === 'create' && entryMode === 'auto') {
    return (
      <div className="space-y-6">
        <ModeSwitcher mode={entryMode} onChange={setEntryMode} />
        <McqAutoForm allTags={allTags} presets={presets} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {mode === 'create' && <ModeSwitcher mode={entryMode} onChange={setEntryMode} />}
      <McqManualForm allTags={allTags} mode={mode} question={question} isOwner={isOwner} />
    </div>
  )
}

function ModeSwitcher({ mode, onChange }: { mode: McqMode; onChange: (m: McqMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-lg">
      <button
        type="button"
        onClick={() => onChange('manual')}
        className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
          mode === 'manual'
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-blue-300 bg-white'
        }`}
      >
        <ListChecks className={`w-5 h-5 mt-0.5 shrink-0 ${mode === 'manual' ? 'text-blue-600' : 'text-gray-400'}`} />
        <div>
          <p className={`text-sm font-semibold ${mode === 'manual' ? 'text-blue-900' : 'text-gray-700'}`}>
            สร้างตัวเลือกเอง
          </p>
          <p className={`text-xs mt-0.5 ${mode === 'manual' ? 'text-blue-700' : 'text-gray-400'}`}>
            พิมพ์ตัวเลือกทั้งหมดด้วยตัวเอง
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange('auto')}
        className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
          mode === 'auto'
            ? 'border-purple-500 bg-purple-50'
            : 'border-gray-200 hover:border-purple-300 bg-white'
        }`}
      >
        <Calculator className={`w-5 h-5 mt-0.5 shrink-0 ${mode === 'auto' ? 'text-purple-600' : 'text-gray-400'}`} />
        <div>
          <p className={`text-sm font-semibold ${mode === 'auto' ? 'text-purple-900' : 'text-gray-700'}`}>
            สร้างตัวเลือกจากสมการ
          </p>
          <p className={`text-xs mt-0.5 ${mode === 'auto' ? 'text-purple-700' : 'text-gray-400'}`}>
            คำนวณจากสูตร สร้างตัวเลือกผิดอัตโนมัติ
          </p>
        </div>
      </button>
    </div>
  )
}

function McqManualForm({ allTags, mode = 'create', question, isOwner = true }: { allTags: string[]; mode?: 'create' | 'edit'; question?: Question; isOwner?: boolean }) {
  const router = useRouter()
  const returnTo = useSearchParams().get('tab') === 'team' ? '/questions?tab=team' : '/questions'
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

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
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const [options, setOptions] = useState<MCQOption[]>(
    question?.mcq_options ?? [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ]
  )
  const [showImageForOption, setShowImageForOption] = useState<Record<number, boolean>>({})
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('mcq')
    if (!seed) return
    setTitle(seed.title)
    setSubject(seed.subject ?? '')
    setDifficulty(seed.difficulty)
    setVisibility(seed.visibility)
    setTags(seed.tags ?? [])
    setQuestionText(seed.question_text)
    setImageUrls(seed.image_urls ?? [])
    setOptions(seed.mcq_options ?? [])
    setSolutionText(seed.solution_text ?? '')
  })

  function updateOption(i: number, field: keyof MCQOption, value: string | boolean | undefined) {
    setOptions(prev => prev.map((opt, idx) => idx === i ? { ...opt, [field]: value } : opt))
  }

  function toggleCorrect(i: number) {
    setOptions(prev => prev.map((opt, idx) => ({ ...opt, is_correct: idx === i ? !opt.is_correct : opt.is_correct })))
  }

  function addOption() {
    if (options.length >= 6) return
    setOptions(prev => [...prev, newOption()])
  }

  function removeOption(i: number) {
    if (options.length <= 2) return
    setOptions(prev => prev.filter((_, idx) => idx !== i))
    setShowImageForOption(prev => {
      const next = { ...prev }
      delete next[i]
      return next
    })
  }

  function toggleShowImage(i: number) {
    setShowImageForOption(prev => ({ ...prev, [i]: !prev[i] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (options.length < 2) { toast.error('ต้องมีตัวเลือกอย่างน้อย 2 ข้อ'); return }
    if (!options.some(o => o.is_correct)) { toast.error('เลือกตัวเลือกที่ถูกต้องอย่างน้อย 1 ข้อ'); return }
    const emptyOption = options.findIndex(o => !o.text.trim() && !o.image_url)
    if (emptyOption !== -1) {
      toast.error(`กรอกตัวเลือก ${OPTION_LABELS[emptyOption]} ด้วย`)
      return
    }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'mcq' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: options,
      solution_text: solutionText, tags, image_urls: imageUrls,
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
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เนื้อหาโจทย์</h2>
        <div className="space-y-1.5">
          <Label>โจทย์ *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..."
            rows={5}
          />
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบโจทย์</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-gray-900">ตัวเลือก</h2>
          <p className="text-xs text-gray-500">กาถูกที่ตัวเลือกที่ถูกต้อง (เลือกได้มากกว่า 1)</p>
        </div>

        <div className="space-y-3">
          {options.map((opt, i) => (
            <div key={i} className="border rounded-xl p-3 space-y-2 bg-gray-50">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={opt.is_correct}
                  onChange={() => toggleCorrect(i)}
                  className="w-4 h-4 rounded text-blue-600 flex-shrink-0"
                  title="คำตอบที่ถูกต้อง"
                />
                <span className="text-sm font-semibold text-gray-600 w-5 flex-shrink-0">
                  {OPTION_LABELS[i]}
                </span>
                <div className="flex-1">
                  <SpecialCharInput
                    value={opt.text}
                    onChange={(v) => updateOption(i, 'text', v)}
                    placeholder={`ตัวเลือก ${OPTION_LABELS[i]}`}
                    className={opt.is_correct ? 'border-green-400 bg-green-50' : ''}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => toggleShowImage(i)}
                  className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showImageForOption[i] || opt.image_url ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                  title="เพิ่มรูปภาพในตัวเลือก"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i)} className="flex-shrink-0 text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
                {opt.is_correct && (
                  <span className="flex-shrink-0 text-xs text-green-600 font-medium">✓ ถูก</span>
                )}
              </div>
              {(showImageForOption[i] || opt.image_url) && (
                <div className="pl-12">
                  <SingleImageUpload
                    value={opt.image_url}
                    onChange={(url) => updateOption(i, 'image_url', url)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {options.length < 6 && (
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="w-4 h-4 mr-1" />
            เพิ่มตัวเลือก ({options.length}/6)
          </Button>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยวิธีทำ (ไม่บังคับ)</h2>
        <Textarea
          value={solutionText}
          onChange={(e) => setSolutionText(e.target.value)}
          placeholder="อธิบายวิธีทำ..."
          rows={4}
        />
      </section>

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="mcq"
          mcqOptions={options}
          imageUrls={imageUrls}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'อัปเดตโจทย์' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(mode === 'edit' ? returnTo : '/questions/new')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>

      {showWhiteboard && (
        <WhiteboardModal
          onSave={(url) => { setImageUrls(prev => [...prev, url]); setShowWhiteboard(false) }}
          onClose={() => setShowWhiteboard(false)}
        />
      )}
    </form>
  )
}
