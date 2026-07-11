'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bold, Italic, Underline, Superscript as SuperscriptIcon, Subscript as SubscriptIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RichTextEditorHandle {
  insertText: (text: string) => void
}

// ─── Symbol data ─────────────────────────────────────────────────────────────

const SYMBOL_GROUPS = [
  {
    label: 'อักษรกรีก (ตัวเล็ก)',
    symbols: [
      { char: 'α', name: 'alpha — ความเร่งเชิงมุม, สัมประสิทธิ์การขยายตัว' },
      { char: 'β', name: 'beta — อนุภาคบีตา, มุม' },
      { char: 'γ', name: 'gamma — รังสีแกมมา, แฟกเตอร์ Lorentz' },
      { char: 'δ', name: 'delta — การเปลี่ยนแปลงเล็กน้อย' },
      { char: 'ε', name: 'epsilon — สภาพยอม (permittivity), ความเครียด' },
      { char: 'η', name: 'eta — ประสิทธิภาพ (efficiency)' },
      { char: 'θ', name: 'theta — มุม' },
      { char: 'κ', name: 'kappa — ค่าคงที่สปริง, การนำความร้อน' },
      { char: 'λ', name: 'lambda — ความยาวคลื่น' },
      { char: 'μ', name: 'mu — ไมโคร (10⁻⁶), สัมประสิทธิ์ความเสียดทาน, สภาพซึมผ่าน' },
      { char: 'ν', name: 'nu — ความถี่' },
      { char: 'π', name: 'pi — 3.14159…' },
      { char: 'ρ', name: 'rho — ความหนาแน่น, สภาพต้านทานไฟฟ้า' },
      { char: 'σ', name: 'sigma — ค่าคงตัว Stefan–Boltzmann, ความเค้น, สภาพนำไฟฟ้า' },
      { char: 'τ', name: 'tau — ทอร์ก, ค่าคงเวลา' },
      { char: 'φ', name: 'phi — ฟลักซ์แม่เหล็ก, มุมเฟส' },
      { char: 'χ', name: 'chi — สัมประสิทธิ์ความไว' },
      { char: 'ψ', name: 'psi — ฟังก์ชันคลื่น (กลศาสตร์ควอนตัม)' },
      { char: 'ω', name: 'omega — ความเร็วเชิงมุม, ความถี่เชิงมุม' },
    ],
  },
  {
    label: 'อักษรกรีก (ตัวใหญ่)',
    symbols: [
      { char: 'Γ', name: 'Gamma' },
      { char: 'Δ', name: 'Delta — ผลต่าง เช่น Δv, Δt, ΔE' },
      { char: 'Θ', name: 'Theta' },
      { char: 'Λ', name: 'Lambda' },
      { char: 'Π', name: 'Pi — ผลคูณ' },
      { char: 'Σ', name: 'Sigma — ผลรวม' },
      { char: 'Φ', name: 'Phi — ฟลักซ์แม่เหล็กรวม' },
      { char: 'Ψ', name: 'Psi — ฟังก์ชันคลื่น' },
      { char: 'Ω', name: 'Omega — โอห์ม (Ω) หน่วยความต้านทาน' },
    ],
  },
  {
    label: 'สัญลักษณ์ฟิสิกส์',
    symbols: [
      { char: '∠', name: 'มุม (angle)' },
      { char: '°', name: 'องศา — มุม (°) และอุณหภูมิ (°C, °F)' },
      { char: '⊙', name: 'กระแส/สนามออกจากหน้ากระดาษ (out of page)' },
      { char: '⊗', name: 'กระแส/สนามเข้าสู่หน้ากระดาษ (into page)' },
      { char: 'ℏ', name: 'h-bar — ค่าคงตัวพลังค์หารด้วย 2π (ħ = h/2π)' },
      { char: '∫', name: 'อินทิกรัล (integral)' },
      { char: '∂', name: 'อนุพันธ์ย่อย (partial derivative)' },
      { char: '∇', name: 'nabla — gradient, divergence, curl' },
      { char: 'ℓ', name: 'script l — ความยาว (แยกจากตัว I)' },
    ],
  },
  {
    label: 'สัญลักษณ์คณิตศาสตร์',
    symbols: [
      { char: '±', name: 'บวกหรือลบ (plus–minus)' },
      { char: '×', name: 'คูณ / cross product' },
      { char: '·', name: 'จุดกลาง — dot product, การคูณ' },
      { char: '÷', name: 'หาร' },
      { char: '√', name: 'รากที่สอง' },
      { char: '∝', name: 'แปรผันตรง (proportional to)' },
      { char: '≈', name: 'ประมาณเท่ากับ' },
      { char: '≠', name: 'ไม่เท่ากับ' },
      { char: '≤', name: 'น้อยกว่าหรือเท่ากับ' },
      { char: '≥', name: 'มากกว่าหรือเท่ากับ' },
      { char: '∞', name: 'อนันต์' },
      { char: '∑', name: 'ซิกมา — ผลรวม (sum)' },
    ],
  },
  {
    label: 'ลูกศรและทิศทาง',
    symbols: [
      { char: '→', name: 'ลูกศรขวา — เวกเตอร์, ทิศทาง' },
      { char: '←', name: 'ลูกศรซ้าย' },
      { char: '↑', name: 'ลูกศรขึ้น' },
      { char: '↓', name: 'ลูกศรลง' },
      { char: '↗', name: 'ลูกศรเฉียงขวาบน' },
      { char: '↙', name: 'ลูกศรเฉียงซ้ายล่าง' },
      { char: '⇒', name: 'ดังนั้น / implies' },
      { char: '⟺', name: 'ก็ต่อเมื่อ (if and only if)' },
      { char: '⊥', name: 'ตั้งฉาก (perpendicular)' },
      { char: '∥', name: 'ขนาน (parallel)' },
    ],
  },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded text-sm transition-colors',
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  )
}

