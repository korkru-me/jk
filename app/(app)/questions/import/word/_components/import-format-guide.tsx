import { CircleAlert, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ImportProfile } from '@/lib/docx-import/profiles'
import { WordPagePreview } from './word-page-preview'

/**
 * How to lay the file out, for one kind of โจทย์.
 *
 * Numbered, because the messages a teacher gets when the file is wrong say
 * which rule was not met, and a rule they can count to is a rule they can find
 * again. The list and the example page come from the same profile, so advice
 * and example cannot say different things.
 *
 * For a type the parser cannot read yet the same list is shown as a proposal,
 * labelled as one. Nothing parses it, and nothing may be built from it until a
 * real worksheet confirms the shape — a convention guessed wrong is one every
 * teacher has to reformat their files to escape.
 */
export function ImportFormatGuide({ profile }: { profile: ImportProfile }) {
  const planned = profile.status === 'planned'

  return (
    <Card padding="md" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {planned ? 'ร่างรูปแบบไฟล์ที่กำลังจะรองรับ' : 'จัดไฟล์แบบนี้ แล้วระบบอ่านได้แม่นที่สุด'}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {planned
            ? 'ยังไม่ตายตัว — ถ้าไฟล์ของคุณเขียนคนละแบบ ส่งไฟล์ตัวอย่างมาได้ เราจะทำตามของจริงที่ครูใช้อยู่'
            : `สำหรับโจทย์${profile.label}`}
        </p>
      </div>

      <ol className="space-y-2">
        {profile.rules.map((rule, index) => (
          <li key={rule.id} className="flex gap-2.5 text-xs leading-relaxed text-foreground">
            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0">{rule.text}</span>
          </li>
        ))}
      </ol>

      <WordPagePreview profile={profile} />

      {/* Only for a format that is settled. Handing out a file written to a
          convention still under discussion would have teachers reformatting
          twice. */}
      {!planned && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3">
          <a href={`/api/questions/import-sample/${profile.slug}`} download>
            <Button type="button" variant="outline" size="sm">
              <Download aria-hidden /> ดาวน์โหลดไฟล์ตัวอย่าง .docx
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            เปิดใน Word แล้วพิมพ์โจทย์ของคุณทับได้เลย รูปแบบจะถูกอยู่แล้ว
          </p>
        </div>
      )}

      {profile.limits.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <CircleAlert className="size-3.5 text-warning" aria-hidden />
            สิ่งที่ไฟล์ Word พามาให้ไม่ได้
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-relaxed text-muted-foreground">
            {profile.limits.map(limit => <li key={limit}>{limit}</li>)}
          </ul>
        </div>
      )}
    </Card>
  )
}
