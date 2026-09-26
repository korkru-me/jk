'use client'

import { createContext, useContext } from 'react'
import {
  createClassroomGroup, deleteClassroomGroup, moveStudentsToGroup, randomizeClassroomGroups,
  reorderClassroomGroups, updateClassroomGroup,
} from '@/lib/actions/classroom-groups'

const serverActions = {
  createClassroomGroup,
  updateClassroomGroup,
  deleteClassroomGroup,
  reorderClassroomGroups,
  moveStudentsToGroup,
  randomizeClassroomGroups,
}

/** What the กลุ่มย่อย tab calls to save. The real server actions everywhere
 *  except the synthetic lab, which answers from memory instead. */
export type GroupActions = typeof serverActions

const GroupActionsContext = createContext<GroupActions>(serverActions)

export const GroupActionsProvider = GroupActionsContext.Provider

export function useGroupActions(): GroupActions {
  return useContext(GroupActionsContext)
}
