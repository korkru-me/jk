import { ZoomableImage } from '@/components/questions/zoomable-image'

/** Illustrations stay beside their own statement in previews and student views. */
export function StatementImages({ urls }: { urls?: string[] }) {
  if (!urls?.length) return null
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {urls.map(url => (
        <ZoomableImage key={url} src={url} alt="รูปภาพประกอบข้อความย่อย" className="max-h-64 max-w-full rounded-lg border border-border object-contain" />
      ))}
    </div>
  )
}
