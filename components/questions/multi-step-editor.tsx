'use client'

import { useState, useEffect, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { VariableEditor } from '@/components/questions/variable-editor'
import { FormulaEditor } from '@/components/questions/formula-editor'
import { TeamShareChips } from '@/components/questions/general-info-section'
import { SolutionSection } from '@/components/questions/solution-section'
import { evaluateMultiStep } from '@/lib/math/evaluator'
import { saveQuestionGroup, deleteQuestionGroup } from '@/lib/actions/question-groups'
import { getMyTeamOrgOptions } from '@/lib/actions/team-org'
import type { SubQuestionData, QuestionGroupPayload } from '@/lib/actions/question-groups'
import type { Variable, Difficulty, Visibility, QuestionCategory, FormulaPreset } from '@/lib/types'

interface MultiStepEditorProps {
  mode: 'create' | 'edit'
  categories: QuestionCategory[]
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  // Edit mode initial data
  groupId?: string
  parentId?: string
  initialTitle?: string
  initialContext?: string
  initialCategoryId?: string
  initialVisibility?: Visibility
  initialOrgId?: string | null
  initialSharedOrgIds?: string[]
  initialTeamEditAllowed?: boolean
  initialDifficulty?: Difficulty
  initialSubQuestions?: SubQuestionData[]
  isOwner?: boolean
}

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'ง่าย' },
  { value: 'medium', label: 'ปานกลาง' },
  { value: 'hard', label: 'ยาก' },
  { value: 'analytical', label: 'วิเคราะห์' },
]

function emptySubQuestion(): SubQuestionData {
  return {
    question_text: '',
    difficulty: 'medium',
    variables: [],
    answer_formula: '',
    answer_unit: '',
    answer_tolerance: 0.05,
    solution_text: '',
    solution_image_urls: [],
  }
}

