import { COVER_PRESETS, type CoverPreset } from './classroom-meta'

const PRESET_BY_ID = new Map(COVER_PRESETS.map(p => [p.id, p]))

/**
 * The classroom cover colour a กลุ่มย่อย theme id stands for — groups reuse
 * the cover palette, so they follow the theme and dark mode the same way.
 */
export function groupPreset(color: string): CoverPreset {
  return PRESET_BY_ID.get(color) ?? PRESET_BY_ID.get('purple')!
}
