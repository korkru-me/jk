'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Variable } from '@/lib/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return createAdminClient()
}

// ─── Questions ───────────────────────────────────────────────
export async function adminDeleteQuestion(id: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('questions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/questions')
}

export async function approveQuestion(id: string) {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('questions')
    .update({ visibility: 'public', rejected_reason: null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pending')
  revalidatePath('/admin/questions')
}

export async function rejectQuestion(id: string, reason: string) {
  const admin = await requireAdmin()
  const { error } = await admin
    .from('questions')
    .update({ visibility: 'private', rejected_reason: reason || null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pending')
  revalidatePath('/admin/questions')
}

// ─── Users ───────────────────────────────────────────────────
export async function changeUserRole(userId: string, role: 'teacher' | 'student') {
  const admin = await requireAdmin()
  const { data: target } = await admin.from('users').select('role').eq('id', userId).single()
  if (target?.role === 'admin') return { error: 'ไม่สามารถเปลี่ยน role ของ Admin' }
  const { error } = await admin.from('users').update({ role }).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
}

export async function toggleSuspendUser(userId: string, suspend: boolean) {
  const admin = await requireAdmin()
  const { data: target } = await admin.from('users').select('role').eq('id', userId).single()
  if (target?.role === 'admin') return { error: 'ไม่สามารถระงับบัญชี Admin' }
  const { error } = await admin
    .from('users')
    .update({ status: suspend ? 'suspended' : 'active' })
    .eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
}

export async function adminDeleteUser(userId: string) {
  const admin = await requireAdmin()
  const { data: target } = await admin.from('users').select('role').eq('id', userId).single()
  if (target?.role === 'admin') return { error: 'ไม่สามารถลบบัญชี Admin' }
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
}

// ─── Formula Presets ─────────────────────────────────────────
export async function createPreset(data: {
  formula_name: string
  equation: string
  category_id: string
  variables: Variable[]
  target_variable: string
  description: string
}) {
  const admin = await requireAdmin()
  const { error } = await admin.from('formula_presets').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/admin/presets')
}

export async function updatePreset(id: string, data: {
  formula_name: string
  equation: string
  category_id: string
  variables: Variable[]
  target_variable: string
  description: string
}) {
  const admin = await requireAdmin()
  const { error } = await admin.from('formula_presets').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/presets')
}

export async function deletePreset(id: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('formula_presets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/presets')
}

// ─── Categories ──────────────────────────────────────────────
export async function createCategory(name: string, parentId: string, order: number) {
  const admin = await requireAdmin()
  const { error } = await admin.from('question_categories').insert({
    name,
    parent_id: parentId || null,
    order,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/categories')
}

export async function updateCategory(id: string, name: string) {
  const admin = await requireAdmin()
  const { error } = await admin.from('question_categories').update({ name }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categories')
}

export async function deleteCategory(id: string) {
  const admin = await requireAdmin()
  const { count } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
  if (count && count > 0) return { error: `มี ${count} โจทย์ในหมวดนี้ ไม่สามารถลบได้` }
  const { error } = await admin.from('question_categories').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categories')
}

export async function seedGradeCategories() {
  const admin = await requireAdmin()

  const gradeCategories: { name: string; order: number }[] = [
    // ม.2
    { name: 'การเคลื่อนที่', order: 10 },
    { name: 'แรงในชีวิตประจำวัน', order: 11 },
    { name: 'แรงดันในของไหล', order: 12 },
    { name: 'โมเมนต์ของแรง', order: 13 },
    { name: 'แรงในธรรมชาติ', order: 14 },
    { name: 'งานและกำลัง', order: 15 },
    { name: 'เครื่องกลอย่างง่าย', order: 16 },
    { name: 'พลังงานกล', order: 17 },
    // ม.3
    { name: 'ปริมาณทางไฟฟ้าและวงจรไฟฟ้า', order: 20 },
    { name: 'พลังงานไฟฟ้าและชิ้นส่วนอิเล็กทรอนิกส์', order: 21 },
    { name: 'คลื่นกล', order: 22 },
    { name: 'คลื่นแม่เหล็กไฟฟ้า', order: 23 },
    { name: 'การสะท้อนของแสง', order: 24 },
    { name: 'การหักเหของแสง', order: 25 },
    { name: 'การมองเห็นและทัศนอุปกรณ์', order: 26 },
    // ม.4
    { name: 'ธรรมชาติและพัฒนาการทางฟิสิกส์', order: 30 },
    { name: 'การเคลื่อนที่แนวตรง', order: 31 },
    { name: 'แรงและกฎการเคลื่อนที่', order: 32 },
    { name: 'สมดุลกล', order: 33 },
    { name: 'งานและพลังงาน', order: 34 },
    { name: 'โมเมนตัมและการชน', order: 35 },
    { name: 'การเคลื่อนที่แนวโค้ง', order: 36 },
    // ม.5
    { name: 'การเคลื่อนที่แบบฮาร์มอนิกอย่างง่าย', order: 40 },
    { name: 'คลื่น', order: 41 },
    { name: 'แสงเชิงคลื่น', order: 42 },
    { name: 'แสงเชิงรังสี', order: 43 },
    { name: 'เสียง', order: 44 },
    { name: 'ไฟฟ้าสถิต', order: 45 },
    { name: 'ไฟฟ้ากระแสตรง', order: 46 },
    // ม.6
    { name: 'แม่เหล็กและไฟฟ้า', order: 50 },
    { name: 'ไฟฟ้ากระแสสลับ', order: 51 },
    { name: 'ความร้อนและแก๊ส', order: 52 },
    { name: 'ของแข็งและของไหล', order: 53 },
    { name: 'ฟิสิกส์อะตอม', order: 54 },
    { name: 'ฟิสิกส์นิวเคลียร์และอนุภาค', order: 55 },
  ]

  const { data: existing } = await admin
    .from('question_categories')
    .select('name')
    .is('parent_id', null)

  const existingNames = new Set(existing?.map(c => c.name) ?? [])
  const toInsert = gradeCategories
    .filter(({ name }) => !existingNames.has(name))
    .map(({ name, order }) => ({ name, parent_id: null, order }))

  if (toInsert.length === 0) return { message: 'มีหมวดหมู่ครบแล้ว' }

  const { error } = await admin.from('question_categories').insert(toInsert)
  if (error) return { error: error.message }

  revalidatePath('/admin/categories')
  return { message: `เพิ่ม ${toInsert.length} หมวดหมู่เรียบร้อย` }
}

export async function reorderCategory(id: string, direction: 'up' | 'down') {
  const admin = await requireAdmin()
  const { data: cat } = await admin
    .from('question_categories')
    .select('order, parent_id')
    .eq('id', id)
    .single()
  if (!cat) return { error: 'ไม่พบหมวดหมู่' }

  let query = admin
    .from('question_categories')
    .select('id, order')

  if (cat.parent_id) {
    query = query.eq('parent_id', cat.parent_id) as typeof query
  } else {
    query = query.is('parent_id', null) as typeof query
  }

  if (direction === 'up') {
    query = (query as any).lt('order', cat.order).order('order', { ascending: false }).limit(1)
  } else {
    query = (query as any).gt('order', cat.order).order('order', { ascending: true }).limit(1)
  }

  const { data: sibling } = await (query as any).single()
  if (!sibling) return { error: 'ไม่สามารถย้ายได้' }

  await admin.from('question_categories').update({ order: sibling.order }).eq('id', id)
  await admin.from('question_categories').update({ order: cat.order }).eq('id', sibling.id)
  revalidatePath('/admin/categories')
}
