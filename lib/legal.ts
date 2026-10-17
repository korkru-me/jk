/** Public policy identifiers; safe to import from account forms in the browser. */
export const POLICY_VERSION = '2026-10-17'
export const POLICY_UPDATED_LABEL = '17 ตุลาคม 2569'

// A contact label, not a claim that the service is operated by a legal entity.
export const OPERATOR_NAME = 'ผู้ดูแล KorKru'
export const SUPPORT_EMAIL = 'korkru.me@gmail.com'
export const SUPPORT_EMAIL_URL = `mailto:${SUPPORT_EMAIL}`

export const LEGAL_LINKS = {
  terms: '/terms',
  privacy: '/privacy',
  contact: '/contact',
} as const
