'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, LayoutList, Grid3x3, Search, X, SlidersHorizontal, Tag, BookOpen, Layers, Users, Edit2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FolderSidebar } from './folder-sidebar'
import { QuestionCard, TYPE_LABEL, DIFF_META, type Teacher } from './question-card'
import { PreviewModal } from './preview-modal'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import type { QuestionWithCategory, QuestionWithCreator } from '../page'

// ── Mock constants ─────────────────────────────────────────────────────────────

export const MOCK_TEACHERS: Teacher[] = [
  { id: 't1', name: 'ครูพัชรีญา ส่งแสง', initials: 'พ', color: 'bg-pink-100 text-pink-700' },
  { id: 't2', name: 'ครูวิชัย สมบูรณ์',  initials: 'ว', color: 'bg-blue-100 text-blue-700' },
  { id: 't3', name: 'ครูสุภาพร ใจดี',    initials: 'ส', color: 'bg-green-100 text-green-700' },
]

const MOCK_FOLDERS = [
  { id: 'all', name: 'โจทย์ทั้งหมด',     emoji: '📚' },
  { id: 'f1',  name: 'ฟิสิกส์ ม.4',      emoji: '⚙️' },
  { id: 'f2',  name: 'ข้อสอบ PISA',      emoji: '🌍' },
  { id: 'f3',  name: 'คลังข้อสอบ CERN',  emoji: '⚛️' },
  { id: 'f4',  name: 'ทดสอบปลายภาค',     emoji: '📋' },
]

const TAGS = ['อนุภาคมูลฐาน', 'กลศาสตร์', 'เวกเตอร์', 'คลื่น', 'ไฟฟ้า', 'แม่เหล็ก', 'ควอนตัม', 'สัมพัทธภาพ']

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  questions: QuestionWithCategory[]
  teamQuestions: QuestionWithCreator[]
  hasTeamOrg: boolean
  hasMultipleTeams: boolean
  currentUserId: string
}

