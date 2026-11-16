'use client'

import { useEffect, useState } from 'react'
import { Download, FileText, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { GROUP_WORK_BUCKET, GROUP_WORK_FILE_MAX, type GroupWorkFile, type GroupWorkMember, type GroupWorkSubmission } from '@/lib/classroom-group-work'

export function GroupMemberList({ members, authorId }: { members: GroupWorkMember[]; authorId: string | null }) {
  return <section aria-label="สมาชิก">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">สมาชิก</h3><Badge variant="secondary">{members.length} คน</Badge></div>
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {members.map(member => <li key={member.id} className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
        {member.number != null && <span className="text-muted-foreground">{member.number}</span>}<span className="break-words">{member.name}</span>
        {member.id === authorId && <Badge variant="outline">ผู้ส่ง</Badge>}
      </li>)}
    </ul>
  </section>
}

export function GroupWorkContent({ item }: { item: GroupWorkSubmission }) {
  const [chosen, setChosen] = useState(item.response ? 'response' : item.files[0]?.path)
  const file = item.files.find(value => value.path === chosen)
  return <Card padding="md" className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">ผลงานที่ส่ง</h3><Badge variant="outline">{Number(Boolean(item.response)) + item.files.length} รายการ</Badge></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="รูปแบบผลงานที่ส่ง">
      {item.response && <Button type="button" size="sm" className="pointer-coarse:min-h-11" variant={chosen === 'response' ? 'default' : 'outline'} aria-pressed={chosen === 'response'} onClick={() => setChosen('response')}>
        <FileText data-icon="inline-start" />คำตอบที่เขียน
      </Button>}
      {item.files.map(value => <Button key={value.path} type="button" size="sm" className="max-w-full justify-start pointer-coarse:min-h-11" variant={chosen === value.path ? 'default' : 'outline'} aria-pressed={chosen === value.path} onClick={() => setChosen(value.path)}>
        <Paperclip data-icon="inline-start" /><span className="truncate">{value.name}</span>
      </Button>)}
    </div>
    <Separator />
    {chosen === 'response' && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.response}</p>}
    {file && <AuthorizedAttachment key={file.path} file={file} />}
  </Card>
}

function AuthorizedAttachment({ file }: { file: GroupWorkFile }) {
  const [active, setActive] = useState<{ url?: string; inline?: 'pdf' | 'image'; error?: boolean }>({})
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    let objectUrl: string | undefined
    setActive({})
    void (async () => {
      try {
        const { data, error } = await createClient().storage.from(GROUP_WORK_BUCKET).download(file.path)
        if (error || !data || data.size <= 0 || data.size > GROUP_WORK_FILE_MAX) throw new Error('file')
        const b = new Uint8Array(await data.slice(0, 12).arrayBuffer())
        const magic = new TextDecoder().decode(b)
        let contentType: string | undefined
        if (file.kind === 'pdf' && magic.startsWith('%PDF-')) contentType = 'application/pdf'
        if (file.kind === 'image') {
          if (b[0] === 137 && magic.slice(1, 4) === 'PNG' && b[4] === 13 && b[5] === 10) contentType = 'image/png'
          else if (b[0] === 255 && b[1] === 216 && b[2] === 255) contentType = 'image/jpeg'
          else if (magic.startsWith('RIFF') && magic.slice(8, 12) === 'WEBP') contentType = 'image/webp'
        }
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(data.slice(0, data.size, contentType ?? 'application/octet-stream'))
        setActive({ url: objectUrl, inline: contentType === 'application/pdf' ? 'pdf' : contentType ? 'image' : undefined })
      } catch { if (!abort.signal.aborted) setActive({ error: true }) }
    })()
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [file.path, file.kind, retry])

  if (active.error) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">เปิดไฟล์ไม่สำเร็จ
    <Button type="button" size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>ลองอีกครั้ง</Button></div>
  if (!active.url) return <p role="status" className="text-sm text-muted-foreground">กำลังเปิดไฟล์…</p>
  return <figure className="flex min-w-0 flex-col gap-2">
    <figcaption className="flex flex-wrap items-center justify-between gap-2">
      <span className="break-all text-sm font-medium">{file.name}</span>
      <div className="flex flex-wrap gap-2">
        {active.inline && <Button variant="outline" size="sm" nativeButton={false} className="pointer-coarse:min-h-11" render={<a href={active.url} target="_blank" rel="noopener noreferrer" />}>เปิดไฟล์เต็ม</Button>}
        <Button variant="outline" size="sm" nativeButton={false} className="pointer-coarse:min-h-11" render={<a href={active.url} download={file.name} />}><Download data-icon="inline-start" />ดาวน์โหลด</Button>
      </div>
    </figcaption>
    {active.inline === 'pdf' ? <iframe src={active.url} title={`ตัวอย่าง PDF: ${file.name}`} referrerPolicy="no-referrer" className="h-[min(65dvh,38rem)] min-h-64 w-full rounded-lg border border-border" />
      // eslint-disable-next-line @next/next/no-img-element -- Browser-only URL from validated image bytes.
      : active.inline === 'image' ? <img src={active.url} alt={file.name} className="max-h-[60dvh] max-w-full self-start rounded-lg object-contain" />
      : <p className="text-sm text-muted-foreground">ดาวน์โหลดไฟล์เพื่อเปิดในโปรแกรมที่รองรับ</p>}
  </figure>
}
