'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import katex from 'katex'
import { toast } from 'sonner'
import {
  Save,
  Clock,
  Eye,
  Code2,
  Layers,
  Tag,
  Image,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Sigma,
  BarChart3,
  Pencil,
  BookOpen,
  Wand2,
  CheckCircle,
  Loader2,
  Info,
  X,
  AlertTriangle,
  SplitSquareHorizontal,
  PenLine,
} from 'lucide-react'

import { VariableEditor } from '@/components/questions/variable-editor'
import { LogicRuleBuilder } from '@/components/questions/logic-rule-builder'
import { WhiteboardModal } from '@/components/questions/whiteboard-modal'
import { GraphBuilder } from './graph-builder'
import { RandomizationModal } from './randomization-modal'
import { RevisionHistoryModal } from './revision-history-modal'
import { useAutoDraft } from '@/hooks/use-auto-draft'
import { suggestTagsFromText, ALL_PHYSICS_TAGS } from '@/lib/questions/tag-suggestions'
import { formatSIUnit, checkSigFigConsistency } from '@/lib/questions/si-unit-engine'
import { randomizeVariables, evaluateFormula, PYTHAGOREAN_FAMILIES } from '@/lib/math/evaluator'

import type { Variable, LogicRule, PythagoreanGroup, Difficulty, Visibility, FormulaPreset, QuestionCategory } from '@/lib/types'
import { THAI_SUBJECTS } from '@/components/questions/general-info-section'

// ─── Types ────────────────────────────────────────────────────────────────────

type LeftTab = 'editor' | 'variables' | 'tags' | 'media'
type QuestionMode = 'single' | 'scenario'
type EditorMode = 'write' | 'preview'

interface SubQuestion {
  id: string
  label: string
  text: string
  formula: string
  unit: string
}

interface EditorState {
  title: string
  subject: string
  difficulty: Difficulty
  visibility: Visibility
  categoryId: string
  tags: string[]
  questionMode: QuestionMode
  questionText: string
  scenarioContext: string
  subQuestions: SubQuestion[]
  variables: Variable[]
  answerFormula: string
  answerUnit: string
  tolerance: number
  answerStep: number
  logicRules: LogicRule[]
  pythagoreanGroups: PythagoreanGroup[]
}

interface Props {
  allTags: string[]
  presets: (FormulaPreset & { question_categories: { name: string } | null })[]
  categories: QuestionCategory[]
  draftKey?: string
}

// ─── LaTeX Preset Snippets ───────────────────────────────────────────────────

const LATEX_PRESETS = [
  { label: 'F=ma',           snippet: '$F = ma$' },
  { label: 'v²=u²+2as',      snippet: '$v^2 = u^2 + 2as$' },
  { label: 'E=½mv²',         snippet: '$E_k = \\frac{1}{2}mv^2$' },
  { label: 'p=mv',           snippet: '$p = mv$' },
  { label: 'W=Fd',           snippet: '$W = Fd\\cos\\theta$' },
  { label: 'E=mc²',          snippet: '$E = mc^2$' },
  { label: 'PV=nRT',         snippet: '$PV = nRT$' },
  { label: 'F=kq₁q₂/r²',    snippet: '$F = k\\frac{q_1 q_2}{r^2}$' },
  { label: 'λ=v/f',          snippet: '$\\lambda = \\frac{v}{f}$' },
  { label: 'τ=rF sinθ',      snippet: '$\\tau = rF\\sin\\theta$' },
  { label: 'ΣF=0',           snippet: '$\\sum F = 0$' },
  { label: '½mv²+mgh',       snippet: '$\\frac{1}{2}mv_0^2 + mgh_0 = \\frac{1}{2}mv^2 + mgh$' },
  { label: 'sin θ',          snippet: '$\\sin\\theta$' },
  { label: '√()',             snippet: '$\\sqrt{}$' },
  { label: 'เศษส่วน',        snippet: '$\\frac{}{}$' },
  { label: 'ยกกำลัง',        snippet: '$x^{}$' },
  { label: 'ห้อย',           snippet: '$x_{}$' },
]

// ─── SI unit keywords → display ──────────────────────────────────────────────

