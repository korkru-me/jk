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
import { SmartTagInput } from '@/components/ui/smart-tag-input'
import { TeamShareChips } from '@/components/questions/general-info-section'
import { QuestionPicker } from '@/components/assignments/question-picker'
import type { Question, QuestionSet, Visibility } from '@/lib/types'

interface Props {
  questions: Question[]
  allTags: string[]
  initialSet?: QuestionSet
}

export function CreateQuestionSetForm({ questions, allTags, initialSet }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initialSet?.title ?? '')
  const [description, setDescription] = useState(initialSet?.description ?? '')
  const [tags, setTags] = useState<string[]>(initialSet?.tags ?? [])
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSet?.question_ids ?? [])
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

  function toggleQ(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const canSave = title.trim().length > 0 && selectedIds.length > 0

  function handleSubmit() {
    startTransition(async () => {
      const payload = {
        title: title.trim(), description: description.trim(), question_ids: selectedIds, tags,
        visibility, org_id: teamOrgId, shared_org_ids: sharedOrgIds,
      }
      const res = initialSet
        ? await updateQuestionSet(initialSet.id, payload)
        : await createQuestionSet(payload)
      if (res?.error) { toast.error(res.error); return }
      if (!initialSet && 'id' in res) {
        toast.success('สร้างชุดโจทย์แล้ว')
        router.push('/questions/sets')
      }
    })
  }

  function handleDelete() {
    if (!initialSet) return
    if (!confirm(`ลบชุดโจทย์ "${initialSet.title}"? ไม่สามารถกู้คืนได้`)) return
    startTransition(async () => {
      const res = await deleteQuestionSet(initialSet.id)
      if (res?.error) { toast.error(res.error); return }
      router.push('/questions/sets')
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">ข้อมูลชุดโจทย์</h2>

        <div className="space-y-1.5">
          <Label htmlFor="set-title">ชื่อชุดโจทย์ <span className="text-red-500">*</span></Label>
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
          <Label>แท็ก</Label>
          <p className="text-xs text-gray-500">ใช้ค้นหา/กรองชุดโจทย์ในคลัง เช่น ฟิสิกส์ ม.4, กลศาสตร์</p>
          <SmartTagInput allTags={allTags} tags={tags} onTagsChange={setTags} />
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
              <SelectItem value="private">ส่วนตัว — แค่ฉันเห็นชุดโจทย์นี้</SelectItem>
              <SelectItem value="organization" disabled={teamChecked && !hasTeams}>
                ทีมของฉัน{teams.length === 1 ? ` (${teams[0].name})` : ''}
              </SelectItem>
            </SelectContent>
          </Select>
          {teamChecked && !hasTeams && (
            <p className="text-xs text-gray-500">
              สร้างทีมก่อนเพื่อใช้งาน —{' '}
              <a href="/settings/team" className="text-blue-600 hover:underline">
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
      </div>

      <QuestionPicker
        questions={questions}
        selectedIds={selectedIds}
        onToggle={toggleQ}
        search={search}
        onSearchChange={setSearch}
        diffFilter={diffFilter}
        onDiffFilterChange={setDiffFilter}
      />

      <div className="flex items-center justify-between pt-2">
        {initialSet ? (
          <Button type="button" variant="outline" onClick={handleDelete} disabled={isPending} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> ลบชุดโจทย์
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            ยกเลิก
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={isPending || !canSave} className="gap-2">
          <Save className="w-4 h-4" />
          {isPending ? 'กำลังบันทึก...' : initialSet ? 'บันทึกการแก้ไข' : 'สร้างชุดโจทย์'}
        </Button>
      </div>
    </div>
  )
}
