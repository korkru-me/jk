import { describe, expect, it } from 'vitest'
import {
  calculateCriterionAnalysis,
  calculatePairedAnalysis,
  descriptiveStatistics,
  formatStatisticalPValue,
  selectResearchAnalysisData,
  studentTCdf,
  studentTQuantile,
} from '@/lib/education-research-statistics'

describe('education research statistics', () => {
  it('uses sample standard deviation', () => {
    expect(descriptiveStatistics([1, 2, 3, 4, 5])).toEqual({
      n: 5,
      mean: 3,
      sampleSd: Math.sqrt(2.5),
    })
  })

  it('keeps missing scores out without replacing them with zero', () => {
    const selection = selectResearchAnalysisData([
      { participantId: 'complete', pretest: 0, posttest: 10 },
      { participantId: 'missing-pre', pretest: null, posttest: 8 },
      { participantId: 'missing-post', pretest: 7, posttest: null },
    ])

    expect(selection.pairedObservations).toEqual([{ pretest: 0, posttest: 10 }])
    expect(selection.criterionScores).toEqual([10, 8])
    expect([...selection.pairedParticipantIds]).toEqual(['complete'])
    expect([...selection.criterionParticipantIds]).toEqual(['complete', 'missing-pre'])
    expect(selection.incompletePairCount).toBe(2)
  })

  it('matches published Student t critical values', () => {
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.706, 3)
    expect(studentTQuantile(0.975, 2)).toBeCloseTo(4.303, 3)
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.228, 3)
    expect(studentTCdf(2.228, 10)).toBeCloseTo(0.975, 3)
  })

  it('calculates a paired t-test from posttest minus pretest differences', () => {
    const analysis = calculatePairedAnalysis([
      { pretest: 10, posttest: 14 },
      { pretest: 12, posttest: 15 },
      { pretest: 9, posttest: 12 },
      { pretest: 11, posttest: 15 },
      { pretest: 13, posttest: 16 },
    ])

    expect(analysis.pretest.mean).toBe(11)
    expect(analysis.posttest.mean).toBe(14.4)
    expect(analysis.meanDifference).toBeCloseTo(3.4, 12)
    expect(analysis.test.status).toBe('calculated')
    if (analysis.test.status === 'calculated') {
      expect(analysis.test.df).toBe(4)
      expect(analysis.test.differenceSd).toBeCloseTo(0.5477225575, 9)
      expect(analysis.test.t).toBeCloseTo(13.88044188, 7)
      expect(analysis.test.p).toBeCloseTo(0.000156, 5)
      expect(analysis.test.confidenceInterval[0]).toBeCloseTo(2.7199, 3)
      expect(analysis.test.confidenceInterval[1]).toBeCloseTo(4.0801, 3)
      expect(analysis.test.effectSize).toBeCloseTo(6.2075, 4)
    }
  })

  it('matches the published NIST Dataplot paired t-test example', () => {
    // NIST Dataplot T TEST, Program 3 (Bowker and Lieberman paired sample):
    // https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/t_test.htm
    const posttest = [73, 43, 47, 53, 58, 47, 52, 38, 61, 56, 56, 34, 55, 65, 75]
    const pretest = [51, 41, 43, 41, 47, 32, 24, 43, 53, 52, 57, 44, 57, 40, 68]
    const analysis = calculatePairedAnalysis(posttest.map((score, index) => ({
      pretest: pretest[index],
      posttest: score,
    })))

    expect(analysis.pretest.mean).toBeCloseTo(46.2, 5)
    expect(analysis.posttest.mean).toBeCloseTo(54.2, 5)
    expect(analysis.test.status).toBe('calculated')
    if (analysis.test.status === 'calculated') {
      expect(analysis.test.n).toBe(15)
      expect(analysis.test.df).toBe(14)
      expect(analysis.test.meanDifference).toBeCloseTo(8, 5)
      expect(analysis.test.differenceSd).toBeCloseTo(11.02594, 5)
      expect(analysis.test.standardError).toBeCloseTo(2.84688, 4)
      expect(analysis.test.t).toBeCloseTo(2.81008, 4)
      expect(analysis.test.p).toBeCloseTo(0.01390, 5)
    }
  })

  it('calculates a two-sided one-sample t-test against the unrounded criterion', () => {
    const analysis = calculateCriterionAnalysis([18, 20, 19, 22, 21], 17.5)

    expect(analysis.posttest.mean).toBe(20)
    expect(analysis.meanDifference).toBe(2.5)
    expect(analysis.test.status).toBe('calculated')
    if (analysis.test.status === 'calculated') {
      expect(analysis.test.df).toBe(4)
      expect(analysis.test.t).toBeCloseTo(3.535533906, 8)
      expect(analysis.test.p).toBeCloseTo(0.02411, 4)
      expect(analysis.test.confidenceInterval[0]).toBeCloseTo(0.5368, 3)
      expect(analysis.test.confidenceInterval[1]).toBeCloseTo(4.4632, 3)
      expect(analysis.test.effectSize).toBeCloseTo(1.5811, 4)
    }
  })

  it('does not invent a test when there are too few observations', () => {
    expect(calculatePairedAnalysis([{ pretest: 10, posttest: 12 }]).test).toMatchObject({
      status: 'unavailable',
      reason: 'insufficient_data',
    })
  })

  it('does not display infinity when difference variance is zero', () => {
    expect(calculatePairedAnalysis([
      { pretest: 10, posttest: 12 },
      { pretest: 11, posttest: 13 },
    ]).test).toMatchObject({
      status: 'unavailable',
      reason: 'zero_variance',
    })
  })

  it('does not compare raw scores when the two measurements are incompatible', () => {
    expect(calculatePairedAnalysis([
      { pretest: 10, posttest: 20 },
      { pretest: 12, posttest: 22 },
    ], 0.05, false)).toMatchObject({
      meanDifference: null,
      test: { status: 'unavailable', reason: 'invalid_input' },
    })
  })

  it('formats p values without reporting p = .000', () => {
    expect(formatStatisticalPValue(0.0004)).toBe('p < .001')
    expect(formatStatisticalPValue(0.02411)).toBe('p = .024')
    expect(formatStatisticalPValue(Number.NaN)).toBe('ยังคำนวณไม่ได้')
  })
})
