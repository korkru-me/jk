'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion } from '@/lib/actions/questions'
import type { Difficulty, Visibility, TrueFalseExplanationMode, TrueFalseConfig } from '@/lib/types'

interface TrueFalseFormProps {
  allTags: string[]
}

const EXPLANATION_MODES: { value: TrueFalseExplanationMode; label: string; desc: string }[] = [
  { value: 'none',       label: 'ไม่ต้องให้เหตุผล',               desc: 'นักเรียนแค่เลือกถูกหรือผิด' },
  { value: 'wrong_only', label: 'ให้เหตุผลเฉพาะกรณีตอบผิด',       desc: 'ครูตรวจเหตุผลด้วยมือ' },
  { value: 'always',     label: 'ให้เหตุผลทั้งถูกและผิด',          desc: 'ครูตรวจเหตุผลด้วยมือ' },
]

export function TrueFalseForm({ allTags }: TrueFalseFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [tags, setTags] = useState<string[]>([])

  const [questionText, setQuestionText] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const [correctAnswer, setCorrectAnswer] = useState<boolean>(true)
  const [explanationMode, setExplanationMode] = useState<TrueFalseExplanationMode>('none')
  const [scoreAnswer, setScoreAnswer] = useState(1)
  const [scoreExplanation, setScoreExplanation] = useState(1)
  const [solutionText, setSolutionText] = useState('')

  const trueFalseConfig: TrueFalseConfig = {
    correct_answer: correctAnswer,
    explanation_mode: explanationMode,
    score_answer: scoreAnswer,
    score_explanation: scoreExplanation,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาข้อความด้วย'); return }
    if (scoreAnswer <= 0) { toast.error('คะแนนส่วนถูก/ผิดต้องมากกว่า 0'); return }
    if (explanationMode !== 'none' && scoreExplanation <= 0) {
      toast.error('คะแนนส่วนเหตุผลต้องมากกว่า 0'); return
    }

    setSaving(true)
    const result = await createQuestion({
      title, subject, question_text: questionText, question_type: 'true_false',
      difficulty, visibility, category_id: '',
      grade_level: '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: trueFalseConfig,
      solution_text: solutionText, tags, image_urls: imageUrls,
    })

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
        tags={tags} onTagsChange={setTags}
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เนื้อหาข้อความ</h2>
        <p className="text-xs text-gray-500">พิมพ์ข้อความที่นักเรียนจะต้องตัดสินว่าถูกหรือผิด</p>
        <div className="space-y-1.5">
          <Label>ข้อความ *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="เช่น แสงเดินทางได้เร็วกว่าเสียงในอากาศ"
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">คำตอบ</h2>
        <p className="text-sm text-gray-600">ข้อความนี้ <strong>ถูกหรือผิด?</strong></p>
        <div className="flex gap-3">
          {[
            { val: true,  label: '✓ ถูก',  cls: 'border-green-500 bg-green-50 text-green-700' },
            { val: false, label: '✗ ผิด',  cls: 'border-red-500 bg-red-50 text-red-700' },
          ].map(({ val, label, cls }) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => setCorrectAnswer(val)}
              className={`flex-1 py-4 rounded-xl border-2 font-semibold text-lg transition-colors ${
                correctAnswer === val ? cls : 'border-gray-200 text-gray-400 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">เลือกว่าคำตอบที่ถูกต้องคืออะไร นักเรียนจะเห็นปุ่มทั้งสองปุ่มเสมอ</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">การให้เหตุผล</h2>
        <div className="space-y-2">
          {EXPLANATION_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                explanationMode === mode.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
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
                <p className="text-sm font-medium text-gray-800">{mode.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{mode.desc}</p>
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
              <span className="text-sm text-gray-500">คะแนน</span>
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
                <span className="text-sm text-gray-500">คะแนน (ครูตรวจเอง)</span>
              </div>
            </div>
          )}
        </div>

        {explanationMode !== 'none' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-xs text-amber-700">
              คะแนนรวม <strong>{scoreAnswer + scoreExplanation}</strong> คะแนน
              — ระบบตรวจถูก/ผิดอัตโนมัติ ({scoreAnswer} คะแนน)
              ส่วนเหตุผล ({scoreExplanation} คะแนน) ครูต้องตรวจและให้คะแนนเอง
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยอ้างอิงสำหรับครู (ไม่บังคับ)</h2>
        <Textarea
          value={solutionText}
          onChange={(e) => setSolutionText(e.target.value)}
          placeholder="อธิบายว่าทำไมถึงถูกหรือผิด..."
          rows={3}
        />
      </section>

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
          {saving ? 'กำลังบันทึก...' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/questions/new')} disabled={saving}>
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
