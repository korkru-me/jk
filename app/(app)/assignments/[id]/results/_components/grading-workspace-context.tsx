import { AssignmentWorkspaceSidebar } from '../../_components/assignment-workspace-sidebar'
import type { GradingWorkspaceLoadResult } from '@/lib/grading-workspace.server'

/** The overview and both review routes retain the same assignment navigation. */
export function GradingWorkspaceContext({ workspace }: { workspace: GradingWorkspaceLoadResult }) {
  return <AssignmentWorkspaceSidebar
    assignment={workspace.sidebarAssignment}
    currentSection="results"
    pendingCount={workspace.pendingCount}
    availableQuestionCount={workspace.availableQuestionCount}
    missingQuestionCount={workspace.missingQuestionCount}
    duplicateQuestionCount={workspace.duplicateQuestionCount}
  />
}
