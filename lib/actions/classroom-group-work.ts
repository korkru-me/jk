'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  GROUP_WORK_FILE_COUNT, groupWorkError, groupWorkHref, isGroupWorkId, type GroupWorkPageData,
} from '@/lib/classroom-group-work'

export async function readGroupWork(room: string, work?: string) {
  if (!isGroupWorkId(room) || (work && !isGroupWorkId(work))) return { notFound: true } as const
  const client = await createClient()
  const { data, error } = await client.rpc('classroom_group_work_page', { p_room: room, p_work: work ?? null })
  if (error?.code === '42501' || error?.code === 'P0002') return { notFound: true } as const
  if (error || !data) return { error: groupWorkError(error?.message) } as const
  return { data: data as GroupWorkPageData } as const
}

export async function createGroupWork(room: string, input: {
  title: string; instructions: string; mode: 'group' | 'solo'; min: number; max: number; score: number; dueAt: string | null
}) {
  if (!isGroupWorkId(room) || !input || typeof input.title !== 'string' || typeof input.instructions !== 'string'
    || !['solo', 'group'].includes(input.mode) || !Number.isInteger(input.min) || !Number.isInteger(input.max) || !Number.isFinite(input.score)) {
    return { error: groupWorkError('GROUP_WORK_INVALID') } as const
  }
  const client = await createClient()
  const { data, error } = await client.rpc('create_classroom_group_work', {
    p_room: room, p_title: input.title, p_instructions: input.instructions,
    p_mode: input.mode, p_min: input.min, p_max: input.max, p_score: input.score, p_due: input.dueAt,
  })
  if (error || !isGroupWorkId(data)) return { error: groupWorkError(error?.message) } as const
  revalidatePath(groupWorkHref(room))
  return { id: data } as const
}

export async function submitGroupWork(room: string, work: string, requestId: string, peers: string[], response: string, files: { path: string; name: string }[]) {
  if (!isGroupWorkId(room) || !isGroupWorkId(work) || !isGroupWorkId(requestId) || !Array.isArray(peers) || peers.some(id => !isGroupWorkId(id))
    || typeof response !== 'string' || response.length > 10000 || !Array.isArray(files) || files.length > GROUP_WORK_FILE_COUNT
    || files.some(file => !file || typeof file.path !== 'string' || typeof file.name !== 'string')) {
    return { error: groupWorkError('GROUP_WORK_INVALID') } as const
  }
  const client = await createClient()
  const { data, error } = await client.rpc('submit_classroom_group_work', {
    p_work: work, p_request_id: requestId, p_peers: peers, p_response: response, p_files: files,
  })
  if (error || !isGroupWorkId(data)) return { error: groupWorkError(error?.message), rosterChanged: error?.code === '23505' } as const
  revalidatePath(groupWorkHref(room))
  return { id: data } as const
}

export async function saveGroupWorkGrade(room: string, work: string, submission: string, score: number, feedback: string, publish: boolean, revision: number) {
  if (!isGroupWorkId(room) || !isGroupWorkId(work) || !isGroupWorkId(submission) || !Number.isFinite(score)
    || typeof feedback !== 'string' || typeof publish !== 'boolean' || !Number.isInteger(revision)) return { error: groupWorkError('GROUP_WORK_INVALID') } as const
  const client = await createClient()
  const { data, error } = await client.rpc('grade_classroom_group_work', {
    p_work: work, p_submission: submission, p_score: score, p_feedback: feedback, p_publish: publish, p_revision: revision,
  })
  if (error || !Number.isInteger(data)) return { error: groupWorkError(error?.message) } as const
  revalidatePath(groupWorkHref(room))
  return { revision: data as number } as const
}
