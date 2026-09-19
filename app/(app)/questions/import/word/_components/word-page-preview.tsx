import { Card } from '@/components/ui/card'
import { numberSampleLines, type ImportProfile, type SampleSpan } from '@/lib/docx-import/profiles'

/** The เฉลย a teacher marks shows as the red it is written in. */
function Spans({ spans }: { spans: SampleSpan[] }) {
  return (
    <>
      {spans.map((span, at) => (
        <span key={at} className={span.answer ? 'font-semibold text-destructive' : undefined}>
          {span.text}
        </span>
      ))}
    </>
  )
}

/**
 * What a correctly laid-out worksheet looks like, drawn as a page.
 *
 * Rules a teacher reads are a list of things to remember; a page is a thing to
 * copy. This draws the profile's own sample — the very content the downloadable
 * .docx is generated from — so what is described, what is shown, and what is
 * handed over are one source.
 *
 * The numbers down the left are drawn here rather than stored in the sample for
 * the same reason Word draws them from `numbering.xml`: they belong to the list,
 * not to the text of any โจทย์.
 */
export function WordPagePreview({ profile }: { profile: ImportProfile }) {
  const lines = numberSampleLines(profile.sample)
  const hasAnswer = profile.sample.some(line => line.spans.some(span => span.answer))

  return (
    <div className="space-y-2">
      <Card padding="lg" elevation="sm" className="space-y-2 leading-relaxed">
        {lines.map(({ line, marker, rightMarker }, index) => {
          const text = <Spans spans={line.spans} />

          // A จับคู่ is a two-column table, and a picture of it that is not one
          // teaches the wrong thing: the rows are what the reader reads.
          if (line.kind === 'pair') {
            const first = lines[index - 1]?.line.kind !== 'pair'
            const last = lines[index + 1]?.line.kind !== 'pair'
            return (
              <div
                key={index}
                className={`ms-6 grid grid-cols-2 border-x border-t border-border text-sm text-foreground ${
                  first ? 'mt-2' : ''
                } ${last ? 'border-b' : ''}`}
              >
                <p className="flex gap-2 border-e border-border px-2 py-1">
                  <span className="shrink-0 tabular-nums text-muted-foreground">{marker}</span>
                  <span className="min-w-0">{text}</span>
                </p>
                <p className="flex gap-2 px-2 py-1">
                  <span className="shrink-0 text-muted-foreground">{rightMarker}</span>
                  <span className="min-w-0"><Spans spans={line.right ?? []} /></span>
                </p>
              </div>
            )
          }

          if (line.kind === 'heading') {
            return (
              <p key={index} className="pb-1 text-center text-sm font-semibold text-foreground">
                {text}
              </p>
            )
          }

          // The orders a เรียงลำดับ ข้อ offers sit a line below the list they
          // reorder, which is how the printed page separates two groups that
          // are both numbered 1. 2. 3. 4.
          const afterItems = line.kind === 'choice' && lines[index - 1]?.line.kind === 'item'

          return (
            <p
              key={index}
              className={`flex gap-2 text-sm text-foreground ${
                line.kind === 'question' ? 'mt-3 first:mt-0' : 'ms-6'
              } ${afterItems ? 'mt-3' : ''}`}
            >
              <span className="shrink-0 tabular-nums text-muted-foreground">{marker}</span>
              <span className="min-w-0">{text}</span>
            </p>
          )
        })}
      </Card>

      <p className="text-xs text-muted-foreground">
        ตัวอย่างหน้าตาไฟล์ Word ที่ระบบอ่านได้
        {hasAnswer && <> · <span className="font-medium text-destructive">สีแดง</span> คือเฉลยที่ครูทำเครื่องหมายไว้</>}
      </p>
    </div>
  )
}
