import { describe, expect, it } from 'vitest'
import { CLASSROOM_ICON_OPTIONS, classroomIconKey } from './classroom-icons'
import { composeDescription, coverImageOf, displayDescription, EMPTY_META, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'

describe('optional classroom icon metadata', () => {
  const legacy = 'เรียนรู้ร่วมกัน\nหน้าปก: blue · ระดับ: ม.4 · ภาคเรียน: 1/2569 · แท็ก: วิชา, เสริม · การเข้าร่วม: ต้องอนุมัติ · ที่นั่ง: 40 คน · เปิด: 2026-05-01 · ปิด: 2026-10-01'

  it('does not add metadata when an old room has no chosen icon', () => {
    const meta = parseDescription(legacy)
    expect(meta.iconKey).toBeUndefined()
    expect(classroomIconKey(meta.iconKey)).toBe('school')
    expect(composeDescription(meta)).toBe(legacy)
  })

  it.each(CLASSROOM_ICON_OPTIONS)('round-trips $key without altering the other room fields', option => {
    const meta = { ...parseDescription(legacy), iconKey: option.key }
    const raw = composeDescription(meta)
    const restored = parseDescription(raw)
    expect(classroomIconKey(restored.iconKey)).toBe(option.key)
    const { iconKey: _icon, ...rest } = restored
    expect(rest).toEqual(parseDescription(legacy))
    expect(raw).not.toContain('ไอคอน: school')
    expect(displayDescription(raw)).not.toContain('ไอคอน:')
    expect(displayDescription(raw)).not.toContain('หน้าปก:')
    expect(displayDescription(raw)).toContain('ระดับ: ม.4')
  })

  it('keeps plain legacy descriptions and old modal subjects intact', () => {
    const plain = 'วิชา: ฟิสิกส์\nเลือกกิจกรรมอย่างอิสระ'
    expect(parseDescription(plain).description).toBe(plain)
    expect(displayDescription(plain)).toBe(plain)
    expect(parseDescription(plain).iconKey).toBeUndefined()
  })

  it('does not infer an icon from subject, tags or room name', () => {
    const meta = { ...EMPTY_META, description: 'ฟิสิกส์', tags: ['ฟิสิกส์'], iconKey: 'art' as const }
    expect(parseDescription(composeDescription(meta)).iconKey).toBe('art')
    expect(parseDescription(composeDescription({ ...meta, iconKey: undefined })).iconKey).toBeUndefined()
  })

  it('drops unknown icon values safely and never prints presentation keys', () => {
    const raw = 'คำอธิบาย\nไอคอน: not-approved · การเข้าร่วม: เปิดรับอิสระ'
    expect(parseDescription(raw).iconKey).toBeUndefined()
    expect(classroomIconKey(parseDescription(raw).iconKey)).toBe('school')
    expect(displayDescription(raw)).toBe('คำอธิบาย\nการเข้าร่วม: เปิดรับอิสระ')
  })

  it('hides an icon-only metadata line even without a cover', () => {
    expect(displayDescription('คำอธิบาย\nไอคอน: physics')).toBe('คำอธิบาย')
    expect(displayDescription('ไอคอน: physics')).toBe('')
  })

  it('uses the default for empty descriptions', () => {
    for (const raw of [null, '']) {
      expect(classroomIconKey(parseDescription(raw).iconKey)).toBe('school')
      expect(displayDescription(raw)).toBe('')
    }
  })

  it('round-trips the optional cover image without showing its URL as classroom copy', () => {
    const coverImageUrl = 'https://school.supabase.co/storage/v1/object/public/question-images/teacher-1/classroom-cover_123_abcd.webp'
    const raw = composeDescription({ ...EMPTY_META, description: 'ห้องทดลอง', coverImageUrl })

    expect(parseDescription(raw).coverImageUrl).toBe(coverImageUrl)
    expect(displayDescription(raw)).toBe('ห้องทดลอง\nการเข้าร่วม: เปิดรับอิสระ')
  })

  it('does not expose an untrusted cover image for rendering', () => {
    expect(coverImageOf({ ...EMPTY_META, coverImageUrl: 'https://attacker.example/cover.webp' })).toBeNull()
  })
})
