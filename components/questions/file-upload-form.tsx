'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'

import { GeneralInfoSection } from './general-info-section'
import { QuestionFileUpload } from './question-file-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import type { Difficulty, Visibility, Question, FileUploadConfig } from '@/lib/types'

interface FileUploadFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

export function FileUploadForm({ allTags, mode = 'create', question, isOwner = true }: FileUploadFormProps) {
  const router = useRouter()
  const returnTo = useSearchParams().get('tab') === 'team' ? '/questions?tab=team' : '/questions'
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const existingConfig = question?.extra_data as FileUploadConfig | undefined

  const [title, setTitle] = useState(question?.title ?? '')
  const [subject, setSubject] = useState(question?.subject ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? 'medium')
  const [visibility, setVisibility] = useState<Visibility>(question?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(question?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(question?.shared_org_ids ?? [])
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(question?.team_edit_allowed ?? true)
  const [tags, setTags] = useState<string[]>(question?.tags ?? [])

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>(existingConfig?.attachment_urls ?? [])

  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('file_upload')
    if (!seed) return
    setTitle(seed.title)
    setSubject(seed.subject ?? '')
    setDifficulty(seed.difficulty)
    setVisibility(seed.visibility)
    setTags(seed.tags ?? [])
    setQuestionText(seed.question_text)
    setSolutionText(seed.solution_text ?? '')
    setSolutionImageUrls(seed.solution_image_urls ?? [])

    const config = (seed.extra_data ?? {}) as FileUploadConfig
    setAttachmentUrls(config.attachment_urls ?? [])
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกคำสั่งงานด้วย'); return }

    setSaving(true)
    const payload = {
      title, subject, question_text: questionText, question_type: 'file_upload' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      extra_data: { attachment_urls: attachmentUrls } as FileUploadConfig,
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, image_urls: [],
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
        <h2 className="text-base font-semibold text-foreground border-b pb-2">คำสั่งงาน</h2>
        <div className="space-y-1.5">
          <Label>คำสั่งงาน *</Label>
          <RichTextEditor
            ref={editorRef}
            value={questionText}
            onChange={setQuestionText}
            placeholder="พิมพ์คำสั่งงานที่นักเรียนต้องทำ เช่น ถ่ายรูปวิธีทำแล้วแนบไฟล์ส่งกลับมา..."
            rows={5}
          />
        </div>
        <div className="space-y-1.5">
          <Label>ไฟล์อ้างอิงประกอบโจทย์ (ไม่บังคับ)</Label>
          <p className="text-xs text-muted-foreground">เช่น ใบงาน สแกนโจทย์ หรือแผนภาพ — รองรับรูปภาพและ PDF</p>
          <QuestionFileUpload value={attachmentUrls} onChange={setAttachmentUrls} />
        </div>
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        label="หมายเหตุสำหรับครู (ไม่บังคับ)"
        description="นักเรียนจะไม่เห็นส่วนนี้ ใช้เป็นแนวทางตอนตรวจงานด้วยตา"
        placeholder="เช่น สิ่งที่ควรปรากฏในไฟล์ที่นักเรียนส่งมา..."
      />

      <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-xs text-primary">
        นักเรียนจะแนบไฟล์รูปภาพหรือ PDF เป็นคำตอบ ระบบให้คะแนนเต็มอัตโนมัติทันทีที่มีการแนบไฟล์อย่างน้อย 1 ไฟล์ — ไม่มีการตรวจเนื้อหาไฟล์ ครูสามารถเข้าไปดูไฟล์ที่ส่งได้จากหน้าผลการสอบของนักเรียน
      </div>

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={[]}
          answerParts={[]}
          isRandom={false}
          questionType="file_upload"
          attachmentUrls={attachmentUrls}
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
