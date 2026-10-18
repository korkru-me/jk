import { GradingWorkspaceLab } from '../../grading-workspace-lab'

export default async function GradingStudentLabPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  return <GradingWorkspaceLab studentId={studentId} />
}