export function QuestionBankClient({ questions, teamQuestions, hasTeamOrg, hasMultipleTeams, currentUserId }: Props) {
  const router = useRouter()
  const [tab,          setTab]          = useState<'mine' | 'team'>('mine')
  const [folder,       setFolder]       = useState('all')
  const [search,       setSearch]       = useState('')
  const [diffFilter,   setDiffFilter]   = useState('all')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [activeTag,    setActiveTag]    = useState<string | null>(null)
  const [viewMode,     setViewMode]     = useState<'list' | 'grid'>('list')
  const [previewQ,     setPreviewQ]     = useState<QuestionWithCategory | null>(null)
  const [teamSearch,   setTeamSearch]   = useState('')
  const [flaggedIds,   setFlaggedIds]   = useState<Set<string>>(new Set())
  const [showFilters,  setShowFilters]  = useState(false)

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

  const typeBreakdown = useMemo(() => {
    const m: Record<string, number> = {}
    for (const q of questions) m[q.question_type] = (m[q.question_type] ?? 0) + 1
    return m
  }, [questions])

  const filteredTeam = useMemo(() => teamQuestions.filter(q =>
    !teamSearch ||
    q.title.toLowerCase().includes(teamSearch.toLowerCase()) ||
    q.question_text.toLowerCase().includes(teamSearch.toLowerCase())
  ), [teamQuestions, teamSearch])

  return (
    <div className="flex gap-5">
      {/* ── Sidebar ───────────────────────────────────── */}
      {tab === 'mine' && (
        <FolderSidebar
          folders={MOCK_FOLDERS}
          selectedFolder={folder}
          onSelectFolder={setFolder}
          totalCount={questions.length}
          flaggedCount={flaggedIds.size}
          typeBreakdown={typeBreakdown}
        />
      )}

      {/* ── Main ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">คลังโจทย์ของฉัน</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length !== questions.length
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

        <Tabs value={tab} onValueChange={(v) => v && setTab(v as 'mine' | 'team')}>
          <TabsList>
            <TabsTrigger value="mine">ของฉัน</TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="w-3.5 h-3.5" /> ทีมของฉัน
              {teamQuestions.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 leading-[18px]">
                  {teamQuestions.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="space-y-4">

        {/* Search + controls */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="ค้นหาชื่อโจทย์ หรือเนื้อหา..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(f => !f)}
            className={`gap-1.5 shrink-0 ${showFilters || activeFilterCount > 0 ? 'border-blue-400 bg-blue-50 text-blue-600' : ''}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            กรอง
            {activeFilterCount > 0 && (
              <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 leading-[18px]">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 space-y-4">
            <div className="flex gap-8 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">ระดับความยาก</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['all', 'easy', 'medium', 'hard', 'analytical'].map(d => (
                    <button
                      key={d}
                      onClick={() => setDiffFilter(d)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        diffFilter === d
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {d === 'all' ? 'ทั้งหมด' : DIFF_META[d]?.label ?? d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">รูปแบบโจทย์</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['all', ...Object.keys(TYPE_LABEL)].map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        typeFilter === t
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {t === 'all' ? 'ทั้งหมด' : TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> แท็ก
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {TAGS.map(tag => (
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
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setDiffFilter('all'); setTypeFilter('all'); setActiveTag(null) }}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                <X className="w-3 h-3" /> ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {activeFilterCount > 0 && !showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">กรองโดย:</span>
            {diffFilter !== 'all' && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                {DIFF_META[diffFilter]?.label}
                <button onClick={() => setDiffFilter('all')} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                {TYPE_LABEL[typeFilter]}
                <button onClick={() => setTypeFilter('all')} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeTag && (
              <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                #{activeTag}
                <button onClick={() => setActiveTag(null)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        {/* Question list */}
        {questions.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl ring-1 ring-black/5">
            <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">ไม่พบโจทย์ที่ตรงกัน</p>
            <p className="text-sm text-gray-400 mt-1">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 xl:grid-cols-2 gap-3' : 'space-y-2.5'}>
            {filtered.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                isFlagged={flaggedIds.has(q.id)}
                onPreview={() => setPreviewQ(q)}
                onToggleFlag={() => toggleFlag(q.id)}
                teachers={MOCK_TEACHERS}
              />
            ))}
          </div>
        )}
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            {!hasTeamOrg ? (
              <div className="text-center py-24 bg-white rounded-2xl ring-1 ring-black/5">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">ยังไม่มีทีม</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">สร้างหรือเข้าร่วมทีมก่อน เพื่อดูโจทย์ที่เพื่อนครูแชร์ไว้</p>
                <Link href="/settings/team">
                  <Button className="gap-2 shadow-sm">ไปที่หน้าทีมของฉัน</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="ค้นหาชื่อโจทย์ หรือเนื้อหา..."
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    className="pl-9 bg-white"
                  />
                </div>

                {teamQuestions.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-2xl ring-1 ring-black/5">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">ยังไม่มีโจทย์ที่แชร์ในทีม</h3>
                    <p className="text-sm text-gray-500 max-w-xs mx-auto">เมื่อสมาชิกในทีมสร้างโจทย์และเลือก &ldquo;ทีมของฉัน&rdquo; โจทย์จะปรากฏที่นี่</p>
                  </div>
                ) : filteredTeam.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl ring-1 ring-black/5">
                    <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">ไม่พบโจทย์ที่ตรงกัน</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredTeam.map(q => (
                      <TeamQuestionCard key={q.id} question={q} showTeamName={hasMultipleTeams} currentUserId={currentUserId} onPreview={() => setPreviewQ(q)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview modal */}
      {previewQ && (
        <PreviewModal
          question={previewQ}
          isFlagged={flaggedIds.has(previewQ.id)}
          onClose={() => setPreviewQ(null)}
          onToggleFlag={() => toggleFlag(previewQ.id)}
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-24 bg-white rounded-2xl ring-1 ring-black/5">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <BookOpen className="w-8 h-8 text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">ยังไม่มีโจทย์ในคลัง</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">เริ่มสร้างโจทย์แรกเพื่อสร้างคลังข้อสอบฟิสิกส์</p>
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
    <div className="bg-white rounded-2xl ring-1 ring-black/5 hover:ring-blue-200 transition-all p-4">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {isGroup && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">📚 หลายขั้นตอน</span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.color}`}>
          {diff?.label}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {TYPE_LABEL[q.question_type] ?? q.question_type}
        </span>
        {q.question_categories?.name && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
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
        className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left line-clamp-1 w-full"
      >
        {q.title}
      </button>
      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{q.question_text}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <span className="text-xs text-gray-400">
          โดย {q.users?.full_name || 'ไม่ทราบชื่อ'}
        </span>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <Link
              href={isGroup ? `/questions/multi/${q.group_id}` : `/questions/${q.id}/edit`}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> แก้ไข
            </Link>
          )}
          <button
            onClick={onPreview}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
          >
            <BookOpen className="w-3.5 h-3.5" /> ดูตัวอย่าง
          </button>
        </div>
      </div>
    </div>
  )
}
