'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, X } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { SpecialCharInput } from './special-char-input'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion } from '@/lib/actions/questions'
import type { Difficulty, Visibility, AnswerPart } from '@/lib/types'

const PART_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']

interface FixedNumericFormProps {
  allTags: string[]
}

function newPart(): AnswerPart {
  return {
    id: Math.random().toString(36).slice(2),
    sub_text: '',
    formula: '',
    unit: '',
    tolerance: 0.05,
  }
}

export function FixedNumericForm({ allTags }: FixedNumericFormProps) {
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

  const [answerParts, setAnswerParts] = useState<AnswerPart[]>([newPart()])
  const [solutionText, setSolutionText] = useState('')

  function updatePart(i: number, field: keyof AnswerPart, value: string | number) {
    setAnswerParts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  function addPart() {
    if (answerParts.length >= 8) return
    setAnswerParts(prev => [...prev, newPart()])
  }

  function removePart(i: number) {
    setAnswerParts(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    const emptyIdx = answerParts.findIndex(p => !p.formula.trim())
    if (emptyIdx !== -1) {
      toast.error(answerParts.length > 1
        ? `กรอกคำตอบข้อย่อย ${PART_LABELS[emptyIdx]} ด้วย`
        : 'กรอกคำตอบด้วย')
      return
    }

    setSaving(true)
    const first = answerParts[0]
    const result = await createQuestion({
      title, subject, question_text: questionText, question_type: 'written',
      difficulty, visibility, category_id: '',
      grade_level: '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: answerParts,
      answer_formula: first.formula,
      answer_unit: first.unit,
      answer_tolerance: first.tolerance,
      mcq_options: [],
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
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลย</h2>
        <div className="space-y-3">
          {answerParts.map((part, i) => (
            <div key={part.id} className="border rounded-xl p-4 space-y-3 bg-gray-50">
              {answerParts.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">คำถามย่อย {PART_LABELS[i]}</span>
                  <button type="button" onClick={() => removePart(i)} className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {answerParts.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">คำอธิบายคำถามย่อย</Label>
                  <Input
                    value={part.sub_text}
                    onChange={(e) => updatePart(i, 'sub_text', e.target.value)}
                    placeholder="เช่น หาความเร่งของวัตถุ"
                  />
                </div>
              )}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">คำตอบที่ถูกต้อง *</Label>
                  <SpecialCharInput
                    value={part.formula}
                    onChange={(v) => updatePart(i, 'formula', v)}
                    placeholder="เช่น 9.8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">หน่วย</Label>
                  <SpecialCharInput
                    value={part.unit}
                    onChange={(v) => updatePart(i, 'unit', v)}
                    placeholder="เช่น m/s²"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">ความคลาดเคลื่อน (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Math.round(part.tolerance * 100 * 10) / 10}
                  onChange={(e) => updatePart(i, 'tolerance', parseFloat(e.target.value || '0') / 100)}
                  placeholder="5"
                  className="w-32"
                />
              </div>
            </div>
          ))}
          {answerParts.length < 8 && (
            <Button type="button" variant="outline" size="sm" onClick={addPart}>
              <Plus className="w-4 h-4 mr-1" />
              เพิ่มคำถามย่อย
            </Button>
          )}
          <p className="text-xs text-gray-400">ความคลาดเคลื่อน: ระบบจะถือว่าถูกเมื่อคำตอบนักเรียนอยู่ในช่วง ±ร้อยละที่กำหนด</p>
        </div>
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
          answerParts={answerParts}
          isRandom={false}
          questionType="written"
          imageUrls={imageUrls}
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
