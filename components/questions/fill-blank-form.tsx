'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion } from '@/lib/actions/questions'
import type { Difficulty, Visibility, FillBlankConfig, FillBlankItem } from '@/lib/types'

interface FillBlankFormProps {
  allTags: string[]
}

const BLANK_MARKER = '[___]'

function parseBlankCount(text: string): number {
  return (text.match(/\[___\]/g) ?? []).length
}

export function FillBlankForm({ allTags }: FillBlankFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [tags, setTags] = useState<string[]>([])

  const [questionText, setQuestionText] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const [gradingMode, setGradingMode] = useState<'manual' | 'auto'>('manual')
  const [blankAnswers, setBlankAnswers] = useState<Array<{ answer: string; case_sensitive: boolean }>>([])
  const [solutionText, setSolutionText] = useState('')

  const blankCount = parseBlankCount(questionText)

  // Sync blankAnswers length with blankCount
  function syncBlankAnswers(count: number) {
    setBlankAnswers(prev => {
      if (prev.length === count) return prev
      if (count > prev.length) {
        return [...prev, ...Array.from({ length: count - prev.length }, () => ({ answer: '', case_sensitive: false }))]
      }
      return prev.slice(0, count)
    })
  }

  function handleQuestionTextChange(val: string) {
    setQuestionText(val)
    syncBlankAnswers(parseBlankCount(val))
  }

  function insertBlank() {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const newText = questionText.slice(0, start) + BLANK_MARKER + questionText.slice(end)
    handleQuestionTextChange(newText)
    // restore cursor after the inserted blank
    setTimeout(() => {
      el.focus()
      const pos = start + BLANK_MARKER.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  function updateBlank(i: number, field: 'answer' | 'case_sensitive', value: string | boolean) {
    setBlankAnswers(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
  }

  const fillBlankConfig: FillBlankConfig = {
    grading_mode: gradingMode,
    blanks: blankAnswers.map((b, i): FillBlankItem => ({
      id: i + 1,
      answer: b.answer,
      case_sensitive: b.case_sensitive,
    })),
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!questionText.trim()) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (blankCount === 0) { toast.error('ต้องมีช่องกรอกอย่างน้อย 1 ช่อง (ใส่ [___] ในข้อความ)'); return }
    if (gradingMode === 'auto') {
      const emptyIdx = blankAnswers.findIndex(b => !b.answer.trim())
      if (emptyIdx !== -1) { toast.error(`กรอกคำตอบช่องที่ ${emptyIdx + 1} ด้วย`); return }
    }

    setSaving(true)
    const result = await createQuestion({
      title, subject, question_text: questionText, question_type: 'fill_blank',
      difficulty, visibility, category_id: '',
      grade_level: '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: fillBlankConfig,
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
          <Textarea
            ref={textareaRef}
            value={questionText}
            onChange={(e) => handleQuestionTextChange(e.target.value)}
            placeholder="พิมพ์ข้อความที่นี่ แล้วกดปุ่มแทรกช่องกรอก..."
            rows={5}
            className="font-mono text-sm"
          />
          {blankCount > 0 && (
            <p className="text-xs text-green-600 font-medium">พบช่องกรอก {blankCount} ช่อง</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
        </div>
      </section>

      {blankCount > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900 border-b pb-2">
            คำตอบสำหรับแต่ละช่อง
          </h2>

          {/* grading mode toggle */}
          <div className="space-y-1.5">
            <Label className="text-sm">วิธีตรวจคำตอบ</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGradingMode('manual')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  gradingMode === 'manual'
                    ? 'bg-orange-50 border-orange-400 text-orange-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                ครูตรวจเอง
              </button>
              <button
                type="button"
                onClick={() => setGradingMode('auto')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  gradingMode === 'auto'
                    ? 'bg-blue-50 border-blue-400 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                ตรวจอัตโนมัติ
              </button>
            </div>
            {gradingMode === 'manual' ? (
              <p className="text-xs text-orange-600">ครูดูคำตอบของนักเรียนแล้วให้คะแนนด้วยตัวเอง — เหมาะสำหรับภาษาที่ตอบได้หลายรูปแบบ</p>
            ) : (
              <p className="text-xs text-blue-600">ระบบเทียบคำตอบอัตโนมัติ — ต้องกรอกคำตอบที่ถูกต้องไว้อ้างอิง</p>
            )}
          </div>

          <div className="space-y-3">
            {Array.from({ length: blankCount }, (_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border bg-gray-50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center mt-1">
                  {i + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {gradingMode === 'auto' ? 'คำตอบที่ถูกต้อง *' : 'คำตอบอ้างอิง (ไม่บังคับ)'}
                    </Label>
                    <Input
                      value={blankAnswers[i]?.answer ?? ''}
                      onChange={(e) => updateBlank(i, 'answer', e.target.value)}
                      placeholder={gradingMode === 'auto' ? `คำตอบช่องที่ ${i + 1}` : `คำตอบตัวอย่าง (ถ้ามี)`}
                    />
                  </div>
                  {gradingMode === 'auto' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={blankAnswers[i]?.case_sensitive ?? false}
                        onChange={(e) => updateBlank(i, 'case_sensitive', e.target.checked)}
                        className="w-3.5 h-3.5 rounded"
                      />
                      <span className="text-xs text-gray-600">ตรวจสอบตัวพิมพ์เล็ก-ใหญ่ (Case-sensitive)</span>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {gradingMode === 'auto'
              ? `คะแนนรวม: ${blankCount} คะแนน (ช่องละ 1 คะแนน ตรวจอัตโนมัติ)`
              : `คะแนนรวม: ${blankCount} คะแนน (ครูให้คะแนนเอง)`}
          </p>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยอ้างอิงสำหรับครู (ไม่บังคับ)</h2>
        <Textarea
          value={solutionText}
          onChange={(e) => setSolutionText(e.target.value)}
          placeholder="อธิบายเพิ่มเติม..."
          rows={3}
        />
      </section>

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
