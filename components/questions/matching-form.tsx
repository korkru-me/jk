'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, X, Image as ImageIcon } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import type { Difficulty, Visibility, MatchingPair, Question } from '@/lib/types'

interface PairState {
  id: string
  left_text: string
  right_text: string
  left_image?: string
  right_image?: string
  showLeftImage: boolean
  showRightImage: boolean
}

interface MatchingFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
}

function pairsFromQuestion(question?: Question): PairState[] | undefined {
  if (!question) return undefined
  const raw = (question.mcq_options ?? []) as unknown as MatchingPair[]
  return raw.map(p => ({
    id: Math.random().toString(36).slice(2),
    left_text: p.left_text, right_text: p.right_text,
    left_image: p.left_image, right_image: p.right_image,
    showLeftImage: false, showRightImage: false,
  }))
}

function newPair(): PairState {
  return {
    id: Math.random().toString(36).slice(2),
    left_text: '', right_text: '',
    showLeftImage: false, showRightImage: false,
  }
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

export function MatchingForm({ allTags, mode = 'create', question }: MatchingFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const [pairs, setPairs] = useState<PairState[]>(pairsFromQuestion(question) ?? [newPair(), newPair(), newPair()])
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('matching')
    if (!seed) return
    setTitle(seed.title)
    setSubject(seed.subject ?? '')
    setDifficulty(seed.difficulty)
    setVisibility(seed.visibility)
    setTags(seed.tags ?? [])
    setQuestionText(seed.question_text)
    setImageUrls(seed.image_urls ?? [])
    setSolutionText(seed.solution_text ?? '')

    const seedPairs = (seed.mcq_options ?? []) as unknown as MatchingPair[]
    setPairs(seedPairs.map(p => ({
      id: Math.random().toString(36).slice(2),
      left_text: p.left_text, right_text: p.right_text,
      left_image: p.left_image, right_image: p.right_image,
      showLeftImage: false, showRightImage: false,
    })))
  })

  function updatePair(i: number, field: keyof PairState, value: string | boolean | undefined) {
    setPairs(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  function addPair() {
    if (pairs.length >= 8) return
    setPairs(prev => [...prev, newPair()])
  }

  function removePair(i: number) {
    if (pairs.length <= 3) { toast.error('ต้องมีคู่จับคู่อย่างน้อย 3 คู่'); return }
    setPairs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    const emptyPair = pairs.findIndex(p => (!p.left_text.trim() && !p.left_image) || (!p.right_text.trim() && !p.right_image))
    if (emptyPair !== -1) {
      toast.error(`กรอกข้อมูลคู่ที่ ${emptyPair + 1} ให้ครบทั้งสองด้าน`)
      return
    }

    setSaving(true)
    const matchingPairs = pairs.map(({ left_text, right_text, left_image, right_image }) => ({
      left_text, right_text,
      ...(left_image ? { left_image } : {}),
      ...(right_image ? { right_image } : {}),
    }))

    const payload = {
      title, subject, question_text: questionText, question_type: 'matching' as const,
      difficulty, visibility, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      matching_pairs: matchingPairs,
      solution_text: solutionText, tags, image_urls: imageUrls,
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
            placeholder="เช่น จงจับคู่นักวิทยาศาสตร์กับผลงานของเขา"
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบโจทย์</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-gray-900">คู่จับคู่</h2>
          <p className="text-xs text-gray-500">อย่างน้อย 3 คู่ / สูงสุด 8 คู่</p>
        </div>

        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 gap-y-1 items-center text-sm font-medium text-gray-500 mb-1">
          <span />
          <span>รายการ (ซ้าย)</span>
          <span>คำตรงกัน (ขวา)</span>
          <span />
        </div>

        <div className="space-y-3">
          {pairs.map((pair, i) => (
            <div key={pair.id} className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 items-start">
                <span className="text-sm font-semibold text-gray-500 mt-2.5 w-6 text-center">{i + 1}</span>

                <div className="space-y-1.5">
                  <Input
                    value={pair.left_text}
                    onChange={(e) => updatePair(i, 'left_text', e.target.value)}
                    placeholder="รายการซ้าย"
                  />
                  <button
                    type="button"
                    onClick={() => updatePair(i, 'showLeftImage', !pair.showLeftImage)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${pair.showLeftImage || pair.left_image ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    {pair.left_image ? 'มีรูปภาพ' : 'เพิ่มรูปภาพ'}
                  </button>
                  {(pair.showLeftImage || pair.left_image) && (
                    <SingleImageUpload
                      value={pair.left_image}
                      onChange={(url) => updatePair(i, 'left_image', url)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Input
                    value={pair.right_text}
                    onChange={(e) => updatePair(i, 'right_text', e.target.value)}
                    placeholder="คำตรงกัน"
                  />
                  <button
                    type="button"
                    onClick={() => updatePair(i, 'showRightImage', !pair.showRightImage)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${pair.showRightImage || pair.right_image ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    {pair.right_image ? 'มีรูปภาพ' : 'เพิ่มรูปภาพ'}
                  </button>
                  {(pair.showRightImage || pair.right_image) && (
                    <SingleImageUpload
                      value={pair.right_image}
                      onChange={(url) => updatePair(i, 'right_image', url)}
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removePair(i)}
                  disabled={pairs.length <= 3}
                  className="mt-2 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {pairs.length < 8 && (
          <Button type="button" variant="outline" size="sm" onClick={addPair}>
            <Plus className="w-4 h-4 mr-1" />
            เพิ่มคู่ ({pairs.length}/8)
          </Button>
        )}
        <p className="text-xs text-gray-400">นักเรียนจะเห็นคอลัมน์ขวาถูกสลับลำดับแบบสุ่ม และต้องจับคู่ให้ถูกต้อง</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยวิธีทำ (ไม่บังคับ)</h2>
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
          questionType="matching"
          matchingPairs={pairs.map(({ left_text, right_text, left_image, right_image }) => ({
            left_text, right_text, left_image, right_image,
          }))}
          imageUrls={imageUrls}
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'อัปเดตโจทย์' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(mode === 'edit' ? '/questions' : '/questions/new')} disabled={saving}>
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
