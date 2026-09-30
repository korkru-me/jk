'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  Users, BookOpen, Home,
} from 'lucide-react'
import type { Classroom, ClassroomPost } from '@/lib/types'

import { ClassroomSettingsDialog } from './classroom-settings-dialog'
import { parseDescription, coverOf, displayDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import type { SortKey as StudentSortKey } from './student-table'
import type { CoTeacherRow, InviteRow } from './co-teachers'
import type { ClassroomAssignmentRow } from './classroom-assignments-tab'
import { ClassroomOverview, type OverviewTarget } from './classroom-overview'
import type { StudentNoteRow, StudentProfileRow } from './homeroom-overview'
import type { HomeroomAssignmentRow } from '@/lib/homeroom-data'
import { targetedStudentIds, type ClassroomGroup } from '@/lib/classroom-groups'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import {
  classroomNavigationHref,
  classroomNavigationFor,
  classroomNavigationPath,
  resolveClassroomNavigationKey,
  type ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import type { GroupState } from './breakout-groups'
import { ClassroomContextNavigation } from './classroom-context-sidebar'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { nextStudentSortRules, type StudentSortRule } from '@/lib/student-sort'
import type { PeopleView } from './classroom-people-tabs'
import { ClassroomAccessPanel } from './classroom-access-panel'

function TabLoading() {
  return <div className="h-32 rounded-2xl bg-muted animate-pulse" aria-label="กำลังโหลดเนื้อหา" />
}

// Overview is always the initial tab, so it and the announcement board inside
// it are imported directly. Everything else is downloaded only when a teacher
// opens that tab, keeping the first classroom bundle focused on what is
// actually visible.
const StudentTable = dynamic(() => import('./student-table').then(module => module.StudentTable), { loading: TabLoading })
const CoTeachers = dynamic(() => import('./co-teachers').then(module => module.CoTeachers), { loading: TabLoading })
const ClassroomAssignmentsTab = dynamic(
  () => import('./classroom-assignments-tab').then(module => module.ClassroomAssignmentsTab),
  { loading: TabLoading },
)
const ClassroomScoresMatrix = dynamic(
  () => import('./classroom-scores-matrix').then(module => module.ClassroomScoresMatrix),
  { loading: TabLoading },
)
const StudentAbilityTab = dynamic(
  () => import('./student-ability-tab').then(module => module.StudentAbilityTab),
  { loading: TabLoading },
)
const ClassroomPeopleTabs = dynamic(
  () => import('./classroom-people-tabs').then(module => module.ClassroomPeopleTabs),
  { loading: TabLoading },
)
const HomeroomOverview = dynamic(() => import('./homeroom-overview').then(module => module.HomeroomOverview), { loading: TabLoading })

interface RealStudent { id: string; full_name: string; email: string; roster_order?: number | null }

interface Props {
  classroom: Classroom
  switchableClassrooms: Array<Pick<Classroom, 'id' | 'name' | 'description'>>
  students: RealStudent[]
  assignmentCount: number
  otherClassrooms: { id: string; name: string }[]
  isOwner: boolean
  canManage: boolean
  coTeachers: CoTeacherRow[]
  invites: InviteRow[]
  classroomAssignments: ClassroomAssignmentRow[]
  assignmentCategories: AssignmentCategory[]
  classroomSubmissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[]
  classroomExtensions: {
    id: string; assignment_id: string; student_id: string; extended_end_at: string; note: string | null
  }[]
  homeroomAssignments: HomeroomAssignmentRow[]
  homeroomSubmissions: {
    id: string; assignment_id: string; student_id: string; status: string
    total_score: number | null; max_score: number; submitted_at: string | null; attempt_number: number
  }[]
  studentNotes: StudentNoteRow[]
  studentProfiles: Record<string, StudentProfileRow>
  ownerName: string
  posts: ClassroomPost[]
  /** The same waiting hand-ins split per งาน, keyed by assignment id. */
  pendingReviewByAssignment: Record<string, number>
  /** Student ids that have seen each announcement, keyed by post id. */
  seenByPost: Record<string, string[]>
  /** Live classrooms the same announcement can be cross-posted to. */
  crossPostTargets: { id: string; name: string }[]
  /** กลุ่มย่อย of this room, and each student's group (student id → group id). */
  groups: ClassroomGroup[]
  groupMembers: Record<string, string>
  initialNavigationItem: ClassroomNavigationKey
  initialPeopleView: PeopleView
  backHref: string
}

export function ClassroomDetailClient({
  classroom, switchableClassrooms, students, assignmentCount, otherClassrooms, isOwner, canManage, coTeachers, invites,
  classroomAssignments, assignmentCategories, classroomSubmissions, classroomExtensions,
  homeroomAssignments, homeroomSubmissions, studentNotes, studentProfiles, ownerName, posts,
  pendingReviewByAssignment, seenByPost, crossPostTargets,
  groups, groupMembers, initialNavigationItem, initialPeopleView, backHref,
}: Props) {
  const router = useRouter()
  const isHomeroom = classroom.classroom_type === 'homeroom'
  const navigationItems = useMemo(
    () => classroomNavigationFor(classroom.classroom_type, canManage),
    [classroom.classroom_type, canManage],
  )
  const [activeTab, setActiveTab] = useState<ClassroomNavigationKey>(initialNavigationItem)
  const [peopleView, setPeopleView] = useState<PeopleView>(initialPeopleView)
  const savedCover = coverOf(parseDescription(classroom.description))
  // A chosen cover paints the banner as a tinted surface whose text is the same
  // colour at full strength; secondary lines just dim it. Without one the
  // banner keeps its original dark gradient and white text.
  const coverMuted = savedCover ? savedCover.textMuted : 'text-muted-foreground'
  const shownDescription = displayDescription(classroom.description)

  // Owned here so the student-table sort survives switching tabs.
  const [studentSortRules, setStudentSortRules] = useState<StudentSortRule[]>([
    { key: 'name', dir: 'asc' },
  ])

  // กลุ่มย่อย live here rather than inside their tab: the tab unmounts when
  // another is opened, and the งาน tabs read the same arrangement to count
  // each งาน only against the students it was handed to.
  const [groupState, setGroupState] = useState<GroupState>({ groups, members: groupMembers })
  const groupStudents = useMemo(() => students.map(student => {
    const profile = studentProfiles[student.id]
    return {
      ...student,
      grade_level: profile?.grade_level ?? null,
      section_number: profile?.section_number ?? null,
      class_number: profile?.class_number ?? null,
      student_code: profile?.student_code ?? null,
    }
  }), [studentProfiles, students])
  const rosterIds = useMemo(() => students.map(s => s.id), [students])
  const audienceByAssignment = useMemo(() => {
    const groupOf = new Map(Object.entries(groupState.members))
    const map = new Map<string, Set<string>>()
    for (const a of classroomAssignments) {
      if (a.group_ids) map.set(a.id, targetedStudentIds(a.group_ids, rosterIds, groupOf))
    }
    return map
  }, [classroomAssignments, groupState.members, rosterIds])
  const groupNameById = useMemo(
    () => new Map(groupState.groups.map(g => [g.id, g.name])),
    [groupState.groups],
  )
  const assignmentTitlesByGroup = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const a of classroomAssignments) {
      for (const groupId of a.group_ids ?? []) map.set(groupId, [...(map.get(groupId) ?? []), a.title])
    }
    return map
  }, [classroomAssignments])

  const navigateTo = useCallback((nextItem: ClassroomNavigationKey) => {
    setActiveTab(nextItem)

    const nextUrl = classroomNavigationHref(window.location.href, nextItem)
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.pushState(null, '', nextUrl)
  }, [])

  const changePeopleView = useCallback((nextView: PeopleView) => {
    setPeopleView(nextView)
    const url = new URL(
      classroomNavigationHref(window.location.href, 'students'),
      window.location.origin,
    )
    if (nextView === 'groups') url.searchParams.set('people', 'groups')
    else url.searchParams.delete('people')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const switchClassroom = useCallback((classroomId: string) => {
    router.push(classroomNavigationPath(classroomId, activeTab))
  }, [activeTab, router])

  useEffect(() => {
    function syncNavigationFromHistory() {
      const params = new URLSearchParams(window.location.search)
      const rawView = params.get('view')
      const nextItem = resolveClassroomNavigationKey(params.get('view'), navigationItems)
      const nextPeopleView = rawView === 'groups' || params.get('people') === 'groups' ? 'groups' : 'students'
      setActiveTab(nextItem)
      setPeopleView(nextPeopleView)

      // Keep copied/reloaded URLs truthful. A stale or unauthorized `view`
      // falls back to overview, so replace that history entry with the same
      // canonical URL the overview button would create instead of leaving the
      // address bar claiming a different panel is open.
      const canonical = new URL(classroomNavigationHref(window.location.href, nextItem), window.location.origin)
      if (nextPeopleView === 'groups') canonical.searchParams.set('people', 'groups')
      const canonicalUrl = `${canonical.pathname}${canonical.search}${canonical.hash}`
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (canonicalUrl !== currentUrl) window.history.replaceState(null, '', canonicalUrl)
    }

    syncNavigationFromHistory()
    window.addEventListener('popstate', syncNavigationFromHistory)
    return () => window.removeEventListener('popstate', syncNavigationFromHistory)
  }, [navigationItems])

  const renderContextualSidebar = useCallback((onNavigate?: () => void) => (
    <ClassroomContextNavigation
      classroom={classroom}
      switchableClassrooms={switchableClassrooms}
      backHref={backHref}
      navigationItems={navigationItems}
      activeItem={activeTab}
      studentCount={students.length}
      onNavigate={navigateTo}
      onSwitchClassroom={switchClassroom}
      onClose={onNavigate}
      managementActions={isOwner
        ? <ClassroomSettingsDialog classroom={classroom} placement="sidebar" />
        : undefined}
    />
  ), [activeTab, backHref, classroom, isOwner, navigateTo, navigationItems, students.length, switchableClassrooms, switchClassroom])

  useContextualSidebar(`/classrooms/${classroom.id}`, renderContextualSidebar)

  function toggleStudentSort(key: StudentSortKey) {
    setStudentSortRules(current => nextStudentSortRules(current, key))
  }

  return (
    <div className="flex min-w-0 max-w-[1200px] flex-col gap-6">
      {/* Header card */}
      <div
        className={savedCover
          ? `rounded-2xl p-6 border-2 ${savedCover.surface} ${savedCover.text}`
          : `rounded-2xl p-6 text-white bg-gradient-to-br ${isHomeroom ? 'from-slate-800 via-slate-800 to-indigo-900' : 'from-gray-900 to-gray-800'}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            {isHomeroom && (
              <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1.5 ${savedCover ? savedCover.textMuted : 'text-primary'}`}>
                <Home className="w-3 h-3" /> ครูที่ปรึกษาประจำชั้น
              </p>
            )}
            <h1 className="text-2xl font-bold leading-tight">{classroom.name}</h1>
            {shownDescription && (
              <p className={`text-sm mt-1 ${coverMuted}`}>{shownDescription}</p>
            )}

            {/* Stats row */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Users className={`w-4 h-4 ${coverMuted}`} />
                <span className="font-semibold">{students.length}</span>
                <span className={coverMuted}>นักเรียน</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BookOpen className={`w-4 h-4 ${coverMuted}`} />
                <span className="font-semibold">{isHomeroom ? homeroomAssignments.length : assignmentCount}</span>
                <span className={coverMuted}>{isHomeroom ? 'การบ้านที่ติดตาม' : 'ชุดข้อสอบ'}</span>
              </div>
            </div>
          </div>

          {/* Class access: one compact place for the code and student invite link. */}
          <ClassroomAccessPanel
            classCode={classroom.class_code}
            canManage={canManage}
            onCover={!!savedCover}
            mutedClassName={coverMuted}
          />
        </div>

        {/* Owner actions */}
        {isOwner && (
          <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 lg:hidden">
            <ClassroomSettingsDialog classroom={classroom} onCover={!!savedCover} />
          </div>
        )}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <ClassroomOverview
            classroomId={classroom.id}
            isHomeroom={isHomeroom}
            students={students}
            assignments={classroomAssignments}
            homeroomAssignments={homeroomAssignments}
            submissions={isHomeroom ? homeroomSubmissions : classroomSubmissions}
            posts={posts}
            seenByPost={seenByPost}
            crossPostTargets={crossPostTargets}
            canManage={canManage}
            audienceByAssignment={audienceByAssignment}
            onNavigate={(target: OverviewTarget) => navigateTo(target)}
          />
        )}
        {activeTab === 'students' && (isHomeroom ? (
          <StudentTable
            classroomId={classroom.id}
            students={students}
            otherClassrooms={otherClassrooms}
            profiles={studentProfiles}
            showRoster={canManage}
            showProfiles={canManage}
            sortRules={studentSortRules}
            onToggleSort={toggleStudentSort}
          />
        ) : (
          <ClassroomPeopleTabs
            classroomId={classroom.id}
            students={students}
            groupStudents={groupStudents}
            otherClassrooms={otherClassrooms}
            profiles={studentProfiles}
            canManage={canManage}
            sortRules={studentSortRules}
            onToggleSort={toggleStudentSort}
            groupState={groupState}
            setGroupState={setGroupState}
            assignmentTitlesByGroup={assignmentTitlesByGroup}
            value={peopleView}
            onValueChange={changePeopleView}
          />
        ))}
        {activeTab === 'assignments' && canManage && (
          <ClassroomAssignmentsTab
            classroomId={classroom.id}
            assignments={classroomAssignments}
            categories={assignmentCategories}
            submissions={classroomSubmissions}
            studentCount={students.length}
            audienceByAssignment={audienceByAssignment}
            groupNameById={groupNameById}
            pendingReviewByAssignment={pendingReviewByAssignment}
          />
        )}
        {activeTab === 'scores' && canManage && (
          <ClassroomScoresMatrix
            classroomId={classroom.id}
            classroomName={classroom.name}
            students={groupStudents}
            assignments={classroomAssignments}
            categories={assignmentCategories}
            submissions={classroomSubmissions}
            extensions={classroomExtensions}
            audienceByAssignment={audienceByAssignment}
            groupNameById={groupNameById}
          />
        )}
        {activeTab === 'ability' && canManage && (
          <StudentAbilityTab
            classroomId={classroom.id}
            students={students}
            assignments={classroomAssignments}
            submissions={classroomSubmissions}
            profiles={studentProfiles}
            pendingReviewByAssignment={pendingReviewByAssignment}
          />
        )}
        {activeTab === 'homeroom' && canManage && (
          <HomeroomOverview
            classroomId={classroom.id}
            students={students}
            assignments={homeroomAssignments}
            submissions={homeroomSubmissions}
            notes={studentNotes}
            profiles={studentProfiles}
          />
        )}
        {activeTab === 'coteachers' && (
          <div className="max-w-2xl">
            <CoTeachers
              classroomId={classroom.id}
              ownerName={ownerName}
              canManage={canManage}
              coTeachers={coTeachers}
              invites={invites}
            />
          </div>
        )}
      </div>
    </div>
  )
}
