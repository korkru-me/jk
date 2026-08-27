'use client'

import Link from 'next/link'
import { Layers } from 'lucide-react'
/** A แฟ้มโจทย์ that holds a question, as the cards print it. */
export interface QuestionSetRef {
  id: string
  title: string
  /** True when the signed-in teacher owns the แฟ้ม — only then is it editable. */
  isOwner: boolean
}

/**
 * Every แฟ้มโจทย์ this question sits in.
 *
 * A question can belong to any number of แฟ้ม — that is the whole point of a
 * แฟ้ม being a picked list rather than a folder — so all of them are named
 * rather than counted. Only แฟ้ม the reader may see are here at all; the page
 * reads them under RLS, so a teammate's private แฟ้ม is simply absent.
 *
 * The teacher's own แฟ้ม links to its editor, which is where a question can be
 * taken out or moved between แฟ้มย่อย. A teammate's shared แฟ้ม has no editor
 * for this reader, so it stays plain text.
 */
export function QuestionSetBadges({ sets, showEmpty = false }: {
  sets?: QuestionSetRef[]
  /** Prints "ยังไม่อยู่ในแฟ้ม" when the question is in none. Only for the
   *  teacher's own cards — absence on a teammate's card may just mean their
   *  แฟ้ม is private. */
  showEmpty?: boolean
}) {
  if (!sets || sets.length === 0) {
    if (!showEmpty) return null
    return (
      <span
        title="โจทย์ข้อนี้ยังไม่ได้อยู่ในแฟ้มโจทย์ใด"
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
      >
        <Layers className="w-3 h-3 shrink-0" />
        ยังไม่อยู่ในแฟ้ม
      </span>
    )
  }

  // The full list on every badge, so a title cut short by `truncate` is still
  // readable and a question in many แฟ้ม can be read in one hover.
  const tooltip = `อยู่ในแฟ้มโจทย์ ${sets.length} แฟ้ม: ${sets.map(set => set.title).join(', ')}`
  const badgeClass = 'inline-flex items-center gap-1 max-w-44 text-xs px-2 py-0.5 rounded-full bg-tint-3/10 text-tint-3'

  return (
    <>
      {sets.map(set => set.isOwner ? (
        <Link
          key={set.id}
          href={`/questions/sets/${set.id}/edit`}
          title={tooltip}
          className={`${badgeClass} transition-colors hover:bg-tint-3/20`}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span className="truncate">{set.title}</span>
        </Link>
      ) : (
        <span key={set.id} title={tooltip} className={badgeClass}>
          <Layers className="w-3 h-3 shrink-0" />
          <span className="truncate">{set.title}</span>
        </span>
      ))}
    </>
  )
}
