/** Embeds beside student records are limited to this project's own buckets. */
export function gradingAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (process.env.NODE_ENV !== 'production' && /^\/exam-screen-lab\/grading-workspace\/assets\/(?:work-\d+\.svg|file-\d+\.pdf)$/.test(value)) return value
  try {
    const url = new URL(value)
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== storage.origin || url.username || url.password) return null
    if (!/^\/storage\/v1\/object\/(?:public|sign)\/(?:question-images|work-images|submission-files|math-work-artifacts)\//.test(url.pathname)) return null
    if (/%2e|%2f|%5c/i.test(url.pathname)) return null
    return url.href
  } catch { return null }
}
