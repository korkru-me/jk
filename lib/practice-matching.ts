/**
 * Ephemeral answer tokens for matching questions in the no-score practice
 * library.
 *
 * Assignment submissions must keep their historical `right_text[]` shape,
 * but that shape cannot represent a choice which consists only of an image.
 * Practice answers are never persisted, so they use a versioned token built
 * from exactly the choice content the student can already see. The token does
 * not contain an authored position, which would reveal which prompt owns a
 * choice before the answer is checked.
 */

export interface PracticeMatchingChoice {
  right_text?: string
  right_image?: string
}

const TOKEN_PREFIX = 'practice-match:v1:'

function choiceContent(choice: PracticeMatchingChoice): readonly [string, string] {
  return [
    typeof choice.right_text === 'string' ? choice.right_text : '',
    typeof choice.right_image === 'string' ? choice.right_image : '',
  ]
}

/** Stable and collision-free for the two displayed string fields. */
export function practiceMatchingChoiceToken(choice: PracticeMatchingChoice): string {
  return TOKEN_PREFIX + JSON.stringify(choiceContent(choice))
}

/** Resolve browser-carried tokens back to the shuffled choice ids used by the input. */
export function placementFromPracticeMatchingTokens(
  tokens: string[],
  choices: PracticeMatchingChoice[],
  promptCount: number,
): (string | null)[] {
  const used = new Set<number>()
  return Array.from({ length: promptCount }, (_, promptIndex) => {
    const token = tokens[promptIndex]
    if (!token) return null
    const choiceIndex = choices.findIndex((choice, index) => (
      !used.has(index) && practiceMatchingChoiceToken(choice) === token
    ))
    if (choiceIndex === -1) return null
    used.add(choiceIndex)
    return String(choiceIndex)
  })
}

/** Serialize the input's shuffled choice ids without relying on `right_text`. */
export function practiceMatchingTokensFromPlacement(
  placement: (string | null)[],
  choices: PracticeMatchingChoice[],
): string[] {
  return placement.map(id => {
    if (id === null) return ''
    const index = Number(id)
    return Number.isInteger(index) && index >= 0 && choices[index]
      ? practiceMatchingChoiceToken(choices[index])
      : ''
  })
}

/**
 * A submitted token must name a visible choice, and one visible chip cannot be
 * used twice. Counts preserve the intended interchangeability of truly
 * identical choices while rejecting a duplicated token when only one exists.
 */
export function validPracticeMatchingTokens(
  tokens: string[],
  choices: PracticeMatchingChoice[],
  promptCount: number,
): boolean {
  if (tokens.length !== promptCount || !tokens.some(Boolean)) return false
  const remaining = new Map<string, number>()
  for (const choice of choices) {
    const token = practiceMatchingChoiceToken(choice)
    remaining.set(token, (remaining.get(token) ?? 0) + 1)
  }
  for (const token of tokens) {
    if (!token) continue
    const available = remaining.get(token) ?? 0
    if (available < 1) return false
    remaining.set(token, available - 1)
  }
  return true
}

export function practiceMatchingChoiceForToken(
  token: string,
  choices: PracticeMatchingChoice[],
): { choice: PracticeMatchingChoice; index: number } | null {
  const index = choices.findIndex(choice => practiceMatchingChoiceToken(choice) === token)
  return index === -1 ? null : { choice: choices[index], index }
}
