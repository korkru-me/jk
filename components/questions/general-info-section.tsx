'use client'

import { useEffect, useState } from 'react'
import { Check, Layers } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SmartTagInput } from '@/components/ui/smart-tag-input'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { getMyTeamOrgOptions } from '@/lib/actions/team-org'
import { getMyQuestionSetOptions, type QuestionSetOption } from '@/lib/actions/question-sets'
import { cn } from '@/lib/utils'
import type { Difficulty, Visibility } from '@/lib/types'
import { Card } from '@/components/ui/card'

const difficultyLabels: Record<string, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
  analytical: 'วิเคราะห์',
}

const visibilityLabels: Record<string, string> = {
  private: 'ส่วนตัว',
  organization: 'ทีมของฉัน',
  school: 'ทีมของฉัน', // legacy value, displayed the same as 'organization'
}

export const THAI_SUBJECTS = [
  'ฟิสิกส์',
  'เคมี',
  'ชีววิทยา',
  'วิทยาศาสตร์',
  'โลก ดาราศาสตร์ และอวกาศ',
  'คณิตศาสตร์',
  'คณิตศาสตร์เพิ่มเติม',
  'ภาษาไทย',
  'ภาษาอังกฤษ',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'ประวัติศาสตร์',
  'ภูมิศาสตร์',
  'เศรษฐศาสตร์',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'ดนตรี',
  'นาฏศิลป์',
  'การงานอาชีพ',
  'วิทยาการคำนวณ',
] as const

const RECENT_SUBJECTS_KEY = 'korkru_recent_subjects'
const MAX_RECENT_SUBJECTS = 20

