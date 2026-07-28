'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, X, ChevronUp, ChevronDown, Image as ImageIcon } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { QuestionPreview } from './question-preview'
import { WhiteboardModal } from './whiteboard-modal'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import type { Difficulty, Visibility, OrderingConfig, OrderingItem, Question } from '@/lib/types'

interface OrderingFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

function newItem(): OrderingItem {
  return { id: Math.random().toString(36).slice(2), text: '' }
}

function SingleImageUpload({ value, onChange }: { value?: string; onChange: (url?: string) => void }) {
  return (
    <QuestionImageUpload
      value={value ? [value] : []}
      onChange={(urls) => onChange(urls.length > 0 ? urls[urls.length - 1] : undefined)}
    />
  )
}

export function OrderingForm({ allTags, mode = 'create', question, isOwner = true }: OrderingFormProps) {
  const router = useRouter()
  const returnTo = useSearchParams().get('tab') === 'team' ? '/questions?tab=team' : '/questions'
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const existingConfig = question?.extra_data as OrderingConfig | undefined

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

  const [items, setItems] = useState<OrderingItem[]>(existingConfig?.items ?? [newItem(), newItem(), newItem()])
  const [showImageFor, setShowImageFor] = useState<Record<string, boolean>>({})
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('ordering')
    if (!seed) return
    setTitle(seed.title)
    setSubject(seed.subject ?? '')
    setDifficulty(seed.difficulty)
    setVisibility(seed.visibility)
    setTags(seed.tags ?? [])
    setQuestionText(seed.question_text)
    setImageUrls(seed.image_urls ?? [])
    setSolutionText(seed.solution_text ?? '')

    const config = (seed.extra_data ?? {}) as OrderingConfig
    setItems(config.items ?? [])
  })

  function updateItem(id: string, field: keyof OrderingItem, value: string | undefined) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
  }

  function addItem() {
    if (items.length >= 8) return
    setItems(prev => [...prev, newItem()])
  }

  function removeItem(id: string) {
    if (items.length <= 2) return
    setItems(prev => prev.filter(it => it.id !== id))
    setShowImageFor(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    setItems(prev => { const a = [...prev]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return a })
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return
    setItems(prev => { const a = [...prev]; [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; return a })
  }

  const orderingConfig: OrderingConfig = { items }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกคำสั่ง/บริบทด้วย'); return }
    if (items.length < 2) { toast.error('ต้องมีรายการอย่างน้อย 2 รายการ'); return }
    const emptyIdx = items.findIndex(it => !it.text.trim() && !it.image_url)
    if (emptyIdx !== -1) { toast.error(`กรอกข้อความรายการที่ ${emptyIdx + 1} ด้วย`); return }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'ordering' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: orderingConfig,
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
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">คำสั่ง / บริบท</h2>
        <div className="space-y-1.5">
          <Label>คำสั่ง *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="เช่น จงเรียงลำดับขั้นตอนการทดลองต่อไปนี้จากก่อนไปหลัง"
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label>รูปภาพประกอบ (ไม่บังคับ)</Label>
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} onOpenWhiteboard={() => setShowWhiteboard(true)} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-start justify-between border-b pb-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">รายการที่ต้องเรียง</h2>
            <p className="text-xs text-gray-500 mt-0.5">ลำดับด้านล่างคือลำดับที่ถูกต้อง นักเรียนจะเห็นรายการสลับแล้ว</p>
          </div>
          <span className="text-xs text-gray-400">{items.length}/8 รายการ</span>
        </div>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="border rounded-xl bg-gray-50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => moveDown(idx)} disabled={idx === items.length - 1}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <Input
                  value={item.text}
                  onChange={(e) => updateItem(item.id, 'text', e.target.value)}
                  placeholder={`รายการที่ ${idx + 1}`}
                  className="flex-1"
                />
                <button type="button" onClick={() => setShowImageFor(p => ({ ...p, [item.id]: !p[item.id] }))}
                  className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${
                    showImageFor[item.id] || item.image_url
                      ? 'border-blue-300 bg-blue-50 text-blue-600'
                      : 'border-gray-200 text-gray-400 hover:text-gray-600'
                  }`} title="เพิ่มรูปภาพ">
                  <ImageIcon className="w-4 h-4" />
                </button>
                {items.length > 2 && (
                  <button type="button" onClick={() => removeItem(item.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {(showImageFor[item.id] || item.image_url) && (
                <div className="pl-10">
                  <SingleImageUpload
                    value={item.image_url}
                    onChange={(url) => updateItem(item.id, 'image_url', url)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {items.length < 8 && (
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="w-4 h-4 mr-1" />
            เพิ่มรายการ ({items.length}/8)
          </Button>
        )}
        <p className="text-xs text-gray-400">คะแนนรวม: {items.length} คะแนน (รายการละ 1 คะแนน ตรวจอัตโนมัติ)</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900 border-b pb-2">เฉลยอ้างอิงสำหรับครู (ไม่บังคับ)</h2>
        <Textarea
          value={solutionText}
          onChange={(e) => setSolutionText(e.target.value)}
          placeholder="อธิบายเหตุผลของลำดับที่ถูกต้อง..."
          rows={3}
        />
      </section>

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="ordering"
          imageUrls={imageUrls}
          orderingConfig={orderingConfig}
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