export function MultiStepEditor({
  mode,
  categories,
  presets,
  groupId,
  parentId,
  initialTitle = '',
  initialContext = '',
  initialCategoryId = '',
  initialVisibility = 'private',
  initialOrgId = null,
  initialSharedOrgIds = [],
  initialTeamEditAllowed = true,
  initialDifficulty = 'medium',
  initialSubQuestions,
  isOwner = true,
}: MultiStepEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initialTitle)
  const [context, setContext] = useState(initialContext)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility === 'school' ? 'organization' : initialVisibility)
  const [teamOrgId, setTeamOrgId] = useState<string | null>(initialOrgId)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(initialSharedOrgIds)
  const [teamEditAllowed, setTeamEditAllowed] = useState<boolean>(initialTeamEditAllowed)
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty)
  const [subQuestions, setSubQuestions] = useState<SubQuestionData[]>(
    initialSubQuestions && initialSubQuestions.length > 0
      ? initialSubQuestions
      : [emptySubQuestion()]
  )
  const [expandedIndex, setExpandedIndex] = useState(0)
  const [previewResults, setPreviewResults] = useState<Array<{ values: Record<string, number>; answer: number | string }> | null>(null)
  const [teamChecked, setTeamChecked] = useState(false)

  // teamOrgId can be left over from a *private* group — where it points at the
  // creator's personal workspace, not a real team. Only count it once it's confirmed
  // to be one of the user's actual teams, otherwise it silently inflates the count
  // shown at "การมองเห็น" without ever appearing as a selected chip.
  const isRealTeam = (id: string | null) => !!id && teams.some(t => t.id === id)
  const effectiveTeamOrgId = isRealTeam(teamOrgId) ? teamOrgId : null

  useEffect(() => {
    getMyTeamOrgOptions()
      .then((list) => {
        setTeams(list)
        if (list.length === 1 && !list.some(t => t.id === teamOrgId)) setTeamOrgId(list[0].id)
      })
      .finally(() => setTeamChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // effectiveTeamOrgId + sharedOrgIds together form "every team this group is
  // shared to" — effectiveTeamOrgId is just an implementation detail (the "home"
  // row), invisible to the user.
  const allSelectedTeamIds = effectiveTeamOrgId ? [effectiveTeamOrgId, ...sharedOrgIds] : sharedOrgIds

  function toggleTeam(id: string) {
    const isSelected = allSelectedTeamIds.includes(id)
    if (isSelected) {
      if (allSelectedTeamIds.length <= 1) return // must keep at least one team while sharing to a team
      if (id === effectiveTeamOrgId) {
        const [nextPrimary, ...rest] = sharedOrgIds
        setTeamOrgId(nextPrimary ?? null)
        setSharedOrgIds(rest)
      } else {
        setSharedOrgIds((prev) => prev.filter((x) => x !== id))
      }
    } else if (!effectiveTeamOrgId) {
      setTeamOrgId(id) // replaces a stale (non-team) teamOrgId, if any
    } else {
      setSharedOrgIds((prev) => [...prev, id])
    }
  }

  function updateSubQuestion(index: number, patch: Partial<SubQuestionData>) {
    setSubQuestions((prev) => prev.map((sq, i) => i === index ? { ...sq, ...patch } : sq))
    setPreviewResults(null)
  }

  function addSubQuestion() {
    setSubQuestions((prev) => [...prev, emptySubQuestion()])
    setExpandedIndex(subQuestions.length)
    setPreviewResults(null)
  }

  function removeSubQuestion(index: number) {
    if (subQuestions.length <= 1) { toast.error('ต้องมีอย่างน้อย 1 ข้อย่อย'); return }
    setSubQuestions((prev) => prev.filter((_, i) => i !== index))
    setExpandedIndex((prev) => Math.min(prev, subQuestions.length - 2))
    setPreviewResults(null)
  }

  function moveSubQuestion(index: number, dir: 'up' | 'down') {
    const next = dir === 'up' ? index - 1 : index + 1
    if (next < 0 || next >= subQuestions.length) return
    setSubQuestions((prev) => {
      const arr = [...prev]
      ;[arr[index], arr[next]] = [arr[next], arr[index]]
      return arr
    })
    setExpandedIndex(next)
    setPreviewResults(null)
  }

  function handlePreview() {
    const results = evaluateMultiStep(
      subQuestions.map((sq) => ({ variables: sq.variables, answer_formula: sq.answer_formula }))
    )
    setPreviewResults(results)
  }

  function handleSave() {
    if (!title.trim()) { toast.error('กรอกชื่อชุดโจทย์'); return }
    if (!context.trim()) { toast.error('กรอกโจทย์ส่วนกลาง'); return }
    for (let i = 0; i < subQuestions.length; i++) {
      if (!subQuestions[i].question_text.trim()) {
        toast.error(`ข้อย่อยที่ ${i + 1}: กรอกคำถาม`)
        setExpandedIndex(i)
        return
      }
      if (!subQuestions[i].answer_formula.trim()) {
        toast.error(`ข้อย่อยที่ ${i + 1}: กรอกสูตรคำตอบ`)
        setExpandedIndex(i)
        return
      }
    }

    const payload: QuestionGroupPayload = {
      parentId,
      groupId,
      title: title.trim(),
      context: context.trim(),
      category_id: categoryId,
      visibility,
      org_id: teamOrgId,
      shared_org_ids: sharedOrgIds,
      team_edit_allowed: teamEditAllowed,
      difficulty,
      subQuestions,
    }

    startTransition(async () => {
      try {
        await saveQuestionGroup(payload)
      } catch (e: any) {
        if (!e?.message?.includes('NEXT_REDIRECT')) {
          toast.error(e?.message ?? 'เกิดข้อผิดพลาด')
        }
      }
    })
  }

  function handleDelete() {
    if (!groupId) return
    if (!confirm('ลบชุดโจทย์นี้ทั้งหมด?')) return
    startTransition(async () => {
      const res = await deleteQuestionGroup(groupId)
      if (res?.error) toast.error(res.error)
      else { toast.success('ลบแล้ว'); router.push('/questions') }
    })
  }

  const parentCategories = categories.filter((c) => !c.parent_id)
  const childCategories = (parentId_: string) => categories.filter((c) => c.parent_id === parentId_)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Group header */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground">ข้อมูลชุดโจทย์</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>ชื่อชุดโจทย์ *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น โจทย์ฟิสิกส์: การเคลื่อนที่แบบโปรเจกไทล์"
            />
          </div>

          <div className="space-y-1.5">
            <Label>ระดับความยาก</Label>
            <Select value={difficulty} onValueChange={(v) => v !== null && setDifficulty(v as Difficulty)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>การมองเห็น</Label>
            <Select
              value={visibility === 'school' ? 'organization' : visibility}
              disabled={!isOwner}
              onValueChange={(v) => {
                if (v === null) return
                setVisibility(v as Visibility)
                if (v === 'private') {
                  setTeamOrgId(null)
                  setSharedOrgIds([])
                } else if (teams.length === 1) {
                  setTeamOrgId(teams[0].id)
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">ส่วนตัว</SelectItem>
                <SelectItem value="organization" disabled={teamChecked && teams.length === 0}>
                  ทีมของฉัน{teams.length === 1 ? ` (${teams[0].name})` : ''}
                </SelectItem>
              </SelectContent>
            </Select>
            {teamChecked && teams.length === 0 && (
              <p className="text-xs text-muted-foreground">
                สร้างทีมก่อนเพื่อใช้งาน —{' '}
                <a href="/settings/team" className="text-primary hover:underline">ไปที่หน้าทีมของฉัน</a>
              </p>
            )}
            {visibility === 'organization' && teams.length > 1 && (
              <TeamShareChips
                label="แชร์ให้ทีมไหน (เลือกได้หลายทีม)"
                teams={teams}
                selectedIds={allSelectedTeamIds}
                onToggle={toggleTeam}
                disabled={!isOwner}
              />
            )}
            {visibility === 'organization' && (
              <div className="flex items-center gap-2 pt-2">
                <ToggleSwitch checked={teamEditAllowed} onChange={setTeamEditAllowed} disabled={!isOwner} />
                <span className="text-xs text-muted-foreground">อนุญาตให้เพื่อนในทีมแก้ไขชุดโจทย์นี้ได้</span>
              </div>
            )}
          </div>

          {parentCategories.length > 0 && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label>หมวดหมู่</Label>
              <Select value={categoryId || ''} onValueChange={(v) => v !== null && setCategoryId(v)}>
                <SelectTrigger><SelectValue placeholder="— เลือกหมวดหมู่ —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ไม่ระบุ</SelectItem>
                  {parentCategories.flatMap((p) => [
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>,
                    ...childCategories(p.id).map((c) => (
                      <SelectItem key={c.id} value={c.id}>  ↳ {c.name}</SelectItem>
                    )),
                  ])}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="sm:col-span-2 space-y-1.5">
            <Label>โจทย์ส่วนกลาง / บริบทร่วม *</Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="เช่น วัตถุมวล m ถูกยิงขึ้นในแนวดิ่งด้วยความเร็วต้น v..."
              rows={4}
            />
          </div>
        </div>
      </div>

      {/* Sub-questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">ข้อย่อย ({subQuestions.length} ข้อ)</h2>
          <Button type="button" variant="outline" size="sm" onClick={addSubQuestion}>
            + เพิ่มข้อย่อย
          </Button>
        </div>

        {subQuestions.map((sq, index) => (
          <SubQuestionCard
            key={index}
            index={index}
            total={subQuestions.length}
            sq={sq}
            presets={presets}
            previewResult={previewResults?.[index] ?? null}
            isExpanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? -1 : index)}
            onChange={(patch) => updateSubQuestion(index, patch)}
            onRemove={() => removeSubQuestion(index)}
            onMove={(dir) => moveSubQuestion(index, dir)}
          />
        ))}
      </div>

      {/* Preview section */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">ดูตัวอย่างเฉลย</h2>
          <Button type="button" variant="outline" size="sm" onClick={handlePreview}>
            {previewResults ? '🔁 สุ่มชุดใหม่' : '👁 ดูเฉลย'}
          </Button>
        </div>

        {previewResults && (
          <div className="space-y-3">
            {previewResults.map((result, i) => (
              <div key={i} className="bg-muted rounded-lg p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">ข้อย่อยที่ {i + 1}</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {Object.entries(result.values).map(([name, val]) => (
                    <span key={name} className="text-xs bg-card border border-border px-2 py-1 rounded font-mono">
                      {name} = {val}
                    </span>
                  ))}
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">คำตอบ: </span>
                  <span className="font-semibold text-primary">
                    {typeof result.answer === 'number'
                      ? result.answer.toLocaleString('th-TH', { maximumSignificantDigits: 6 })
                      : result.answer}
                    {subQuestions[i].answer_unit ? ` ${subQuestions[i].answer_unit}` : ''}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-8">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'กำลังบันทึก...' : mode === 'create' ? 'สร้างชุดโจทย์' : 'บันทึกการแก้ไข'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/questions')}>
          ยกเลิก
        </Button>
        {mode === 'edit' && groupId && (
          <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending} className="ml-auto text-destructive hover:text-destructive/80 hover:bg-destructive/10">
            ลบชุดโจทย์นี้
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Sub-question card ────────────────────────────────────────────────────────

interface SubQuestionCardProps {
  index: number
  total: number
  sq: SubQuestionData
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  previewResult: { values: Record<string, number>; answer: number | string } | null
  isExpanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<SubQuestionData>) => void
  onRemove: () => void
  onMove: (dir: 'up' | 'down') => void
}

function SubQuestionCard({
  index,
  total,
  sq,
  presets,
  isExpanded,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: SubQuestionCardProps) {
  // Questions that can be referenced = previous sub-questions (orders 1..index)
  const availableReferences = Array.from({ length: index }, (_, i) => i + 1)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
        onClick={onToggle}
      >
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove('up') }}
            disabled={index === 0}
            className="text-muted-foreground hover:text-muted-foreground disabled:opacity-20 text-xs leading-none"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove('down') }}
            disabled={index === total - 1}
            className="text-muted-foreground hover:text-muted-foreground disabled:opacity-20 text-xs leading-none"
          >
            ▼
          </button>
        </div>

        <div className="w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {sq.question_text || <span className="text-muted-foreground italic">ยังไม่ได้กรอกคำถาม</span>}
          </p>
          {sq.answer_formula && (
            <p className="text-xs text-muted-foreground font-mono truncate">= {sq.answer_formula}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="text-xs text-destructive hover:text-destructive/80 px-2 py-1 hover:bg-destructive/10 rounded"
          >
            ลบ
          </button>
          <span className="text-muted-foreground text-sm">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Card body */}
      {isExpanded && (
        <div className="border-t border-border p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>คำถาม *</Label>
              <Textarea
                value={sq.question_text}
                onChange={(e) => onChange({ question_text: e.target.value })}
                placeholder="ถามอะไร? ใช้ {ชื่อตัวแปร} เพื่อแทรกค่าสุ่ม เช่น {m}"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>ระดับความยาก</Label>
              <Select value={sq.difficulty} onValueChange={(v) => v !== null && onChange({ difficulty: v as Difficulty })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>หน่วยคำตอบ</Label>
                <Input
                  value={sq.answer_unit}
                  onChange={(e) => onChange({ answer_unit: e.target.value })}
                  placeholder="m/s"
                />
              </div>
              <div className="space-y-1.5">
                <Label>ค่าเผื่อ (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sq.answer_tolerance}
                  onChange={(e) => onChange({ answer_tolerance: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ตัวแปร</Label>
            <VariableEditor
              variables={sq.variables}
              onChange={(vars) => onChange({ variables: vars })}
              availableReferences={availableReferences}
            />
          </div>

          <div className="space-y-1.5">
            <Label>สูตรคำตอบ *</Label>
            <FormulaEditor
              variables={sq.variables}
              value={sq.answer_formula}
              unit={sq.answer_unit}
              presets={presets}
              onChange={(formula) => onChange({ answer_formula: formula })}
            />
          </div>

          <SolutionSection
            text={sq.solution_text} onTextChange={(v) => onChange({ solution_text: v })}
            imageUrls={sq.solution_image_urls} onImageUrlsChange={(urls) => onChange({ solution_image_urls: urls })}
            label="เฉลย / แนวคิด (ไม่บังคับ)"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}
