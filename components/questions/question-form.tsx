'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VariableEditor } from './variable-editor'
import { FormulaEditor } from './formula-editor/index'
import { QuestionPreview } from './question-preview'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import type { Question, Variable, MCQOption, QuestionCategory, FormulaPreset } from '@/lib/types'

interface QuestionFormProps {
  question?: Question
  categories: QuestionCategory[]
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  mode: 'create' | 'edit'
}

export function QuestionForm({ question, categories, presets, mode }: QuestionFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Form state
  const [title, setTitle] = useState(question?.title ?? '')
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [questionType, setQuestionType] = useState<'written' | 'mcq'>(question?.question_type ?? 'written')
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState(question?.visibility ?? 'private')
  const [categoryId, setCategoryId] = useState(question?.category_id ?? '')
  const [isRandom, setIsRandom] = useState(question?.is_random ?? true)
  const [variables, setVariables] = useState<Variable[]>(question?.variables ?? [])
  const [answerFormula, setAnswerFormula] = useState(question?.answer_formula ?? '')
  const [answerUnit, setAnswerUnit] = useState(question?.answer_unit ?? '')
  const [answerTolerance, setAnswerTolerance] = useState(question?.answer_tolerance ?? 0.01)
  const [mcqOptions, setMcqOptions] = useState<MCQOption[]>(
    question?.mcq_options ?? [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ]
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!questionText.trim()) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (questionType === 'written' && !answerFormula.trim()) {
      toast.error('กรอกสูตรคำตอบด้วย')
      return
    }

    setSaving(true)
    const data = {
      title, question_text: questionText, question_type: questionType,
      difficulty: difficulty as any, visibility: visibility as any,
      category_id: categoryId, is_random: isRandom,
      variables, answer_formula: answerFormula,
      answer_unit: answerUnit, answer_tolerance: answerTolerance,
      mcq_options: mcqOptions, solution_text: solutionText,
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>หมวดหมู่</Label>
            <Select value={categoryId} onValueChange={(v) => v !== null && setCategoryId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกหมวด" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>ระดับความยาก</Label>
            <Select value={difficulty} onValueChange={(v) => v !== null && setDifficulty(v as typeof difficulty)}>
              <SelectTrigger>
                <SelectValue />
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">ส่วนตัว</SelectItem>
                <SelectItem value="school">โรงเรียน</SelectItem>
                <SelectItem value="public">สาธารณะ</SelectItem>
              </SelectContent>
            </Select>
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
          <Label htmlFor="question_text">โจทย์ *</Label>
          <Textarea
            id="question_text"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="วัตถุมวล {m} kg เคลื่อนที่บนพื้นราบ ได้รับแรง {F} N จงหาความเร่งของวัตถุ"
            rows={5}
            required
          />
          <p className="text-xs text-gray-500">
            ใช้ {'{'}ชื่อตัวแปร{'}'} เพื่อแทนค่าที่จะสุ่ม เช่น {'{'}m{'}'} → ค่าจะถูกสุ่มแทนที่
          </p>
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
          <VariableEditor variables={variables} onChange={setVariables} />
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
          <>
            <FormulaEditor
              variables={variables}
              value={answerFormula}
              unit={answerUnit}
              presets={presets}
              onChange={setAnswerFormula}
              onVariablesChange={setVariables}
              onUnitChange={setAnswerUnit}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="answer_unit">หน่วยของคำตอบ</Label>
                <Input
                  id="answer_unit"
                  value={answerUnit}
                  onChange={(e) => setAnswerUnit(e.target.value)}
                  placeholder="เช่น m/s², N, kg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="answer_tolerance">ค่าคลาดเคลื่อนที่ยอมรับ (%)</Label>
                <Input
                  id="answer_tolerance"
                  type="number"
                  min={0}
                  step={0.01}
                  value={answerTolerance}
                  onChange={(e) => setAnswerTolerance(Number(e.target.value))}
                />
              </div>
            </div>
          </>
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

      {/* Section 6: Preview */}
      <QuestionPreview
        questionText={questionText}
        variables={variables}
        answerFormula={answerFormula}
        answerUnit={answerUnit}
        isRandom={isRandom}
        questionType={questionType}
        mcqOptions={mcqOptions}
      />

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t">
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
    </form>
  )
}
