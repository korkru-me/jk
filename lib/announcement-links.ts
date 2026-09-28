import { linkify } from './linkify'

const MAX_ANNOUNCEMENT_URL_LENGTH = 2_048
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export interface AnnouncementLink {
  href: string
  host: string
  youtubeVideoId: string | null
}

/**
 * Accepts a pasted web address, adds https:// for a familiar bare domain, and
 * rejects every non-web scheme. The normalized value is safe to place in an
 * anchor; embeds are handled separately and never use this URL directly.
 */
export function normalizeAnnouncementUrl(input: string): string | null {
  const value = input.trim()
  if (!value || value.length > MAX_ANNOUNCEMENT_URL_LENGTH) return null

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Returns a YouTube id only for known YouTube hosts and URL shapes. */
export function youtubeVideoId(input: string): string | null {
  const normalized = normalizeAnnouncementUrl(input)
  if (!normalized) return null

  const url = new URL(normalized)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let candidate: string | null = null

  if (host === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (
    host === 'youtube.com'
    || host === 'm.youtube.com'
    || host === 'music.youtube.com'
    || host === 'youtube-nocookie.com'
  ) {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v')
    else {
      const [kind, id] = url.pathname.split('/').filter(Boolean)
      if (['embed', 'shorts', 'live'].includes(kind)) candidate = id ?? null
    }
  }

  return candidate && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null
}

/** Unique, display-ready links found in an announcement body, in text order. */
export function announcementLinks(body: string): AnnouncementLink[] {
  const seen = new Set<string>()
  const result: AnnouncementLink[] = []

  for (const segment of linkify(body)) {
    if (segment.type !== 'link') continue
    const href = normalizeAnnouncementUrl(segment.href)
    if (!href || seen.has(href)) continue
    seen.add(href)
    result.push({
      href,
      host: new URL(href).hostname.replace(/^www\./, ''),
      youtubeVideoId: youtubeVideoId(href),
    })
  }

  return result
}

export function appendAnnouncementLink(body: string, href: string): string {
  const normalized = normalizeAnnouncementUrl(href)
  if (!normalized) return body
  if (announcementLinks(body).some(link => link.href === normalized)) return body
  return [body.trimEnd(), normalized].filter(Boolean).join('\n')
}