function SymbolPicker({ onInsert }: { onInsert: (char: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="แทรกอักษรกรีก / สัญลักษณ์พิเศษ"
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className={cn(
          'flex items-center gap-1 px-2 h-8 rounded text-sm font-medium transition-colors',
          open ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
        )}
      >
        <span className="font-serif">Ω</span>
        <span className="text-xs hidden sm:inline">สัญลักษณ์</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-80">
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {SYMBOL_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.symbols.map(({ char, name }) => (
                    <button
                      key={char}
                      type="button"
                      title={name}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onInsert(char)
                        setOpen(false)
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-800 text-sm font-serif hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 pt-2 border-t">
            วางเมาส์บนสัญลักษณ์เพื่อดูคำอธิบาย
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export const RichTextEditor = forwardRef<RichTextEditorHandle, {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  rows?: number
  className?: string
}>(function RichTextEditor({ value, onChange, placeholder, rows = 5, className }, ref) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false }),
      Superscript,
      Subscript,
    ],
    content: value || '<p></p>',
    onUpdate({ editor }) {
      onChange(editor.isEmpty ? '' : editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[80px] text-sm text-gray-900 leading-relaxed',
        'data-placeholder': placeholder ?? '',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current && !(editor.isEmpty && !value)) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
    }
  }, [value, editor])

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      editor?.chain().focus().insertContent(text).run()
    },
  }), [editor])

  if (!editor) return null

  const formatTools = [
    {
      key: 'bold',
      title: 'ตัวหนา (Ctrl+B)',
      icon: <Bold className="w-4 h-4" />,
      active: editor.isActive('bold'),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      title: 'ตัวเอียง (Ctrl+I)',
      icon: <Italic className="w-4 h-4" />,
      active: editor.isActive('italic'),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'underline',
      title: 'ขีดเส้นใต้ (Ctrl+U)',
      icon: <Underline className="w-4 h-4" />,
      active: editor.isActive('underline'),
      action: () => editor.chain().focus().toggleUnderline().run(),
    },
    null,
    {
      key: 'superscript',
      title: 'ห้อยบน เช่น x²',
      icon: <SuperscriptIcon className="w-4 h-4" />,
      active: editor.isActive('superscript'),
      action: () => editor.chain().focus().toggleSuperscript().run(),
    },
    {
      key: 'subscript',
      title: 'ห้อยล่าง เช่น H₂O',
      icon: <SubscriptIcon className="w-4 h-4" />,
      active: editor.isActive('subscript'),
      action: () => editor.chain().focus().toggleSubscript().run(),
    },
  ]

  return (
    // overflow-visible (ไม่ใส่ overflow-hidden) เพื่อให้ dropdown โผล่ออกมาได้
    <div className={cn('border rounded-lg bg-white focus-within:ring-2 focus-within:ring-ring focus-within:border-input', className)}>
      {/* Toolbar — rounded-t-lg เพื่อให้มุมบนโค้งแม้ไม่มี overflow-hidden บน parent */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-gray-50 rounded-t-lg">
        {formatTools.map((tool, i) =>
          tool === null ? (
            <div key={`sep-${i}`} className="w-px h-5 bg-gray-200 mx-1" />
          ) : (
            <ToolbarButton key={tool.key} onClick={tool.action} active={tool.active} title={tool.title}>
              {tool.icon}
            </ToolbarButton>
          )
        )}

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <SymbolPicker
          onInsert={(char) => editor.chain().focus().insertContent(char).run()}
        />
      </div>

      {/* Editor area */}
      <div
        className="px-3 py-2.5 cursor-text rounded-b-lg"
        style={{ minHeight: `${rows * 1.75}rem` }}
        onClick={() => editor.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})
