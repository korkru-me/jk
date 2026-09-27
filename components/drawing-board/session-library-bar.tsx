'use client'

import { CaptureUpdateAction, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useEffect, useRef, useState } from 'react'
import { LibraryBig, PackagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  snapshotDrawingScene,
  validateDrawingScene,
  type LegacyTeacherImageSnapshot,
} from '@/lib/drawing-board-policy'
import {
  createDrawingBoardSessionLibraryItem,
  insertDrawingBoardSessionLibraryItem,
  MAX_DRAWING_SESSION_LIBRARY_ITEMS,
  type DrawingBoardSessionLibraryItem,
} from '@/lib/drawing-board-session-library'
import type { ScratchpadScene } from '@/lib/scratchpad'

/**
 * The คลังชั่วคราว row above a teacher's board: keep what is selected, then
 * place it again on this board or the next one opened on the same page.
 *
 * กระดานสอน and the กระดานเขียนเฉลย both render this one row, so the two
 * boards cannot drift apart. The items belong to the page hosting the board:
 * they outlive a board being closed or switched, and are never written to
 * browser storage or the server.
 */
export function SessionLibraryBar({
  label,
  items,
  disabled,
  getApi,
  getScene,
  getSurface,
  getLegacyTeacherImages,
  onAdd,
  onRemove,
}: {
  /** Names the row for assistive technology. */
  label: string
  items: readonly DrawingBoardSessionLibraryItem[]
  /** Keeping and placing are off — the board is read-only, locked or busy. */
  disabled: boolean
  getApi: () => ExcalidrawImperativeAPI | null
  getScene: () => ScratchpadScene
  getSurface: () => HTMLElement | null
  getLegacyTeacherImages: () => LegacyTeacherImageSnapshot | null
  onAdd: (item: DrawingBoardSessionLibraryItem) => void
  onRemove: (itemId: string) => void
}) {
  const [selectedItemId, setSelectedItemId] = useState('')
  const pendingSelectionRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (selectedItemId && !items.some(item => item.id === selectedItemId)) {
      setSelectedItemId(items.at(-1)?.id ?? '')
    }
  }, [items, selectedItemId])

  const storeSelection = () => {
    const api = getApi()
    if (!api || disabled) return
    const selectedElementIds = pendingSelectionRef.current ?? new Set(
      Object.entries(api.getAppState().selectedElementIds)
        .filter(([, selected]) => selected)
        .map(([elementId]) => elementId),
    )
    pendingSelectionRef.current = null
    const result = createDrawingBoardSessionLibraryItem({
      scene: snapshotDrawingScene(getScene()),
      selectedElementIds,
      id: crypto.randomUUID(),
      label: `รายการ ${items.length + 1}`,
    })
    if (!result.ok) {
      const message = result.reason === 'empty-selection'
        ? 'เลือกเส้น รูปทรง หรือข้อความก่อนเก็บในคลังชั่วคราว'
        : result.reason === 'unsupported-selection'
          ? 'คลังชั่วคราวเก็บได้เฉพาะเส้น รูปทรง และข้อความ ไม่รวมรูปหรือกรอบ'
          : result.reason === 'too-many-elements' || result.reason === 'too-large'
            ? 'ส่วนที่เลือกมีขนาดใหญ่เกินไป กรุณาเลือกให้น้อยลง'
            : 'ส่วนที่เลือกมีข้อมูลที่คลังชั่วคราวไม่รองรับ'
      toast.error(message)
      return
    }
    const evicted = items.length >= MAX_DRAWING_SESSION_LIBRARY_ITEMS
    onAdd(result.item)
    setSelectedItemId(result.item.id)
    toast.success(evicted
      ? 'เก็บในคลังชั่วคราวแล้ว และนำรายการเก่าสุดออก'
      : 'เก็บส่วนที่เลือกในคลังชั่วคราวแล้ว')
  }

  const placeSelected = () => {
    const api = getApi()
    const surface = getSurface()
    const item = items.find(value => value.id === selectedItemId)
    if (!api || !surface || !item || disabled) return
    const rect = surface.getBoundingClientRect()
    const center = viewportCoordsToSceneCoords({
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }, api.getAppState())
    const inserted = insertDrawingBoardSessionLibraryItem({ item, center })
    if (!inserted.ok) {
      toast.error('รายการนี้ผ่านการตรวจสอบไม่สำเร็จ จึงยังไม่ถูกวางลงกระดาน')
      return
    }
    const candidate: ScratchpadScene = {
      ...snapshotDrawingScene(getScene()),
      elements: [
        ...api.getSceneElementsIncludingDeleted(),
        ...inserted.elements,
      ],
    }
    const validation = validateDrawingScene(candidate, {
      role: 'teacher',
      verifyTeacherImage: ({ claim }) => claim ? 'valid' : 'invalid',
      legacyTeacherImages: getLegacyTeacherImages(),
    })
    if (!validation.ok) {
      toast.error('วางรายการนี้ไม่ได้ เพราะกระดานจะเกินขีดจำกัดหรือมีข้อมูลไม่รองรับ')
      return
    }
    const selectedElementIds = Object.fromEntries(
      inserted.elements.flatMap(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const elementId = (value as Record<string, unknown>).id
        return typeof elementId === 'string' ? [[elementId, true] as const] : []
      }),
    )
    api.updateScene({
      elements: validation.scene.elements as readonly OrderedExcalidrawElement[],
      appState: { selectedElementIds },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    toast.success(`วาง ${item.label} ลงกระดานแล้ว`)
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/30 px-3 py-1.5"
    >
      <LibraryBig className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="shrink-0"
        disabled={disabled}
        onPointerDown={() => {
          const api = getApi()
          if (!api) return
          pendingSelectionRef.current = new Set(
            Object.entries(api.getAppState().selectedElementIds)
              .filter(([, selected]) => selected)
              .map(([elementId]) => elementId),
          )
        }}
        onPointerUp={() => {
          // A click follows pointerup in the same browser task. Clear a
          // capture that did not become a click before a later keyboard
          // activation can accidentally reuse the stale selection.
          window.setTimeout(() => { pendingSelectionRef.current = null }, 0)
        }}
        onPointerCancel={() => { pendingSelectionRef.current = null }}
        onClick={storeSelection}
      >
        <PackagePlus data-icon="inline-start" /> เก็บส่วนที่เลือก
      </Button>
      <NativeSelect
        aria-label="รายการในคลังชั่วคราว"
        className="h-8 w-36 shrink-0 text-xs"
        value={selectedItemId}
        disabled={items.length === 0}
        onChange={event => setSelectedItemId(event.target.value)}
      >
        <option value="">{items.length === 0 ? 'คลังยังว่าง' : 'เลือกจากคลัง'}</option>
        {items.map(item => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </NativeSelect>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="shrink-0"
        disabled={!selectedItemId || disabled}
        onClick={placeSelected}
      >
        วางลงกระดาน
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        disabled={!selectedItemId}
        aria-label="ลบรายการที่เลือกจากคลังชั่วคราว"
        onClick={() => {
          if (!selectedItemId) return
          onRemove(selectedItemId)
        }}
      >
        <Trash2 />
      </Button>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        อยู่เฉพาะหน้านี้ · {items.length}/{MAX_DRAWING_SESSION_LIBRARY_ITEMS}
      </span>
    </div>
  )
}
