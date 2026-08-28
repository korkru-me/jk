'use client'

import { AddSubItemButton, AnswerPartCard, LabelStyleToggle } from '../answer-set-controls'
import { AnswerStepField } from './answer-step-field'
import { GeneralInfoSection } from '../general-info-section'
import { PresetEquationSelector } from './preset-equation-selector'
import { PythagoreanModePanel } from './pythagorean-mode-panel'
import { QuestionImageUpload } from '../question-image-upload'
import { QuestionPreview } from '../question-preview'
import { answerPartsFromQuestion, detectAnswerVar, equationTextFromQuestion, newPart } from './shared'
import { SolutionSection } from '../solution-section'
import { SubQuestionFromEquation } from './sub-question-from-equation'
import { TestRunPanel } from './test-run-panel'
import { TolerancePicker } from './tolerance-picker'
import { VarChip } from './var-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { createQuestion, updateQuestion } from '@/lib/actions/questions'
import { countAnswerBlanks, extractAnswerBlankNumbers, nextAnswerBlankNumber, numberedAnswerBlank } from '@/lib/answer-blank'
import { PART_LABEL_SETS } from '@/lib/part-labels'
import { readDuplicateSeed } from '@/lib/question-duplicate'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { CreationMode, PresetWithCat } from './shared'
import type { RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import type { PartLabelStyle } from '@/lib/part-labels'
import type { AnswerPart, Difficulty, LogicRule, PythagoreanGroup, Question, RandomQuestionConfig, Variable, Visibility } from '@/lib/types'
import { questionsReturnTo } from '@/lib/question-return'

// ─── Main Form ────────────────────────────────────────────────────────────────

interface RandomNumericFormProps {
  allTags: string[]
  presets: PresetWithCat[]
  mode?: 'create' | 'edit'
  question?: Question
  isOwner?: boolean
}

export function RandomNumericForm({ allTags, presets: initialPresets, mode = 'create', question, isOwner = true }: RandomNumericFormProps) {
  const router = useRouter()
  // Back to exactly the bank view the teacher edited from — search, filters, page and tab.
  const returnTo = questionsReturnTo(useSearchParams())
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const subTextEditorRef = useRef<RichTextEditorHandle>(null)

  const [creationMode, setCreationMode] = useState<CreationMode>(
    question ? (question.is_random ? 'from-equation' : 'fixed') : 'from-equation'
  )

  // Local copy so newly-saved formulas show up immediately without a page reload.
  const [presetList, setPresetList] = useState<PresetWithCat[]>(initialPresets)
  function addPreset(p: PresetWithCat) {
    setPresetList(prev => [...prev, p])
  }

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
  const setPicker = mode === 'create' ? { setIds, onSetIdsChange: setSetIds } : {}

  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(question?.image_urls ?? [])

  const [variables, setVariables] = useState<Variable[]>(question?.variables ?? [])
  const [logicRules, setLogicRules] = useState<LogicRule[]>(question?.logic_rules ?? [])

  const [answerParts, setAnswerParts] = useState<AnswerPart[]>(answerPartsFromQuestion(question))
  const existingConfig = question?.extra_data as RandomQuestionConfig | undefined
  const [labelStyle, setLabelStyle] = useState<PartLabelStyle>(existingConfig?.part_label_style ?? 'thai')
  const labels = PART_LABEL_SETS[labelStyle]
  const [globalTolerance, setGlobalTolerance] = useState(question?.answer_tolerance ?? 0.1)
  const [answerStep, setAnswerStep] = useState(existingConfig?.answer_step ?? 0)
  const [pythagoreanEnabled, setPythagoreanEnabled] = useState((existingConfig?.pythagorean_groups ?? []).length > 0)
  const [pythagoreanGroups, setPythagoreanGroups] = useState<PythagoreanGroup[]>(existingConfig?.pythagorean_groups ?? [])
  const [solutionText, setSolutionText] = useState(question?.solution_text ?? '')
  const [solutionImageUrls, setSolutionImageUrls] = useState<string[]>(question?.solution_image_urls ?? [])
  const [initialEquationText, setInitialEquationText] = useState<string | undefined>(() => equationTextFromQuestion(question))

  useEffect(() => {
    if (mode !== 'create' || question) return
    const seed = readDuplicateSeed('written')
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

    setCreationMode(seed.is_random ? 'from-equation' : 'fixed')
    setVariables(seed.variables ?? [])
    setLogicRules(seed.logic_rules ?? [])
    const seedParts = answerPartsFromQuestion(seed)
    setAnswerParts(seedParts)
    setGlobalTolerance(seed.answer_tolerance ?? 0.1)

    const equationText = equationTextFromQuestion(seed)
    if (equationText) {
      setInitialEquationText(equationText)
    }

    const config = (seed.extra_data ?? {}) as RandomQuestionConfig
    setLabelStyle(config.part_label_style ?? 'thai')
    setAnswerStep(config.answer_step ?? 0)
    setPythagoreanGroups(config.pythagorean_groups ?? [])
    setPythagoreanEnabled((config.pythagorean_groups ?? []).length > 0)
  })

  function updatePart(i: number, patch: Partial<AnswerPart>) {
    setAnswerParts(parts => parts.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  function addSubQuestion() {
    setAnswerParts(parts => [...parts, newPart()])
  }

  function removeSubQuestion(i: number) {
    setAnswerParts(parts => parts.filter((_, idx) => idx !== i))
  }

  // Fixed mode: the number of answer parts is driven entirely by how many
  // [คำตอบ N] blanks are in the main question text — keeps answerParts[0..count-1]
  // in sync (extending/truncating) every time that text changes.
  function syncMainAnswerParts(count: number) {
    setAnswerParts(prev => {
      const target = Math.max(count, 1)
      if (prev.length === target) return prev
      if (target > prev.length) return [...prev, ...Array.from({ length: target - prev.length }, newPart)]
      return prev.slice(0, target)
    })
  }

  function handleFixedQuestionTextChange(v: string) {
    setQuestionText(v)
    syncMainAnswerParts(countAnswerBlanks(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('กรอกชื่อโจทย์ด้วย'); return }
    if (!subject.trim()) { toast.error('กรุณาเลือกวิชา'); return }
    if (!questionText.replace(/<[^>]*>/g, '').trim()) { toast.error('กรอกเนื้อหาโจทย์ด้วย'); return }

    if (creationMode === 'from-equation') {
      if (!answerParts[0].formula.trim()) { toast.error('เลือกสมการก่อนบันทึก'); return }
      const badSub = answerParts.slice(1).findIndex(p => !p.formula.trim())
      if (badSub !== -1) {
        toast.error(`เลือกสมการสำหรับข้อย่อย ${labels[badSub + 1] ?? badSub + 2} ด้วย`)
        return
      }
      const emptySubTextIdx = answerParts.findIndex(p => !(p.sub_text ?? '').replace(/<[^>]*>/g, '').trim())
      if (emptySubTextIdx !== -1) {
        toast.error(answerParts.length > 1
          ? `กรอกรูปแบบคำถาม/ช่องคำตอบข้อย่อย ${labels[emptySubTextIdx] ?? emptySubTextIdx + 1} ด้วย`
          : 'กรอกรูปแบบคำถาม/ช่องคำตอบด้วย')
        return
      }
    } else {
      const mainBlankNumbers = extractAnswerBlankNumbers(questionText)
      if (mainBlankNumbers.length === 0) { toast.error('กดแทรกคำตอบในคำถามหลักอย่างน้อย 1 ตำแหน่งก่อนบันทึก'); return }
      const emptyIdx = answerParts.slice(0, mainBlankNumbers.length).findIndex(p => !p.formula.trim())
      if (emptyIdx !== -1) {
        toast.error(mainBlankNumbers.length > 1 ? `กรอกคำตอบที่ถูกต้อง ${mainBlankNumbers[emptyIdx]} ด้วย` : 'กรอกคำตอบที่ถูกต้องด้วย')
        return
      }
    }

    setSaving(true)
    const first = answerParts[0]
    // Apply global tolerance to all parts
    const partsWithTolerance = answerParts.map(p => ({ ...p, tolerance: globalTolerance }))

    const payload = {
      title, subject, question_text: questionText, question_type: 'written' as const,
      difficulty, visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds, team_edit_allowed: teamEditAllowed, category_id: question?.category_id ?? '',
      grade_level: question?.grade_level ?? '', is_random: creationMode !== 'fixed',
      variables, logic_rules: logicRules,
      answer_parts: partsWithTolerance,
      answer_formula: first.formula,
      // No editor writes `unit` any more — teachers type the unit into the answer
      // template instead ("ตอบ [คำตอบ] J"). It is still carried through so questions
      // saved with a unit keep showing it next to the answer box after an edit.
      answer_unit: first.unit,
      answer_tolerance: globalTolerance,
      mcq_options: [],
      extra_data: {
        answer_step: answerStep > 0 ? answerStep : undefined,
        pythagorean_groups: pythagoreanGroups.length > 0 ? pythagoreanGroups : undefined,
        part_label_style: labelStyle !== 'thai' ? labelStyle : undefined,
      },
      solution_text: solutionText, solution_image_urls: solutionImageUrls, tags, set_ids: setIds, image_urls: imageUrls,
      redirect_to: returnTo,
    }
    const result = mode === 'edit' && question
      ? await updateQuestion(question.id, payload)
      : await createQuestion(payload)

    if (result?.error) { toast.error(result.error); setSaving(false) }
  }

  const subParts = answerParts.slice(1)
  const answerVarName = detectAnswerVar(answerParts[0]?.equation_text ?? '') ?? variables.find(v => v.is_answer)?.name
  const inputVars = variables.filter(v => !v.is_answer)

  // Main answer content per mode — shown bare (no card chrome) when there are no
  // sub-questions yet, and wrapped in a labeled AnswerPartCard once one is added.
  const fromEquationMainContent = (
    <>
      {answerVarName && answerParts[0].formula && (
        <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-xl">
          <span className="font-mono font-bold text-success text-sm">{'{'}{answerVarName}{'}'}</span>
          <span className="text-success">=</span>
          <span className="font-mono text-success text-sm font-medium flex-1 truncate">{answerParts[0].formula}</span>
          <span className="text-[10px] text-success shrink-0">จากสมการที่เลือกด้านบน</span>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-sm">รูปแบบคำถาม / ช่องคำตอบ *</Label>
        <RichTextEditor
          ref={subTextEditorRef}
          value={answerParts[0].sub_text ?? ''}
          onChange={v => updatePart(0, { sub_text: v })}
          placeholder="เช่น  ใช้เวลาทั้งหมด [คำตอบ] วินาที"
          rows={1}
        />
        <Button
          type="button" variant="outline" size="sm"
          className="text-xs h-8"
          onClick={() => subTextEditorRef.current?.insertText('[คำตอบ]')}
        >
          + แทรก [คำตอบ]
        </Button>
        <p className="text-[11px] text-muted-foreground">ใช้ <code className="bg-muted px-1 rounded">[คำตอบ]</code> เพื่อระบุตำแหน่งช่องกรอกคำตอบของนักเรียน</p>
      </div>
    </>
  )

  const mainBlankNumbers = creationMode === 'fixed' ? extractAnswerBlankNumbers(questionText) : []

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">

      {/* Mode selection */}
      <div className="flex gap-3">
        {([
          { value: 'fixed' as const, label: 'กำหนดคำตอบด้วยตัวเอง', desc: 'ไม่มีสมการ ไม่มีการสุ่ม นักเรียนทุกคนได้โจทย์และคำตอบเดียวกัน' },
          { value: 'from-equation' as const, label: 'สร้างโจทย์สุ่มตัวเลขจากสมการ', desc: 'เลือกสมการสำเร็จรูป หรือพิมพ์สมการเอง ระบบคำนวณคำตอบให้อัตโนมัติ' },
        ]).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCreationMode(opt.value)}
            className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
              creationMode === opt.value
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-ring bg-card'
            }`}
          >
            <p className={`text-sm font-semibold ${creationMode === opt.value ? 'text-primary' : 'text-muted-foreground'}`}>
              {opt.label}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>

      {/* 1. ข้อมูลทั่วไป */}
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
        {...setPicker}
      />

      {creationMode === 'from-equation' ? (
        <>
          {/* 2. เลือกสมการ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground border-b pb-2">เลือกสมการ *</h2>
            <PresetEquationSelector
              presets={presetList}
              variables={variables}
              onVariablesChange={setVariables}
              onFormulaChange={formula => updatePart(0, { formula })}
              logicRules={logicRules}
              onLogicRulesChange={setLogicRules}
              onPresetCreated={addPreset}
              initialEquationText={initialEquationText}
              onEquationTextChange={text => updatePart(0, { equation_text: text })}
            />
          </section>

          {/* 3. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground border-b pb-2">สร้างโจทย์</h2>
            <div className="space-y-1.5">
              <Label>โจทย์ *</Label>
              <RichTextEditor
                ref={editorRef}
                value={questionText}
                onChange={setQuestionText}
                placeholder="วัตถุมวล {m} kg เคลื่อนที่บนพื้นราบ ได้รับแรง {F} N จงหาความเร่งของวัตถุ"
                rows={5}
              />
              {/* Variable insert chips — directly below the editor */}
              {inputVars.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    กดเพื่อแทรกตัวแปรในโจทย์
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {inputVars.map(v => (
                      <VarChip
                        key={v.name}
                        name={v.name}
                        active={false}
                        onClick={() => editorRef.current?.insertText(`{${v.name}}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>รูปภาพประกอบโจทย์</Label>
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
            </div>
          </section>

          {/* 4. ชุดคำตอบ */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-base font-semibold text-foreground">ชุดคำตอบ</h2>
              {subParts.length > 0 && <LabelStyleToggle value={labelStyle} onChange={setLabelStyle} />}
            </div>
            {subParts.length > 0
              ? <AnswerPartCard label={labels[0]} locked>{fromEquationMainContent}</AnswerPartCard>
              : fromEquationMainContent}
            {subParts.map((part, i) => (
              <SubQuestionFromEquation
                key={part.id}
                part={part}
                index={i}
                presets={presetList}
                mainVariables={variables}
                labels={labels}
                onChange={patch => updatePart(i + 1, patch)}
                onRemove={() => removeSubQuestion(i + 1)}
              />
            ))}
            <AddSubItemButton onClick={addSubQuestion} />
          </section>
        </>
      ) : (
        <>
          {/* 2. สร้างโจทย์ */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground border-b pb-2">สร้างโจทย์</h2>
            <div className="space-y-1.5">
              <Label>คำถามหลัก *</Label>
              <RichTextEditor
                ref={editorRef}
                value={questionText}
                onChange={handleFixedQuestionTextChange}
                placeholder="พิมพ์เนื้อหาโจทย์ที่นี่..."
                rows={5}
              />
              <Button
                type="button" variant="outline" size="sm"
                className="text-xs h-8"
                onClick={() => editorRef.current?.insertText(numberedAnswerBlank(nextAnswerBlankNumber(questionText)))}
              >
                + แทรกคำตอบ
              </Button>
              <p className="text-[11px] text-muted-foreground">แทรกได้หลายช่อง แต่ละช่องจะมีเลขกำกับ พร้อมช่อง &quot;คำตอบที่ถูกต้อง&quot; เลขเดียวกันโผล่ขึ้นด้านล่างให้กรอก</p>
            </div>
            <div className="space-y-1.5">
              <Label>รูปภาพประกอบโจทย์</Label>
              <QuestionImageUpload value={imageUrls} onChange={setImageUrls} />
            </div>
          </section>

          {/* 3. คำตอบที่ถูกต้อง — จำนวนช่องและเลขกำกับอิงตาม [คำตอบ N] ที่แทรกไว้ในคำถามหลัก */}
          {mainBlankNumbers.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground border-b pb-2">คำตอบที่ถูกต้อง</h2>
              {mainBlankNumbers.map((num, i) => (
                <div key={i} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">คำตอบที่ถูกต้อง {num} *</Label>
                  <Input
                    value={answerParts[i]?.formula ?? ''}
                    onChange={e => updatePart(i, { formula: e.target.value })}
                    placeholder="เช่น 9.8"
                  />
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* ตั้งค่าการสุ่ม */}
      {creationMode !== 'fixed' && (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">ตั้งค่าการสุ่ม</h2>

        <AnswerStepField value={answerStep} onChange={setAnswerStep} />

        <PythagoreanModePanel
          enabled={pythagoreanEnabled}
          onEnabledChange={setPythagoreanEnabled}
          groups={pythagoreanGroups}
          onGroupsChange={setPythagoreanGroups}
          availableVarNames={inputVars.map(v => v.name)}
        />

        <TestRunPanel
          variables={variables}
          logicRules={logicRules}
          formula={answerParts[0].formula}
          answerStep={answerStep}
          pythagoreanGroups={pythagoreanGroups}
        />
      </section>
      )}

      {/* ค่าคลาดเคลื่อน */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground border-b pb-2">ค่าคลาดเคลื่อนที่ยอมรับ</h2>
        <TolerancePicker value={globalTolerance} onChange={setGlobalTolerance} />
      </section>

      <SolutionSection
        text={solutionText} onTextChange={setSolutionText}
        imageUrls={solutionImageUrls} onImageUrlsChange={setSolutionImageUrls}
      />

      <div className="flex items-center gap-3 pt-2 border-t">
        <QuestionPreview
          questionText={questionText}
          variables={variables}
          answerParts={answerParts}
          isRandom={creationMode !== 'fixed'}
          questionType="written"
          imageUrls={imageUrls}
          partLabelStyle={labelStyle}
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
