'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X } from 'lucide-react'

import { VariableEditor } from './variable-editor'
import { AnswerPartsEditor } from './answer-parts-editor'
import { QuestionPreview } from './question-preview'
import { QuestionImageUpload } from './question-image-upload'
import { LogicRuleBuilder } from './logic-rule-builder'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import type { Question, Variable, LogicRule, MCQOption, AnswerPart, QuestionCategory, FormulaPreset } from '@/lib/types'

interface QuestionFormProps {
  question?: Question
  categories: QuestionCategory[]
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  mode: 'create' | 'edit'
}

const difficultyLabels: Record<string, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
  analytical: 'วิเคราะห์',
}

const visibilityLabels: Record<string, string> = {
  private: 'ส่วนตัว',
  school: 'โรงเรียน',
  public: 'สาธารณะ',
}

const gradeLevelLabels: Record<string, string> = {
  m1: 'มัธยมศึกษาปีที่ 1',
  m2: 'มัธยมศึกษาปีที่ 2',
  m3: 'มัธยมศึกษาปีที่ 3',
  m4: 'มัธยมศึกษาปีที่ 4',
  m5: 'มัธยมศึกษาปีที่ 5',
  m6: 'มัธยมศึกษาปีที่ 6',
}

const gradeTopics: Record<string, string[]> = {
  m1: [],
  m2: ['การเคลื่อนที่', 'แรงในชีวิตประจำวัน', 'แรงดันในของไหล', 'โมเมนต์ของแรง', 'แรงในธรรมชาติ', 'งานและกำลัง', 'เครื่องกลอย่างง่าย', 'พลังงานกล'],
  m3: ['ปริมาณทางไฟฟ้าและวงจรไฟฟ้า', 'พลังงานไฟฟ้าและชิ้นส่วนอิเล็กทรอนิกส์', 'คลื่นกล', 'คลื่นแม่เหล็กไฟฟ้า', 'การสะท้อนของแสง', 'การหักเหของแสง', 'การมองเห็นและทัศนอุปกรณ์'],
  m4: ['ธรรมชาติและพัฒนาการทางฟิสิกส์', 'การเคลื่อนที่แนวตรง', 'แรงและกฎการเคลื่อนที่', 'สมดุลกล', 'งานและพลังงาน', 'โมเมนตัมและการชน', 'การเคลื่อนที่แนวโค้ง'],
  m5: ['การเคลื่อนที่แบบฮาร์มอนิกอย่างง่าย', 'คลื่น', 'แสงเชิงคลื่น', 'แสงเชิงรังสี', 'เสียง', 'ไฟฟ้าสถิต', 'ไฟฟ้ากระแสตรง'],
  m6: ['แม่เหล็กและไฟฟ้า', 'ไฟฟ้ากระแสสลับ', 'ความร้อนและแก๊ส', 'ของแข็งและของไหล', 'ฟิสิกส์อะตอม', 'ฟิสิกส์นิวเคลียร์และอนุภาค'],
}

