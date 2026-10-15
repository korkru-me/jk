const LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']
export const choiceLabel = (position: number) => LABELS[position] ?? String(position + 1)

/** Stored MCQ indexes refer to authored order, not the shuffled screen order.
 * Legacy text answers are ambiguous when more than one choice has that text. */
export function studentChoicePosition(answer: string | null, choices: readonly { text: string; index?: number }[]): number | null {
  if (!answer?.trim()) return null
  if (answer.startsWith('MCQ:')) {
    if (!/^MCQ:\d+$/.test(answer)) return null
    const index = Number(answer.slice(4))
    const position = choices.findIndex((option, i) => (option.index ?? i) === index)
    return position >= 0 ? position : null
  }
  const matches = choices.flatMap((option, i) => option.text === answer ? [i] : [])
  return matches.length === 1 ? matches[0] : null
}
