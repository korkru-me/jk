'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, Clock, Info, ListChecks, Search, UserRound, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Pagination } from '@/components/ui/pagination'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ABILITY_SORT_LABEL, assignmentAverages, buildStudentAbilities, compareAssignmentsForDisplay,
  formatPercent, matchesStudentQuery, restoreSelection, sortByAbility,
  type AbilitySortKey, type StudentAbility,
} from '@/lib/student-ability'
import type { StudentSortDir } from '@/lib/student-sort'
import {
  ChartTypeToggle, MiniBarChart, MiniRadarChart, RADAR_MIN_ASSIGNMENTS, isUnscored,
  type AbilityChartType, type AbilityDatum,
} from './ability-charts'
import { StudentAbilityDialog } from './student-ability-dialog'
import type { ClassroomAssignmentRow } from './classroom-assignments-tab'
import type { StudentProfileRow } from './homeroom-overview'

const PAGE_SIZE = 25

/** Past this many งาน the name list folds, so a full term does not push the cards off screen. */
const CHIPS_FOLDED = 8

const TYPE_LABEL: Record<string, string> = { exercise: 'แบบฝึกหัด', exam: 'ข้อสอบ' }

interface RealStudent { id: string; full_name: string; email: string }

interface SubmissionRow {
  id: string
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  attempt_number: number
}

interface Props {
  classroomId: string
  students: RealStudent[]
  assignments: ClassroomAssignmentRow[]
  submissions: SubmissionRow[]
  profiles: Record<string, StudentProfileRow>
  /** Hand-ins with an answer still waiting for a teacher's score, per งาน. */
  pendingReviewByAssignment: Record<string, number>
}

// Which งาน are ticked and which chart is showing are remembered per
// classroom in this browser only — a viewing preference, not class data.
interface StoredPrefs { selected?: string[]; chart?: AbilityChartType }

function prefsKey(classroomId: string) {
  return `korkru.student-ability.${classroomId}`
}

function readPrefs(classroomId: string): StoredPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(prefsKey(classroomId)) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const { selected, chart } = parsed as Record<string, unknown>
    return {
      selected: Array.isArray(selected) ? selected.filter((id): id is string => typeof id === 'string') : undefined,
      chart: chart === 'bar' || chart === 'radar' ? chart : undefined,
    }
  } catch {
    return {}
  }
}

function writePrefs(classroomId: string, prefs: StoredPrefs) {
  try {
    window.localStorage.setItem(prefsKey(classroomId), JSON.stringify(prefs))
  } catch {
    // Private browsing or blocked storage: the choice just is not remembered.
  }
}

