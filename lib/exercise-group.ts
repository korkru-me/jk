export interface ExerciseGroupContext {
  min: number
  max: number
  rooms: Array<{ id: string; name: string; students: Array<{ id: string; name: string }> }>
}

export interface ExerciseGroupSelection {
  classroomId: string
  peers: string[]
}

export function exerciseGroupSelectionError(context: ExerciseGroupContext, selection: ExerciseGroupSelection): string | null {
  const room = context.rooms.find(item => item.id === selection.classroomId)
  const count = selection.peers.length + 1
  if (!room || selection.peers.some(id => !room.students.some(student => student.id === id))
    || new Set(selection.peers).size !== selection.peers.length) return 'กรุณาเลือกสมาชิกจากห้องเรียนเดียวกัน'
  if (count < context.min || count > context.max) return `กลุ่มต้องมีสมาชิก ${context.min}–${context.max} คน รวมผู้ส่ง`
  return null
}
export function exerciseGroupRangeError(min: number, max: number): string | null {
  return Number.isInteger(min) && Number.isInteger(max) && min >= 2 && max >= min && max <= 300
    ? null : 'จำนวนสมาชิกต้องเป็นจำนวนเต็มตั้งแต่ 2–300 คน และขั้นต่ำต้องไม่เกินจำนวนสูงสุด'
}
