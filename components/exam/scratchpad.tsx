'use client'

import '@excalidraw/excalidraw/index.css'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Database, Highlighter, PenLine, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  loadScratchpadScene,
  purgeExpiredScratchpads,
  saveScratchpadScene,
} from '@/lib/scratchpad-storage'
import {
  emptyScratchpadScene,
  type ScratchpadBackground,
  type ScratchpadScene,
  type ScratchpadScope,
} from '@/lib/scratchpad'

export interface ScratchpadProps {
  open: boolean
  scope: ScratchpadScope
  targetLabel: string
  persistenceEnabled: boolean
  onClose: () => void
}

type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'too-large'

const BACKGROUNDS: Array<{ value: ScratchpadBackground; label: string }> = [
  { value: 'blank', label: 'เปล่า' },
  { value: 'lined', label: 'เส้นบรรทัด' },
  { value: 'grid', label: 'ตาราง' },
  { value: 'dots', label: 'จุด' },
]

const TRANSPARENT_CANVAS = 'transparent'

function backgroundStyle(background: ScratchpadBackground): CSSProperties {
  if (background === 'lined') {
    return {
      backgroundColor: '#fffefb',
      backgroundImage: 'linear-gradient(to bottom, transparent 31px, rgba(59, 130, 246, 0.18) 32px)',
      backgroundSize: '100% 32px',
    }
  }
  if (background === 'grid') {
    return {
      backgroundColor: '#fffefb',
      backgroundImage: [
        'linear-gradient(rgba(59, 130, 246, 0.13) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(59, 130, 246, 0.13) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: '24px 24px',
    }
  }
  if (background === 'dots') {
    return {
      backgroundColor: '#fffefb',
      backgroundImage: 'radial-gradient(circle, rgba(71, 85, 105, 0.28) 1.2px, transparent 1.3px)',
      backgroundSize: '22px 22px',
    }
  }
  return { backgroundColor: '#fffefb' }
}

/** Persist only stable drawing preferences; transient selections/dialog state is deliberately excluded. */
function stableAppState(appState: AppState): Record<string, unknown> {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
    currentItemStrokeColor: appState.currentItemStrokeColor,
    currentItemBackgroundColor: appState.currentItemBackgroundColor,
    currentItemFillStyle: appState.currentItemFillStyle,
    currentItemStrokeWidth: appState.currentItemStrokeWidth,
    currentItemStrokeStyle: appState.currentItemStrokeStyle,
    currentItemRoughness: appState.currentItemRoughness,
    currentItemOpacity: appState.currentItemOpacity,
    currentItemFontFamily: appState.currentItemFontFamily,
    currentItemFontSize: appState.currentItemFontSize,
    currentItemTextAlign: appState.currentItemTextAlign,
    currentItemStartArrowhead: appState.currentItemStartArrowhead,
    currentItemEndArrowhead: appState.currentItemEndArrowhead,
    currentItemRoundness: appState.currentItemRoundness,
    currentItemArrowType: appState.currentItemArrowType,
    penMode: appState.penMode,
  }
}

function statusText(status: SaveStatus, persistenceEnabled: boolean): string {
  if (!persistenceEnabled) return 'ตัวอย่างชั่วคราว · ไม่บันทึก'
  if (status === 'loading') return 'กำลังเรียกกระดาษทดเดิม...'
  if (status === 'saving') return 'กำลังเก็บในเครื่อง...'
  if (status === 'saved') return 'เก็บในเครื่องนี้แล้ว'
  if (status === 'too-large') return 'กระดาษทดเต็มแล้ว'
  if (status === 'error') return 'เก็บในเครื่องไม่สำเร็จ'
  return 'เก็บเฉพาะในเครื่อง · หมดอายุใน 7 วัน'
}

/**
 * Local-only working paper. The entire component (and Excalidraw) sits behind
 * ExamClient's click-triggered lazy boundary, so students who do not open it
 * never download the editor runtime.
 */