const SI_QUICK: { raw: string; display: string }[] = [
  { raw: 'm/s',     display: 'm/s' },
  { raw: 'm/s^2',   display: 'm/s²' },
  { raw: 'kg',      display: 'kg' },
  { raw: 'N',       display: 'N' },
  { raw: 'J',       display: 'J' },
  { raw: 'W',       display: 'W' },
  { raw: 'Pa',      display: 'Pa' },
  { raw: 'Hz',      display: 'Hz' },
  { raw: 'kg/m^3',  display: 'kg/m³' },
  { raw: 'rad/s',   display: 'rad/s' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderLatex(text: string): string {
  if (!text) return ''
  const parts: string[] = []
  let remaining = text

  // Process $$...$$ (block) then $...$ (inline)
  const blockRx = /\$\$([\s\S]*?)\$\$/g
  const inlineRx = /\$((?:[^$\\]|\\.)+?)\$/g

  let lastIndex = 0
  const allMatches: { index: number; end: number; math: string; display: boolean }[] = []

  let m: RegExpExecArray | null

  const blockRxClean = /\$\$([\s\S]*?)\$\$/g
  while ((m = blockRxClean.exec(remaining)) !== null) {
    allMatches.push({ index: m.index, end: m.index + m[0].length, math: m[1], display: true })
  }

  const inlineRxClean = /\$((?:[^$\\]|\\.)+?)\$/g
  while ((m = inlineRxClean.exec(remaining)) !== null) {
    // Skip if this range overlaps with a block match
    const overlaps = allMatches.some(
      bm => bm.display && m!.index >= bm.index && m!.index < bm.end
    )
    if (!overlaps) {
      allMatches.push({ index: m.index, end: m.index + m[0].length, math: m[1], display: false })
    }
  }

  allMatches.sort((a, b) => a.index - b.index)

  for (const match of allMatches) {
    // Text before match
    const before = remaining.slice(lastIndex, match.index)
    if (before) {
      parts.push(escapeHtml(before))
    }
    try {
      parts.push(
        katex.renderToString(match.math, {
          displayMode: match.display,
          throwOnError: false,
          strict: false,
        })
      )
    } catch {
      parts.push(escapeHtml(match.display ? `$$${match.math}$$` : `$${match.math}$`))
    }
    lastIndex = match.end
  }

  // Remaining text
  const tail = remaining.slice(lastIndex)
  if (tail) parts.push(escapeHtml(tail))

  return parts.join('')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')
}

function emptySubQuestion(index: number): SubQuestion {
  const labels = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8']
  return {
    id: crypto.randomUUID(),
    label: labels[index] ?? `1.${index + 1}`,
    text: '',
    formula: '',
    unit: '',
  }
}

const INITIAL_STATE: EditorState = {
  title: '',
  subject: '',
  difficulty: 'medium',
  visibility: 'private',
  categoryId: '',
  tags: [],
  questionMode: 'single',
  questionText: '',
  scenarioContext: '',
  subQuestions: [],
  variables: [],
  answerFormula: '',
  answerUnit: '',
  tolerance: 0.05,
  answerStep: 0,
  logicRules: [],
  pythagoreanGroups: [],
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdvancedEditor({ allTags, presets, categories, draftKey = 'advanced-editor-draft' }: Props) {
  const [state, setState] = useState<EditorState>(INITIAL_STATE)
  const [leftTab, setLeftTab] = useState<LeftTab>('editor')
  const [editorMode, setEditorMode] = useState<EditorMode>('write')
  const [showRandomModal, setShowRandomModal] = useState(false)
  const [showRevHistory, setShowRevHistory] = useState(false)
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [showGraphBuilder, setShowGraphBuilder] = useState(false)
  const [expandedSubQ, setExpandedSubQ] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [previewResult, setPreviewResult] = useState<{ values: Record<string, number>; answer: number | string } | null>(null)
  const [magicTupleChoice, setMagicTupleChoice] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-draft
  const draft = useAutoDraft(draftKey, state, 3000)

  // Derived: live LaTeX render
  const renderedQuestion = useMemo(() => renderLatex(state.questionText), [state.questionText])
  const renderedScenario  = useMemo(() => renderLatex(state.scenarioContext), [state.scenarioContext])

  // Derived: sig-fig check
  const sigFigCheck = useMemo(() => {
    if (!previewResult || typeof previewResult.answer !== 'number') return null
    const inputVals = Object.values(previewResult.values)
    return checkSigFigConsistency(inputVals, previewResult.answer)
  }, [previewResult])

  // Derived: tag suggestions from question text
  const suggestedTags = useMemo(
    () => suggestTagsFromText(state.questionText + ' ' + state.scenarioContext),
    [state.questionText, state.scenarioContext]
  )

  // Patch helper
  const patch = useCallback((updates: Partial<EditorState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  // Insert LaTeX snippet at cursor
  function insertSnippet(snippet: string) {
    const ta = textareaRef.current
    if (!ta) {
      patch({ questionText: state.questionText + snippet })
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = state.questionText.slice(0, start)
    const after  = state.questionText.slice(end)
    const newText = before + snippet + after
    patch({ questionText: newText })
    requestAnimationFrame(() => {
      ta.focus()
      const cursor = start + snippet.length
      ta.setSelectionRange(cursor, cursor)
    })
  }

  // Insert SI unit
  function insertUnit(raw: string) {
    insertSnippet(` (${formatSIUnit(raw)}) `)
  }

  // Preview randomized result
  function doPreview() {
    if (!state.answerFormula.trim() || state.variables.length === 0) {
      toast.error('กรุณาใส่สูตรและตัวแปรก่อน')
      return
    }
    const values = randomizeVariables(state.variables, state.logicRules, {
      formula: state.answerFormula,
      answerStep: state.answerStep,
      pythagoreanGroups: state.pythagoreanGroups,
    })
    const answer = evaluateFormula(state.answerFormula, values)
    setPreviewResult({ values, answer })
  }

  // Apply magic tuple to variables
  function applyMagicTuple(choice: string) {
    setMagicTupleChoice(choice)
    if (!choice) return

    if (choice.startsWith('pyth:')) {
      const familyName = choice.replace('pyth:', '')
      const family = PYTHAGOREAN_FAMILIES.find(f => f.name === familyName)
      if (!family) return
      const triple = family.triples[0]
      // Find variables with matching roles if any, otherwise hint user
      toast.info(`เลือกชุด ${triple[0]}-${triple[1]}-${triple[2]} — กำหนด a/b/c ในตัวแปรด้านล่าง`)
    }
    if (choice === 'g9.8') {
      toast.info('ใช้ g = 9.8 — แนะนำให้กำหนดตัวแปรมวลให้ผลคูณ mg หารลงตัว เช่น m ∈ {5, 10, 20}')
    }
    if (choice === 'g10') {
      toast.info('ใช้ g = 10 — แนะนำให้ตั้งค่าขนาดก้าวคำตอบเป็น 10 หรือ 50')
    }
  }

  // Sub-question management
  function addSubQuestion() {
    const next = emptySubQuestion(state.subQuestions.length)
    patch({ subQuestions: [...state.subQuestions, next] })
    setExpandedSubQ(next.id)
  }

  function removeSubQuestion(id: string) {
    patch({ subQuestions: state.subQuestions.filter(sq => sq.id !== id) })
    if (expandedSubQ === id) setExpandedSubQ(null)
  }

  function patchSubQuestion(id: string, updates: Partial<SubQuestion>) {
    patch({
      subQuestions: state.subQuestions.map(sq => sq.id === id ? { ...sq, ...updates } : sq)
    })
  }

  // Tags
  const filteredTagSuggestions = useMemo(() => {
    const q = tagInput.toLowerCase()
    if (!q) return suggestedTags.filter(t => !state.tags.includes(t)).slice(0, 8)
    return ALL_PHYSICS_TAGS
      .filter(t => t.toLowerCase().includes(q) && !state.tags.includes(t))
      .slice(0, 8)
  }, [tagInput, state.tags, suggestedTags])

  function addTag(tag: string) {
    if (!state.tags.includes(tag)) {
      patch({ tags: [...state.tags, tag] })
    }
    setTagInput('')
    setShowTagDropdown(false)
  }

  function removeTag(tag: string) {
    patch({ tags: state.tags.filter(t => t !== tag) })
  }

  // Revision restore
  function handleRestore(id: string) {
    const data = draft.restoreRevision(id)
    if (data) {
      setState(data)
      toast.success('กู้คืนเวอร์ชันเรียบร้อย')
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ══════════════ HEADER ══════════════ */}
      <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <input
            className="flex-1 min-w-48 text-base font-semibold bg-transparent border-0 border-b-2 border-transparent focus:border-blue-500 focus:outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 py-0.5 transition-colors"
            placeholder="ชื่อโจทย์..."
            value={state.title}
            onChange={e => patch({ title: e.target.value })}
          />

          {/* Subject */}
          <select
            value={(THAI_SUBJECTS as readonly string[]).includes(state.subject) ? state.subject : (state.subject ? '__other__' : '')}
            onChange={e => {
              if (e.target.value === '__other__') patch({ subject: '' })
              else patch({ subject: e.target.value })
            }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="" disabled>เลือกวิชา *</option>
            {THAI_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="__other__">อื่นๆ (ระบุเอง)</option>
          </select>
          {(!(THAI_SUBJECTS as readonly string[]).includes(state.subject)) && (
            <input
              value={state.subject}
              onChange={e => patch({ subject: e.target.value })}
              placeholder="ระบุวิชา..."
              className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
            />
          )}

          {/* Difficulty */}
          <select
            value={state.difficulty}
            onChange={e => patch({ difficulty: e.target.value as Difficulty })}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="easy">ง่าย</option>
            <option value="medium">ปานกลาง</option>
            <option value="hard">ยาก</option>
            <option value="analytical">วิเคราะห์</option>
          </select>

          {/* Visibility */}
          <select
            value={state.visibility}
            onChange={e => patch({ visibility: e.target.value as Visibility })}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="private">ส่วนตัว</option>
            <option value="school">โรงเรียน</option>
            <option value="public">สาธารณะ</option>
          </select>

          <div className="flex-1" />

          {/* Auto-save status */}
          <AutoSaveIndicator status={draft.status} lastSaved={draft.lastSaved} />

          {/* Revision History */}
          <button
            type="button"
            onClick={() => setShowRevHistory(true)}
            title="ประวัติการบันทึก"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* Save button */}
          <button
            type="button"
            onClick={() => toast.success('บันทึกแล้ว (ระบบจำลอง)')}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            บันทึก
          </button>
        </div>
      </header>

      {/* ══════════════ SPLIT SCREEN ══════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ─── LEFT PANEL ─────────────────────────────── */}
        <div className="flex flex-col w-1/2 min-w-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">

          {/* Left Tab Bar */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 shrink-0">
            <LeftTabBtn active={leftTab === 'editor'}    icon={<Code2 className="w-3.5 h-3.5" />}   label="โจทย์"    onClick={() => setLeftTab('editor')} />
            <LeftTabBtn active={leftTab === 'variables'} icon={<Sigma className="w-3.5 h-3.5" />}   label="ตัวแปร"   onClick={() => setLeftTab('variables')} />
            <LeftTabBtn active={leftTab === 'tags'}      icon={<Tag className="w-3.5 h-3.5" />}     label="แท็ก"     onClick={() => setLeftTab('tags')} />
            <LeftTabBtn active={leftTab === 'media'}     icon={<Image className="w-3.5 h-3.5" />}   label="สื่อ"     onClick={() => setLeftTab('media')} />
          </div>

          {/* Left Content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── EDITOR TAB ── */}
            {leftTab === 'editor' && (
              <div className="p-4 space-y-4">

                {/* Mode toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">โหมดโจทย์</span>
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                    <ModeBtn
                      active={state.questionMode === 'single'}
                      icon={<PenLine className="w-3 h-3" />}
                      label="โจทย์ข้อเดี่ยว"
                      onClick={() => patch({ questionMode: 'single' })}
                    />
                    <ModeBtn
                      active={state.questionMode === 'scenario'}
                      icon={<BookOpen className="w-3 h-3" />}
                      label="โจทย์สถานการณ์"
                      onClick={() => patch({ questionMode: 'scenario' })}
                    />
                  </div>
                </div>

                {/* Scenario context (visible only in scenario mode) */}
                {state.questionMode === 'scenario' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      ข้อมูลสถานการณ์ตั้งต้น
                    </label>
                    <textarea
                      rows={5}
                      className="w-full border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-sm bg-amber-50 dark:bg-amber-950/20 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y font-mono leading-relaxed"
                      placeholder="พิมพ์บริบทสถานการณ์... เช่น บทความทดลอง, ข้อมูลกราฟ, ตารางการเคลื่อนที่&#10;รองรับ LaTeX: $F = ma$  หรือ  $$v^2 = u^2 + 2as$$"
                      value={state.scenarioContext}
                      onChange={e => patch({ scenarioContext: e.target.value })}
                    />
                  </div>
                )}

                {/* LaTeX Toolbar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5" />
                      {state.questionMode === 'scenario' ? 'ข้อย่อย' : 'โจทย์'}
                    </span>
                    <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setEditorMode('write')}
                        className={`px-2 py-1 flex items-center gap-1 transition-colors ${editorMode === 'write' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        <PenLine className="w-3 h-3" />
                        พิมพ์
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode('preview')}
                        className={`px-2 py-1 flex items-center gap-1 transition-colors ${editorMode === 'preview' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        <Eye className="w-3 h-3" />
                        ดูตัวอย่าง
                      </button>
                    </div>
                  </div>

                  {/* Preset snippets */}
                  <div className="flex flex-wrap gap-1.5">
                    {LATEX_PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => insertSnippet(p.snippet)}
                        className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 text-gray-700 dark:text-gray-300 font-mono transition-colors border border-gray-200 dark:border-gray-700 hover:border-blue-300"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* SI unit quick-insert */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-gray-400 dark:text-gray-600 self-center font-semibold uppercase tracking-wide">หน่วย:</span>
                    {SI_QUICK.map(u => (
                      <button
                        key={u.raw}
                        type="button"
                        onClick={() => insertUnit(u.raw)}
                        className="text-xs px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-mono transition-colors"
                      >
                        {u.display}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main question textarea OR preview */}
                {editorMode === 'write' ? (
                  <textarea
                    ref={textareaRef}
                    rows={state.questionMode === 'scenario' ? 5 : 10}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono leading-relaxed"
                    placeholder={state.questionMode === 'scenario'
                      ? 'พิมพ์ข้อย่อยที่ 1 ของสถานการณ์...'
                      : 'พิมพ์โจทย์ที่นี่... รองรับ LaTeX เช่น $F = ma$ หรือ $$E_k = \\frac{1}{2}mv^2$$\nใช้ {ชื่อตัวแปร} เช่น {m} {v} เพื่อแทรกค่าสุ่ม'}
                    value={state.questionText}
                    onChange={e => patch({ questionText: e.target.value })}
                  />
                ) : (
                  <div
                    className="min-h-[120px] border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderedQuestion || '<span class="text-gray-400 italic text-sm">ยังไม่มีเนื้อหา</span>' }}
                  />
                )}

                {/* Sub-questions (scenario mode) */}
                {state.questionMode === 'scenario' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        ข้อย่อย ({state.subQuestions.length})
                      </span>
                      <button
                        type="button"
                        onClick={addSubQuestion}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-semibold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        เพิ่มข้อย่อย
                      </button>
                    </div>

                    {state.subQuestions.map(sq => (
                      <SubQuestionCard
                        key={sq.id}
                        sq={sq}
                        expanded={expandedSubQ === sq.id}
                        onToggle={() => setExpandedSubQ(prev => prev === sq.id ? null : sq.id)}
                        onPatch={updates => patchSubQuestion(sq.id, updates)}
                        onRemove={() => removeSubQuestion(sq.id)}
                      />
                    ))}

                    {state.subQuestions.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-6 text-center text-sm text-gray-400 dark:text-gray-600">
                        กด "เพิ่มข้อย่อย" เพื่อเพิ่มข้อ 1.1, 1.2, 1.3...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── VARIABLES TAB ── */}
            {leftTab === 'variables' && (
              <div className="p-4 space-y-5">

                {/* Answer Step Size */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <SplitSquareHorizontal className="w-4 h-4 text-violet-500" />
                    ขนาดก้าวคำตอบ (Answer Step)
                  </h3>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={state.answerStep || ''}
                      onChange={e => patch({ answerStep: parseFloat(e.target.value) || 0 })}
                      placeholder="0 = ปิดใช้งาน"
                      className="w-40 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      คำตอบต้องหารด้วยค่านี้ลงตัว — ระบบจะสุ่มใหม่ถ้าไม่ตรงเงื่อนไข
                    </p>
                  </div>
                </div>

                {/* Magic Tuples */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-amber-500" />
                    ชุดตัวเลขลงตัว (Magic Tuples)
                  </h3>
                  <select
                    value={magicTupleChoice}
                    onChange={e => applyMagicTuple(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                  >
                    <option value="">-- เลือกชุดตัวเลข --</option>
                    <optgroup label="ชุดเลขพีทาโกรัส">
                      {PYTHAGOREAN_FAMILIES.map(f => (
                        <option key={f.name} value={`pyth:${f.name}`}>
                          {f.name} ({f.triples.slice(0, 3).map(t => t.join('-')).join(', ')}...)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="หารด้วย g ลงตัว">
                      <option value="g9.8">g = 9.8 — แนะนำมวล: 5, 10, 20, 50 kg</option>
                      <option value="g10">g = 10 — แนะนำมวล: 1, 2, 5, 10 kg</option>
                    </optgroup>
                  </select>
                </div>

                {/* Variables */}
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                    <Sigma className="w-4 h-4 text-blue-500" />
                    ตัวแปรสุ่ม
                  </h3>
                  <VariableEditor
                    variables={state.variables}
                    onChange={vars => patch({ variables: vars })}
                    onInsertVariable={name => patch({ questionText: state.questionText + `{${name}}` })}
                    presets={presets}
                  />
                </div>

                {/* Formula */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">สูตรคำตอบ</label>
                  <input
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เช่น  m * a  หรือ  sqrt(v^2 + u^2)"
                    value={state.answerFormula}
                    onChange={e => patch({ answerFormula: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">หน่วย</label>
                    <input
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="m/s, N, J..."
                      value={state.answerUnit}
                      onChange={e => patch({ answerUnit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ค่าความคลาดเคลื่อน</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={state.tolerance}
                      onChange={e => patch({ tolerance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                {/* Logic rules */}
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-rose-500" />
                    ตรรกะเงื่อนไข
                  </h3>
                  <LogicRuleBuilder
                    rules={state.logicRules}
                    variables={state.variables}
                    onChange={rules => patch({ logicRules: rules })}
                  />
                </div>

                {/* Randomization preview button */}
                <button
                  type="button"
                  onClick={() => setShowRandomModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm font-semibold transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  ทดสอบสถิติการสุ่ม (จำลอง 200 รอบ)
                </button>
              </div>
            )}

            {/* ── TAGS TAB ── */}
            {leftTab === 'tags' && (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-emerald-500" />
                    แท็กที่แนะนำจากเนื้อหา
                  </label>
                  {suggestedTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedTags.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addTag(t)}
                          disabled={state.tags.includes(t)}
                          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                            state.tags.includes(t)
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 cursor-default'
                              : 'bg-white dark:bg-gray-900 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer'
                          }`}
                        >
                          {state.tags.includes(t) ? '✓ ' : '+ '}{t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-600">
                      พิมพ์เนื้อหาในแท็บ "โจทย์" แล้วระบบจะแนะนำแท็กที่เหมาะสมโดยอัตโนมัติ
                    </p>
                  )}
                </div>

                <hr className="border-gray-100 dark:border-gray-800" />

                {/* Tag input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">เพิ่มแท็กเอง</label>
                  <div className="relative">
                    <input
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ค้นหาหรือพิมพ์แท็ก แล้วกด Enter"
                      value={tagInput}
                      onChange={e => { setTagInput(e.target.value); setShowTagDropdown(true) }}
                      onFocus={() => setShowTagDropdown(true)}
                      onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          e.preventDefault()
                          addTag(tagInput.trim())
                        }
                        if (e.key === 'Escape') setShowTagDropdown(false)
                      }}
                    />
                    {showTagDropdown && filteredTagSuggestions.length > 0 && (
                      <div className="absolute z-30 top-full mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {filteredTagSuggestions.map(t => (
                          <button
                            key={t}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); addTag(t) }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300 text-gray-700 dark:text-gray-300 transition-colors"
                          >
                            {t}
                          </button>
                        ))}
                        {tagInput.trim() && !ALL_PHYSICS_TAGS.includes(tagInput.trim()) && (
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); addTag(tagInput.trim()) }}
                            className="w-full text-left px-3 py-2.5 text-sm text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-gray-100 dark:border-gray-800 transition-colors"
                          >
                            + สร้างแท็กใหม่ &ldquo;{tagInput.trim()}&rdquo;
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Active tags */}
                {state.tags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">แท็กที่เลือก</p>
                    <div className="flex flex-wrap gap-1.5">
                      {state.tags.map(t => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs font-semibold"
                        >
                          {t}
                          <button type="button" onClick={() => removeTag(t)} className="hover:text-blue-600 dark:hover:text-blue-400">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {state.tags.length === 0 && suggestedTags.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-8">ยังไม่มีแท็ก — พิมพ์เพื่อเพิ่ม</p>
                )}
              </div>
            )}

            {/* ── MEDIA TAB ── */}
            {leftTab === 'media' && (
              <div className="p-4 space-y-4">
                {/* Whiteboard */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                      <Pencil className="w-4 h-4 text-orange-500" />
                      กระดานวาดรูป (Excalidraw)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowWhiteboard(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 font-semibold transition-colors"
                    >
                      เปิดกระดาน
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-600">วาด Freehand หรือลากเส้นเรขาคณิต จากนั้นบันทึกเป็นรูปภาพแทรกลงในโจทย์</p>
                </div>

                {/* Graph Builder */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-500" />
                      กราฟพิกัดฉากและเวกเตอร์
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowGraphBuilder(v => !v)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-semibold transition-colors"
                    >
                      {showGraphBuilder ? 'ซ่อน' : 'เปิด'}กราฟ
                    </button>
                  </div>
                  {showGraphBuilder && (
                    <GraphBuilder onInsert={() => toast.success('แทรกกราฟแล้ว (ระบบจำลอง)')} />
                  )}
                </div>

                {/* Asset Library */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                    <Image className="w-4 h-4 text-violet-500" />
                    คลังภาพส่วนตัว
                  </h3>
                  <AssetLibrary onInsert={url => patch({ questionText: state.questionText + `\n![รูป](${url})` })} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL ─────────────────────────────── */}
        <div className="flex flex-col w-1/2 min-w-0 bg-gray-50 dark:bg-gray-900 overflow-y-auto">

          {/* Preview header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              ตัวอย่างสด (Live Preview)
            </span>
          </div>

          <div className="flex-1 p-5 space-y-5">

            {/* Scenario context preview */}
            {state.questionMode === 'scenario' && state.scenarioContext && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">สถานการณ์</p>
                <div
                  className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderedScenario }}
                />
              </div>
            )}

            {/* Main question preview */}
            <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                {state.questionMode === 'scenario' ? 'ข้อที่ 1' : 'โจทย์'}
              </p>
              {renderedQuestion ? (
                <div
                  className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderedQuestion }}
                />
              ) : (
                <p className="text-gray-400 dark:text-gray-600 italic text-sm">ยังไม่มีเนื้อหา — เริ่มพิมพ์ในช่องซ้าย</p>
              )}
            </div>

            {/* Sub-question previews (scenario) */}
            {state.questionMode === 'scenario' && state.subQuestions.map((sq, idx) => (
              <div key={sq.id} className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-2">ข้อ {sq.label}</p>
                {sq.text ? (
                  <div
                    className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderLatex(sq.text) }}
                  />
                ) : (
                  <p className="text-gray-400 dark:text-gray-600 italic text-xs">ข้อย่อย {idx + 1} — ยังไม่มีเนื้อหา</p>
                )}
              </div>
            ))}

            {/* Variable preview + formula result */}
            {state.variables.length > 0 && state.answerFormula && (
              <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">ทดสอบสูตร</p>
                  <button
                    type="button"
                    onClick={doPreview}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    สุ่มค่า
                  </button>
                </div>

                {previewResult && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(previewResult.values).map(([k, v]) => (
                        <span key={k} className="text-xs font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-800">
                          {k} = {v}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">คำตอบ:</span>
                      <span className="font-mono font-bold text-lg text-gray-900 dark:text-gray-100">
                        {typeof previewResult.answer === 'number'
                          ? parseFloat(previewResult.answer.toPrecision(6)).toString()
                          : previewResult.answer}
                      </span>
                      {state.answerUnit && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">{formatSIUnit(state.answerUnit)}</span>
                      )}
                    </div>

                    {/* Sig-fig warning */}
                    {sigFigCheck && !sigFigCheck.ok && (
                      <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-700 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-700 dark:text-yellow-300">{sigFigCheck.warning}</p>
                      </div>
                    )}
                  </div>
                )}

                {!previewResult && (
                  <p className="text-xs text-gray-400 dark:text-gray-600">กด &ldquo;สุ่มค่า&rdquo; เพื่อทดสอบสูตร</p>
                )}
              </div>
            )}

            {/* SI Unit info */}
            {state.answerUnit && (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-2.5">
                <Info className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  หน่วยที่จัดรูปแบบแล้ว: <strong className="font-mono">{formatSIUnit(state.answerUnit)}</strong>
                </p>
              </div>
            )}

            {/* Tags preview */}
            {state.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {state.tags.map(t => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 font-medium">
                    {t}
                  </span>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {showRandomModal && (
        <RandomizationModal
          variables={state.variables}
          logicRules={state.logicRules}
          formula={state.answerFormula}
          answerStep={state.answerStep}
          pythagoreanGroups={state.pythagoreanGroups}
          onClose={() => setShowRandomModal(false)}
        />
      )}

      {showRevHistory && (
        <RevisionHistoryModal
          revisions={draft.revisions}
          onRestore={handleRestore}
          onClear={draft.clearDraft}
          onClose={() => setShowRevHistory(false)}
        />
      )}

      {showWhiteboard && (
        <WhiteboardModal
          onSave={url => {
            patch({ questionText: state.questionText + `\n![กระดานวาด](${url})` })
            setShowWhiteboard(false)
            toast.success('บันทึกรูปและแทรกลงในโจทย์แล้ว')
          }}
          onClose={() => setShowWhiteboard(false)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LeftTabBtn({
  active, icon, label, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
        active
          ? 'text-blue-700 dark:text-blue-400 bg-white dark:bg-gray-950 border-b-2 border-blue-600'
          : 'text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function ModeBtn({
  active, icon, label, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function AutoSaveIndicator({
  status, lastSaved,
}: { status: 'idle' | 'saving' | 'saved'; lastSaved: Date | null }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        กำลังบันทึก...
      </span>
    )
  }
  if (status === 'saved' && lastSaved) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="w-3.5 h-3.5" />
        บันทึกแล้ว {lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    )
  }
  return null
}

function SubQuestionCard({
  sq, expanded, onToggle, onPatch, onRemove,
}: {
  sq: SubQuestion
  expanded: boolean
  onToggle: () => void
  onPatch: (p: Partial<SubQuestion>) => void
  onRemove: () => void
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">ข้อ {sq.label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">ข้อย่อย {sq.label}</label>
            <textarea
              rows={4}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono leading-relaxed"
              placeholder="พิมพ์ข้อย่อย... รองรับ LaTeX $...$"
              value={sq.text}
              onChange={e => onPatch({ text: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">สูตรคำตอบ</label>
              <input
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="m * a"
                value={sq.formula}
                onChange={e => onPatch({ formula: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">หน่วย</label>
              <input
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="N, m/s, J..."
                value={sq.unit}
                onChange={e => onPatch({ unit: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AssetLibrary({ onInsert }: { onInsert: (url: string) => void }) {
  const [assets, setAssets] = useState<{ id: string; url: string; name: string }[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const url = URL.createObjectURL(file)
      setAssets(prev => [...prev, { id: crypto.randomUUID(), url, name: file.name }])
    })
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-200 dark:border-violet-700 rounded-xl text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 font-semibold transition-colors"
      >
        <Plus className="w-4 h-4" />
        อัปโหลดรูปภาพ
      </button>

      {assets.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">ยังไม่มีรูปภาพ — อัปโหลดและลากวางลงในโจทย์</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {assets.map(asset => (
          <div
            key={asset.id}
            draggable
            onDragStart={() => setDraggingId(asset.id)}
            onDragEnd={() => setDraggingId(null)}
            className={`relative group rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all ${
              draggingId === asset.id
                ? 'border-blue-400 opacity-60 scale-95'
                : 'border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600'
            }`}
          >
            <img src={asset.url} alt={asset.name} className="w-full h-20 object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <button
                type="button"
                onClick={() => onInsert(asset.url)}
                className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold bg-blue-600 px-2 py-1 rounded-md transition-opacity"
              >
                แทรก
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
