'use client'

import { RichText } from '@/components/ui/rich-text'
import { containsMath } from '@/lib/math/latex'
import { isWaitingExamTransport, waitingExamRichTextHtml } from '@/lib/seb-exam-client'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

/** Identical ordinary rendering; canonical images are rewritten only after
 * the existing sanitizer approved their protocol, origin and object path. */
export function WaitingExamRichText({ text, className, blocks = false }: ComponentProps<typeof RichText>) {
  if (!isWaitingExamTransport()) return <RichText text={text} className={className} blocks={blocks} />
  if (!text) return null
  if (/<[a-z][\s\S]*>/i.test(text) || containsMath(text)) {
    const html = { __html: waitingExamRichTextHtml(text) }
    return blocks
      ? <div className={cn('[&_p]:my-1 [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md', className)} dangerouslySetInnerHTML={html} />
      : <span className={cn('[&_p]:inline [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full', className)} dangerouslySetInnerHTML={html} />
  }
  return blocks ? <div className={className}>{text}</div> : <span className={className}>{text}</span>
}
