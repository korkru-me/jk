import Link from 'next/link'
import {
  AlignLeft, ArrowLeftRight, ArrowUpDown, Blocks, CheckSquare, ChevronRight, FileText, FileUp,
  ListChecks, MapPin, Shuffle, Sparkles, Table2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { IMPORT_PROFILES, type ImportProfile } from '@/lib/docx-import/profiles'
import { withBackHref } from '@/lib/back-link'

/**
 * Which kind of โจทย์ the file holds, asked before the file itself.
 *
 * The answer decides what the next screen explains — a worksheet of ปรนัย and
 * a worksheet of เติมคำ are laid out nothing alike, and one page of advice that
 * covers both covers neither. Icons, colours and names are the ones from
 * `/questions/new` on purpose: a teacher meets ปรนัย in one shape whether they
 * type it in or bring it from a file.
 *
 * Types the parser cannot read yet are shown rather than hidden, under their
 * own heading and saying so. A teacher planning next term's files is better
 * served knowing what is coming than by a grid that pretends the feature is
 * complete.
 */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  auto: Sparkles,
  mcq: ListChecks,
  random: Shuffle,
  essay: FileText,
  'fill-blank': AlignLeft,
  'true-false': CheckSquare,
  matching: ArrowLeftRight,
  ordering: ArrowUpDown,
  classify: Table2,
  'image-label': MapPin,
  composite: Blocks,
  'file-upload': FileUp,
}

/** Same colour per type as the สร้างโจทย์ใหม่ page, so the pair reads as one set. */
const COLORS: Record<string, string> = {
  auto: 'border-primary/20 bg-primary/10 text-primary',
  mcq: 'border-success/20 bg-success/10 text-success',
  random: 'border-tint-1/20 bg-tint-1/10 text-tint-1',
  essay: 'border-tint-2/20 bg-tint-2/10 text-tint-2',
  'fill-blank': 'border-tint-2/20 bg-tint-2/10 text-tint-2',
  'true-false': 'border-tint-4/20 bg-tint-4/10 text-tint-4',
  matching: 'border-flag/20 bg-flag/10 text-flag',
  ordering: 'border-warning/20 bg-warning/10 text-warning',
  classify: 'border-tint-4/20 bg-tint-4/10 text-tint-4',
  'image-label': 'border-flag/20 bg-flag/10 text-flag',
  composite: 'border-border bg-muted text-muted-foreground',
  'file-upload': 'border-tint-2/20 bg-tint-2/10 text-tint-2',
}

function ProfileCard({ profile, href }: { profile: ImportProfile; href: string }) {
  const Icon = ICONS[profile.slug] ?? FileText
  const ready = profile.status === 'ready'

  return (
    <Card
      radius="md"
      padding="none"
      interactive
      className={`border-2 ${ready ? COLORS[profile.slug] : 'border-border bg-muted/40 text-muted-foreground'}`}
    >
      <Link href={href} className="flex items-start gap-4 p-4">
        <Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{profile.label}</p>
            {!ready && <Badge variant="outline">เร็ว ๆ นี้</Badge>}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed opacity-75">{profile.blurb}</p>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-40" aria-hidden />
      </Link>
    </Card>
  )
}

export function WordTypeChoice({ selfHref }: { selfHref: string }) {
  const ready = IMPORT_PROFILES.filter(profile => profile.status === 'ready')
  const planned = IMPORT_PROFILES.filter(profile => profile.status === 'planned')

  const hrefFor = (profile: ImportProfile) =>
    withBackHref(`/questions/import/word/${profile.slug}`, selfHref)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">นำเข้าได้แล้ว</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ใบแรกคือไฟล์ที่มีโจทย์หลายข้อคละชนิดกัน · ที่เหลือเลือกเมื่อทั้งไฟล์เป็นชนิดเดียวกัน
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ready.map(profile => (
          <ProfileCard key={profile.slug} profile={profile} href={hrefFor(profile)} />
        ))}
        </div>
      </div>

      {/* Gone entirely once the last type ships, rather than an empty heading
          promising work that is finished. */}
      {planned.length > 0 && (
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">ยังนำเข้าไม่ได้ กำลังทำอยู่</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            กดเข้าไปดูรูปแบบไฟล์ที่กำลังจะรองรับได้ จะได้จัดไฟล์รอไว้ — ตอนนี้สร้างในเว็บได้ตามปกติ
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {planned.map(profile => (
            <ProfileCard key={profile.slug} profile={profile} href={hrefFor(profile)} />
          ))}
        </div>
      </div>
      )}
    </div>
  )
}
