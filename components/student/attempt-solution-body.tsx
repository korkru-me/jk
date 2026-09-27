'use client'

import { LightbulbOff } from 'lucide-react'
import { RichText } from '@/components/ui/rich-text'
import { SolutionFiles } from '@/components/questions/solution-files'
import { attemptItemHasSolution, type AttemptSolutionItem } from '@/lib/attempt-solutions'

/**
 * One ข้อ of the เฉลยวิธีทำ viewer: the โจทย์ it belongs to, with the numbers
 * this student was given, then the เฉลย the teacher attached.
 *
 * A module of its own because RichText brings KaTeX, which the summary page
 * has no other client-side use for — the viewer loads this on its first open
 * (or on hovering the button) rather than every visit paying for it.
 */
export function AttemptSolutionBody({ item }: { item: AttemptSolutionItem }) {
  const hasSolution = attemptItemHasSolution(item)

  return (
    <div className="min-w-0 space-y-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">โจทย์</h3>
        <div className="space-y-3 rounded-xl bg-muted/60 p-3">
          {item.questionText === null ? (
            <p className="text-sm text-muted-foreground">โจทย์ข้อนี้ถูกลบออกจากคลังแล้ว</p>
          ) : (
            <RichText text={item.questionText} blocks className="text-sm leading-relaxed text-foreground" />
          )}
          {item.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.imageUrls.map(url => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`รูปประกอบโจทย์ข้อ ${item.number}`}
                  loading="lazy"
                  decoding="async"
                  className="max-h-48 max-w-full rounded-lg border object-contain"
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">เฉลยวิธีทำ</h3>
        {hasSolution ? (
          <div className="space-y-3">
            {item.solutionText && (
              <RichText text={item.solutionText} blocks className="text-sm leading-relaxed text-foreground" />
            )}
            <SolutionFiles
              urls={item.solutionFiles}
              alt={`เฉลยวิธีทำข้อ ${item.number}`}
              imageClassName="h-auto max-w-full rounded-lg border object-contain"
            />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LightbulbOff className="size-4 shrink-0" aria-hidden="true" />
            ครูไม่ได้แนบเฉลยวิธีทำของข้อนี้
          </p>
        )}
      </section>
    </div>
  )
}
