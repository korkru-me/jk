export interface DescriptiveStatistics {
  n: number
  mean: number | null
  sampleSd: number | null
}

export type StatisticalTestUnavailableReason =
  | 'insufficient_data'
  | 'zero_variance'
  | 'invalid_input'

export interface StatisticalTestResult {
  status: 'calculated'
  n: number
  df: number
  meanDifference: number
  differenceSd: number
  standardError: number
  confidenceLevel: number
  confidenceInterval: [number, number]
  t: number
  p: number
  effectSize: number
}

export interface StatisticalTestUnavailable {
  status: 'unavailable'
  reason: StatisticalTestUnavailableReason
  message: string
}

export type StatisticalTest = StatisticalTestResult | StatisticalTestUnavailable

export interface PairedScoreObservation {
  pretest: number
  posttest: number
}

export interface ResearchScoreSelectionRow {
  participantId: string
  pretest: number | null
  posttest: number | null
}

export interface ResearchAnalysisSelection {
  pairedObservations: PairedScoreObservation[]
  pairedParticipantIds: Set<string>
  criterionScores: number[]
  criterionParticipantIds: Set<string>
  incompletePairCount: number
}

export interface PairedAnalysis {
  pretest: DescriptiveStatistics
  posttest: DescriptiveStatistics
  meanDifference: number | null
  test: StatisticalTest
}

export interface CriterionAnalysis {
  posttest: DescriptiveStatistics
  criterionScore: number
  meanDifference: number | null
  test: StatisticalTest
}

const LANCZOS_COEFFICIENTS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  0.00000998436957802,
  0.00000015056327351493116,
] as const

const NUMERIC_EPSILON = 1e-12

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function sampleStandardDeviation(values: number[], average: number): number {
  const squaredDifferenceSum = values.reduce(
    (total, value) => total + (value - average) ** 2,
    0,
  )
  return Math.sqrt(squaredDifferenceSum / (values.length - 1))
}

export function descriptiveStatistics(values: number[]): DescriptiveStatistics {
  if (values.length === 0 || values.some(value => !Number.isFinite(value))) {
    return { n: values.length, mean: null, sampleSd: null }
  }

  const average = mean(values)
  return {
    n: values.length,
    mean: average,
    sampleSd: values.length >= 2 ? sampleStandardDeviation(values, average) : null,
  }
}

export function selectResearchAnalysisData(
  rows: ResearchScoreSelectionRow[],
): ResearchAnalysisSelection {
  const pairedRows = rows.filter(row => row.pretest !== null && row.posttest !== null)
  const criterionRows = rows.filter(row => row.posttest !== null)

  return {
    pairedObservations: pairedRows.map(row => ({
      pretest: row.pretest as number,
      posttest: row.posttest as number,
    })),
    pairedParticipantIds: new Set(pairedRows.map(row => row.participantId)),
    criterionScores: criterionRows.map(row => row.posttest as number),
    criterionParticipantIds: new Set(criterionRows.map(row => row.participantId)),
    incompletePairCount: rows.length - pairedRows.length,
  }
}

function logGamma(value: number): number {
  if (value < 0.5) {
    return Math.log(Math.PI)
      - Math.log(Math.sin(Math.PI * value))
      - logGamma(1 - value)
  }

  const shifted = value - 1
  let series = LANCZOS_COEFFICIENTS[0]
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index += 1) {
    series += LANCZOS_COEFFICIENTS[index] / (shifted + index)
  }
  const base = shifted + LANCZOS_COEFFICIENTS.length - 1.5
  return 0.5 * Math.log(2 * Math.PI)
    + (shifted + 0.5) * Math.log(base)
    - base
    + Math.log(series)
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200
  const convergenceTolerance = 3e-14
  const smallestValue = 1e-300
  const combined = a + b
  const aPlusOne = a + 1
  const aMinusOne = a - 1
  let c = 1
  let d = 1 - (combined * x) / aPlusOne
  if (Math.abs(d) < smallestValue) d = smallestValue
  d = 1 / d
  let result = d

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const evenIndex = iteration * 2
    let numerator = (iteration * (b - iteration) * x)
      / ((aMinusOne + evenIndex) * (a + evenIndex))
    d = 1 + numerator * d
    if (Math.abs(d) < smallestValue) d = smallestValue
    c = 1 + numerator / c
    if (Math.abs(c) < smallestValue) c = smallestValue
    d = 1 / d
    result *= d * c

    numerator = -((a + iteration) * (combined + iteration) * x)
      / ((a + evenIndex) * (aPlusOne + evenIndex))
    d = 1 + numerator * d
    if (Math.abs(d) < smallestValue) d = smallestValue
    c = 1 + numerator / c
    if (Math.abs(c) < smallestValue) c = smallestValue
    d = 1 / d
    const delta = d * c
    result *= delta
    if (Math.abs(delta - 1) < convergenceTolerance) return result
  }

  return result
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const logTerm = logGamma(a + b)
    - logGamma(a)
    - logGamma(b)
    + a * Math.log(x)
    + b * Math.log1p(-x)
  const term = Math.exp(logTerm)

  if (x < (a + 1) / (a + b + 2)) {
    return (term * betaContinuedFraction(a, b, x)) / a
  }
  return 1 - (term * betaContinuedFraction(b, a, 1 - x)) / b
}