export default function Scratchpad({
  open,
  scope,
  targetLabel,
  persistenceEnabled,
  onClose,
}: ScratchpadProps) {
  const { resolvedTheme } = useTheme()
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneRef = useRef<ScratchpadScene>(emptyScratchpadScene())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)
  const [background, setBackground] = useState<ScratchpadBackground>('lined')
  const [status, setStatus] = useState<SaveStatus>(persistenceEnabled ? 'loading' : 'idle')

  const initialData = useMemo(async () => {
    let scene = emptyScratchpadScene()
    if (persistenceEnabled) {
      try {
        await purgeExpiredScratchpads()
        scene = await loadScratchpadScene(scope)
        if (mountedRef.current) setStatus(scene.elements.length > 0 ? 'saved' : 'idle')
      } catch {
        if (mountedRef.current) setStatus('error')
      }
    }
    sceneRef.current = scene
    if (mountedRef.current) setBackground(scene.background)
    return {
      elements: scene.elements as readonly OrderedExcalidrawElement[],
      appState: {
        ...scene.appState,
        viewBackgroundColor: TRANSPARENT_CANVAS,
      } as Partial<AppState>,
      files: scene.files as BinaryFiles,
      scrollToContent: false,
    }
  }, [persistenceEnabled, scope])

  const persist = useCallback((scene: ScratchpadScene) => {
    if (!persistenceEnabled) return Promise.resolve()
    if (mountedRef.current) setStatus('saving')
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveScratchpadScene(scope, scene))
      .then(() => {
        if (mountedRef.current) setStatus('saved')
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) return
        setStatus(error instanceof Error && error.message.includes('exceeds local limits') ? 'too-large' : 'error')
      })
    return saveQueueRef.current
  }, [persistenceEnabled, scope])

  const scheduleSave = useCallback((delay = 650) => {
    if (!persistenceEnabled) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persist(sceneRef.current)
    }, delay)
  }, [persist, persistenceEnabled])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => apiRef.current?.refresh())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (open || !persistenceEnabled) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    void persist(sceneRef.current)
  }, [open, persist, persistenceEnabled])

  useEffect(() => {
    if (!persistenceEnabled) return
    const flushOnPageHide = () => { void persist(sceneRef.current) }
    window.addEventListener('pagehide', flushOnPageHide)
    return () => window.removeEventListener('pagehide', flushOnPageHide)
  }, [persist, persistenceEnabled])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (persistenceEnabled) void persist(sceneRef.current)
    }
  }, [persist, persistenceEnabled])

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    sceneRef.current = {
      ...sceneRef.current,
      elements,
      appState: stableAppState(appState),
      files,
    }
    scheduleSave()
  }, [scheduleSave])

  const chooseBackground = (next: ScratchpadBackground) => {
    setBackground(next)
    sceneRef.current = { ...sceneRef.current, background: next }
    scheduleSave(150)
  }

  const chooseInkPreset = (kind: 'pen' | 'highlighter') => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({
      appState: kind === 'pen'
        ? { currentItemStrokeColor: '#172554', currentItemStrokeWidth: 2, currentItemOpacity: 100 }
        : { currentItemStrokeColor: '#facc15', currentItemStrokeWidth: 4, currentItemOpacity: 35 },
    })
    api.setActiveTool({ type: 'freedraw' })
  }

  if (typeof document === 'undefined') return null

  return createPortal((
    <Card
      role="dialog"
      aria-label="กระดาษทด"
      elevation="xl"
      className={open
        ? 'fixed inset-0 z-[75] flex min-h-0 flex-col overflow-hidden rounded-none md:inset-y-4 md:left-auto md:right-4 md:min-w-[28rem] md:max-w-[80vw] md:w-[48vw] md:resize-x md:rounded-2xl xl:w-[44rem]'
        : 'hidden'}
    >
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <PenLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">กระดาษทด</p>
            <p className="truncate text-[10px] text-muted-foreground">{targetLabel}</p>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Database className="size-3 shrink-0" aria-hidden="true" />
            <span className="hidden max-w-44 truncate sm:inline" aria-live="polite">
              {statusText(status, persistenceEnabled)}
            </span>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="ปิดกระดาษทด">
            <X />
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <Button type="button" variant="outline" size="xs" onClick={() => chooseInkPreset('pen')}>
            <PenLine /> ปากกา
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={() => chooseInkPreset('highlighter')}>
            <Highlighter /> ไฮไลต์
          </Button>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          {BACKGROUNDS.map(item => (
            <Button
              key={item.value}
              type="button"
              variant={background === item.value ? 'secondary' : 'ghost'}
              size="xs"
              className="shrink-0"
              onClick={() => chooseBackground(item.value)}
              aria-pressed={background === item.value}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1" style={backgroundStyle(background)}>
        <Excalidraw
          initialData={initialData}
          excalidrawAPI={api => { apiRef.current = api }}
          onChange={handleChange}
          onPointerUp={() => scheduleSave(120)}
          langCode="th-TH"
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          handleKeyboardGlobally={false}
          autoFocus
          aiEnabled={false}
          validateEmbeddable={false}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              saveAsImage: false,
              toggleTheme: false,
            },
            tools: { image: false },
          }}
        />
      </div>
    </Card>
  ), document.body)
}
