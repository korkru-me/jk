'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Layers, Trash2, Download, Users, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { deleteQuestionSet } from '@/lib/actions/question-sets'
import { exportQuestionSet } from '@/lib/actions/question-export'
import { downloadTextFile, cn } from '@/lib/utils'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import { parseSections } from '@/lib/question-set-sections'
import type {
  QuestionSetSummary,
  QuestionSetSummaryWithCreator,
} from '../page'
import { Card } from '@/components/ui/card'

interface Props {
  mySets: QuestionSetSummary[]
  teamSets: QuestionSetSummaryWithCreator[]
  currentUserId: string
  /**
   * The โจทย์ browser at the foot of the page, handed over already rendered.
   *
   * It arrives as a slot rather than as data because it is the slow half of
   * this page and the แฟ้ม above it are the fast half. Kept as props, every
   * แฟ้ม card waited for a list of โจทย์ nobody had scrolled to yet; as a slot
   * the server can stream it in behind its own Suspense boundary while the
   * แฟ้ม are already on screen.
   */
  libraryPanel: React.ReactNode
}

export function QuestionSetsClient({
  mySets, teamSets, currentUserId, libraryPanel,
}: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'all' | 'mine' | 'team'>('all')

  const totalCount = mySets.length + teamSets.length

  // Sets are found by their title — the one thing a teacher reliably remembers
  // about a set they made.
  function matches(s: QuestionSetSummary) {
    return !search || s.title.toLowerCase().includes(search.toLowerCase())
  }

  const filteredMine = useMemo(() => mySets.filter(matches), [mySets, search])
  const filteredTeam = useMemo(() => teamSets.filter(matches), [teamSets, search])

  return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">คลังแฟ้มโจทย์</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} แฟ้มโจทย์ — รวมโจทย์ไว้เป็นแฟ้มเพื่อใช้ซ้ำ</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportQuestionsButton
            label="นำเข้าไฟล์ KorKru"
            className="gap-2"
            onImported={() => router.refresh()}
          />
          <Button render={<Link href="/questions/sets/new" />} className="shadow-sm">
            <Plus data-icon="inline-start" /> สร้างแฟ้มโจทย์ใหม่
          </Button>
        </div>
      </div>

      {totalCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="inline-flex w-fit items-center rounded-lg bg-muted p-[3px] gap-0.5">
            {([
              { value: 'all' as const, label: 'ทั้งหมด', count: totalCount },
              { value: 'mine' as const, label: 'ของฉัน', count: mySets.length },
              { value: 'team' as const, label: 'แชร์ในทีม', count: teamSets.length },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setScope(opt.value)}
                aria-pressed={scope === opt.value}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 h-[26px] text-sm font-medium transition-all',
                  scope === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground/80'
                )}
              >
                {opt.value === 'team' && <Users className="w-3.5 h-3.5" />}
                {opt.label}
                {opt.count > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold rounded-full px-1.5 leading-[18px]',
                    scope === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {opt.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                aria-label="ค้นหาชื่อแฟ้มโจทย์"
                placeholder="ค้นหาชื่อแฟ้มโจทย์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
          </div>

          {(scope === 'all' || scope === 'mine') && (
            <div className="flex flex-col gap-3">
              {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">แฟ้มโจทย์ของฉัน</h2>}
              {mySets.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีแฟ้มโจทย์ของคุณ</p>
              ) : filteredMine.length === 0 ? (
                <Card edge="ring" className="text-center py-16">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">ไม่พบแฟ้มโจทย์ที่ตรงกัน</p>
                </Card>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
                  {filteredMine.map(set => <SetCard key={set.id} set={set} currentUserId={currentUserId} />)}
                </div>
              )}
            </div>
          )}

          {(scope === 'all' || scope === 'team') && (
            <div className="flex flex-col gap-3">
              {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">แฟ้มโจทย์ที่แชร์ในทีม</h2>}
              {teamSets.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีแฟ้มโจทย์ที่ทีมแชร์ไว้</p>
              ) : filteredTeam.length === 0 ? (
                <Card edge="ring" className="text-center py-16">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">ไม่พบแฟ้มโจทย์ที่ตรงกัน</p>
                </Card>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
                  {filteredTeam.map(set => <SetCard key={set.id} set={set} currentUserId={currentUserId} />)}
                </div>
              )}
            </div>
          )}

          {(scope === 'all' || scope === 'mine') && libraryPanel}
        </>
      )}

      {/* A teacher with no แฟ้ม at all still needs to see the คลัง waiting to be
          filed — that is exactly the state the empty card above describes. */}
      {totalCount === 0 && libraryPanel}
    </div>
  )
}

