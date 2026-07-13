export type PartLabelStyle = 'thai' | 'number' | 'latin'

export const PART_LABEL_SETS: Record<PartLabelStyle, string[]> = {
  thai: ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ'],
  number: ['1', '2', '3', '4', '5', '6', '7', '8'],
  latin: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
}

export function partLabels(style: PartLabelStyle | null | undefined): string[] {
  return PART_LABEL_SETS[style ?? 'thai']
}
