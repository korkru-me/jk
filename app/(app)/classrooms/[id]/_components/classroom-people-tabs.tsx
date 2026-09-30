'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Grid3x3, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StudentSortKey, StudentSortRule } from '@/lib/student-sort'
import type { GroupStudent } from './group-dialogs'
import type { StudentProfileRow } from './homeroom-overview'
import { StudentTable } from './student-table'
import { BreakoutGroups, type GroupState } from './breakout-groups'

export type PeopleView = 'students' | 'groups'

interface ClassroomPeopleTabsProps {
  classroomId: string
  students: Array<{ id: string; full_name: string; email: string }>
  groupStudents: GroupStudent[]
  otherClassrooms: Array<{ id: string; name: string }>
  profiles: Record<string, StudentProfileRow>
  canManage: boolean
  sortRules: StudentSortRule[]
  onToggleSort: (key: StudentSortKey) => void
  groupState: GroupState
  setGroupState: Dispatch<SetStateAction<GroupState>>
  assignmentTitlesByGroup: Map<string, string[]>
  value: PeopleView
  onValueChange: (value: PeopleView) => void
}

export function ClassroomPeopleTabs({
  classroomId, students, groupStudents, otherClassrooms, profiles, canManage,
  sortRules, onToggleSort, groupState, setGroupState, assignmentTitlesByGroup,
  value, onValueChange,
}: ClassroomPeopleTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={nextValue => {
        if (nextValue === 'students' || nextValue === 'groups') onValueChange(nextValue)
      }}
    >
      <TabsList className="h-11 w-full justify-start rounded-xl p-1">
        <TabsTrigger value="students" className="h-full flex-none px-4">
          <Users data-icon="inline-start" />
          รายชื่อนักเรียนทั้งหมด
          <Badge variant="secondary">{students.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="groups" className="h-full flex-none px-4">
          <Grid3x3 data-icon="inline-start" />
          การแบ่งกลุ่มย่อย
          <Badge variant="secondary">{groupState.groups.length}</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="students">
        <StudentTable
          classroomId={classroomId}
          students={students}
          otherClassrooms={otherClassrooms}
          profiles={profiles}
          showRoster={canManage}
          sortRules={sortRules}
          onToggleSort={onToggleSort}
        />
      </TabsContent>
      <TabsContent value="groups">
        <BreakoutGroups
          classroomId={classroomId}
          students={groupStudents}
          state={groupState}
          setState={setGroupState}
          canManage={canManage}
          assignmentTitlesByGroup={assignmentTitlesByGroup}
        />
      </TabsContent>
    </Tabs>
  )
}
