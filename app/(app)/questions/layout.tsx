import { QuestionsTabs } from './_components/questions-tabs'

export default function QuestionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <QuestionsTabs />
      {children}
    </div>
  )
}