function SetCard({ set, currentUserId }: { set: QuestionSetSummaryWithCreator; currentUserId: string }) {
  const [isPending, startTransition] = useTransition()
  const [deleted, setDeleted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const isOwner = set.created_by === currentUserId
  const sections = parseSections(set.sections)
  const questionCount = set.valid_question_count ?? set.question_ids.length
  // This is the filing workspace, not an assignment launcher. Owners edit
  // their แฟ้ม; a teammate's read-only แฟ้ม opens its questions in the
  // library below instead of sending the teacher into assignment creation.
  const cardHref = isOwner
    ? `/questions/sets/${set.id}/edit`
    : `/questions/sets?qscope=${encodeURIComponent(set.id)}`
  const cardAction = isOwner ? 'แก้ไขแฟ้มโจทย์' : 'ดูโจทย์ในแฟ้ม'

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteQuestionSet(set.id)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('ลบแฟ้มโจทย์แล้ว')
        setDeleted(true)
      }
    })
  }

  function handleExport() {
    startTransition(async () => {
      const result = await exportQuestionSet(set.id)
      if ('error' in result) { toast.error(result.error); return }
      downloadTextFile(result.filename, result.content)
      toast.success('ดาวน์โหลดไฟล์แฟ้มโจทย์แล้ว')
    })
  }

  if (deleted) return null

  return (
    <Card
      edge="border"
      radius="md"
      elevation="sm"
      interactive
      data-question-set-card
      className="group relative flex flex-col overflow-hidden focus-within:ring-3 focus-within:ring-ring/50"
    >
      {/* The whole card is the link, laid over the content rather than wrapped
          around it: an <a> around the footer would swallow its buttons and
          nest interactive elements. The footer sits above it on z-10. */}
      <Link
        href={cardHref}
        aria-label={`${cardAction} ${set.title}`}
        className="absolute inset-0 z-10 rounded-[inherit] outline-none"
      />

      <div className="relative overflow-hidden border-b border-primary/10 bg-primary/5 p-3">
        <Layers
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 -bottom-5 size-20 text-primary/5 transition-transform group-hover:-translate-y-1 group-hover:rotate-3"
        />
        <div className="relative flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-card text-primary shadow-sm">
            <Layers className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 title={set.title} className="truncate text-base leading-snug font-semibold text-foreground transition-colors group-hover:text-primary">
              {set.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Badge variant="secondary">{questionCount} ข้อ</Badge>
              {sections.length > 0 && (
                <Badge variant="outline">{sections.length} แฟ้มย่อย</Badge>
              )}
            </div>
          </div>
          <ChevronDown
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </div>
      </div>

      <div className="relative flex flex-1 items-center gap-2 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm leading-snug text-muted-foreground">
              {set.description
                || (isOwner ? 'เปิดแฟ้มเพื่อเพิ่มรายละเอียดและจัดลำดับโจทย์' : 'เปิดดูโจทย์ในแฟ้มที่ทีมแชร์ไว้')}
            </p>

            {sections.length > 0 && (
              <div className="flex max-w-[52%] shrink-0 items-center gap-1 overflow-hidden">
                {sections.slice(0, 1).map(section => (
                  <Badge key={section.id} variant="secondary" className="min-w-0 max-w-24 truncate">
                    {section.title || 'ไม่ได้ตั้งชื่อ'}
                  </Badge>
                ))}
                {sections.length > 1 && (
                  <Badge variant="outline">+{sections.length - 1}</Badge>
                )}
              </div>
            )}
          </div>

          {(set.organizations?.name || set.shared_org_names?.length || (!isOwner && set.users?.full_name)) && (
            <div className="flex flex-wrap items-center gap-1">
              {set.organizations?.name && (
                <Badge variant="outline">
                  {set.organizations.name}
                </Badge>
              )}
              {set.shared_org_names?.map((name) => (
                <Badge key={name} variant="secondary">
                  + {name}
                </Badge>
              ))}
              {!isOwner && set.users?.full_name && (
                <span className="text-xs text-muted-foreground">โดย {set.users.full_name}</span>
              )}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="relative z-20 flex shrink-0 items-center gap-1">
            <IconButton
              label={`ดาวน์โหลดแฟ้มโจทย์ ${set.title} เป็นไฟล์`}
              onClick={handleExport}
              disabled={isPending}
              size="xs"
              className="text-muted-foreground hover:text-primary"
            >
              <Download />
            </IconButton>
            <IconButton
              label={`ลบแฟ้มโจทย์ ${set.title}`}
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              size="xs"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 />
            </IconButton>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`ลบแฟ้มโจทย์ “${set.title}”?`}
        description={
          <span className="flex flex-col gap-2">
            <span className="block">แฟ้มนี้จะถูกลบถาวร กู้คืนไม่ได้</span>
            <span className="block">
              โจทย์ {questionCount} ข้อข้างในยังอยู่ในคลังโจทย์ และงานที่มอบหมายไปแล้วจากแฟ้มนี้ไม่ได้รับผลกระทบ
            </span>
          </span>
        }
        confirmLabel="ลบถาวร"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  )
}

function EmptyState() {
  return (
    <Card edge="ring" className="text-center py-24">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Layers className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีแฟ้มโจทย์ในคลัง</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
        รวมโจทย์จากคลังไว้เป็นแฟ้ม เพื่อจัดหมวดหมู่และนำกลับมาใช้ได้ง่าย
      </p>
      <Button render={<Link href="/questions/sets/new" />} className="shadow-sm">
        <Plus data-icon="inline-start" /> สร้างแฟ้มโจทย์แรก
      </Button>
    </Card>
  )
}
