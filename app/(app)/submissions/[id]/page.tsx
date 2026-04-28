import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'ผลการสอบ — KorKru' }

function formatAnswer(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(3)
  return parseFloat(n.toPrecision(4)).toString()
}

export default async function SubmissionResultPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submission } = await supabase
    .from('submissions')
    .select(`
      *,
      assignments(title, classrooms(name)),
      submission_answers(*, questions(*))
    `)
    .eq('id', id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (!submission) notFound()

  if (submission.status === 'in_progress') {
    redirect(`/assignments/${submission.assignment_id}/take`)
  }

  const pct = submission.max_score > 0
    ? Math.round((submission.total_score / submission.max_score) * 100)
    : 0

  const assignment = (submission as any).assignments

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/assignments" className="text-sm text-gray-500 hover:text-blue-600">
          ← ชุดข้อสอบ
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{assignment.title}</h1>
        <p className="text-sm text-gray-500">{assignment.classrooms?.name}</p>
      </div>

      {/* Score summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-black mb-4 ${
          pct >= 75 ? 'bg-green-100 text-green-700'
          : pct >= 50 ? 'bg-yellow-100 text-yellow-700'
          : 'bg-red-100 text-red-600'
        }`}>
          {pct}%
        </div>
        <p className="text-4xl font-black text-gray-900">
          {submission.total_score}/{submission.max_score}
        </p>
        <p className="text-gray-500 mt-1">คะแนน</p>
        {submission.submitted_at && (
          <p className="text-xs text-gray-400 mt-2">
            ส่งเมื่อ {new Date(submission.submitted_at).toLocaleString('th-TH')}
          </p>
        )}
      </div>

      {/* Answer review */}
      <div className="space-y-4">
        <h2 className="font-semibold text-gray-900">ตรวจเฉลย</h2>
        {(submission as any).submission_answers
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((a: any, i: number) => {
            const q = a.questions
            const isCorrect = a.is_correct

            return (
              <div
                key={a.id}
                className={`bg-white border rounded-xl p-5 ${
                  isCorrect === true ? 'border-green-200' : isCorrect === false ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    isCorrect === true ? 'bg-green-100 text-green-700'
                    : isCorrect === false ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {isCorrect === true ? '✓' : isCorrect === false ? '✗' : '?'}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">ข้อ {i + 1}: {q.title}</p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{
                      substituteVars(q.question_text, a.random_values, q.variables ?? [])
                    }</p>

                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-24 shrink-0">คำตอบคุณ:</span>
                        <span className={`font-medium ${isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                          {a.student_answer ?? '—'} {q.answer_unit}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-24 shrink-0">เฉลย:</span>
                        <span className="font-medium text-gray-900">
                          {formatAnswerDisplay(a.correct_answer)} {q.answer_unit}
                        </span>
                      </div>
                    </div>

                    {/* Variable values used */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(a.random_values as Record<string, number>).map(([k, v]) => {
                        const varDef = (q.variables ?? []).find((vv: any) => vv.name === k)
                        return (
                          <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                            {k} = {v}{varDef?.unit ? ` ${varDef.unit}` : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {a.score}/{a.max_score}
                  </Badge>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function formatAnswerDisplay(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return formatAnswer(n)
}

function substituteVars(text: string, values: Record<string, number>, variables: Array<{ name: string; unit: string }>) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) return `{${name}}`
    const def = variables.find(v => v.name === name)
    return `${values[name]}${def?.unit ? ' ' + def.unit : ''}`
  })
}
