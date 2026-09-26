'use client'

import { LightbulbOff } from 'lucide-react'
import { RichText } from '@/components/ui/rich-text'
import { SolutionFiles } from '@/components/questions/solution-files'
import type { QuestionSolution, QuestionSolutionPart } from '@/lib/question-solution'

/**
 * The body of the ดูเฉลย dialog: each part's typed text, pictures and PDF
 * links.
 *
 * A module of its own because RichText brings KaTeX, which the คลัง has no
 * other use for — the dialog loads this on its first open (or on hovering
 * ดูเฉลย) rather than every visit to the list paying for it.
 */
export function SolutionParts({ solution }: { solution: QuestionSolution }) {
  return (
    <div className="min-w-0 divide-y divide-border">
      {solution.parts.map(part => (
        <SolutionPartView key={part.id} part={part} />
      ))}
    </div>
  )
}

function SolutionPartView({ part }: { part: QuestionSolutionPart }) {
  const empty = !part.text && part.files.length === 0

  return (
    <section className="space-y-3 py-4 first:pt-0 last:pb-0">
      {part.label && (
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{part.label}</h3>
          {part.excerpt && <p className="line-clamp-2 text-xs text-muted-foreground">{part.excerpt}</p>}
        </div>
      )}
      {empty ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <LightbulbOff className="size-4 shrink-0" aria-hidden="true" />
          {part.label ? 'ข้อย่อยนี้ยังไม่ได้แนบเฉลย' : 'ข้อนี้ยังไม่ได้แนบเฉลย'}
        </p>
      ) : (
        <>
          {part.text && <RichText text={part.text} blocks className="text-sm leading-relaxed text-foreground" />}
          <SolutionFiles
            urls={part.files}
            alt={part.label ? `เฉลย${part.label}` : 'เฉลยวิธีทำ'}
            imageClassName="h-auto max-w-full rounded-lg border object-contain"
          />
        </>
      )}
    </section>
  )
}
