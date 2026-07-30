'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Tag, Layers, Trash2, Edit2, Send, Download, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteQuestionSet, type QuestionSetWithCreator } from '@/lib/actions/question-sets'
import { exportQuestionSet } from '@/lib/actions/question-export'
import { downloadTextFile, cn } from '@/lib/utils'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import type { QuestionSet } from '@/lib/types'

interface Props {
  mySets: QuestionSet[]
  teamSets: QuestionSetWithCreator[]
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

  function matches(s: QuestionSet) {
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
          <h1 className="text-xl font-bold text-gray-900">คลังชุดโจทย์</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalCount} ชุดโจทย์ — รวมโจทย์เป็นชุดไว้ใช้ซ้ำ ไม่ผูกกับห้องเรียน</p>
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
                  scope === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground'
                )}
              >
                {opt.value === 'team' && <Users className="w-3.5 h-3.5" />}
                {opt.label}
                {opt.count > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold rounded-full px-1.5 leading-[18px]',
                    scope === opt.value ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                  )}>
                    {opt.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="ค้นหาชื่อชุดโจทย์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                      activeTag === tag
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
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
              {scope === 'all' && <h2 className="text-sm font-semibold text-gray-700">ชุดโจทย์ของฉัน</h2>}
              {mySets.length === 0 ? (
                <p className="text-sm text-gray-400">ยังไม่มีชุดโจทย์ของคุณ</p>
              ) : filteredMine.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl ring-1 ring-black/5">
                  <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">ไม่พบชุดโจทย์ที่ตรงกัน</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredMine.map(set => <SetCard key={set.id} set={set} currentUserId={currentUserId} />)}
                </div>
              )}
            </div>
          )}

          {(scope === 'all' || scope === 'team') && (
            <div className="space-y-3">
              {scope === 'all' && <h2 className="text-sm font-semibold text-gray-700">ชุดโจทย์ที่แชร์ในทีม</h2>}
              {teamSets.length === 0 ? (
                <p className="text-sm text-gray-400">ยังไม่มีชุดโจทย์ที่ทีมแชร์ไว้</p>
              ) : filteredTeam.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl ring-1 ring-black/5">
                  <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">ไม่พบชุดโจทย์ที่ตรงกัน</p>
                </div>
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

function SetCard({ set, currentUserId }: { set: QuestionSetWithCreator; currentUserId: string }) {
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
    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 space-y-3 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4 text-blue-500" />
        </div>
        {isOwner && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleExport}
              disabled={isPending}
              className="text-gray-300 hover:text-blue-500 transition-colors p-1"
              title="ดาวน์โหลดเป็นไฟล์ (ส่งให้ครูต่างโรงเรียน)"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-gray-300 hover:text-red-500 transition-colors p-1"
              title="ลบชุดโจทย์"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1">
        <p className="font-semibold text-gray-900 text-sm truncate">{set.title}</p>
        {set.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{set.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-1.5">{set.valid_question_count ?? set.question_ids.length} ข้อ</p>

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
              <span className="text-[11px] text-gray-400">โดย {set.users.full_name}</span>
            )}
          </div>
        )}

        {set.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {set.tags.map(tag => (
              <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
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
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-24 bg-white rounded-2xl ring-1 ring-black/5">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Layers className="w-8 h-8 text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">ยังไม่มีชุดโจทย์ในคลัง</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
        รวมโจทย์จากคลังเป็นชุด ติดแท็ก แล้วนำไปมอบหมายให้ห้องเรียนได้ทีหลัง
      </p>
      <Link href="/questions/sets/new">
        <Button className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> สร้างชุดโจทย์แรก
        </Button>
      </Link>
    </div>
  )
}
