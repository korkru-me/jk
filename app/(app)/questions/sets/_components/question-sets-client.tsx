'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Tag, Layers, Trash2, Edit2, Send, Download, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteQuestionSet } from '@/lib/actions/question-sets'
import { exportQuestionSet } from '@/lib/actions/question-export'
import { downloadTextFile, cn } from '@/lib/utils'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
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
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | 'mine' | 'team'>('all')

  const totalCount = mySets.length + teamSets.length
  const allTags = useMemo(
    () => Array.from(new Set([...mySets, ...teamSets].flatMap(s => s.tags))),
    [mySets, teamSets]
  )

  function matches(s: QuestionSetSummary) {
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    if (activeTag && !s.tags.includes(activeTag)) return false
    return true
  }

  const filteredMine = useMemo(() => mySets.filter(matches), [mySets, search, activeTag])
  const filteredTeam = useMemo(() => teamSets.filter(matches), [teamSets, search, activeTag])

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">คลังชุดโจทย์</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} ชุดโจทย์ — รวมโจทย์เป็นชุดไว้ใช้ซ้ำ ไม่ผูกกับห้องเรียน</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportQuestionsButton
            label="นำเข้าไฟล์"
            className="gap-2"
            onImported={() => router.refresh()}
          />
          <Link href="/questions/sets/new">
            <Button className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> สร้างชุดโจทย์ใหม่
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
                    scope === opt.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
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
                placeholder="ค้นหาชื่อชุดโจทย์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                      activeTag === tag
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/20 hover:text-primary'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(scope === 'all' || scope === 'mine') && (
            <div className="space-y-3">
              {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">ชุดโจทย์ของฉัน</h2>}
              {mySets.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีชุดโจทย์ของคุณ</p>
              ) : filteredMine.length === 0 ? (
                <Card edge="ring" className="text-center py-16">
                  <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">ไม่พบชุดโจทย์ที่ตรงกัน</p>
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
              {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">ชุดโจทย์ที่แชร์ในทีม</h2>}
              {teamSets.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีชุดโจทย์ที่ทีมแชร์ไว้</p>
              ) : filteredTeam.length === 0 ? (
                <Card edge="ring" className="text-center py-16">
                  <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">ไม่พบชุดโจทย์ที่ตรงกัน</p>
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

  function handleDelete() {
    if (!confirm(`ลบชุดโจทย์ "${set.title}"? ไม่สามารถกู้คืนได้`)) return
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
      toast.success('ดาวน์โหลดไฟล์ชุดโจทย์แล้ว')
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
              className="text-gray-300 hover:text-primary transition-colors p-1"
              title="ดาวน์โหลดเป็นไฟล์ (ส่งให้ครูต่างโรงเรียน)"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-gray-300 hover:text-destructive transition-colors p-1"
              title="ลบชุดโจทย์"
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
        <p className="text-xs text-muted-foreground mt-1.5">{set.valid_question_count ?? set.question_ids.length} ข้อ</p>

        {(set.organizations?.name || set.shared_org_names?.length || (!isOwner && set.users?.full_name)) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {set.organizations?.name && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                {set.organizations.name}
              </span>
            )}
            {set.shared_org_names?.map((name) => (
              <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">
                + {name}
              </span>
            ))}
            {!isOwner && set.users?.full_name && (
              <span className="text-[11px] text-muted-foreground">โดย {set.users.full_name}</span>
            )}
          </div>
        )}

        {set.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {set.tags.map(tag => (
              <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                #{tag}
              </span>
            ))}
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
        <Link href={`/assignments/new?set=${set.id}`} className="flex-1">
          <Button size="sm" className="w-full gap-1.5">
            <Send className="w-3.5 h-3.5" /> ใช้มอบหมาย
          </Button>
        </Link>
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
      <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีชุดโจทย์ในคลัง</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
        รวมโจทย์จากคลังเป็นชุด ติดแท็ก แล้วนำไปมอบหมายให้ห้องเรียนได้ทีหลัง
      </p>
      <Link href="/questions/sets/new">
        <Button className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> สร้างชุดโจทย์แรก
        </Button>
      </Link>
    </Card>
  )
}
