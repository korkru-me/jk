/**
 * Pythagorean triple tables, kept out of the evaluator on purpose.
 *
 * These are plain data. They used to live in `evaluator.ts`, which imports
 * mathjs — so a panel that only wanted the list of families pulled a 638 KB
 * maths engine into the page along with it. Anything that needs the numbers
 * without needing to evaluate anything imports them from here instead.
 */

export interface PythagoreanFamily {
  name: string
  triples: [number, number, number][]
}

export const PYTHAGOREAN_FAMILIES: PythagoreanFamily[] = [
  {
    name: 'ครอบครัว 3-4-5',
    triples: [[3,4,5],[6,8,10],[9,12,15],[12,16,20],[15,20,25],[30,40,50]],
  },
  {
    name: 'ครอบครัว 5-12-13',
    triples: [[5,12,13],[10,24,26],[15,36,39],[25,60,65],[50,120,130]],
  },
  {
    name: 'ครอบครัว 8-15-17',
    triples: [[8,15,17],[16,30,34],[24,45,51],[40,75,85]],
  },
  {
    name: 'ครอบครัว 7-24-25',
    triples: [[7,24,25],[14,48,50],[21,72,75]],
  },
  {
    name: 'ครอบครัว 20-21-29',
    triples: [[20,21,29],[40,42,58]],
  },
  {
    name: 'ทศนิยม (×0.1)',
    triples: [[0.3,0.4,0.5],[0.5,1.2,1.3],[0.6,0.8,1.0],[0.8,1.5,1.7]],
  },
  {
    name: 'ทศนิยม (×0.5)',
    triples: [[1.5,2.0,2.5],[2.5,6.0,6.5],[4.0,7.5,8.5]],
  },
]

export const ALL_PYTHAGOREAN_TRIPLES: [number, number, number][] =
  PYTHAGOREAN_FAMILIES.flatMap(f => f.triples)
