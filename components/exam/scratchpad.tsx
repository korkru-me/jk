'use client'

import '@excalidraw/excalidraw/index.css'
import { CaptureUpdateAction, Excalidraw, exportToCanvas } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Database, Highlighter, Loader2, Paperclip, PenLine, RefreshCw, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  loadScratchpadScene,
  purgeExpiredScratchpads,
  saveScratchpadScene,
} from '@/lib/scratchpad-storage'
import {
  emptyScratchpadScene,
  isScratchpadSceneWithinLimits,
  sanitizeScratchpadScene,
  type ScratchpadBackground,
  type ScratchpadScene,
  type ScratchpadScope,
} from '@/lib/scratchpad'
import {
  CURRENT_WORK_FORMAT_VERSION,
  MATH_WORK_BUCKET,
  MAX_WORK_PREVIEW_BYTES,
  type StudentWorkArtifactView,
} from '@/lib/math-work'

export interface ScratchpadProps {
  open: boolean
  scope: ScratchpadScope
  targetLabel: string
  persistenceEnabled: boolean
  artifactPartKey: string
  artifact: StudentWorkArtifactView | null
  loadAttachedNonce: number
  previewMode: boolean
  onAttachmentSaved: (artifact: StudentWorkArtifactView) => void
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

function paintPreviewBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: ScratchpadBackground,
) {
  context.fillStyle = '#fffefb'
  context.fillRect(0, 0, width, height)
  if (background === 'blank') return

  context.lineWidth = 1
  if (background === 'lined' || background === 'grid') {
    context.strokeStyle = 'rgba(59, 130, 246, 0.18)'
    for (let y = 32; y < height; y += 32) {
      context.beginPath()
      context.moveTo(0, y + 0.5)
      context.lineTo(width, y + 0.5)
      context.stroke()
    }
  }
  if (background === 'grid') {
    for (let x = 24; x < width; x += 24) {
      context.beginPath()
      context.moveTo(x + 0.5, 0)
      context.lineTo(x + 0.5, height)
      context.stroke()
    }
  }
  if (background === 'dots') {
    context.fillStyle = 'rgba(71, 85, 105, 0.32)'
    for (let y = 11; y < height; y += 22) {
      for (let x = 11; x < width; x += 22) {
        context.beginPath()
        context.arc(x, y, 1.2, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
}

function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างภาพ WebP'))
        return
      }
      resolve(blob)
    }, 'image/webp', 0.86)
  })
}

