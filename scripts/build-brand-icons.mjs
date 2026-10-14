import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

// Browser tabs use black for legibility; the shared mark and Apple icon stay purple.
const mark = fileURLToPath(new URL('../public/brand/deer-mark.svg', import.meta.url))
const source = await readFile(mark, 'utf8')

for (const [filename, size] of [['icon.png', 512], ['apple-icon.png', 180]]) {
  const input = filename === 'icon.png'
    ? Buffer.from(source.replace(/fill="[^"]*"/g, 'fill="#000000"'))
    : mark
  const content = await sharp(input)
    .resize({ width: Math.round(size * 0.86), height: Math.round(size * 0.86), fit: 'inside' })
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
