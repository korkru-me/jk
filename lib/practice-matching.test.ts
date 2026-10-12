import { describe, expect, it } from 'vitest'
import {
  placementFromPracticeMatchingTokens,
  practiceMatchingChoiceToken,
  practiceMatchingTokensFromPlacement,
  validPracticeMatchingTokens,
} from './practice-matching'

const IMAGE_CHOICES = [
  { right_text: '', right_image: 'https://example.test/cat.png' },
  { right_text: '', right_image: 'https://example.test/dog.png' },
]

describe('practice matching choice tokens', () => {
  it('is stable from displayed text and image without depending on authored position', () => {
    const content = { right_text: '<p>แมว</p>', right_image: 'https://example.test/cat.png' }
    expect(practiceMatchingChoiceToken({ ...content })).toBe(practiceMatchingChoiceToken(content))
    expect(practiceMatchingChoiceToken({ ...content, right_text: '<p>สุนัข</p>' }))
      .not.toBe(practiceMatchingChoiceToken(content))
    expect(practiceMatchingChoiceToken({ ...content, right_image: 'https://example.test/dog.png' }))
      .not.toBe(practiceMatchingChoiceToken(content))
  })

  it('round-trips an image-only placement through the browser answer', () => {
    const stored = practiceMatchingTokensFromPlacement(['1', '0'], IMAGE_CHOICES)
    expect(stored.every(Boolean)).toBe(true)
    expect(placementFromPracticeMatchingTokens(stored, IMAGE_CHOICES, 2)).toEqual(['1', '0'])
  })

  it('accepts only visible choices and enforces their multiplicity', () => {
    const cat = practiceMatchingChoiceToken(IMAGE_CHOICES[0])
    const dog = practiceMatchingChoiceToken(IMAGE_CHOICES[1])
    expect(validPracticeMatchingTokens([cat, dog], IMAGE_CHOICES, 2)).toBe(true)
    expect(validPracticeMatchingTokens([cat, ''], IMAGE_CHOICES, 2)).toBe(true)
    expect(validPracticeMatchingTokens([cat, cat], IMAGE_CHOICES, 2)).toBe(false)
    expect(validPracticeMatchingTokens(['practice-match:v1:["","https://other.test/x.png"]', ''], IMAGE_CHOICES, 2))
      .toBe(false)
  })

  it('keeps identical visible choices interchangeable when two chips exist', () => {
    const repeated = [IMAGE_CHOICES[0], { ...IMAGE_CHOICES[0] }]
    const token = practiceMatchingChoiceToken(repeated[0])
    expect(validPracticeMatchingTokens([token, token], repeated, 2)).toBe(true)
    expect(placementFromPracticeMatchingTokens([token, token], repeated, 2)).toEqual(['0', '1'])
  })
})
