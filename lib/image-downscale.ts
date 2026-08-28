/**
 * Shrinking an image in the browser, before it is ever uploaded.
 *
 * Nothing between a teacher's camera roll and a student's screen used to touch
 * the bytes: the file went to Storage exactly as picked, was served back with a
 * plain `<img src>`, and CSS scaled a 4000px photo down to a 208px box on the
 * way past. The cost is paid twice — once by whoever uploads, on the school
 * connection they are uploading from, and again by every student who opens the
 * งาน, every attempt.
 *
 * The upload side is the half that actually hurts. "แนบรูปแสดงวิธีทำ" opens the
 * phone camera (`capture="environment"`), so the file is a full-resolution
 * photo, 2–5 MB of it, and the student is pushing it up during a timed exam. A
 * slow upload there is not an inconvenience, it is an answer that does not
 * arrive before the timer does. That is why this runs in the browser rather
 * than on a server: by the time a server could resize anything, the expensive
 * part already happened.
 *
 * What it will not do:
 *   - touch anything that is not a still raster image (PDF, SVG, GIF). GIF is
 *     excluded because a canvas keeps one frame and silently drops the
 *     animation.
 *   - return a file larger than the one it was given. Re-encoding a 4 KB
 *     diagram usually makes it bigger and worse, and most of this คลัง is
 *     4 KB diagrams.
 *   - guess when it cannot read the image's orientation. A phone photo carries
 *     its rotation in EXIF, and a canvas that ignores that turns every portrait
 *     photo on its side. Where the browser cannot tell us, the original is
 *     uploaded untouched instead.
 */

/** Longest edge kept, in pixels. Comfortably above any display size in the app
 *  (the exam page caps images at ~208px tall) while still legible when a
 *  student pinch-zooms a photo of their own handwriting. */
export const MAX_EDGE = 1600

/** Re-encode quality. High enough that pencil on paper stays readable. */
export const QUALITY = 0.82

/** Below this, an image is already small enough that re-encoding it is churn:
 *  the saving is a few KB and the loss is real. Only applies when the image
 *  also fits within MAX_EDGE — anything oversized is resized whatever it
 *  weighs. */
export const SKIP_BELOW_BYTES = 200 * 1024

/** Types a canvas can redraw without losing something the file was carrying. */
const SHRINKABLE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

export function canShrink(type: string): boolean {
  return SHRINKABLE.has(type.toLowerCase())
}

/**
 * The size to draw at: the same box scaled so its longest edge is at most
 * `maxEdge`, or the original box when it already fits. Never enlarges.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest === 0) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Whether a file is worth re-encoding at all, given its type, weight and
 * pixel size. Separated from the drawing so the rule can be read and tested
 * without a canvas.
 */
export function shouldShrink(
  type: string,
  bytes: number,
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): boolean {
  if (!canShrink(type)) return false
  const fitted = fitWithin(width, height, maxEdge)
  const oversized = fitted.width !== width || fitted.height !== height
  return oversized || bytes > SKIP_BELOW_BYTES
}

/** Swaps a filename's extension for the one matching its new encoding. The
 *  upload paths build their storage key from this, so it has to follow. */
export function renameForType(name: string, type: string): string {
  const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg'
  const stem = name.replace(/\.[^./\\]+$/, '') || 'image'
  return `${stem}.${ext}`
}

/** Promise wrapper for the callback-style canvas encoder. */
function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * Reduces `file` to at most `maxEdge` on its longest side and re-encodes it.
 *
 * Returns the original file unchanged whenever shrinking is not possible or not
 * an improvement, so callers can pass everything through it without checking
 * first — including PDFs.
 */
export async function downscaleImage(
  file: File,
  { maxEdge = MAX_EDGE, quality = QUALITY }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (!canShrink(file.type)) return file
  // No `createImageBitmap` means no reliable way to honour EXIF rotation, and a
  // sideways photo of someone's working is worse than a large one.
  if (typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file // not decodable here — let the server store whatever it is
  }

  try {
    if (!shouldShrink(file.type, file.size, bitmap.width, bitmap.height, maxEdge)) return file

    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    // WebP first: it is smaller than JPEG at the same quality and, unlike JPEG,
    // it keeps transparency. A browser that cannot encode it hands back a PNG
    // instead of failing, so the type is checked rather than assumed.
    let blob = await encode(canvas, 'image/webp', quality)
    if (!blob || blob.type !== 'image/webp') {
      // Falling back to JPEG would paint a PNG's transparent pixels black, so
      // a PNG keeps its original bytes rather than being quietly wrecked.
      if (file.type === 'image/png') return file
      blob = await encode(canvas, 'image/jpeg', quality)
    }
    if (!blob) return file

    // Re-encoding does not always win — small, flat or already-optimised images
    // come back bigger. Upload whichever is smaller.
    if (blob.size >= file.size) return file

    return new File([blob], renameForType(file.name, blob.type), {
      type: blob.type,
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    bitmap.close()
  }
}
