'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, LayoutList, Grid3x3, Search, X, SlidersHorizontal, Tag, BookOpen, Layers, Users, Edit2, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { QuestionCard } from './question-card'
import { DIFF_META, TYPE_LABEL } from '@/lib/question-display'
import type { QuestionStats } from '@/lib/question-stats'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import type { QuestionDetailWithCategory, QuestionWithCategory, QuestionWithCreator } from '../page'

const PreviewModal = dynamic(
  () => import('./preview-modal').then(mod => mod.PreviewModal),
  { loading: () => <PreviewLoadingOverlay /> }
)

// ── Mock constants ─────────────────────────────────────────────────────────────

const TAGS = ['อนุภาคมูลฐาน', 'กลศาสตร์', 'เวกเตอร์', 'คลื่น', 'ไฟฟ้า', 'แม่เหล็ก', 'ควอนตัม', 'สัมพัทธภาพ']

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  questions: QuestionWithCategory[]
  /** Item analysis per question id; a question absent here has no graded answers yet. */
  stats: Record<string, QuestionStats>
  teamQuestions: QuestionWithCreator[]
  hasTeamOrg: boolean
  hasMultipleTeams: boolean
  myTeams: { id: string; name: string }[]
  currentUserId: string
}

export function QuestionBankClient({ questions, stats, teamQuestions, hasTeamOrg, hasMultipleTeams, myTeams, currentUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialScopeParam = searchParams.get('tab')
  const [scope,        setScope]        = useState<'all' | 'mine' | 'team'>(
    initialScopeParam === 'mine' || initialScopeParam === 'team' ? initialScopeParam : 'all'
  )
  const [search,       setSearch]       = useState('')
  const [diffFilter,   setDiffFilter]   = useState('all')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [activeTag,    setActiveTag]    = useState<string | null>(null)
  const [viewMode,     setViewMode]     = useState<'list' | 'grid'>('list')
  const [previewQ,     setPreviewQ]     = useState<QuestionDetailWithCategory | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [teamSearch,   setTeamSearch]   = useState('')
  const [teamFilter,   setTeamFilter]   = useState('all')
  const [flaggedIds,   setFlaggedIds]   = useState<Set<string>>(new Set())
  const [showFilters,  setShowFilters]  = useState(false)

  async function openPreview(questionId: string) {
    if (previewLoadingId) return
    setPreviewLoadingId(questionId)
    const result = await getQuestionClientDetail(questionId)
    setPreviewLoadingId(null)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setPreviewQ(result.data as QuestionDetailWithCategory)
  }

  function toggleFlag(id: string) {
    setFlaggedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => questions.filter(q => {
    if (search && !q.title.toLowerCase().includes(search.toLowerCase()) && !q.question_text.toLowerCase().includes(search.toLowerCase())) return false
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false
    if (typeFilter !== 'all' && q.question_type !== typeFilter) return false
    if (activeTag && !(q.tags ?? []).includes(activeTag)) return false
    return true
  }), [questions, search, diffFilter, typeFilter, activeTag])

  const activeFilterCount = [diffFilter !== 'all', typeFilter !== 'all', !!activeTag].filter(Boolean).length

  const filteredTeam = useMemo(() => teamQuestions.filter(q => {
    if (teamFilter !== 'all' && q.org_id !== teamFilter && !q.shared_org_ids?.includes(teamFilter)) return false
    if (teamSearch && !q.title.toLowerCase().includes(teamSearch.toLowerCase()) && !q.question_text.toLowerCase().includes(teamSearch.toLowerCase())) return false
    return true
  }), [teamQuestions, teamSearch, teamFilter])

  return (
    <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">คลังโจทย์ของฉัน</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {scope === 'team'
                ? `${filteredTeam.length} โจทย์`
                : scope === 'all'
                  ? `${questions.length + teamQuestions.length} โจทย์`
                  : filtered.length !== questions.length
                    ? `${filtered.length} จาก ${questions.length} โจทย์`
                    : `${questions.length} โจทย์`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ImportQuestionsButton
              label="นำเข้าไฟล์โจทย์"
              size="sm"
              className="gap-1.5 hidden sm:flex"
              onImported={() => router.refresh()}
            />
            <Link href="/questions/sets/new">
              <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex">
                <Layers className="w-3.5 h-3.5" /> สร้างชุดโจทย์/ชุดแบบฝึกหัด
              </Button>
            </Link>
            <Link href="/questions/new">
              <Button size="sm" className="gap-1.5 shadow-sm">
                <Plus className="w-3.5 h-3.5" /> สร้างโจทย์
              </Button>
            </Link>
          </div>
        </div>

        <div className="inline-flex w-fit items-center rounded-lg bg-muted p-[3px] gap-0.5">
          {([
            { value: 'all' as const, label: 'ทั้งหมด', count: questions.length + teamQuestions.length },
            { value: 'mine' as const, label: 'ของฉัน', count: questions.length },
            { value: 'team' as const, label: 'แชร์ในทีม', count: teamQuestions.length },
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

        {(scope === 'all' || scope === 'mine') && (
          <div className="space-y-4">
            {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">โจทย์ของฉัน</h2>}

        {/* Search + controls */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อโจทย์ หรือเนื้อหา..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(f => !f)}
            className={`gap-1.5 shrink-0 ${showFilters || activeFilterCount > 0 ? 'border-primary bg-primary/10 text-primary' : ''}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            กรอง
            {activeFilterCount > 0 && (
              <span className="bg-primary text-white text-[10px] font-bold rounded-full px-1.5 leading-[18px]">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="bg-card rounded-2xl ring-1 ring-border p-4 space-y-4">
            <div className="flex gap-8 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">ระดับความยาก</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['all', 'easy', 'medium', 'hard', 'analytical'].map(d => (
                    <button
                      key={d}
                      onClick={() => setDiffFilter(d)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        diffFilter === d
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-border text-muted-foreground hover:border-ring'
                      }`}
                    >
                      {d === 'all' ? 'ทั้งหมด' : DIFF_META[d]?.label ?? d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">รูปแบบโจทย์</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['all', ...Object.keys(TYPE_LABEL)].map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        typeFilter === t
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-border text-muted-foreground hover:border-ring'
                      }`}
                    >
                      {t === 'all' ? 'ทั้งหมด' : TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> แท็ก
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {TAGS.map(tag => (
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
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setDiffFilter('all'); setTypeFilter('all'); setActiveTag(null) }}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
              >
                <X className="w-3 h-3" /> ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {activeFilterCount > 0 && !showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">กรองโดย:</span>
            {diffFilter !== 'all' && (
              <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                {DIFF_META[diffFilter]?.label}
                <button onClick={() => setDiffFilter('all')} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                {TYPE_LABEL[typeFilter]}
                <button onClick={() => setTypeFilter('all')} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeTag && (
              <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                #{activeTag}
                <button onClick={() => setActiveTag(null)} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        {/* Question list */}
        {questions.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl ring-1 ring-border">
            <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">ไม่พบโจทย์ที่ตรงกัน</p>
            <p className="text-sm text-muted-foreground mt-1">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'space-y-2.5'}>
            {filtered.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                isFlagged={flaggedIds.has(q.id)}
                onPreview={() => void openPreview(q.id)}
                onToggleFlag={() => toggleFlag(q.id)}
                myTeams={myTeams}
                stats={stats[q.id]}
              />
            ))}
          </div>
        )}
          </div>
        )}

        {(scope === 'all' || scope === 'team') && (
          <div className="space-y-4">
            {scope === 'all' && <h2 className="text-sm font-semibold text-muted-foreground">โจทย์ที่แชร์ในทีม</h2>}
            {!hasTeamOrg ? (
              <div className="text-center py-24 bg-card rounded-2xl ring-1 ring-border">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีทีม</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">สร้างหรือเข้าร่วมทีมก่อน เพื่อดูโจทย์ที่เพื่อนครูแชร์ไว้</p>
                <Link href="/settings/team">
                  <Button className="gap-2 shadow-sm">ไปที่หน้าทีมของฉัน</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="ค้นหาชื่อโจทย์ หรือเนื้อหา..."
                      value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      className="pl-9 bg-card"
                    />
                  </div>
                  {hasMultipleTeams && (
                    <Select value={teamFilter} onValueChange={(v) => v !== null && setTeamFilter(v)}>
                      <SelectTrigger className="bg-card">
                        <SelectValue placeholder="ทุกทีม">
                          {teamFilter === 'all' ? 'ทุกทีม' : myTeams.find(t => t.id === teamFilter)?.name ?? 'ทุกทีม'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกทีม</SelectItem>
                        {myTeams.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {teamQuestions.length === 0 ? (
                  <div className="text-center py-24 bg-card rounded-2xl ring-1 ring-border">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีโจทย์ที่แชร์ในทีม</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">เมื่อสมาชิกในทีมสร้างโจทย์และเลือก &ldquo;ทีมของฉัน&rdquo; โจทย์จะปรากฏที่นี่</p>
                  </div>
                ) : filteredTeam.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-2xl ring-1 ring-border">
                    <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">ไม่พบโจทย์ที่ตรงกัน</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredTeam.map(q => (
                      <TeamQuestionCard key={q.id} question={q} showTeamName={hasMultipleTeams} currentUserId={currentUserId} onPreview={() => void openPreview(q.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      {/* Preview modal */}
      {previewLoadingId && <PreviewLoadingOverlay />}
      {previewQ && (
        <PreviewModal
          question={previewQ}
          isFlagged={flaggedIds.has(previewQ.id)}
          onClose={() => setPreviewQ(null)}
          onToggleFlag={() => toggleFlag(previewQ.id)}
          stats={stats[previewQ.id]}
        />
      )}
    </div>
  )
}

function PreviewLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" aria-label="กำลังโหลดตัวอย่างโจทย์">
      <div className="h-80 w-full max-w-2xl animate-pulse rounded-2xl bg-card" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-24 bg-card rounded-2xl ring-1 ring-border">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <BookOpen className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีโจทย์ในคลัง</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">เริ่มสร้างโจทย์แรกเพื่อสร้างคลังข้อสอบฟิสิกส์</p>
      <Link href="/questions/new">
        <Button className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> สร้างโจทย์แรก
        </Button>
      </Link>
    </div>
  )
}

// ── TeamQuestionCard ─────────────────────────────────────────────────────────
// The creator can always edit their own question here; a teammate can too, but
// only if the creator turned on "อนุญาตให้เพื่อนในทีมแก้ไข" — enforced server-side.

function TeamQuestionCard({ question: q, showTeamName, currentUserId, onPreview }: {
  question: QuestionWithCreator
  showTeamName: boolean
  currentUserId: string
  onPreview: () => void
}) {
  const diff = DIFF_META[q.difficulty]
  const isGroup = q.order_in_group === 0
  const isOwner = q.created_by === currentUserId
  const canEdit = isOwner || q.team_edit_allowed

  return (
    <div className="bg-card rounded-2xl ring-1 ring-border hover:ring-blue-200 transition-all p-4">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {isGroup && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">📚 หลายขั้นตอน</span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.badge}`}>
          {diff?.label}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {TYPE_LABEL[q.question_type] ?? q.question_type}
        </span>
        {q.question_categories?.name && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {q.question_categories.name}
          </span>
        )}
        {showTeamName && q.organizations?.name && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
            {q.organizations.name}
          </span>
        )}
        {q.shared_org_names?.map((name) => (
          <span key={name} className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">
            + {name}
          </span>
        ))}
      </div>

      <button
        onClick={onPreview}
        className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left line-clamp-1 w-full"
      >
        {q.title}
      </button>
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{q.question_text}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          โดย {q.users?.full_name || 'ไม่ทราบชื่อ'}
        </span>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <Link
              href={isGroup ? `/questions/multi/${q.group_id}` : `/questions/${q.id}/edit?tab=team`}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-muted hover:bg-accent rounded-lg transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> แก้ไข
            </Link>
          )}
          <button
            onClick={onPreview}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/10 rounded-lg transition-all"
          >
            <Eye className="w-3.5 h-3.5" /> ดูตัวอย่าง
          </button>
        </div>
      </div>
    </div>
  )
}
