/** Encode a sanitized UTF-8 filename for Content-Disposition filename*. */
export function encodeRfc5987Filename(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}
