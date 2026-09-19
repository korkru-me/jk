import { describe, it, expect } from 'vitest'
import { matchingChoices, matchingChoiceCount } from './matching-choices'
import type { MatchingConfig, MatchingPair } from './types'

const pairs: MatchingPair[] = [
  { left_text: 'แรง', right_text: 'นิวตัน' },
  { left_text: 'งาน', right_text: 'จูล', right_image: 'https://x.test/joule.png' },
]

describe('the choices a จับคู่ offers', () => {
  it('is the pairs when nothing else was added', () => {
    expect(matchingChoices(pairs, undefined)).toEqual([
      { right_text: 'นิวตัน' },
      { right_text: 'จูล', right_image: 'https://x.test/joule.png' },
    ])
  })

  it('puts distractors after the pairs, never among them', () => {
    // `option_order` is a permutation of these positions and is frozen into
    // every attempt. Positions below pairs.length therefore have to keep
    // meaning what they meant before distractors existed, or an attempt taken
    // last term reads a student's answer against the wrong chips.
    const config: MatchingConfig = { distractors: [{ text: 'วัตต์' }, { text: 'โอห์ม' }] }
    expect(matchingChoices(pairs, config).map(choice => choice.right_text))
      .toEqual(['นิวตัน', 'จูล', 'วัตต์', 'โอห์ม'])
    expect(matchingChoiceCount(pairs, config)).toBe(4)
  })

  it('carries a distractor picture through as a choice picture', () => {
    const config: MatchingConfig = { distractors: [{ text: 'กบ', image: 'https://x.test/frog.png' }] }
    expect(matchingChoices([], config)).toEqual([
      { right_text: 'กบ', right_image: 'https://x.test/frog.png' },
    ])
  })

  it('treats a โจทย์ with no distractors exactly as it did before', () => {
    for (const config of [undefined, null, {}, { answer_mode: 'lines' as const }]) {
      expect(matchingChoiceCount(pairs, config), String(config)).toBe(pairs.length)
    }
  })
})
