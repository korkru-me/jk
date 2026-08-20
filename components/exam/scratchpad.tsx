'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Trash2, Type, Pen, Download } from 'lucide-react'
import { Card } from '@/components/ui/card'

type Mode = 'text' | 'draw'

interface ScratchpadProps {
  onClose: () => void
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#000000']
const SIZES  = [2, 4, 7, 12]

export function Scratchpad({ onClose }: ScratchpadProps) {
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [lineSize, setLineSize] = useState(SIZES[1])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Restore saved scratchpad
  useEffect(() => {
    const saved = localStorage.getItem('korkru_scratch')
    if (saved) setText(saved)
  }, [])

  useEffect(() => {
    localStorage.setItem('korkru_scratch', text)
  }, [text])

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas || mode !== 'draw') return
    drawing.current = true
    lastPos.current = getPos(e, canvas)
  }, [mode])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = color
    ctx.lineWidth = lineSize
    ctx.stroke()
    lastPos.current = pos
  }, [color, lineSize])

  const stopDraw = useCallback(() => {
    drawing.current = false
    lastPos.current = null
  }, [])

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const downloadCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'scratchpad.png'
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <Card elevation="xl" className="fixed bottom-4 right-4 z-50 w-96 flex flex-col overflow-hidden" style={{ maxHeight: '520px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">✏️ กระดาษทด</span>
          {mode === 'draw' && (
            <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full">วาด</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <button
            onClick={() => setMode(m => m === 'text' ? 'draw' : 'text')}
            className={`p-1.5 rounded-lg transition-colors ${
              mode === 'draw' ? 'bg-primary/15 text-primary' : 'hover:bg-muted text-muted-foreground'
            }`}
            title={mode === 'text' ? 'เปลี่ยนเป็นโหมดวาด' : 'เปลี่ยนเป็นโหมดพิมพ์'}
          >
            {mode === 'text' ? <Pen size={14} /> : <Type size={14} />}
          </button>
          {mode === 'draw' && (
            <button onClick={downloadCanvas} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="ดาวน์โหลดภาพ">
              <Download size={14} />
            </button>
          )}
          <button
            onClick={() => { clearCanvas(); if (mode === 'text') setText('') }}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="ล้างทั้งหมด"
          >
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Draw toolbar */}
      {mode === 'draw' && (
        <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/30 scale-125' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setLineSize(s)}
                className={`rounded-full bg-foreground transition-all ${lineSize === s ? 'ring-2 ring-offset-1 ring-offset-background ring-primary' : ''}`}
                style={{ width: s + 8, height: s + 8, minWidth: 10 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {mode === 'text' ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="พิมพ์บันทึกย่อ, ทดเลขคำนวณ, หรือจดสูตรที่ต้องการ...&#10;&#10;ข้อมูลจะถูกบันทึกอัตโนมัติ"
            className="w-full h-full resize-none p-4 text-sm font-mono bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/50 leading-relaxed"
            spellCheck={false}
          />
        ) : (
          <canvas
            ref={canvasRef}
            width={600}
            height={500}
            className="w-full h-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t shrink-0">
        <p className="text-[10px] text-muted-foreground">
          {mode === 'text' ? `${text.length} ตัวอักษร · บันทึกอัตโนมัติ` : 'วาดบนผ้าใบ · ข้อมูลบันทึกในเบราว์เซอร์'}
        </p>
      </div>
    </Card>
  )
}
