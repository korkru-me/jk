'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, X } from 'lucide-react'

const ExcalidrawInner = dynamic(() => import('./excalidraw-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  ),
})

interface Props {
  onSave: (url: string) => void
  onClose: () => void
}

export function WhiteboardModal({ onSave, onClose }: Props) {
  const [uploading, setUploading] = useState(false)

  async function handleBlob(blob: Blob) {
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const path = `${user.id}/wb_${Date.now()}.png`
    const { error } = await supabase.storage
      .from('question-images')
      .upload(path, blob, { contentType: 'image/png', upsert: false })

    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(path)
      onSave(publicUrl)
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">กระดานวาด</h2>
        <div className="flex items-center gap-3">
          {uploading && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              กำลังอัปโหลด...
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <ExcalidrawInner onSave={handleBlob} />
      </div>
    </div>
  )
}