export function QuestionForm({ question, categories, presets, mode }: QuestionFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const questionEditorRef = useRef<RichTextEditorHandle>(null)

  // Form state
  const [title, setTitle] = useState(question?.title ?? '')
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const rawType = question?.question_type
  const [questionType, setQuestionType] = useState<'written' | 'mcq'>(
    rawType === 'mcq' ? 'mcq' : 'written'
  )
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState(question?.visibility ?? 'private')
  const [gradeLevel, setGradeLevel] = useState(question?.grade_level ?? '')
  const [showExtraCategories, setShowExtraCategories] = useState(false)
  const [extraGradeLevel, setExtraGradeLevel] = useState('')

  // category
  const parentCategories = categories.filter(c => c.parent_id === null)
  const initialParent = question?.category_id
    ? (categories.find(c => c.id === question.category_id)?.parent_id
        ? categories.find(c => c.id === question.category_id)!.parent_id!
        : question.category_id)
    : ''
  const [parentCategoryId, setParentCategoryId] = useState(initialParent)

  // tags
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])
  const [tagInput, setTagInput] = useState('')

  // null = ยังไม่เลือกระดับชั้น, [] = ม.1 (ไม่มีฟิสิกส์), [...] = มีหัวข้อ
  const gradeLevelTopics: string[] | null = gradeLevel ? (gradeTopics[gradeLevel] ?? []) : null
  const visibleParents = gradeLevelTopics === null
    ? parentCategories
    : parentCategories.filter(c => gradeLevelTopics.includes(c.name))
  const filteredExtraParents = extraGradeLevel
    ? parentCategories.filter(c => (gradeTopics[extraGradeLevel] ?? []).includes(c.name))
    : []

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }
  function removeTag(i: number) {
    setTags(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleGradeLevelChange(v: string) {
    setGradeLevel(v)
    setParentCategoryId('')
    setShowExtraCategories(false)
    setExtraGradeLevel('')
  }
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [isRandom, setIsRandom] = useState(question?.is_random ?? true)
  const [variables, setVariables] = useState<Variable[]>(question?.variables ?? [])
  const [logicRules, setLogicRules] = useState<LogicRule[]>((question as any)?.logic_rules ?? [])
  const [answerParts, setAnswerParts] = useState<AnswerPart[]>(() => {
    const existing = question?.answer_parts
    if (existing && existing.length > 0) {
      return existing.map(p => ({ ...p, id: p.id ?? Math.random().toString(36).slice(2) }))
    }
    return [{
      id: Math.random().toString(36).slice(2),
      sub_text: '',
      formula: question?.answer_formula ?? '',
      unit: question?.answer_unit ?? '',
      tolerance: question?.answer_tolerance ?? 0.1,
    }]
  })
  const [mcqOptions, setMcqOptions] = useState<MCQOption[]>(
    question?.mcq_options ?? [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ]
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (questionType === 'written') {
      const emptyPart = answerParts.findIndex(p => !p.formula.trim())
      if (emptyPart !== -1) {
        toast.error(answerParts.length > 1
          ? `กรอกสูตรคำตอบข้อย่อย ${['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ'][emptyPart] ?? emptyPart + 1} ด้วย`
          : 'กรอกสูตรคำตอบด้วย')
        return
      }
    }

    setSaving(true)
    const first = answerParts[0]

    const data = {
      title, question_text: questionText, question_type: questionType,
      difficulty: difficulty as any, visibility: visibility as any,
      category_id: parentCategoryId, grade_level: gradeLevel, is_random: isRandom,
      variables, logic_rules: logicRules,
      answer_parts: answerParts,
      answer_formula: first?.formula ?? '',
      answer_unit: first?.unit ?? '',
      answer_tolerance: first?.tolerance ?? 0.1,
      mcq_options: mcqOptions, solution_text: solutionText, tags,
      image_urls: imageUrls,
    }

    const result = mode === 'create'
      ? await createQuestion(data)
      : await updateQuestion(question!.id, data)

    if (result?.error) {
      toast.error(result.error)
      setSaving(false)
    }
  }

  function updateMcqOption(index: number, field: 'text' | 'is_correct', value: string | boolean) {
    setMcqOptions((prev) =>
      prev.map((opt, i) => {
        if (field === 'is_correct' && value === true) {
          return { ...opt, is_correct: i === index }
        }
        if (i !== index) return opt
        return { ...opt, [field]: value }
      })
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
      {/* Section 1: Basic info */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">ข้อมูลทั่วไป</h2>

        <div className="space-y-1.5">
          <Label htmlFor="title">ชื่อโจทย์ *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น วัตถุมวล m ได้รับแรง F หาความเร่ง"
            required
          />
        </div>

        {/* ระดับชั้น อยู่ก่อนหมวดหมู่ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>ระดับชั้น</Label>
            <Select value={gradeLevel} onValueChange={(v) => v !== null && handleGradeLevelChange(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกระดับชั้น">
                  {gradeLevelLabels[gradeLevel] ?? ''}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(gradeLevelLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>ระดับความยาก</Label>
            <Select value={difficulty} onValueChange={(v) => v !== null && setDifficulty(v as typeof difficulty)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกระดับ">
                  {difficultyLabels[difficulty] ?? ''}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">ง่าย</SelectItem>
                <SelectItem value="medium">ปานกลาง</SelectItem>
                <SelectItem value="hard">ยาก</SelectItem>
                <SelectItem value="analytical">วิเคราะห์</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>การมองเห็น</Label>
            <Select value={visibility} onValueChange={(v) => v !== null && setVisibility(v as typeof visibility)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกการมองเห็น">
                  {visibilityLabels[visibility] ?? ''}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">ส่วนตัว</SelectItem>
                <SelectItem value="school">โรงเรียน</SelectItem>
                <SelectItem value="public">สาธารณะ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* หมวดหมู่ filter ตามระดับชั้น */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>หมวดหมู่</Label>
            <Select
              value={parentCategoryId || undefined}
              onValueChange={(v) => setParentCategoryId(v ?? '')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกหมวดหมู่">
                  {parentCategories.find(c => c.id === parentCategoryId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {visibleParents.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                {showExtraCategories && filteredExtraParents.length > 0 && (
                  <>
                    <SelectSeparator />
                    {filteredExtraParents.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-gray-500">
                        {c.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {gradeLevelTopics !== null && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => { setShowExtraCategories(prev => !prev); setExtraGradeLevel('') }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  📚 {showExtraCategories ? 'ซ่อนหมวดหมู่จากระดับชั้นอื่น' : 'เพิ่มหมวดหมู่จากระดับชั้นอื่น'}
                </button>
                {showExtraCategories && (
                  <Select value={extraGradeLevel} onValueChange={(v) => setExtraGradeLevel(v ?? '')}>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue placeholder="เลือกระดับชั้น">
                        {gradeLevelLabels[extraGradeLevel] ?? ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(gradeLevelLabels)
                        .filter(([key]) => key !== gradeLevel && (gradeTopics[key]?.length ?? 0) > 0)
                        .map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>แท็ก</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="พิมพ์แท็ก แล้วกด Enter หรือ +"
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                    {tag}
                    <button type="button" onClick={() => removeTag(i)} className="hover:text-blue-600">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>ประเภทโจทย์</Label>
          <div className="flex gap-3">
            {[
              { value: 'written', label: '✏️ อัตนัย (คำนวณ)', desc: 'ระบบตรวจคะแนนอัตโนมัติ' },
              { value: 'mcq', label: '🔘 ปรนัย (เลือกตอบ)', desc: 'มีตัวเลือก 4 ข้อ' },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setQuestionType(t.value as any)}
                className={`flex-1 p-3 rounded-xl border-2 text-left transition-colors ${
                  questionType === t.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Question text */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เนื้อหาโจทย์</h2>

        <div className="space-y-1.5">
          <Label>โจทย์ *</Label>
          <RichTextEditor
            ref={questionEditorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="วัตถุมวล {m} kg เคลื่อนที่บนพื้นราบ ได้รับแรง {F} N จงหาความเร่งของวัตถุ"
            rows={5}
          />
        </div>

        <div className="space-y-1.5">
          <Label>รูปภาพประกอบโจทย์</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
        </div>
      </section>

      {/* Section 3: Randomization */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-gray-900">ตัวแปรสุ่ม</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRandom}
              onChange={(e) => setIsRandom(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-medium">เปิดใช้สุ่มตัวเลข</span>
          </label>
        </div>

        {isRandom ? (
          <>
            <VariableEditor
              variables={variables}
              onChange={setVariables}
              presets={presets}
              onInsertVariable={(name) => {
                questionEditorRef.current?.insertText(`{${name}}`)
              }}
            />

            {variables.filter(v => v.type !== 'reference').length > 1 && (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-medium text-gray-700">เงื่อนไขตัวแปร</p>
                <p className="text-xs text-gray-400">กำหนดเงื่อนไขระหว่างตัวแปร เช่น v &lt; u เพื่อให้ค่าสุ่มสมเหตุสมผล</p>
                <LogicRuleBuilder
                  rules={logicRules}
                  variables={variables}
                  onChange={setLogicRules}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 py-2">
            ปิดการสุ่มตัวเลข — นักเรียนทุกคนจะได้โจทย์เหมือนกัน
          </p>
        )}
      </section>

      {/* Section 4: Answer */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">
          {questionType === 'written' ? 'สูตรคำตอบ' : 'ตัวเลือก'}
        </h2>

        {questionType === 'written' ? (
          <AnswerPartsEditor
            parts={answerParts}
            variables={variables}
            presets={presets}
            onChange={setAnswerParts}
            onVariablesChange={setVariables}
          />
        ) : (
          <div className="space-y-3">
            {mcqOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correct_answer"
                  checked={opt.is_correct}
                  onChange={() => updateMcqOption(i, 'is_correct', true)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-500 w-4">
                  {['ก', 'ข', 'ค', 'ง'][i]}
                </span>
                <Input
                  value={opt.text}
                  onChange={(e) => updateMcqOption(i, 'text', e.target.value)}
                  placeholder={`ตัวเลือก ${['ก', 'ข', 'ค', 'ง'][i]}`}
                  className="flex-1"
                />
                {opt.is_correct && (
                  <span className="text-xs text-green-600 font-medium">✓ ถูก</span>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-500">คลิกวงกลมซ้ายเพื่อเลือกว่าข้อไหนถูก</p>
          </div>
        )}
      </section>

      {/* Section 5: Solution */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยวิธีทำ (ไม่บังคับ)</h2>
        <Textarea
          value={solutionText}
          onChange={(e) => setSolutionText(e.target.value)}
          placeholder="อธิบายวิธีทำ..."
          rows={4}
        />
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={variables}
          answerParts={answerParts}
          isRandom={isRandom}
          questionType={questionType}
          mcqOptions={mcqOptions}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : mode === 'create' ? 'บันทึกโจทย์' : 'อัปเดตโจทย์'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/questions')}
          disabled={saving}
        >
          ยกเลิก
        </Button>
      </div>

      {showWhiteboard && (
        <WhiteboardModal
          onSave={(url) => {
            setImageUrls(prev => [...prev, url])
            setShowWhiteboard(false)
          }}
          onClose={() => setShowWhiteboard(false)}
        />
      )}
    </form>
  )
}