async function createScratchpadPreview(
  api: ExcalidrawImperativeAPI,
  background: ScratchpadBackground,
): Promise<Blob> {
  const elements = api.getSceneElements()
  if (elements.length === 0) throw new Error('เขียนวิธีทำก่อนกดแนบ')
  const drawing = await exportToCanvas({
    elements,
    appState: {
      ...api.getAppState(),
      exportBackground: false,
      viewBackgroundColor: TRANSPARENT_CANVAS,
    },
    files: api.getFiles(),
    maxWidthOrHeight: 1600,
    exportPadding: 36,
  })
  const canvas = document.createElement('canvas')
  canvas.width = drawing.width
  canvas.height = drawing.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('สร้างภาพวิธีทำไม่สำเร็จ')
  paintPreviewBackground(context, canvas.width, canvas.height, background)
  context.drawImage(drawing, 0, 0)
  const blob = await encodeWebp(canvas)
  if (blob.size > MAX_WORK_PREVIEW_BYTES) throw new Error('ภาพวิธีทำมีขนาดใหญ่เกิน 5 MB')
  return blob
}

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
  artifactPartKey,
  artifact,
  loadAttachedNonce,
  previewMode,
  onAttachmentSaved,
  onClose,
}: ScratchpadProps) {
  const { resolvedTheme } = useTheme()
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneRef = useRef<ScratchpadScene>(emptyScratchpadScene())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)
  const loadedArtifactNonceRef = useRef(0)
  const [background, setBackground] = useState<ScratchpadBackground>('lined')
  const [status, setStatus] = useState<SaveStatus>(persistenceEnabled ? 'loading' : 'idle')
  const [apiReady, setApiReady] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [loadingAttached, setLoadingAttached] = useState(false)

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

  const loadAttachedScene = useCallback(async () => {
    if (!artifact || artifact.sourceType !== 'scratchpad' || !apiRef.current) return
    // Preview attachments are object URLs for the thumbnail only; the live
    // editor is deliberately kept mounted and already holds the editable scene.
    if (previewMode && !artifact.sceneUrl) return
    setLoadingAttached(true)
    try {
      let sceneUrl = artifact.sceneUrl
      let response = sceneUrl ? await fetch(sceneUrl, { cache: 'no-store' }) : null
      if (!response?.ok && !previewMode) {
        const { getStudentWorkArtifacts } = await import('@/lib/actions/math-work')
        const refreshed = await getStudentWorkArtifacts(scope.answerId)
        if (!refreshed || 'error' in refreshed) throw new Error(refreshed?.error ?? 'เปิดไฟล์ต้นฉบับไม่สำเร็จ')
        sceneUrl = refreshed.artifacts.find(item => item.partKey === artifactPartKey)?.sceneUrl ?? null
        response = sceneUrl ? await fetch(sceneUrl, { cache: 'no-store' }) : null
      }
      if (!response?.ok) throw new Error('เปิดไฟล์ต้นฉบับไม่สำเร็จ')
      const scene = sanitizeScratchpadScene(await response.json())
      if (!scene || !isScratchpadSceneWithinLimits(scene)) throw new Error('รูปแบบไฟล์ต้นฉบับไม่รองรับ')

      const api = apiRef.current
      api.updateScene({
        elements: scene.elements as readonly OrderedExcalidrawElement[],
        appState: { ...scene.appState, viewBackgroundColor: TRANSPARENT_CANVAS } as AppState,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      api.addFiles(Object.values(scene.files) as BinaryFileData[])
      api.history.clear()
      sceneRef.current = scene
      setBackground(scene.background)
      await persist(scene)
      toast.success('เปิดฉบับที่แนบแล้ว แก้ไขต่อได้เลย')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เปิดฉบับที่แนบไม่สำเร็จ')
    } finally {
      setLoadingAttached(false)
    }
  }, [artifact, artifactPartKey, persist, previewMode, scope.answerId])

  useEffect(() => {
    if (!apiReady || !open || loadAttachedNonce <= 0) return
    if (loadedArtifactNonceRef.current === loadAttachedNonce) return
    loadedArtifactNonceRef.current = loadAttachedNonce
    void loadAttachedScene()
  }, [apiReady, loadAttachedNonce, loadAttachedScene, open])

  const attachAsWork = async () => {
    const api = apiRef.current
    if (!api || attaching) return
    setAttaching(true)
    try {
      const scene: ScratchpadScene = {
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        elements: api.getSceneElementsIncludingDeleted(),
        appState: stableAppState(api.getAppState()),
        files: api.getFiles(),
        background,
      }
      if (!isScratchpadSceneWithinLimits(scene)) throw new Error('กระดาษทดมีขนาดใหญ่เกิน 2 MB หรือมีเส้นมากเกินไป')
      const preview = await createScratchpadPreview(api, background)

      if (previewMode) {
        const previewUrl = URL.createObjectURL(preview)
        onAttachmentSaved({
          id: `preview-${scope.answerId}-${artifactPartKey}`,
          submissionAnswerId: scope.answerId,
          partKey: artifactPartKey,
          sourceType: 'scratchpad',
          formatVersion: CURRENT_WORK_FORMAT_VERSION,
          previewUrl,
          sceneUrl: null,
          updatedAt: new Date().toISOString(),
        })
        toast.success('จำลองการแนบวิธีทำแล้ว · ไม่ได้อัปโหลด')
        return
      }

      const sceneBlob = new Blob([JSON.stringify(scene)], { type: 'application/json' })
      const {
        getStudentWorkArtifacts,
        prepareStudentWorkArtifactUpload,
        saveStudentWorkArtifact,
      } = await import('@/lib/actions/math-work')
      const prepared = await prepareStudentWorkArtifactUpload({
        submissionAnswerId: scope.answerId,
        partKey: artifactPartKey,
        sourceType: 'scratchpad',
        includeScene: true,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
      })
      if (!prepared || 'error' in prepared) {
        throw new Error(prepared?.error ?? 'เตรียมพื้นที่อัปโหลดไม่สำเร็จ')
      }
      if (!prepared.scene) throw new Error('เตรียมไฟล์ต้นฉบับไม่สำเร็จ')

      const { createClient } = await import('@/lib/supabase/client')
      const bucket = createClient().storage.from(MATH_WORK_BUCKET)
      // Always ask the server to inspect the pair after both requests settle.
      // This also recovers cleanly when an upload response is lost even though
      // the object reached storage; a genuinely partial pair is removed there.
      await Promise.allSettled([
        bucket.uploadToSignedUrl(prepared.preview.path, prepared.preview.token, preview, {
          contentType: 'image/webp',
          cacheControl: '300',
        }),
        bucket.uploadToSignedUrl(prepared.scene.path, prepared.scene.token, sceneBlob, {
          contentType: 'application/json',
          cacheControl: '300',
        }),
      ])
      const saved: Awaited<ReturnType<typeof saveStudentWorkArtifact>> = await saveStudentWorkArtifact({
        submissionAnswerId: scope.answerId,
        partKey: artifactPartKey,
        sourceType: 'scratchpad',
        uploadId: prepared.uploadId,
        includeScene: true,
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
      })
      if (!saved || 'error' in saved) throw new Error(saved?.error ?? 'บันทึกวิธีทำไม่สำเร็จ')
      const refreshed = await getStudentWorkArtifacts(scope.answerId)
      const attached = refreshed && !('error' in refreshed)
        ? refreshed.artifacts.find(item => item.partKey === artifactPartKey)
        : null
      onAttachmentSaved(attached ? {
        ...attached,
        submissionAnswerId: scope.answerId,
        sourceType: attached.sourceType === 'photo' ? 'photo' : 'scratchpad',
      } : {
        id: saved.artifact.id,
        submissionAnswerId: scope.answerId,
        partKey: saved.artifact.part_key,
        sourceType: saved.artifact.source_type === 'photo' ? 'photo' : 'scratchpad',
        formatVersion: saved.artifact.format_version,
        previewUrl: null,
        sceneUrl: null,
        updatedAt: saved.artifact.updated_at,
      })
      toast.success(artifact ? 'อัปเดตวิธีทำที่แนบแล้ว' : 'แนบวิธีทำแล้ว')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'แนบวิธีทำไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setAttaching(false)
    }
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
          {artifact?.sceneUrl && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void loadAttachedScene()}
              disabled={loadingAttached || attaching}
              title="โหลดฉบับที่แนบล่าสุดมาแทนกระดาษทดปัจจุบัน"
            >
              {loadingAttached ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              <span className="hidden lg:inline">ฉบับที่แนบ</span>
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            onClick={() => void attachAsWork()}
            disabled={attaching || loadingAttached}
          >
            {attaching ? <Loader2 className="animate-spin" /> : <Paperclip />}
            {attaching ? 'กำลังแนบ...' : artifact ? 'อัปเดตวิธีทำ' : 'แนบวิธีทำ'}
          </Button>
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
          excalidrawAPI={api => { apiRef.current = api; setApiReady(true) }}
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
