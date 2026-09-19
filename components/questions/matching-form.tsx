'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { Plus, X, Image as ImageIcon } from 'lucide-react'

import { GeneralInfoSection } from './general-info-section'
import { QuestionImageUpload } from './question-image-upload'
import { SolutionSection } from './solution-section'
import { QuestionPreview } from './question-preview'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import type { Difficulty, Visibility, MatchingPair, MatchingAnswerMode, MatchingConfig, Question } from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'
import type { QuestionDraftHandoff } from '@/lib/question-draft-handoff'

interface PairState {
  id: string
  left_text: string
  right_text: string
  left_image?: string
  right_image?: string
  showLeftImage: boolean
  showRightImage: boolean
}

const ANSWER_MODES: Array<{ value: MatchingAnswerMode; label: string; desc: string }> = [
  {
    value: 'slots',
    label: 'จับคู่ (ลากมาวางในช่อง)',
    desc: 'คำตรงกันอยู่รวมกันด้านล่าง นักเรียนลากไปวางในช่องข้างรายการที่ตรงกัน',
  },
  {
    value: 'lines',
    label: 'โยงเส้น',
    desc: 'วางสองคอลัมน์คู่กัน นักเรียนกดค้างที่จุดแล้วลากเส้นไปเชื่อมกับคำตรงกัน',
  },
]

interface MatchingFormProps {
  allTags: string[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
  /** Present when the โจทย์ is being drafted rather than saved — the Word
   *  import mounts this form to edit a โจทย์ it has not written yet.
   *  See lib/question-draft-handoff.ts. */
  draft?: QuestionDraftHandoff
}

/**
 * Twelve, because a Thai worksheet's จับคู่ section is normally ten ข้อ — the
 * real files say "ข้อละ ๑ คะแนน รวม ๑๐ คะแนน" — and a cap of eight would turn
 * the commonest size into a โจทย์ that has to be split in two.
 */
const MAX_PAIRS = 12
const MIN_PAIRS = 3
/** Enough for the two or three a worksheet's second column usually runs over by. */
const MAX_DISTRACTORS = 6

/** A choice with no prompt, while it is being edited. */
interface DistractorState {
  id: string
  text: string
  image?: string
  showImage: boolean
}

function distractorsFromConfig(config?: MatchingConfig): DistractorState[] {
  return (config?.distractors ?? []).map(distractor => ({
    id: Math.random().toString(36).slice(2),
    text: distractor.text,
    image: distractor.image,
    showImage: false,
  }))
}

function newDistractor(): DistractorState {
  return { id: Math.random().toString(36).slice(2), text: '', showImage: false }
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

export function MatchingForm({ allTags, mode = 'create', question, isOwner = true, draft }: MatchingFormProps) {
  const router = useRouter()
  // Back to exactly the bank view the teacher edited from — search, filters, page and tab.
  const returnTo = questionsReturnTo(useSearchParams())
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
  // Which แฟ้ม the โจทย์ is filed into on save. Create only: the แฟ้ม holding an
  // existing โจทย์ are changed from the แฟ้ม itself, where it can also be taken
  // back out — a picker here could only ever add.
  const [setIds, setSetIds] = useState<string[]>([])
  // A แฟ้ม is chosen once for a whole imported file, not per โจทย์.
  const setPicker = mode === 'create' && !draft ? { setIds, onSetIdsChange: setSetIds } : {}

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])

