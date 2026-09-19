import { describe, it, expect } from 'vitest'
import { parseDocx } from './index'
import { AUTO_PROFILE, IMPORT_PROFILES, PROFILE_BY_TYPE, sampleLineText, type ImportProfile } from './profiles'
import { packSampleDocx, sampleFileName } from './sample-docx'

/**
 * The example file, read back by the app that hands it out.
 *
 * This is the whole reason the samples are generated instead of committed: a
 * teacher who downloads the example and uploads it unchanged must get the โจทย์
 * it shows. Anything that breaks that — a change to how โจทย์ are split, to how
 * a เฉลย is recognised, to the numbering the generator writes — fails here
 * rather than after a teacher has reformatted a file to match an example the
 * app can no longer read.
 */
async function parseSample(profile: ImportProfile) {
  const bytes = new Uint8Array(await packSampleDocx(profile))
  // Read the way the screen for that profile reads it.
  return parseDocx(bytes, { expect: profile.type })
}

const READY = IMPORT_PROFILES.filter(profile => profile.status === 'ready')

describe('generated sample worksheets', () => {
  it.each(READY.map(profile => [profile.slug, profile] as const))(
    'reads back every โจทย์ it shows: %s',
    async (_slug, profile) => {
      const parsed = await parseSample(profile)

      const expected = profile.sample.filter(line => line.kind === 'question')
      expect(parsed.questions).toHaveLength(expected.length)

      // The โจทย์ arrive in the document's order, carrying their own text.
      parsed.questions.forEach((question, index) => {
        expect(question.number).toBe(index + 1)
        expect(question.html).toContain(sampleLineText(expected[index]).slice(0, 20))
      })
    },
  )

  it.each(READY.map(profile => [profile.slug, profile] as const))(
    'keeps the headings out of the โจทย์: %s',
    async (_slug, profile) => {
      const parsed = await parseSample(profile)
      const headings = profile.sample.filter(line => line.kind === 'heading')

      // A worksheet's title belongs to the page, not to โจทย์ 1.
      for (const heading of headings) {
        const text = sampleLineText(heading)
        const insideAQuestion = parsed.questions.some(question => question.html.includes(text))
        expect(insideAQuestion, `"${text}" was folded into a โจทย์`).toBe(false)
      }
      if (headings.length > 0) {
        expect(parsed.preamble.join(' ')).toContain(sampleLineText(headings[0]))
      }
    },
  )

  it('reads the ปรนัย sample as ปรนัย, with the marked choice as the answer', async () => {
    const profile = PROFILE_BY_TYPE.mcq
    const parsed = await parseSample(profile)

    expect(parsed.questions).toHaveLength(2)

    for (const question of parsed.questions) {
      expect(question.type).toBe('mcq')
      expect(question.choices).toHaveLength(4)
      expect(question.choices.filter(choice => choice.isCorrect)).toHaveLength(1)
      // Nothing about this file should need a teacher's attention.
      expect(question.warnings.map(warning => warning.code)).not.toContain('no-correct-choice')
    }

    // The keys the sample marks in red, in order.
    const marked = profile.sample
      .filter(line => line.kind === 'choice' && line.spans.some(span => span.answer))
      .map(sampleLineText)
    const read = parsed.questions.map(question => question.choices.find(choice => choice.isCorrect)?.text)
    expect(read).toEqual(marked)
  })

  it('keeps the "1)" out of the ตัวเลือก text it stores', async () => {
    const parsed = await parseSample(PROFILE_BY_TYPE.mcq)
    for (const choice of parsed.questions.flatMap(question => question.choices)) {
      expect(choice.text).not.toMatch(/^\s*\d\s*[).]/)
    }
  })

  it('reads the เติมคำตอบตัวเลข sample with its ก) ข) sub-questions', async () => {
    const parsed = await parseSample(PROFILE_BY_TYPE.written)

    const withParts = parsed.questions.find(question => question.parts.length > 0)
    expect(withParts, 'no โจทย์ came back with sub-questions').toBeDefined()
    expect(withParts!.parts).toHaveLength(2)
    // Word draws these from the list definition the generator writes; if that
    // format is lost they come back as "1" and "2", or as separate โจทย์.
    expect(withParts!.parts.map(part => part.label)).toEqual(['ก', 'ข'])
  })

  it('reads the เฉลย back out of the เติมคำตอบตัวเลข sample', async () => {
    const parsed = await parseSample(PROFILE_BY_TYPE.written)

    // Every โจทย์ in that example is one the system can mark, which is the
    // whole claim the example makes.
    expect(parsed.questions.map(question => question.type)).toEqual(['written', 'written', 'written'])

    const withParts = parsed.questions[0]
    expect(withParts.parts.map(part => part.answers)).toEqual([
      [{ formula: '4', unit: 'm/s²' }],
      [{ formula: '16', unit: 'm/s' }],
    ])
    // Taken out of the โจทย์ as well as read off it.
    expect(withParts.parts.every(part => !part.html.includes('('))).toBe(true)

    expect(parsed.questions[1].answers).toEqual([{ formula: '14*pi', unit: '' }])
    expect(parsed.questions[2].answers).toEqual([
      { formula: '-2*pi/3', unit: '' },
      { formula: '225', unit: 'รอบ' },
    ])
  })

  it('reads the เฉลย in the mixed sample without disturbing its ปรนัย', async () => {
    const parsed = await parseSample(AUTO_PROFILE)

    expect(parsed.questions.map(question => question.type)).toEqual(['mcq', 'written', 'essay'])
    expect(parsed.questions[1].answers).toEqual([{ formula: '0.6', unit: 'A' }])
    expect(parsed.questions[0].choices.filter(choice => choice.isCorrect)).toHaveLength(1)
  })

  it('reads the บรรยาย sample as โจทย์ with no choices', async () => {
    const parsed = await parseSample(PROFILE_BY_TYPE.essay)
    for (const question of parsed.questions) {
      expect(question.choices).toHaveLength(0)
      expect(question.type).not.toBe('mcq')
    }
  })

  it('reads the ช่องว่าง back out of the เติมคำ sample', async () => {
    const parsed = await parseSample(PROFILE_BY_TYPE.fill_blank)

    expect(parsed.questions.every(question => question.type === 'fill_blank')).toBe(true)
    expect(parsed.questions.map(question => question.blanks.map(blank => blank.answer))).toEqual([
      ['นิวตัน'],
      // A row of dots is a gap the file left empty: a blank, with no answer.
      [''],
      ['100', '0'],
      ['เงิน', 'ทองแดง'],
    ])
    // The words are gone from the โจทย์ and numbered markers stand in their place.
    expect(parsed.questions[2].html).toContain('[___1]')
    expect(parsed.questions[2].html).toContain('[___2]')
    expect(parsed.questions[2].html).not.toContain('100')
    expect(parsed.questions[1].html).toContain('[___1]')
    expect(parsed.questions[1].html).not.toContain('..........')
  })

  it('names the file after the type, without characters a filesystem refuses', async () => {
    for (const profile of READY) {
      const name = sampleFileName(profile)
      expect(name.endsWith('.docx')).toBe(true)
      expect(name).not.toMatch(/[\\/:*?"<>|]/)
    }
  })
})