export function StudentAbilityTab({
  classroomId, students, assignments, submissions, profiles, pendingReviewByAssignment,
}: Props) {
  // A draft was never open to students, so it has nothing to show.
  const usable = useMemo(
    () => assignments.filter(a => a.status !== 'draft').sort(compareAssignmentsForDisplay),
    [assignments],
  )

  // The first render uses the defaults on server and client alike; the
  // remembered choice is applied before the browser paints. Reading storage
  // during render made a server-rendered tab fail hydration.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => usable.map(a => a.id))
  const [chartType, setChartType] = useState<AbilityChartType>('bar')
  useLayoutEffect(() => {
    const prefs = readPrefs(classroomId)
    setSelectedIds(restoreSelection(prefs.selected, usable.map(a => a.id)))
    if (prefs.chart) setChartType(prefs.chart)
    // Once per classroom: later changes to the list must not undo what the
    // teacher ticks while the tab is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId])
  const [sortKey, setSortKey] = useState<AbilitySortKey>('number')
  const [sortDir, setSortDir] = useState<StudentSortDir>('asc')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [chipsOpen, setChipsOpen] = useState(false)
  // Card buttons by student, so closing the full view can hand focus to the
  // student last shown — ← → may have moved far from the card that opened it.
  const cardButtons = useRef(new Map<string, HTMLButtonElement>())
  const lastShownId = useRef<string | null>(null)

  function showStudent(id: string) {
    lastShownId.current = id
    setOpenId(id)
  }

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selected = useMemo(() => usable.filter(a => selectedSet.has(a.id)), [usable, selectedSet])
  const abilities = useMemo(
    () => buildStudentAbilities(students.map(s => s.id), selected, submissions),
    [students, selected, submissions],
  )
  const averages = useMemo(() => assignmentAverages(abilities.values(), selected.map(a => a.id)), [abilities, selected])
  const visible = useMemo(
    () => sortByAbility(
      students.filter(s => matchesStudentQuery(s, profiles[s.id], query)),
      profiles, abilities, sortKey, sortDir,
    ),
    [students, profiles, abilities, sortKey, sortDir, query],
  )

  // Only explain the ○ mark when a ticked งาน actually has one.
  const hasUnscored = useMemo(
    () => Array.from(abilities.values()).some(ability => ability.cells.some(cell => isUnscored(cell))),
    [abilities],
  )
  const radarAllowed = selected.length >= RADAR_MIN_ASSIGNMENTS
  const effectiveChart: AbilityChartType = chartType === 'radar' && radarAllowed ? 'radar' : 'bar'
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStudents = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const openIndex = openId ? visible.findIndex(s => s.id === openId) : -1
  const openStudent = openIndex >= 0 ? visible[openIndex] : null

  function changeSelection(next: string[]) {
    setSelectedIds(next)
    setPage(1)
    writePrefs(classroomId, { selected: next, chart: chartType })
  }

  function changeChart(next: AbilityChartType) {
    setChartType(next)
    writePrefs(classroomId, { selected: selectedIds, chart: next })
  }

  function toggleAssignment(id: string, checked: boolean) {
    changeSelection(checked ? [...selectedIds, id] : selectedIds.filter(x => x !== id))
  }

  function changeSortKey(next: AbilitySortKey) {
    setSortKey(next)
    // A score ranking is read best-first; names and numbers run upward.
    setSortDir(next === 'score' ? 'desc' : 'asc')
    setPage(1)
  }

  // Stepping through students in the expanded view also moves the grid, so
  // closing it lands on the page the teacher ended up on.
  function openAt(index: number) {
    const student = visible[index]
    if (!student) return
    showStudent(student.id)
    setPage(Math.floor(index / PAGE_SIZE) + 1)
  }

  const cardData = (ability: StudentAbility | undefined): AbilityDatum[] => selected.map((assignment, i) => {
    const cell = ability?.cells[i]
    return {
      key: assignment.id,
      index: i + 1,
      title: assignment.title,
      state: cell?.state ?? 'missing',
      percent: cell?.percent ?? null,
      score: cell?.score ?? null,
      maxScore: cell?.maxScore ?? null,
    }
  })

  if (students.length === 0) {
    return (
      <Card className="py-12 text-center text-sm text-muted-foreground">
        ยังไม่มีนักเรียนในห้องนี้ — เชิญนักเรียนได้ที่แท็บ &ldquo;เชิญเข้าร่วม&rdquo;
      </Card>
    )
  }

  if (usable.length === 0) {
    return (
      <Card className="py-12 text-center text-sm text-muted-foreground">
        ยังไม่มีงานที่มอบหมายให้ห้องนี้ — เมื่อนักเรียนเริ่มส่งงาน กราฟจะขึ้นที่นี่
      </Card>
    )
  }

  const typeGroups = Array.from(new Set(usable.map(a => a.type)))

  return (
    <div className="space-y-4">
      {/* One control row scopes everything below it. */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <ListChecks /> เลือกงาน
            <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
              {selected.length}/{usable.length}
            </span>
            <ChevronDown className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80 max-w-[calc(100vw-2rem)]">
            <DropdownMenuItem closeOnClick={false} onClick={() => changeSelection(usable.map(a => a.id))}>
              เลือกทุกงาน
            </DropdownMenuItem>
            <DropdownMenuItem closeOnClick={false} onClick={() => changeSelection([])}>
              ไม่เลือกเลย
            </DropdownMenuItem>
            {typeGroups.map(type => (
              <DropdownMenuGroup key={type}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{TYPE_LABEL[type] ?? 'งาน'}</DropdownMenuLabel>
                {usable.filter(a => a.type === type).map(a => (
                  <DropdownMenuCheckboxItem
                    key={a.id}
                    checked={selectedSet.has(a.id)}
                    onCheckedChange={checked => toggleAssignment(a.id, checked)}
                  >
                    <span className="truncate">{a.title}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ChartTypeToggle value={effectiveChart} onChange={changeChart} radarAllowed={radarAllowed} />
        {!radarAllowed && selected.length > 0 && (
          <span className="text-xs text-muted-foreground">เรดาร์ต้องเลือกอย่างน้อย {RADAR_MIN_ASSIGNMENTS} งาน</span>
        )}

        <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">
          <label htmlFor="ability-sort" className="text-xs text-muted-foreground">เรียงตาม</label>
          <NativeSelect
            id="ability-sort"
            value={sortKey}
            onChange={e => changeSortKey(e.target.value as AbilitySortKey)}
            className="w-auto"
          >
            {(Object.keys(ABILITY_SORT_LABEL) as AbilitySortKey[]).map(key => (
              <option key={key} value={key}>{ABILITY_SORT_LABEL[key]}</option>
            ))}
          </NativeSelect>
          <IconButton
            variant="outline"
            label={sortDir === 'asc' ? 'เรียงจากน้อยไปมาก — กดเพื่อกลับด้าน' : 'เรียงจากมากไปน้อย — กดเพื่อกลับด้าน'}
            onClick={() => { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); setPage(1) }}
          >
            {sortDir === 'asc' ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
          </IconButton>
          <div className="relative min-w-48 flex-1 lg:w-64 lg:flex-none">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1) }}
              placeholder="ค้นหาชื่อ รหัส หรือเลขที่"
              aria-label="ค้นหานักเรียน"
              enterKeyHint="search"
              className="pr-8 pl-8"
            />
            {query && (
              <IconButton size="xs" label="ล้างคำค้น" onClick={() => { setQuery(''); setPage(1) }} className="absolute top-1/2 right-1 -translate-y-1/2">
                <X />
              </IconButton>
            )}
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="space-y-2">
          <ol id="ability-chips" className="flex flex-wrap items-center gap-1.5" aria-label="งานที่นำมาเทียบ">
            {(chipsOpen ? selected : selected.slice(0, CHIPS_FOLDED)).map((a, i) => {
              const pending = pendingReviewByAssignment[a.id] ?? 0
              return (
                <li key={a.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted py-1 pr-2.5 pl-1 text-xs">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-card font-bold text-foreground tabular-nums">{i + 1}</span>
                  <span className="max-w-[15rem] truncate text-foreground">{a.title}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">เฉลี่ยห้อง {formatPercent(averages.get(a.id)?.average ?? null)}</span>
                  {pending > 0 && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
                      title={`มีงานที่ส่งแล้วรอครูตรวจ ${pending} ชิ้น — เปอร์เซ็นต์ของงานนี้อาจยังไม่ครบ`}
                    >
                      <Clock aria-hidden="true" className="size-3 text-warning" /> รอตรวจ {pending}
                    </span>
                  )}
                </li>
              )
            })}
            {selected.length > CHIPS_FOLDED && (
              <li>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-expanded={chipsOpen}
                  aria-controls="ability-chips"
                  onClick={() => setChipsOpen(open => !open)}
                  className="text-primary"
                >
                  {chipsOpen ? 'ย่อรายชื่องาน' : `ดูอีก ${selected.length - CHIPS_FOLDED} งาน`}
                </Button>
              </li>
            )}
          </ol>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            ตัวเลขคือเปอร์เซ็นต์ของคะแนนเต็มแต่ละงาน ไม่ใช่คะแนนดิบ · ขีด – คือยังไม่ส่ง และไม่นำมาคิดค่าเฉลี่ย
            {hasUnscored && ' · วงกลม ○ คือส่งแล้วแต่งานนั้นไม่มีคะแนนเต็ม'} · กดการ์ดเพื่อดูแบบเต็มจอ
          </p>
        </div>
      )}

      {selected.length === 0 ? (
        <Card edge="dashed" className="flex flex-col items-center gap-3 py-12 text-center">
          <ListChecks aria-hidden="true" className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">ยังไม่ได้เลือกงาน — เลือกงานที่อยากเปรียบเทียบจากปุ่ม &ldquo;เลือกงาน&rdquo; ด้านบน</p>
          <Button size="sm" onClick={() => changeSelection(usable.map(a => a.id))}>เลือกทุกงาน</Button>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">ไม่พบนักเรียนที่ตรงกับ &ldquo;{query}&rdquo;</p>
          <Button size="sm" variant="outline" onClick={() => { setQuery(''); setPage(1) }}>ล้างคำค้น</Button>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {query.trim() ? `พบ ${visible.length} คนจาก ${students.length} คน` : `นักเรียน ${students.length} คน`}
            {totalPages > 1 && ` · หน้า ${currentPage}/${totalPages}`}
          </p>
          {/* Columns follow the width this tab actually gets (the app sidebar
              takes a share of the viewport), not the viewport itself. */}
          <div className="@container">
            <ul className="grid grid-cols-1 gap-3 @[28rem]:grid-cols-2 @[44rem]:grid-cols-3 @[58rem]:grid-cols-4 @[64rem]:grid-cols-5">
              {pageStudents.map(student => (
                <li key={student.id}>
                  <StudentCard
                    student={student}
                    profile={profiles[student.id]}
                    ability={abilities.get(student.id)}
                    data={cardData(abilities.get(student.id))}
                    chart={effectiveChart}
                    total={selected.length}
                    onOpen={() => showStudent(student.id)}
                    buttonRef={el => {
                      if (el) cardButtons.current.set(student.id, el)
                      else cardButtons.current.delete(student.id)
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
          {totalPages > 1 && (
            <Pagination page={currentPage} totalPages={totalPages} isPending={false} onGo={setPage} label="หน้ารายชื่อนักเรียน" />
          )}
        </>
      )}

      <StudentAbilityDialog
        student={openStudent}
        profile={openStudent ? profiles[openStudent.id] : undefined}
        ability={openStudent ? abilities.get(openStudent.id) ?? null : null}
        assignments={selected}
        averages={averages}
        position={openIndex}
        total={visible.length}
        onPrev={() => openAt(openIndex - 1)}
        onNext={() => openAt(openIndex + 1)}
        onClose={() => setOpenId(null)}
        returnFocusTo={() => (lastShownId.current ? cardButtons.current.get(lastShownId.current) ?? null : null)}
        chartType={chartType}
        onChartTypeChange={changeChart}
        radarAllowed={radarAllowed}
      />
    </div>
  )
}

function StudentCard({ student, profile, ability, data, chart, total, onOpen, buttonRef }: {
  student: RealStudent
  profile: StudentProfileRow | undefined
  ability: StudentAbility | undefined
  data: AbilityDatum[]
  chart: AbilityChartType
  total: number
  onOpen: () => void
  buttonRef: (el: HTMLButtonElement | null) => void
}) {
  const classNumber = profile?.class_number ?? null
  const average = ability?.average ?? null
  const submitted = ability?.submittedCount ?? 0

  return (
    <Card interactive padding="sm" className="relative h-full">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary tabular-nums"
        >
          {classNumber ?? <UserRound className="size-4" />}
        </span>
        {/* Two lines kept for every name, so the charts line up across a row. */}
        <p className="line-clamp-2 min-h-[2lh] min-w-0 flex-1 text-sm leading-5 font-semibold break-words text-foreground">
          {student.full_name}
        </p>
        <p className="shrink-0 text-lg leading-5 font-bold text-foreground">{formatPercent(average)}</p>
      </div>
      {/* Full card width, so the hand-in count never gets cut off by a long name. */}
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate tabular-nums">{profile?.student_code ?? 'ไม่มีรหัส'} · ส่ง {submitted}/{total}</span>
        <span className="shrink-0">เฉลี่ย</span>
      </div>
      <div className="mt-2">
        {chart === 'radar' ? <MiniRadarChart data={data} /> : <MiniBarChart data={data} />}
      </div>
      {/* The whole card opens the student; the button sits over it so the
          chart inside keeps its own layout instead of a button's. */}
      <Button
        ref={buttonRef}
        variant="ghost"
        onClick={onOpen}
        aria-label={`${student.full_name}${classNumber !== null ? ` เลขที่ ${classNumber}` : ''} เฉลี่ย ${formatPercent(average)} ส่ง ${submitted} จาก ${total} งาน — ดูแบบเต็มจอ`}
        className="absolute inset-0 h-full w-full rounded-[inherit] p-0 hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
      />
    </Card>
  )
}
