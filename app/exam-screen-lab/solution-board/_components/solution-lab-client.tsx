'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { SolutionSection } from '@/components/questions/solution-section'
import type { SolutionFileStore } from '@/components/questions/solution-attachments-field'
import { SolutionFiles } from '@/components/questions/solution-files'
import { solutionUploadPath } from '@/lib/solution-attachments'

/**
 * Files live as object URLs in this tab. The Storage name a real upload would
 * get rides after the `#`, which is all the เฉลย needs to tell a PDF or a
 * board picture from a plain one.
 */
const memoryFiles: SolutionFileStore = {
  async upload(file, kind, extension) {
    return { url: `${URL.createObjectURL(file)}#${solutionUploadPath('lab', kind, extension)}` }
  },
  async release(url) {
    URL.revokeObjectURL(url.split('#')[0])
  },
  async read(url) {
    const response = await fetch(url.split('#')[0])
    return new Uint8Array(await response.arrayBuffer())
  },
}

export function SolutionLabClient() {
  const [text, setText] = useState('')
  const [urls, setUrls] = useState<string[]>([])

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <Card padding="lg" className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">ห้องทดลองเฉลย</h1>
          <p className="text-sm text-muted-foreground">
            ส่วนเฉลยชุดเดียวกับหน้าสร้างโจทย์ทุกประเภท ไฟล์อยู่ในหน่วยความจำของแท็บนี้เท่านั้น ไม่ขึ้น Storage
          </p>
        </div>
        <SolutionSection
          text={text}
          onTextChange={setText}
          imageUrls={urls}
          onImageUrlsChange={setUrls}
          fileStore={memoryFiles}
        />
      </Card>
      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-semibold">เฉลยที่ผู้เรียนจะเห็น</h2>
        {urls.length === 0
          ? <p className="text-sm text-muted-foreground">ยังไม่มีไฟล์ในเฉลย</p>
          : <SolutionFiles urls={urls} alt="เฉลยวิธีทำ" imageClassName="max-h-44 rounded-lg border object-contain" />}
      </Card>
    </main>
  )
}