  const [pairs, setPairs] = useState<PairState[]>(pairsFromQuestion(question) ?? [newPair(), newPair(), newPair()])
  // Presentation only. Both layouts produce the same answer and grade the
  // same way, so switching an existing โจทย์ over does not invalidate
  // answers students have already given.
  const [answerMode, setAnswerMode] = useState<MatchingAnswerMode>(
    (question?.extra_data as MatchingConfig | undefined)?.answer_mode === 'lines' ? 'lines' : 'slots'
  )
  // Choices that belong to no prompt. A worksheet nearly always has a few:
  // without them the last pair is answerable by elimination.
  const [distractors, setDistractors] = useState<DistractorState[]>(
    () => distractorsFromConfig(question?.extra_data as MatchingConfig | undefined),
  )
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])

  useEffect(() => {
    if (mode !== 'create' || question) return
    // A draft arrives with its own content; a duplicate seed would overwrite it.
    if (draft) return
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
    setSolutionImageUrls(seed.solution_image_urls ?? [])

    setAnswerMode((seed.extra_data as MatchingConfig | undefined)?.answer_mode === 'lines' ? 'lines' : 'slots')
    setDistractors(distractorsFromConfig(seed.extra_data as MatchingConfig | undefined))

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
    if (pairs.length >= MAX_PAIRS) return
    setPairs(prev => [...prev, newPair()])
  }

  function removePair(i: number) {
    if (pairs.length <= MIN_PAIRS) { toast.error(`ต้องมีคู่จับคู่อย่างน้อย ${MIN_PAIRS} คู่`); return }
    setPairs(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateDistractor(i: number, field: keyof DistractorState, value: string | boolean | undefined) {
    setDistractors(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  function addDistractor() {
    if (distractors.length >= MAX_DISTRACTORS) return
    setDistractors(prev => [...prev, newDistractor()])
  }

  function removeDistractor(i: number) {
    setDistractors(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    // วิชา is asked once for the whole file on the import screen.
    if (!draft && !subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    const plainText = questionText.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }
    const emptyPair = pairs.findIndex(p => (!p.left_text.trim() && !p.left_image) || (!p.right_text.trim() && !p.right_image))
    if (emptyPair !== -1) {
      toast.error(`กรอกข้อมูลคู่ที่ ${emptyPair + 1} ให้ครบทั้งสองด้าน`)
      return
    }

    const matchingPairs = pairs.map(({ left_text, right_text, left_image, right_image }) => ({
      left_text, right_text,
      ...(left_image ? { left_image } : {}),
      ...(right_image ? { right_image } : {}),
    }))
    // A row the teacher added and left blank is dropped rather than refused:
    // these are optional extras, and an empty one is a change of mind.
    const matchingDistractors = distractors
      .filter(distractor => distractor.text.trim() || distractor.image)
      .map(({ text, image }) => ({ text: text.trim(), ...(image ? { image } : {}) }))

    const payload = {
      title, subject, question_text: questionText, question_type: 'matching' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: false,
      variables: [], logic_rules: [],
      answer_parts: [],
      answer_formula: '', answer_unit: '', answer_tolerance: 0,
      mcq_options: [],
      matching_pairs: matchingPairs,
      extra_data: {
        answer_mode: answerMode,
        ...(matchingDistractors.length > 0 ? { distractors: matchingDistractors } : {}),
      } satisfies MatchingConfig,
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, set_ids: setIds, image_urls: imageUrls,
      redirect_to: returnTo,
    }

    // Draft mode hands the payload back instead of writing it.
    if (draft) { draft.onSubmit(payload); return }

    setSaving(true)
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
        showSharing={!draft}
        showSubject={!draft}
        tags={tags} onTagsChange={setTags}
        {...setPicker}
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">เนื้อหาโจทย์</h2>
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
          <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">วิธีตอบของนักเรียน</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ANSWER_MODES.map(option => {
            const active = answerMode === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setAnswerMode(option.value)}
                aria-pressed={active}
                className="w-full text-left"
              >
                <Card
                  radius="md"
                  padding="md"
                  interactive
                  className={`h-full ${active ? 'border-primary bg-primary/10' : ''}`}
                >
                  <p className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                    {option.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.desc}</p>
                </Card>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          เปลี่ยนได้ทีหลัง คำตอบและคะแนนของนักเรียนที่ทำไปแล้วไม่เปลี่ยนตาม เพราะทั้งสองแบบเก็บคำตอบเหมือนกัน
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold text-foreground">คู่จับคู่</h2>
          <p className="text-xs text-muted-foreground">อย่างน้อย {MIN_PAIRS} คู่ / สูงสุด {MAX_PAIRS} คู่</p>
        </div>

        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 gap-y-1 items-center text-sm font-medium text-muted-foreground mb-1">
          <span />
          <span>รายการ (ซ้าย)</span>
          <span>คำตรงกัน (ขวา)</span>
          <span />
        </div>

        <div className="space-y-3">
          {pairs.map((pair, i) => (
            <div key={pair.id} className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 items-start">
                <span className="text-sm font-semibold text-muted-foreground mt-2.5 w-6 text-center">{i + 1}</span>

                <div className="space-y-1.5">
                  <Input
                    value={pair.left_text}
                    onChange={(e) => updatePair(i, 'left_text', e.target.value)}
                    placeholder="รายการซ้าย"
                  />
                  <button
                    type="button"
                    onClick={() => updatePair(i, 'showLeftImage', !pair.showLeftImage)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${pair.showLeftImage || pair.left_image ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-muted-foreground'}`}
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
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${pair.showRightImage || pair.right_image ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-muted-foreground'}`}
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
                  disabled={pairs.length <= MIN_PAIRS}
                  className="mt-2 text-muted-foreground/40 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {pairs.length < MAX_PAIRS && (
          <Button type="button" variant="outline" size="sm" onClick={addPair}>
            <Plus className="w-4 h-4 mr-1" />
            เพิ่มคู่ ({pairs.length}/{MAX_PAIRS})
          </Button>
        )}
        <p className="text-xs text-muted-foreground">นักเรียนจะเห็นคอลัมน์ขวาถูกสลับลำดับแบบสุ่ม และต้องจับคู่ให้ถูกต้อง</p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">ตัวเลือกลวง (ไม่บังคับ)</h2>
            {/* Why a teacher would want these: without them the last pair is
                answerable by elimination, which is why printed worksheets put
                a couple of spare choices at the bottom of the second column. */}
            <p className="text-xs text-muted-foreground mt-0.5">
              ตัวเลือกที่ไม่มีคู่ นักเรียนเห็นปนอยู่ในคอลัมน์ขวา แต่ไม่ใช่คำตอบของข้อไหนเลย —
              ใส่ไว้กันไม่ให้ข้อสุดท้ายเดาได้จากการตัดตัวเลือกที่เหลือ
            </p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">สูงสุด {MAX_DISTRACTORS} ตัว</p>
        </div>

        {distractors.length > 0 && (
          <div className="space-y-3">
            {distractors.map((distractor, i) => (
              <div key={distractor.id} className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-start">
                <span className="text-sm font-semibold text-muted-foreground mt-2.5 w-6 text-center">
                  {pairs.length + i + 1}
                </span>
                <div className="space-y-1.5">
                  <Input
                    value={distractor.text}
                    onChange={(e) => updateDistractor(i, 'text', e.target.value)}
                    placeholder="ตัวเลือกที่ไม่มีคู่"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateDistractor(i, 'showImage', !distractor.showImage)}
                    aria-pressed={distractor.showImage || !!distractor.image}
                    className={distractor.showImage || distractor.image ? 'border-primary/20 bg-primary/10 text-primary' : ''}
                  >
                    <ImageIcon className="w-3 h-3" />
                    {distractor.image ? 'มีรูปภาพ' : 'เพิ่มรูปภาพ'}
                  </Button>
                  {(distractor.showImage || distractor.image) && (
                    <SingleImageUpload
                      value={distractor.image}
                      onChange={(url) => updateDistractor(i, 'image', url)}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDistractor(i)}
                  aria-label={`เอาตัวเลือกลวงที่ ${i + 1} ออก`}
                  className="mt-1 text-muted-foreground/60 hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {distractors.length < MAX_DISTRACTORS && (
          <Button type="button" variant="outline" size="sm" onClick={addDistractor}>
            <Plus className="w-4 h-4 mr-1" />
            เพิ่มตัวเลือกลวง ({distractors.length}/{MAX_DISTRACTORS})
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          คะแนนเต็มของข้อไม่เปลี่ยน ยังเท่ากับจำนวนคู่ — ตัวเลือกลวงไม่มีคะแนนของตัวเอง
        </p>
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
        placeholder="อธิบายเพิ่มเติม..."
        rows={3}
      />

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
          matchingConfig={{
            answer_mode: answerMode,
            distractors: distractors
              .filter(distractor => distractor.text.trim() || distractor.image)
              .map(({ text, image }) => ({ text: text.trim(), ...(image ? { image } : {}) })),
          }}
          imageUrls={imageUrls}
        />
        <Button type="submit" disabled={saving}>
          {draft ? draft.submitLabel : saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'อัปเดตโจทย์' : 'บันทึกโจทย์'}
        </Button>
        <Button type="button" variant="outline" onClick={() => draft ? draft.onCancel() : router.push(mode === 'edit' ? returnTo : '/questions/new')} disabled={saving}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
