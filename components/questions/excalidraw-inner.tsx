'use client'

import '@excalidraw/excalidraw/index.css'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import { useRef } from 'react'

interface Props {
  onSave: (blob: Blob) => void
}

export default function ExcalidrawInner({ onSave }: Props) {
  const apiRef = useRef<any>(null)

  async function handleSave() {
    if (!apiRef.current) return
    const blob = await exportToBlob({
      elements: apiRef.current.getSceneElements(),
      appState: {
        ...apiRef.current.getAppState(),
        exportBackground: true,
      },
      files: apiRef.current.getFiles(),
      mimeType: 'image/png',
    })
    onSave(blob)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api }}
        />
      </div>
      <div className="p-3 border-t bg-white flex justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          บันทึกและแทรกในโจทย์
        </button>
      </div>
    </div>
  )
}
