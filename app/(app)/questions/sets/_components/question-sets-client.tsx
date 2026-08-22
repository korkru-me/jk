'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Layers, Trash2, Edit2, Send, Download, Users, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteQuestionSet } from '@/lib/actions/question-sets'
import { exportQuestionSet } from '@/lib/actions/question-export'
import { downloadTextFile, cn } from '@/lib/utils'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { parseSections } from '@/lib/question-set-sections'
import type { QuestionSetSummary, QuestionSetSummaryWithCreator } from '../page'
import { Card } from '@/components/ui/card'

interface Props {
  mySets: QuestionSetSummary[]
  teamSets: QuestionSetSummaryWithCreator[]
  currentUserId: string
}

export function QuestionSetsClient({ mySets, teamSets, currentUserId }: Props) {
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
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">คลังแฟ้มโจทย์</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} แฟ้มโจทย์ — รวมโจทย์ไว้เป็นแฟ้มเพื่อใช้ซ้ำ</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportQuestionsButton
            label="นำเข้าไฟล์"
            className="gap-2"
            onImported={() => router.refresh()}
          />
          <Link href="/questions/sets/new">
            <Button className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> สร้างแฟ้มโจทย์ใหม่
            </Button>
          </Link>
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
                placeholder="ค้นหาชื่อแฟ้มโจทย์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
          </div>

          {(scope === 'all' || scope === 'mine') && (
            <div className="space-y-3">
              {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">แฟ้มโจทย์ของฉัน</h2>}
              {mySets.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีแฟ้มโจทย์ของคุณ</p>
              ) : filteredMine.length === 0 ? (
                <Card edge="ring" className="text-center py-16">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">ไม่พบแฟ้มโจทย์ที่ตรงกัน</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredMine.map(set => <SetCard key={set.id} set={set} currentUserId={currentUserId} />)}
                </div>
              )}
            </div>
          )}

          {(scope === 'all' || scope === 'team') && (
            <div className="space-y-3">
              {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">แฟ้มโจทย์ที่แชร์ในทีม</h2>}
              {teamSets.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีแฟ้มโจทย์ที่ทีมแชร์ไว้</p>
              ) : filteredTeam.length === 0 ? (
                <Card edge="ring" className="text-center py-16">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">ไม่พบแฟ้มโจทย์ที่ตรงกัน</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredTeam.map(set => <SetCard key={set.id} set={set} currentUserId={currentUserId} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SetCard({ set, currentUserId }: { set: QuestionSetSummaryWithCreator; currentUserId: string }) {
  const [isPending, startTransition] = useTransition()
  const [deleted, setDeleted] = useState(false)
  const isOwner = set.created_by === currentUserId
  const sections = parseSections(set.sections)

  function handleDelete() {
    if (!confirm(`ลบแฟ้มโจทย์ "${set.title}"? ไม่สามารถกู้คืนได้`)) return
    startTransition(async () => {
      const res = await deleteQuestionSet(set.id)
      if (res?.error) toast.error(res.error)
      else setDeleted(true)
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
    <Card edge="ring" padding="md" className="space-y-3 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4 text-primary" />
        </div>
        {isOwner && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleExport}
              disabled={isPending}
              className="text-muted-foreground/40 hover:text-primary transition-colors p-1"
              title="ดาวน์โหลดเป็นไฟล์ (ส่งให้ครูต่างโรงเรียน)"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
              title="ลบแฟ้มโจทย์"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1">
        <p className="font-semibold text-foreground text-sm truncate">{set.title}</p>
        {set.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{set.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1.5">
          {sections.length > 0 && <>{sections.length} หัวข้อ · </>}
          {set.valid_question_count ?? set.question_ids.length} ข้อ
        </p>

        {sections.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {sections.slice(0, 3).map(section => (
              <span key={section.id} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {section.title || 'ไม่ได้ตั้งชื่อ'}
              </span>
            ))}
            {sections.length > 3 && (
              <span className="text-[11px] text-muted-foreground">+{sections.length - 3}</span>
            )}
          </div>
        )}

        {(set.organizations?.name || set.shared_org_names?.length || (!isOwner && set.users?.full_name)) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {set.organizations?.name && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-tint-1/10 text-tint-1">
                {set.organizations.name}
              </span>
            )}
            {set.shared_org_names?.map((name) => (
              <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-tint-2/10 text-tint-2">
                + {name}
              </span>
            ))}
            {!isOwner && set.users?.full_name && (
              <span className="text-[11px] text-muted-foreground">โดย {set.users.full_name}</span>
            )}
          </div>
        )}

      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        {isOwner && (
          <Link href={`/questions/sets/${set.id}/edit`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <Edit2 className="w-3.5 h-3.5" /> แก้ไข
            </Button>
          </Link>
        )}
        {sections.length > 0 ? (
          <div className="flex-1 flex">
            <Link href={`/assignments/new?set=${set.id}`} className="flex-1">
              <Button size="sm" className="w-full gap-1.5 rounded-r-none">
                <Send className="w-3.5 h-3.5" /> ใช้มอบหมาย
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="เลือกหัวข้อที่จะมอบหมาย" />}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>มอบหมายเฉพาะหัวข้อ</DropdownMenuLabel>
                  {sections.map(section => (
                    <DropdownMenuItem
                      key={section.id}
                      render={<Link href={`/assignments/new?set=${set.id}&sections=${section.id}`} />}
                    >
                      {section.title || 'หัวข้อที่ยังไม่ตั้งชื่อ'} ({section.question_ids.length} ข้อ)
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href={`/assignments/new?set=${set.id}`} />}>
                  ทั้งแฟ้ม ({set.valid_question_count ?? set.question_ids.length} ข้อ)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link href={`/assignments/new?set=${set.id}`} className="flex-1">
            <Button size="sm" className="w-full gap-1.5">
              <Send className="w-3.5 h-3.5" /> ใช้มอบหมาย
            </Button>
          </Link>
        )}
      </div>
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
        รวมโจทย์จากคลังไว้ในแฟ้ม แล้วนำไปมอบหมายให้ห้องเรียนได้ทีหลัง
      </p>
      <Link href="/questions/sets/new">
        <Button className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> สร้างแฟ้มโจทย์แรก
        </Button>
      </Link>
    </Card>
  )
}
