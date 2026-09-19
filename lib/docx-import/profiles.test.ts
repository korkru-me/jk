import { describe, it, expect } from 'vitest'
import {
  AUTO_PROFILE, IMPORT_PROFILES, PROFILE_BY_TYPE, findProfile, sampleLineText,
} from './profiles'
import { TYPE_LABEL } from '@/lib/question-display'

/**
 * These are the guard behind the `AGENTS.md` rule that a question type is not
 * finished until the Word import can carry it. `PROFILE_BY_TYPE` being a
 * `Record<QuestionType, …>` already stops the build when a type is added; what
 * is checked here is everything a compiler cannot see — that the new profile
 * actually says something, that its slug matches the authoring route, and that
 * it appears on the chooser rather than existing only in the map.
 */
describe('import profiles', () => {
  it('covers every question type exactly once, and offers all but the ones ruled out', () => {
    const types = Object.keys(PROFILE_BY_TYPE)
    const offered = IMPORT_PROFILES.filter(profile => profile.type !== null).map(profile => profile.type)
    const ruledOut = Object.values(PROFILE_BY_TYPE)
      .filter(profile => profile.status === 'not-applicable')
      .map(profile => profile.type)

    expect(offered).toHaveLength(types.length - ruledOut.length)
    expect(new Set([...offered, ...ruledOut])).toEqual(new Set(types))
    // Ruled out is not the same as forgotten: the map still holds them.
    expect(ruledOut.length).toBeLessThan(types.length)
  })

  it('makes a type with no import say why, and keeps it off the chooser', () => {
    for (const profile of Object.values(PROFILE_BY_TYPE)) {
      if (profile.status !== 'not-applicable') continue
      expect(profile.notApplicableReason, profile.slug).toBeTruthy()
      expect(IMPORT_PROFILES, profile.slug).not.toContain(profile)
      // And no page of its own: nothing links there, so a 404 is the truth.
      expect(findProfile(profile.slug), profile.slug).toBeNull()
    }
  })

  it('keys each profile by the type it produces', () => {
    for (const [type, profile] of Object.entries(PROFILE_BY_TYPE)) {
      expect(profile.type).toBe(type)
    }
  })

  it('knows every type the rest of the app can label', () => {
    // TYPE_LABEL is what filters and cards read. A type present there but
    // missing here would be a โจทย์ the คลัง can show and the import cannot
    // even explain.
    expect(Object.keys(PROFILE_BY_TYPE).sort()).toEqual(Object.keys(TYPE_LABEL).sort())
  })

  it('gives every profile a unique slug, including the automatic reader', () => {
    const slugs = IMPORT_PROFILES.map(profile => profile.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs).toContain(AUTO_PROFILE.slug)
  })

  it('points each type at its own authoring page', () => {
    for (const profile of IMPORT_PROFILES) {
      if (!profile.type) continue
      expect(profile.createHref).toBe(`/questions/new/${profile.slug}`)
    }
  })

  it('finds a profile by slug and refuses one that does not exist', () => {
    expect(findProfile('mcq')?.type).toBe('mcq')
    expect(findProfile('auto')?.type).toBeNull()
    expect(findProfile('../secret')).toBeNull()
    expect(findProfile('')).toBeNull()
  })

  it('always has something to show a teacher', () => {
    // Only the profiles a teacher can actually open.
    for (const profile of IMPORT_PROFILES) {
      expect(profile.label.length).toBeGreaterThan(0)
      expect(profile.blurb.length).toBeGreaterThan(0)
      // A profile with no rules is a screen that asks for a file and explains
      // nothing — which is the state this whole feature exists to replace.
      expect(profile.rules.length).toBeGreaterThan(0)
      expect(profile.sample.some(line => line.kind === 'question')).toBe(true)
    }
  })

  it('names each profile twice: once for the card, once for a sentence', () => {
    for (const profile of IMPORT_PROFILES) {
      expect(profile.noun.length, profile.slug).toBeGreaterThan(0)
      // "นำเข้าโจทย์โจทย์ผสม" is what happens when one name is used for both.
      expect(profile.noun, profile.slug).not.toContain('โจทย์โจทย์')
      expect(`นำเข้า${profile.noun}`, profile.slug).not.toContain('โจทย์โจทย์')
    }
  })

  it('does not call the automatic reader a kind of โจทย์', () => {
    // It reads a file that holds several kinds; it is not one of them. Naming
    // it like a type is what made it read as โจทย์ผสม on the chooser.
    expect(AUTO_PROFILE.type).toBeNull()
    expect(AUTO_PROFILE.noun).not.toBe('โจทย์อ่านอัตโนมัติ')
    expect(AUTO_PROFILE.label).toContain('ไฟล์')
  })

  it('keeps โจทย์ผสม and the automatic reader plainly apart', () => {
    // One is many kinds inside a single ข้อ, the other many ข้อ inside a single
    // file. They were worded almost identically and teachers could not tell
    // which was which. โจทย์ผสม is no longer offered, but the wording stays
    // apart so that turning it back on cannot bring the confusion back.
    const composite = PROFILE_BY_TYPE.composite
    expect(composite.label).toContain('ข้อเดียว')
    expect(AUTO_PROFILE.label).toContain('ไฟล์เดียว')
    expect(composite.blurb).not.toEqual(AUTO_PROFILE.blurb)
  })

  it('numbers its rules from the document-splitting one', () => {
    // Word keeps question numbers outside the text, so this rule decides
    // whether a file can be read at all. It stays first everywhere.
    for (const profile of IMPORT_PROFILES) {
      expect(profile.rules[0].id).toBe('numbering')
    }
  })

  it('keeps rule ids unique within a profile so a warning points at one rule', () => {
    for (const profile of IMPORT_PROFILES) {
      const ids = profile.rules.map(rule => rule.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('writes sample lines with readable text', () => {
    for (const profile of IMPORT_PROFILES) {
      for (const line of profile.sample) {
        expect(sampleLineText(line).trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('marks an answer somewhere in the sample of every type the system grades', () => {
    // essay and file_upload are marked by the teacher, not the system, so they
    // have no key to show. Every other ready profile must demonstrate one, or
    // the example teaches a file that imports without an answer.
    const graded = IMPORT_PROFILES.filter(
      profile => profile.status === 'ready' && profile.type !== 'essay' && profile.type !== 'written',
    )
    for (const profile of graded) {
      // A เติมคำในรูป ข้อ keeps its เฉลย in the boxes standing on the picture
      // rather than in the line's own text, which is the whole shape of it.
      const marked = profile.sample.some(line =>
        [...line.spans, ...(line.right ?? []), ...(line.boxes ?? [])].some(span => span.answer))
      expect(marked, `${profile.slug} sample has no marked answer`).toBe(true)
    }
  })
})
