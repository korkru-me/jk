import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

// Browser tabs use black for legibility; the shared mark and Apple icon stay purple.
const mark = fileURLToPath(new URL('../public/brand/deer-mark.svg', import.meta.url))
const source = await readFile(mark, 'utf8')

for (const [filename, size] of [['icon.png', 512], ['apple-icon.png', 180]]) {
  const isBrowserIcon = filename === 'icon.png'
  // Pad the tight source viewBox so the added outline cannot clip the antler tips.
  // Apply this only to the tab icon; shared logo geometry and Apple artwork stay intact.
  const input = isBrowserIcon
    ? Buffer.from(source
      .replace(/viewBox="[^"]*"/, 'viewBox="134 198 757 1048"')
      .replace(/fill="[^"]*"/g, 'fill="#000000"')
      .replace('<path ', '<path stroke="#000000" stroke-width="16" stroke-linejoin="round" '))
    : mark
  const contentSize = Math.round(size * (isBrowserIcon ? 0.96 : 0.86))
  const content = await sharp(input)
    .resize({ width: contentSize, height: contentSize, fit: 'inside' })
    .png()
    .toBuffer()

  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/>`
    + '</svg>',
  )

  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: circle }, { input: content, gravity: 'centre' }])
    .png()
    .toFile(fileURLToPath(new URL(`../app/${filename}`, import.meta.url)))
}
