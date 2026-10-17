'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Crop, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AVATAR_MAX_ZOOM, avatarCrop, moveAvatarCrop, type AvatarCropPosition } from '@/lib/avatar-crop'

interface ImageDraft { source: string; image: HTMLImageElement; ownedUrl: boolean }
const CENTER: AvatarCropPosition = { x: .5, y: .5 }

/** Saves the square crop through the parent; retains the draft when saving fails. */
export function AvatarCropEditor({ src, onChange }: { src: string | null; onChange: (file: File) => Promise<{ error?: string }> }) {
  const [draft, setDraft] = useState<ImageDraft | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState(CENTER)
  const [frameSize, setFrameSize] = useState(288)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileButtonRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const lastEditorFocusRef = useRef<HTMLElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dismissFocusRef = useRef<HTMLElement | null>(null)
  const loadEpoch = useRef(0)
  const drag = useRef<{ id: number; x: number; y: number; position: AvatarCropPosition } | null>(null)

  useEffect(() => () => { loadEpoch.current += 1 }, [])
  useEffect(() => () => { if (draft?.ownedUrl) URL.revokeObjectURL(draft.source) }, [draft])
  const attachFrame = useCallback((frame: HTMLDivElement | null) => {
    frameRef.current = frame
    if (!frame) return
    const measure = () => setFrameSize(frame.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  async function beginEditing(source: string, ownedUrl: boolean) {
    const epoch = ++loadEpoch.current
    setLoading(true)
    try {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = source
      await image.decode()
      if (image.naturalWidth * image.naturalHeight > 48_000_000 || Math.max(image.naturalWidth, image.naturalHeight) > 16384) {
        throw new Error('Image too large')
      }
      if (epoch !== loadEpoch.current) { if (ownedUrl) URL.revokeObjectURL(source); return }
      setDraft({ source, image, ownedUrl })
      setZoom(1)
      setPosition(CENTER)
      setOpen(true)
    } catch {
      if (ownedUrl) URL.revokeObjectURL(source)
      if (epoch === loadEpoch.current) toast.error('เปิดรูปนี้ไม่ได้ กรุณาเลือกไฟล์รูปจากเครื่องอีกครั้ง')
    } finally {
      if (epoch === loadEpoch.current) setLoading(false)
    }
  }

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // Allow selecting the same file again after cancelling.
    if (!file) return
    triggerRef.current = fileButtonRef.current
    if (file.size > 2 * 1024 * 1024) { toast.error('ขนาดไฟล์ต้องไม่เกิน 2MB'); return }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast.error('กรุณาเลือกไฟล์ JPG, PNG, WebP หรือ GIF'); return
    }
    void beginEditing(URL.createObjectURL(file), true)
  }

  const crop = draft ? avatarCrop(draft.image.naturalWidth, draft.image.naturalHeight, zoom, position) : null
  function changeZoom(value: number) {
    if (!draft) return
    const next = avatarCrop(draft.image.naturalWidth, draft.image.naturalHeight, value, position)
    setZoom(next.zoom)
    setPosition(next.position)
  }
  function move(dx: number, dy: number, from = position) {
    if (!draft) return
    setPosition(moveAvatarCrop(draft.image.naturalWidth, draft.image.naturalHeight, zoom, from, frameSize, dx, dy))
  }
  function discardDraft() {
    drag.current = null
    setOpen(false)
    setDraft(null)
  }
  function requestClose() {
    if (saveLock.current) return
    const active = document.activeElement
    dismissFocusRef.current = active instanceof HTMLElement && popupRef.current?.contains(active)
      ? active : lastEditorFocusRef.current ?? frameRef.current
    setConfirmClose(true)
  }
  async function useImage() {
    if (!draft || !crop || saveLock.current) return
    saveLock.current = true
    setSaving(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(draft.image, crop.x, crop.y, crop.side, crop.side, 0, 0, 512, 512)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Empty crop')), 'image/png'))
      const result = await onChange(new File([blob], 'avatar.png', { type: 'image/png' }))
      if (result.error) { toast.error(result.error); return }
      discardDraft()
    } catch {
      toast.error('บันทึกรูปนี้ไม่ได้ กรุณาลองใหม่อีกครั้ง')
    } finally { saveLock.current = false; setSaving(false) }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button ref={fileButtonRef} type="button" variant="link" size="xs" className="px-0" disabled={loading || saving}
          onClick={event => { triggerRef.current = event.currentTarget; fileRef.current?.click() }}>
          {loading ? 'กำลังเปิดรูป…' : 'เปลี่ยนรูปโปรไฟล์'}
        </Button>
        {src && <Button type="button" variant="ghost" size="xs" disabled={loading || saving}
          onClick={event => { triggerRef.current = event.currentTarget; void beginEditing(src, false) }}>
          <Crop size={13} /> จัดตำแหน่งรูป
        </Button>}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={selectFile} aria-label="เลือกไฟล์รูปโปรไฟล์" />
      </div>
      <Dialog open={open} onOpenChange={(next, details) => {
        if (!next) { details.cancel(); requestClose() }
      }}>
        <DialogContent ref={popupRef} showCloseButton={false} initialFocus={frameRef} finalFocus={triggerRef}
          onFocusCapture={event => { lastEditorFocusRef.current = event.target as HTMLElement }}
          className="sm:max-w-sm motion-reduce:animate-none">
          <DialogHeader className="pr-8">
            <DialogTitle>จัดตำแหน่งรูปโปรไฟล์</DialogTitle>
            <DialogDescription>ลากรูปให้ส่วนที่ต้องการอยู่ในกรอบ ใช้ปุ่มซูมหรือปุ่มลูกศรปรับตำแหน่งได้</DialogDescription>
          </DialogHeader>
          <Button type="button" variant="ghost" size="icon-sm" className="absolute right-2 top-2" aria-label="ปิดการจัดตำแหน่งรูป" disabled={saving} onClick={requestClose}><X size={16} /></Button>
          <Card ref={attachFrame} edge="ring" radius="lg" role="group" tabIndex={0}
            aria-label="พื้นที่จัดตำแหน่งรูปโปรไฟล์ ใช้ปุ่มลูกศรเลื่อนรูป"
            className="relative mx-auto aspect-square w-full max-w-72 touch-none cursor-grab overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
            onPointerDown={event => {
              if (saving || event.button !== 0) return
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, position }
            }}
            onPointerMove={event => {
              const start = drag.current
              if (start?.id === event.pointerId) move(event.clientX - start.x, event.clientY - start.y, start.position)
            }}
            onPointerUp={event => {
              if (drag.current?.id !== event.pointerId) return
              drag.current = null
              event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onPointerCancel={() => { drag.current = null }}
            onKeyDown={event => {
              if (saving) return
              const amount = event.shiftKey ? 36 : 12
              const delta: Record<string, [number, number]> = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }
              if (delta[event.key]) { event.preventDefault(); move(...delta[event.key]) }
            }}>
            {draft && crop && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.source} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{
                width: draft.image.naturalWidth * frameSize / crop.side,
                height: draft.image.naturalHeight * frameSize / crop.side,
                left: -crop.x * frameSize / crop.side,
                top: -crop.y * frameSize / crop.side,
              }} />
            )}
          </Card>
          <div className="flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="icon-sm" aria-label="ซูมออก" disabled={saving || zoom <= 1} onClick={() => changeZoom(zoom - .1)}><Minus size={15} /></Button>
            <output className="w-12 text-center text-xs tabular-nums" aria-label="ระดับการซูม" aria-live="polite">{Math.round(zoom * 100)}%</output>
            <Button type="button" variant="outline" size="icon-sm" aria-label="ซูมเข้า" disabled={saving || zoom >= AVATAR_MAX_ZOOM} onClick={() => changeZoom(zoom + .1)}><Plus size={15} /></Button>
            <Button type="button" variant="ghost" size="xs" disabled={saving} onClick={() => { setZoom(1); setPosition(CENTER) }}><RotateCcw size={13} /> เริ่มใหม่</Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>ยกเลิก</Button>
            <Button type="button" disabled={saving} onClick={() => { void useImage() }}>{saving ? 'กำลังบันทึก…' : 'บันทึกรูป'}</Button>
          </DialogFooter>
        </DialogContent>
        <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="ยกเลิกการจัดรูปนี้?"
          description="ตำแหน่งและการซูมที่ปรับไว้จะถูกยกเลิก รูปที่แสดงในหน้าและข้อมูลส่วนตัวที่กรอกไว้จะยังอยู่"
          cancelLabel="กลับไปจัดรูปต่อ" confirmLabel="ยืนยันปิด"
          finalFocus={open ? dismissFocusRef : triggerRef} onConfirm={discardDraft} />
      </Dialog>
    </>
  )
}
