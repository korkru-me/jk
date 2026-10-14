export interface AvatarCropPosition {
  /** Centre of the crop, as a fraction of the original image. */
  x: number
  y: number
}

export const AVATAR_MAX_ZOOM = 3

/** A square source rectangle, always contained in the original image. */
export function avatarCrop(width: number, height: number, zoom: number, position: AvatarCropPosition) {
  if (![width, height, zoom, position.x, position.y].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new RangeError('Invalid avatar crop dimensions')
  }
  const boundedZoom = Math.min(AVATAR_MAX_ZOOM, Math.max(1, zoom))
  const side = Math.min(width, height) / boundedZoom
  const centerX = Math.min(width - side / 2, Math.max(side / 2, position.x * width))
  const centerY = Math.min(height - side / 2, Math.max(side / 2, position.y * height))
  return { x: centerX - side / 2, y: centerY - side / 2, side, zoom: boundedZoom, position: { x: centerX / width, y: centerY / height } }
}

/** Move the image with the pointer; moving right exposes content to its left. */
export function moveAvatarCrop(width: number, height: number, zoom: number, position: AvatarCropPosition, frameSize: number, dx: number, dy: number) {
  if (![frameSize, dx, dy].every(Number.isFinite) || frameSize <= 0) throw new RangeError('Invalid avatar frame')
  const crop = avatarCrop(width, height, zoom, position)
  const sourcePerPixel = crop.side / frameSize
  return avatarCrop(width, height, zoom, {
    x: crop.position.x - dx * sourcePerPixel / width,
    y: crop.position.y - dy * sourcePerPixel / height,
  }).position
}
