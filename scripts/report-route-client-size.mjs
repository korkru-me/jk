import { existsSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const route = process.argv[2]

if (!route) {
  console.error('Usage: node scripts/report-route-client-size.mjs <app route manifest path>')
  process.exitCode = 1
} else {
  const manifestPath = `.next/server/${route}_client-reference-manifest.js`

  if (!existsSync(manifestPath)) {
    console.error(`ไม่พบ ${manifestPath} — รัน npm run build ก่อนวัด`)
    process.exitCode = 1
  } else {
    const manifest = readFileSync(manifestPath, 'utf8')
    const displayRoute = route
      .replace(/^app\/(?:\([^/]+\)\/)*|\/page$/g, match => match.endsWith('/page') ? '' : '/')
    const chunks = [...new Set(
      [...manifest.matchAll(/\/_next\/(static\/chunks\/[^\"]+\.js)/g)]
        .map(match => match[1]),
    )]

    const rows = chunks
      .map(chunk => {
        const path = `.next/${chunk}`
        const source = readFileSync(path)
        return {
          chunk,
          rawBytes: statSync(path).size,
          gzipBytes: gzipSync(source).byteLength,
        }
      })
      .sort((left, right) => right.rawBytes - left.rawBytes)

    const rawBytes = rows.reduce((total, row) => total + row.rawBytes, 0)
    const gzipBytes = rows.reduce((total, row) => total + row.gzipBytes, 0)
    const formatMiB = bytes => `${(bytes / 1_048_576).toFixed(3)} MiB`

    console.log(`Route: ${displayRoute}`)
    console.log(`Manifest: ${manifestPath}`)
    console.log(`Client chunks: ${rows.length}`)
    console.log(`Raw client JavaScript: ${formatMiB(rawBytes)} (${rawBytes} bytes)`)
    console.log(`Gzip client JavaScript: ${formatMiB(gzipBytes)} (${gzipBytes} bytes)`)
    console.log('Largest chunks:')
    for (const row of rows.slice(0, 10)) {
      console.log(`  ${formatMiB(row.rawBytes)} raw · ${formatMiB(row.gzipBytes)} gzip · ${row.chunk}`)
    }
  }
}
