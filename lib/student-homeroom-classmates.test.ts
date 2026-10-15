import { expect, it } from 'vitest'
import { buildHomeroomClassmates, type HomeroomClassmateUser } from './student-homeroom-classmates'
const user = (id: string, name = id): HomeroomClassmateUser => ({ id, full_name: name, prefix: 'เด็กชาย', first_name: name, last_name: 'ตัวอย่าง' })
it('orders actual class numbers numerically; missing and invalid numbers stay last', () => {
  const rows = [user('ten'), user('two'), user('missing'), user('invalid')]
  const numbers = [{ student_id: 'ten', class_number: 10 }, { student_id: 'two', class_number: 2 }, { student_id: 'invalid', class_number: -1 }]
  const result = buildHomeroomClassmates(rows, numbers, 'self')
  expect(result.map(row => row.class_number)).toEqual([2, 10, null, null])
  expect(result[0].full_name).toBe('เด็กชายtwo ตัวอย่าง')
  expect(rows[0].id).toBe('ten')
})
it('excludes self, duplicates and outside profiles; sends only names and numbers to peers', () => {
  const peer = { ...user('peer'), email: 'private@example.invalid', food_allergy: 'private' }
  const result = buildHomeroomClassmates([user('self'), peer, peer], [{ student_id: 'outside', class_number: 1 }, { student_id: 'peer', class_number: 3 }], 'self')
  expect(result).toEqual([{ id: 'peer', full_name: 'เด็กชายpeer ตัวอย่าง', class_number: 3 }])
})
it('keeps legacy display names and adds a known prefix only once', () => {
  const rows = [{ ...user('legacy'), first_name: null, last_name: null, full_name: 'ชื่อเดิม สกุล' }, { ...user('prefixed'), first_name: null, last_name: null, full_name: 'เด็กชายชื่อเดิม สกุล' }]
  expect(buildHomeroomClassmates(rows, [], 'self').map(row => row.full_name)).toEqual(['เด็กชายชื่อเดิม สกุล', 'เด็กชายชื่อเดิม สกุล'])
})
it('sorts duplicates or missing numbers deterministically and handles an empty room', () => {
  const rows = [user('b','ข'), user('a','ก')]
  expect(buildHomeroomClassmates(rows, rows.map(r => ({ student_id: r.id, class_number: 2 })), 'self').map(r => r.id)).toEqual(['a','b'])
  expect(buildHomeroomClassmates([],[], 'self')).toEqual([])
})
