import { GradingWorkspaceLab } from '../../grading-workspace-lab'

export default async function GradingQuestionLabPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params
  return <GradingWorkspaceLab questionId={questionId} />
}
