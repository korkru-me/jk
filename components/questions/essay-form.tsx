'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, X } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion } from '@/lib/actions/questions'
import type { Difficulty, Visibility } from '@/lib/types'

interface RubricItem {
  id: string
  criterion: string
  points: number
}

interface EssayFormProps {
  allTags: string[]
}

export function EssayForm({ allTags }: EssayFormProps) {
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

  const [solutionText, setSolutionText] = useState('')
  const [rubric, setRubric] = useState<RubricItem[]>([])

  function addRubricItem() {
    setRubric(prev => [...prev, { id: Math.random().toString(36).slice(2), criterion: '', points: 1 }])
  }

  function updateRubric(id: string, field: keyof RubricItem, value: string | number) {
    setRubric(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function removeRubric(id: string) {
    setRubric(prev => prev.filter(r => r.id !== id))
  }

  const totalPoints = rubric.reduce((sum, r) => sum + (r.points || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    if (rubric.some(r => !r.criterion.trim())) {
      toast.error('กรอกชื่อเกณฑ์การให้คะแนนให้ครบ')
      return
    }

    setSaving(true)
    const result = await createQuestion({
      title, subject, question_text: questionText, question_type: 'essay',
      difficulty, visibility, category_id: '',
      grade_level: '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      essay_rubric: rubric.length > 0
        ? rubric.map(r => ({ criterion: r.criterion, points: r.points }))
        : undefined,
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
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยอ้างอิงสำหรับครู (ไม่บังคับ)</h2>
        <p className="text-xs text-gray-500">นักเรียนจะไม่เห็นส่วนนี้ ใช้เป็นแนวทางตอนตรวจงาน</p>
        <RichTextEditor
          value={solutionText}
          onChange={setSolutionText}
          placeholder="เขียนแนวคำตอบหรือเกณฑ์การให้คะแนนโดยย่อ..."
          rows={4}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-gray-900">เกณฑ์การให้คะแนน (ไม่บังคับ)</h2>
          {rubric.length > 0 && (
            <span className="text-sm text-gray-500">รวม {totalPoints} คะแนน</span>
          )}
        </div>

        {rubric.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs font-medium text-gray-500 px-1">
              <span>เกณฑ์</span>
              <span className="w-20 text-center">คะแนน</span>
              <span className="w-6" />
            </div>
            {rubric.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                <Input
                  value={item.criterion}
                  onChange={(e) => updateRubric(item.id, 'criterion', e.target.value)}
                  placeholder="เช่น ระบุทิศทางของแรงถูกต้อง"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={item.points}
                  onChange={(e) => updateRubric(item.id, 'points', parseFloat(e.target.value) || 0)}
                  className="w-20 text-center"
                />
                <button type="button" onClick={() => removeRubric(item.id)} className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={addRubricItem}>
          <Plus className="w-4 h-4 mr-1" />
          เพิ่มเกณฑ์
        </Button>
        <p className="text-xs text-gray-400">ครูใช้เกณฑ์นี้เป็นแนวทางตอนตรวจงานด้วยมือ ระบบไม่ตรวจอัตโนมัติ</p>
      </section>

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="essay"
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
