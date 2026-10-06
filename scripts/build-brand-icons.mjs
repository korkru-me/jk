import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// Browser and home-screen icons stay raster, but are rendered from the sharp vector mark.
const mark = fileURLToPath(new URL('../public/brand/deer-mark.svg', import.meta.url))

for (const [filename, size] of [['icon.png', 512], ['apple-icon.png', 180]]) {
  const content = await sharp(mark)
    .resize({ width: Math.round(size * 0.8), height: Math.round(size * 0.8), fit: 'inside' })
    .png()
    .toBuffer()

  await sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } })
    .composite([{ input: content, gravity: 'centre' }])
    .png()
    .toFile(fileURLToPath(new URL(`../app/${filename}`, import.meta.url)))
}
