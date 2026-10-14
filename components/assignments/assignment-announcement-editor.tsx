'use client'

import { toast } from 'sonner'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  assignmentAnnouncementImagePath,
  checkAssignmentAnnouncementImage,
  isAssignmentAnnouncementImageSrc,
} from '@/lib/assignment-announcement'
import { downscaleImage } from '@/lib/image-downscale'
import { uploadErrorMessage } from '@/lib/upload-error'

const BUCKET = 'question-images'
const BUCKET_MAX_MB = 10

async function uploadAnnouncementImage(original: File): Promise<string | null> {
  const file = await downscaleImage(original)
  const check = checkAssignmentAnnouncementImage({
    name: original.name,
    type: file.type,
    size: file.size,
  })
  if (!check.ok) {
    toast.error(check.message)
    return null
  }

  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    toast.error('ไม่ได้เข้าสู่ระบบ')
    return null
  }

  const path = assignmentAnnouncementImagePath(user.id, check.extension)
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  })
  if (error) {
    toast.error(uploadErrorMessage(error.message, original.name, BUCKET_MAX_MB))
    return null
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function AssignmentAnnouncementEditor({ value, onChange, rows }: {
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      placeholder="เช่น โปรดเตรียมเครื่องคิดเลข อ่านกติกาให้ครบ หรือแจ้งสิ่งที่ต้องทำก่อนเริ่ม"
      rows={rows ?? 5}
      ariaLabel="ชี้แจงรายละเอียดเพิ่มเติม"
      images={{
        upload: uploadAnnouncementImage,
        accepts: isAssignmentAnnouncementImageSrc,
      }}
    />
  )
}
