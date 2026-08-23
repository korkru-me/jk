'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2 } from 'lucide-react'
import { createQuestionSet, updateQuestionSet, deleteQuestionSet } from '@/lib/actions/question-sets'
import { getMyTeamOrgOptions } from '@/lib/actions/team-org'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { TeamShareChips } from '@/components/questions/general-info-section'
import { QuestionPicker } from '@/components/assignments/question-picker'
import { SetStructurePanel } from '@/components/questions/set-structure-panel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { normalizeSetSections, type QuestionSetSection } from '@/lib/question-set-sections'
import type { BankQuestion } from '@/lib/question-bank'
import type { QuestionSet, Visibility } from '@/lib/types'
import { Card } from '@/components/ui/card'

interface Props {
  /** The whole คลัง, as the picker needs it — including `tags`, which it
   *  filters and searches on. */
  questions: BankQuestion[]
  initialSet?: QuestionSet
}

export function CreateQuestionSetForm({ questions, initialSet }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initialSet?.title ?? '')
  const [description, setDescription] = useState(initialSet?.description ?? '')
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSet?.question_ids ?? [])
  const [sections, setSections] = useState<QuestionSetSection[]>(initialSet?.sections ?? [])
  // The คลัง picker stages its changes: draftIds is what the teacher is
  // building, applied to the แฟ้ม only when they confirm. Unticking a question
  // by accident then has no effect until it is reviewed in the summary.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  const [visibility, setVisibility] = useState<Visibility>(initialSet?.visibility ?? 'private')
  const [teamOrgId, setTeamOrgId] = useState<string | null>(initialSet?.org_id ?? null)
  const [sharedOrgIds, setSharedOrgIds] = useState<string[]>(initialSet?.shared_org_ids ?? [])
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [teamChecked, setTeamChecked] = useState(false)

  useEffect(() => {
    getMyTeamOrgOptions()
      .then((list) => {
        setTeams(list)
        if (list.length === 1 && !list.some(t => t.id === teamOrgId)) setTeamOrgId(list[0].id)
      })
      .finally(() => setTeamChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // teamOrgId can be left over from a *private* set — where it points at the
  // creator's personal workspace, not a real team. Only count it once it's
  // confirmed to be one of the user's actual teams.
  const isRealTeam = (id: string | null) => !!id && teams.some(t => t.id === id)
  const effectiveTeamOrgId = isRealTeam(teamOrgId) ? teamOrgId : null
  const hasTeams = teams.length > 0
  const selectedTeamName = teams.find(t => t.id === effectiveTeamOrgId)?.name ?? null
  const allSelectedTeamIds = effectiveTeamOrgId ? [effectiveTeamOrgId, ...sharedOrgIds] : sharedOrgIds

  function toggleTeam(id: string) {
    const isSelected = allSelectedTeamIds.includes(id)
    if (isSelected) {
      if (allSelectedTeamIds.length <= 1) return
      if (id === effectiveTeamOrgId) {
        const [nextPrimary, ...rest] = sharedOrgIds
        setTeamOrgId(nextPrimary ?? null)
        setSharedOrgIds(rest)
      } else {
        setSharedOrgIds(prev => prev.filter(x => x !== id))
      }
    } else if (!effectiveTeamOrgId) {
      setTeamOrgId(id)
    } else {
      setSharedOrgIds(prev => [...prev, id])
    }
  }

  function openPicker() {
    setDraftIds(selectedIds)
    setPickerOpen(true)
  }

  /** The คลัง picker only ever adds to the แฟ้ม. Filing a question into a
   *  แฟ้มย่อย is a separate step, in that แฟ้มย่อย's own dialog. */
  function toggleDraft(id: string) {
    setDraftIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]))
  }

  const pickerAdded = draftIds.filter(id => !selectedIds.includes(id))
  const pickerRemoved = selectedIds.filter(id => !draftIds.includes(id))

  function confirmPicker() {
    const next = normalizeSetSections(sections, draftIds)
    setSelectedIds(next.question_ids)
    setSections(next.sections)
    setPickerOpen(false)
    const parts = []
    if (pickerAdded.length) parts.push(`เพิ่ม ${pickerAdded.length} ข้อ`)
    if (pickerRemoved.length) parts.push(`เอาออก ${pickerRemoved.length} ข้อ`)
    if (parts.length) toast.success(`${parts.join(' · ')} แล้ว — อย่าลืมกดบันทึก`)
  }

  const canSave = title.trim().length > 0

  function handleSubmit() {
    startTransition(async () => {
      const payload = {
        title: title.trim(), description: description.trim(), question_ids: selectedIds,
        sections,
        visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds,
      }
      const res = initialSet
        ? await updateQuestionSet(initialSet.id, payload)
        : await createQuestionSet(payload)
      if ('error' in res) { toast.error(res.error); return }
      if (!initialSet && 'id' in res) {
        toast.success('สร้างแฟ้มโจทย์แล้ว')
        router.push('/questions/sets')
      }
    })
  }

  function handleDelete() {
    if (!initialSet) return
    startTransition(async () => {
      const res = await deleteQuestionSet(initialSet.id)
      if ('error' in res) { toast.error(res.error); return }
      router.push('/questions/sets')
    })
  }

  return (
    <div className="space-y-4">
      <Card padding="xl" className="space-y-4">
        <h2 className="font-semibold text-foreground">ข้อมูลแฟ้มโจทย์</h2>

        <div className="space-y-1.5">
          <Label htmlFor="set-title">ชื่อแฟ้มโจทย์ <span className="text-destructive">*</span></Label>
          <Input
            id="set-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="เช่น แบบฝึกหัด กฎการเคลื่อนที่ของนิวตัน"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="set-desc">คำอธิบาย</Label>
          <Textarea
            id="set-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label>การมองเห็น</Label>
          <Select
            value={visibility === 'school' ? 'organization' : visibility}
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
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกการมองเห็น">
                {visibility === 'organization' || visibility === 'school'
                  ? (allSelectedTeamIds.length > 1
                      ? `ทีมของฉัน (${allSelectedTeamIds.length} ทีม)`
                      : selectedTeamName ? `ทีมของฉัน (${selectedTeamName})` : 'ทีมของฉัน')
                  : 'ส่วนตัว'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">ส่วนตัว — แค่ฉันเห็นแฟ้มโจทย์นี้</SelectItem>
              <SelectItem value="organization" disabled={teamChecked && !hasTeams}>
                ทีมของฉัน{teams.length === 1 ? ` (${teams[0].name})` : ''}
              </SelectItem>
            </SelectContent>
          </Select>
          {teamChecked && !hasTeams && (
            <p className="text-xs text-muted-foreground">
              สร้างทีมก่อนเพื่อใช้งาน —{' '}
              <a href="/settings/team" className="text-primary hover:underline">
                ไปที่หน้าทีมของฉัน
              </a>
            </p>
          )}
          {visibility === 'organization' && teams.length > 1 && (
            <TeamShareChips
              label="แชร์ให้ทีมไหน (เลือกได้หลายทีม)"
              teams={teams}
              selectedIds={allSelectedTeamIds}
              onToggle={toggleTeam}
            />
          )}
        </div>
      </Card>

      <SetStructurePanel
        questions={questions}
        questionIds={selectedIds}
        sections={sections}
        onChange={next => { setSelectedIds(next.questionIds); setSections(next.sections) }}
        onAddQuestions={openPicker}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>เพิ่มโจทย์จากคลัง</DialogTitle>
            <DialogDescription>
              ติ๊กเพื่อเลือก แล้วกดยืนยันด้านล่าง — ยังไม่มีอะไรเปลี่ยนจนกว่าจะกดยืนยัน
            </DialogDescription>
          </DialogHeader>

          <QuestionPicker
            questions={questions}
            selectedIds={draftIds}
            baselineIds={selectedIds}
            onToggle={toggleDraft}
            search={search}
            onSearchChange={setSearch}
            diffFilter={diffFilter}
            onDiffFilterChange={setDiffFilter}
            showSelectedFooter={false}
            showHeader={false}
            surface="plain"
          />

          <DialogFooter className="sm:items-center sm:justify-between">
            <span className="text-sm">
              {pickerAdded.length === 0 && pickerRemoved.length === 0 ? (
                <span className="text-muted-foreground">ในแฟ้มนี้มี {selectedIds.length} ข้อ</span>
              ) : (
                <span className="flex items-center gap-2 flex-wrap">
                  {pickerAdded.length > 0 && (
                    <span className="text-success font-medium">+ เพิ่ม {pickerAdded.length} ข้อ</span>
                  )}
                  {pickerRemoved.length > 0 && (
                    <span className="text-destructive font-medium">− เอาออก {pickerRemoved.length} ข้อ</span>
                  )}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>ยกเลิก</DialogClose>
              <Button
                type="button"
                onClick={confirmPicker}
                disabled={pickerAdded.length === 0 && pickerRemoved.length === 0}
              >
                ยืนยันการเปลี่ยนแปลง
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {initialSet && (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`ลบแฟ้มโจทย์ “${initialSet.title}”?`}
          description={
            <span className="space-y-2 block">
              <span className="block">แฟ้มนี้จะถูกลบถาวร กู้คืนไม่ได้</span>
              <span className="block">
                โจทย์ {selectedIds.length} ข้อข้างในยังอยู่ในคลังโจทย์ และงานที่มอบหมายไปแล้วจากแฟ้มนี้ไม่ได้รับผลกระทบ
              </span>
            </span>
          }
          confirmLabel="ลบถาวร"
          variant="destructive"
          onConfirm={handleDelete}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        {initialSet ? (
          <Button type="button" variant="outline" onClick={() => setConfirmingDelete(true)} disabled={isPending} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" /> ลบแฟ้มโจทย์
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            ยกเลิก
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={isPending || !canSave} className="gap-2">
          <Save className="w-4 h-4" />
          {isPending ? 'กำลังบันทึก...' : initialSet ? 'บันทึกการแก้ไข' : 'สร้างแฟ้มโจทย์'}
        </Button>
      </div>
    </div>
  )
}