/** Student's t cumulative probability. Exported so tests can verify table values. */
export function studentTCdf(t: number, degreesOfFreedom: number): number {
  if (!Number.isFinite(t) || !Number.isInteger(degreesOfFreedom) || degreesOfFreedom < 1) {
    return Number.NaN
  }
  if (t === 0) return 0.5

  const x = degreesOfFreedom / (degreesOfFreedom + t ** 2)
  const tailProbability = 0.5 * regularizedIncompleteBeta(
    x,
    degreesOfFreedom / 2,
    0.5,
  )
  return t > 0 ? 1 - tailProbability : tailProbability
}

export function studentTQuantile(probability: number, degreesOfFreedom: number): number {
  if (
    !Number.isFinite(probability)
    || probability <= 0
    || probability >= 1
    || !Number.isInteger(degreesOfFreedom)
    || degreesOfFreedom < 1
  ) {
    return Number.NaN
  }
  if (probability === 0.5) return 0
  if (probability < 0.5) return -studentTQuantile(1 - probability, degreesOfFreedom)

  let lower = 0
  let upper = 1
  while (studentTCdf(upper, degreesOfFreedom) < probability && upper < 1e12) {
    upper *= 2
  }
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const midpoint = (lower + upper) / 2
    if (studentTCdf(midpoint, degreesOfFreedom) < probability) lower = midpoint
    else upper = midpoint
  }
  return (lower + upper) / 2
}

function unavailable(
  reason: StatisticalTestUnavailableReason,
  message: string,
): StatisticalTestUnavailable {
  return { status: 'unavailable', reason, message }
}

function calculateDifferenceTest(
  differences: number[],
  significanceLevel: number,
): StatisticalTest {
  if (
    differences.some(value => !Number.isFinite(value))
    || !Number.isFinite(significanceLevel)
    || significanceLevel <= 0
    || significanceLevel >= 1
  ) {
    return unavailable('invalid_input', 'ข้อมูลคะแนนหรือระดับนัยสำคัญไม่ถูกต้อง')
  }
  if (differences.length < 2) {
    return unavailable(
      'insufficient_data',
      'ต้องมีข้อมูลอย่างน้อย 2 คนจึงจะคำนวณส่วนเบี่ยงเบนมาตรฐานและ t-test ได้',
    )
  }

  const differenceMean = mean(differences)
  const differenceSd = sampleStandardDeviation(differences, differenceMean)
  if (!Number.isFinite(differenceSd) || differenceSd <= NUMERIC_EPSILON) {
    return unavailable(
      'zero_variance',
      'คะแนนผลต่างของทุกคนเท่ากัน ทำให้ส่วนเบี่ยงเบนมาตรฐานเป็นศูนย์และคำนวณ t-test ไม่ได้',
    )
  }

  const n = differences.length
  const df = n - 1
  const standardError = differenceSd / Math.sqrt(n)
  const t = differenceMean / standardError
  const p = Math.max(0, Math.min(1, 2 * (1 - studentTCdf(Math.abs(t), df))))
  const criticalValue = studentTQuantile(1 - significanceLevel / 2, df)
  const marginOfError = criticalValue * standardError

  return {
    status: 'calculated',
    n,
    df,
    meanDifference: differenceMean,
    differenceSd,
    standardError,
    confidenceLevel: 1 - significanceLevel,
    confidenceInterval: [differenceMean - marginOfError, differenceMean + marginOfError],
    t,
    p,
    effectSize: differenceMean / differenceSd,
  }
}

export function calculatePairedAnalysis(
  observations: PairedScoreObservation[],
  significanceLevel = 0.05,
  measurementCompatible = true,
): PairedAnalysis {
  const valid = observations.every(observation => (
    Number.isFinite(observation.pretest) && Number.isFinite(observation.posttest)
  ))
  const pretestValues = valid ? observations.map(observation => observation.pretest) : []
  const posttestValues = valid ? observations.map(observation => observation.posttest) : []
  const differences = valid
    ? observations.map(observation => observation.posttest - observation.pretest)
    : [Number.NaN]

  return {
    pretest: descriptiveStatistics(pretestValues),
    posttest: descriptiveStatistics(posttestValues),
    meanDifference: valid && measurementCompatible && differences.length > 0 ? mean(differences) : null,
    test: measurementCompatible
      ? calculateDifferenceTest(differences, significanceLevel)
      : unavailable(
        'invalid_input',
        'คะแนนเต็มก่อนเรียนและหลังเรียนต้องกำหนดและเท่ากัน จึงจะเปรียบเทียบคะแนนดิบได้',
      ),
  }
}

export function calculateCriterionAnalysis(
  posttestScores: number[],
  criterionScore: number,
  significanceLevel = 0.05,
): CriterionAnalysis {
  const validCriterion = Number.isFinite(criterionScore) && criterionScore > 0
  const posttest = descriptiveStatistics(posttestScores)
  const differences = validCriterion
    ? posttestScores.map(score => score - criterionScore)
    : [Number.NaN]

  return {
    posttest,
    criterionScore,
    meanDifference: posttest.mean === null || !validCriterion
      ? null
      : posttest.mean - criterionScore,
    test: calculateDifferenceTest(differences, significanceLevel),
  }
}

export function formatStatisticalPValue(p: number): string {
  if (!Number.isFinite(p)) return 'ยังคำนวณไม่ได้'
  if (p < 0.001) return 'p < .001'
  const formatted = p.toFixed(3).replace(/^0/, '')
  return `p = ${formatted}`
}
