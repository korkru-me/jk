/** N2 compatibility lab only. Never imported by KorKru's production admission gate. */
import { gzipSync, gunzipSync } from 'node:zlib'
import { MAX_BYTES, toPlist } from '../seb-phase1/config.mjs'

const MAX_INNER = MAX_BYTES + 1024
const MAX_FILE = MAX_INNER + 1024

// SEB format: outer gzip -> plnd -> gzipped XML. plnd is NOT encryption.
export function encodePlainExam(settings) {
  if (settings?.sebConfigPurpose !== 0) throw new Error('Only starting-exam lab configs are allowed')
  return gzipSync(Buffer.concat([Buffer.from('plnd'), gzipSync(Buffer.from(toPlist(settings), 'utf8'))]))
}

export function decodePlainExam(file) {
  if (!Buffer.isBuffer(file) || file.length > MAX_FILE) throw new Error('Invalid lab file size')
  const inner = gunzipSync(file, { maxOutputLength: MAX_INNER })
  if (!inner.subarray(0, 4).equals(Buffer.from('plnd'))) throw new Error('Expected plnd lab file')
  return gunzipSync(inner.subarray(4), { maxOutputLength: MAX_BYTES }).toString('utf8')
}
