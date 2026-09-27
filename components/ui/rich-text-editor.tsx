'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import Image from '@tiptap/extension-image'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bold, ImagePlus, Italic, Loader2, Underline, Superscript as SuperscriptIcon, Subscript as SubscriptIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RichTextEditorHandle {
  insertText: (text: string) => void
}

/**
 * Pictures inside the text. Off unless a caller hands this in, so every other
 * editor in the app keeps dropping pictures the way it always has.
 */
export interface RichTextEditorImages {
  /** Puts one picture up and resolves to its URL, or to null when it did not go up — the uploader says why. */
  upload: (file: File) => Promise<string | null>
  /** Whether a picture may stay — one already in the HTML, or one pasted in along with copied text. */
  accepts: (src: string) => boolean
}

/** How wide a new picture starts. The teacher drags a corner to change it. */
const NEW_PICTURE_WIDTH = 480

function pictureFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter(file => file.type.startsWith('image/'))
}

/** A picture's starting box: its own size, narrowed to NEW_PICTURE_WIDTH. */
async function startingSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const width = Math.min(bitmap.width, NEW_PICTURE_WIDTH)
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
    bitmap.close()
    return { width, height }
  } catch {
    return null
  }
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
  /** Lets pictures in: a toolbar button, paste and drop, each resizable by its corners. */
  images?: RichTextEditorImages
  /** Puts the cursor at the end on mount, for an editor opened by a button. */
  autoFocus?: boolean
}>(function RichTextEditor({ value, onChange, placeholder, rows = 5, className, images, autoFocus = false }, ref) {
  const imagesRef = useRef(images)
  imagesRef.current = images
  const editorRef = useRef<Editor | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPictures, setUploadingPictures] = useState(0)

  /**
   * Uploads pictures one after another and places each where the cursor is —
   * or, for a drop, where it was dropped — so typing carries on after it.
   */
  const placePictures = async (files: File[], dropAt?: number) => {
    const upload = imagesRef.current?.upload
    if (!upload || files.length === 0) return
    setUploadingPictures(count => count + files.length)
    let position = dropAt
    for (const file of files) {
      try {
        const [src, size] = await Promise.all([upload(file), startingSize(file)])
        const current = editorRef.current
        if (!src || !current || current.isDestroyed) continue
        const picture = { type: 'image', attrs: { src, alt: '', ...size } }
        const selection = current.state.selection
        // A picture that is itself selected is kept: the new one goes after it.
        const at = position
          ?? (selection instanceof NodeSelection ? selection.to : { from: selection.from, to: selection.to })
        current.chain().focus().insertContentAt(at, picture).run()
        position = undefined
        // Land the cursor on a line below the picture, making one when the
        // picture ended the text, so typing carries straight on.
        const landed = current.state.selection
        if (landed instanceof NodeSelection) {
          const end = landed.to
          if (current.state.doc.resolve(end).nodeAfter?.isTextblock) current.commands.setTextSelection(end + 1)
          else current.chain().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run()
        }
      } finally {
        setUploadingPictures(count => count - 1)
      }
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false }),
      Superscript,
      Subscript,
      ...(images ? [
        Image.extend({
          parseHTML() {
            return [{
              tag: 'img[src]',
              getAttrs: element => (imagesRef.current?.accepts(element.getAttribute('src') ?? '') ? null : false),
            }]
          },
        }).configure({
          inline: false,
          allowBase64: false,
          resize: {
            enabled: true,
            directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            minWidth: 48,
            minHeight: 48,
            alwaysPreserveAspectRatio: true,
          },
        }),
      ] : []),
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
      // A screenshot pasted or a picture dropped goes up like one picked
      // from the button. Anything else is left to the editor as before.
      handlePaste: (_view, event) => {
        const files = pictureFiles(event.clipboardData?.files)
        if (!imagesRef.current || files.length === 0) return false
        event.preventDefault()
        void placePictures(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = pictureFiles(event.dataTransfer?.files)
        if (moved || !imagesRef.current || files.length === 0) return false
        event.preventDefault()
        void placePictures(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos)
        return true
      },
    },
  })
  editorRef.current = editor

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
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-gray-50 rounded-t-lg">
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

        {images && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={event => {
                const files = pictureFiles(event.target.files)
                event.target.value = ''
                void placePictures(files)
              }}
            />
            <ToolbarButton
              onClick={() => fileInputRef.current?.click()}
              active={false}
              title="แทรกรูปในข้อความ — วางหรือลากรูปลงในช่องนี้ได้ด้วย แล้วลากมุมรูปเพื่อปรับขนาด"
            >
              {uploadingPictures > 0 ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </ToolbarButton>
            {uploadingPictures > 0 && <span className="text-xs text-muted-foreground">กำลังอัปโหลดรูป...</span>}
          </>
        )}
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