function loadRecentSubjects(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_SUBJECTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecentSubject(subject: string) {
  if (typeof window === 'undefined') return
  const trimmed = subject.trim()
  if (!trimmed) return
  const existing = loadRecentSubjects().filter(s => s !== trimmed)
  const updated = [trimmed, ...existing].slice(0, MAX_RECENT_SUBJECTS)
  try {
    window.localStorage.setItem(RECENT_SUBJECTS_KEY, JSON.stringify(updated))
  } catch {
    // storage full or unavailable — skip silently
  }
}

// ─── SubjectAutocomplete ───────────────────────────────────────────────────────

export function SubjectAutocomplete({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  const [inputValue, setInputValue] = useState(value)
  const [open, setOpen] = useState(false)
  const [recentSubjects, setRecentSubjects] = useState<string[]>([])

  useEffect(() => { setRecentSubjects(loadRecentSubjects()) }, [])
  useEffect(() => { setInputValue(value) }, [value])

  const query = inputValue.trim().toLowerCase()
  const suggestions = Array.from(new Set([...recentSubjects, ...THAI_SUBJECTS]))
  const filtered = query
    ? suggestions.filter(s => s.toLowerCase().includes(query))
    : suggestions
  const showDropdown = open && filtered.length > 0

  function commit(v: string) {
    const trimmed = v.trim()
    setInputValue(trimmed)
    onChange(trimmed)
    if (trimmed) {
      saveRecentSubject(trimmed)
      setRecentSubjects(loadRecentSubjects())
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={e => { setInputValue(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => commit(inputValue), 150)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(inputValue) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="พิมพ์ชื่อวิชา เช่น ฟิสิกส์, เคมี"
        className="text-sm"
      />
      {showDropdown && (
        <Card radius="sm" elevation="lg" className="absolute z-50 top-full mt-1 w-full overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); commit(s) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {s}
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}

// ─── TeamShareChips ────────────────────────────────────────────────────────────
// Multi-select team picker — lets a question be shared to more than one team at once.

export function TeamShareChips({ label, teams, selectedIds, onToggle, disabled }: {
  label: string
  teams: { id: string; name: string }[]
  selectedIds: string[]
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  if (teams.length === 0) return null

  return (
    <div className="pt-1">
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {teams.map(t => {
          const selected = selectedIds.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(t.id)}
              aria-pressed={selected}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                disabled && 'opacity-50 cursor-not-allowed',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/20 hover:bg-primary/10'
              )}
            >
              {selected && <Check className="w-3 h-3" />}
              {t.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── QuestionSetPicker ─────────────────────────────────────────────────────────

/**
 * Above this many แฟ้ม the list gets a filter box. Roughly where `max-h-48`
 * starts scrolling — the exact fit moves with the style preset's `--spacing`,
 * so this is a handful, not a measurement. A few names are faster to read than
 * to filter; past that, a name can sit below the fold and typing beats
 * scrolling. Fifty แฟ้ม is the same capped box either way; what the filter
 * changes is whether the teacher has to scroll it at all.
 */
const SET_FILTER_THRESHOLD = 5

/**
 * Choosing which แฟ้ม a new โจทย์ is filed into, straight from the form.
 *
 * Filing used to happen only after the fact, from คลังแฟ้มโจทย์ — the teacher
 * saved the โจทย์, went looking for it in a คลัง of hundreds, and ticked it into
 * a แฟ้ม. But the แฟ้ม a โจทย์ belongs to is known while it is being written
 * ("this is the third one for ทบทวนกลางภาค"), and asking then costs one tick.
 *
 * Several แฟ้ม, because a โจทย์ genuinely lives in more than one — a งาน–พลังงาน
 * question sits in both the unit แฟ้ม and the revision one — and this is the
 * moment the teacher knows which.
 *
 * Only the teacher's own แฟ้ม are offered: a แฟ้ม a teammate shared is readable
 * but not writable, so filing into one would be refused on save.
 */
export function QuestionSetPicker({ selectedIds, onChange }: {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [sets, setSets] = useState<QuestionSetOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    getMyQuestionSetOptions()
      .then(setSets)
      .catch(() => setSets([]))
      .finally(() => setLoaded(true))
  }, [])

  const query = filter.trim().toLowerCase()
  const visible = query ? sets.filter(s => s.title.toLowerCase().includes(query)) : sets
  // A แฟ้ม ticked before the filter was typed is still ticked, just off-list —
  // say so, or the count below looks wrong.
  const hiddenSelected = selectedIds.filter(id => !visible.some(s => s.id === id)).length

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">กำลังโหลดแฟ้มโจทย์...</p>

  if (sets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        ยังไม่มีแฟ้มโจทย์ของคุณ — บันทึกโจทย์นี้ไว้ก่อนได้เลย แล้วค่อยสร้างแฟ้มและจัดโจทย์เข้าแฟ้มที่หน้าคลังแฟ้มโจทย์
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {sets.length > SET_FILTER_THRESHOLD && (
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={`ค้นหาจากชื่อแฟ้ม (มีทั้งหมด ${sets.length} แฟ้ม)`}
          className="text-sm"
        />
      )}

      <div className="border border-border rounded-lg max-h-48 overflow-y-auto p-1 space-y-0.5">
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">ไม่พบแฟ้มที่ชื่อตรงกับที่ค้นหา</p>
        ) : visible.map(set => {
          const checked = selectedIds.includes(set.id)
          return (
            <label
              key={set.id}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                checked ? 'bg-primary/10' : 'hover:bg-muted',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(set.id)}
                className="accent-primary"
              />
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground truncate">{set.title}</span>
            </label>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {selectedIds.length === 0
          ? 'ยังไม่ได้เลือกแฟ้ม — โจทย์จะอยู่ในคลังโจทย์อย่างเดียว'
          : `เลือกไว้ ${selectedIds.length} แฟ้ม`}
        {hiddenSelected > 0 && ` (มี ${hiddenSelected} แฟ้มที่เลือกไว้ไม่ตรงกับคำค้น)`}
      </p>
    </div>
  )
}

// ─── GeneralInfoSection ────────────────────────────────────────────────────────

interface GeneralInfoSectionProps {
  allTags: string[]
  title: string
  onTitleChange: (v: string) => void
  subject: string
  onSubjectChange: (v: string) => void
  difficulty: Difficulty
  onDifficultyChange: (v: Difficulty) => void
  visibility: Visibility
  onVisibilityChange: (v: Visibility) => void
  teamOrgId: string | null
  onTeamOrgIdChange: (id: string | null) => void
  /** Other teams (besides teamOrgId) this question is additionally shared with. */
  sharedOrgIds: string[]
  onSharedOrgIdsChange: (ids: string[]) => void
  /** Whether teammates with access to this question may also edit it. */
  teamEditAllowed: boolean
  onTeamEditAllowedChange: (v: boolean) => void
  /** False for a teammate editing someone else's shared question — locks the
   *  visibility/sharing controls, which stay owner-only. Defaults to true. */
  canEditSharing?: boolean
  /** False where the caller cannot act on the answer — the Word import stores
   *  every โจทย์ as private, so offering the control would be a lie. Defaults
   *  to true. */
  showSharing?: boolean
  /** False where วิชา is asked once for a whole batch instead of per โจทย์ —
   *  every โจทย์ in one Word file is the same subject. Defaults to true. */
  showSubject?: boolean
  tags: string[]
  onTagsChange: (tags: string[]) => void
  /** แฟ้ม the โจทย์ will be filed into on save. Both are omitted when editing:
   *  which แฟ้ม hold an existing โจทย์ is changed from the แฟ้ม itself, and a
   *  picker here would have to mean "remove from the ones you untick" too. */
  setIds?: string[]
  onSetIdsChange?: (ids: string[]) => void
}

export function GeneralInfoSection({
  allTags,
  title, onTitleChange,
  subject, onSubjectChange,
  difficulty, onDifficultyChange,
  visibility, onVisibilityChange,
  teamOrgId, onTeamOrgIdChange,
  sharedOrgIds, onSharedOrgIdsChange,
  teamEditAllowed, onTeamEditAllowedChange,
  canEditSharing = true,
  showSharing = true,
  showSubject = true,
  tags, onTagsChange,
  setIds, onSetIdsChange,
}: GeneralInfoSectionProps) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [teamChecked, setTeamChecked] = useState(false)

  // teamOrgId can be left over from a *private* question — where it points at the
  // creator's personal workspace, not a real team. Only count it once it's confirmed
  // to be one of the user's actual teams, otherwise it silently inflates the count
  // below without ever showing up as a selected chip.
  const isRealTeam = (id: string | null) => !!id && teams.some(t => t.id === id)
  const effectiveTeamOrgId = isRealTeam(teamOrgId) ? teamOrgId : null

  useEffect(() => {
    getMyTeamOrgOptions()
      .then((list) => {
        setTeams(list)
        // exactly one team — pin it automatically, nothing for the user to pick
        if (list.length === 1 && !list.some(t => t.id === teamOrgId)) onTeamOrgIdChange(list[0].id)
      })
      .finally(() => setTeamChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // legacy questions saved with visibility='school' display/behave as 'organization'
  const displayVisibility = visibility === 'school' ? 'organization' : visibility
  const hasTeams = teams.length > 0
  const selectedTeamName = teams.find(t => t.id === effectiveTeamOrgId)?.name ?? null

  // effectiveTeamOrgId + sharedOrgIds together form "every team this question is
  // shared to" — effectiveTeamOrgId is just an implementation detail (the "home"
  // row), invisible to the user.
  const allSelectedTeamIds = effectiveTeamOrgId ? [effectiveTeamOrgId, ...sharedOrgIds] : sharedOrgIds

  function toggleTeam(id: string) {
    const isSelected = allSelectedTeamIds.includes(id)
    if (isSelected) {
      if (allSelectedTeamIds.length <= 1) return // must keep at least one team while sharing to a team
      if (id === effectiveTeamOrgId) {
        const [nextPrimary, ...rest] = sharedOrgIds
        onTeamOrgIdChange(nextPrimary ?? null)
        onSharedOrgIdsChange(rest)
      } else {
        onSharedOrgIdsChange(sharedOrgIds.filter(x => x !== id))
      }
    } else if (!effectiveTeamOrgId) {
      onTeamOrgIdChange(id) // replaces a stale (non-team) teamOrgId, if any
    } else {
      onSharedOrgIdsChange([...sharedOrgIds, id])
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground border-b pb-2">ข้อมูลทั่วไป</h2>

      <div className="space-y-1.5">
        <Label htmlFor="title">ชื่อโจทย์ *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="เช่น วัตถุมวล m ได้รับแรง F หาความเร่ง"
        />
      </div>

      {showSubject && (
        <div className="space-y-1.5">
          <Label>วิชา *</Label>
          <SubjectAutocomplete value={subject} onChange={onSubjectChange} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>ระดับความยาก</Label>
          <Select value={difficulty} onValueChange={(v) => v !== null && onDifficultyChange(v as Difficulty)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกระดับ">
                {difficultyLabels[difficulty] ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">ง่าย</SelectItem>
              <SelectItem value="medium">ปานกลาง</SelectItem>
              <SelectItem value="hard">ยาก</SelectItem>
              <SelectItem value="analytical">วิเคราะห์</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showSharing && (
        <div className="space-y-1.5">
          <Label>การมองเห็น</Label>
          <Select
            value={displayVisibility}
            disabled={!canEditSharing}
            onValueChange={(v) => {
              if (v === null) return
              onVisibilityChange(v as Visibility)
              if (v === 'private') {
                onTeamOrgIdChange(null)
                onSharedOrgIdsChange([])
              } else if (teams.length === 1) {
                onTeamOrgIdChange(teams[0].id)
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกการมองเห็น">
                {displayVisibility === 'organization'
                  ? (allSelectedTeamIds.length > 1
                      ? `ทีมของฉัน (${allSelectedTeamIds.length} ทีม)`
                      : selectedTeamName ? `ทีมของฉัน (${selectedTeamName})` : 'ทีมของฉัน')
                  : visibilityLabels[displayVisibility] ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">ส่วนตัว — แค่ฉันเห็นโจทย์นี้</SelectItem>
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

          {displayVisibility === 'organization' && teams.length > 1 && (
            <TeamShareChips
              label="แชร์ให้ทีมไหน (เลือกได้หลายทีม)"
              teams={teams}
              selectedIds={allSelectedTeamIds}
              onToggle={toggleTeam}
              disabled={!canEditSharing}
            />
          )}

          {displayVisibility === 'organization' && (
            <div className="flex items-center gap-2 pt-2">
              <ToggleSwitch
                checked={teamEditAllowed}
                onChange={onTeamEditAllowedChange}
                disabled={!canEditSharing}
              />
              <span className="text-xs text-muted-foreground">อนุญาตให้เพื่อนในทีมแก้ไขโจทย์นี้ได้</span>
            </div>
          )}
        </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>แท็ก *</Label>
        <p className="text-xs text-muted-foreground">ใช้ระบุหัวข้อของโจทย์ เช่น แรง, กฎนิวตัน, พลังงาน — ช่วยให้ค้นหาและกรองโจทย์ได้ง่ายขึ้น</p>
        <SmartTagInput allTags={allTags} tags={tags} onTagsChange={onTagsChange} />
      </div>

      {onSetIdsChange && (
        <div className="space-y-1.5">
          <Label>แฟ้มโจทย์</Label>
          <p className="text-xs text-muted-foreground">
            เลือกแฟ้มที่จะเก็บโจทย์ข้อนี้ เลือกได้หลายแฟ้ม — โจทย์ข้อเดียวอยู่ได้หลายแฟ้ม · ไม่เลือกก็ได้
          </p>
          <QuestionSetPicker selectedIds={setIds ?? []} onChange={onSetIdsChange} />
        </div>
      )}
    </section>
  )
}
